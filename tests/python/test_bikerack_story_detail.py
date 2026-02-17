"""Tests for Story Drill-Through with Dossier Detail Screen (Story 110-2).

Epic: 110 — BikeRack TUI — Interactive Command Center (MSSCI-15186)

Acceptance Criteria:
- [AC1] Add per-story cursor to SprintPanel (arrow keys within expanded epic)
- [AC2] Create StoryDetailScreen extending Textual Screen with push/pop
- [AC3] Fetch story detail data (AC, session, workflow) via file read or API
- [AC4] Render dossier layout: header, AC progress, workflow phase, git info
- [AC5] Escape pops back to sprint overview
- [AC6] Enter on PR link opens browser via webbrowser.open()

Tests should FAIL until implementation is complete (RED state).

Run with: python -m pytest tests/python/test_bikerack_story_detail.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from rich.console import Console
from textual.binding import Binding
from textual.screen import Screen

from pennyfarthing_scripts.bikerack.sprint_panel import SprintPanel
from pennyfarthing_scripts.bikerack.story_detail_data import fetch_story_detail
from pennyfarthing_scripts.bikerack.story_detail_screen import StoryDetailScreen

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_PAYLOAD: dict[str, Any] = {
    "type": "init",
    "sprint": {
        "number": 2606,
        "name": "TO Sprint 2606",
        "done": 71,
        "remaining": 128,
        "inProgress": 5,
        "endDate": "2026-02-20",
        "currentStory": "110-2",
    },
    "metrics": {"velocity": 8, "burndown": []},
    "epics": [
        {
            "id": "110",
            "title": "BikeRack TUI — Interactive Command Center",
            "jiraKey": "MSSCI-15100",
            "stories": [
                {
                    "id": "110-1",
                    "title": "Cross-panel event bus",
                    "points": 3,
                    "status": "done",
                    "jiraKey": "MSSCI-15185",
                },
                {
                    "id": "110-2",
                    "title": "Story drill-through with dossier",
                    "points": 5,
                    "status": "in-progress",
                    "jiraKey": "MSSCI-15186",
                },
                {
                    "id": "110-3",
                    "title": "Portrait image header",
                    "points": 3,
                    "status": "backlog",
                    "jiraKey": "MSSCI-15187",
                },
            ],
        },
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
            ],
        },
    ],
    "futureEpics": [],
}

SAMPLE_STORY_DETAIL: dict[str, Any] = {
    "id": "110-2",
    "title": "Story drill-through with dossier detail screen",
    "points": 5,
    "status": "in-progress",
    "jiraKey": "MSSCI-15186",
    "acceptance_criteria": [
        {"text": "Per-story cursor in SprintPanel", "done": False},
        {"text": "StoryDetailScreen with push/pop", "done": False},
        {"text": "Fetch story detail data", "done": False},
        {"text": "Render dossier layout", "done": False},
        {"text": "Escape pops back", "done": False},
        {"text": "Enter opens PR link", "done": False},
    ],
    "workflow": "tdd",
    "workflow_phase": "red",
    "git_branch": "feature/110-2-story-drill-through-dossier",
    "pr_url": "https://github.com/user/pennyfarthing/pull/42",
    "session_notes": "Story initialized by SM",
}


@pytest.fixture
def mock_client() -> MagicMock:
    """Create a mock WheelHubClient."""
    client = MagicMock()
    client.subscribe = MagicMock()
    return client


@pytest.fixture
def panel(mock_client: MagicMock) -> SprintPanel:
    """Create a SprintPanel with mock client and loaded payload."""
    p = SprintPanel(client=mock_client)
    p._last_payload = SAMPLE_PAYLOAD
    p._mounted = True
    # Ensure first epic (110) is expanded — it has in-progress stories
    return p


@pytest.fixture
def detail_screen() -> StoryDetailScreen:
    """Create a StoryDetailScreen with sample story data."""
    return StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)


@pytest.fixture
def empty_detail_screen() -> StoryDetailScreen:
    """Create a StoryDetailScreen with no story data."""
    return StoryDetailScreen()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _render_to_string(result: Any) -> str:
    """Render a Rich renderable to plain string."""
    buf = StringIO()
    console = Console(file=buf, no_color=True, width=120)
    console.print(result)
    return buf.getvalue()


# ===========================================================================
# AC1: Add per-story cursor to SprintPanel (arrow keys within expanded epic)
# ===========================================================================


class TestStoryNavigationState:
    """AC1: SprintPanel has per-story cursor state."""

    def test_panel_has_selected_story_attribute(self, panel: SprintPanel) -> None:
        """SprintPanel should track selected story index."""
        assert hasattr(panel, "_selected_story"), (
            "SprintPanel should have _selected_story attribute"
        )

    def test_selected_story_default_is_negative_one(self) -> None:
        """Default story selection should be -1 (no story selected)."""
        p = SprintPanel()
        assert p._selected_story == -1, (
            f"Default _selected_story should be -1, got {p._selected_story}"
        )

    def test_next_story_selects_first_story(self, panel: SprintPanel) -> None:
        """From no selection (-1), next_story should select the first story (index 0)."""
        assert panel._selected_story == -1
        panel.next_story()
        assert panel._selected_story == 0, (
            f"After first next_story(), _selected_story should be 0, got {panel._selected_story}"
        )

    def test_next_story_increments(self, panel: SprintPanel) -> None:
        """next_story should move from story 0 to story 1."""
        panel._selected_story = 0
        panel.next_story()
        assert panel._selected_story == 1, (
            f"After next_story() from 0, should be 1, got {panel._selected_story}"
        )

    def test_next_story_wraps_at_end(self, panel: SprintPanel) -> None:
        """next_story should wrap from last story back to first (index 0)."""
        # Epic 110 has 3 stories (indices 0, 1, 2)
        panel._selected_story = 2
        panel.next_story()
        assert panel._selected_story == 0, (
            f"After wrapping, should be 0, got {panel._selected_story}"
        )

    def test_prev_story_wraps_at_beginning(self, panel: SprintPanel) -> None:
        """prev_story from index 0 should wrap to last story."""
        panel._selected_story = 0
        panel.prev_story()
        # Epic 110 has 3 stories, so last index is 2
        assert panel._selected_story == 2, (
            f"After wrapping back, should be 2, got {panel._selected_story}"
        )

    def test_prev_story_decrements(self, panel: SprintPanel) -> None:
        """prev_story should move from story 2 to story 1."""
        panel._selected_story = 2
        panel.prev_story()
        assert panel._selected_story == 1, (
            f"After prev_story() from 2, should be 1, got {panel._selected_story}"
        )

    def test_story_navigation_noop_when_epic_collapsed(self, panel: SprintPanel) -> None:
        """next_story should be no-op when selected epic is collapsed."""
        # Collapse epic 110
        panel._toggled["110"] = False
        panel._selected_story = -1
        panel.next_story()
        assert panel._selected_story == -1, (
            "Story nav should be no-op when epic is collapsed"
        )

    def test_story_cursor_resets_on_epic_switch(self, panel: SprintPanel) -> None:
        """Switching epics should reset story cursor to -1."""
        panel._selected_story = 1
        panel.next_epic()
        assert panel._selected_story == -1, (
            f"Story cursor should reset on epic switch, got {panel._selected_story}"
        )

    def test_story_navigation_noop_no_payload(self) -> None:
        """next_story should be no-op when no payload is loaded."""
        p = SprintPanel()
        p.next_story()
        assert p._selected_story == -1


class TestStoryNavigationBindings:
    """AC1: SprintPanel has arrow key bindings for story navigation."""

    def test_down_arrow_binding_exists(self) -> None:
        """SprintPanel should have a 'down' binding for next story."""
        binding_keys = [b.key for b in SprintPanel.BINDINGS]
        assert "down" in binding_keys, (
            f"Expected 'down' binding, found: {binding_keys}"
        )

    def test_up_arrow_binding_exists(self) -> None:
        """SprintPanel should have an 'up' binding for previous story."""
        binding_keys = [b.key for b in SprintPanel.BINDINGS]
        assert "up" in binding_keys, (
            f"Expected 'up' binding, found: {binding_keys}"
        )

    def test_enter_binding_exists(self) -> None:
        """SprintPanel should have an 'enter' binding for drill-through."""
        binding_keys = [b.key for b in SprintPanel.BINDINGS]
        assert "enter" in binding_keys, (
            f"Expected 'enter' binding, found: {binding_keys}"
        )


class TestStoryNavigationRender:
    """AC1: Selected story shows visual cursor in rendered output."""

    def test_render_shows_story_cursor(self, panel: SprintPanel) -> None:
        """Rendered output should show a cursor indicator on selected story."""
        panel._selected_story = 1  # Select "110-2"
        with patch.object(panel, "update"):
            result = panel.render_panel(SAMPLE_PAYLOAD)
        rendered = _render_to_string(result)
        # The selected story line should have a visible cursor marker
        # Look for a selection indicator (▸ or › or >) near the story ID
        lines = rendered.strip().split("\n")
        story_lines = [l for l in lines if "110-2" in l]
        assert len(story_lines) > 0, "Story 110-2 should appear in output"
        story_line = story_lines[0]
        # Selected story should have a distinct marker that non-selected don't
        assert any(marker in story_line for marker in ["▸", "›", ">", "→"]), (
            f"Selected story should have cursor marker, got: '{story_line.strip()}'"
        )

    def test_render_no_cursor_when_no_story_selected(self, panel: SprintPanel) -> None:
        """When no story is selected (-1), no story cursor should appear."""
        panel._selected_story = -1
        with patch.object(panel, "update"):
            result = panel.render_panel(SAMPLE_PAYLOAD)
        rendered = _render_to_string(result)
        lines = rendered.strip().split("\n")
        story_lines = [l for l in lines if "110-2" in l]
        assert len(story_lines) > 0, "Story 110-2 should appear in output"
        story_line = story_lines[0]
        # No story cursor markers when nothing selected
        assert "▸" not in story_line, (
            "No story cursor should appear when _selected_story is -1"
        )

    def test_get_selected_story_returns_data(self, panel: SprintPanel) -> None:
        """get_selected_story should return story dict when a story is selected."""
        panel._selected_story = 1  # Second story in epic 110 = "110-2"
        story = panel.get_selected_story()
        assert story is not None, "get_selected_story should return data when selected"
        assert story["id"] == "110-2", (
            f"Expected story id '110-2', got '{story.get('id')}'"
        )

    def test_get_selected_story_returns_none_when_unselected(self, panel: SprintPanel) -> None:
        """get_selected_story should return None when no story is selected."""
        panel._selected_story = -1
        story = panel.get_selected_story()
        assert story is None, (
            "get_selected_story should return None when _selected_story is -1"
        )


# ===========================================================================
# AC2: Create StoryDetailScreen extending Textual Screen with push/pop
# ===========================================================================


class TestStoryDetailScreenClass:
    """AC2: StoryDetailScreen is a proper Textual Screen."""

    def test_importable(self) -> None:
        """StoryDetailScreen should be importable."""
        from pennyfarthing_scripts.bikerack.story_detail_screen import StoryDetailScreen

        assert StoryDetailScreen is not None

    def test_is_textual_screen(self) -> None:
        """StoryDetailScreen should extend textual.screen.Screen."""
        assert issubclass(StoryDetailScreen, Screen), (
            f"StoryDetailScreen should extend Screen, bases: {StoryDetailScreen.__bases__}"
        )

    def test_has_escape_binding(self) -> None:
        """StoryDetailScreen should have an 'escape' key binding."""
        binding_keys = [b.key for b in StoryDetailScreen.BINDINGS]
        assert "escape" in binding_keys, (
            f"Expected 'escape' binding, found: {binding_keys}"
        )

    def test_escape_binding_action_is_pop_screen(self) -> None:
        """Escape binding should trigger pop_screen action."""
        escape_bindings = [b for b in StoryDetailScreen.BINDINGS if b.key == "escape"]
        assert len(escape_bindings) > 0
        assert escape_bindings[0].action == "pop_screen", (
            f"Escape action should be 'pop_screen', got '{escape_bindings[0].action}'"
        )

    def test_accepts_story_data(self) -> None:
        """StoryDetailScreen constructor should accept story_data dict."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
        assert screen._story_data == SAMPLE_STORY_DETAIL

    def test_stores_empty_dict_when_no_data(self) -> None:
        """StoryDetailScreen with no story_data should store empty dict."""
        screen = StoryDetailScreen()
        assert screen._story_data == {}

    def test_has_enter_binding(self) -> None:
        """StoryDetailScreen should have an 'enter' key binding for PR links."""
        binding_keys = [b.key for b in StoryDetailScreen.BINDINGS]
        assert "enter" in binding_keys, (
            f"Expected 'enter' binding for PR link, found: {binding_keys}"
        )


# ===========================================================================
# AC3: Fetch story detail data (AC, session, workflow) via file read or API
# ===========================================================================


class TestFetchStoryDetail:
    """AC3: fetch_story_detail returns enriched story data."""

    def test_importable(self) -> None:
        """fetch_story_detail should be importable."""
        from pennyfarthing_scripts.bikerack.story_detail_data import fetch_story_detail

        assert fetch_story_detail is not None

    def test_returns_dict(self) -> None:
        """fetch_story_detail should return a dict."""
        result = fetch_story_detail("110-2")
        assert isinstance(result, dict), (
            f"Expected dict, got {type(result).__name__}"
        )

    def test_contains_title(self, tmp_path) -> None:
        """Result should contain 'title' key with story title."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "title" in result, (
            f"Result should contain 'title' key, got keys: {list(result.keys())}"
        )
        assert isinstance(result["title"], str) and len(result["title"]) > 0, (
            "Title should be a non-empty string"
        )

    def test_contains_acceptance_criteria(self, tmp_path) -> None:
        """Result should contain 'acceptance_criteria' as a list."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "acceptance_criteria" in result, (
            f"Result should contain 'acceptance_criteria', got keys: {list(result.keys())}"
        )
        assert isinstance(result["acceptance_criteria"], list), (
            "acceptance_criteria should be a list"
        )

    def test_acceptance_criteria_items_have_text_and_done(self, tmp_path) -> None:
        """Each AC item should have 'text' and 'done' fields."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        acs = result.get("acceptance_criteria", [])
        assert len(acs) > 0, "Should have at least one AC"
        for ac in acs:
            assert "text" in ac, f"AC item missing 'text': {ac}"
            assert "done" in ac, f"AC item missing 'done': {ac}"

    def test_contains_workflow_phase(self, tmp_path) -> None:
        """Result should contain 'workflow_phase' key."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "workflow_phase" in result, (
            f"Result should contain 'workflow_phase', got keys: {list(result.keys())}"
        )

    def test_contains_git_branch(self, tmp_path) -> None:
        """Result should contain 'git_branch' key."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "git_branch" in result, (
            f"Result should contain 'git_branch', got keys: {list(result.keys())}"
        )

    def test_contains_pr_url(self, tmp_path) -> None:
        """Result should contain 'pr_url' key (may be None if no PR)."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "pr_url" in result, (
            f"Result should contain 'pr_url', got keys: {list(result.keys())}"
        )

    def test_contains_session_notes(self, tmp_path) -> None:
        """Result should contain 'session_notes' key."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "session_notes" in result, (
            f"Result should contain 'session_notes', got keys: {list(result.keys())}"
        )

    def test_contains_workflow_name(self, tmp_path) -> None:
        """Result should contain 'workflow' key with workflow name."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "workflow" in result, (
            f"Result should contain 'workflow', got keys: {list(result.keys())}"
        )

    def test_handles_unknown_story_gracefully(self, tmp_path) -> None:
        """fetch_story_detail for unknown story should return empty or minimal dict."""
        result = fetch_story_detail("999-99", project_root=str(tmp_path))
        # Should not raise; may return empty dict or dict with None values
        assert isinstance(result, dict)

    def test_handles_none_project_root(self) -> None:
        """fetch_story_detail with None project_root should not crash."""
        # May return empty dict or auto-detect — should not raise
        try:
            result = fetch_story_detail("110-2", project_root=None)
            assert isinstance(result, dict)
        except FileNotFoundError:
            # Acceptable — auto-detection may fail in test env
            pass


# ===========================================================================
# AC4: Render dossier layout: header, AC progress, workflow phase, git info
# ===========================================================================


class TestDossierLayoutCompose:
    """AC4: StoryDetailScreen composes a dossier layout with required sections."""

    async def test_compose_yields_widgets(self) -> None:
        """StoryDetailScreen.compose() should yield at least one widget."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
        widgets = list(screen.compose())
        assert len(widgets) > 0, (
            "compose() should yield widgets for the dossier layout"
        )

    async def test_compose_with_empty_data_yields_widgets(self) -> None:
        """compose() should yield widgets even with empty story data (graceful)."""
        screen = StoryDetailScreen(story_data={})
        widgets = list(screen.compose())
        assert len(widgets) > 0, (
            "compose() should yield at least a placeholder with empty data"
        )


class TestDossierLayoutContent:
    """AC4: Dossier layout contains required information sections."""

    async def test_shows_story_title(self) -> None:
        """Dossier should display the story title."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
            await app.push_screen(screen)
            await pilot.pause()
            # Check that story title appears somewhere in the screen
            text = app.query("*")
            rendered_texts = []
            for widget in text:
                try:
                    r = widget.render()
                    if hasattr(r, "plain"):
                        rendered_texts.append(r.plain)
                    else:
                        rendered_texts.append(str(r))
                except Exception:
                    pass
            all_text = " ".join(rendered_texts)
            assert "drill-through" in all_text.lower() or "110-2" in all_text, (
                f"Story title or ID should appear in dossier, got: {all_text[:200]}"
            )

    async def test_shows_ac_checklist(self) -> None:
        """Dossier should display acceptance criteria as a checklist."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
            await app.push_screen(screen)
            await pilot.pause()
            text = app.query("*")
            rendered_texts = []
            for widget in text:
                try:
                    r = widget.render()
                    if hasattr(r, "plain"):
                        rendered_texts.append(r.plain)
                    else:
                        rendered_texts.append(str(r))
                except Exception:
                    pass
            all_text = " ".join(rendered_texts)
            # At least one AC text should appear
            assert "per-story cursor" in all_text.lower() or "acceptance" in all_text.lower(), (
                f"AC checklist should appear in dossier, got: {all_text[:200]}"
            )

    async def test_shows_workflow_phase(self) -> None:
        """Dossier should display the current workflow phase."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
            await app.push_screen(screen)
            await pilot.pause()
            text = app.query("*")
            rendered_texts = []
            for widget in text:
                try:
                    r = widget.render()
                    if hasattr(r, "plain"):
                        rendered_texts.append(r.plain)
                    else:
                        rendered_texts.append(str(r))
                except Exception:
                    pass
            all_text = " ".join(rendered_texts)
            # Workflow phase "red" or "tdd" should appear
            assert "red" in all_text.lower() or "tdd" in all_text.lower(), (
                f"Workflow phase should appear in dossier, got: {all_text[:200]}"
            )

    async def test_shows_git_branch(self) -> None:
        """Dossier should display the git branch name."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
            await app.push_screen(screen)
            await pilot.pause()
            text = app.query("*")
            rendered_texts = []
            for widget in text:
                try:
                    r = widget.render()
                    if hasattr(r, "plain"):
                        rendered_texts.append(r.plain)
                    else:
                        rendered_texts.append(str(r))
                except Exception:
                    pass
            all_text = " ".join(rendered_texts)
            assert "feature/110-2" in all_text or "110-2" in all_text, (
                f"Git branch should appear in dossier, got: {all_text[:200]}"
            )

    async def test_shows_pr_link(self) -> None:
        """Dossier should display the PR link when available."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
            await app.push_screen(screen)
            await pilot.pause()
            text = app.query("*")
            rendered_texts = []
            for widget in text:
                try:
                    r = widget.render()
                    if hasattr(r, "plain"):
                        rendered_texts.append(r.plain)
                    else:
                        rendered_texts.append(str(r))
                except Exception:
                    pass
            all_text = " ".join(rendered_texts)
            assert "pull/42" in all_text or "PR" in all_text or "pr" in all_text.lower(), (
                f"PR link should appear in dossier, got: {all_text[:200]}"
            )


# ===========================================================================
# AC5: Escape pops back to sprint overview
# ===========================================================================


class TestEscapePopsBBack:
    """AC5: Escape key on StoryDetailScreen pops back to sprint overview."""

    def test_escape_binding_action_is_pop_screen(self) -> None:
        """Escape binding action should be 'pop_screen'."""
        escape_bindings = [
            b for b in StoryDetailScreen.BINDINGS if b.key == "escape"
        ]
        assert len(escape_bindings) == 1
        assert escape_bindings[0].action == "pop_screen"

    async def test_escape_pops_screen(self) -> None:
        """Pressing Escape on StoryDetailScreen should pop back to main app."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            screen = StoryDetailScreen(story_data=SAMPLE_STORY_DETAIL)
            await app.push_screen(screen)
            await pilot.pause()
            # Verify we're on the detail screen
            assert isinstance(app.screen, StoryDetailScreen), (
                "Should be on StoryDetailScreen after push"
            )
            # Press Escape
            await pilot.press("escape")
            await pilot.pause()
            # Should be back on the main screen (not StoryDetailScreen)
            assert not isinstance(app.screen, StoryDetailScreen), (
                "After Escape, should pop back from StoryDetailScreen"
            )


# ===========================================================================
# AC6: Enter on PR link opens browser via webbrowser.open()
# ===========================================================================


class TestPRLinkBrowserOpen:
    """AC6: Enter on PR link opens browser."""

    def test_get_pr_url_returns_url(self, detail_screen: StoryDetailScreen) -> None:
        """get_pr_url should return the PR URL from story data."""
        url = detail_screen.get_pr_url()
        assert url is not None, "get_pr_url should return URL when pr_url exists in data"
        assert url == "https://github.com/user/pennyfarthing/pull/42", (
            f"Expected PR URL, got: {url}"
        )

    def test_get_pr_url_returns_none_when_no_url(self, empty_detail_screen: StoryDetailScreen) -> None:
        """get_pr_url should return None when no pr_url in story data."""
        url = empty_detail_screen.get_pr_url()
        assert url is None, (
            f"get_pr_url should return None for empty data, got: {url}"
        )

    @patch("webbrowser.open")
    def test_open_pr_link_calls_webbrowser(
        self, mock_open: MagicMock, detail_screen: StoryDetailScreen
    ) -> None:
        """action_open_pr_link should call webbrowser.open with PR URL."""
        detail_screen.action_open_pr_link()
        mock_open.assert_called_once_with(
            "https://github.com/user/pennyfarthing/pull/42"
        )

    @patch("webbrowser.open")
    def test_open_pr_link_returns_true_on_success(
        self, mock_open: MagicMock, detail_screen: StoryDetailScreen
    ) -> None:
        """action_open_pr_link should return True when URL exists and opens."""
        result = detail_screen.action_open_pr_link()
        assert result is True, (
            f"action_open_pr_link should return True on success, got {result}"
        )

    @patch("webbrowser.open")
    def test_open_pr_link_returns_false_no_url(
        self, mock_open: MagicMock, empty_detail_screen: StoryDetailScreen
    ) -> None:
        """action_open_pr_link should return False when no PR URL."""
        result = empty_detail_screen.action_open_pr_link()
        assert result is False, (
            f"action_open_pr_link should return False when no URL, got {result}"
        )
        mock_open.assert_not_called()


# ===========================================================================
# Edge Cases & Integration
# ===========================================================================


class TestDrillThroughIntegration:
    """Integration: SprintPanel Enter key pushes StoryDetailScreen."""

    def test_drill_into_story_method_exists(self, panel: SprintPanel) -> None:
        """SprintPanel should have drill_into_story method."""
        assert hasattr(panel, "drill_into_story"), (
            "SprintPanel should have drill_into_story method"
        )
        assert callable(panel.drill_into_story)

    async def test_enter_on_selected_story_pushes_detail_screen(self) -> None:
        """Pressing Enter with a selected story should push StoryDetailScreen."""
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            # Get the sprint panel and set it up
            panels = app.query(SprintPanel)
            if len(panels) > 0:
                sprint_panel = panels.first()
                sprint_panel._last_payload = SAMPLE_PAYLOAD
                sprint_panel._selected_story = 1  # Select "110-2"
                sprint_panel._mounted = True
                sprint_panel.focus()
                await pilot.pause()

                # Press Enter to drill through
                await pilot.press("enter")
                await pilot.pause()

                # Should now be on StoryDetailScreen
                assert isinstance(app.screen, StoryDetailScreen), (
                    f"After Enter, should be on StoryDetailScreen, got {type(app.screen).__name__}"
                )


class TestEdgeCases:
    """Edge cases for story navigation and detail screen."""

    def test_story_nav_with_empty_epics(self) -> None:
        """Story navigation should be safe with empty epics list."""
        panel = SprintPanel()
        panel._last_payload = {**SAMPLE_PAYLOAD, "epics": []}
        panel._mounted = True
        # Should not raise
        panel.next_story()
        panel.prev_story()
        assert panel._selected_story == -1

    def test_story_nav_with_empty_stories_in_epic(self) -> None:
        """Story navigation should handle epic with zero stories."""
        panel = SprintPanel()
        panel._last_payload = {
            **SAMPLE_PAYLOAD,
            "epics": [{"id": "99", "title": "Empty", "stories": []}],
        }
        panel._mounted = True
        panel.next_story()
        assert panel._selected_story == -1, (
            "Should stay at -1 when epic has no stories"
        )

    def test_detail_screen_with_no_acceptance_criteria(self) -> None:
        """StoryDetailScreen should handle story data with no ACs."""
        data = {**SAMPLE_STORY_DETAIL, "acceptance_criteria": []}
        screen = StoryDetailScreen(story_data=data)
        # compose should not crash
        widgets = list(screen.compose())
        # May be empty for stub, but should not raise
        assert isinstance(widgets, list)

    def test_detail_screen_with_none_pr_url(self) -> None:
        """StoryDetailScreen should handle None pr_url gracefully."""
        data = {**SAMPLE_STORY_DETAIL, "pr_url": None}
        screen = StoryDetailScreen(story_data=data)
        url = screen.get_pr_url()
        assert url is None

    def test_fetch_returns_id_field(self, tmp_path) -> None:
        """Fetched story detail should include the story ID."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "id" in result, (
            f"Result should contain 'id' key, got keys: {list(result.keys())}"
        )

    def test_fetch_returns_status_field(self, tmp_path) -> None:
        """Fetched story detail should include the status field."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "status" in result, (
            f"Result should contain 'status' key, got keys: {list(result.keys())}"
        )

    def test_fetch_returns_points_field(self, tmp_path) -> None:
        """Fetched story detail should include the points field."""
        result = fetch_story_detail("110-2", project_root=str(tmp_path))
        assert "points" in result, (
            f"Result should contain 'points' key, got keys: {list(result.keys())}"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _noop_coroutine() -> None:
    """No-op coroutine for mocking async client.connect()."""
    pass
