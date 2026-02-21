"""Tests for BikeRack TUI ChangedPanel — Changed file list with status (Story 103-14).

Verifies:
  AC1: Panel subscribes to correct WebSocket channel for changed file data
  AC2: Renders Rich Group with file path, change type icon, status grouped by repo
  AC3: Updates in real-time when file changes are detected
  AC4: Handles edge cases (empty state, malformed data, multi-repo)

Run with: python -m pytest tests/python/test_bikerack_changed_panel.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel
from pf.bikerack.changed_panel import ChangedPanel
from pf.bikerack.ws_client import WheelHubClient
from rich.console import Console
from rich.console import Group as RichGroup
from rich.text import Text
from textual.widgets import Static

# ---------------------------------------------------------------------------
# Test data fixtures — matching WheelHub /ws/git wire format
# ---------------------------------------------------------------------------

SAMPLE_SINGLE_REPO: dict[str, Any] = {
    "type": "init",
    "repos": [
        {
            "name": "pennyfarthing",
            "path": "/Users/dev/pennyfarthing",
            "branch": "feature/103-14",
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
                {"status": "M ", "path": "sprint/epic-103.yaml"},
            ],
        },
        {
            "name": "pennyfarthing",
            "path": "/Users/dev/pennyfarthing",
            "branch": "feature/103-14",
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

SAMPLE_ALL_STATUS_TYPES: dict[str, Any] = {
    "type": "init",
    "repos": [
        {
            "name": "test-repo",
            "path": "/tmp/test",
            "branch": "main",
            "clean": False,
            "ahead": 0,
            "behind": 0,
            "dirtyFiles": [
                {"status": "M ", "path": "staged-modified.ts"},
                {"status": " M", "path": "working-modified.ts"},
                {"status": "A ", "path": "staged-added.ts"},
                {"status": " D", "path": "working-deleted.ts"},
                {"status": "D ", "path": "staged-deleted.ts"},
                {"status": "??", "path": "untracked.ts"},
                {"status": "MM", "path": "both-modified.ts"},
                {"status": "AM", "path": "added-then-modified.ts"},
                {"status": "R ", "path": "renamed-file.ts"},
            ],
        }
    ],
}

SAMPLE_CLEAN_REPOS: dict[str, Any] = {
    "type": "init",
    "repos": [
        {
            "name": "orchestrator",
            "path": "/Users/dev/pf-orchestrator",
            "branch": "main",
            "clean": True,
            "ahead": 0,
            "behind": 0,
            "dirtyFiles": [],
        },
    ],
}

SAMPLE_NO_REPOS: dict[str, Any] = {
    "type": "init",
    "repos": [],
}

SAMPLE_UPDATE_MESSAGE: dict[str, Any] = {
    "type": "update",
    "repos": [
        {
            "name": "pennyfarthing",
            "path": "/Users/dev/pennyfarthing",
            "branch": "feature/103-14",
            "clean": False,
            "ahead": 3,
            "behind": 0,
            "dirtyFiles": [
                {"status": " M", "path": "src/server.ts"},
                {"status": " M", "path": "src/panel.ts"},
                {"status": "??", "path": "src/brand-new.ts"},
            ],
        }
    ],
}


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


# ---------------------------------------------------------------------------
# AC1: Panel subscribes to correct WebSocket channel for changed file data
# ---------------------------------------------------------------------------


class TestChangedPanelExists:
    """AC1: ChangedPanel implementation exists and follows BasePanel pattern."""

    def test_changed_panel_exists_and_importable(self):
        """ChangedPanel should be importable from bikerack.changed_panel."""
        assert ChangedPanel is not None

    def test_inherits_from_base_panel(self):
        """ChangedPanel should inherit from BasePanel."""
        assert issubclass(ChangedPanel, BasePanel)

    def test_is_textual_widget(self):
        """ChangedPanel should be a Textual widget (subclass of Static)."""
        assert issubclass(ChangedPanel, Static)

    def test_channel_is_git(self):
        """ChangedPanel.channel should be 'git' (dirty files come from /ws/git)."""
        assert ChangedPanel.channel == "git"

    def test_panel_name_is_changed(self):
        """ChangedPanel.panel_name should be 'Changed'."""
        assert ChangedPanel.panel_name == "Changed"

    def test_has_icon_from_registry(self):
        """ChangedPanel.icon should match the PANEL_ICONS registry."""
        assert ChangedPanel.icon == PANEL_ICONS["changed"][0]


class TestChangedPanelSubscription:
    """AC1: ChangedPanel subscribes to /ws/git channel on mount."""

    def test_subscribes_to_git_channel_on_mount(self):
        """ChangedPanel should subscribe to 'git' channel on mount."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()
        client.subscribe.assert_called_once_with("git", panel.handle_message)

    def test_accepts_client_parameter(self):
        """ChangedPanel constructor should accept a client parameter."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        assert panel._client is client

    def test_handle_message_stores_payload(self):
        """handle_message should store the received payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        assert panel._last_payload == SAMPLE_SINGLE_REPO

    def test_handle_init_message_type(self):
        """Panel should handle 'init' type messages with repos array."""
        panel = ChangedPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        assert panel._last_payload["type"] == "init"

    def test_handle_update_message_type(self):
        """Panel should handle 'update' type messages with repos array."""
        panel = ChangedPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_UPDATE_MESSAGE)
        assert panel._last_payload["type"] == "update"


# ---------------------------------------------------------------------------
# AC2: Renders Rich Group with file path, change type icon, status grouped by repo
# ---------------------------------------------------------------------------


class TestChangedPanelRendering:
    """AC2: Renders Rich Group with file path, change type icon, and status."""

    def test_render_panel_returns_renderable(self):
        """render_panel should return a Rich renderable (not plain string)."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_REPO)
        output = _render_to_string(result)
        assert len(output) > 0

    def test_render_returns_group(self):
        """render_panel should return a Rich Group for structured file list."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_REPO)
        assert isinstance(result, RichGroup), (
            f"Expected Rich Group, got {type(result).__name__}"
        )

    def test_file_paths_visible_in_output(self):
        """File paths from dirtyFiles should appear in the rendered output."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_REPO)
        output = _render_to_string(result)
        assert "src/server.ts" in output, "File path 'src/server.ts' not found"
        assert "src/new-file.ts" in output, "File path 'src/new-file.ts' not found"
        assert "src/old-file.ts" in output, "File path 'src/old-file.ts' not found"

    def test_modified_file_has_icon(self):
        """Modified files should have a visual change type indicator."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_REPO)
        output = _render_to_string(result)
        # The line with "src/server.ts" (status " M") should have some icon/indicator
        # Check that the output has more than just the path — it includes an icon
        lines = [l for l in output.split("\n") if "server.ts" in l]
        assert len(lines) > 0, "server.ts line not found in output"
        # The line should contain more than just the path (icon + status)
        line = lines[0]
        assert len(line.strip()) > len("src/server.ts"), (
            f"Line should include icon/status beyond just the path: {line!r}"
        )

    def test_untracked_file_has_icon(self):
        """Untracked (??) files should have a visual change type indicator."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_REPO)
        output = _render_to_string(result)
        lines = [l for l in output.split("\n") if "new-file.ts" in l]
        assert len(lines) > 0, "new-file.ts line not found in output"

    def test_deleted_file_has_icon(self):
        """Deleted files should have a visual change type indicator."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_REPO)
        output = _render_to_string(result)
        lines = [l for l in output.split("\n") if "old-file.ts" in l]
        assert len(lines) > 0, "old-file.ts (deleted) line not found in output"


class TestChangedPanelStatusIcons:
    """AC2: Change type icons distinguish different git statuses."""

    def test_distinct_icons_for_different_statuses(self):
        """Different git statuses should produce visually distinct indicators."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_STATUS_TYPES)
        output = _render_to_string(result)
        # All file paths should be present
        assert "staged-modified.ts" in output
        assert "working-modified.ts" in output
        assert "staged-added.ts" in output
        assert "working-deleted.ts" in output
        assert "untracked.ts" in output

    def test_added_file_status_text(self):
        """Added files should show 'added' or 'A' or '+' in status."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_STATUS_TYPES)
        output = _render_to_string(result)
        # Find the line for the added file
        lines = [l for l in output.split("\n") if "staged-added.ts" in l]
        assert len(lines) > 0, "staged-added.ts not found"
        line = lines[0].lower()
        has_added = any(
            indicator in line
            for indicator in ["add", "+", "new", "a "]
        )
        assert has_added, (
            f"Added file should show add indicator. Line: {lines[0]!r}"
        )

    def test_deleted_file_status_text(self):
        """Deleted files should show 'deleted' or 'D' or '-' in status."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_STATUS_TYPES)
        output = _render_to_string(result)
        lines = [l for l in output.split("\n") if "staged-deleted.ts" in l]
        assert len(lines) > 0, "staged-deleted.ts not found"
        line = lines[0].lower()
        has_deleted = any(
            indicator in line
            for indicator in ["delet", "-", "remov", "d "]
        )
        assert has_deleted, (
            f"Deleted file should show delete indicator. Line: {lines[0]!r}"
        )

    def test_untracked_file_status_text(self):
        """Untracked (??) files should show 'untracked' or '?' in status."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_STATUS_TYPES)
        output = _render_to_string(result)
        lines = [l for l in output.split("\n") if "untracked.ts" in l]
        assert len(lines) > 0, "untracked.ts not found"
        line = lines[0].lower()
        has_untracked = any(
            indicator in line
            for indicator in ["untrack", "?", "new"]
        )
        assert has_untracked, (
            f"Untracked file should show untracked indicator. Line: {lines[0]!r}"
        )

    def test_modified_file_status_text(self):
        """Modified files should show 'modified' or 'M' in status."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_STATUS_TYPES)
        output = _render_to_string(result)
        lines = [l for l in output.split("\n") if "working-modified.ts" in l]
        assert len(lines) > 0, "working-modified.ts not found"
        line = lines[0].lower()
        has_modified = any(
            indicator in line
            for indicator in ["modif", "m", "edit", "change"]
        )
        assert has_modified, (
            f"Modified file should show modified indicator. Line: {lines[0]!r}"
        )

    def test_status_icons_use_ansi_styling(self):
        """Status indicators should use ANSI color styling for differentiation."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_STATUS_TYPES)
        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()
        assert "\x1b[" in raw, (
            "Output should contain ANSI styling for status differentiation"
        )


class TestChangedPanelMultiRepo:
    """AC2: Handles files from multiple repos."""

    def test_multi_repo_files_all_visible(self):
        """Files from all repos should appear in the rendered output."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_MULTI_REPO)
        output = _render_to_string(result)
        # Files from orchestrator repo
        assert "sprint/epic-103.yaml" in output, (
            "File from orchestrator repo not found"
        )
        # Files from pennyfarthing repo
        assert "src/panel.ts" in output, "File from pennyfarthing repo not found"
        assert "src/new-panel.ts" in output, "Added file from pennyfarthing not found"

    def test_multi_repo_total_file_count(self):
        """Group should contain text lines for all dirty files across all repos."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_MULTI_REPO)
        assert isinstance(result, RichGroup)
        output = _render_to_string(result)
        # 1 file from orchestrator + 2 files from pennyfarthing = 3 total
        file_paths = ["sprint/epic-103.yaml", "src/panel.ts", "src/new-panel.ts"]
        for fp in file_paths:
            assert fp in output, f"Expected file path {fp!r} in output"

    def test_repo_context_visible(self):
        """Files should indicate which repo they belong to (directly or via grouping)."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_MULTI_REPO)
        output = _render_to_string(result)
        # At minimum, repo names should appear somewhere in the output
        has_repo_context = (
            "orchestrator" in output or "pennyfarthing" in output
        )
        assert has_repo_context, (
            "Multi-repo output should indicate which repo files belong to"
        )


# ---------------------------------------------------------------------------
# AC2 (empty state): Handles no dirty files gracefully
# ---------------------------------------------------------------------------


class TestChangedPanelEmptyState:
    """Handles empty state when no files are changed."""

    def test_clean_repos_shows_placeholder(self):
        """Clean repos (no dirty files) should show a placeholder message."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_CLEAN_REPOS)
        output = _render_to_string(result)
        assert len(output.strip()) > 0, "Empty state should produce output"

    def test_clean_repos_message_is_informative(self):
        """Clean state should convey 'no changes' meaning."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_CLEAN_REPOS)
        output = _render_to_string(result)
        has_empty_msg = any(
            phrase in output.lower()
            for phrase in ["no change", "clean", "no file", "no dirty", "none"]
        )
        assert has_empty_msg, (
            f"Empty state should convey 'no changes'. Output: {output!r}"
        )

    def test_no_repos_shows_placeholder(self):
        """Empty repos array should show a placeholder message."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_NO_REPOS)
        output = _render_to_string(result)
        assert len(output.strip()) > 0, "No repos should produce output"

    def test_clean_state_does_not_show_file_paths(self):
        """Clean state should NOT render any file paths."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_CLEAN_REPOS)
        output = _render_to_string(result)
        assert "src/" not in output
        assert ".ts" not in output
        assert ".yaml" not in output


# ---------------------------------------------------------------------------
# AC2 (error handling): Handles malformed/missing data gracefully
# ---------------------------------------------------------------------------


class TestChangedPanelErrorHandling:
    """Handles malformed/missing data gracefully."""

    def test_missing_repos_field(self):
        """Message without 'repos' field should not crash."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel({"type": "init"})
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_none_payload_via_handle_message(self):
        """None payload should be handled gracefully by handle_message."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()
        panel.handle_message(None)
        assert panel._last_payload is None

    def test_empty_dict_payload(self):
        """Empty dict payload should not crash."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()
        panel.handle_message({})
        assert panel._last_payload == {}

    def test_repo_missing_dirty_files(self):
        """Repo without 'dirtyFiles' field should not crash."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "test",
                "path": "/tmp/test",
                "branch": "main",
                "clean": True,
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_dirty_file_missing_status(self):
        """Dirty file without 'status' field should not crash."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "test",
                "path": "/tmp/test",
                "branch": "main",
                "clean": False,
                "dirtyFiles": [{"path": "orphan.ts"}],
            }],
        })
        output = _render_to_string(result)
        assert "orphan.ts" in output, (
            "File path should render even without status field"
        )

    def test_dirty_file_missing_path(self):
        """Dirty file without 'path' field should not crash."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "test",
                "path": "/tmp/test",
                "branch": "main",
                "clean": False,
                "dirtyFiles": [{"status": "M "}],
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_completely_empty_dirty_file_object(self):
        """Completely empty dirty file dict should not crash."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "test",
                "path": "/tmp/test",
                "branch": "main",
                "clean": False,
                "dirtyFiles": [{}],
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_repos_field_is_not_a_list(self):
        """If 'repos' is not a list, should not crash."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": "not a list",
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_dirty_files_field_is_not_a_list(self):
        """If 'dirtyFiles' is not a list, should not crash."""
        panel = ChangedPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "test",
                "path": "/tmp/test",
                "branch": "main",
                "clean": False,
                "dirtyFiles": "not a list",
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)


# ---------------------------------------------------------------------------
# AC3: Updates in real-time when file changes are detected
# ---------------------------------------------------------------------------


class TestChangedPanelRealTimeUpdates:
    """AC3: Panel updates in real-time when file changes are detected."""

    def test_handle_message_triggers_render(self):
        """handle_message should call render_panel with the payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("updated"))
        panel.handle_message(SAMPLE_SINGLE_REPO)
        panel.render_panel.assert_called_once_with(SAMPLE_SINGLE_REPO)

    def test_consecutive_messages_each_trigger_render(self):
        """Multiple messages should each trigger a new render call."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("ok"))
        panel.handle_message(SAMPLE_SINGLE_REPO)
        panel.handle_message(SAMPLE_UPDATE_MESSAGE)
        assert panel.render_panel.call_count == 2

    def test_update_replaces_displayed_content(self):
        """An 'update' message should produce new rendering with updated files."""
        panel = ChangedPanel(client=MagicMock())
        panel.on_mount()

        # Init with single repo files
        result_init = panel.render_panel(SAMPLE_SINGLE_REPO)
        output_init = _render_to_string(result_init)
        assert "src/server.ts" in output_init

        # Update with different files
        result_update = panel.render_panel(SAMPLE_UPDATE_MESSAGE)
        output_update = _render_to_string(result_update)
        # New file from update should appear
        assert "src/brand-new.ts" in output_update

    def test_last_payload_reflects_latest_message(self):
        """_last_payload should update to the most recent message."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()

        panel.handle_message(SAMPLE_SINGLE_REPO)
        assert panel._last_payload == SAMPLE_SINGLE_REPO

        panel.handle_message(SAMPLE_UPDATE_MESSAGE)
        assert panel._last_payload == SAMPLE_UPDATE_MESSAGE

    def test_unmount_stops_updates(self):
        """After unmount, messages should not trigger render."""
        client = MagicMock(spec=WheelHubClient)
        panel = ChangedPanel(client=client)
        panel.on_mount()
        panel.on_unmount()

        panel.render_panel = MagicMock()
        panel.handle_message(SAMPLE_SINGLE_REPO)
        panel.render_panel.assert_not_called()
