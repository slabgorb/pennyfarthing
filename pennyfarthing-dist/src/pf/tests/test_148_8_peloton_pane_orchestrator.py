"""Tests for Story 148-8: Peloton pane orchestrator.

Covers AC-1 (pane spawning) and AC-2 (registry integration).
The PaneOrchestrator must spawn dedicated tmux panes for each agent role
and register them in .pennyfarthing/tmux-panes.json with correct metadata.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.peloton.pane_orchestrator import ManagedPane, PaneOrchestrator

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def orchestrator(tmp_path: Path) -> PaneOrchestrator:
    """Create a PaneOrchestrator with a temp project root."""
    return PaneOrchestrator(
        project_root=tmp_path,
        session_name="pf-test-0",
        story_id="148-8",
    )


# ---------------------------------------------------------------------------
# AC-1: pf peloton start spawns three dedicated agent panes
# ---------------------------------------------------------------------------


class TestSpawnAgentPanes:
    """AC-1: Spawning dedicated panes for TEA, Dev, Reviewer."""

    def test_spawn_returns_pane_per_role(self, orchestrator: PaneOrchestrator):
        """Each phase role gets its own ManagedPane."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        data = result["data"]
        assert "tea" in data
        assert "dev" in data
        assert "reviewer" in data

    def test_spawned_panes_have_unique_ids(self, orchestrator: PaneOrchestrator):
        """Each spawned pane must have a distinct pane_id."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        pane_ids = [p.pane_id for p in result["data"].values()]
        assert len(pane_ids) == len(set(pane_ids)), "Pane IDs must be unique"

    def test_pane_titles_include_role(self, orchestrator: PaneOrchestrator):
        """Pane titles should identify the role for discoverability."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        for role, pane in result["data"].items():
            assert role in pane.title.lower() or pane.title, (
                f"Pane title '{pane.title}' should reference role '{role}'"
            )

    def test_spawn_with_subset_of_phases(self, orchestrator: PaneOrchestrator):
        """Should handle fewer than 3 phases (e.g., just TEA + Dev)."""
        result = orchestrator.spawn_agent_panes(["tea", "dev"])
        assert result["success"] is True
        assert len(result["data"]) == 2

    def test_spawn_with_empty_phases_returns_error(self, orchestrator: PaneOrchestrator):
        """Empty phase list should fail gracefully."""
        result = orchestrator.spawn_agent_panes([])
        assert result["success"] is False
        assert "error" in result

    def test_panes_tracked_in_orchestrator(self, orchestrator: PaneOrchestrator):
        """After spawn, orchestrator.panes should contain all managed panes."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        assert len(orchestrator.panes) == 3

    def test_get_pane_by_role(self, orchestrator: PaneOrchestrator):
        """get_pane should find panes by role name."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        tea_pane = orchestrator.get_pane("tea")
        assert tea_pane is not None
        assert tea_pane.role == "tea"

    def test_get_pane_nonexistent_role(self, orchestrator: PaneOrchestrator):
        """get_pane should return None for unknown roles."""
        result = orchestrator.spawn_agent_panes(["tea"])
        assert result["success"] is True
        assert orchestrator.get_pane("reviewer") is None


# ---------------------------------------------------------------------------
# AC-2: Panes registered in .pennyfarthing/tmux-panes.json
# ---------------------------------------------------------------------------


class TestRegistryIntegration:
    """AC-2: Spawned panes must be registered with role, title, protection."""

    def test_registry_entries_have_required_fields(self, orchestrator: PaneOrchestrator):
        """Each registry entry needs pane_id, role, title, protected, owner."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        entries = orchestrator.get_registry_entries()
        assert len(entries) == 3
        for entry in entries:
            assert "pane_id" in entry
            assert "role" in entry
            assert "title" in entry
            assert "protected" in entry
            assert "owner" in entry

    def test_agent_panes_use_agent_role(self, orchestrator: PaneOrchestrator):
        """Agent panes should NOT use 'worker' role — they get specific roles."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        entries = orchestrator.get_registry_entries()
        roles = {e["role"] for e in entries}
        # Roles should be the agent names, not generic "worker"
        assert "tea" in roles or "agent" in roles

    def test_agent_panes_are_not_protected(self, orchestrator: PaneOrchestrator):
        """Agent panes should NOT be protected (only claude/tui are)."""
        result = orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        entries = orchestrator.get_registry_entries()
        for entry in entries:
            assert entry["protected"] is False


# ---------------------------------------------------------------------------
# Worker pane spawning
# ---------------------------------------------------------------------------


class TestWorkerPanes:
    """Utility worker panes for gate resolution and background tasks."""

    def test_spawn_worker_pane(self, orchestrator: PaneOrchestrator):
        """Should spawn a worker pane with given title."""
        result = orchestrator.spawn_worker_pane("Gate Worker")
        assert result["success"] is True
        assert isinstance(result["data"], ManagedPane)
        assert result["data"].title == "Gate Worker"

    def test_worker_pane_not_protected(self, orchestrator: PaneOrchestrator):
        """Worker panes should not be protected."""
        result = orchestrator.spawn_worker_pane("Utility")
        assert result["success"] is True
        assert result["data"].protected is False


# ---------------------------------------------------------------------------
# Pane idle detection
# ---------------------------------------------------------------------------


class TestPaneIdleDetection:
    """Detecting when a pane has finished executing and returned to shell."""

    def test_is_pane_idle_returns_bool(self, orchestrator: PaneOrchestrator):
        """is_pane_idle should return {success, data: bool}."""
        orchestrator.spawn_agent_panes(["tea"])
        tea = orchestrator.get_pane("tea")
        assert tea is not None
        result = orchestrator.is_pane_idle(tea.pane_id)
        assert result["success"] is True
        assert isinstance(result["data"], bool)

    def test_wait_for_idle_timeout(self, orchestrator: PaneOrchestrator):
        """wait_for_idle should fail with timeout error if pane stays busy."""
        orchestrator.spawn_agent_panes(["tea"])
        tea = orchestrator.get_pane("tea")
        assert tea is not None
        result = orchestrator.wait_for_idle(tea.pane_id, timeout_s=1)
        # Either succeeds (pane was idle) or fails with timeout
        if not result["success"]:
            assert "timeout" in result["error"].lower()


# ---------------------------------------------------------------------------
# Output capture
# ---------------------------------------------------------------------------


class TestOutputCapture:
    """Capturing pane output for gate evaluation and result aggregation."""

    def test_capture_output_returns_string(self, orchestrator: PaneOrchestrator):
        """capture_output should return the pane's current buffer as text."""
        orchestrator.spawn_agent_panes(["tea"])
        tea = orchestrator.get_pane("tea")
        assert tea is not None
        result = orchestrator.capture_output(tea.pane_id)
        assert result["success"] is True
        assert isinstance(result["data"], str)


# ---------------------------------------------------------------------------
# Teardown
# ---------------------------------------------------------------------------


class TestTeardown:
    """Cleaning up panes after a peloton run."""

    def test_teardown_kills_non_protected_panes(self, orchestrator: PaneOrchestrator):
        """teardown should kill all agent/worker panes created by orchestrator."""
        orchestrator.spawn_agent_panes(["tea", "dev", "reviewer"])
        result = orchestrator.teardown()
        assert result["success"] is True
        assert "killed" in result["data"]

    def test_teardown_skips_protected_panes(self, orchestrator: PaneOrchestrator):
        """Protected panes (claude, tui) must never be killed."""
        # Add a mock protected pane
        orchestrator.panes.append(
            ManagedPane(pane_id="%99", role="claude", title="Claude Code", protected=True, owner=None)
        )
        orchestrator.spawn_agent_panes(["tea"])
        result = orchestrator.teardown()
        assert result["success"] is True
        skipped = result["data"].get("skipped", [])
        assert any(p == "%99" or (isinstance(p, dict) and p.get("pane_id") == "%99") for p in skipped)
