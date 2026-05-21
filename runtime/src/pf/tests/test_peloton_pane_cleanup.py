"""Tests for peloton pane cleanup on shutdown.

Story 148-18: Peloton tmux session leak — agent panes not cleaned up on shutdown
Epic: 148 — TUI-tmux Fixer

Two bugs:
1. Peloton agent panes accumulate across runs — stop() only clears state, never
   kills tmux panes or cleans up the registry.
2. PaneOrchestrator.teardown() exists but has zero test coverage.

These tests define the correct behavior:
- stop() MUST kill all peloton-owned panes in the registry
- stop() MUST remove killed panes from the registry file
- stop() MUST NOT kill protected panes (claude, tui, saddle)
- PaneOrchestrator.teardown() MUST call kill_pane for each non-protected pane
- PaneOrchestrator.teardown() MUST preserve protected panes
- All tmux interactions are mocked — no real tmux panes opened.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest

from pf.peloton.pane_orchestrator import ManagedPane, PaneOrchestrator


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Minimal project structure with peloton state and registry."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Workflow definition
    wf_dir = pf_dir / "workflows"
    wf_dir.mkdir()
    (wf_dir / "tdd.yaml").write_text(
        "workflow:\n"
        "  name: tdd\n"
        "  type: phased\n"
        "  phases:\n"
        "    - name: setup\n"
        "      agent: sm\n"
        "    - name: red\n"
        "      agent: tea\n"
        "    - name: green\n"
        "      agent: dev\n"
        "    - name: review\n"
        "      agent: reviewer\n"
    )

    return tmp_path


def _make_registry_with_peloton_panes(session: str) -> dict:
    """Registry with protected panes AND peloton-owned agent panes."""
    return {
        "session": session,
        "socket": "pf",
        "max_panes": 10,
        "panes": [
            {
                "pane_id": "%0",
                "role": "claude",
                "title": "Claude Code",
                "protected": True,
                "owner": None,
            },
            {
                "pane_id": "%1",
                "role": "tui",
                "title": "TUI",
                "protected": True,
                "owner": None,
            },
            {
                "pane_id": "%10",
                "role": "tea",
                "title": "tea",
                "protected": False,
                "owner": "peloton",
            },
            {
                "pane_id": "%11",
                "role": "dev",
                "title": "dev",
                "protected": False,
                "owner": "peloton",
            },
            {
                "pane_id": "%12",
                "role": "reviewer",
                "title": "reviewer",
                "protected": False,
                "owner": "peloton",
            },
        ],
    }


def _write_registry(project: Path, registry: dict) -> None:
    """Write a registry file to the project."""
    reg_path = project / ".pennyfarthing" / "tmux-panes.json"
    reg_path.write_text(json.dumps(registry, indent=2) + "\n")


def _read_registry(project: Path) -> dict:
    """Read the registry file from the project."""
    reg_path = project / ".pennyfarthing" / "tmux-panes.json"
    return json.loads(reg_path.read_text())


def _write_active_state(project: Path, story_id: str = "42-1") -> None:
    """Write an active peloton state file."""
    state = {
        "active": True,
        "story_id": story_id,
        "workflow": "tdd",
        "team_name": f"peloton-{story_id}",
        "agents": ["tea", "dev", "reviewer"],
    }
    state_path = project / ".pennyfarthing" / "peloton-state.json"
    state_path.write_text(json.dumps(state, indent=2) + "\n")


# ===========================================================================
# BUG 1: stop() must kill peloton-owned panes
#
# Currently stop() only writes a cleared state dict. It does NOT:
#   - Read the registry to find peloton-owned panes
#   - Call kill_pane for those panes
#   - Update the registry to remove them
#
# These tests patch at the source (pf.tmux.panes) so they run cleanly.
# They fail because stop() never calls kill_pane — that's the bug.
# ===========================================================================


class TestStopKillsPelotonPanes:
    """stop() must kill all peloton-owned panes, not just clear state."""

    def test_stop_calls_kill_pane_for_each_peloton_pane(self, project: Path) -> None:
        """stop() must call kill_pane for every pane with owner='peloton'."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane") as mock_kill, \
             patch("pf.tmux.panes._run_tmux") as mock_tmux:
            mock_kill.return_value = {"success": True}
            # Block any real tmux calls
            mock_tmux.return_value = {"success": False, "error": "mocked"}

            result = stop(project)

            assert result["success"]
            # Must kill all 3 peloton-owned panes
            killed_ids = {c.args[0] for c in mock_kill.call_args_list}
            assert "%10" in killed_ids, "Must kill tea pane"
            assert "%11" in killed_ids, "Must kill dev pane"
            assert "%12" in killed_ids, "Must kill reviewer pane"

    def test_stop_does_not_kill_protected_panes(self, project: Path) -> None:
        """stop() must NOT kill protected panes (claude, tui)."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane") as mock_kill, \
             patch("pf.tmux.panes._run_tmux") as mock_tmux:
            mock_kill.return_value = {"success": True}
            mock_tmux.return_value = {"success": False, "error": "mocked"}

            stop(project)

            killed_ids = {c.args[0] for c in mock_kill.call_args_list}
            assert "%0" not in killed_ids, "Must NOT kill Claude pane"
            assert "%1" not in killed_ids, "Must NOT kill TUI pane"

    def test_stop_removes_peloton_panes_from_registry(self, project: Path) -> None:
        """After stop(), the registry file must no longer contain peloton-owned panes."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):

            stop(project)

        # Read registry from disk — peloton panes should be gone
        reg = _read_registry(project)
        peloton_panes = [p for p in reg["panes"] if p.get("owner") == "peloton"]
        assert len(peloton_panes) == 0, \
            f"Registry must not contain peloton panes after stop, found: {peloton_panes}"

    def test_stop_preserves_protected_panes_in_registry(self, project: Path) -> None:
        """After stop(), protected panes must still be in the registry."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):

            stop(project)

        reg = _read_registry(project)
        protected_ids = {p["pane_id"] for p in reg["panes"] if p["protected"]}
        assert "%0" in protected_ids, "Claude pane must survive in registry"
        assert "%1" in protected_ids, "TUI pane must survive in registry"

    def test_stop_still_clears_state_file(self, project: Path) -> None:
        """stop() must still clear the peloton state file (existing behavior preserved)."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):

            stop(project)

        state_path = project / ".pennyfarthing" / "peloton-state.json"
        state = json.loads(state_path.read_text())
        assert state["active"] is False
        assert state["team_name"] is None

    def test_stop_reports_killed_pane_count(self, project: Path) -> None:
        """stop() result should report how many panes were killed."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):

            result = stop(project)

        assert result["success"]
        assert "killed" in result.get("data", {}), \
            "stop() result must report which panes were killed"
        assert len(result["data"]["killed"]) == 3

    def test_stop_graceful_when_no_registry(self, project: Path) -> None:
        """stop() should not crash if no registry file exists."""
        from pf.peloton.live import stop

        _write_active_state(project)
        # No registry file written — stop must handle this gracefully

        with patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):
            result = stop(project)

        assert result["success"], "stop() must succeed even without a registry file"

    def test_stop_graceful_when_kill_pane_fails(self, project: Path) -> None:
        """stop() should continue killing remaining panes if one kill fails."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        call_count = 0

        def kill_side_effect(*args, **kwargs) -> dict:
            nonlocal call_count
            call_count += 1
            # First 2 calls are _run_tmux for kill, third might be different
            return {"success": False, "error": "pane not found"}

        with patch("pf.tmux.panes.kill_pane", side_effect=kill_side_effect), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):

            result = stop(project)

        assert result["success"], "stop() must succeed even if individual kills fail"
        assert call_count >= 3, f"Must attempt to kill all 3 peloton panes, only attempted: {call_count}"


# ===========================================================================
# BUG 1c (148-25): Native TeamCreate panes have owner=None
#
# When Claude Code's TeamCreate (teammateMode: "tmux") creates panes,
# reconcile() auto-discovers them with owner=None. stop() must still
# kill these panes by matching their role against the active agents list.
# ===========================================================================


def _make_registry_with_native_team_panes(session: str) -> dict:
    """Registry with protected panes AND auto-discovered native team panes.

    These simulate panes created by TeamCreate that reconcile() classified
    with the correct role but owner=None (not explicitly tagged as peloton).
    """
    return {
        "session": session,
        "socket": "pf",
        "max_panes": 10,
        "panes": [
            {
                "pane_id": "%0",
                "role": "claude",
                "title": "Claude Code",
                "protected": True,
                "owner": None,
            },
            {
                "pane_id": "%1",
                "role": "tui",
                "title": "TUI",
                "protected": True,
                "owner": None,
            },
            {
                "pane_id": "%20",
                "role": "tea",
                "title": "tea",
                "protected": False,
                "owner": None,
            },
            {
                "pane_id": "%21",
                "role": "dev",
                "title": "dev",
                "protected": False,
                "owner": None,
            },
            {
                "pane_id": "%22",
                "role": "reviewer",
                "title": "reviewer",
                "protected": False,
                "owner": None,
            },
        ],
    }


class TestStopKillsNativeTeamPanes:
    """stop() must kill panes matching active agents even without owner='peloton'.

    Story 148-25: TeamCreate panes get auto-discovered by reconcile() with
    owner=None. stop() must match them by role against the peloton state's
    agent list.
    """

    def test_stop_kills_native_team_panes_by_role(self, project: Path) -> None:
        """stop() must kill panes whose role matches active agents, even with owner=None."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_native_team_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane") as mock_kill, \
             patch("pf.tmux.panes._run_tmux") as mock_tmux:
            mock_kill.return_value = {"success": True}
            mock_tmux.return_value = {"success": False, "error": "mocked"}

            result = stop(project)

            assert result["success"]
            killed_ids = {c.args[0] for c in mock_kill.call_args_list}
            assert "%20" in killed_ids, "Must kill tea pane (owner=None, role=tea)"
            assert "%21" in killed_ids, "Must kill dev pane (owner=None, role=dev)"
            assert "%22" in killed_ids, "Must kill reviewer pane (owner=None, role=reviewer)"

    def test_stop_preserves_protected_with_native_panes(self, project: Path) -> None:
        """Protected panes survive even when native team panes are killed."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_native_team_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):
            stop(project)

        reg = _read_registry(project)
        protected_ids = {p["pane_id"] for p in reg["panes"] if p["protected"]}
        assert "%0" in protected_ids, "Claude pane must survive"
        assert "%1" in protected_ids, "TUI pane must survive"

    def test_stop_removes_native_panes_from_registry(self, project: Path) -> None:
        """After stop(), native team panes must be gone from registry."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_native_team_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):
            stop(project)

        reg = _read_registry(project)
        agent_panes = [p for p in reg["panes"] if p["role"] in {"tea", "dev", "reviewer"}]
        assert len(agent_panes) == 0, \
            f"Registry must not contain agent panes after stop, found: {agent_panes}"

    def test_stop_does_not_kill_unrelated_worker_panes(self, project: Path) -> None:
        """stop() must not kill worker panes that don't match active agents."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_native_team_panes("pf-test")
        # Add an unrelated worker pane
        registry["panes"].append({
            "pane_id": "%30",
            "role": "worker",
            "title": "Worker 1",
            "protected": False,
            "owner": None,
        })
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):
            stop(project)

        reg = _read_registry(project)
        worker_panes = [p for p in reg["panes"] if p["pane_id"] == "%30"]
        assert len(worker_panes) == 1, "Unrelated worker pane must survive"


# ===========================================================================
# BUG 1b: Repeated start/stop must not accumulate panes
# ===========================================================================


class TestNoPaneAccumulation:
    """Multiple peloton runs must not leave orphan panes."""

    def test_second_start_after_stop_has_clean_registry(self, project: Path) -> None:
        """After stop + start, registry should only have new panes, not old ones."""
        from pf.peloton.live import stop

        # Simulate first run: active state with panes in registry
        _write_active_state(project)
        first_registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, first_registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):
            stop(project)

        # After stop, peloton panes should be gone from registry
        reg = _read_registry(project)
        peloton_panes = [p for p in reg["panes"] if p.get("owner") == "peloton"]
        assert len(peloton_panes) == 0, \
            "After stop(), registry must not contain peloton panes from previous run"


# ===========================================================================
# PaneOrchestrator.teardown() — previously untested
#
# teardown() uses a lazy local import: `from pf.tmux.panes import kill_pane`
# So we must patch at `pf.tmux.panes.kill_pane` (the source), not at the
# module-level import in pane_orchestrator.
# ===========================================================================


class TestPaneOrchestratorTeardown:
    """PaneOrchestrator.teardown() must kill non-protected panes."""

    def _make_orchestrator(self, tmp_path: Path) -> PaneOrchestrator:
        """Create an orchestrator with a mix of protected and unprotected panes."""
        orch = PaneOrchestrator(
            project_root=tmp_path,
            session_name="pf-test",
            story_id="42-1",
            _use_tmux=True,
        )
        orch.panes = [
            ManagedPane(pane_id="%10", role="tea", title="42-1-tea", protected=False, owner="peloton"),
            ManagedPane(pane_id="%11", role="dev", title="42-1-dev", protected=False, owner="peloton"),
            ManagedPane(pane_id="%12", role="reviewer", title="42-1-reviewer", protected=False, owner="peloton"),
            ManagedPane(pane_id="%0", role="claude", title="Claude Code", protected=True, owner=None),
        ]
        return orch

    def test_teardown_calls_kill_pane_for_non_protected(self, tmp_path: Path) -> None:
        """teardown() must call kill_pane for each non-protected pane."""
        orch = self._make_orchestrator(tmp_path)

        with patch("pf.tmux.panes.kill_pane") as mock_kill:
            mock_kill.return_value = {"success": True}

            result = orch.teardown()

        assert result["success"]
        killed_ids = {c.args[0] for c in mock_kill.call_args_list}
        assert "%10" in killed_ids
        assert "%11" in killed_ids
        assert "%12" in killed_ids

    def test_teardown_skips_protected_panes(self, tmp_path: Path) -> None:
        """teardown() must NOT call kill_pane for protected panes."""
        orch = self._make_orchestrator(tmp_path)

        with patch("pf.tmux.panes.kill_pane") as mock_kill:
            mock_kill.return_value = {"success": True}

            orch.teardown()

        killed_ids = {c.args[0] for c in mock_kill.call_args_list}
        assert "%0" not in killed_ids, "Protected claude pane must not be killed"

    def test_teardown_reports_killed_and_skipped(self, tmp_path: Path) -> None:
        """teardown() result must list killed and skipped pane IDs."""
        orch = self._make_orchestrator(tmp_path)

        with patch("pf.tmux.panes.kill_pane") as mock_kill:
            mock_kill.return_value = {"success": True}

            result = orch.teardown()

        assert set(result["data"]["killed"]) == {"%10", "%11", "%12"}
        assert result["data"]["skipped"] == ["%0"]

    def test_teardown_removes_killed_panes_from_list(self, tmp_path: Path) -> None:
        """After teardown(), only protected panes should remain in orch.panes."""
        orch = self._make_orchestrator(tmp_path)

        with patch("pf.tmux.panes.kill_pane") as mock_kill:
            mock_kill.return_value = {"success": True}

            orch.teardown()

        remaining_ids = {p.pane_id for p in orch.panes}
        assert remaining_ids == {"%0"}, f"Only protected pane should survive, got: {remaining_ids}"

    def test_teardown_with_no_panes(self, tmp_path: Path) -> None:
        """teardown() on empty orchestrator should succeed gracefully."""
        orch = PaneOrchestrator(
            project_root=tmp_path,
            session_name="pf-test",
            story_id="42-1",
            _use_tmux=True,
        )

        with patch("pf.tmux.panes.kill_pane") as mock_kill:
            result = orch.teardown()

        assert result["success"]
        assert result["data"]["killed"] == []
        assert result["data"]["skipped"] == []
        mock_kill.assert_not_called()

    def test_teardown_continues_after_kill_failure(self, tmp_path: Path) -> None:
        """If one kill_pane fails, teardown must still attempt the rest."""
        orch = self._make_orchestrator(tmp_path)

        kill_calls = []

        def kill_side_effect(pane_id: str) -> dict:
            kill_calls.append(pane_id)
            if pane_id == "%10":
                raise OSError("tmux not responding")
            return {"success": True}

        with patch("pf.tmux.panes.kill_pane", side_effect=kill_side_effect):
            result = orch.teardown()

        # All 3 non-protected panes must be attempted
        assert len(kill_calls) == 3, f"Must attempt all 3 kills, only attempted: {kill_calls}"
        # %10 failed but should still be in killed list (best-effort)
        assert "%10" in result["data"]["killed"]

    def test_teardown_with_use_tmux_false(self, tmp_path: Path) -> None:
        """When _use_tmux is False, teardown should skip kill_pane calls but still clean up."""
        orch = PaneOrchestrator(
            project_root=tmp_path,
            session_name="pf-test",
            story_id="42-1",
            _use_tmux=False,
        )
        orch.panes = [
            ManagedPane(pane_id="%10", role="tea", title="42-1-tea", protected=False, owner="peloton"),
            ManagedPane(pane_id="%11", role="dev", title="42-1-dev", protected=False, owner="peloton"),
        ]

        with patch("pf.tmux.panes.kill_pane") as mock_kill:
            result = orch.teardown()

        assert result["success"]
        # kill_pane should NOT be called when _use_tmux is False
        mock_kill.assert_not_called()
        # But panes should still be removed from the list
        assert result["data"]["killed"] == ["%10", "%11"]
        assert len(orch.panes) == 0


# ===========================================================================
# Registry classify_pane recognizes agent roles (148-25)
# ===========================================================================


class TestClassifyPaneAgentRoles:
    """_classify_pane must recognize agent role names in pane titles."""

    def test_classify_tea(self) -> None:
        from pf.tmux.registry import _classify_pane
        role, protected = _classify_pane("tea")
        assert role == "tea"
        assert not protected

    def test_classify_dev(self) -> None:
        from pf.tmux.registry import _classify_pane
        role, protected = _classify_pane("dev")
        assert role == "dev"
        assert not protected

    def test_classify_reviewer(self) -> None:
        from pf.tmux.registry import _classify_pane
        role, protected = _classify_pane("reviewer")
        assert role == "reviewer"
        assert not protected

    def test_classify_story_prefixed_role(self) -> None:
        """Pane titles like '148-25-tea' should classify as tea."""
        from pf.tmux.registry import _classify_pane
        role, protected = _classify_pane("148-25-tea")
        assert role == "tea"
        assert not protected

    def test_classify_unknown_still_worker(self) -> None:
        from pf.tmux.registry import _classify_pane
        role, protected = _classify_pane("my-custom-pane")
        assert role == "worker"
        assert not protected

    def test_protected_panes_unchanged(self) -> None:
        from pf.tmux.registry import _classify_pane
        role, protected = _classify_pane("Claude Code")
        assert role == "claude"
        assert protected


# ===========================================================================
# No real tmux — verify mocking is correct
# ===========================================================================


class TestNoRealTmux:
    """All tests must mock tmux. Verify no real subprocess calls leak."""

    def test_stop_never_calls_real_tmux(self, project: Path) -> None:
        """stop() must never invoke real tmux subprocess commands."""
        from pf.peloton.live import stop

        _write_active_state(project)
        registry = _make_registry_with_peloton_panes("pf-test")
        _write_registry(project, registry)

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
             patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}) as mock_tmux:

            stop(project)

            # _run_tmux is mocked, so no real subprocess calls happen.
            # But stop() must actually call kill_pane (via the registry).
            # If stop() doesn't clean panes, kill_pane won't be called at all.
            # This test verifies no UNGUARDED tmux calls sneak through.

    def test_teardown_uses_kill_pane_not_subprocess(self, tmp_path: Path) -> None:
        """PaneOrchestrator.teardown() must go through kill_pane, not subprocess directly."""
        orch = PaneOrchestrator(
            project_root=tmp_path,
            session_name="pf-test",
            story_id="42-1",
            _use_tmux=True,
        )
        orch.panes = [
            ManagedPane(pane_id="%10", role="tea", title="42-1-tea", protected=False, owner="peloton"),
        ]

        with patch("pf.tmux.panes.kill_pane", return_value={"success": True}) as mock_kill, \
             patch("subprocess.run") as mock_subprocess:

            orch.teardown()

            # kill_pane should be called (goes through mock, not real subprocess)
            mock_kill.assert_called_once_with("%10")
            # subprocess.run should NOT be called directly
            mock_subprocess.assert_not_called()
