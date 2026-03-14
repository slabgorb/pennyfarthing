"""Tests for Story 148-10: Unify peloton pane management with tmux registry.

Peloton live.py maintains its own peloton-state.json and pane_orchestrator.py
calls _run_tmux directly, bypassing the tmux registry and panes API. This story
unifies both to use the canonical pf.tmux API so pf tmux read/send/list works
natively with peloton panes.

ACs:
  AC-1: live.py spawn_panes registers panes in tmux registry
  AC-2: pane_orchestrator.py capture_output uses panes.capture_pane (not _run_tmux)
  AC-3: pf tmux read/list resolves peloton panes by title (peloton-{role})
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from pf.peloton.live import (
    load_state,
    spawn_panes,
)
from pf.peloton.pane_orchestrator import PaneOrchestrator
from pf.tmux.registry import (
    registry_path,
    resolve_pane_ref,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """Create a project root with .pennyfarthing dir."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    return tmp_path


@pytest.fixture
def project_with_registry(project_root: Path) -> Path:
    """Project root with an existing tmux registry file."""
    reg = {
        "session": "pf-test-0",
        "socket": "pf",
        "max_panes": 10,
        "panes": [
            {"pane_id": "%1", "role": "claude", "title": "Claude Code", "protected": True, "owner": None},
            {"pane_id": "%2", "role": "tui", "title": "TUI", "protected": True, "owner": None},
        ],
    }
    reg_file = registry_path(project_root)
    reg_file.write_text(json.dumps(reg, indent=2) + "\n")
    return project_root


@pytest.fixture
def orchestrator(tmp_path: Path) -> PaneOrchestrator:
    """Create a PaneOrchestrator with a temp project root."""
    return PaneOrchestrator(
        project_root=tmp_path,
        session_name="pf-test-0",
        story_id="148-10",
    )


# ---------------------------------------------------------------------------
# AC-1: live.py spawn_panes registers panes in tmux registry
# ---------------------------------------------------------------------------


class TestLiveRegistersInTmuxRegistry:
    """AC-1: spawn_panes must register panes in the tmux registry,
    not just its own peloton-state.json."""

    def test_spawn_panes_writes_to_tmux_registry(self, project_with_registry: Path):
        """After spawn_panes, the tmux registry file should contain peloton panes."""
        result = spawn_panes(project_with_registry, "148-10", "tdd")
        assert result["success"] is True

        reg_file = registry_path(project_with_registry)
        assert reg_file.exists(), "tmux registry file should exist after spawn"

        reg = json.loads(reg_file.read_text())
        pane_titles = [p["title"] for p in reg["panes"]]

        # Peloton panes should appear in the tmux registry
        assert any("peloton-" in t for t in pane_titles), (
            f"Expected peloton panes in tmux registry, got titles: {pane_titles}"
        )

    def test_spawn_panes_registry_entries_have_owner(self, project_with_registry: Path):
        """Peloton panes in tmux registry should have owner='peloton'."""
        result = spawn_panes(project_with_registry, "148-10", "tdd")
        assert result["success"] is True

        reg_file = registry_path(project_with_registry)
        reg = json.loads(reg_file.read_text())

        peloton_entries = [p for p in reg["panes"] if "peloton-" in p.get("title", "")]
        assert len(peloton_entries) > 0, "Should have peloton entries in registry"

        for entry in peloton_entries:
            assert entry.get("owner") == "peloton", (
                f"Peloton pane {entry['title']} should have owner='peloton', got {entry.get('owner')}"
            )

    def test_spawn_panes_registry_pane_ids_match_state(self, project_with_registry: Path):
        """Pane IDs in tmux registry should match those in peloton state."""
        result = spawn_panes(project_with_registry, "148-10", "tdd")
        assert result["success"] is True

        # Get pane IDs from peloton state
        state = load_state(project_with_registry)
        state_ids = {info["pane_id"] for info in state["panes"].values()}

        # Get pane IDs from tmux registry
        reg_file = registry_path(project_with_registry)
        reg = json.loads(reg_file.read_text())
        peloton_reg_ids = {
            p["pane_id"] for p in reg["panes"] if "peloton-" in p.get("title", "")
        }

        assert state_ids == peloton_reg_ids, (
            f"Pane IDs should match between state ({state_ids}) and registry ({peloton_reg_ids})"
        )

    def test_spawn_panes_registry_entries_not_protected(self, project_with_registry: Path):
        """Peloton panes should not be marked as protected in the registry."""
        result = spawn_panes(project_with_registry, "148-10", "tdd")
        assert result["success"] is True

        reg_file = registry_path(project_with_registry)
        reg = json.loads(reg_file.read_text())

        peloton_entries = [p for p in reg["panes"] if "peloton-" in p.get("title", "")]
        for entry in peloton_entries:
            assert entry["protected"] is False


# ---------------------------------------------------------------------------
# AC-2: pane_orchestrator.py uses panes.capture_pane (not _run_tmux)
# ---------------------------------------------------------------------------


class TestOrchestratorUsesCanonicalAPI:
    """AC-2: PaneOrchestrator.capture_output must delegate to
    panes.capture_pane() instead of calling _run_tmux directly."""

    def test_capture_output_calls_capture_pane(self, orchestrator: PaneOrchestrator):
        """capture_output should call panes.capture_pane, not _run_tmux."""
        with patch("pf.tmux.panes.capture_pane") as mock_capture:
            mock_capture.return_value = {"success": True, "data": "test output"}
            orchestrator.spawn_agent_panes(["tea"])
            tea = orchestrator.get_pane("tea")
            assert tea is not None

            result = orchestrator.capture_output(tea.pane_id)
            assert result["success"] is True
            mock_capture.assert_called_once_with(tea.pane_id)

    def test_capture_output_does_not_import_run_tmux(self, orchestrator: PaneOrchestrator):
        """capture_output should NOT import _run_tmux — it's a private API."""
        import inspect
        source = inspect.getsource(orchestrator.capture_output)
        assert "_run_tmux" not in source, (
            "capture_output should use panes.capture_pane(), not _run_tmux directly"
        )


# ---------------------------------------------------------------------------
# AC-3: pf tmux read/list resolves peloton panes by title
# ---------------------------------------------------------------------------


class TestTmuxResolvespelotonPanes:
    """AC-3: resolve_pane_ref should find peloton panes by their title."""

    def test_resolve_by_peloton_title(self):
        """resolve_pane_ref should find a pane by its peloton-{role} title."""
        reg = {
            "panes": [
                {"pane_id": "%1", "role": "claude", "title": "Claude Code", "protected": True, "owner": None},
                {"pane_id": "%10", "role": "worker", "title": "peloton-tea", "protected": False, "owner": "peloton"},
                {"pane_id": "%11", "role": "worker", "title": "peloton-dev", "protected": False, "owner": "peloton"},
            ],
        }
        entry = resolve_pane_ref(reg, "peloton-tea")
        assert entry is not None
        assert entry["pane_id"] == "%10"

    def test_resolve_by_peloton_title_case_insensitive(self):
        """Title matching should be case-insensitive."""
        reg = {
            "panes": [
                {"pane_id": "%10", "role": "worker", "title": "peloton-tea", "protected": False, "owner": "peloton"},
            ],
        }
        entry = resolve_pane_ref(reg, "Peloton-TEA")
        assert entry is not None
        assert entry["pane_id"] == "%10"
