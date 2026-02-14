"""Tests for BikeRack TUI GitPanel — multi-repo git status (Story 103-10).

Verifies:
  AC1: GitPanel subscribes to /ws/git WebSocket channel and receives updates
  AC2: Multi-repo status renders as Rich Table with all required columns
  AC3: Nerd Font glyphs display correctly for branch and status indicators
  AC4: Panel updates in real-time when git state changes
  AC5: Error handling for missing/malformed WebSocket messages

Run with: python -m pytest tests/python/test_bikerack_git_panel.py -v
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from rich.table import Table
from rich.text import Text
from textual.widgets import Static

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel
from pennyfarthing_scripts.bikerack.git_panel import GitPanel
from pennyfarthing_scripts.bikerack.ws_client import WheelHubClient


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
            "developBehind": 0,
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
# AC2: Multi-repo status renders as Rich Table with all required columns
# ---------------------------------------------------------------------------


class TestGitPanelTableRendering:
    """AC2: Multi-repo status renders as Rich Table with required columns."""

    def test_render_panel_returns_table(self):
        """render_panel should return a Rich Table."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        assert isinstance(result, Table)

    def test_table_has_five_columns(self):
        """Table should have 5 columns: Repository, Branch, Commits, Changes, Status."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        assert isinstance(result, Table)
        assert len(result.columns) == 5, (
            f"Expected 5 columns, got {len(result.columns)}"
        )

    def test_table_column_names(self):
        """Table columns should be named correctly."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        assert isinstance(result, Table)
        col_headers = [str(col.header) for col in result.columns]
        assert "Repository" in col_headers
        assert "Branch" in col_headers
        assert "Commits" in col_headers
        assert "Changes" in col_headers
        assert "Status" in col_headers

    def test_one_row_per_repo(self):
        """Table should have one row per repo in the message."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        assert isinstance(result, Table)
        # SAMPLE_INIT_MESSAGE has 2 repos
        assert result.row_count == 2

    def test_single_repo_renders_one_row(self):
        """Single repo message should produce a table with one row."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_UPDATE_MESSAGE)
        assert isinstance(result, Table)
        assert result.row_count == 1

    def test_empty_repos_renders_empty_table(self):
        """Empty repos list should produce a table with no rows."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({"type": "init", "repos": []})
        assert isinstance(result, Table)
        assert result.row_count == 0

    def test_repo_name_in_table(self):
        """Repository name should appear in the rendered table."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        assert isinstance(result, Table)
        # Verify by checking that the table has the right row count
        # and can be rendered without error — detailed content verified
        # via console capture
        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        assert "orchestrator" in output
        assert "pennyfarthing" in output

    def test_branch_name_in_table(self):
        """Branch names should appear in the rendered table."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        assert "feature/103-10-gitpanel" in output
        assert "develop" in output

    def test_ahead_behind_in_table(self):
        """Ahead/behind commit counts should appear in the rendered output."""
        panel = GitPanel(client=MagicMock())
        # Use a repo that is ahead 2, behind 0
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        # Should show ahead count (2) somewhere in commits column
        assert "2" in output

    def test_dirty_file_count_in_table(self):
        """Dirty file count should appear in the Changes column."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_DIRTY_REPO)

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        # 3 dirty files — the count should appear
        assert "3" in output


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
        """Branch column should include Nerd Font branch glyph."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        # Branch glyph: U+E0A0 (nf-pl-branch) or similar
        branch_glyph = "\ue0a0"
        assert branch_glyph in output, (
            f"Branch glyph (U+E0A0) not found in output"
        )

    def test_clean_status_glyph(self):
        """Clean repo should show clean status indicator."""
        # Second repo in SAMPLE_INIT_MESSAGE is clean
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        # Clean glyph: checkmark (U+2713) or similar
        assert "\u2713" in output or "✓" in output, (
            "Clean status glyph not found in output"
        )

    def test_dirty_status_glyph(self):
        """Dirty repo should show dirty status indicator."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_DIRTY_REPO)

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        # Dirty glyph: cross mark (U+2717) or similar
        assert "\u2717" in output or "✗" in output, (
            "Dirty status glyph not found in output"
        )

    def test_ahead_glyph_in_output(self):
        """Repo ahead of remote should show up-arrow glyph."""
        panel = GitPanel(client=MagicMock())
        # orchestrator in SAMPLE_INIT_MESSAGE is ahead=2
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        # Ahead glyph: up arrow (U+2B06) or similar
        assert "\u2b06" in output or "⬆" in output, (
            "Ahead glyph not found in output"
        )

    def test_behind_glyph_in_output(self):
        """Repo behind remote should show down-arrow glyph."""
        panel = GitPanel(client=MagicMock())
        # Use repo that is behind
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

        from io import StringIO
        from rich.console import Console

        console = Console(file=StringIO(), force_terminal=True, width=120)
        console.print(result)
        output = console.file.getvalue()
        # Behind glyph: down arrow (U+2B07) or similar
        assert "\u2b07" in output or "⬇" in output, (
            "Behind glyph not found in output"
        )


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
        # Verify both message types were passed through
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
        # Should not raise
        result = panel.render_panel({"type": "init"})
        assert isinstance(result, Table)
        assert result.row_count == 0

    def test_empty_repos_array(self):
        """Message with empty repos array should render empty table."""
        panel = GitPanel(client=MagicMock())
        result = panel.render_panel({"type": "init", "repos": []})
        assert isinstance(result, Table)
        assert result.row_count == 0

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
        assert isinstance(result, Table)
        assert result.row_count == 1

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
        assert isinstance(result, Table)
        assert result.row_count == 1

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
        assert isinstance(result, Table)
        assert result.row_count == 1

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
        assert isinstance(result, Table)
        assert result.row_count == 1
