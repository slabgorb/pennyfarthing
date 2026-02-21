"""Tests for StoryDetailWidget and enriched story detail views (Story 120-8).

Epic: 120 — BikeRack TUI Enhancements (MSSCI-15396)

Acceptance Criteria:
- [AC1] New StoryDetailWidget exists as a reusable Textual Widget with compose()
- [AC2] StoryDetailWidget uses Collapsible sections for ACs, Workflow, Git, Context, Session Notes
- [AC3] StoryDetailWidget uses Rule for section separators (not Rich Text dashes)
- [AC4] Absent sections (no data) are omitted entirely — Tufte pattern preserved
- [AC5] StoryDetailScreen delegates rendering to StoryDetailWidget inside a VerticalScroll
- [AC6] StoryDetailScreen keybindings preserved: Escape=back, Enter=open PR
- [AC7] ProgressPanel gains Enter keybinding that pushes StoryDetailScreen with current story data
- [AC8] Progress panel shows "[Enter] Story Details" hint when a story is active
- [AC9] Collapsible sections are keyboard-navigable (Tab between sections, Enter to toggle)
- [AC10] Existing story_detail_data.py enrichment logic reused (not duplicated)

Tests should FAIL until implementation is complete (RED state).

Run with: python -m pytest tests/python/test_bikerack_story_detail_widget.py -v
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

from pf.bikerack.story_detail_screen import StoryDetailScreen
from textual.widget import Widget
from textual.widgets import Collapsible, Rule, Static

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FULL_STORY_DATA: dict[str, Any] = {
    "id": "120-8",
    "title": "Story details and progress page enrichment with native Textual widgets",
    "points": 3,
    "status": "in_progress",
    "priority": "p2",
    "jiraKey": "MSSCI-15412",
    "assignee": "K. Avery",
    "acceptance_criteria": [
        {"text": "StoryDetailWidget exists as reusable Widget", "done": True},
        {"text": "Uses Collapsible sections", "done": True},
        {"text": "Uses Rule separators", "done": False},
        {"text": "Absent sections omitted", "done": False},
    ],
    "workflow": "bdd",
    "workflow_phase": "design",
    "git_branch": "feat/120-8-story-details-progress-textual-widgets",
    "pr_url": "https://github.com/user/pennyfarthing/pull/99",
    "session_notes": "Story 120-8 set up for BDD workflow.",
    "has_epic_context": True,
    "has_story_context": False,
}

MINIMAL_STORY_DATA: dict[str, Any] = {
    "id": "120-8",
    "title": "Story details enrichment",
    "points": 3,
    "status": "backlog",
}

NO_AC_STORY_DATA: dict[str, Any] = {
    **FULL_STORY_DATA,
    "acceptance_criteria": [],
}

NO_GIT_STORY_DATA: dict[str, Any] = {
    **FULL_STORY_DATA,
    "git_branch": "",
    "pr_url": None,
}

NO_WORKFLOW_STORY_DATA: dict[str, Any] = {
    **FULL_STORY_DATA,
    "workflow": "",
    "workflow_phase": "",
}


async def _noop_coroutine() -> None:
    """No-op coroutine for mocking async client.connect()."""
    pass


# ===========================================================================
# AC1: StoryDetailWidget exists as a reusable Textual Widget with compose()
# ===========================================================================


class TestStoryDetailWidgetExists:
    """AC1: StoryDetailWidget is importable and is a proper Textual Widget."""

    def test_importable(self) -> None:
        """StoryDetailWidget should be importable from bikerack.story_detail_widget."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        assert StoryDetailWidget is not None

    def test_is_textual_widget(self) -> None:
        """StoryDetailWidget should be a subclass of textual.widget.Widget."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        assert issubclass(StoryDetailWidget, Widget), (
            f"StoryDetailWidget should extend Widget, bases: {StoryDetailWidget.__bases__}"
        )

    def test_accepts_story_data(self) -> None:
        """StoryDetailWidget constructor should accept a story_data dict."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        assert widget._story_data == FULL_STORY_DATA

    def test_has_compose_method(self) -> None:
        """StoryDetailWidget should have a compose() method."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        assert hasattr(widget, "compose")
        assert callable(widget.compose)

    def test_compose_yields_widgets(self) -> None:
        """StoryDetailWidget.compose() should yield Textual widgets."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        assert len(children) > 0, "compose() should yield at least one widget"
        for child in children:
            assert isinstance(child, Widget), (
                f"compose() should yield Widget instances, got {type(child).__name__}"
            )

    def test_empty_data_compose_yields_header_only(self) -> None:
        """StoryDetailWidget with empty data should still yield at least a header."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data={})
        children = list(widget.compose())
        assert len(children) >= 1, "Should yield at least a header with empty data"


# ===========================================================================
# AC2: StoryDetailWidget uses Collapsible sections
# ===========================================================================


class TestCollapsibleSections:
    """AC2: Widget uses Collapsible for ACs, Workflow, Git, Context, Session Notes."""

    def test_compose_contains_collapsible_widgets(self) -> None:
        """compose() should yield Collapsible widgets for sections."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        assert len(collapsibles) >= 3, (
            f"Expected at least 3 Collapsible sections, got {len(collapsibles)}"
        )

    def test_ac_section_is_collapsible(self) -> None:
        """Acceptance criteria should be in a Collapsible section."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [c.title for c in collapsibles]
        ac_found = any("acceptance" in str(t).lower() or "ac" in str(t).lower() for t in titles)
        assert ac_found, (
            f"Should have an AC Collapsible section, got titles: {titles}"
        )

    def test_workflow_section_is_collapsible(self) -> None:
        """Workflow should be in a Collapsible section."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [c.title for c in collapsibles]
        wf_found = any("workflow" in str(t).lower() for t in titles)
        assert wf_found, (
            f"Should have a Workflow Collapsible section, got titles: {titles}"
        )

    def test_git_section_is_collapsible(self) -> None:
        """Git info should be in a Collapsible section."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [c.title for c in collapsibles]
        git_found = any("git" in str(t).lower() for t in titles)
        assert git_found, (
            f"Should have a Git Collapsible section, got titles: {titles}"
        )

    def test_session_notes_section_is_collapsible(self) -> None:
        """Session notes should be in a Collapsible section."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [c.title for c in collapsibles]
        notes_found = any("session" in str(t).lower() or "notes" in str(t).lower() for t in titles)
        assert notes_found, (
            f"Should have a Session Notes Collapsible section, got titles: {titles}"
        )


# ===========================================================================
# AC3: StoryDetailWidget uses Rule for section separators
# ===========================================================================


class TestRuleSeparators:
    """AC3: Widget uses textual.widgets.Rule instead of Rich Text dashes."""

    def test_compose_contains_rule_widgets(self) -> None:
        """compose() should yield Rule widgets as separators."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        rules = [c for c in children if isinstance(c, Rule)]
        assert len(rules) >= 2, (
            f"Expected at least 2 Rule separators, got {len(rules)}"
        )

    def test_no_rich_text_dash_separators(self) -> None:
        """compose() should NOT yield Static widgets that are dash-only separators."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        for child in children:
            if isinstance(child, Static) and not isinstance(child, Collapsible):
                # Check the content passed to Static constructor
                content = child._renderable if hasattr(child, "_renderable") else None
                if content is None:
                    continue
                text = content.plain if hasattr(content, "plain") else str(content)
                # Should not contain a line of dashes as separator
                dash_line = "\u2500" * 10  # ──────────
                assert dash_line not in text, (
                    f"Should use Rule widget, not Rich Text dashes: {text[:50]}"
                )


# ===========================================================================
# AC4: Absent sections omitted — Tufte pattern
# ===========================================================================


class TestAbsentSections:
    """AC4: Sections with no data are omitted entirely."""

    def test_no_ac_section_when_no_criteria(self) -> None:
        """Widget with no ACs should not yield an AC Collapsible."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=NO_AC_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [str(c.title).lower() for c in collapsibles]
        ac_found = any("acceptance" in t or "ac " in t or t.startswith("ac") for t in titles)
        assert not ac_found, (
            f"Should NOT have AC section when no criteria, got titles: {titles}"
        )

    def test_no_git_section_when_no_branch(self) -> None:
        """Widget with no git data should not yield a Git Collapsible."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=NO_GIT_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [str(c.title).lower() for c in collapsibles]
        git_found = any("git" in t for t in titles)
        assert not git_found, (
            f"Should NOT have Git section when no branch/PR, got titles: {titles}"
        )

    def test_no_workflow_section_when_no_workflow(self) -> None:
        """Widget with no workflow should not yield a Workflow Collapsible."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=NO_WORKFLOW_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [str(c.title).lower() for c in collapsibles]
        wf_found = any("workflow" in t for t in titles)
        assert not wf_found, (
            f"Should NOT have Workflow section when no workflow, got titles: {titles}"
        )

    def test_no_notes_section_when_no_notes(self) -> None:
        """Widget with no session notes should not yield a Notes Collapsible."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        data = {**FULL_STORY_DATA, "session_notes": ""}
        widget = StoryDetailWidget(story_data=data)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        titles = [str(c.title).lower() for c in collapsibles]
        notes_found = any("session" in t or "notes" in t for t in titles)
        assert not notes_found, (
            f"Should NOT have Notes section when no notes, got titles: {titles}"
        )

    def test_minimal_data_yields_fewer_sections(self) -> None:
        """Widget with minimal data should yield fewer children than full data."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        full_widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        min_widget = StoryDetailWidget(story_data=MINIMAL_STORY_DATA)
        full_children = list(full_widget.compose())
        min_children = list(min_widget.compose())
        assert len(min_children) < len(full_children), (
            f"Minimal data ({len(min_children)} children) should yield fewer "
            f"widgets than full data ({len(full_children)} children)"
        )


# ===========================================================================
# AC5: StoryDetailScreen delegates to StoryDetailWidget inside VerticalScroll
# ===========================================================================


class TestScreenDelegation:
    """AC5: StoryDetailScreen uses StoryDetailWidget instead of inline Static."""

    def test_screen_compose_yields_story_detail_widget(self) -> None:
        """StoryDetailScreen.compose() should yield a container with StoryDetailWidget."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget
        from textual.containers import VerticalScroll

        screen = StoryDetailScreen(story_data=FULL_STORY_DATA)
        children = list(screen.compose())
        # VerticalScroll stores constructor children in _pending_children
        found = False
        for child in children:
            if isinstance(child, VerticalScroll):
                for pending in getattr(child, "_pending_children", []):
                    if isinstance(pending, StoryDetailWidget):
                        found = True
                        break
            if isinstance(child, StoryDetailWidget):
                found = True

        assert found, (
            f"StoryDetailScreen should compose StoryDetailWidget, got: "
            f"{[type(c).__name__ for c in children]}"
        )

    def test_screen_has_vertical_scroll(self) -> None:
        """StoryDetailScreen should wrap content in a VerticalScroll."""
        from textual.containers import VerticalScroll

        screen = StoryDetailScreen(story_data=FULL_STORY_DATA)
        children = list(screen.compose())
        scroll_found = any(isinstance(c, VerticalScroll) for c in children)
        assert scroll_found, (
            f"StoryDetailScreen should use VerticalScroll, got: "
            f"{[type(c).__name__ for c in children]}"
        )

    def test_screen_does_not_use_inline_static_sections(self) -> None:
        """StoryDetailScreen should NOT compose multiple Static widgets for sections."""
        screen = StoryDetailScreen(story_data=FULL_STORY_DATA)
        children = list(screen.compose())
        # Old implementation had 6+ Static widgets directly. New should have 1-2 tops
        # (VerticalScroll containing StoryDetailWidget)
        direct_statics = [c for c in children if isinstance(c, Static) and not isinstance(c, Collapsible)]
        assert len(direct_statics) <= 2, (
            f"Screen should delegate to StoryDetailWidget, not use {len(direct_statics)} "
            f"inline Static widgets (old pattern)"
        )


# ===========================================================================
# AC6: StoryDetailScreen keybindings preserved
# ===========================================================================


class TestScreenKeybindings:
    """AC6: Escape=back and Enter=open PR still work."""

    def test_escape_binding_exists(self) -> None:
        """StoryDetailScreen should still have Escape binding."""
        binding_keys = [b.key for b in StoryDetailScreen.BINDINGS]
        assert "escape" in binding_keys

    def test_escape_action_is_pop_screen(self) -> None:
        """Escape should trigger pop_screen action."""
        escape_bindings = [b for b in StoryDetailScreen.BINDINGS if b.key == "escape"]
        assert len(escape_bindings) > 0
        assert escape_bindings[0].action == "pop_screen"

    def test_enter_binding_exists(self) -> None:
        """StoryDetailScreen should still have Enter binding for PR."""
        binding_keys = [b.key for b in StoryDetailScreen.BINDINGS]
        assert "enter" in binding_keys

    def test_get_pr_url_still_works(self) -> None:
        """get_pr_url should still return the PR URL."""
        screen = StoryDetailScreen(story_data=FULL_STORY_DATA)
        url = screen.get_pr_url()
        assert url == "https://github.com/user/pennyfarthing/pull/99"

    @patch("webbrowser.open")
    def test_open_pr_link_still_works(self, mock_open: MagicMock) -> None:
        """action_open_pr_link should still call webbrowser.open."""
        screen = StoryDetailScreen(story_data=FULL_STORY_DATA)
        result = screen.action_open_pr_link()
        assert result is True
        mock_open.assert_called_once_with("https://github.com/user/pennyfarthing/pull/99")


# ===========================================================================
# AC7: ProgressPanel gains Enter keybinding for drill-through
# ===========================================================================


class TestProgressPanelDrillThrough:
    """AC7: ProgressPanel Enter key pushes StoryDetailScreen."""

    def test_progress_panel_has_drill_through_method(self) -> None:
        """ProgressPanel should have a method to push StoryDetailScreen."""
        from pf.bikerack.progress_panel import ProgressPanel

        panel = ProgressPanel()
        assert hasattr(panel, "drill_into_story") or hasattr(panel, "action_drill_detail"), (
            "ProgressPanel should have drill_into_story or action_drill_detail method"
        )

    async def test_progress_panel_enter_pushes_detail_screen(self) -> None:
        """Calling drill_into_story on ProgressPanel should push StoryDetailScreen."""
        from pf.bikerack.progress_panel import ProgressPanel
        from pf.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            progress = app.query_one("#panel-progress", ProgressPanel)
            # Feed story data to the panel
            progress._story_data = FULL_STORY_DATA
            progress._sprint_data = {
                "sprint": {"currentStory": "120-8"},
                "epics": [],
            }
            await pilot.pause()

            # Call drill-through directly (tests the method, not keybinding plumbing)
            progress.drill_into_story()
            await pilot.pause()

            assert isinstance(app.screen, StoryDetailScreen), (
                f"After drill_into_story, should be on StoryDetailScreen, "
                f"got {type(app.screen).__name__}"
            )


# ===========================================================================
# AC8: Progress panel shows hint when story is active
# ===========================================================================


class TestProgressPanelHint:
    """AC8: Progress panel shows '[Enter] Story Details' hint."""

    def test_hint_in_rendered_output_with_story(self) -> None:
        """Progress panel should show drill-through hint when story is active."""
        from pf.bikerack.progress_panel import ProgressPanel

        panel = ProgressPanel()
        panel._story_data = FULL_STORY_DATA
        panel._sprint_data = {
            "sprint": {"currentStory": "120-8"},
            "epics": [],
        }
        rendered = panel.render_panel({})
        # Convert to text to check for hint
        from io import StringIO

        from rich.console import Console

        buf = StringIO()
        console = Console(file=buf, width=80)
        console.print(rendered)
        output = buf.getvalue()

        assert "enter" in output.lower() and "detail" in output.lower(), (
            f"Should show '[Enter] Story Details' hint, got: {output[:200]}"
        )

    def test_no_hint_without_story(self) -> None:
        """Progress panel should NOT show hint when no story is active."""
        from pf.bikerack.progress_panel import ProgressPanel

        panel = ProgressPanel()
        panel._story_data = None
        panel._sprint_data = None
        rendered = panel.render_panel({})
        from io import StringIO

        from rich.console import Console

        buf = StringIO()
        console = Console(file=buf, width=80)
        console.print(rendered)
        output = buf.getvalue()

        # The "no active story" message should not have the drill-through hint
        assert "story details" not in output.lower() or "no active" in output.lower(), (
            "Should NOT show drill-through hint without active story"
        )


# ===========================================================================
# AC9: Collapsible sections are keyboard-navigable
# ===========================================================================


class TestKeyboardNavigation:
    """AC9: Collapsible sections support Tab and Enter navigation."""

    def test_collapsible_widgets_are_focusable(self) -> None:
        """Collapsible widgets should be focusable (Textual default)."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=FULL_STORY_DATA)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        assert len(collapsibles) > 0, "Should have at least one Collapsible"
        # Textual Collapsible is focusable by default — verify it hasn't been disabled
        for c in collapsibles:
            assert c.can_focus or c.can_focus_children, (
                f"Collapsible '{c.title}' should be focusable or have focusable children"
            )

    async def test_tab_navigates_between_sections(self) -> None:
        """Tab key should move focus between Collapsible sections."""
        from pf.bikerack.tui import BikeRackApp

        mock_client = MagicMock()
        mock_client.connect = MagicMock(return_value=_noop_coroutine())
        app = BikeRackApp(client=mock_client)

        async with app.run_test() as pilot:
            screen = StoryDetailScreen(story_data=FULL_STORY_DATA)
            await app.push_screen(screen)
            await pilot.pause()

            # Tab should cycle through focusable elements
            await pilot.press("tab")
            await pilot.pause()
            focused = app.focused
            assert focused is not None, (
                "Tab should focus an element within StoryDetailScreen"
            )


# ===========================================================================
# AC10: Enrichment logic reused (not duplicated)
# ===========================================================================


class TestEnrichmentReuse:
    """AC10: StoryDetailWidget uses story_detail_data.py enrichment, no duplication."""

    def test_widget_does_not_import_session_parsing(self) -> None:
        """StoryDetailWidget should NOT contain its own session parsing logic."""
        import inspect

        from pf.bikerack.story_detail_widget import StoryDetailWidget

        source = inspect.getsource(StoryDetailWidget)
        # Should not contain session file parsing — that's in story_detail_data.py
        assert "open(" not in source or ".session/" not in source, (
            "StoryDetailWidget should not parse session files directly — "
            "use story_detail_data.py enrichment"
        )

    @patch("pf.bikerack.story_detail_data.fetch_story_detail")
    def test_screen_still_calls_fetch_story_detail(self, mock_fetch: MagicMock) -> None:
        """StoryDetailScreen should still call fetch_story_detail for enrichment."""
        mock_fetch.return_value = {"id": "120-8", "workflow": "bdd"}
        ws_data = {"id": "120-8", "title": "Test", "status": "backlog"}
        _screen = StoryDetailScreen(story_data=ws_data)
        mock_fetch.assert_called_once_with("120-8")


# ===========================================================================
# Edge Cases
# ===========================================================================


class TestEdgeCases:
    """Edge cases and defensive behavior."""

    def test_widget_with_none_story_data(self) -> None:
        """StoryDetailWidget should handle None story_data gracefully."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        widget = StoryDetailWidget(story_data=None)
        children = list(widget.compose())
        assert isinstance(children, list)

    def test_widget_with_partial_ac_data(self) -> None:
        """Widget should handle ACs missing 'done' field."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        data = {**FULL_STORY_DATA, "acceptance_criteria": [
            {"text": "Missing done field"},
            {"text": "Has done", "done": True},
        ]}
        widget = StoryDetailWidget(story_data=data)
        children = list(widget.compose())
        assert isinstance(children, list)

    def test_widget_with_empty_string_fields(self) -> None:
        """Widget should treat empty strings as absent."""
        from pf.bikerack.story_detail_widget import StoryDetailWidget

        data = {
            "id": "120-8",
            "title": "",
            "workflow": "",
            "git_branch": "",
            "session_notes": "",
        }
        widget = StoryDetailWidget(story_data=data)
        children = list(widget.compose())
        collapsibles = [c for c in children if isinstance(c, Collapsible)]
        # Empty fields should result in fewer sections
        assert len(collapsibles) <= 1, (
            f"Empty fields should be treated as absent, got {len(collapsibles)} Collapsibles"
        )
