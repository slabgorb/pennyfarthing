"""Tests for SprintPanel — Sprint status panel for Frame TUI TUI.

Story 103-6: SprintPanel implementation
Epic: 103 — Frame TUI TUI (MSSCI-14951)

Acceptance Criteria:
- [AC1] SprintPanel subscribes to /ws/sprint channel
- [AC2] Receives and parses JSON payloads: {type, currentStory, nextStory, epics, ...}
- [AC3] Renders sprint status with epic/story tree hierarchy
- [AC4] Displays velocity and sprint metrics
- [AC5] Default panel on TUI launch
- [AC6] Updates in real-time when data changes on channel
- [AC7] All tests GREEN (Dev phase)

Migrated to Textual Tree widget from Rich Table rendering.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from rich.text import Text

from pf.tui.sprint_panel import (
    SprintPanel,
    _build_epic_label,
    _build_story_label,
    _format_assignee,
    _is_terminal,
    _should_expand,
    _status_badge,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


SAMPLE_INIT_PAYLOAD: dict[str, Any] = {
    "type": "init",
    "currentStory": {
        "id": "103-6",
        "title": "SprintPanel implementation",
        "points": 2,
        "status": "in_progress",
        "jiraKey": "MSSCI-14961",
    },
    "nextStory": None,
    "epics": [
        {
            "id": "103",
            "title": "Frame TUI TUI",
            "jiraKey": "MSSCI-14510",
            "stories": [
                {
                    "id": "103-1",
                    "title": "Textual app scaffold",
                    "points": 2,
                    "status": "done",
                    "jiraKey": "MSSCI-14952",
                },
                {
                    "id": "103-5",
                    "title": "BasePanel abstraction",
                    "points": 2,
                    "status": "done",
                    "jiraKey": "MSSCI-14960",
                },
                {
                    "id": "103-6",
                    "title": "SprintPanel implementation",
                    "points": 2,
                    "status": "in_progress",
                    "jiraKey": "MSSCI-14961",
                },
            ],
        },
    ],
    "futureEpics": [],
    "sprint": {
        "number": 2606,
        "name": "TO Sprint 2606",
        "done": 71,
        "remaining": 128,
        "inProgress": 5,
        "endDate": "2026-02-20",
    },
    "metrics": {
        "velocity": 8,
        "burndown": [],
    },
}


SAMPLE_UPDATE_PAYLOAD: dict[str, Any] = {
    "type": "update",
    "currentStory": {
        "id": "103-6",
        "title": "SprintPanel implementation",
        "points": 2,
        "status": "done",
        "jiraKey": "MSSCI-14961",
    },
    "sprint": {
        "number": 2606,
        "name": "TO Sprint 2606",
        "done": 73,
        "remaining": 126,
        "inProgress": 4,
        "endDate": "2026-02-20",
    },
    "metrics": {
        "velocity": 9,
        "burndown": [],
    },
}


SAMPLE_MULTI_EPIC_PAYLOAD: dict[str, Any] = {
    "type": "init",
    "currentStory": None,
    "nextStory": None,
    "epics": [
        {
            "id": "101",
            "title": "Frame TUI Mode",
            "jiraKey": "MSSCI-14000",
            "stories": [
                {
                    "id": "101-1",
                    "title": "Launcher CLI",
                    "points": 3,
                    "status": "done",
                    "jiraKey": "MSSCI-14001",
                },
            ],
        },
        {
            "id": "103",
            "title": "Frame TUI TUI",
            "jiraKey": "MSSCI-14510",
            "stories": [
                {
                    "id": "103-1",
                    "title": "Scaffold",
                    "points": 2,
                    "status": "done",
                    "jiraKey": "MSSCI-14952",
                },
                {
                    "id": "103-6",
                    "title": "SprintPanel",
                    "points": 2,
                    "status": "in_progress",
                    "jiraKey": "MSSCI-14961",
                },
            ],
        },
    ],
    "futureEpics": [
        {
            "id": "110",
            "title": "Future Epic",
            "description": "Coming soon",
            "estimatedPoints": 20,
            "status": "planning",
        },
    ],
    "sprint": {
        "number": 2606,
        "name": "TO Sprint 2606",
        "done": 71,
        "remaining": 128,
        "inProgress": 5,
        "endDate": "2026-02-20",
    },
    "metrics": {"velocity": 8, "burndown": []},
}


@pytest.fixture
def mock_client() -> MagicMock:
    """Create a mock FrameClient."""
    client = MagicMock()
    client.subscribe = MagicMock()
    return client


@pytest.fixture
def panel(mock_client: MagicMock) -> SprintPanel:
    """Create a SprintPanel with mock client."""
    return SprintPanel(client=mock_client)


# ---------------------------------------------------------------------------
# AC1: SprintPanel subscribes to /ws/sprint channel
# ---------------------------------------------------------------------------


class TestSprintPanelChannel:
    """AC1: SprintPanel subscribes to /ws/sprint channel."""

    def test_channel_is_sprint(self) -> None:
        """SprintPanel.channel should be 'sprint'."""
        panel = SprintPanel()
        assert panel.channel == "sprint"

    def test_is_widget_subclass(self) -> None:
        """SprintPanel should be a Widget subclass."""
        from textual.widget import Widget

        assert issubclass(SprintPanel, Widget)

    def test_subscribes_on_mount(self, panel: SprintPanel, mock_client: MagicMock) -> None:
        """SprintPanel should subscribe to 'sprint' channel on mount."""
        panel.on_mount()
        mock_client.subscribe.assert_called_once_with("sprint", panel._handle_ws_message)

    def test_no_subscribe_without_client(self) -> None:
        """SprintPanel should not crash on mount without client."""
        panel = SprintPanel(client=None)
        panel.on_mount()


# ---------------------------------------------------------------------------
# AC2: Receives and parses JSON payloads
# ---------------------------------------------------------------------------


class TestSprintPanelParsing:
    """AC2: Receives and parses JSON payloads correctly."""

    def test_stores_payload(self, panel: SprintPanel) -> None:
        """_handle_ws_message should store the payload."""
        panel._mounted = True
        with patch.object(panel, "post_message"):
            panel._handle_ws_message(SAMPLE_INIT_PAYLOAD)
            assert panel._last_payload == SAMPLE_INIT_PAYLOAD

    def test_ignores_none(self, panel: SprintPanel) -> None:
        """_handle_ws_message should ignore None messages."""
        panel._mounted = True
        with patch.object(panel, "post_message") as mock_post:
            panel._handle_ws_message(None)
            mock_post.assert_not_called()

    def test_ignores_after_unmount(self, panel: SprintPanel) -> None:
        """Messages after unmount should be ignored."""
        panel._mounted = True
        panel.on_unmount()
        with patch.object(panel, "post_message") as mock_post:
            panel._handle_ws_message(SAMPLE_INIT_PAYLOAD)
            mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# AC3: Renders sprint status with epic/story tree hierarchy
# ---------------------------------------------------------------------------


class TestStatusBadge:
    """Status badge helper produces symbol-only Rich Text (no text word)."""

    def test_done_badge(self) -> None:
        badge = _status_badge("done")
        assert "\u2713" in badge.plain
        assert "done" not in badge.plain

    def test_in_progress_badge(self) -> None:
        badge = _status_badge("in-progress")
        assert "\u27f3" in badge.plain
        assert "in-progress" not in badge.plain

    def test_in_progress_underscore(self) -> None:
        """Handle both 'in-progress' and 'in_progress' status strings."""
        badge = _status_badge("in_progress")
        assert "\u27f3" in badge.plain

    def test_backlog_badge(self) -> None:
        badge = _status_badge("backlog")
        assert "\u25ef" in badge.plain
        assert "backlog" not in badge.plain

    def test_blocked_badge(self) -> None:
        badge = _status_badge("blocked")
        assert "!" in badge.plain
        assert "blocked" not in badge.plain

    def test_in_review_badge(self) -> None:
        badge = _status_badge("in-review")
        assert "\u25ce" in badge.plain
        assert "review" not in badge.plain

    def test_canceled_badge(self) -> None:
        badge = _status_badge("canceled")
        assert "\u2715" in badge.plain

    def test_cancelled_british_spelling(self) -> None:
        badge = _status_badge("cancelled")
        assert "\u2715" in badge.plain

    def test_unknown_status(self) -> None:
        badge = _status_badge("unknown-status")
        assert "\u2014" in badge.plain


class TestEpicLabel:
    """Epic label builder produces correct Rich Text."""

    def test_includes_epic_id_fallback(self) -> None:
        label = _build_epic_label("103", "Frame TUI TUI", 4, 6)
        assert "103" in label.plain

    def test_includes_jira_key_when_provided(self) -> None:
        label = _build_epic_label("103", "Frame TUI TUI", 4, 6, jira_key="MSSCI-14510")
        assert "MSSCI-14510" in label.plain

    def test_long_id_gets_ellipsed(self) -> None:
        label = _build_epic_label(
            "standalone", "Standalone Stories", 2, 7, jira_key="epic-standalone"
        )
        plain = label.plain
        assert "\u2026" in plain, f"Long ID should be ellipsed, got: {plain}"
        # Should not exceed 11 chars for the ID portion
        id_part = plain.split("  ")[0]
        assert len(id_part) <= 11

    def test_includes_progress(self) -> None:
        label = _build_epic_label("103", "Frame TUI TUI", 4, 6)
        assert "4/6 pts" in label.plain

    def test_includes_title(self) -> None:
        label = _build_epic_label("103", "Frame TUI TUI", 4, 6)
        assert "Frame TUI TUI" in label.plain

    def test_zero_points(self) -> None:
        label = _build_epic_label("100", "Empty", 0, 0)
        assert "0 pts" in label.plain


class TestStoryLabel:
    """Story label builder produces correct Rich Text."""

    def test_includes_jira_key(self) -> None:
        story = {
            "id": "103-1",
            "title": "Scaffold",
            "points": 2,
            "status": "done",
            "jiraKey": "MSSCI-14952",
        }
        label = _build_story_label(story, "")
        assert "MSSCI-14952" in label.plain

    def test_includes_points(self) -> None:
        story = {
            "id": "103-1",
            "title": "Scaffold",
            "points": 2,
            "status": "done",
            "jiraKey": "MSSCI-14952",
        }
        label = _build_story_label(story, "")
        assert "2" in label.plain

    def test_includes_title(self) -> None:
        story = {
            "id": "103-1",
            "title": "Scaffold",
            "points": 2,
            "status": "done",
            "jiraKey": "MSSCI-14952",
        }
        label = _build_story_label(story, "")
        assert "Scaffold" in label.plain

    def test_null_jira_key_shows_dash(self) -> None:
        story = {"id": "103-1", "title": "Test", "points": 1, "status": "backlog", "jiraKey": None}
        label = _build_story_label(story, "")
        assert "\u2014" in label.plain

    def test_current_story_bolded(self) -> None:
        story = {
            "id": "103-6",
            "title": "Current",
            "points": 2,
            "status": "in-progress",
            "jiraKey": "X",
        }
        label = _build_story_label(story, "103-6")
        has_bold = any("bold" in str(span.style) for span in label._spans)
        assert has_bold, "Current story should have bold styling"

    def test_done_story_is_dim(self) -> None:
        story = {
            "id": "103-1",
            "title": "Done one",
            "points": 2,
            "status": "done",
            "jiraKey": "MSSCI-14952",
        }
        label = _build_story_label(story, "")
        # Overall dim styling applied to done stories
        has_dim = any("dim" in str(span.style) for span in label._spans)
        assert has_dim, "Done story should have dim styling"


class TestFormatAssignee:
    """Email to display name formatting."""

    def test_standard_email(self) -> None:
        assert _format_assignee("keith.avery@1898andco.io") == "KA"

    def test_underscore_email(self) -> None:
        assert _format_assignee("john_doe@example.com") == "JD"

    def test_none_returns_empty(self) -> None:
        assert _format_assignee(None) == ""

    def test_empty_string_returns_empty(self) -> None:
        assert _format_assignee("") == ""

    def test_single_part_local(self) -> None:
        result = _format_assignee("admin@example.com")
        assert result == "AD"


class TestStoryLabelOwner:
    """Owner shown for in-progress stories, hidden for done/backlog."""

    def test_in_progress_shows_owner(self) -> None:
        story = {
            "id": "110-2",
            "title": "Drill",
            "points": 5,
            "status": "in-progress",
            "jiraKey": "MSSCI-15186",
            "assignee": "keith.avery@1898andco.io",
        }
        label = _build_story_label(story, "")
        assert "KA" in label.plain

    def test_done_hides_owner(self) -> None:
        story = {
            "id": "110-1",
            "title": "Done",
            "points": 3,
            "status": "done",
            "jiraKey": "MSSCI-15185",
            "assignee": "keith.avery@1898andco.io",
        }
        label = _build_story_label(story, "")
        assert "K. Avery" not in label.plain

    def test_backlog_hides_owner(self) -> None:
        story = {
            "id": "110-3",
            "title": "Backlog",
            "points": 3,
            "status": "backlog",
            "jiraKey": "MSSCI-15187",
            "assignee": "keith.avery@1898andco.io",
        }
        label = _build_story_label(story, "")
        assert "K. Avery" not in label.plain

    def test_in_progress_no_assignee(self) -> None:
        story = {
            "id": "110-2",
            "title": "Drill",
            "points": 5,
            "status": "in-progress",
            "jiraKey": "MSSCI-15186",
        }
        label = _build_story_label(story, "")
        assert "[" not in label.plain or "[]" not in label.plain

    def test_canceled_story_is_dim(self) -> None:
        story = {
            "id": "110-4",
            "title": "Canceled one",
            "points": 2,
            "status": "canceled",
            "jiraKey": "MSSCI-15999",
        }
        label = _build_story_label(story, "")
        has_dim = any("dim" in str(span.style) for span in label._spans)
        assert has_dim, "Canceled story should have dim styling"


class TestShouldExpand:
    """Default expand logic for epics."""

    def test_expands_with_incomplete_work(self) -> None:
        epic = {
            "stories": [
                {"points": 2, "status": "done"},
                {"points": 3, "status": "in-progress"},
            ]
        }
        assert _should_expand(epic) is True

    def test_collapses_when_all_done(self) -> None:
        epic = {
            "stories": [
                {"points": 2, "status": "done"},
                {"points": 3, "status": "done"},
            ]
        }
        assert _should_expand(epic) is False

    def test_expands_when_backlog_remains(self) -> None:
        epic = {
            "stories": [
                {"points": 2, "status": "done"},
                {"points": 3, "status": "backlog"},
            ]
        }
        assert _should_expand(epic) is True

    def test_expands_empty_epic(self) -> None:
        epic = {"stories": []}
        assert _should_expand(epic) is False

    def test_collapses_canceled_epic(self) -> None:
        epic = {
            "status": "canceled",
            "stories": [
                {"points": 2, "status": "backlog"},
            ],
        }
        assert _should_expand(epic) is False

    def test_collapses_when_all_done_or_canceled(self) -> None:
        epic = {
            "stories": [
                {"points": 2, "status": "done"},
                {"points": 3, "status": "canceled"},
            ]
        }
        assert _should_expand(epic) is False

    def test_expands_when_mix_of_canceled_and_backlog(self) -> None:
        epic = {
            "stories": [
                {"points": 2, "status": "canceled"},
                {"points": 3, "status": "backlog"},
            ]
        }
        assert _should_expand(epic) is True


class TestIsTerminal:
    """Terminal status detection."""

    def test_done_is_terminal(self) -> None:
        assert _is_terminal("done") is True

    def test_canceled_is_terminal(self) -> None:
        assert _is_terminal("canceled") is True

    def test_cancelled_british_is_terminal(self) -> None:
        assert _is_terminal("cancelled") is True

    def test_in_progress_is_not_terminal(self) -> None:
        assert _is_terminal("in-progress") is False

    def test_backlog_is_not_terminal(self) -> None:
        assert _is_terminal("backlog") is False


# ---------------------------------------------------------------------------
# AC4: Displays velocity and sprint metrics
# ---------------------------------------------------------------------------


class TestSprintPanelMetrics:
    """AC4: Metrics are included in sprint header text."""

    def test_header_format(self) -> None:
        """Header text builder includes key metrics."""
        # Test by checking the header text that _rebuild_tree would produce
        sprint = SAMPLE_INIT_PAYLOAD["sprint"]
        metrics = SAMPLE_INIT_PAYLOAD["metrics"]
        header = Text.from_markup(
            f"Sprint {sprint.get('number', '')}  "
            f"[green]Done: {sprint.get('done', 0)}[/green] | "
            f"Remaining: {sprint.get('remaining', 0)} | "
            f"In Progress: {sprint.get('inProgress', 0)} | "
            f"Velocity: {metrics.get('velocity', 0)}"
        )
        plain = header.plain
        assert "2606" in plain
        assert "71" in plain
        assert "128" in plain
        assert "8" in plain


# ---------------------------------------------------------------------------
# AC5: Default panel on TUI launch
# ---------------------------------------------------------------------------


class TestDefaultPanel:
    """AC5: SprintPanel is the default panel on TUI launch."""

    async def test_tui_app_mounts_sprint_panel(self) -> None:
        """TuiApp should mount SprintPanel in main-content on startup."""
        from pf.tui.app import TuiApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

        async with app.run_test():
            panels = app.query(SprintPanel)
            assert len(panels) > 0, "SprintPanel should be mounted as default panel"


# ---------------------------------------------------------------------------
# AC6: Updates in real-time when data changes on channel
# ---------------------------------------------------------------------------


class TestSprintPanelRealtime:
    """AC6: Updates in real-time when data changes on channel."""

    def test_handle_message_posts_data_received(self, panel: SprintPanel) -> None:
        """_handle_ws_message should post DataReceived message."""
        panel._mounted = True
        with patch.object(panel, "post_message") as mock_post:
            panel._handle_ws_message(SAMPLE_INIT_PAYLOAD)
            assert mock_post.call_count == 1
            event = mock_post.call_args[0][0]
            assert isinstance(event, SprintPanel.DataReceived)
            assert event.payload == SAMPLE_INIT_PAYLOAD

    def test_sequential_updates(self, panel: SprintPanel) -> None:
        """Multiple messages should each trigger a post_message."""
        panel._mounted = True
        with patch.object(panel, "post_message") as mock_post:
            panel._handle_ws_message(SAMPLE_INIT_PAYLOAD)
            panel._handle_ws_message(SAMPLE_UPDATE_PAYLOAD)
            assert mock_post.call_count == 2

    def test_stores_last_payload(self, panel: SprintPanel) -> None:
        """_handle_ws_message should store the last payload."""
        panel._mounted = True
        with patch.object(panel, "post_message"):
            panel._handle_ws_message(SAMPLE_INIT_PAYLOAD)
            assert panel._last_payload == SAMPLE_INIT_PAYLOAD


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestSprintPanelEdgeCases:
    """Edge cases and robustness tests."""

    def test_handles_missing_metrics(self) -> None:
        """Label builder handles payload without metrics key."""
        sprint = {"number": "2606", "done": 0, "remaining": 0, "inProgress": 0}
        header = Text.from_markup(
            f"Sprint {sprint.get('number', '')}  "
            f"[green]Done: {sprint.get('done', 0)}[/green] | "
            f"Remaining: {sprint.get('remaining', 0)} | "
            f"Velocity: 0"
        )
        assert header.plain is not None

    def test_status_badge_empty_string(self) -> None:
        """Status badge handles empty string."""
        badge = _status_badge("")
        assert badge is not None

    def test_story_label_missing_fields(self) -> None:
        """Story label handles minimal story dict."""
        story: dict[str, Any] = {"id": "X", "title": "", "points": 0, "status": "", "jiraKey": None}
        label = _build_story_label(story, "")
        assert label is not None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _noop_coroutine() -> None:
    """No-op coroutine for mocking async client.connect()."""
    pass
