"""Tests for BikeRack TUI GitPanel — multi-repo git status (Story 103-10).

Verifies:
  AC1: GitPanel subscribes to /ws/git WebSocket channel and receives updates
  AC2: Multi-repo status renders as Rich Group with repo lines and file lists
  AC3: Nerd Font glyphs display correctly for branch and status indicators
  AC4: Panel updates in real-time when git state changes
  AC5: Error handling for missing/malformed WebSocket messages

Run with: python -m pytest tests/python/test_bikerack_git_panel.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

import pytest
from rich.console import Console
from rich.console import Group as RichGroup
from rich.text import Text
from textual.widgets import Static

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel
from pennyfarthing_scripts.bikerack.git_panel import GitPanel
from pennyfarthing_scripts.bikerack.ws_client import WheelHubClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _render_to_string(renderable) -> str:
    """Render a Rich renderable to plain string for assertion checking."""
    console = Console(file=StringIO(), force_terminal=True, width=120)
    console.print(renderable)
    return console.file.getvalue()


# ---------------------------------------------------------------------------
# Test data fixtures
# ---------------------------------------------------------------------------

SAMPLE_INIT_MESSAGE: dict[str, Any] = {
    "type": "init",
    "repos": [
        {
            "name": "orchestrator",
            "path": "/home/user/Projects/pf-1",
            "branch": "feature/103-10-gitpanel",
            "clean": False,
            "ahead": 2,
            "behind": 0,
            "developBehind": 1,
            "dirtyFiles": [
                {"status": "M", "path": "sprint/epic-MSSCI-14951.yaml"},
                {"status": "??", "path": "sprint/archive/session.md"},
            ],
        },
        {
            "name": "pennyfarthing",
            "path": "/home/user/Projects/pf-1/pennyfarthing",
            "branch": "develop",
            "clean": True,
            "ahead": 0,
            "behind": 0,
            "developBehind": 0,
            "dirtyFiles": [],
        },
    ],
}

SAMPLE_UPDATE_MESSAGE: dict[str, Any] = {
    "type": "update",
    "repos": [
        {
            "name": "orchestrator",
            "path": "/home/user/Projects/pf-1",
            "branch": "feature/103-10-gitpanel",
            "clean": True,
            "ahead": 3,
            "behind": 1,
            "developBehind": 2,
            "dirtyFiles": [],
        },
    ],
}

SAMPLE_SINGLE_DIRTY_REPO: dict[str, Any] = {
    "type": "init",
    "repos": [
        {
            "name": "myrepo",
            "path": "/path/to/myrepo",
            "branch": "main",
            "clean": False,
            "ahead": 0,
            "behind": 5,
            "dirtyFiles": [
                {"status": "M", "path": "file1.py"},
                {"status": "A", "path": "file2.py"},
                {"status": "D", "path": "file3.py"},
            ],
        },
    ],
}


# ---------------------------------------------------------------------------
# AC1: GitPanel subscribes to /ws/git WebSocket channel and receives updates
# ---------------------------------------------------------------------------


class TestGitPanelSubscription:
    """AC1: GitPanel subscribes to /ws/git and receives updates."""

    def test_git_panel_exists_and_importable(self):
        """GitPanel should be importable from bikerack.git_panel."""
        assert GitPanel is not None

    def test_inherits_from_base_panel(self):
        """GitPanel should inherit from BasePanel."""
        assert issubclass(GitPanel, BasePanel)

    def test_is_textual_widget(self):
        """GitPanel should be a Textual widget (subclass of Static)."""
        assert issubclass(GitPanel, Static)

    def test_channel_is_git(self):
        """GitPanel.channel should be 'git'."""
        assert GitPanel.channel == "git"

    def test_subscribes_to_git_channel_on_mount(self):
        """GitPanel should subscribe to 'git' channel when mounted."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)

        panel.on_mount()

        client.subscribe.assert_called_once_with("git", panel.handle_message)

    def test_accepts_client_parameter(self):
        """GitPanel constructor should accept a client parameter."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        assert panel._client is client

    def test_handle_message_stores_payload(self):
        """handle_message should store the received payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()

        panel.handle_message(SAMPLE_INIT_MESSAGE)

        assert panel._last_payload == SAMPLE_INIT_MESSAGE


# ---------------------------------------------------------------------------
# AC2: Multi-repo status renders as Rich Group with repo lines
# ---------------------------------------------------------------------------


class TestGitPanelGroupRendering:
    """AC2: Multi-repo status renders as Rich Group with text lines."""

    def test_render_panel_returns_group_for_repos(self):
        """render_panel should return a Rich Group when repos are present."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        assert isinstance(result, RichGroup)

    def test_render_panel_returns_text_for_empty_repos(self):
        """render_panel should return Text for empty repos list."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({"type": "init", "repos": []})
        assert isinstance(result, Text)
        assert "No repository data" in str(result)

    def test_both_repos_appear_in_output(self):
        """Both repo names should appear in the rendered output."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "orchestrator" in output
        assert "pennyfarthing" in output

    def test_single_repo_renders(self):
        """Single repo message should render successfully."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_UPDATE_MESSAGE)
        output = _render_to_string(result)
        assert "orchestrator" in output

    def test_repo_name_in_output(self):
        """Repository name should appear in the rendered output."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "orchestrator" in output
        assert "pennyfarthing" in output

    def test_branch_name_in_output(self):
        """Branch names should appear in the rendered output."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "feature/103-10-gitpanel" in output
        assert "develop" in output

    def test_ahead_count_in_output(self):
        """Ahead commit count should appear in the rendered output."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # orchestrator is ahead=2, should show "↑2"
        assert "\u21912" in output or "↑2" in output

    def test_dirty_file_paths_in_output(self):
        """Dirty file paths should appear in expanded file list."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_DIRTY_REPO)
        output = _render_to_string(result)
        assert "file1.py" in output
        assert "file2.py" in output
        assert "file3.py" in output

    def test_clean_repo_no_file_list(self):
        """Clean repo should not show expanded file list."""
        panel = GitPanel(client=MagicMock())
        clean_message = {
            "type": "init",
            "repos": [{
                "name": "cleanrepo",
                "path": "/path",
                "branch": "main",
                "clean": True,
                "ahead": 0,
                "behind": 0,
                "dirtyFiles": [],
            }],
        }
        result = panel.render_panel(clean_message)
        output = _render_to_string(result)
        assert "cleanrepo" in output
        assert "clean" in output


# ---------------------------------------------------------------------------
# AC3: Nerd Font glyphs display correctly for branch and status indicators
# ---------------------------------------------------------------------------


class TestGitPanelGlyphs:
    """AC3: Nerd Font glyphs for branch and status indicators."""

    def test_git_panel_has_icon(self):
        """GitPanel should have a non-empty icon."""
        assert GitPanel.icon != ""

    def test_git_panel_icon_matches_registry(self):
        """GitPanel icon should match the PANEL_ICONS registry."""
        assert GitPanel.icon == PANEL_ICONS["git"][0]

    def test_git_panel_has_panel_name(self):
        """GitPanel should have panel_name set to 'Git'."""
        assert GitPanel.panel_name == "Git"

    def test_branch_glyph_in_output(self):
        """Output should include Nerd Font branch glyph."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # Branch glyph: U+E0A0 (nf-pl-branch)
        branch_glyph = "\ue0a0"
        assert branch_glyph in output, (
            "Branch glyph (U+E0A0) not found in output"
        )

    def test_clean_status_glyph(self):
        """Clean repo should show clean status indicator."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "\u2713" in output or "✓" in output, (
            "Clean status glyph not found in output"
        )

    def test_dirty_status_glyph(self):
        """Dirty repo should show dirty status indicator."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_DIRTY_REPO)
        output = _render_to_string(result)
        assert "\u2717" in output or "✗" in output, (
            "Dirty status glyph not found in output"
        )

    def test_ahead_glyph_in_output(self):
        """Repo ahead of remote should show up-arrow glyph."""
        panel = GitPanel(client=MagicMock())
        # orchestrator in SAMPLE_INIT_MESSAGE is ahead=2
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        # New code uses U+2191 (↑) not U+2B06 (⬆)
        assert "\u2191" in output or "↑" in output, (
            "Ahead glyph (↑) not found in output"
        )

    def test_behind_glyph_in_output(self):
        """Repo behind remote should show down-arrow glyph."""
        panel = GitPanel(client=MagicMock())
        behind_message = {
            "type": "init",
            "repos": [{
                "name": "testrepo",
                "path": "/test",
                "branch": "main",
                "clean": True,
                "ahead": 0,
                "behind": 3,
                "developBehind": 0,
                "dirtyFiles": [],
            }],
        }
        result = panel.render_panel(behind_message)
        output = _render_to_string(result)
        # New code uses U+2193 (↓) not U+2B07 (⬇)
        assert "\u2193" in output or "↓" in output, (
            "Behind glyph (↓) not found in output"
        )

    def test_file_status_icons_in_output(self):
        """Dirty file list should show status icons (~, +, -)."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_DIRTY_REPO)
        output = _render_to_string(result)
        # file1.py has status "M" -> "~", file2.py "A" -> "+", file3.py "D" -> "-"
        assert "~" in output
        assert "+" in output
        assert "-" in output


# ---------------------------------------------------------------------------
# AC4: Panel updates in real-time when git state changes
# ---------------------------------------------------------------------------


class TestGitPanelRealTimeUpdates:
    """AC4: Panel updates in real-time when git state changes."""

    def test_handle_message_triggers_render(self):
        """handle_message should call render_panel with the payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("updated"))

        panel.handle_message(SAMPLE_INIT_MESSAGE)

        panel.render_panel.assert_called_once_with(SAMPLE_INIT_MESSAGE)

    def test_consecutive_messages_each_trigger_render(self):
        """Multiple messages should each trigger a new render call."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("ok"))

        panel.handle_message(SAMPLE_INIT_MESSAGE)
        panel.handle_message(SAMPLE_UPDATE_MESSAGE)

        assert panel.render_panel.call_count == 2

    def test_last_payload_reflects_latest_message(self):
        """_last_payload should update to the most recent message."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()

        panel.handle_message(SAMPLE_INIT_MESSAGE)
        assert panel._last_payload == SAMPLE_INIT_MESSAGE

        panel.handle_message(SAMPLE_UPDATE_MESSAGE)
        assert panel._last_payload == SAMPLE_UPDATE_MESSAGE

    def test_init_and_update_types_both_render(self):
        """Both 'init' and 'update' message types should trigger rendering."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("ok"))

        panel.handle_message({"type": "init", "repos": []})
        panel.handle_message({"type": "update", "repos": []})

        assert panel.render_panel.call_count == 2
        types_received = [
            call.args[0]["type"] for call in panel.render_panel.call_args_list
        ]
        assert "init" in types_received
        assert "update" in types_received

    def test_unmount_stops_updates(self):
        """After unmount, messages should not trigger render."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()
        panel.on_unmount()

        panel.render_panel = MagicMock()
        panel.handle_message(SAMPLE_INIT_MESSAGE)

        panel.render_panel.assert_not_called()


# ---------------------------------------------------------------------------
# AC5: Error handling for missing/malformed WebSocket messages
# ---------------------------------------------------------------------------


class TestGitPanelErrorHandling:
    """AC5: Error handling for missing/malformed WebSocket messages."""

    def test_missing_repos_field(self):
        """Message without 'repos' field should not crash."""
        panel = GitPanel(client=MagicMock())
        panel.on_mount()
        result = panel.render_panel({"type": "init"})
        # No repos -> Text("No repository data")
        assert isinstance(result, Text)
        assert "No repository data" in str(result)

    def test_empty_repos_array(self):
        """Message with empty repos array should render 'No repository data'."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({"type": "init", "repos": []})
        assert isinstance(result, Text)
        assert "No repository data" in str(result)

    def test_none_payload_via_handle_message(self):
        """None payload should be handled gracefully by handle_message."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()
        # Should not raise — BasePanel.handle_message guards against None
        panel.handle_message(None)
        assert panel._last_payload is None

    def test_repo_missing_branch_field(self):
        """Repo entry without 'branch' should not crash."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{"name": "myrepo", "path": "/path"}],
        })
        # Should render without error
        output = _render_to_string(result)
        assert "myrepo" in output

    def test_repo_missing_dirty_files(self):
        """Repo entry without 'dirtyFiles' should not crash."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "myrepo",
                "path": "/path",
                "branch": "main",
                "clean": True,
                "ahead": 0,
                "behind": 0,
            }],
        })
        output = _render_to_string(result)
        assert "myrepo" in output

    def test_repo_missing_ahead_behind(self):
        """Repo entry without ahead/behind should not crash."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "myrepo",
                "path": "/path",
                "branch": "main",
                "clean": True,
                "dirtyFiles": [],
            }],
        })
        output = _render_to_string(result)
        assert "myrepo" in output

    def test_handle_message_with_empty_dict(self):
        """Empty dict payload should not crash."""
        client = MagicMock(spec=WheelHubClient)
        panel = GitPanel(client=client)
        panel.on_mount()

        panel.handle_message({})
        assert panel._last_payload == {}

    def test_malformed_dirty_files_entry(self):
        """dirtyFiles with missing 'status' or 'path' should not crash."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "repos": [{
                "name": "myrepo",
                "path": "/path",
                "branch": "main",
                "clean": False,
                "ahead": 0,
                "behind": 0,
                "dirtyFiles": [
                    {"status": "M"},  # missing path
                    {"path": "file.py"},  # missing status
                    {},  # missing both
                ],
            }],
        })
        output = _render_to_string(result)
        assert "myrepo" in output
