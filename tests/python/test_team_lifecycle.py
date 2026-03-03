"""
Tests for Story 86-10: Phase-scoped team lifecycle + gate hooks.

Python port of the TypeScript team-lifecycle.ts module. Tests cover all 9
acceptance criteria for the phase-scoped team model where a lead agent
creates/manages a team within a workflow phase.

Acceptance Criteria:
- AC1: Lead agent creates team on phase entry when workflow has `execution: team`
- AC2: Lead spawns teammates per workflow YAML `teammates:` config
- AC3: `TaskCompleted` hook enforces gate checks before lead marks phase done
- AC4: `TeammateIdle` hook validates teammate work meets criteria
- AC5: Lead shuts down all teammates before starting exit protocol
- AC6: `TeamDelete` runs before `pf handoff` — team is fully cleaned up before marker
- AC7: Session file updated with teammate activity summary for audit
- AC8: Sidecar file locking for concurrent teammate writes
- AC9: Graceful degradation: if teammate crashes, lead continues solo with warning

Run with: python -m pytest tests/python/test_team_lifecycle.py -v
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.workflow.team_lifecycle import (  # noqa: E402
    _reset_for_testing,
    acquire_sidecar_lock,
    check_gate_on_task_completed,
    check_gate_on_teammate_idle,
    cleanup_team,
    create_team,
    generate_team_summary,
    get_active_team,
    release_sidecar_lock,
    shutdown_all_teammates,
    spawn_teammates,
    update_session_with_summary,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture(autouse=True)
def reset_state():
    """Reset in-memory registries before each test."""
    _reset_for_testing()
    yield
    _reset_for_testing()


@pytest.fixture()
def phase_with_team():
    """A workflow phase that has a team config block."""
    return {
        "name": "green",
        "agent": "dev",
        "team": {
            "teammates": [
                {"agent": "tea", "task": "Run tests continuously"},
                {"agent": "reviewer", "task": "Review changes as they land"},
            ],
            "model": "haiku",
        },
        "gate": {
            "file": "gates/tests-pass",
            "type": "tests_pass",
            "condition": "All tests passing",
        },
    }


@pytest.fixture()
def phase_without_team():
    """A workflow phase with no team config (solo mode)."""
    return {
        "name": "red",
        "agent": "tea",
        "gate": {
            "file": "gates/tests-fail",
            "type": "tests_fail",
            "condition": "Tests fail for right reason",
        },
    }


@pytest.fixture()
def phase_no_gate():
    """A workflow phase with team but no gate."""
    return {
        "name": "green",
        "agent": "dev",
        "team": {
            "teammates": [
                {"agent": "tea", "task": "Run tests"},
            ],
            "model": "haiku",
        },
    }


@pytest.fixture()
def team_config():
    """Workflow YAML team config block."""
    return {
        "teammates": [
            {"agent": "tea", "task": "Run tests continuously"},
            {"agent": "reviewer", "task": "Review changes as they land"},
        ],
        "model": "haiku",
    }


@pytest.fixture()
def story_id():
    return "86-10"


@pytest.fixture()
def mock_adapter():
    """Mock adapter for team operations (create, spawn, shutdown, delete)."""
    adapter = MagicMock()
    adapter.create_team = AsyncMock(return_value=None)
    adapter.spawn_teammate = AsyncMock(return_value=None)
    adapter.shutdown_teammate = AsyncMock(return_value=None)
    adapter.delete_team = AsyncMock(return_value=None)
    return adapter


@pytest.fixture()
def sample_handle(story_id):
    """A pre-created team handle for tests that skip the create step."""
    return {
        "teamName": f"{story_id}-green",
        "storyId": story_id,
        "phase": "green",
        "teammates": [
            {"agent": "tea", "task": "Run tests", "status": "active"},
            {"agent": "reviewer", "task": "Review changes", "status": "active"},
        ],
        "createdAt": "2026-02-17T10:00:00Z",
    }


@pytest.fixture()
def handle_with_crashed(story_id):
    """Handle where one teammate has crashed."""
    return {
        "teamName": f"{story_id}-green",
        "storyId": story_id,
        "phase": "green",
        "teammates": [
            {"agent": "tea", "task": "Run tests", "status": "active"},
            {"agent": "reviewer", "task": "Review changes", "status": "crashed"},
        ],
        "createdAt": "2026-02-17T10:00:00Z",
    }


@pytest.fixture()
def handle_all_shutdown(story_id):
    """Handle where all teammates are cleanly shut down."""
    return {
        "teamName": f"{story_id}-green",
        "storyId": story_id,
        "phase": "green",
        "teammates": [
            {"agent": "tea", "task": "Run tests", "status": "shutdown"},
            {"agent": "reviewer", "task": "Review changes", "status": "shutdown"},
        ],
        "createdAt": "2026-02-17T10:00:00Z",
    }


@pytest.fixture()
def tmp_session(tmp_path):
    """Create a temporary session directory with a session file."""
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    session_file = session_dir / "86-10-session.md"
    session_file.write_text(
        "# Story 86-10\n\n"
        "**Phase:** green\n"
        "**Workflow:** tdd\n\n"
        "## Context\n\nSome context here.\n"
    )
    return session_file


# =============================================================================
# AC1: Lead agent creates team on phase entry when workflow has execution: team
# =============================================================================


class TestCreateTeam:
    """AC1: Lead agent creates team on phase entry when workflow has team config."""

    @pytest.mark.asyncio
    async def test_creates_team_with_team_config(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Phase with team block should create and return a team handle."""
        result = await create_team(phase_with_team, story_id, mock_adapter)
        assert result.get("success") is True, f"create_team should succeed, got {result}"
        assert "data" in result, "Result should contain a 'data' key with the handle"

    @pytest.mark.asyncio
    async def test_handle_has_correct_team_name(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Team name should be '{story_id}-{phase_name}'."""
        result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = result.get("data", {})
        expected_name = f"{story_id}-green"
        assert handle.get("teamName") == expected_name, (
            f"Team name should be '{expected_name}', got '{handle.get('teamName')}'"
        )

    @pytest.mark.asyncio
    async def test_handle_has_story_id(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Handle should contain the story ID."""
        result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = result.get("data", {})
        assert handle.get("storyId") == story_id

    @pytest.mark.asyncio
    async def test_handle_has_phase_name(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Handle should contain the phase name."""
        result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = result.get("data", {})
        assert handle.get("phase") == "green"

    @pytest.mark.asyncio
    async def test_handle_has_empty_teammates_initially(
        self, phase_with_team, story_id, mock_adapter
    ):
        """New handle should have empty teammates list (spawn comes later)."""
        result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = result.get("data", {})
        assert handle.get("teammates") == [], (
            "New team should have empty teammates list"
        )

    @pytest.mark.asyncio
    async def test_handle_has_created_at_timestamp(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Handle should have an ISO timestamp for createdAt."""
        result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = result.get("data", {})
        assert "createdAt" in handle, "Handle should have createdAt timestamp"
        # Should be a valid ISO-ish string
        assert "T" in handle["createdAt"], "createdAt should look like ISO timestamp"

    @pytest.mark.asyncio
    async def test_noop_when_no_team_config(
        self, phase_without_team, story_id, mock_adapter
    ):
        """Phase without team block should return success with no handle (no-op)."""
        result = await create_team(phase_without_team, story_id, mock_adapter)
        assert result.get("success") is True, "No-op should still return success"
        assert "data" not in result or result["data"] is None, (
            "No-op should not return a team handle"
        )

    @pytest.mark.asyncio
    async def test_team_registered_in_active_teams(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Created team should be findable via get_active_team."""
        await create_team(phase_with_team, story_id, mock_adapter)
        active = get_active_team(story_id)
        assert active is not None, "Team should be registered after creation"
        assert active["storyId"] == story_id

    @pytest.mark.asyncio
    async def test_replaces_existing_team_for_same_story(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Creating a team for a story that already has one should replace it."""
        await create_team(phase_with_team, story_id, mock_adapter)
        # Create again (e.g., phase transition)
        result = await create_team(phase_with_team, story_id, mock_adapter)
        assert result.get("success") is True
        # adapter.delete_team should have been called for cleanup
        assert mock_adapter.delete_team.called, (
            "Should clean up existing team before creating new one"
        )

    @pytest.mark.asyncio
    async def test_calls_adapter_create_team(
        self, phase_with_team, story_id, mock_adapter
    ):
        """Should call adapter.create_team with the team name."""
        await create_team(phase_with_team, story_id, mock_adapter)
        mock_adapter.create_team.assert_called_once()
        call_kwargs = mock_adapter.create_team.call_args
        # Should pass teamName
        assert "teamName" in (call_kwargs.kwargs or call_kwargs[1] if len(call_kwargs) > 1 else {}) or (
            len(call_kwargs.args) > 0 and isinstance(call_kwargs.args[0], dict) and "teamName" in call_kwargs.args[0]
        ), "adapter.create_team should receive teamName"

    @pytest.mark.asyncio
    async def test_works_without_adapter(self, phase_with_team, story_id):
        """create_team should work without an adapter (no external calls)."""
        result = await create_team(phase_with_team, story_id, adapter=None)
        assert result.get("success") is True


# =============================================================================
# AC2: Lead spawns teammates per workflow YAML teammates: config
# =============================================================================


class TestSpawnTeammates:
    """AC2: Lead spawns teammates per workflow YAML teammates: config."""

    @pytest.mark.asyncio
    async def test_spawns_all_configured_teammates(
        self, phase_with_team, story_id, team_config, mock_adapter
    ):
        """Should create entries for each teammate in the config."""
        create_result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = create_result["data"]
        result = await spawn_teammates(handle, team_config, story_id, phase_with_team, mock_adapter)
        assert result.get("success") is True
        teammates = result.get("data", [])
        assert len(teammates) == 2, f"Should spawn 2 teammates, got {len(teammates)}"

    @pytest.mark.asyncio
    async def test_teammate_has_agent_field(
        self, phase_with_team, story_id, team_config, mock_adapter
    ):
        """Each spawned teammate should have an 'agent' field."""
        create_result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = create_result["data"]
        result = await spawn_teammates(handle, team_config, story_id, phase_with_team, mock_adapter)
        teammates = result.get("data", [])
        agents = [t.get("agent") for t in teammates]
        assert "tea" in agents, "Should have a 'tea' teammate"
        assert "reviewer" in agents, "Should have a 'reviewer' teammate"

    @pytest.mark.asyncio
    async def test_teammate_has_task_field(
        self, phase_with_team, story_id, team_config, mock_adapter
    ):
        """Each spawned teammate should have a 'task' field."""
        create_result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = create_result["data"]
        result = await spawn_teammates(handle, team_config, story_id, phase_with_team, mock_adapter)
        teammates = result.get("data", [])
        for tm in teammates:
            assert "task" in tm, f"Teammate {tm.get('agent')} missing 'task' field"
            assert tm["task"], "Task should not be empty"

    @pytest.mark.asyncio
    async def test_teammate_initial_status_is_spawned(
        self, phase_with_team, story_id, team_config, mock_adapter
    ):
        """Initial teammate status should be 'spawned'."""
        create_result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = create_result["data"]
        result = await spawn_teammates(handle, team_config, story_id, phase_with_team, mock_adapter)
        teammates = result.get("data", [])
        for tm in teammates:
            assert tm.get("status") == "spawned", (
                f"Teammate {tm.get('agent')} status should be 'spawned', got '{tm.get('status')}'"
            )

    @pytest.mark.asyncio
    async def test_teammates_added_to_handle(
        self, phase_with_team, story_id, team_config, mock_adapter
    ):
        """After spawning, handle.teammates should contain the spawned list."""
        create_result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = create_result["data"]
        await spawn_teammates(handle, team_config, story_id, phase_with_team, mock_adapter)
        assert len(handle.get("teammates", [])) == 2, (
            "Handle should be mutated to include spawned teammates"
        )

    @pytest.mark.asyncio
    async def test_calls_adapter_spawn_for_each(
        self, phase_with_team, story_id, team_config, mock_adapter
    ):
        """Should call adapter.spawn_teammate once per configured teammate."""
        create_result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = create_result["data"]
        await spawn_teammates(handle, team_config, story_id, phase_with_team, mock_adapter)
        assert mock_adapter.spawn_teammate.call_count == 2, (
            f"Should call spawn_teammate 2 times, called {mock_adapter.spawn_teammate.call_count}"
        )


# =============================================================================
# AC3: TaskCompleted hook enforces gate checks before lead marks phase done
# =============================================================================


class TestGateOnTaskCompleted:
    """AC3: TaskCompleted hook enforces gate checks before lead marks phase done."""

    def test_passes_when_no_gate_defined(self, sample_handle, phase_no_gate):
        """Phase with no gate should always pass."""
        result = check_gate_on_task_completed(sample_handle, phase_no_gate)
        assert result.get("passed") is True, "No gate should mean auto-pass"
        assert result.get("gate") == "none", "Gate type should be 'none'"

    def test_fails_when_teammates_still_active(
        self, sample_handle, phase_with_team
    ):
        """Gate should fail if any teammates are still active."""
        result = check_gate_on_task_completed(sample_handle, phase_with_team)
        assert result.get("passed") is False, "Should fail with active teammates"
        assert "reason" in result, "Failed gate should provide a reason"

    def test_passes_when_all_teammates_done(
        self, handle_all_shutdown, phase_with_team
    ):
        """Gate should pass when all teammates are shutdown."""
        result = check_gate_on_task_completed(handle_all_shutdown, phase_with_team)
        assert result.get("passed") is True, "Should pass with all teammates shutdown"

    def test_returns_gate_type(self, sample_handle, phase_with_team):
        """Result should include the gate type from the phase config."""
        result = check_gate_on_task_completed(sample_handle, phase_with_team)
        assert result.get("gate") == "tests_pass", (
            f"Gate type should be 'tests_pass', got '{result.get('gate')}'"
        )


# =============================================================================
# AC4: TeammateIdle hook validates teammate work meets criteria
# =============================================================================


class TestGateOnTeammateIdle:
    """AC4: TeammateIdle hook validates teammate work meets criteria."""

    def test_passes_when_no_gate_defined(self, sample_handle, phase_no_gate):
        """Phase with no gate should always pass for idle teammate."""
        teammate = {"agent": "tea", "task": "Run tests", "status": "active"}
        result = check_gate_on_teammate_idle(sample_handle, teammate, phase_no_gate)
        assert result.get("passed") is True
        assert result.get("gate") == "none"

    def test_fails_when_teammate_crashed(self, sample_handle, phase_with_team):
        """Should fail if the idle teammate has crashed status."""
        crashed_mate = {"agent": "tea", "task": "Run tests", "status": "crashed"}
        result = check_gate_on_teammate_idle(sample_handle, crashed_mate, phase_with_team)
        assert result.get("passed") is False, "Crashed teammate should fail gate"
        assert "reason" in result, "Failed gate should provide reason"

    def test_passes_for_healthy_idle_teammate(
        self, sample_handle, phase_with_team
    ):
        """Healthy idle teammate should pass gate check."""
        healthy_mate = {"agent": "tea", "task": "Run tests", "status": "active"}
        result = check_gate_on_teammate_idle(sample_handle, healthy_mate, phase_with_team)
        assert result.get("passed") is True, "Healthy teammate should pass"

    def test_returns_gate_type(self, sample_handle, phase_with_team):
        """Result should include the gate type."""
        teammate = {"agent": "tea", "task": "Run tests", "status": "active"}
        result = check_gate_on_teammate_idle(sample_handle, teammate, phase_with_team)
        assert result.get("gate") == "tests_pass"


# =============================================================================
# AC5: Lead shuts down all teammates before starting exit protocol
# =============================================================================


class TestShutdownAllTeammates:
    """AC5: Lead shuts down all teammates before starting exit protocol."""

    @pytest.mark.asyncio
    async def test_marks_active_teammates_as_shutdown(
        self, sample_handle, mock_adapter
    ):
        """All active teammates should be marked as 'shutdown'."""
        await shutdown_all_teammates(sample_handle, mock_adapter)
        for tm in sample_handle["teammates"]:
            if tm["agent"] in ("tea", "reviewer"):
                assert tm["status"] == "shutdown", (
                    f"Teammate {tm['agent']} should be shutdown, got {tm['status']}"
                )

    @pytest.mark.asyncio
    async def test_skips_already_shutdown_teammates(self, mock_adapter, story_id):
        """Teammates already shutdown should not be touched."""
        handle = {
            "teamName": f"{story_id}-green",
            "storyId": story_id,
            "phase": "green",
            "teammates": [
                {"agent": "tea", "task": "Run tests", "status": "shutdown"},
                {"agent": "reviewer", "task": "Review", "status": "active"},
            ],
            "createdAt": "2026-02-17T10:00:00Z",
        }
        result = await shutdown_all_teammates(handle, mock_adapter)
        # Only reviewer should have been shut down (tea was already shutdown)
        assert result.get("data", {}).get("shutdownCount") == 1, (
            "Should only shut down 1 teammate (the active one)"
        )

    @pytest.mark.asyncio
    async def test_skips_crashed_teammates(self, handle_with_crashed, mock_adapter):
        """Crashed teammates should be skipped (already gone)."""
        result = await shutdown_all_teammates(handle_with_crashed, mock_adapter)
        count = result.get("data", {}).get("shutdownCount", 0)
        assert count == 1, f"Should shut down 1 (skip crashed), got {count}"

    @pytest.mark.asyncio
    async def test_returns_shutdown_count(self, sample_handle, mock_adapter):
        """Should return how many teammates were actually shut down."""
        result = await shutdown_all_teammates(sample_handle, mock_adapter)
        assert result.get("success") is True
        assert result.get("data", {}).get("shutdownCount") == 2

    @pytest.mark.asyncio
    async def test_calls_adapter_shutdown_for_active(
        self, sample_handle, mock_adapter
    ):
        """Should call adapter.shutdown_teammate for each active teammate."""
        await shutdown_all_teammates(sample_handle, mock_adapter)
        assert mock_adapter.shutdown_teammate.call_count == 2


# =============================================================================
# AC6: TeamDelete runs before pf handoff — fully cleaned up before marker
# =============================================================================


class TestCleanupTeam:
    """AC6: TeamDelete runs before pf handoff — team is fully cleaned up."""

    @pytest.mark.asyncio
    async def test_removes_from_active_teams(
        self, phase_with_team, story_id, mock_adapter
    ):
        """After cleanup, get_active_team should return None."""
        await create_team(phase_with_team, story_id, mock_adapter)
        handle = get_active_team(story_id)
        assert handle is not None, "Team should exist before cleanup"

        await cleanup_team(handle, mock_adapter)
        assert get_active_team(story_id) is None, (
            "Team should be gone after cleanup"
        )

    @pytest.mark.asyncio
    async def test_calls_adapter_delete_team(
        self, sample_handle, mock_adapter
    ):
        """Should call adapter.delete_team with the team name."""
        await cleanup_team(sample_handle, mock_adapter)
        mock_adapter.delete_team.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_success_with_cleaned_flag(
        self, sample_handle, mock_adapter
    ):
        """Should return {success: True, data: {cleaned: True}}."""
        result = await cleanup_team(sample_handle, mock_adapter)
        assert result.get("success") is True
        assert result.get("data", {}).get("cleaned") is True

    @pytest.mark.asyncio
    async def test_works_without_adapter(self, sample_handle):
        """Cleanup should work without adapter (no external calls)."""
        result = await cleanup_team(sample_handle, adapter=None)
        assert result.get("success") is True


# =============================================================================
# AC7: Session file updated with teammate activity summary for audit
# =============================================================================


class TestTeamSummary:
    """AC7: Session file updated with teammate activity summary for audit."""

    def test_summary_includes_team_name(self, sample_handle):
        """Summary should include the team name."""
        summary = generate_team_summary(sample_handle)
        assert summary.get("teamName") == sample_handle["teamName"]

    def test_summary_includes_story_id(self, sample_handle):
        """Summary should include the story ID."""
        summary = generate_team_summary(sample_handle)
        assert summary.get("storyId") == sample_handle["storyId"]

    def test_summary_includes_phase(self, sample_handle):
        """Summary should include the phase name."""
        summary = generate_team_summary(sample_handle)
        assert summary.get("phase") == "green"

    def test_summary_includes_member_list(self, sample_handle):
        """Summary should list all team members with agent, status, task."""
        summary = generate_team_summary(sample_handle)
        members = summary.get("members", [])
        assert len(members) == 2, f"Should have 2 members, got {len(members)}"
        for member in members:
            assert "agent" in member, "Member should have 'agent'"
            assert "status" in member, "Member should have 'status'"
            assert "task" in member, "Member should have 'task'"

    def test_clean_shutdown_true_when_all_shutdown(self, handle_all_shutdown):
        """cleanShutdown should be True when all teammates shutdown cleanly."""
        summary = generate_team_summary(handle_all_shutdown)
        assert summary.get("cleanShutdown") is True

    def test_clean_shutdown_false_when_crashed(self, handle_with_crashed):
        """cleanShutdown should be False when any teammate crashed."""
        summary = generate_team_summary(handle_with_crashed)
        assert summary.get("cleanShutdown") is False

    def test_update_session_writes_summary_section(self, tmp_session, sample_handle):
        """update_session_with_summary should write to session file."""
        summary = {
            "teamName": "86-10-green",
            "storyId": "86-10",
            "phase": "green",
            "members": [
                {"agent": "tea", "status": "shutdown", "task": "Run tests"},
            ],
            "cleanShutdown": True,
        }
        result = update_session_with_summary(tmp_session, summary)
        assert result.get("success") is True

        content = tmp_session.read_text()
        assert "Team Activity Summary" in content, (
            "Session file should contain 'Team Activity Summary' section"
        )

    def test_update_session_includes_member_names(self, tmp_session, sample_handle):
        """Written summary should list teammate agent names."""
        summary = {
            "teamName": "86-10-green",
            "storyId": "86-10",
            "phase": "green",
            "members": [
                {"agent": "tea", "status": "shutdown", "task": "Run tests"},
                {"agent": "reviewer", "status": "shutdown", "task": "Review"},
            ],
            "cleanShutdown": True,
        }
        update_session_with_summary(tmp_session, summary)
        content = tmp_session.read_text()
        assert "tea" in content, "Session should mention 'tea' teammate"
        assert "reviewer" in content, "Session should mention 'reviewer' teammate"


# =============================================================================
# AC8: Sidecar file locking for concurrent teammate writes
# =============================================================================


class TestSidecarLocking:
    """AC8: Sidecar file locking for concurrent teammate writes."""

    def test_acquire_lock_succeeds_first_time(self):
        """First lock acquisition should succeed."""
        result = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        assert result.get("success") is True, "First lock should succeed"
        assert "data" in result, "Should return lock data"

    def test_lock_data_has_lock_path(self):
        """Lock data should include the lock file path."""
        result = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        lock = result.get("data", {})
        assert "lockPath" in lock, "Lock should have lockPath"
        assert lock["lockPath"] == "/path/to/sidecar.md.lock"

    def test_lock_data_has_story_id(self):
        """Lock data should include the story ID."""
        result = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        lock = result.get("data", {})
        assert lock.get("storyId") == "86-10"

    def test_lock_data_has_acquired_at(self):
        """Lock data should include an acquiredAt timestamp."""
        result = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        lock = result.get("data", {})
        assert "acquiredAt" in lock, "Lock should have acquiredAt"

    def test_reacquire_same_story_returns_existing(self):
        """Re-acquiring lock for same story should return the existing lock."""
        first = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        second = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        assert second.get("success") is True, "Same story re-acquire should succeed"
        assert first["data"]["lockPath"] == second["data"]["lockPath"]

    def test_different_story_fails_when_locked(self):
        """A different story trying to lock the same file should fail."""
        acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        result = acquire_sidecar_lock("/path/to/sidecar.md", "99-1")
        assert result.get("success") is False, "Different story should fail"
        assert "error" in result, "Should include error message"

    def test_release_lock_succeeds(self):
        """Releasing an acquired lock should succeed."""
        acquire_result = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        lock = acquire_result["data"]
        result = release_sidecar_lock(lock)
        assert result.get("success") is True

    def test_acquire_after_release(self):
        """After releasing, a different story should be able to acquire."""
        first = acquire_sidecar_lock("/path/to/sidecar.md", "86-10")
        release_sidecar_lock(first["data"])
        second = acquire_sidecar_lock("/path/to/sidecar.md", "99-1")
        assert second.get("success") is True, (
            "Should be able to acquire after release"
        )

    def test_multiple_files_independent_locks(self):
        """Locks on different files should be independent."""
        lock_a = acquire_sidecar_lock("/path/a.md", "86-10")
        lock_b = acquire_sidecar_lock("/path/b.md", "99-1")
        assert lock_a.get("success") is True
        assert lock_b.get("success") is True


# =============================================================================
# AC9: Graceful degradation — teammate crash doesn't break lead
# =============================================================================


class TestGracefulDegradation:
    """AC9: Graceful degradation: if teammate crashes, lead continues solo."""

    @pytest.mark.asyncio
    async def test_spawn_marks_failed_as_crashed(
        self, phase_with_team, story_id, team_config, mock_adapter
    ):
        """If adapter.spawn_teammate raises, teammate status should be 'crashed'."""
        # First spawn succeeds, second fails
        mock_adapter.spawn_teammate = AsyncMock(
            side_effect=[None, Exception("Connection refused")]
        )
        create_result = await create_team(phase_with_team, story_id, mock_adapter)
        handle = create_result["data"]
        result = await spawn_teammates(handle, team_config, story_id, phase_with_team, mock_adapter)

        assert result.get("success") is True, (
            "spawn_teammates should still succeed even with a crash"
        )
        teammates = result.get("data", [])
        statuses = [t.get("status") for t in teammates]
        assert "crashed" in statuses, "Failed spawn should be marked 'crashed'"
        assert "spawned" in statuses, "Successful spawn should be 'spawned'"

    @pytest.mark.asyncio
    async def test_shutdown_skips_crashed(self, handle_with_crashed, mock_adapter):
        """Shutdown should skip crashed teammates gracefully."""
        result = await shutdown_all_teammates(handle_with_crashed, mock_adapter)
        assert result.get("success") is True
        # Only the active teammate should have been shut down
        assert result.get("data", {}).get("shutdownCount") == 1

    def test_summary_reports_crashed_status(self, handle_with_crashed):
        """Team summary should honestly report crashed teammate status."""
        summary = generate_team_summary(handle_with_crashed)
        members = summary.get("members", [])
        crashed = [m for m in members if m.get("status") == "crashed"]
        assert len(crashed) == 1, "Should report 1 crashed member"
        assert crashed[0]["agent"] == "reviewer"

    @pytest.mark.asyncio
    async def test_cleanup_works_with_crashed_teammates(
        self, phase_with_team, story_id, mock_adapter
    ):
        """cleanup_team should work even when teammates are crashed."""
        await create_team(phase_with_team, story_id, mock_adapter)
        handle = get_active_team(story_id)
        # Manually set a crashed teammate
        handle["teammates"] = [
            {"agent": "tea", "task": "Run tests", "status": "crashed"},
        ]
        result = await cleanup_team(handle, mock_adapter)
        assert result.get("success") is True
        assert get_active_team(story_id) is None

    @pytest.mark.asyncio
    async def test_adapter_shutdown_failure_doesnt_break(
        self, sample_handle, mock_adapter
    ):
        """If adapter.shutdown_teammate raises, should continue with others."""
        mock_adapter.shutdown_teammate = AsyncMock(
            side_effect=[Exception("timeout"), None]
        )
        result = await shutdown_all_teammates(sample_handle, mock_adapter)
        assert result.get("success") is True, (
            "Should succeed even if some shutdowns fail"
        )


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_get_active_team_returns_none_for_unknown(self):
        """get_active_team should return None for a story with no team."""
        result = get_active_team("nonexistent-99")
        assert result is None

    @pytest.mark.asyncio
    async def test_create_team_with_adapter_failure(
        self, phase_with_team, story_id
    ):
        """If adapter.create_team raises, should return error result."""
        bad_adapter = MagicMock()
        bad_adapter.create_team = AsyncMock(side_effect=Exception("API error"))
        bad_adapter.delete_team = AsyncMock(return_value=None)
        result = await create_team(phase_with_team, story_id, bad_adapter)
        assert result.get("success") is False, "Should fail on adapter error"
        assert "error" in result

    def test_empty_teammates_list_summary(self, story_id):
        """Summary for handle with no teammates should work."""
        handle = {
            "teamName": f"{story_id}-green",
            "storyId": story_id,
            "phase": "green",
            "teammates": [],
            "createdAt": "2026-02-17T10:00:00Z",
        }
        summary = generate_team_summary(handle)
        assert summary.get("members") == []
        assert summary.get("cleanShutdown") is True, (
            "Empty team vacuously has clean shutdown"
        )

    def test_reset_clears_active_teams(self, story_id):
        """_reset_for_testing should clear all registries."""
        # Manually seed the registry to verify it gets cleared
        from pf.workflow.team_lifecycle import _active_teams
        _active_teams[story_id] = {"teamName": "test", "storyId": story_id}
        _reset_for_testing()
        assert get_active_team(story_id) is None, "Reset should clear active teams"

    def test_reset_clears_sidecar_locks(self):
        """_reset_for_testing should clear sidecar locks."""
        acquire_sidecar_lock("/test/path.md", "86-10")
        _reset_for_testing()
        # After reset, different story should be able to acquire
        result = acquire_sidecar_lock("/test/path.md", "99-1")
        assert result.get("success") is True, (
            "Reset should clear locks so any story can acquire"
        )
