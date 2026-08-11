"""Tests for peloton portrait panes — portrait beside CLI in each agent pane.

Story 148-21: Peloton agent panes show portrait beside CLI
Epic: 148 — TUI-tmux Fixer

When peloton mode creates agent panes, each agent gets a plain CLI pane. This
story splits each agent pane horizontally: portrait on the left, CLI on the right.

Acceptance Criteria:
- [AC1] Each peloton agent pane is split with portrait on left and CLI on right
- [AC2] Portrait shows the correct character for each agent's role (based on active theme)
- [AC3] Portrait pane is sized appropriately (small, non-intrusive)
- [AC4] Works when portrait/theme is not configured (graceful fallback — no portrait, full CLI)

All tmux interactions are mocked — no real tmux sessions opened.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from pf.peloton.pane_orchestrator import PaneOrchestrator

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Minimal project structure with theme for portrait resolution."""
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
        "    - name: red\n"
        "      agent: tea\n"
        "    - name: green\n"
        "      agent: dev\n"
        "    - name: review\n"
        "      agent: reviewer\n"
    )

    # Theme YAML with agent characters
    personas_dir = pf_dir / "personas" / "themes"
    personas_dir.mkdir(parents=True)
    (personas_dir / "firefly.yaml").write_text(
        "name: firefly\n"
        "agents:\n"
        "  tea:\n"
        "    character: River Tam\n"
        "    shortName: River\n"
        "    ocean: {O: 4, C: 2, E: 3, A: 3, N: 5}\n"
        "  dev:\n"
        "    character: Kaylee Frye\n"
        "    shortName: Kaylee\n"
        "    ocean: {O: 4, C: 3, E: 5, A: 5, N: 2}\n"
        "  reviewer:\n"
        "    character: Inara Serra\n"
        "    shortName: Inara\n"
        "    ocean: {O: 4, C: 5, E: 4, A: 4, N: 2}\n"
    )

    # Portrait images (small bucket)
    portraits_dir = pf_dir / "personas" / "portraits" / "firefly" / "small"
    portraits_dir.mkdir(parents=True)
    (portraits_dir / "river-42335.png").write_bytes(b"\x89PNG" + b"\x00" * 100)
    (portraits_dir / "kaylee-43552.png").write_bytes(b"\x89PNG" + b"\x00" * 100)
    (portraits_dir / "inara-45442.png").write_bytes(b"\x89PNG" + b"\x00" * 100)

    # Config with active theme
    (pf_dir / "config.local.yaml").write_text("theme: firefly\n")

    return tmp_path


@pytest.fixture
def project_no_theme(tmp_path: Path) -> Path:
    """Project structure with no theme configured."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    wf_dir = pf_dir / "workflows"
    wf_dir.mkdir()
    (wf_dir / "tdd.yaml").write_text(
        "workflow:\n"
        "  name: tdd\n"
        "  type: phased\n"
        "  phases:\n"
        "    - name: red\n"
        "      agent: tea\n"
        "    - name: green\n"
        "      agent: dev\n"
    )

    # Config with no theme
    (pf_dir / "config.local.yaml").write_text("theme: null\n")

    return tmp_path


# ---------------------------------------------------------------------------
# Portrait-fetch boundary stub (story 162-5)
# ---------------------------------------------------------------------------
#
# This module's docstring promises "no real tmux sessions opened", but story
# 153-12 made `resolve_portrait_path` CDN-only: it computes the persona slug from
# the theme YAML and then fetches the image from R2, with every local fallback
# removed. So these tests silently acquired a *network* dependency — the local
# fixture PNGs under `.pennyfarthing/personas/portraits/` stopped being consulted
# and the resolver returned None, making `_try_create_portrait` bail out and all
# portrait assertions fail.
#
# The stub below restores local-file resolution for tests only. It deliberately
# reuses the production slug computation (`_extract_agent_slug`) so the part this
# module actually cares about — role -> character mapping via the theme YAML —
# stays under test. Only the network fetch is replaced.


@pytest.fixture(autouse=True)
def stub_portrait_fetch(monkeypatch: pytest.MonkeyPatch):
    """Resolve portraits from the fixture's local files instead of the CDN."""
    from pf.tui.portrait_resolver import _extract_agent_slug

    def _local_resolve(
        theme: str,
        agent: str,
        project_root: Path | None = None,
        preferred_size: str | None = None,
    ) -> Path | None:
        if project_root is None:
            return None
        theme_yaml = (
            project_root / ".pennyfarthing" / "personas" / "themes" / f"{theme}.yaml"
        )
        slug = _extract_agent_slug(theme_yaml, agent)
        if not slug:
            return None
        size = preferred_size or "small"
        candidate = (
            project_root
            / ".pennyfarthing"
            / "personas"
            / "portraits"
            / theme
            / size
            / f"{slug}.png"
        )
        return candidate if candidate.exists() else None

    monkeypatch.setattr(
        "pf.tui.portrait_resolver.resolve_portrait_path", _local_resolve
    )
    return _local_resolve


def test_stub_resolves_from_theme_yaml_not_a_hardcoded_map(project: Path) -> None:
    """Guard the stub (162-5).

    If the stub returned a canned path per role, every AC2 assertion below
    would be vacuous. Pin that it goes through the real slug computation: a
    theme YAML edit must change the resolved filename, and an agent absent
    from the YAML must resolve to None.
    """
    from pf.tui.portrait_resolver import resolve_portrait_path

    resolved = resolve_portrait_path(
        theme="firefly", agent="tea", project_root=project, preferred_size="small"
    )
    assert resolved is not None
    assert resolved.name == "river-42335.png"

    # An agent with no entry in the theme YAML resolves to nothing.
    assert (
        resolve_portrait_path(
            theme="firefly", agent="sm", project_root=project, preferred_size="small"
        )
        is None
    )


def _make_orchestrator(
    project_root: Path,
    story_id: str = "42-1",
    use_tmux: bool = False,
) -> PaneOrchestrator:
    """Create a PaneOrchestrator in test mode."""
    return PaneOrchestrator(
        project_root=project_root,
        session_name="pf-test",
        story_id=story_id,
        _use_tmux=use_tmux,
    )


# ===========================================================================
# AC1: Each peloton agent pane is split with portrait on left and CLI on right
# ===========================================================================


class TestAgentPaneSplitWithPortrait:
    """AC1: Each agent pane must be split — portrait left, CLI right."""

    def test_spawn_agent_panes_creates_portrait_pane_per_agent(self, project: Path) -> None:
        """Each spawned agent pane must have a companion portrait pane."""
        orch = _make_orchestrator(project)

        result = orch.spawn_agent_panes(
            scenario_phases=["tea", "dev", "reviewer"],
            theme="firefly",
        )

        assert result["success"]
        # Each agent should have both a CLI pane and a portrait pane
        for role in ["tea", "dev", "reviewer"]:
            agent_pane = orch.get_pane(role)
            assert agent_pane is not None, f"Agent pane missing for {role}"
            portrait_pane = orch.get_portrait_pane(role)
            assert portrait_pane is not None, f"Portrait pane missing for {role}"

    def test_portrait_pane_is_separate_from_cli_pane(self, project: Path) -> None:
        """Portrait and CLI panes must have different pane IDs."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="firefly",
        )

        cli_pane = orch.get_pane("tea")
        portrait_pane = orch.get_portrait_pane("tea")
        assert cli_pane is not None
        assert portrait_pane is not None
        assert cli_pane.pane_id != portrait_pane.pane_id

    def test_portrait_pane_role_indicates_portrait(self, project: Path) -> None:
        """Portrait pane role must distinguish it from the CLI pane."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="firefly",
        )

        portrait_pane = orch.get_portrait_pane("tea")
        assert portrait_pane is not None
        assert "portrait" in portrait_pane.role, \
            f"Portrait pane role should contain 'portrait', got: {portrait_pane.role}"

    def test_split_direction_is_horizontal(self, project: Path) -> None:
        """Portrait split must be horizontal (left-right), not vertical."""
        orch = _make_orchestrator(project, use_tmux=True)

        with patch("pf.tmux.panes.split_pane") as mock_split, \
             patch("pf.tmux.registry.load_registry", return_value={"success": False}):
            mock_split.return_value = {"success": True, "data": "%99"}

            orch.spawn_agent_panes(
                scenario_phases=["tea"],
                theme="firefly",
            )

            # Story 162-31: the assertion used to sit behind `if
            # mock_split.called:`, so it passed vacuously whenever the portrait
            # split never happened at all — which is precisely the regression it
            # is supposed to catch. Assert the call happened, then its shape.
            assert mock_split.called, (
                "portrait pane must be created by splitting the agent pane — "
                "split_pane was never called"
            )
            for c in mock_split.call_args_list:
                args = c[0] if c[0] else ()
                kwargs = c[1] if c[1] else {}
                direction = args[2] if len(args) > 2 else kwargs.get("direction")
                if direction == "h":
                    break
            else:
                pytest.fail("No horizontal split found — portrait must split horizontally")


# ===========================================================================
# AC2: Portrait shows the correct character for each agent's role
# ===========================================================================


class TestPortraitCharacterMapping:
    """AC2: Portrait must show the correct character per role from active theme."""

    def test_portrait_path_resolves_for_each_role(self, project: Path) -> None:
        """Each agent's portrait pane must reference the correct character portrait."""
        orch = _make_orchestrator(project)

        result = orch.spawn_agent_panes(
            scenario_phases=["tea", "dev", "reviewer"],
            theme="firefly",
        )

        assert result["success"]
        # The orchestrator should expose portrait paths per role
        portrait_info = orch.get_portrait_info("tea")
        assert portrait_info is not None, "Portrait info missing for tea"
        assert "river" in str(portrait_info.get("path", "")).lower(), \
            f"TEA portrait should be River, got: {portrait_info}"

    def test_dev_gets_correct_character_portrait(self, project: Path) -> None:
        """Dev role must get Kaylee's portrait (from firefly theme)."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["dev"],
            theme="firefly",
        )

        portrait_info = orch.get_portrait_info("dev")
        assert portrait_info is not None
        assert "kaylee" in str(portrait_info.get("path", "")).lower()

    def test_reviewer_gets_correct_character_portrait(self, project: Path) -> None:
        """Reviewer role must get Inara's portrait (from firefly theme)."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["reviewer"],
            theme="firefly",
        )

        portrait_info = orch.get_portrait_info("reviewer")
        assert portrait_info is not None
        assert "inara" in str(portrait_info.get("path", "")).lower()

    def test_portrait_uses_active_theme(self, project: Path) -> None:
        """Portrait character must come from the theme passed to spawn_agent_panes."""
        orch = _make_orchestrator(project)

        # Spawn with explicit theme
        orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="firefly",
        )

        portrait_info = orch.get_portrait_info("tea")
        assert portrait_info is not None
        assert portrait_info.get("theme") == "firefly"


# ===========================================================================
# AC3: Portrait pane is sized appropriately (small, non-intrusive)
# ===========================================================================


class TestPortraitPaneSize:
    """AC3: Portrait pane must be small and non-intrusive."""

    def test_portrait_pane_size_is_small_percentage(self, project: Path) -> None:
        """Portrait pane should take a small fraction of the agent pane width."""
        orch = _make_orchestrator(project, use_tmux=True)

        with patch("pf.tmux.panes.split_pane") as mock_split, \
             patch("pf.tmux.registry.load_registry", return_value={"success": False}):
            mock_split.return_value = {"success": True, "data": "%99"}

            orch.spawn_agent_panes(
                scenario_phases=["tea"],
                theme="firefly",
            )

            # Story 162-31: de-vacuumed — same `if mock_split.called:` shield as
            # test_split_direction_is_horizontal. With no split the size
            # assertion never ran and the test claimed a guarantee it did not
            # provide.
            assert mock_split.called, (
                "portrait pane must be created by splitting the agent pane — "
                "split_pane was never called, so no size can be checked"
            )
            for c in mock_split.call_args_list:
                args = c[0] if c[0] else ()
                kwargs = c[1] if c[1] else {}
                size = args[3] if len(args) > 3 else kwargs.get("size_pct")
                direction = args[2] if len(args) > 2 else kwargs.get("direction")
                if direction == "h" and size is not None:
                    assert size <= 25, \
                        f"Portrait pane should be <=25% of width, got {size}%"
                    break
            else:
                pytest.fail("No horizontal split with size found for portrait pane")

    def test_portrait_uses_small_image_size(self, project: Path) -> None:
        """Portrait resolution should prefer 'small' size bucket for peloton panes."""
        orch = _make_orchestrator(project)

        with patch("pf.tui.portrait_resolver.resolve_portrait_path") as mock_resolve:
            mock_resolve.return_value = project / "fake-portrait.png"

            orch.spawn_agent_panes(
                scenario_phases=["tea"],
                theme="firefly",
            )

            # Previously the assertion sat behind `if mock_resolve.called:`, so
            # it passed vacuously whenever resolution was skipped entirely —
            # which is exactly what happened once the resolver went CDN-only
            # (162-5). Assert the call happened, then assert its arguments.
            assert mock_resolve.called, (
                "portrait resolution must be attempted for a themed agent"
            )
            kwargs = mock_resolve.call_args[1] or {}
            preferred_size = kwargs.get("preferred_size")
            assert preferred_size == "small", \
                f"Peloton portraits should use 'small' size, got: {preferred_size}"


# ===========================================================================
# AC4: Graceful fallback when no portrait/theme is configured
# ===========================================================================


class TestNoPortraitFallback:
    """AC4: Graceful fallback — no portrait, full CLI when theme is absent."""

    def test_no_theme_means_no_portrait_pane(self, project_no_theme: Path) -> None:
        """When no theme is configured, agent panes should have no portrait split."""
        orch = _make_orchestrator(project_no_theme)

        result = orch.spawn_agent_panes(
            scenario_phases=["tea", "dev"],
            theme=None,
        )

        assert result["success"]
        # CLI panes should exist
        assert orch.get_pane("tea") is not None
        assert orch.get_pane("dev") is not None
        # Portrait panes should NOT exist
        assert orch.get_portrait_pane("tea") is None
        assert orch.get_portrait_pane("dev") is None

    def test_theme_without_portraits_falls_back(self, tmp_path: Path) -> None:
        """If theme exists but portrait images are missing, skip portrait pane."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Theme YAML exists but no portrait images
        personas_dir = pf_dir / "personas" / "themes"
        personas_dir.mkdir(parents=True)
        (personas_dir / "sparse-theme.yaml").write_text(
            "name: sparse-theme\n"
            "agents:\n"
            "  tea:\n"
            "    character: Some Character\n"
            "    shortName: Some\n"
            "    ocean: {O: 3, C: 3, E: 3, A: 3, N: 3}\n"
        )
        (pf_dir / "config.local.yaml").write_text("theme: sparse-theme\n")

        orch = _make_orchestrator(tmp_path)

        result = orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="sparse-theme",
        )

        assert result["success"]
        assert orch.get_pane("tea") is not None
        # No portrait file exists, so no portrait pane should be created
        assert orch.get_portrait_pane("tea") is None

    def test_agent_not_in_theme_gets_no_portrait(self, project: Path) -> None:
        """An agent role not defined in the theme YAML gets no portrait."""
        orch = _make_orchestrator(project)

        result = orch.spawn_agent_panes(
            scenario_phases=["architect"],  # Not in firefly.yaml
            theme="firefly",
        )

        assert result["success"]
        assert orch.get_pane("architect") is not None
        assert orch.get_portrait_pane("architect") is None

    def test_spawn_still_succeeds_without_theme(self, project_no_theme: Path) -> None:
        """spawn_agent_panes must succeed even with no theme — just no portraits."""
        orch = _make_orchestrator(project_no_theme)

        result = orch.spawn_agent_panes(
            scenario_phases=["tea", "dev", "reviewer"],
            theme=None,
        )

        assert result["success"]
        assert len([p for p in orch.panes if "portrait" not in p.role]) >= 3

    def test_fallback_pane_gets_full_width(self, project_no_theme: Path) -> None:
        """Without portrait, the CLI pane should occupy the full width (no split)."""
        orch = _make_orchestrator(project_no_theme, use_tmux=True)

        with patch("pf.tmux.panes.split_pane") as mock_split, \
             patch("pf.tmux.registry.load_registry", return_value={"success": False}):
            mock_split.return_value = {"success": True, "data": "%99"}

            orch.spawn_agent_panes(
                scenario_phases=["tea"],
                theme=None,
            )

            # With no theme, no portrait splits should happen.
            # Only the agent pane allocation split should occur.
            portrait_splits = [
                c for c in mock_split.call_args_list
                if len(c[0]) > 2 and c[0][2] == "h"
                   or c[1].get("direction") == "h"
            ]
            assert len(portrait_splits) == 0, \
                "No horizontal portrait splits should occur without a theme"


# ===========================================================================
# Integration: teardown includes portrait panes
# ===========================================================================


class TestPortraitPaneTeardown:
    """Portrait panes must be cleaned up during teardown."""

    def test_teardown_kills_portrait_panes(self, project: Path) -> None:
        """teardown() must kill portrait panes along with CLI panes."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["tea", "dev"],
            theme="firefly",
        )

        all_pane_ids = {p.pane_id for p in orch.panes}
        assert len(all_pane_ids) >= 4, \
            f"Expected at least 4 panes (2 agents + 2 portraits), got {len(all_pane_ids)}"

        result = orch.teardown()

        assert result["success"]
        # All non-protected panes (including portraits) should be killed
        assert len(result["data"]["killed"]) >= 4

    def test_registry_entries_include_portrait_panes(self, project: Path) -> None:
        """get_registry_entries() must include portrait panes."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="firefly",
        )

        entries = orch.get_registry_entries()
        portrait_entries = [e for e in entries if "portrait" in e["role"]]
        assert len(portrait_entries) >= 1, \
            f"Registry must include portrait panes, got roles: {[e['role'] for e in entries]}"


# ===========================================================================
# Edge cases
# ===========================================================================


class TestPortraitEdgeCases:
    """Edge cases for portrait pane splitting."""

    def test_empty_phases_still_works(self, project: Path) -> None:
        """Empty scenario_phases returns error (existing behavior preserved)."""
        orch = _make_orchestrator(project)

        result = orch.spawn_agent_panes(
            scenario_phases=[],
            theme="firefly",
        )

        assert not result["success"]

    def test_single_agent_gets_portrait(self, project: Path) -> None:
        """A single agent should still get a portrait pane."""
        orch = _make_orchestrator(project)

        result = orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="firefly",
        )

        assert result["success"]
        assert orch.get_portrait_pane("tea") is not None

    def test_get_portrait_pane_returns_none_for_unknown_role(self, project: Path) -> None:
        """get_portrait_pane for a role that wasn't spawned returns None."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="firefly",
        )

        assert orch.get_portrait_pane("dev") is None

    def test_get_portrait_info_returns_none_for_unknown_role(self, project: Path) -> None:
        """get_portrait_info for a role that wasn't spawned returns None."""
        orch = _make_orchestrator(project)

        orch.spawn_agent_panes(
            scenario_phases=["tea"],
            theme="firefly",
        )

        assert orch.get_portrait_info("dev") is None
