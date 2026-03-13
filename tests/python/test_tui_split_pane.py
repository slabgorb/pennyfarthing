"""Tests for BikeRack TUI split-pane layouts (Story 110-4).

Verifies:
  AC1: Refactor layout to Horizontal(left_pane, right_pane) container structure
  AC2: Shift+S keybinding to toggle split mode
  AC3: Tab switches focus between panes in split mode
  AC4: Named presets: sprint+diffs, changed+diffs, progress+debug
  AC5: /bc split <left> <right> command for custom splits
  AC6: Workflow-aware auto-layout via /ws/focus channel extension

Run with: python -m pytest tests/python/test_bikerack_split_pane.py -v
"""

import pytest
from textual.containers import Horizontal, VerticalScroll


# ---------------------------------------------------------------------------
# AC1: Horizontal split-pane container structure
# ---------------------------------------------------------------------------
class TestSplitPaneStructure:
    """AC1: Refactor layout to Horizontal(left_pane, right_pane)."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_split_containers_exist_when_split_active(self, app):
        """When split mode is active, left and right pane containers should exist."""
        async with app.run_test() as pilot:
            # Activate split mode
            await pilot.press("shift+s")
            left = app.query("#split-left")
            right = app.query("#split-right")
            assert len(left) > 0, "Split mode should create #split-left container"
            assert len(right) > 0, "Split mode should create #split-right container"

    async def test_split_containers_are_vertical_scroll(self, app):
        """Split panes should be VerticalScroll containers."""
        async with app.run_test() as pilot:
            await pilot.press("shift+s")
            left = app.query_one("#split-left")
            right = app.query_one("#split-right")
            assert isinstance(left, VerticalScroll), (
                f"Left pane should be VerticalScroll, got {type(left).__name__}"
            )
            assert isinstance(right, VerticalScroll), (
                f"Right pane should be VerticalScroll, got {type(right).__name__}"
            )

    async def test_split_panes_inside_horizontal_container(self, app):
        """Split panes should be children of a Horizontal container."""
        async with app.run_test() as pilot:
            await pilot.press("shift+s")
            split_container = app.query("#split-container")
            assert len(split_container) > 0, (
                "Split mode should mount a #split-container Horizontal"
            )
            container = app.query_one("#split-container")
            assert isinstance(container, Horizontal), (
                f"Split container should be Horizontal, got {type(container).__name__}"
            )

    async def test_each_pane_holds_one_panel(self, app):
        """In split mode, each pane should hold exactly one visible panel."""
        async with app.run_test() as pilot:
            await pilot.press("shift+s")
            left = app.query_one("#split-left")
            right = app.query_one("#split-right")
            left_visible = [c for c in left.children if c.display]
            right_visible = [c for c in right.children if c.display]
            assert len(left_visible) == 1, (
                f"Left pane should have 1 visible panel, got {len(left_visible)}"
            )
            assert len(right_visible) == 1, (
                f"Right pane should have 1 visible panel, got {len(right_visible)}"
            )

    async def test_split_mode_attribute_defaults_false(self, app):
        """App should have _split_mode attribute defaulting to False."""
        async with app.run_test():
            assert hasattr(app, "_split_mode"), (
                "TuiApp should have a _split_mode attribute"
            )
            assert app._split_mode is False, (
                "_split_mode should default to False"
            )


# ---------------------------------------------------------------------------
# AC2: Shift+S keybinding to toggle split mode
# ---------------------------------------------------------------------------
class TestSplitToggle:
    """AC2: Shift+S keybinding toggles split mode."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    def test_shift_s_binding_exists(self, app):
        """App BINDINGS should include Shift+S for split toggle."""
        binding_keys = [b.key for b in app.BINDINGS]
        # Textual represents Shift+S as "S" (uppercase) or "shift+s"
        has_split = any(k in ("S", "shift+s") for k in binding_keys)
        assert has_split, (
            f"BINDINGS should include Shift+S for split toggle, found: {binding_keys}"
        )

    async def test_shift_s_activates_split_mode(self, app):
        """Pressing Shift+S should activate split mode from single mode."""
        async with app.run_test() as pilot:
            # Start in single mode
            assert not getattr(app, "_split_mode", False), (
                "App should start in single mode"
            )
            await pilot.press("shift+s")
            assert app._split_mode is True, (
                "After Shift+S, _split_mode should be True"
            )

    async def test_shift_s_deactivates_split_mode(self, app):
        """Pressing Shift+S twice should return to single mode."""
        async with app.run_test() as pilot:
            await pilot.press("shift+s")  # activate
            await pilot.press("shift+s")  # deactivate
            assert app._split_mode is False, (
                "After second Shift+S, _split_mode should be False"
            )

    async def test_toggle_preserves_focused_panel(self, app):
        """Toggling split mode should keep the currently focused panel visible."""
        async with app.run_test() as pilot:
            # Switch to diffs panel first
            await pilot.press("3")  # key 3 = diffs
            focused_before = app._focused_panel
            await pilot.press("shift+s")  # enter split mode
            # Verify split mode actually activated first
            assert app._split_mode is True, (
                "Shift+S should have activated split mode"
            )
            # The focused panel should still be visible in one of the panes
            assert app._focused_panel == focused_before, (
                f"Focused panel should be preserved. Was {focused_before}, now {app._focused_panel}"
            )


# ---------------------------------------------------------------------------
# AC3: Tab switches focus between panes in split mode
# ---------------------------------------------------------------------------
class TestSplitPaneFocusCycling:
    """AC3: Tab switches focus between panes in split mode."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_tab_cycles_pane_focus_in_split_mode(self, app):
        """Tab key should cycle focus between left and right panes in split mode."""
        async with app.run_test() as pilot:
            await pilot.press("shift+s")  # enter split mode

            # Determine which pane is focused
            initial_pane = app._active_split_pane
            await pilot.press("tab")
            after_tab_pane = app._active_split_pane

            assert initial_pane != after_tab_pane, (
                f"Tab should switch pane focus. Was '{initial_pane}', still '{after_tab_pane}'"
            )

    async def test_tab_wraps_around_in_split_mode(self, app):
        """Tab should wrap from right pane back to left pane."""
        async with app.run_test() as pilot:
            await pilot.press("shift+s")  # enter split mode

            initial_pane = app._active_split_pane
            await pilot.press("tab")  # left → right (or right → left)
            await pilot.press("tab")  # wrap back
            after_two_tabs = app._active_split_pane

            assert initial_pane == after_two_tabs, (
                f"Two tabs should wrap back to original pane. Was '{initial_pane}', got '{after_two_tabs}'"
            )

    async def test_tab_in_single_mode_cycles_panels(self, app):
        """In single mode, Tab should continue cycling panels (not panes)."""
        async with app.run_test() as pilot:
            # In single mode, tab goes to next panel (existing behavior)
            initial = app._focused_panel
            await pilot.press("tab")
            after = app._focused_panel
            # Should move to next panel in registry, not toggle panes
            assert initial != after, (
                "In single mode, Tab should cycle panels, not toggle panes"
            )


# ---------------------------------------------------------------------------
# AC4: Named presets
# ---------------------------------------------------------------------------
class TestNamedPresets:
    """AC4: Named presets: sprint+diffs, changed+diffs, progress+debug."""

    def test_split_presets_dict_exists(self):
        """SPLIT_PRESETS dict should be defined in tui module."""
        from pf.tui.app import SPLIT_PRESETS

        assert isinstance(SPLIT_PRESETS, dict), "SPLIT_PRESETS should be a dict"

    def test_required_presets_defined(self):
        """All required presets should be defined."""
        from pf.tui.app import SPLIT_PRESETS

        required = ["sprint+diffs", "changed+diffs", "progress+debug"]
        for preset in required:
            assert preset in SPLIT_PRESETS, (
                f"Missing required preset: '{preset}'"
            )

    def test_preset_structure(self):
        """Each preset should map to a (left_panel, right_panel) tuple."""
        from pf.tui.app import SPLIT_PRESETS

        for name, value in SPLIT_PRESETS.items():
            assert isinstance(value, tuple) and len(value) == 2, (
                f"Preset '{name}' should be a (left, right) tuple, got {value}"
            )
            left, right = value
            assert isinstance(left, str), f"Preset '{name}' left should be str"
            assert isinstance(right, str), f"Preset '{name}' right should be str"

    def test_sprint_diffs_preset_values(self):
        """sprint+diffs preset should map to ('sprint', 'diffs')."""
        from pf.tui.app import SPLIT_PRESETS

        assert SPLIT_PRESETS["sprint+diffs"] == ("sprint", "diffs"), (
            f"sprint+diffs should be ('sprint', 'diffs'), got {SPLIT_PRESETS.get('sprint+diffs')}"
        )

    def test_changed_diffs_preset_values(self):
        """changed+diffs preset should map to ('changed', 'diffs')."""
        from pf.tui.app import SPLIT_PRESETS

        assert SPLIT_PRESETS["changed+diffs"] == ("changed", "diffs"), (
            f"changed+diffs should be ('changed', 'diffs'), got {SPLIT_PRESETS.get('changed+diffs')}"
        )

    def test_progress_debug_preset_values(self):
        """progress+debug preset should map to ('progress', 'debug')."""
        from pf.tui.app import SPLIT_PRESETS

        assert SPLIT_PRESETS["progress+debug"] == ("progress", "debug"), (
            f"progress+debug should be ('progress', 'debug'), got {SPLIT_PRESETS.get('progress+debug')}"
        )

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_apply_preset_activates_split(self, app):
        """Applying a preset should activate split mode with correct panels."""
        async with app.run_test():
            app.action_apply_split_preset("sprint+diffs")
            assert app._split_mode is True, (
                "Applying a preset should activate split mode"
            )

    async def test_apply_preset_sets_correct_panels(self, app):
        """Applying sprint+diffs should show sprint left, diffs right."""
        async with app.run_test():
            app.action_apply_split_preset("sprint+diffs")
            left = app.query_one("#split-left")
            right = app.query_one("#split-right")
            left_panels = [c for c in left.children if c.display]
            right_panels = [c for c in right.children if c.display]
            assert len(left_panels) == 1
            assert left_panels[0].id == "panel-sprint"
            assert len(right_panels) == 1
            assert right_panels[0].id == "panel-diffs"


# ---------------------------------------------------------------------------
# AC5: /bc split <left> <right> CLI command
# ---------------------------------------------------------------------------
class TestBcSplitCommand:
    """AC5: /bc split <left> <right> command for custom splits."""

    def test_split_command_exists_on_bc_group(self):
        """The bc Click group should have a 'split' subcommand."""
        from pf.bc.cli import bc

        commands = list(bc.commands.keys())
        assert "split" in commands, (
            f"bc group should have 'split' command, found: {commands}"
        )

    def test_split_command_accepts_two_panel_args(self):
        """pf bc split should accept left and right panel arguments."""
        from click.testing import CliRunner
        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["split", "sprint", "diffs"])
        assert result.exit_code == 0, (
            f"'bc split sprint diffs' should succeed, got exit {result.exit_code}: {result.output}"
        )

    def test_split_command_rejects_invalid_panel(self):
        """pf bc split should reject invalid panel names with a specific error."""
        from click.testing import CliRunner
        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["split", "sprint", "nonexistent"])
        assert result.exit_code != 0, (
            "bc split with invalid panel name should fail"
        )
        assert "invalid" in result.output.lower() or "nonexistent" in result.output.lower(), (
            f"Error should mention the invalid panel name, got: {result.output}"
        )

    def test_split_command_rejects_same_panel(self):
        """pf bc split should reject the same panel for both sides."""
        from click.testing import CliRunner
        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["split", "sprint", "sprint"])
        assert result.exit_code != 0, (
            "bc split with same panel for both sides should fail"
        )
        assert "same" in result.output.lower() or "duplicate" in result.output.lower(), (
            f"Error should mention duplicate panels, got: {result.output}"
        )

    def test_split_command_writes_to_config(self, tmp_path):
        """pf bc split should write split configuration to config.local.yaml."""
        from pf.bc.focus import _read_config
        from pf.bc.split import set_split_layout

        result = set_split_layout("sprint", "diffs", project_dir=tmp_path)
        assert result["success"], f"set_split_layout should succeed: {result}"

        _, config = _read_config(tmp_path)
        assert "split" in config, "Config should have 'split' key after bc split"
        assert config["split"]["left"] == "sprint"
        assert config["split"]["right"] == "diffs"

    def test_all_preset_panels_accepted_by_cli(self, tmp_path):
        """Every panel referenced in SPLIT_PRESETS must be valid for bc split."""
        from pf.bc.split import set_split_layout
        from pf.tui.app import SPLIT_PRESETS

        for preset_name, (left, right) in SPLIT_PRESETS.items():
            result = set_split_layout(left, right, project_dir=tmp_path)
            assert result["success"], (
                f"Preset '{preset_name}' uses panels ({left}, {right}) but "
                f"set_split_layout rejects them: {result.get('error')}"
            )

    def test_split_command_accepts_progress_panel(self, tmp_path):
        """pf bc split should accept 'progress' as a valid panel name."""
        from pf.bc.split import set_split_layout

        result = set_split_layout("progress", "debug", project_dir=tmp_path)
        assert result["success"], (
            f"'progress' should be a valid panel for bc split: {result.get('error')}"
        )


# ---------------------------------------------------------------------------
# AC6: Workflow-aware auto-layout via /ws/focus channel extension
# ---------------------------------------------------------------------------
class TestWorkflowAwareAutoLayout:
    """AC6: Workflow-aware auto-layout via /ws/focus channel extension."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_focus_message_with_split_activates_split_mode(self, app):
        """Focus message with split layout should activate split mode."""
        async with app.run_test() as pilot:
            # Simulate /ws/focus message with split layout format
            app._handle_focus_message({
                "type": "update",
                "focus": "split",
                "split": {"left": "sprint", "right": "diffs"},
            })
            await pilot.pause()
            assert app._split_mode is True, (
                "Focus message with split layout should activate split mode"
            )

    async def test_focus_message_with_split_sets_panels(self, app):
        """Focus message with split should set correct panels."""
        async with app.run_test() as pilot:
            app._handle_focus_message({
                "type": "update",
                "focus": "split",
                "split": {"left": "changed", "right": "diffs"},
            })
            await pilot.pause()
            left = app.query_one("#split-left")
            right = app.query_one("#split-right")
            left_panels = [c for c in left.children if c.display]
            right_panels = [c for c in right.children if c.display]
            assert left_panels[0].id == "panel-changed"
            assert right_panels[0].id == "panel-diffs"

    async def test_focus_message_with_preset_name(self, app):
        """Focus message with a preset name should apply the preset."""
        async with app.run_test() as pilot:
            app._handle_focus_message({
                "type": "update",
                "focus": "split:progress+debug",
            })
            await pilot.pause()
            assert app._split_mode is True, (
                "Preset focus message should activate split mode"
            )

    async def test_focus_message_single_panel_exits_split(self, app):
        """Regular single-panel focus message should exit split mode."""
        async with app.run_test() as pilot:
            # First enter split mode
            await pilot.press("shift+s")
            assert app._split_mode is True

            # Then receive a single-panel focus update
            app._handle_focus_message({
                "type": "update",
                "focus": "sprint",
            })
            await pilot.pause()
            assert app._split_mode is False, (
                "Single-panel focus message should exit split mode"
            )

    async def test_init_focus_message_ignored(self, app):
        """Init-type focus messages should not trigger split changes."""
        async with app.run_test() as pilot:
            # Verify the attribute exists first (feature must be implemented)
            assert hasattr(app, "_split_mode"), (
                "TuiApp should have a _split_mode attribute"
            )
            app._handle_focus_message({
                "type": "init",
                "focus": "split",
                "split": {"left": "sprint", "right": "diffs"},
            })
            await pilot.pause()
            # Init messages are ignored per existing behavior
            assert app._split_mode is False, (
                "Init focus messages should not activate split mode"
            )
