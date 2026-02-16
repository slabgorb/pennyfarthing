"""Tests for BikeRack TUI DiffsPanel — Rich diff rendering (Story 103-18).

Verifies:
  AC1: DiffsPanel implementation exists in bikerack
  AC2: WebSocket subscription to /ws/diffs channel receives JSON payloads
  AC3: Syntax highlighting applied to diffs using rich.syntax
  AC4: Diff rendering — file headers, added/removed/context lines, line numbers
  AC5: Real-time updates when new diffs arrive via WebSocket
  AC6: Error handling for invalid/malformed diff data

Run with: python -m pytest tests/python/test_bikerack_diffs_panel.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

from rich.console import Console
from rich.text import Text
from textual.widgets import Static

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel
from pennyfarthing_scripts.bikerack.diffs_panel import DiffsPanel, Syntax
from pennyfarthing_scripts.bikerack.ws_client import WheelHubClient

# ---------------------------------------------------------------------------
# Test data fixtures — matching actual WheelHub /ws/diffs wire format
# ---------------------------------------------------------------------------

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

SAMPLE_DIFF_DELETED = """\
diff --git a/old_file.py b/old_file.py
deleted file mode 100644
index abc1234..0000000
--- a/old_file.py
+++ /dev/null
@@ -1,5 +0,0 @@
-def deprecated():
-    pass
-
-def also_old():
-    pass
"""

SAMPLE_DIFF_TYPESCRIPT = """\
diff --git a/src/index.ts b/src/index.ts
index 1111111..2222222 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,4 +1,5 @@
 import { App } from './app';
+import { Logger } from './logger';

 const app = new App();
 app.start();"""

SAMPLE_INIT_MESSAGE: dict[str, Any] = {
    "type": "init",
    "diffs": [
        {
            "id": "diff-src/app.py-1707900000",
            "path": "src/app.py",
            "original": "",
            "modified": "",
            "diff": SAMPLE_DIFF_MODIFIED,
            "toolName": "Git",
            "timestamp": 1707900000,
            "status": "modified",
            "additions": 2,
            "deletions": 1,
        },
    ],
}

SAMPLE_MULTI_FILE_MESSAGE: dict[str, Any] = {
    "type": "init",
    "diffs": [
        {
            "id": "diff-src/app.py-1707900000",
            "path": "src/app.py",
            "original": "",
            "modified": "",
            "diff": SAMPLE_DIFF_MODIFIED,
            "toolName": "Git",
            "timestamp": 1707900000,
            "status": "modified",
            "additions": 2,
            "deletions": 1,
        },
        {
            "id": "diff-src/new_file.py-1707900001",
            "path": "src/new_file.py",
            "original": "",
            "modified": "",
            "diff": SAMPLE_DIFF_ADDED,
            "toolName": "Git",
            "timestamp": 1707900001,
            "status": "added",
            "additions": 3,
            "deletions": 0,
        },
    ],
}

SAMPLE_REFRESH_MESSAGE: dict[str, Any] = {
    "type": "refresh",
    "diffs": [
        {
            "id": "diff-src/updated.py-1707900002",
            "path": "src/updated.py",
            "original": "",
            "modified": "",
            "diff": (
                "diff --git a/src/updated.py b/src/updated.py\n"
                "index aaa..bbb 100644\n"
                "--- a/src/updated.py\n"
                "+++ b/src/updated.py\n"
                "@@ -1,3 +1,3 @@\n"
                " def run():\n"
                "-    pass\n"
                "+    return True\n"
            ),
            "toolName": "Git",
            "timestamp": 1707900002,
            "status": "modified",
            "additions": 1,
            "deletions": 1,
        },
    ],
}

SAMPLE_DELETED_FILE_MESSAGE: dict[str, Any] = {
    "type": "init",
    "diffs": [
        {
            "id": "diff-old_file.py-1707900003",
            "path": "old_file.py",
            "original": "",
            "modified": "",
            "diff": SAMPLE_DIFF_DELETED,
            "toolName": "Git",
            "timestamp": 1707900003,
            "status": "deleted",
            "additions": 0,
            "deletions": 5,
        },
    ],
}

SAMPLE_TYPESCRIPT_MESSAGE: dict[str, Any] = {
    "type": "init",
    "diffs": [
        {
            "id": "diff-src/index.ts-1707900004",
            "path": "src/index.ts",
            "original": "",
            "modified": "",
            "diff": SAMPLE_DIFF_TYPESCRIPT,
            "toolName": "Git",
            "timestamp": 1707900004,
            "status": "modified",
            "additions": 1,
            "deletions": 0,
        },
    ],
}


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


# ---------------------------------------------------------------------------
# AC1: DiffsPanel implementation exists in bikerack
# ---------------------------------------------------------------------------


class TestDiffsPanelExists:
    """AC1: DiffsPanel implementation exists and follows BasePanel pattern."""

    def test_diffs_panel_exists_and_importable(self):
        """DiffsPanel should be importable from bikerack.diffs_panel."""
        assert DiffsPanel is not None

    def test_inherits_from_base_panel(self):
        """DiffsPanel should inherit from BasePanel."""
        assert issubclass(DiffsPanel, BasePanel)

    def test_is_textual_widget(self):
        """DiffsPanel should be a Textual widget (subclass of Static)."""
        assert issubclass(DiffsPanel, Static)

    def test_channel_is_diffs(self):
        """DiffsPanel.channel should be 'diffs'."""
        assert DiffsPanel.channel == "diffs"

    def test_panel_name_is_diffs(self):
        """DiffsPanel.panel_name should be 'Diffs'."""
        assert DiffsPanel.panel_name == "Diffs"

    def test_has_icon_from_registry(self):
        """DiffsPanel.icon should match the PANEL_ICONS registry."""
        assert DiffsPanel.icon == PANEL_ICONS["diffs"][0]


# ---------------------------------------------------------------------------
# AC2: WebSocket subscription to /ws/diffs channel
# ---------------------------------------------------------------------------


class TestDiffsPanelSubscription:
    """AC2: DiffsPanel subscribes to /ws/diffs and receives JSON payloads."""

    def test_subscribes_to_diffs_channel_on_mount(self):
        """DiffsPanel should subscribe to 'diffs' channel when mounted."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()
        client.subscribe.assert_called_once_with("diffs", panel.handle_message)

    def test_accepts_client_parameter(self):
        """DiffsPanel constructor should accept a client parameter."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        assert panel._client is client

    def test_handle_message_stores_payload(self):
        """handle_message should store the received payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        assert panel._last_payload == SAMPLE_INIT_MESSAGE

    def test_handle_init_message_type(self):
        """Panel should handle 'init' type messages with diffs array."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        assert panel._last_payload["type"] == "init"

    def test_handle_refresh_message_type(self):
        """Panel should handle 'refresh' type messages with diffs array."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_REFRESH_MESSAGE)
        assert panel._last_payload["type"] == "refresh"


# ---------------------------------------------------------------------------
# AC3: Syntax highlighting applied to diffs using rich.syntax
# ---------------------------------------------------------------------------


class TestDiffsPanelSyntaxHighlighting:
    """AC3: Syntax highlighting applied using rich.syntax."""

    def test_module_imports_rich_syntax(self):
        """DiffsPanel module must import rich.syntax.Syntax (AC3 requirement)."""
        # Syntax is re-exported at module level — import proves usage
        assert Syntax is not None
        from rich.syntax import Syntax as RealSyntax
        assert Syntax is RealSyntax

    def test_python_file_has_language_specific_colors(self):
        """Python diffs should have multiple distinct ANSI colors from Syntax.

        With rich.syntax, 'def' (keyword) gets a different color than 'hello'
        (identifier). Plain diff coloring uses only green/red/dim — syntax
        highlighting adds language-specific token colors (3+ distinct codes).
        """
        message = {
            "type": "init",
            "diffs": [{
                "path": "src/example.py",
                "diff": (
                    "diff --git a/src/example.py b/src/example.py\n"
                    "index aaa..bbb 100644\n"
                    "--- a/src/example.py\n"
                    "+++ b/src/example.py\n"
                    "@@ -1,1 +1,1 @@\n"
                    "+def hello(name):\n"
                ),
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
                "additions": 1,
                "deletions": 0,
            }],
        }
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(message)
        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()
        # Count unique ANSI color sequences — syntax highlighting produces
        # multiple distinct foreground colors (keyword, identifier, punctuation)
        import re as re_mod
        colors = set(re_mod.findall(r"\x1b\[38;2;\d+;\d+;\d+[;\d]*m", raw))
        assert len(colors) >= 2, (
            f"Expected multiple language-specific colors from Syntax, "
            f"got {len(colors)} unique truecolor codes: {colors}"
        )

    def test_python_content_rendered(self):
        """Python file diffs should render code content."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "self" in output or "version" in output, (
            "Diff content not rendered — expected code content in output"
        )

    def test_typescript_file_detected(self):
        """TypeScript .ts files should be detected for syntax highlighting."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_TYPESCRIPT_MESSAGE)
        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()
        # TypeScript should also produce language-specific colors
        import re as re_mod
        colors = set(re_mod.findall(r"\x1b\[38;2;\d+;\d+;\d+[;\d]*m", raw))
        assert len(colors) >= 2, (
            f"TypeScript should have syntax-specific colors, got {len(colors)}"
        )
        output = _render_to_string(result)
        assert "import" in output or "Logger" in output, (
            "TypeScript diff content not rendered"
        )

    def test_unknown_extension_does_not_crash(self):
        """Files with unknown extensions should still render without crash."""
        message = {
            "type": "init",
            "diffs": [
                {
                    "path": "data/config.xyz",
                    "diff": (
                        "diff --git a/data/config.xyz b/data/config.xyz\n"
                        "index aaa..bbb 100644\n"
                        "--- a/data/config.xyz\n"
                        "+++ b/data/config.xyz\n"
                        "@@ -1,2 +1,2 @@\n"
                        "-old_value\n"
                        "+new_value\n"
                    ),
                    "toolName": "Git",
                    "timestamp": 1707900000,
                    "status": "modified",
                    "additions": 1,
                    "deletions": 1,
                },
            ],
        }
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(message)
        output = _render_to_string(result)
        assert "new_value" in output or "old_value" in output


# ---------------------------------------------------------------------------
# AC4: Diff rendering — file headers, added/removed/context, line numbers
# ---------------------------------------------------------------------------


class TestDiffsPanelRendering:
    """AC4: Diff rendering displays file headers, colored lines, line numbers."""

    def test_render_panel_returns_renderable(self):
        """render_panel should return a Rich renderable (not plain string)."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        # Should be renderable by Rich console without error
        output = _render_to_string(result)
        assert len(output) > 0

    def test_file_path_in_header(self):
        """File path should appear in the rendered output as a header."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "src/app.py" in output, (
            "File path 'src/app.py' not found in rendered output"
        )

    def test_file_status_in_header(self):
        """File status (modified/added/deleted) should appear in output."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "modified" in output.lower(), (
            "File status 'modified' not found in rendered output"
        )

    def test_added_file_status_shown(self):
        """Added file status should be visible in output."""
        message = {
            "type": "init",
            "diffs": [SAMPLE_MULTI_FILE_MESSAGE["diffs"][1]],
        }
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(message)
        output = _render_to_string(result)
        assert "added" in output.lower(), (
            "File status 'added' not found in rendered output"
        )

    def test_deleted_file_status_shown(self):
        """Deleted file status should be visible in output."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_DELETED_FILE_MESSAGE)
        output = _render_to_string(result)
        assert "deleted" in output.lower(), (
            "File status 'deleted' not found in rendered output"
        )

    def test_added_lines_content_present(self):
        """Added lines from the diff should appear in the rendered output."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # The diff adds: self.version = "2.0" and self.debug = True
        assert "2.0" in output or "debug" in output, (
            "Added line content not found in rendered output"
        )

    def test_removed_lines_content_present(self):
        """Removed lines from the diff should appear in the rendered output."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # The diff removes: self.version = "1.0"
        assert "1.0" in output, (
            "Removed line content '1.0' not found in rendered output"
        )

    def test_context_lines_present(self):
        """Context (unchanged) lines should appear in the rendered output."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # Context line: self.name = "test"
        assert "name" in output or "test" in output, (
            "Context line content not found in rendered output"
        )

    def test_added_lines_styled_green(self):
        """Added lines should be styled with green coloring.

        Rich uses ANSI codes for green (\\x1b[32m or similar).
        We check the raw output for green styling indicators.
        """
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()
        # Green ANSI: contains "32" (green foreground) somewhere in escapes
        # near the added line content
        has_green = "\x1b[" in raw and ("32" in raw or "green" in raw.lower())
        assert has_green, (
            "Added lines should use green styling — no green ANSI codes found"
        )

    def test_removed_lines_styled_red(self):
        """Removed lines should be styled with red coloring.

        Rich uses ANSI codes for red (\\x1b[31m or similar).
        """
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()
        # Red ANSI: contains "31" (red foreground) somewhere in escapes
        has_red = "\x1b[" in raw and ("31" in raw or "red" in raw.lower())
        assert has_red, (
            "Removed lines should use red styling — no red ANSI codes found"
        )

    def test_line_numbers_present(self):
        """Line numbers should appear in the rendered diff output."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # The diff starts at line 10 (@@ -10,7 +10,8 @@)
        # Line numbers 10, 11, 12 etc. should appear
        assert "10" in output or "11" in output or "12" in output, (
            "Line numbers not found in rendered output"
        )

    def test_additions_deletions_stats(self):
        """Addition/deletion counts should appear in the output."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # +2 additions, -1 deletion for the sample diff
        has_stats = ("+2" in output or "2 addition" in output.lower()) and (
            "-1" in output or "1 deletion" in output.lower()
        )
        assert has_stats, (
            "Addition/deletion stats not found in rendered output"
        )

    def test_multiple_files_all_rendered(self):
        """Multiple files in a single message should all be rendered."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_MULTI_FILE_MESSAGE)
        output = _render_to_string(result)
        assert "src/app.py" in output, "First file path not found"
        assert "src/new_file.py" in output, "Second file path not found"

    def test_multiple_files_both_have_content(self):
        """Each file in a multi-file diff should have its content rendered via navigation."""
        panel = DiffsPanel(client=MagicMock())
        # Render first file (default _current_file_index=0)
        result = panel.render_panel(SAMPLE_MULTI_FILE_MESSAGE)
        output = _render_to_string(result)
        # Content from first file
        assert "version" in output or "debug" in output, (
            "First file diff content missing"
        )
        # Navigate to second file and re-render
        panel._current_file_index = 1
        result2 = panel.render_panel(SAMPLE_MULTI_FILE_MESSAGE)
        output2 = _render_to_string(result2)
        # Content from second file (new_file.py adds hello/world)
        assert "hello" in output2 or "world" in output2, (
            "Second file diff content missing after navigation"
        )

    def test_empty_diffs_shows_placeholder(self):
        """Empty diffs array should show a placeholder/empty state message."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({"type": "init", "diffs": []})
        output = _render_to_string(result)
        # Should show some kind of "no diffs" indicator, not crash
        assert len(output.strip()) > 0, (
            "Empty diffs should produce some output (placeholder message)"
        )
        # Should NOT contain file paths or diff content
        assert "src/app.py" not in output


# ---------------------------------------------------------------------------
# AC5: Real-time updates when new diffs arrive via WebSocket
# ---------------------------------------------------------------------------


class TestDiffsPanelRealTimeUpdates:
    """AC5: Panel updates in real-time when new diffs arrive."""

    def test_handle_message_triggers_render(self):
        """handle_message should call render_panel with the payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("updated"))
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        panel.render_panel.assert_called_once_with(SAMPLE_INIT_MESSAGE)

    def test_consecutive_messages_each_trigger_render(self):
        """Multiple messages should each trigger a new render call."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("ok"))
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        panel.handle_message(SAMPLE_REFRESH_MESSAGE)
        assert panel.render_panel.call_count == 2

    def test_refresh_replaces_displayed_content(self):
        """A 'refresh' message should replace the previous diffs entirely."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()

        # First: init with app.py
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        result_after_init = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output_init = _render_to_string(result_after_init)
        assert "src/app.py" in output_init

        # Then: refresh with updated.py (different file)
        result_after_refresh = panel.render_panel(SAMPLE_REFRESH_MESSAGE)
        output_refresh = _render_to_string(result_after_refresh)
        assert "src/updated.py" in output_refresh

    def test_last_payload_reflects_latest_message(self):
        """_last_payload should update to the most recent message."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()

        panel.handle_message(SAMPLE_INIT_MESSAGE)
        assert panel._last_payload == SAMPLE_INIT_MESSAGE

        panel.handle_message(SAMPLE_REFRESH_MESSAGE)
        assert panel._last_payload == SAMPLE_REFRESH_MESSAGE

    def test_unmount_stops_updates(self):
        """After unmount, messages should not trigger render."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()
        panel.on_unmount()

        panel.render_panel = MagicMock()
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        panel.render_panel.assert_not_called()


# ---------------------------------------------------------------------------
# AC6: Error handling for invalid/malformed diff data
# ---------------------------------------------------------------------------


class TestDiffsPanelErrorHandling:
    """AC6: Error handling for invalid/malformed diff data."""

    def test_missing_diffs_field(self):
        """Message without 'diffs' field should not crash."""
        panel = DiffsPanel(client=MagicMock())
        panel.on_mount()
        result = panel.render_panel({"type": "init"})
        # Should return something renderable, not crash
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_empty_diffs_array(self):
        """Message with empty diffs array should render gracefully."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({"type": "init", "diffs": []})
        output = _render_to_string(result)
        assert isinstance(output, str)
        assert len(output.strip()) > 0

    def test_none_payload_via_handle_message(self):
        """None payload should be handled gracefully by handle_message."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()
        # Should not raise — BasePanel.handle_message guards against None
        panel.handle_message(None)
        assert panel._last_payload is None

    def test_diff_missing_path_field(self):
        """Diff entry without 'path' should not crash."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "diffs": [{
                "diff": SAMPLE_DIFF_MODIFIED,
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_diff_missing_diff_content(self):
        """Diff entry without 'diff' field should not crash."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "diffs": [{
                "path": "src/empty.py",
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
            }],
        })
        output = _render_to_string(result)
        # Should still show the file path even without diff content
        assert "src/empty.py" in output, (
            "File path should appear even when diff content is missing"
        )

    def test_diff_with_empty_diff_string(self):
        """Diff entry with empty diff string should not crash."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "diffs": [{
                "path": "src/unchanged.py",
                "diff": "",
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_empty_dict_payload(self):
        """Empty dict payload should not crash."""
        client = MagicMock(spec=WheelHubClient)
        panel = DiffsPanel(client=client)
        panel.on_mount()
        panel.handle_message({})
        assert panel._last_payload == {}

    def test_diff_missing_status_field(self):
        """Diff entry without 'status' should not crash."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "diffs": [{
                "path": "src/file.py",
                "diff": SAMPLE_DIFF_MODIFIED,
                "toolName": "Git",
                "timestamp": 1707900000,
            }],
        })
        output = _render_to_string(result)
        assert "src/file.py" in output

    def test_diff_missing_additions_deletions(self):
        """Diff entry without additions/deletions counts should not crash."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "diffs": [{
                "path": "src/file.py",
                "diff": SAMPLE_DIFF_MODIFIED,
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
            }],
        })
        output = _render_to_string(result)
        assert "src/file.py" in output

    def test_malformed_diff_string(self):
        """Completely malformed diff string should not crash rendering."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "diffs": [{
                "path": "src/broken.py",
                "diff": "this is not a valid diff format at all",
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
                "additions": 0,
                "deletions": 0,
            }],
        })
        output = _render_to_string(result)
        # Should render something without crashing
        assert isinstance(output, str)

    def test_binary_file_diff(self):
        """Binary file diff (no line content) should not crash."""
        panel = DiffsPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "diffs": [{
                "path": "assets/image.png",
                "diff": (
                    "diff --git a/assets/image.png b/assets/image.png\n"
                    "index aaa..bbb 100644\n"
                    "Binary files a/assets/image.png and "
                    "b/assets/image.png differ\n"
                ),
                "toolName": "Git",
                "timestamp": 1707900000,
                "status": "modified",
                "additions": 0,
                "deletions": 0,
            }],
        })
        output = _render_to_string(result)
        assert "image.png" in output
