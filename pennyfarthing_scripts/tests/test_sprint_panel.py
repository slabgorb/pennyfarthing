"""Tests for SprintPanel — Sprint status panel for BikeRack TUI.

Story 103-6: SprintPanel implementation
Epic: 103 — BikeRack TUI (MSSCI-14951)

Acceptance Criteria:
- [AC1] SprintPanel subscribes to /ws/sprint channel
- [AC2] Receives and parses JSON payloads: {type, currentStory, nextStory, epics, ...}
- [AC3] Renders sprint status as Rich table: story ID, title, status, points, Jira status
- [AC4] Displays velocity and sprint metrics
- [AC5] Default panel on TUI launch
- [AC6] Updates in real-time when data changes on channel
- [AC7] All tests GREEN (Dev phase)

Tests should FAIL until sprint_panel.py is fully implemented.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from rich.table import Table
from rich.text import Text

from pennyfarthing_scripts.bikerack.base_panel import BasePanel
from pennyfarthing_scripts.bikerack.sprint_panel import SprintPanel

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
            "title": "BikeRack TUI",
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
            "title": "BikeRack Mode",
            "jiraKey": "MSSCI-14000",
            "stories": [
                {"id": "101-1", "title": "Launcher CLI", "points": 3, "status": "done", "jiraKey": "MSSCI-14001"},
            ],
        },
        {
            "id": "103",
            "title": "BikeRack TUI",
            "jiraKey": "MSSCI-14510",
            "stories": [
                {"id": "103-1", "title": "Scaffold", "points": 2, "status": "done", "jiraKey": "MSSCI-14952"},
                {"id": "103-6", "title": "SprintPanel", "points": 2, "status": "in_progress", "jiraKey": "MSSCI-14961"},
            ],
        },
    ],
    "futureEpics": [
        {"id": "110", "title": "Future Epic", "description": "Coming soon", "estimatedPoints": 20, "status": "planning"},
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
    """Create a mock WheelHubClient."""
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

    def test_inherits_base_panel(self) -> None:
        """SprintPanel should be a BasePanel subclass."""
        assert issubclass(SprintPanel, BasePanel)

    def test_subscribes_on_mount(self, panel: SprintPanel, mock_client: MagicMock) -> None:
        """SprintPanel should subscribe to 'sprint' channel on mount."""
        panel.on_mount()
        mock_client.subscribe.assert_called_once_with("sprint", panel.handle_message)

    def test_no_subscribe_without_client(self) -> None:
        """SprintPanel should not crash on mount without client."""
        panel = SprintPanel(client=None)
        # Should not raise
        panel.on_mount()


# ---------------------------------------------------------------------------
# AC2: Receives and parses JSON payloads
# ---------------------------------------------------------------------------


class TestSprintPanelParsing:
    """AC2: Receives and parses JSON payloads correctly."""

    def test_handles_init_message_type(self, panel: SprintPanel) -> None:
        """render_panel should handle 'init' type messages."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        # Should return something meaningful, not empty/None
        assert result is not None
        assert result != ""

    def test_handles_update_message_type(self, panel: SprintPanel) -> None:
        """render_panel should handle 'update' type messages."""
        result = panel.render_panel(SAMPLE_UPDATE_PAYLOAD)
        assert result is not None
        assert result != ""

    def test_handles_empty_epics(self, panel: SprintPanel) -> None:
        """render_panel should handle payload with empty epics list."""
        payload = {**SAMPLE_INIT_PAYLOAD, "epics": []}
        result = panel.render_panel(payload)
        assert result is not None
        assert result != ""

    def test_handles_null_current_story(self, panel: SprintPanel) -> None:
        """render_panel should handle null currentStory."""
        payload = {**SAMPLE_INIT_PAYLOAD, "currentStory": None}
        result = panel.render_panel(payload)
        assert result is not None
        assert result != ""

    def test_handles_multi_epic_payload(self, panel: SprintPanel) -> None:
        """render_panel should handle payloads with multiple epics."""
        result = panel.render_panel(SAMPLE_MULTI_EPIC_PAYLOAD)
        assert result is not None
        assert result != ""


# ---------------------------------------------------------------------------
# AC3: Renders sprint status as Rich table with columns
# ---------------------------------------------------------------------------


class TestSprintPanelRendering:
    """AC3: Renders sprint status as Rich table with correct columns."""

    def test_render_returns_rich_renderable(self, panel: SprintPanel) -> None:
        """render_panel should return a Rich renderable (Table or Group)."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        # Must be a Rich renderable — at minimum, not a plain string
        assert not isinstance(result, str), "render_panel should return Rich renderable, not str"

    def test_render_contains_table(self, panel: SprintPanel) -> None:
        """render_panel output should contain a Rich Table."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        # Result is either a Table directly or a Group containing a Table
        if isinstance(result, Table):
            table = result
        else:
            # Check if result contains a Table (for Group/renderables)
            tables = [r for r in getattr(result, "renderables", [result]) if isinstance(r, Table)]
            assert len(tables) > 0, "Output should contain at least one Rich Table"
            table = tables[0]
        assert isinstance(table, Table)

    def test_table_has_id_column(self, panel: SprintPanel) -> None:
        """Story table should have an ID column."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        table = _extract_table(result)
        column_names = [col.header.plain if isinstance(col.header, Text) else str(col.header) for col in table.columns]
        assert any("id" in name.lower() for name in column_names), f"Expected 'ID' column, got: {column_names}"

    def test_table_has_title_column(self, panel: SprintPanel) -> None:
        """Story table should have a Title column."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        table = _extract_table(result)
        column_names = [col.header.plain if isinstance(col.header, Text) else str(col.header) for col in table.columns]
        assert any("title" in name.lower() for name in column_names), f"Expected 'Title' column, got: {column_names}"

    def test_table_has_status_column(self, panel: SprintPanel) -> None:
        """Story table should have a Status column."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        table = _extract_table(result)
        column_names = [col.header.plain if isinstance(col.header, Text) else str(col.header) for col in table.columns]
        assert any("status" in name.lower() for name in column_names), f"Expected 'Status' column, got: {column_names}"

    def test_table_has_points_column(self, panel: SprintPanel) -> None:
        """Story table should have a Points column."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        table = _extract_table(result)
        column_names = [col.header.plain if isinstance(col.header, Text) else str(col.header) for col in table.columns]
        assert any("pts" in name.lower() or "points" in name.lower() for name in column_names), (
            f"Expected 'Points' column, got: {column_names}"
        )

    def test_table_has_jira_column(self, panel: SprintPanel) -> None:
        """Story table should have a Jira column."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        table = _extract_table(result)
        column_names = [col.header.plain if isinstance(col.header, Text) else str(col.header) for col in table.columns]
        assert any("jira" in name.lower() for name in column_names), f"Expected 'Jira' column, got: {column_names}"

    def test_table_contains_story_rows(self, panel: SprintPanel) -> None:
        """Table should contain rows for stories from epics."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        table = _extract_table(result)
        # SAMPLE_INIT_PAYLOAD has 3 stories in 1 epic
        assert table.row_count >= 3, f"Expected at least 3 rows, got {table.row_count}"

    def test_table_contains_stories_from_all_epics(self, panel: SprintPanel) -> None:
        """Table should include stories from ALL epics, not just the first."""
        result = panel.render_panel(SAMPLE_MULTI_EPIC_PAYLOAD)
        table = _extract_table(result)
        # 1 story from epic 101 + 2 from epic 103 = 3 total
        assert table.row_count >= 3, f"Expected at least 3 rows from 2 epics, got {table.row_count}"


# ---------------------------------------------------------------------------
# AC4: Displays velocity and sprint metrics
# ---------------------------------------------------------------------------


class TestSprintPanelMetrics:
    """AC4: Displays velocity and sprint metrics."""

    def test_output_contains_velocity(self, panel: SprintPanel) -> None:
        """Output should display velocity metric."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        rendered_str = _render_to_string(result)
        assert "8" in rendered_str, "Velocity value (8) should appear in output"

    def test_output_contains_sprint_name(self, panel: SprintPanel) -> None:
        """Output should display sprint name."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        rendered_str = _render_to_string(result)
        assert "2606" in rendered_str, "Sprint number (2606) should appear in output"

    def test_output_contains_done_count(self, panel: SprintPanel) -> None:
        """Output should display done points count."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        rendered_str = _render_to_string(result)
        assert "71" in rendered_str, "Done count (71) should appear in output"

    def test_output_contains_remaining_count(self, panel: SprintPanel) -> None:
        """Output should display remaining points count."""
        result = panel.render_panel(SAMPLE_INIT_PAYLOAD)
        rendered_str = _render_to_string(result)
        assert "128" in rendered_str, "Remaining count (128) should appear in output"

    def test_metrics_update_with_new_data(self, panel: SprintPanel) -> None:
        """Metrics should reflect updated payload values."""
        result = panel.render_panel(SAMPLE_UPDATE_PAYLOAD)
        rendered_str = _render_to_string(result)
        assert "9" in rendered_str, "Updated velocity (9) should appear in output"
        assert "73" in rendered_str, "Updated done count (73) should appear in output"


# ---------------------------------------------------------------------------
# AC5: Default panel on TUI launch
# ---------------------------------------------------------------------------


class TestDefaultPanel:
    """AC5: SprintPanel is the default panel on TUI launch."""

    async def test_bikerack_app_mounts_sprint_panel(self) -> None:
        """BikeRackApp should mount SprintPanel in main-content on startup."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test():
            panels = app.query(SprintPanel)
            assert len(panels) > 0, "SprintPanel should be mounted as default panel"
            panel = panels.first()
            assert panel.id == "sprint-panel"


# ---------------------------------------------------------------------------
# AC6: Updates in real-time when data changes on channel
# ---------------------------------------------------------------------------


class TestSprintPanelRealtime:
    """AC6: Updates in real-time when data changes on channel."""

    def test_handle_message_calls_render_panel(self, panel: SprintPanel) -> None:
        """handle_message should call render_panel with the payload."""
        panel._mounted = True
        with patch.object(panel, "render_panel", return_value="rendered") as mock_render:
            with patch.object(panel, "update"):
                panel.handle_message(SAMPLE_INIT_PAYLOAD)
                mock_render.assert_called_once_with(SAMPLE_INIT_PAYLOAD)

    def test_handle_message_updates_widget(self, panel: SprintPanel) -> None:
        """handle_message should call self.update() with rendered output."""
        panel._mounted = True
        with patch.object(panel, "render_panel", return_value="rendered"):
            with patch.object(panel, "update") as mock_update:
                panel.handle_message(SAMPLE_INIT_PAYLOAD)
                mock_update.assert_called_once_with("rendered")

    def test_sequential_updates_re_render(self, panel: SprintPanel) -> None:
        """Multiple messages should each trigger a re-render."""
        panel._mounted = True
        with patch.object(panel, "render_panel", return_value="rendered"):
            with patch.object(panel, "update") as mock_update:
                panel.handle_message(SAMPLE_INIT_PAYLOAD)
                panel.handle_message(SAMPLE_UPDATE_PAYLOAD)
                assert mock_update.call_count == 2

    def test_ignores_none_messages(self, panel: SprintPanel) -> None:
        """None messages should be silently ignored."""
        panel._mounted = True
        with patch.object(panel, "render_panel") as mock_render:
            with patch.object(panel, "update"):
                panel.handle_message(None)
                mock_render.assert_not_called()

    def test_ignores_messages_after_unmount(self, panel: SprintPanel) -> None:
        """Messages after unmount should be silently ignored."""
        panel._mounted = True
        panel.on_unmount()
        with patch.object(panel, "render_panel") as mock_render:
            with patch.object(panel, "update"):
                panel.handle_message(SAMPLE_INIT_PAYLOAD)
                mock_render.assert_not_called()

    def test_stores_last_payload(self, panel: SprintPanel) -> None:
        """handle_message should store the last payload."""
        panel._mounted = True
        with patch.object(panel, "render_panel", return_value="rendered"):
            with patch.object(panel, "update"):
                panel.handle_message(SAMPLE_INIT_PAYLOAD)
                assert panel._last_payload == SAMPLE_INIT_PAYLOAD


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestSprintPanelEdgeCases:
    """Edge cases and robustness tests."""

    def test_handles_missing_metrics(self, panel: SprintPanel) -> None:
        """render_panel should handle payload without metrics key."""
        payload = {k: v for k, v in SAMPLE_INIT_PAYLOAD.items() if k != "metrics"}
        # Should not raise
        result = panel.render_panel(payload)
        assert result is not None

    def test_handles_missing_sprint(self, panel: SprintPanel) -> None:
        """render_panel should handle payload without sprint key."""
        payload = {k: v for k, v in SAMPLE_INIT_PAYLOAD.items() if k != "sprint"}
        result = panel.render_panel(payload)
        assert result is not None

    def test_handles_empty_stories_in_epic(self, panel: SprintPanel) -> None:
        """render_panel should handle epic with empty stories list."""
        payload = {
            **SAMPLE_INIT_PAYLOAD,
            "epics": [{"id": "100", "title": "Empty Epic", "jiraKey": "MSSCI-10000", "stories": []}],
        }
        result = panel.render_panel(payload)
        assert result is not None

    def test_handles_story_with_null_jira_key(self, panel: SprintPanel) -> None:
        """render_panel should handle story with null jiraKey."""
        payload = {
            **SAMPLE_INIT_PAYLOAD,
            "epics": [
                {
                    "id": "103",
                    "title": "Test",
                    "jiraKey": None,
                    "stories": [
                        {"id": "103-99", "title": "No Jira", "points": 1, "status": "backlog", "jiraKey": None},
                    ],
                },
            ],
        }
        # Should not raise
        result = panel.render_panel(payload)
        assert result is not None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_table(result: Any) -> Table:
    """Extract a Rich Table from render_panel output.

    Handles both direct Table returns and Group/container returns.
    Raises AssertionError if no Table found.
    """
    if isinstance(result, Table):
        return result

    # Check renderables in Group
    renderables = getattr(result, "renderables", [])
    for r in renderables:
        if isinstance(r, Table):
            return r

    raise AssertionError(
        f"Expected Rich Table in output, got {type(result).__name__}: {result!r}"
    )


async def _noop_coroutine() -> None:
    """No-op coroutine for mocking async client.connect()."""
    pass


def _render_to_string(result: Any) -> str:
    """Render a Rich renderable to plain string for content assertions.

    Uses Rich Console with no color to get plain text output.
    """
    from io import StringIO

    from rich.console import Console

    buffer = StringIO()
    console = Console(file=buffer, no_color=True, width=120)
    console.print(result)
    return buffer.getvalue()
