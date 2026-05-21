"""Tests for peloton layout selection — horizontal, vertical, or 2x2 grid.

Story 148-24: Allow users to select the layout of team panes in peloton mode.
Three options: horizontal (side-by-side), vertical (stacked), or 2x2 grid.
The layout should be selectable via CLI flag or config setting.

Acceptance Criteria:
- AC1: `pf peloton start` accepts `--layout horizontal|vertical|grid` flag
       (default: grid for 4+ agents, vertical for 2-3)
- AC2: Horizontal layout splits the window into equal-width vertical panes
- AC3: Vertical layout splits the window into equal-height horizontal panes
- AC4: Grid layout arranges panes in a 2x2 (or 2xN) grid pattern
- AC5: Layout preference can be persisted in config.local.yaml under `peloton.layout`
- AC6: CLI flag overrides config setting
- AC7: Existing peloton tests continue to pass with default layout
- AC8: TUI pane is consistently placed below the SM team lead CLI pane,
       regardless of layout choice. Layout only affects agent teammate panes.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from pf import paths


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path, monkeypatch) -> Path:
    """Minimal project structure for peloton layout tests."""
    plugin_data = tmp_path / "plugin_data"
    plugin_data.mkdir()
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(plugin_data))
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))

    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Workflow definition with 4 agents (triggers grid default)
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

    # Trivial workflow with 2 agents (triggers vertical default)
    (wf_dir / "trivial.yaml").write_text(
        "workflow:\n"
        "  name: trivial\n"
        "  type: phased\n"
        "  phases:\n"
        "    - name: setup\n"
        "      agent: sm\n"
        "    - name: implement\n"
        "      agent: dev\n"
        "    - name: review\n"
        "      agent: reviewer\n"
    )

    # Session file
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "42-1-session.md").write_text(
        "**Story:** 42-1\n"
        "**Workflow:** tdd\n"
        "**Phase:** setup\n"
    )

    return tmp_path


@pytest.fixture
def project_with_config(project: Path) -> Path:
    """Project with a peloton.layout config setting."""
    cfg = paths.config_path(project)
    cfg.parent.mkdir(parents=True, exist_ok=True)
    cfg.write_text(yaml.dump({"peloton": {"layout": "horizontal"}}))
    return project


# ---------------------------------------------------------------------------
# AC1: --layout flag accepted with valid values
# ---------------------------------------------------------------------------


class TestLayoutFlag:
    """AC1: pf peloton start accepts --layout horizontal|vertical|grid."""

    def test_start_session_accepts_layout_param(self, project: Path) -> None:
        """start_session should accept a layout parameter."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="grid")

        assert result["success"]
        assert result["data"]["layout"] == "grid"

    def test_start_session_accepts_horizontal(self, project: Path) -> None:
        """Horizontal layout is a valid choice."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="horizontal")

        assert result["success"]
        assert result["data"]["layout"] == "horizontal"

    def test_start_session_accepts_vertical(self, project: Path) -> None:
        """Vertical layout is a valid choice."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="vertical")

        assert result["success"]
        assert result["data"]["layout"] == "vertical"

    def test_start_session_rejects_invalid_layout(self, project: Path) -> None:
        """Invalid layout value should return error."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="diagonal")

        assert not result["success"]
        assert "layout" in result["error"].lower()

    def test_layout_stored_in_state(self, project: Path) -> None:
        """Layout choice should be persisted in peloton state."""
        from pf.peloton.live import load_state, start_session

        start_session(project, "42-1", "tdd", layout="horizontal")

        state = load_state(project)
        assert state["layout"] == "horizontal"


# ---------------------------------------------------------------------------
# AC1 continued: Smart defaults based on agent count
# ---------------------------------------------------------------------------


class TestLayoutDefaults:
    """AC1: Default layout is grid for 4+ agents, vertical for 2-3."""

    def test_default_grid_for_4_agents(self, project: Path) -> None:
        """TDD workflow has 3 non-SM agents (tea, dev, reviewer) +
        potential architect = 4+. With 3, default should be vertical.
        Let's test the actual default for tdd (3 agents)."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd")

        assert result["success"]
        # 3 agents (tea, dev, reviewer) -> vertical default
        assert result["data"]["layout"] == "vertical"

    def test_default_vertical_for_2_agents(self, project: Path) -> None:
        """Trivial workflow has 2 agents (dev, reviewer) -> vertical."""
        from pf.peloton.live import start_session

        (project / ".session" / "42-1-session.md").write_text(
            "**Story:** 42-1\n"
            "**Workflow:** trivial\n"
            "**Phase:** setup\n"
        )

        result = start_session(project, "42-1", "trivial")

        assert result["success"]
        assert result["data"]["layout"] == "vertical"

    def test_default_grid_for_4_plus_agents(self, project: Path) -> None:
        """Workflow with 4+ agents should default to grid."""
        # Create workflow with 4 non-SM agents
        wf_dir = project / ".pennyfarthing" / "workflows"
        (wf_dir / "bdd.yaml").write_text(
            "workflow:\n"
            "  name: bdd\n"
            "  type: phased\n"
            "  phases:\n"
            "    - name: setup\n"
            "      agent: sm\n"
            "    - name: design\n"
            "      agent: architect\n"
            "    - name: red\n"
            "      agent: tea\n"
            "    - name: green\n"
            "      agent: dev\n"
            "    - name: review\n"
            "      agent: reviewer\n"
        )

        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "bdd")

        assert result["success"]
        assert result["data"]["layout"] == "grid"


# ---------------------------------------------------------------------------
# AC2: Horizontal layout description in prompt
# ---------------------------------------------------------------------------


class TestHorizontalLayout:
    """AC2: Horizontal layout splits into equal-width panes side by side."""

    def test_horizontal_prompt_mentions_side_by_side(self, project: Path) -> None:
        """Prompt should describe horizontal/side-by-side arrangement."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="horizontal")

        assert result["success"]
        prompt = result["data"]["prompt"].lower()
        assert "horizontal" in prompt or "side" in prompt


# ---------------------------------------------------------------------------
# AC3: Vertical layout description in prompt
# ---------------------------------------------------------------------------


class TestVerticalLayout:
    """AC3: Vertical layout splits into equal-height stacked panes."""

    def test_vertical_prompt_mentions_stacked(self, project: Path) -> None:
        """Prompt should describe vertical/stacked arrangement."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="vertical")

        assert result["success"]
        prompt = result["data"]["prompt"].lower()
        assert "vertical" in prompt or "stack" in prompt


# ---------------------------------------------------------------------------
# AC4: Grid layout description in prompt
# ---------------------------------------------------------------------------


class TestGridLayout:
    """AC4: Grid layout arranges panes in a 2x2 or 2xN grid."""

    def test_grid_prompt_mentions_grid(self, project: Path) -> None:
        """Prompt should describe grid arrangement."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="grid")

        assert result["success"]
        prompt = result["data"]["prompt"].lower()
        assert "grid" in prompt or "2x2" in prompt


# ---------------------------------------------------------------------------
# AC5: Config persistence
# ---------------------------------------------------------------------------


class TestConfigPersistence:
    """AC5: Layout preference persisted in config.local.yaml."""

    def test_reads_layout_from_config(self, project_with_config: Path) -> None:
        """start_session should read layout from config when not provided."""
        from pf.peloton.live import start_session

        result = start_session(project_with_config, "42-1", "tdd")

        assert result["success"]
        assert result["data"]["layout"] == "horizontal"

    def test_get_configured_layout_returns_setting(self, project_with_config: Path) -> None:
        """A helper function should read the peloton.layout config."""
        from pf.peloton.live import get_configured_layout

        layout = get_configured_layout(project_with_config)
        assert layout == "horizontal"

    def test_get_configured_layout_returns_none_when_unset(self, project: Path) -> None:
        """When no config exists, should return None."""
        from pf.peloton.live import get_configured_layout

        layout = get_configured_layout(project)
        assert layout is None


# ---------------------------------------------------------------------------
# AC6: CLI flag overrides config
# ---------------------------------------------------------------------------


class TestFlagOverridesConfig:
    """AC6: CLI --layout flag overrides config.local.yaml setting."""

    def test_explicit_layout_overrides_config(self, project_with_config: Path) -> None:
        """Config says horizontal, but explicit flag says vertical."""
        from pf.peloton.live import start_session

        result = start_session(project_with_config, "42-1", "tdd", layout="vertical")

        assert result["success"]
        assert result["data"]["layout"] == "vertical"

    def test_explicit_grid_overrides_config(self, project_with_config: Path) -> None:
        """Config says horizontal, but explicit flag says grid."""
        from pf.peloton.live import start_session

        result = start_session(project_with_config, "42-1", "tdd", layout="grid")

        assert result["success"]
        assert result["data"]["layout"] == "grid"


# ---------------------------------------------------------------------------
# AC7: Backward compatibility — existing tests still work
# ---------------------------------------------------------------------------


class TestBackwardCompatibility:
    """AC7: Existing start_session calls without layout still work."""

    def test_start_session_without_layout_still_works(self, project: Path) -> None:
        """Calling start_session without layout param works (uses default)."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd")

        assert result["success"]
        assert "prompt" in result["data"]
        assert "team_name" in result["data"]
        assert "agents" in result["data"]
        # Layout should be present in result even when not explicitly set
        assert "layout" in result["data"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestLayoutEdgeCases:
    """Edge cases for layout selection."""

    def test_layout_case_insensitive(self, project: Path) -> None:
        """Layout values should be case-insensitive."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="GRID")

        assert result["success"]
        assert result["data"]["layout"] == "grid"

    def test_layout_in_state_survives_reload(self, project: Path) -> None:
        """Layout should persist in state and survive reload."""
        from pf.peloton.live import load_state, start_session

        start_session(project, "42-1", "tdd", layout="horizontal")
        state = load_state(project)

        assert state["layout"] == "horizontal"
        assert state["active"] is True


# ---------------------------------------------------------------------------
# AC8: TUI consistently below SM team lead CLI
# ---------------------------------------------------------------------------


class TestTuiBelowCli:
    """AC8: TUI pane is always placed below the SM team lead CLI pane."""

    def test_prompt_specifies_tui_below_cli(self, project: Path) -> None:
        """TeamCreate prompt should instruct TUI placement below CLI."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="horizontal")

        assert result["success"]
        prompt = result["data"]["prompt"].lower()
        assert "tui" in prompt and "below" in prompt

    def test_tui_placement_independent_of_layout(self, project: Path) -> None:
        """TUI below CLI regardless of horizontal, vertical, or grid layout."""
        from pf.peloton.live import start_session

        for layout in ("horizontal", "vertical", "grid"):
            result = start_session(project, "42-1", "tdd", layout=layout)
            assert result["success"], f"Failed for layout={layout}"
            prompt = result["data"]["prompt"].lower()
            assert "tui" in prompt and "below" in prompt, (
                f"Layout '{layout}' prompt must specify TUI below CLI"
            )

    def test_layout_only_affects_agent_panes(self, project: Path) -> None:
        """Layout setting should describe arrangement of agent teammate
        panes, not the TUI or CLI pane placement."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd", layout="grid")

        assert result["success"]
        prompt = result["data"]["prompt"]
        # The layout instruction should reference agent/teammate panes
        # not the TUI or SM/CLI pane
        assert "teammate" in prompt.lower() or "agent" in prompt.lower()
