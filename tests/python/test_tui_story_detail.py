"""Tests for Story Drill-Through with Dossier Detail Screen (Story 110-2).

Epic: 110 — Frame TUI TUI — Interactive Command Center (MSSCI-15186)

Acceptance Criteria:
- [AC1] Add per-story cursor to SprintPanel (arrow keys within expanded epic)
- [AC2] Create StoryDetailScreen extending Textual Screen with push/pop
- [AC3] Fetch story detail data (AC, session, workflow) via file read or API
- [AC4] Render dossier layout: header, AC progress, workflow phase, git info
- [AC5] Escape pops back to sprint overview
- [AC6] Enter on PR link opens browser via webbrowser.open()

Tests should FAIL until implementation is complete (RED state).

Run with: python -m pytest tests/python/test_tui_story_detail.py -v
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from pf.tui.sprint_panel import SprintPanel
from pf.tui.story_detail_data import (
    _check_context_files,
    fetch_story_detail,
)
from pf.tui.story_detail_screen import StoryDetailScreen
from textual.screen import Screen

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
            "title": "Frame TUI TUI — Interactive Command Center",
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


SESSION_110_2_MD = """\
# Story 110-2: Story drill-through with dossier detail screen

**Jira:** MSSCI-15186
**Branch:** feature/110-2-story-drill-through-dossier
**Workflow:** tdd
**Phase:** red
**Points:** 5

## Acceptance Criteria

1. Per-story cursor in SprintPanel
2. StoryDetailScreen with push/pop
3. Fetch story detail data
4. Render dossier layout
5. Escape pops back
6. Enter opens PR link

## Session Log

Story initialized by SM
"""


@pytest.fixture
def project_with_session(tmp_path):
    """Create a tmp project root with a 110-2 session file."""
    (tmp_path / ".pennyfarthing").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "110-2-session.md").write_text(SESSION_110_2_MD)
    return str(tmp_path)


@pytest.fixture
def mock_client() -> MagicMock:
    """Create a mock FrameClient."""
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


# ===========================================================================
# AC1: Add per-story cursor to SprintPanel (arrow keys within expanded epic)
# ===========================================================================


class TestStoryNavigationState:
    """AC1: SprintPanel tree cursor navigates stories via native Tree widget."""

    def test_get_selected_story_default_none(self) -> None:
        """Default get_selected_story should return None (no tree data)."""
        p = SprintPanel()
        assert p.get_selected_story() is None

    def test_next_epic_safe_without_mount(self) -> None:
        """next_epic() should not crash on unmounted panel."""
        p = SprintPanel()
        p.next_epic()  # should not raise

    def test_prev_epic_safe_without_mount(self) -> None:
        """prev_epic() should not crash on unmounted panel."""
        p = SprintPanel()
        p.prev_epic()  # should not raise

    def test_toggle_epic_safe_without_mount(self) -> None:
        """toggle_epic() should not crash on unmounted panel."""
        p = SprintPanel()
        p.toggle_epic()  # should not raise

    def test_drill_into_story_safe_without_mount(self) -> None:
        """drill_into_story() should not crash when no story selected."""
        p = SprintPanel()
        p.drill_into_story()  # should not raise

    async def test_tree_has_epic_nodes_after_data(self) -> None:
        """Tree should have epic nodes after receiving sprint data."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree(SAMPLE_PAYLOAD)
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            assert len(tree.root.children) == 2, (
                f"Tree should have 2 epic nodes, got {len(tree.root.children)}"
            )

    async def test_tree_epic_has_story_children(self) -> None:
        """Epic node should have story leaf children."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree(SAMPLE_PAYLOAD)
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            epic_110 = tree.root.children[0]
            assert len(epic_110.children) == 3, (
                f"Epic 110 should have 3 stories, got {len(epic_110.children)}"
            )

    async def test_get_selected_story_returns_data_on_story_node(self) -> None:
        """get_selected_story should return data when cursor is on a story."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree(SAMPLE_PAYLOAD)
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            epic_110 = tree.root.children[0]
            epic_110.expand()
            tree.move_cursor(epic_110.children[0])
            await pilot.pause()
            story = sprint.get_selected_story()
            assert story is not None, "Should return story data when on story node"
            assert story["id"] == "110-1"

    async def test_get_selected_story_none_on_epic_node(self) -> None:
        """get_selected_story should return None when cursor is on an epic node."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree(SAMPLE_PAYLOAD)
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            tree.move_cursor(tree.root.children[0])
            await pilot.pause()
            story = sprint.get_selected_story()
            assert story is None, "Should return None when cursor is on epic node"


class TestStoryNavigationBindings:
    """AC1: Tree widget handles arrow key and enter bindings natively."""

    def test_tree_widget_in_compose(self) -> None:
        """SprintPanel compose should include a Tree widget."""
        panel = SprintPanel()
        widgets = list(panel.compose())
        from textual.widgets import Tree

        tree_widgets = [w for w in widgets if isinstance(w, Tree)]
        assert len(tree_widgets) == 1, "SprintPanel should compose exactly one Tree"

    def test_tree_has_node_selected_handler(self) -> None:
        """SprintPanel should handle Tree.NodeSelected for drill-through."""
        assert hasattr(SprintPanel, "on_tree_node_selected"), (
            "SprintPanel should handle on_tree_node_selected for Enter key"
        )

    def test_has_compat_navigation_methods(self) -> None:
        """SprintPanel should expose next_epic/prev_epic/toggle_epic compat methods."""
        p = SprintPanel()
        assert callable(getattr(p, "next_epic", None))
        assert callable(getattr(p, "prev_epic", None))
        assert callable(getattr(p, "toggle_epic", None))


class TestStoryNavigationRender:
    """AC1: Tree renders story data as labeled nodes."""

    async def test_tree_story_nodes_contain_story_ids(self) -> None:
        """Tree story leaf labels should contain story IDs."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree(SAMPLE_PAYLOAD)
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            epic_110 = tree.root.children[0]
            # Check story leaf data
            story_ids = [c.data["story"]["id"] for c in epic_110.children]
            assert "110-1" in story_ids
            assert "110-2" in story_ids
            assert "110-3" in story_ids

    async def test_tree_story_nodes_have_status_badges(self) -> None:
        """Tree story labels should include status symbol (not text)."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree(SAMPLE_PAYLOAD)
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            epic_110 = tree.root.children[0]
            # First story is "done" — label should contain ✓ symbol, not "done" text
            first_label = epic_110.children[0].label.plain
            assert "\u2713" in first_label, (
                f"Done story label should contain \u2713 symbol, got: {first_label}"
            )
            assert "done" not in first_label, (
                f"Done story label should NOT contain 'done' text, got: {first_label}"
            )

    def test_get_selected_story_returns_none_when_unselected(self, panel: SprintPanel) -> None:
        """get_selected_story should return None when no tree is mounted."""
        story = panel.get_selected_story()
        assert story is None, (
            "get_selected_story should return None when tree has no cursor"
        )


# ===========================================================================
# AC2: Create StoryDetailScreen extending Textual Screen with push/pop
# ===========================================================================


class TestStoryDetailScreenClass:
    """AC2: StoryDetailScreen is a proper Textual Screen."""

    def test_importable(self) -> None:
        """StoryDetailScreen should be importable."""
        from pf.tui.story_detail_screen import StoryDetailScreen

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
        # Enrichment may add extra keys; verify passed data is preserved
        for key, val in SAMPLE_STORY_DETAIL.items():
            if val is not None and val != []:
                assert screen._story_data.get(key) == val, (
                    f"Expected {key}={val!r}, got {screen._story_data.get(key)!r}"
                )

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
        from pf.tui.story_detail_data import fetch_story_detail

        assert fetch_story_detail is not None

    def test_returns_dict(self) -> None:
        """fetch_story_detail should return a dict."""
        result = fetch_story_detail("110-2")
        assert isinstance(result, dict), (
            f"Expected dict, got {type(result).__name__}"
        )

    def test_contains_title(self, project_with_session) -> None:
        """Result should contain 'title' key with story title."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "title" in result, (
            f"Result should contain 'title' key, got keys: {list(result.keys())}"
        )
        assert isinstance(result["title"], str) and len(result["title"]) > 0, (
            "Title should be a non-empty string"
        )

    def test_contains_acceptance_criteria(self, project_with_session) -> None:
        """Result should contain 'acceptance_criteria' as a list."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "acceptance_criteria" in result, (
            f"Result should contain 'acceptance_criteria', got keys: {list(result.keys())}"
        )
        assert isinstance(result["acceptance_criteria"], list), (
            "acceptance_criteria should be a list"
        )

    def test_acceptance_criteria_items_have_text_and_done(self, project_with_session) -> None:
        """Each AC item should have 'text' and 'done' fields."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        acs = result.get("acceptance_criteria", [])
        assert len(acs) > 0, "Should have at least one AC"
        for ac in acs:
            assert "text" in ac, f"AC item missing 'text': {ac}"
            assert "done" in ac, f"AC item missing 'done': {ac}"

    def test_contains_workflow_phase(self, project_with_session) -> None:
        """Result should contain 'workflow_phase' key."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "workflow_phase" in result, (
            f"Result should contain 'workflow_phase', got keys: {list(result.keys())}"
        )

    def test_contains_git_branch(self, project_with_session) -> None:
        """Result should contain 'git_branch' key."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "git_branch" in result, (
            f"Result should contain 'git_branch', got keys: {list(result.keys())}"
        )

    def test_contains_pr_url(self, project_with_session) -> None:
        """Result should contain 'pr_url' key (may be None if no PR)."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "pr_url" in result, (
            f"Result should contain 'pr_url', got keys: {list(result.keys())}"
        )

    def test_contains_session_notes(self, project_with_session) -> None:
        """Result should contain 'session_notes' key."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "session_notes" in result, (
            f"Result should contain 'session_notes', got keys: {list(result.keys())}"
        )

    def test_contains_workflow_name(self, project_with_session) -> None:
        """Result should contain 'workflow' key with workflow name."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
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
        from pf.tui.app import TuiApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

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
        from pf.tui.app import TuiApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

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
            assert "per-story cursor" in all_text.lower() or "acceptance" in all_text.lower() or "ac " in all_text.lower(), (
                f"AC checklist should appear in dossier, got: {all_text[:200]}"
            )

    async def test_shows_workflow_phase(self) -> None:
        """Dossier should display the current workflow phase."""
        from pf.tui.app import TuiApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

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
        from pf.tui.app import TuiApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

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
        from pf.tui.app import TuiApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

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
        from pf.tui.app import TuiApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

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
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)

        async with app.run_test() as pilot:
            sprint_panel = app.query_one("#panel-sprint", SprintPanel)
            sprint_panel._mounted = True
            sprint_panel._rebuild_tree(SAMPLE_PAYLOAD)
            await pilot.pause()

            # Move cursor to a story node and press Enter
            tree = sprint_panel.query_one("#sprint-tree", Tree)
            epic_110 = tree.root.children[0]
            epic_110.expand()
            tree.move_cursor(epic_110.children[1])  # "110-2"
            sprint_panel.focus()
            await pilot.pause()

            await pilot.press("enter")
            await pilot.pause()

            assert isinstance(app.screen, StoryDetailScreen), (
                f"After Enter, should be on StoryDetailScreen, got {type(app.screen).__name__}"
            )


class TestEdgeCases:
    """Edge cases for story navigation and detail screen."""

    async def test_tree_with_empty_epics(self) -> None:
        """Tree rebuild should be safe with empty epics list."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree({**SAMPLE_PAYLOAD, "epics": []})
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            assert len(tree.root.children) == 0

    async def test_tree_with_empty_stories_in_epic(self) -> None:
        """Tree should handle epic with zero stories."""
        from pf.tui.app import TuiApp
        from textual.widgets import Tree

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = TuiApp(client=mock_client)
        async with app.run_test() as pilot:
            sprint = app.query_one("#panel-sprint", SprintPanel)
            sprint._mounted = True
            sprint._rebuild_tree({
                **SAMPLE_PAYLOAD,
                "epics": [{"id": "99", "title": "Empty", "stories": []}],
            })
            await pilot.pause()
            tree = sprint.query_one("#sprint-tree", Tree)
            assert len(tree.root.children) == 1
            assert len(tree.root.children[0].children) == 0

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

    def test_fetch_returns_id_field(self, project_with_session) -> None:
        """Fetched story detail should include the story ID."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "id" in result, (
            f"Result should contain 'id' key, got keys: {list(result.keys())}"
        )

    def test_fetch_returns_status_field(self, project_with_session) -> None:
        """Fetched story detail should include the status field."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "status" in result, (
            f"Result should contain 'status' key, got keys: {list(result.keys())}"
        )

    def test_fetch_returns_points_field(self, project_with_session) -> None:
        """Fetched story detail should include the points field."""
        result = fetch_story_detail("110-2", project_root=project_with_session)
        assert "points" in result, (
            f"Result should contain 'points' key, got keys: {list(result.keys())}"
        )


# ===========================================================================
# Enrichment: StoryDetailScreen calls fetch_story_detail
# ===========================================================================


class TestStoryDetailEnrichment:
    """Verify StoryDetailScreen calls fetch_story_detail and merges data."""

    @patch("pf.tui.story_detail_data.fetch_story_detail")
    def test_enrichment_called(self, mock_fetch: MagicMock) -> None:
        """StoryDetailScreen should call fetch_story_detail with story ID."""
        mock_fetch.return_value = {"id": "110-2", "workflow": "tdd", "workflow_phase": "red"}
        ws_data = {"id": "110-2", "title": "Drill", "points": 5, "status": "in-progress"}
        _screen = StoryDetailScreen(story_data=ws_data)
        mock_fetch.assert_called_once_with("110-2", jira_key="")

    @patch("pf.tui.story_detail_data.fetch_story_detail")
    def test_ws_data_wins_for_non_null(self, mock_fetch: MagicMock) -> None:
        """WS data should override enriched data for non-null fields."""
        mock_fetch.return_value = {
            "id": "110-2", "title": "From file", "points": 3,
            "workflow": "tdd", "workflow_phase": "red",
        }
        ws_data = {"id": "110-2", "title": "From WS", "points": 5, "status": "in-progress"}
        screen = StoryDetailScreen(story_data=ws_data)
        assert screen._story_data["title"] == "From WS"
        assert screen._story_data["points"] == 5
        assert screen._story_data["workflow"] == "tdd"

    @patch("pf.tui.story_detail_data.fetch_story_detail")
    def test_enrichment_failure_resilient(self, mock_fetch: MagicMock) -> None:
        """StoryDetailScreen should survive fetch_story_detail failure."""
        mock_fetch.side_effect = Exception("disk error")
        ws_data = {"id": "110-2", "title": "Drill", "points": 5}
        screen = StoryDetailScreen(story_data=ws_data)
        assert screen._story_data["title"] == "Drill"

    def test_no_enrichment_without_id(self) -> None:
        """StoryDetailScreen with no ID should not attempt enrichment."""
        screen = StoryDetailScreen(story_data={"title": "No ID"})
        assert screen._story_data["title"] == "No ID"


# ===========================================================================
# Context file checks
# ===========================================================================


class TestContextFileChecks:
    """Verify _check_context_files detects epic/story context files."""

    def test_no_context_files(self, tmp_path) -> None:
        """Returns False for both when no files exist."""
        result = _check_context_files("110-2", str(tmp_path))
        assert result["has_epic_context"] is False
        assert result["has_story_context"] is False

    def test_epic_context_present(self, tmp_path) -> None:
        """Detects epic context file."""
        ctx_dir = tmp_path / "sprint" / "context"
        ctx_dir.mkdir(parents=True)
        (ctx_dir / "context-epic-110.md").write_text("# Epic 110 Context")
        result = _check_context_files("110-2", str(tmp_path))
        assert result["has_epic_context"] is True
        assert "context-epic-110.md" in result["epic_context_path"]

    def test_story_context_present(self, tmp_path) -> None:
        """Detects story context file."""
        ctx_dir = tmp_path / "sprint" / "context"
        ctx_dir.mkdir(parents=True)
        (ctx_dir / "context-story-110-2.md").write_text("# Story 110-2 Context")
        result = _check_context_files("110-2", str(tmp_path))
        assert result["has_story_context"] is True
        assert "context-story-110-2.md" in result["story_context_path"]

    def test_both_contexts_present(self, tmp_path) -> None:
        """Detects both epic and story context files."""
        ctx_dir = tmp_path / "sprint" / "context"
        ctx_dir.mkdir(parents=True)
        (ctx_dir / "context-epic-110.md").write_text("# Epic")
        (ctx_dir / "context-story-110-2.md").write_text("# Story")
        result = _check_context_files("110-2", str(tmp_path))
        assert result["has_epic_context"] is True
        assert result["has_story_context"] is True

    def test_none_project_root(self) -> None:
        """Returns all False with None project root."""
        result = _check_context_files("110-2", None)
        assert result["has_epic_context"] is False
        assert result["has_story_context"] is False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _noop_coroutine() -> None:
    """No-op coroutine for mocking async client.connect()."""
    pass
