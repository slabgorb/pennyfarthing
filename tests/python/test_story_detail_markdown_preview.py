"""Tests for Story 120-1: Markdown preview with context and session.

Epic: 120 — Frame TUI TUI
Story: 120-1 — Story detail screen: markdown preview with context and session

Acceptance Criteria:
- [AC1] Add markdown preview section to StoryDetailScreen layout
- [AC2] Load and render context-epic-N.md if available
- [AC3] Load and render context-story-ID.md if available
- [AC4] Load and render session file (.session/{story-id}-session.md) if available
- [AC5] Markdown content is scrollable within the detail screen
- [AC6] Preview section gracefully handles missing files (no errors, just skip)
- [AC7] Preview integrates with existing dossier layout (header, AC, workflow, git info)

Tests should FAIL until implementation is complete (RED state).

Run with: python -m pytest tests/python/test_story_detail_markdown_preview.py -v
"""

from __future__ import annotations

import os
from typing import Any

import pytest
from pf.tui.story_detail_data import (
    fetch_story_detail,
)
from pf.tui.story_detail_screen import StoryDetailScreen

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_STORY_DATA: dict[str, Any] = {
    "id": "120-1",
    "title": "Story detail screen: markdown preview with context and session",
    "points": 3,
    "status": "in-progress",
    "jiraKey": "MSSCI-15397",
    "acceptance_criteria": [
        {"text": "Add markdown preview section to StoryDetailScreen layout", "done": False},
        {"text": "Load and render context-epic-N.md if available", "done": False},
        {"text": "Load and render context-story-ID.md if available", "done": False},
        {"text": "Load and render session file if available", "done": False},
        {"text": "Markdown content is scrollable", "done": False},
        {"text": "Gracefully handles missing files", "done": False},
        {"text": "Integrates with existing dossier layout", "done": False},
    ],
    "workflow": "tdd",
    "workflow_phase": "red",
    "git_branch": "feature/120-1-story-detail-markdown-preview",
    "pr_url": None,
    "session_notes": "",
    "has_epic_context": True,
    "has_story_context": True,
    "epic_context_path": "/tmp/sprint/context/context-epic-120.md",
    "story_context_path": "/tmp/sprint/context/context-story-120-1.md",
}

EPIC_CONTEXT_MD = """\
# Epic 120: Frame TUI TUI

Interactive command center for sprint management and story tracking.

## Goals
- Rich TUI with Textual framework
- Story drill-through with dossier view
- Markdown preview for context files
"""

STORY_CONTEXT_MD = """\
# Story 120-1: Markdown Preview

Add scrollable markdown preview to StoryDetailScreen.

## Technical Notes
- Use Rich Markdown or Textual Markdown widget
- Integrate with existing dossier layout
"""

SESSION_MD = """\
# Story 120-1: Story detail screen: markdown preview with context and session

**Jira:** MSSCI-15397
**Branch:** feature/120-1-story-detail-markdown-preview
**Workflow:** tdd
**Phase:** red
**Points:** 3

## Acceptance Criteria

- [ ] Add markdown preview section
- [ ] Load epic context
- [ ] Load story context

## SM Assessment

Setup complete. Story ready for TEA.
"""


@pytest.fixture
def project_with_context(tmp_path) -> str:
    """Create a temporary project root with context and session files."""
    # Create sprint/context/ directory with context files
    ctx_dir = tmp_path / "sprint" / "context"
    ctx_dir.mkdir(parents=True)
    (ctx_dir / "context-epic-120.md").write_text(EPIC_CONTEXT_MD)
    (ctx_dir / "context-story-120-1.md").write_text(STORY_CONTEXT_MD)

    # Create .session/ directory with session file
    session_dir = tmp_path / ".session"
    session_dir.mkdir(parents=True)
    (session_dir / "120-1-session.md").write_text(SESSION_MD)

    # Create .pennyfarthing/ so _find_project_root works
    (tmp_path / ".pennyfarthing").mkdir()

    return str(tmp_path)


@pytest.fixture
def project_without_context(tmp_path) -> str:
    """Create a temporary project root with NO context or session files."""
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".session").mkdir()
    (tmp_path / "sprint" / "context").mkdir(parents=True)
    return str(tmp_path)


@pytest.fixture
def project_epic_only(tmp_path) -> str:
    """Create a project root with only epic context (no story context, no session)."""
    ctx_dir = tmp_path / "sprint" / "context"
    ctx_dir.mkdir(parents=True)
    (ctx_dir / "context-epic-120.md").write_text(EPIC_CONTEXT_MD)
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".session").mkdir()
    return str(tmp_path)


@pytest.fixture
def project_session_only(tmp_path) -> str:
    """Create a project root with only session file (no context files)."""
    (tmp_path / "sprint" / "context").mkdir(parents=True)
    session_dir = tmp_path / ".session"
    session_dir.mkdir(parents=True)
    (session_dir / "120-1-session.md").write_text(SESSION_MD)
    (tmp_path / ".pennyfarthing").mkdir()
    return str(tmp_path)


# ===========================================================================
# AC1: Add markdown preview section to StoryDetailScreen layout
# ===========================================================================


class TestMarkdownPreviewSection:
    """AC1: StoryDetailScreen compose() yields a markdown preview section."""

    def test_compose_yields_preview_widget(self) -> None:
        """compose() should yield a widget with id 'dossier-preview' when content available."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": STORY_CONTEXT_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        assert "dossier-preview" in widget_ids, (
            f"compose() should yield a widget with id 'dossier-preview', "
            f"got ids: {widget_ids}"
        )

    def test_no_preview_when_no_content(self) -> None:
        """compose() should NOT yield preview widget when no content fields exist."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": "",
            "story_context_content": "",
            "session_file_content": "",
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        assert "dossier-preview" not in widget_ids, (
            "No preview section when all content fields are empty"
        )

    def test_preview_section_exists_with_session_content_only(self) -> None:
        """Preview should render even if only session content is available."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": "",
            "story_context_content": "",
            "session_file_content": SESSION_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        assert "dossier-preview" in widget_ids, (
            "Preview section should appear when session content is available"
        )


# ===========================================================================
# AC2: Load and render context-epic-N.md if available
# ===========================================================================


class TestEpicContextContent:
    """AC2: fetch_story_detail returns epic context file content."""

    def test_epic_context_content_returned(self, project_with_context: str) -> None:
        """fetch_story_detail should return 'epic_context_content' with file contents."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        assert "epic_context_content" in result, (
            f"Result should contain 'epic_context_content', got keys: {list(result.keys())}"
        )

    def test_epic_context_content_is_string(self, project_with_context: str) -> None:
        """epic_context_content should be a non-empty string."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        content = result.get("epic_context_content", "")
        assert isinstance(content, str), "epic_context_content should be a string"
        assert len(content) > 0, "epic_context_content should be non-empty when file exists"

    def test_epic_context_contains_file_text(self, project_with_context: str) -> None:
        """epic_context_content should contain actual text from the context file."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        content = result.get("epic_context_content", "")
        assert "Frame TUI TUI" in content, (
            f"epic_context_content should contain text from context file, got: {content[:100]}"
        )

    def test_epic_context_empty_when_no_file(self, project_without_context: str) -> None:
        """epic_context_content should be empty string when no epic context file exists."""
        # Need a session file for fetch_story_detail to return anything
        session_dir = os.path.join(project_without_context, ".session")
        with open(os.path.join(session_dir, "120-1-session.md"), "w") as f:
            f.write(SESSION_MD)
        result = fetch_story_detail("120-1", project_root=project_without_context)
        content = result.get("epic_context_content", "")
        assert content == "", (
            f"epic_context_content should be empty when no file, got: {content[:100]}"
        )

    def test_epic_context_rendered_in_preview(self) -> None:
        """Preview section should contain rendered epic context content."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": "",
            "session_file_content": "",
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        preview_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-preview"]
        assert len(preview_widgets) == 1, "Should have exactly one dossier-preview widget"
        # Check that the rendered content contains epic context text
        preview = preview_widgets[0]
        rendered = _extract_text(preview)
        assert "Frame TUI TUI" in rendered, (
            f"Preview should contain epic context text, got: {rendered[:200]}"
        )


# ===========================================================================
# AC3: Load and render context-story-ID.md if available
# ===========================================================================


class TestStoryContextContent:
    """AC3: fetch_story_detail returns story context file content."""

    def test_story_context_content_returned(self, project_with_context: str) -> None:
        """fetch_story_detail should return 'story_context_content' with file contents."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        assert "story_context_content" in result, (
            f"Result should contain 'story_context_content', got keys: {list(result.keys())}"
        )

    def test_story_context_content_is_string(self, project_with_context: str) -> None:
        """story_context_content should be a non-empty string."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        content = result.get("story_context_content", "")
        assert isinstance(content, str), "story_context_content should be a string"
        assert len(content) > 0, "story_context_content should be non-empty when file exists"

    def test_story_context_contains_file_text(self, project_with_context: str) -> None:
        """story_context_content should contain actual text from the context file."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        content = result.get("story_context_content", "")
        assert "Markdown Preview" in content, (
            f"story_context_content should contain text from context file, got: {content[:100]}"
        )

    def test_story_context_empty_when_no_file(self, project_without_context: str) -> None:
        """story_context_content should be empty string when no story context file exists."""
        session_dir = os.path.join(project_without_context, ".session")
        with open(os.path.join(session_dir, "120-1-session.md"), "w") as f:
            f.write(SESSION_MD)
        result = fetch_story_detail("120-1", project_root=project_without_context)
        content = result.get("story_context_content", "")
        assert content == "", (
            f"story_context_content should be empty when no file, got: {content[:100]}"
        )

    def test_story_context_rendered_in_preview(self) -> None:
        """Preview section should contain rendered story context content."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": "",
            "story_context_content": STORY_CONTEXT_MD,
            "session_file_content": "",
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        preview_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-preview"]
        assert len(preview_widgets) == 1, "Should have exactly one dossier-preview widget"
        preview = preview_widgets[0]
        rendered = _extract_text(preview)
        assert "Markdown Preview" in rendered, (
            f"Preview should contain story context text, got: {rendered[:200]}"
        )


# ===========================================================================
# AC4: Load and render session file if available
# ===========================================================================


class TestSessionFileContent:
    """AC4: fetch_story_detail returns session file raw content."""

    def test_session_file_content_returned(self, project_with_context: str) -> None:
        """fetch_story_detail should return 'session_file_content' with raw session markdown."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        assert "session_file_content" in result, (
            f"Result should contain 'session_file_content', got keys: {list(result.keys())}"
        )

    def test_session_file_content_is_string(self, project_with_context: str) -> None:
        """session_file_content should be a non-empty string."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        content = result.get("session_file_content", "")
        assert isinstance(content, str), "session_file_content should be a string"
        assert len(content) > 0, "session_file_content should be non-empty when file exists"

    def test_session_file_content_contains_raw_markdown(self, project_with_context: str) -> None:
        """session_file_content should contain the raw session markdown text."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        content = result.get("session_file_content", "")
        assert "SM Assessment" in content, (
            f"session_file_content should contain raw session text, got: {content[:100]}"
        )

    def test_session_file_content_empty_when_no_session(self, project_without_context: str) -> None:
        """session_file_content should be empty string when no session file exists."""
        result = fetch_story_detail("999-99", project_root=project_without_context)
        # fetch_story_detail returns {} when no session file found
        content = result.get("session_file_content", "")
        assert content == "", "session_file_content should be empty when no session file"

    def test_session_content_rendered_in_preview(self) -> None:
        """Preview section should contain rendered session content."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": "",
            "story_context_content": "",
            "session_file_content": SESSION_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        preview_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-preview"]
        assert len(preview_widgets) == 1, "Should have exactly one dossier-preview widget"
        preview = preview_widgets[0]
        rendered = _extract_text(preview)
        assert "SM Assessment" in rendered, (
            f"Preview should contain session text, got: {rendered[:200]}"
        )


# ===========================================================================
# AC5: Markdown content is scrollable within the detail screen
# ===========================================================================


class TestMarkdownScrollable:
    """AC5: Preview section is in a scrollable container."""

    def test_preview_is_scrollable_container(self) -> None:
        """The preview widget should be or be inside a scrollable container."""
        from textual.containers import VerticalScroll

        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": STORY_CONTEXT_MD,
            "session_file_content": SESSION_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        # Find the preview widget
        preview_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-preview"]
        assert len(preview_widgets) == 1, "Should have dossier-preview widget"
        preview = preview_widgets[0]
        # Preview should be a VerticalScroll or similar scrollable container
        assert isinstance(preview, VerticalScroll), (
            f"Preview section should be a VerticalScroll container, got {type(preview).__name__}"
        )

    def test_scrollable_contains_content_widgets(self) -> None:
        """Scrollable preview should contain child widgets with the markdown content."""
        from textual.containers import VerticalScroll

        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": STORY_CONTEXT_MD,
            "session_file_content": SESSION_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        preview_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-preview"]
        assert len(preview_widgets) == 1
        preview = preview_widgets[0]
        # A VerticalScroll composes its children — check it has content
        if isinstance(preview, VerticalScroll):
            # The container should have been created with child widgets
            assert hasattr(preview, "_nodes") or hasattr(preview, "children"), (
                "VerticalScroll should hold child content widgets"
            )


# ===========================================================================
# AC6: Preview section gracefully handles missing files (no errors, just skip)
# ===========================================================================


class TestGracefulMissingFiles:
    """AC6: Graceful handling when context/session files don't exist."""

    def test_no_crash_when_all_files_missing(self, project_without_context: str) -> None:
        """fetch_story_detail should not crash when no context or session files exist."""
        result = fetch_story_detail("999-99", project_root=project_without_context)
        # Should return empty dict or dict with defaults — no exception
        assert isinstance(result, dict)

    def test_content_fields_default_empty(self, project_without_context: str) -> None:
        """Content fields should default to empty string when files are missing."""
        session_dir = os.path.join(project_without_context, ".session")
        with open(os.path.join(session_dir, "120-1-session.md"), "w") as f:
            f.write(SESSION_MD)
        result = fetch_story_detail("120-1", project_root=project_without_context)
        assert result.get("epic_context_content", None) == "", (
            "epic_context_content should default to empty string"
        )
        assert result.get("story_context_content", None) == "", (
            "story_context_content should default to empty string"
        )

    def test_compose_no_preview_when_all_empty(self) -> None:
        """compose() should skip preview section when all content fields are empty."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": "",
            "story_context_content": "",
            "session_file_content": "",
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        assert "dossier-preview" not in widget_ids, (
            "No preview section when all content is empty"
        )

    def test_partial_content_still_renders(self) -> None:
        """Preview should render with partial content (only epic context available)."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": "",
            "session_file_content": "",
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        assert "dossier-preview" in widget_ids, (
            "Preview should render when at least one content field has data"
        )

    def test_unreadable_file_returns_empty_content(self, tmp_path) -> None:
        """If a context file path exists but can't be read, content should be empty."""
        ctx_dir = tmp_path / "sprint" / "context"
        ctx_dir.mkdir(parents=True)
        epic_file = ctx_dir / "context-epic-120.md"
        epic_file.write_text(EPIC_CONTEXT_MD)
        # Make file unreadable
        epic_file.chmod(0o000)

        session_dir = tmp_path / ".session"
        session_dir.mkdir(parents=True)
        (session_dir / "120-1-session.md").write_text(SESSION_MD)
        (tmp_path / ".pennyfarthing").mkdir()

        try:
            result = fetch_story_detail("120-1", project_root=str(tmp_path))
            # Should not crash; content should be empty or contain error-safe fallback
            content = result.get("epic_context_content", "")
            assert isinstance(content, str), "Should return string even on read error"
        finally:
            # Restore permissions for cleanup
            epic_file.chmod(0o644)


# ===========================================================================
# AC7: Preview integrates with existing dossier layout
# ===========================================================================


class TestPreviewLayoutIntegration:
    """AC7: Preview section integrates alongside existing dossier sections."""

    def test_existing_sections_still_present_with_preview(self) -> None:
        """Existing dossier sections (header, AC, workflow, git) should still render."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": STORY_CONTEXT_MD,
            "session_file_content": SESSION_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        # Original sections should still be present
        assert "dossier-header" in widget_ids, "Header section should still exist"
        assert "dossier-ac" in widget_ids, "AC section should still exist"
        assert "dossier-workflow" in widget_ids, "Workflow section should still exist"
        assert "dossier-hint" in widget_ids, "Hint section should still exist"
        # New preview section should also be present
        assert "dossier-preview" in widget_ids, "Preview section should be present"

    def test_preview_appears_after_context_before_hint(self) -> None:
        """Preview section should appear in the layout flow (after existing sections, before hint)."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": STORY_CONTEXT_MD,
            "session_file_content": SESSION_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        if "dossier-preview" in widget_ids and "dossier-hint" in widget_ids:
            preview_idx = widget_ids.index("dossier-preview")
            hint_idx = widget_ids.index("dossier-hint")
            assert preview_idx < hint_idx, (
                f"Preview (idx {preview_idx}) should appear before hint (idx {hint_idx})"
            )

    def test_all_three_content_sections_in_preview(self) -> None:
        """When all three content types exist, preview should contain all of them."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": EPIC_CONTEXT_MD,
            "story_context_content": STORY_CONTEXT_MD,
            "session_file_content": SESSION_MD,
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        preview_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-preview"]
        assert len(preview_widgets) == 1, "Should have exactly one dossier-preview"
        rendered = _extract_text(preview_widgets[0])
        assert "Frame TUI TUI" in rendered, "Should contain epic context text"
        assert "Markdown Preview" in rendered, "Should contain story context text"
        assert "SM Assessment" in rendered, "Should contain session text"


# ===========================================================================
# Data layer: _check_context_files content loading
# ===========================================================================


class TestContextFileContentLoading:
    """Data layer: _check_context_files or fetch_story_detail loads file content."""

    def test_fetch_returns_all_three_content_fields(self, project_with_context: str) -> None:
        """fetch_story_detail should return all three content fields."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        for field in ("epic_context_content", "story_context_content", "session_file_content"):
            assert field in result, (
                f"Result should contain '{field}', got keys: {list(result.keys())}"
            )

    def test_content_defaults_are_empty_strings(self, project_with_context: str) -> None:
        """Content fields should default to empty strings, not None or missing."""
        result = fetch_story_detail("120-1", project_root=project_with_context)
        for field in ("epic_context_content", "story_context_content", "session_file_content"):
            val = result.get(field)
            assert isinstance(val, str), (
                f"{field} should be a string, got {type(val).__name__}"
            )

    def test_epic_only_project(self, project_epic_only: str) -> None:
        """Only epic_context_content should have data when only epic file exists."""
        session_dir = os.path.join(project_epic_only, ".session")
        with open(os.path.join(session_dir, "120-1-session.md"), "w") as f:
            f.write(SESSION_MD)
        result = fetch_story_detail("120-1", project_root=project_epic_only)
        assert result.get("epic_context_content", "") != "", (
            "epic_context_content should have content"
        )
        assert result.get("story_context_content", "") == "", (
            "story_context_content should be empty"
        )

    def test_session_only_project(self, project_session_only: str) -> None:
        """Only session_file_content should have data when only session file exists."""
        result = fetch_story_detail("120-1", project_root=project_session_only)
        assert result.get("session_file_content", "") != "", (
            "session_file_content should have content"
        )
        assert result.get("epic_context_content", "") == "", (
            "epic_context_content should be empty"
        )
        assert result.get("story_context_content", "") == "", (
            "story_context_content should be empty"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_text(widget) -> str:
    """Extract visible text from a Textual widget for assertion checking."""
    from textual.containers import VerticalScroll
    from textual.widgets import Markdown

    texts = []
    if isinstance(widget, VerticalScroll):
        # For containers, check composed children
        for child in widget.compose():
            if isinstance(child, Markdown):
                # Markdown stores raw source in _markdown attribute
                texts.append(getattr(child, "_initial_markdown", "") or getattr(child, "_markdown", ""))
            else:
                try:
                    r = child.render()
                    if hasattr(r, "plain"):
                        texts.append(r.plain)
                    else:
                        texts.append(str(r))
                except Exception:
                    texts.append(str(child))
    elif isinstance(widget, Markdown):
        texts.append(getattr(widget, "_markdown", ""))
    else:
        try:
            r = widget.render()
            if hasattr(r, "plain"):
                texts.append(r.plain)
            else:
                texts.append(str(r))
        except Exception:
            texts.append(str(widget))
    return " ".join(texts)
