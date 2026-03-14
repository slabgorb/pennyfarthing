"""Tests for Frame TUI TUI Cross-Panel Event Bus (Story 110-1).

Verifies:
  AC1: PanelEvent base message class and NavigateToFile event defined in events.py
  AC2: ChangedPanel renders selectable file list with arrow key navigation
  AC3: Enter on a changed file switches to DiffsPanel showing that file's diff
  AC4: Footer shows context-sensitive bindings per active panel
  AC5: Existing j/k/e/n/p bindings continue to work unchanged

Run with: python -m pytest tests/python/test_tui_event_bus.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

import pytest
from pf.tui.changed_panel import ChangedPanel
from pf.tui.diffs_panel import DiffsPanel
from pf.tui.client import FrameClient
from rich.console import Console
from textual.message import Message

# ---------------------------------------------------------------------------
# Test data fixtures
# ---------------------------------------------------------------------------

SAMPLE_SINGLE_REPO: dict[str, Any] = {
    "type": "init",
    "repos": [
        {
            "name": "pennyfarthing",
            "path": "/Users/dev/pennyfarthing",
            "branch": "feat/110-1",
            "clean": False,
            "ahead": 1,
            "behind": 0,
            "dirtyFiles": [
                {"status": " M", "path": "src/server.ts"},
                {"status": "??", "path": "src/new-file.ts"},
                {"status": " D", "path": "src/old-file.ts"},
            ],
        }
    ],
}

SAMPLE_MULTI_REPO: dict[str, Any] = {
    "type": "init",
    "repos": [
        {
            "name": "orchestrator",
            "path": "/Users/dev/pf-orchestrator",
            "branch": "main",
            "clean": False,
            "ahead": 0,
            "behind": 0,
            "dirtyFiles": [
                {"status": "M ", "path": "sprint/epic-110.yaml"},
            ],
        },
        {
            "name": "pennyfarthing",
            "path": "/Users/dev/pennyfarthing",
            "branch": "feat/110-1",
            "clean": False,
            "ahead": 2,
            "behind": 0,
            "dirtyFiles": [
                {"status": " M", "path": "src/panel.ts"},
                {"status": "A ", "path": "src/new-panel.ts"},
            ],
        },
    ],
}

SAMPLE_DIFF_MODIFIED = """\
diff --git a/src/app.py b/src/app.py
index abc1234..def5678 100644
--- a/src/app.py
+++ b/src/app.py
@@ -10,7 +10,8 @@ class App:
     def __init__(self):
         self.name = "test"
-        self.version = "1.0"
+        self.version = "2.0"
+        self.debug = True
         self.running = False"""

SAMPLE_DIFF_ADDED = """\
diff --git a/src/new_file.py b/src/new_file.py
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new_file.py
@@ -0,0 +1,3 @@
+def hello():
+    return "world"
+"""

SAMPLE_MULTI_FILE_DIFFS: dict[str, Any] = {
    "type": "init",
    "diffs": [
        {
            "path": "src/app.py",
            "diff": SAMPLE_DIFF_MODIFIED,
            "toolName": "Git",
            "timestamp": 1707900000,
            "status": "modified",
            "additions": 2,
            "deletions": 1,
        },
        {
            "path": "src/new_file.py",
            "diff": SAMPLE_DIFF_ADDED,
            "toolName": "Git",
            "timestamp": 1707900001,
            "status": "added",
            "additions": 3,
            "deletions": 0,
        },
    ],
}

SAMPLE_EMPTY_DIFFS: dict[str, Any] = {
    "type": "init",
    "diffs": [],
}


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


# ===========================================================================
# AC1: PanelEvent base message class and NavigateToFile event defined
# ===========================================================================


class TestPanelEventDefinition:
    """AC1: PanelEvent base message class defined in events.py."""

    def test_events_module_importable(self):
        """events module should be importable from bikerack package."""
        from pf.tui.events import PanelEvent

        assert PanelEvent is not None

    def test_panel_event_is_message_subclass(self):
        """PanelEvent should inherit from textual.message.Message."""
        from pf.tui.events import PanelEvent

        assert issubclass(PanelEvent, Message)

    def test_panel_event_can_be_instantiated(self):
        """PanelEvent should be instantiable as a base class."""
        from pf.tui.events import PanelEvent

        event = PanelEvent()
        assert isinstance(event, Message)


class TestNavigateToFileEvent:
    """AC1: NavigateToFile event defined in events.py."""

    def test_navigate_to_file_importable(self):
        """NavigateToFile should be importable from events module."""
        from pf.tui.events import NavigateToFile

        assert NavigateToFile is not None

    def test_navigate_to_file_is_panel_event_subclass(self):
        """NavigateToFile should inherit from PanelEvent."""
        from pf.tui.events import NavigateToFile, PanelEvent

        assert issubclass(NavigateToFile, PanelEvent)

    def test_navigate_to_file_is_message_subclass(self):
        """NavigateToFile should transitively inherit from Message."""
        from pf.tui.events import NavigateToFile

        assert issubclass(NavigateToFile, Message)

    def test_navigate_to_file_stores_path(self):
        """NavigateToFile should store the file path as an attribute."""
        from pf.tui.events import NavigateToFile

        event = NavigateToFile(path="src/server.ts")
        assert event.path == "src/server.ts"

    def test_navigate_to_file_path_is_string(self):
        """NavigateToFile.path should be a string."""
        from pf.tui.events import NavigateToFile

        event = NavigateToFile(path="src/app.py")
        assert isinstance(event.path, str)

    def test_navigate_to_file_different_paths(self):
        """NavigateToFile should work with various file paths."""
        from pf.tui.events import NavigateToFile

        paths = ["src/app.py", "sprint/epic-110.yaml", "tests/test_foo.py"]
        for p in paths:
            event = NavigateToFile(path=p)
            assert event.path == p


# ===========================================================================
# AC2: ChangedPanel renders selectable file list with arrow key navigation
# ===========================================================================


class TestChangedPanelSelectable:
    """AC2: ChangedPanel tracks selection state for file navigation."""

    def test_has_selected_index_attribute(self):
        """ChangedPanel should track which file is selected."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        assert hasattr(panel, "_selected_index"), (
            "ChangedPanel needs _selected_index to track file selection"
        )

    def test_default_selection_is_zero(self):
        """Default selected index should be 0 (first file)."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        assert panel._selected_index == 0

    def test_has_select_next_method(self):
        """ChangedPanel should expose select_next() for down-arrow navigation."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        assert hasattr(panel, "select_next"), (
            "ChangedPanel needs select_next() method"
        )

    def test_has_select_prev_method(self):
        """ChangedPanel should expose select_prev() for up-arrow navigation."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        assert hasattr(panel, "select_prev"), (
            "ChangedPanel needs select_prev() method"
        )

    def test_has_get_selected_path_method(self):
        """ChangedPanel should expose get_selected_path() to retrieve current file."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        assert hasattr(panel, "get_selected_path"), (
            "ChangedPanel needs get_selected_path() method"
        )


class TestChangedPanelArrowNavigation:
    """AC2: Arrow keys move selection between files."""

    def test_select_next_advances_index(self):
        """select_next() should move selection to the next file."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        panel.select_next()
        assert panel._selected_index == 1

    def test_select_prev_decrements_index(self):
        """select_prev() should move selection to the previous file."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        panel.select_next()  # index = 1
        panel.select_prev()  # index = 0
        assert panel._selected_index == 0

    def test_select_prev_does_not_go_below_zero(self):
        """select_prev() at index 0 should stay at 0."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        panel.select_prev()
        assert panel._selected_index == 0

    def test_select_next_clamps_at_last_file(self):
        """select_next() at last file should not exceed bounds."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        # 3 files: advance past all
        for _ in range(10):
            panel.select_next()
        assert panel._selected_index == 2  # last index for 3 files

    def test_get_selected_path_returns_first_file(self):
        """Default selection returns first file's path."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        path = panel.get_selected_path()
        assert path == "src/server.ts"

    def test_get_selected_path_after_navigation(self):
        """After select_next, get_selected_path returns next file."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        panel.select_next()
        path = panel.get_selected_path()
        assert path == "src/new-file.ts"

    def test_get_selected_path_returns_none_when_empty(self):
        """get_selected_path returns None when no files are loaded."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        path = panel.get_selected_path()
        assert path is None


class TestChangedPanelSelectionRendering:
    """AC2: Selected file is visually highlighted in the rendered output."""

    def test_selected_item_has_distinct_styling(self):
        """Selected file should have distinctive ANSI styling vs unselected files."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        result = panel.render_panel(SAMPLE_SINGLE_REPO)
        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()

        # Find lines for first file (selected) and second file (not selected)
        lines = raw.split("\n")
        selected_lines = [line for line in lines if "server.ts" in line]
        unselected_lines = [line for line in lines if "new-file.ts" in line]
        assert len(selected_lines) > 0, "Selected file not in output"
        assert len(unselected_lines) > 0, "Unselected file not in output"

        # Selected line should have MORE styling (reverse, background, bold+underline)
        # than unselected line — or different styling
        selected_escapes = selected_lines[0].count("\x1b[")
        unselected_escapes = unselected_lines[0].count("\x1b[")
        assert selected_escapes != unselected_escapes or (
            "\x1b[7m" in selected_lines[0]  # reverse video
        ), (
            "Selected item should have distinctive visual styling. "
            f"Selected: {selected_lines[0]!r}, Unselected: {unselected_lines[0]!r}"
        )

    def test_selection_updates_on_navigate(self):
        """Rendering after select_next should highlight the new selection."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)

        # Render with first file selected
        result1 = panel.render_panel(SAMPLE_SINGLE_REPO)
        output1 = _render_to_string(result1)

        # Navigate and re-render
        panel.select_next()
        result2 = panel.render_panel(SAMPLE_SINGLE_REPO)
        output2 = _render_to_string(result2)

        # The outputs should differ (different file highlighted)
        assert output1 != output2, (
            "Rendering should change when selection moves to a different file"
        )


class TestChangedPanelMultiRepoNavigation:
    """AC2: Files from multiple repos are all navigable."""

    def test_all_files_reachable_across_repos(self):
        """select_next should traverse files from all repos."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_MULTI_REPO)

        # Collect all reachable paths
        paths = []
        for _ in range(10):  # more than enough
            p = panel.get_selected_path()
            if p is None or p in paths:
                break
            paths.append(p)
            panel.select_next()

        # SAMPLE_MULTI_REPO has 1 + 2 = 3 files total
        assert len(paths) == 3, (
            f"Expected 3 navigable files across repos, got {len(paths)}: {paths}"
        )

    def test_multi_repo_includes_all_repo_files(self):
        """All file paths from all repos should be reachable."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_MULTI_REPO)

        paths = set()
        for _ in range(10):
            p = panel.get_selected_path()
            if p is None:
                break
            paths.add(p)
            panel.select_next()

        expected = {"sprint/epic-110.yaml", "src/panel.ts", "src/new-panel.ts"}
        assert paths == expected, f"Expected {expected}, got {paths}"


# ===========================================================================
# AC3: Enter on a changed file switches to DiffsPanel showing that file
# ===========================================================================


class TestChangedPanelSelectAction:
    """AC3: ChangedPanel has an action to activate the selected file."""

    def test_has_action_select_file(self):
        """ChangedPanel should define action_select_file for Enter key."""
        panel = ChangedPanel(client=MagicMock(spec=FrameClient))
        assert hasattr(panel, "action_select_file"), (
            "ChangedPanel needs action_select_file() for Enter key"
        )


class TestDiffsPanelNavigateToFile:
    """AC3: DiffsPanel can navigate to a specific file by path."""

    def test_has_navigate_to_file_method(self):
        """DiffsPanel should expose navigate_to_file(path) method."""
        panel = DiffsPanel(client=MagicMock(spec=FrameClient))
        assert hasattr(panel, "navigate_to_file"), (
            "DiffsPanel needs navigate_to_file(path) method"
        )

    def test_navigate_to_file_sets_correct_index(self):
        """navigate_to_file should jump to the matching file."""
        panel = DiffsPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_MULTI_FILE_DIFFS)
        panel.navigate_to_file("src/new_file.py")
        assert panel._current_file_index == 1, (
            "navigate_to_file('src/new_file.py') should set index to 1"
        )

    def test_navigate_to_file_first_file(self):
        """navigate_to_file should work for the first file."""
        panel = DiffsPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_MULTI_FILE_DIFFS)
        # Navigate away first
        panel._current_file_index = 1
        panel.navigate_to_file("src/app.py")
        assert panel._current_file_index == 0

    def test_navigate_to_unknown_file_stays_at_current(self):
        """If file not found in diffs, index should not change."""
        panel = DiffsPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_MULTI_FILE_DIFFS)
        original = panel._current_file_index
        panel.navigate_to_file("nonexistent.py")
        assert panel._current_file_index == original

    def test_navigate_renders_target_file(self):
        """After navigate_to_file, render_panel shows the target file's diff."""
        panel = DiffsPanel(client=MagicMock(spec=FrameClient))
        panel.on_mount()
        panel.handle_message(SAMPLE_MULTI_FILE_DIFFS)
        panel.navigate_to_file("src/new_file.py")
        result = panel.render_panel(SAMPLE_MULTI_FILE_DIFFS)
        output = _render_to_string(result)
        assert "new_file.py" in output, (
            "After navigate_to_file, DiffsPanel should show target file"
        )
        assert "hello" in output or "world" in output, (
            "DiffsPanel should render the target file's diff content"
        )


class TestAppNavigateToFileHandler:
    """AC3: App handles NavigateToFile by switching to DiffsPanel."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_app_switches_to_diffs_on_navigate(self, app):
        """When NavigateToFile is posted, app should switch to diffs panel."""
        from pf.tui.events import NavigateToFile

        async with app.run_test() as pilot:
            # Start on a different panel
            app.action_switch_panel("changed")
            await pilot.pause()
            assert app._focused_panel == "changed"

            # Post NavigateToFile from the changed panel
            changed = app.query_one("#panel-changed", ChangedPanel)
            changed.post_message(NavigateToFile(path="src/app.py"))
            await pilot.pause()

            assert app._focused_panel == "diffs", (
                "App should switch to diffs panel on NavigateToFile"
            )

    async def test_navigate_calls_diffs_navigate_to_file(self, app):
        """App should call DiffsPanel.navigate_to_file with the event path."""
        from pf.tui.events import NavigateToFile

        async with app.run_test() as pilot:
            diffs = app.query_one("#panel-diffs", DiffsPanel)
            diffs.navigate_to_file = MagicMock()

            changed = app.query_one("#panel-changed", ChangedPanel)
            changed.post_message(NavigateToFile(path="src/app.py"))
            await pilot.pause()

            diffs.navigate_to_file.assert_called_once_with("src/app.py")


# ===========================================================================
# AC4: Footer shows context-sensitive bindings per active panel
# ===========================================================================


class TestContextSensitiveBindings:
    """AC4: Panel-specific bindings visible when that panel is active."""

    def test_changed_panel_defines_bindings(self):
        """ChangedPanel should define BINDINGS for Enter and arrow navigation."""
        bindings = getattr(ChangedPanel, "BINDINGS", [])
        binding_keys = set()
        for b in bindings:
            if hasattr(b, "key"):
                binding_keys.add(b.key)
            elif isinstance(b, tuple) and len(b) >= 1:
                binding_keys.add(b[0])
        has_enter = "enter" in binding_keys or "return" in binding_keys
        assert has_enter, (
            f"ChangedPanel BINDINGS should include Enter key. "
            f"Found keys: {binding_keys}"
        )

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_changed_panel_bindings_visible_when_active(self, app):
        """When ChangedPanel is active, Enter binding should appear in footer."""
        async with app.run_test() as pilot:
            app.action_switch_panel("changed")
            await pilot.pause()

            # Query footer content for binding descriptions
            footer = app.query_one("Footer")
            # Textual Footer renders active bindings — we check that
            # the changed-specific bindings are included
            footer_text = str(footer.render()) if hasattr(footer, "render") else ""
            has_enter_hint = any(
                word in footer_text.lower()
                for word in ["enter", "select", "open", "navigate"]
            )
            assert has_enter_hint, (
                f"Footer should show Enter/select binding when ChangedPanel is active. "
                f"Footer text: {footer_text!r}"
            )

    async def test_sprint_bindings_visible_when_sprint_active(self, app):
        """When SprintPanel is active, j/k/e bindings should appear in footer."""
        async with app.run_test() as pilot:
            app.action_switch_panel("sprint")
            await pilot.pause()

            footer = app.query_one("Footer")
            footer_text = str(footer.render()) if hasattr(footer, "render") else ""
            has_jke_hint = any(
                word in footer_text.lower()
                for word in ["next epic", "prev epic", "toggle", "j", "k", "e"]
            )
            assert has_jke_hint, (
                f"Footer should show j/k/e bindings when SprintPanel is active. "
                f"Footer text: {footer_text!r}"
            )

    async def test_diffs_bindings_visible_when_diffs_active(self, app):
        """When DiffsPanel is active, n/p bindings should appear in footer."""
        async with app.run_test() as pilot:
            app.action_switch_panel("diffs")
            await pilot.pause()

            footer = app.query_one("Footer")
            footer_text = str(footer.render()) if hasattr(footer, "render") else ""
            has_np_hint = any(
                word in footer_text.lower()
                for word in ["next file", "prev file", "n", "p"]
            )
            assert has_np_hint, (
                f"Footer should show n/p bindings when DiffsPanel is active. "
                f"Footer text: {footer_text!r}"
            )


# ===========================================================================
# AC5: Existing j/k/e/n/p bindings continue to work unchanged
# ===========================================================================


class TestExistingBindingsRegression:
    """AC5: Existing keybindings must not be broken by event bus changes."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_j_navigates_next_epic_in_sprint(self, app):
        """j key should call SprintPanel.next_epic when sprint is active."""
        from pf.tui.sprint_panel import SprintPanel

        async with app.run_test() as pilot:
            app.action_switch_panel("sprint")
            await pilot.pause()

            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint.next_epic = MagicMock()

            await pilot.press("j")
            sprint.next_epic.assert_called_once()

    async def test_k_navigates_prev_epic_in_sprint(self, app):
        """k key should call SprintPanel.prev_epic when sprint is active."""
        from pf.tui.sprint_panel import SprintPanel

        async with app.run_test() as pilot:
            app.action_switch_panel("sprint")
            await pilot.pause()

            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint.prev_epic = MagicMock()

            await pilot.press("k")
            sprint.prev_epic.assert_called_once()

    async def test_e_toggles_epic_in_sprint(self, app):
        """e key should call SprintPanel.toggle_epic when sprint is active."""
        from pf.tui.sprint_panel import SprintPanel

        async with app.run_test() as pilot:
            app.action_switch_panel("sprint")
            await pilot.pause()

            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint.toggle_epic = MagicMock()

            await pilot.press("e")
            sprint.toggle_epic.assert_called_once()

    async def test_n_navigates_next_file_in_diffs(self, app):
        """n key should call DiffsPanel.next_file when diffs is active."""
        async with app.run_test() as pilot:
            app.action_switch_panel("diffs")
            await pilot.pause()

            diffs = app.query_one("#panel-diffs", DiffsPanel)
            diffs.next_file = MagicMock()

            await pilot.press("n")
            diffs.next_file.assert_called_once()

    async def test_p_navigates_prev_file_in_diffs(self, app):
        """p key should call DiffsPanel.prev_file when diffs is active."""
        async with app.run_test() as pilot:
            app.action_switch_panel("diffs")
            await pilot.pause()

            diffs = app.query_one("#panel-diffs", DiffsPanel)
            diffs.prev_file = MagicMock()

            await pilot.press("p")
            diffs.prev_file.assert_called_once()

    async def test_j_does_nothing_when_not_on_sprint(self, app):
        """j key should NOT trigger next_epic when on diffs panel."""
        from pf.tui.sprint_panel import SprintPanel

        async with app.run_test() as pilot:
            app.action_switch_panel("diffs")
            await pilot.pause()

            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint.next_epic = MagicMock()

            await pilot.press("j")
            sprint.next_epic.assert_not_called()

    async def test_n_does_nothing_when_not_on_diffs(self, app):
        """n key should NOT trigger next_file when on sprint panel."""
        async with app.run_test() as pilot:
            app.action_switch_panel("sprint")
            await pilot.pause()

            diffs = app.query_one("#panel-diffs", DiffsPanel)
            diffs.next_file = MagicMock()

            await pilot.press("n")
            diffs.next_file.assert_not_called()
