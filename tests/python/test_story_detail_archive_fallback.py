"""Tests for archive fallback + Tufte dossier redesign.

Verifies:
- _find_session_file falls back to sprint/archive/ when .session/ has no match
- fetch_story_detail sets archived flag
- Tufte compose renders ARCHIVED badge, progress bar AC, phase dots, review section

Run with: python -m pytest tests/python/test_story_detail_archive_fallback.py -v
"""

from __future__ import annotations

from typing import Any

import pytest
from pf.bikerack.story_detail_data import _find_session_file, fetch_story_detail
from pf.bikerack.story_detail_screen import (
    StoryDetailScreen,
    _render_workflow_dots,
)
from textual.widgets import Static


def _static_plain(widget: Static) -> str:
    """Extract plain text from a Static widget without needing an active app."""
    content = widget._Static__content  # type: ignore[attr-defined]
    if hasattr(content, "plain"):
        return content.plain
    return str(content)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SESSION_MD = """\
# Story 120-1: Story detail screen: markdown preview

**Jira:** MSSCI-15397
**Branch:** feature/120-1-story-detail-markdown-preview
**Workflow:** tdd
**Phase:** finish
**Points:** 3
**Review Verdict:** Approved

## Acceptance Criteria

1. Add markdown preview section
2. Load epic context
3. Load story context

## Session Log

All ACs complete.
"""

SAMPLE_STORY_DATA: dict[str, Any] = {
    "id": "120-1",
    "title": "Story detail screen: markdown preview",
    "points": 3,
    "status": "done",
    "jiraKey": "MSSCI-15397",
    "acceptance_criteria": [
        {"text": "Add markdown preview section", "done": True},
        {"text": "Load epic context", "done": True},
        {"text": "Load story context", "done": True},
        {"text": "Load session file", "done": True},
        {"text": "Scrollable content", "done": True},
        {"text": "Graceful missing files", "done": True},
        {"text": "Integrates with dossier layout", "done": True},
    ],
    "workflow": "tdd",
    "workflow_phase": "finish",
    "git_branch": "feature/120-1-story-detail-markdown-preview",
    "pr_url": "https://github.com/user/pennyfarthing/pull/99",
    "session_notes": "All ACs complete.",
    "has_epic_context": True,
    "has_story_context": True,
    "archived": True,
    "review_verdict": "Approved",
    "review_findings": "",
}


@pytest.fixture
def project_active(tmp_path) -> str:
    """Project with active session in .session/."""
    (tmp_path / ".pennyfarthing").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "120-1-session.md").write_text(SESSION_MD)
    (tmp_path / "sprint" / "archive").mkdir(parents=True)
    (tmp_path / "sprint" / "context").mkdir(parents=True)
    return str(tmp_path)


@pytest.fixture
def project_archived_by_id(tmp_path) -> str:
    """Project with session in sprint/archive/ (by local ID)."""
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".session").mkdir()
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    (archive_dir / "120-1-session.md").write_text(SESSION_MD)
    (tmp_path / "sprint" / "context").mkdir(parents=True)
    return str(tmp_path)


@pytest.fixture
def project_archived_by_jira(tmp_path) -> str:
    """Project with session in sprint/archive/ (by Jira key)."""
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".session").mkdir()
    archive_dir = tmp_path / "sprint" / "archive"
    archive_dir.mkdir(parents=True)
    (archive_dir / "MSSCI-15397-session.md").write_text(SESSION_MD)
    (tmp_path / "sprint" / "context").mkdir(parents=True)
    return str(tmp_path)


# ===========================================================================
# _find_session_file: archive fallback
# ===========================================================================


class TestFindSessionFileArchive:
    """_find_session_file prefers active, falls back to archive."""

    def test_prefers_active_over_archive(self, project_active: str, tmp_path) -> None:
        """Active .session/ file should be preferred over archive."""
        # Also put a copy in archive
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True, exist_ok=True)
        (archive_dir / "120-1-session.md").write_text("archived version")

        path, is_archived = _find_session_file("120-1", project_active)
        assert path is not None
        assert is_archived is False
        assert ".session" in path

    def test_falls_back_to_archive_by_story_id(self, project_archived_by_id: str) -> None:
        """Falls back to sprint/archive/{story_id}-session.md."""
        path, is_archived = _find_session_file("120-1", project_archived_by_id)
        assert path is not None
        assert is_archived is True
        assert "archive" in path

    def test_falls_back_to_archive_by_jira_key(self, project_archived_by_jira: str) -> None:
        """Falls back to sprint/archive/{jira_key}-session.md."""
        path, is_archived = _find_session_file(
            "120-1", project_archived_by_jira, jira_key="MSSCI-15397"
        )
        assert path is not None
        assert is_archived is True
        assert "MSSCI-15397" in path

    def test_returns_none_when_no_match(self, tmp_path) -> None:
        """Returns (None, False) when no session file found anywhere."""
        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".session").mkdir()
        (tmp_path / "sprint" / "archive").mkdir(parents=True)
        path, is_archived = _find_session_file("999-99", str(tmp_path))
        assert path is None
        assert is_archived is False


# ===========================================================================
# fetch_story_detail: archived flag
# ===========================================================================


class TestFetchStoryDetailArchived:
    """fetch_story_detail sets archived=True for archive sessions."""

    def test_active_session_not_archived(self, project_active: str) -> None:
        """Active session should have archived=False."""
        result = fetch_story_detail("120-1", project_root=project_active)
        assert result.get("archived") is False

    def test_archive_session_is_archived(self, project_archived_by_id: str) -> None:
        """Archive session should have archived=True."""
        result = fetch_story_detail("120-1", project_root=project_archived_by_id)
        assert result.get("archived") is True

    def test_archive_by_jira_key(self, project_archived_by_jira: str) -> None:
        """Archive lookup by jira_key should work and set archived=True."""
        result = fetch_story_detail(
            "120-1", project_root=project_archived_by_jira, jira_key="MSSCI-15397"
        )
        assert result.get("archived") is True
        assert result.get("workflow") == "tdd"

    def test_defaults_when_not_found(self, tmp_path) -> None:
        """Returns dict with defaults when no session file found."""
        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".session").mkdir()
        (tmp_path / "sprint" / "archive").mkdir(parents=True)
        (tmp_path / "sprint" / "context").mkdir(parents=True)
        result = fetch_story_detail("999-99", project_root=str(tmp_path))
        assert result.get("id") == "999-99"
        assert result.get("archived") is False
        assert result.get("session_file_content", "") == ""


# ===========================================================================
# Compose: ARCHIVED badge
# ===========================================================================


class TestArchivedBadge:
    """Compose renders ARCHIVED badge when data['archived'] is True."""

    def test_archived_badge_present(self) -> None:
        """Header should contain 'ARCHIVED' when archived=True."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        header = [w for w in widgets if getattr(w, "id", None) == "dossier-header"]
        assert len(header) == 1
        plain = _static_plain(header[0])
        assert "ARCHIVED" in plain

    def test_no_archived_badge_when_not_archived(self) -> None:
        """Header should NOT contain 'ARCHIVED' when archived=False."""
        data = {**SAMPLE_STORY_DATA, "archived": False}
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        header = [w for w in widgets if getattr(w, "id", None) == "dossier-header"]
        assert len(header) == 1
        plain = _static_plain(header[0])
        assert "ARCHIVED" not in plain


# ===========================================================================
# Compose: AC progress bar
# ===========================================================================


class TestACProgressBar:
    """AC renders as progress bar (dossier-ac widget with bar chars)."""

    def test_ac_widget_exists(self) -> None:
        """dossier-ac widget should exist when ACs are present."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        ac_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-ac"]
        assert len(ac_widgets) == 1

    def test_ac_contains_progress_bar(self) -> None:
        """AC widget should contain progress bar characters."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        ac_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-ac"]
        plain = _static_plain(ac_widgets[0])
        # Progress bar uses █ and ░ characters
        assert "\u2588" in plain or "\u2591" in plain, (
            f"AC widget should contain progress bar chars, got: {plain}"
        )

    def test_ac_shows_count(self) -> None:
        """AC widget should show done/total count."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        ac_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-ac"]
        plain = _static_plain(ac_widgets[0])
        assert "7/7" in plain

    def test_ac_shows_percentage(self) -> None:
        """AC widget should show percentage."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        ac_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-ac"]
        plain = _static_plain(ac_widgets[0])
        assert "100%" in plain


# ===========================================================================
# Compose: workflow phase dots
# ===========================================================================


class TestWorkflowPhaseDots:
    """Workflow renders as phase dots."""

    def test_workflow_widget_exists(self) -> None:
        """dossier-workflow widget should exist when workflow is set."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        wf_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-workflow"]
        assert len(wf_widgets) == 1

    def test_workflow_contains_dots(self) -> None:
        """Workflow widget should contain phase dot characters."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        wf_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-workflow"]
        plain = _static_plain(wf_widgets[0])
        # Should have ✓ (completed), ● (current), or ○ (future) and → arrows
        has_dots = "\u2713" in plain or "\u25cf" in plain or "\u25cb" in plain
        assert has_dots, f"Workflow should contain phase dots, got: {plain}"

    def test_workflow_contains_arrows(self) -> None:
        """Workflow widget should contain → arrows between phases."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        wf_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-workflow"]
        plain = _static_plain(wf_widgets[0])
        assert "\u2192" in plain, "Workflow should contain → arrows"

    def test_workflow_contains_workflow_name(self) -> None:
        """Workflow widget should contain the workflow name in brackets."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        wf_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-workflow"]
        plain = _static_plain(wf_widgets[0])
        assert "[tdd]" in plain


# ===========================================================================
# _render_workflow_dots helper
# ===========================================================================


class TestRenderWorkflowDots:
    """Unit tests for the _render_workflow_dots helper."""

    def test_tdd_all_phases(self) -> None:
        """TDD workflow should have 6 phases."""
        result = _render_workflow_dots("tdd", "red")
        assert result is not None
        plain = result.plain
        assert "[tdd]" in plain
        assert "SM" in plain
        assert "TEA" in plain
        assert "Dev" in plain
        assert "Rev" in plain

    def test_current_phase_marked(self) -> None:
        """Current phase should use ● marker."""
        result = _render_workflow_dots("tdd", "red")
        assert result is not None
        assert "\u25cf" in result.plain

    def test_completed_phases_checked(self) -> None:
        """Phases before current should use ✓ marker."""
        result = _render_workflow_dots("tdd", "green")
        assert result is not None
        # setup and red are before green, so ✓ should appear
        assert "\u2713" in result.plain

    def test_future_phases_open(self) -> None:
        """Phases after current should use ○ marker."""
        result = _render_workflow_dots("tdd", "red")
        assert result is not None
        assert "\u25cb" in result.plain

    def test_unknown_workflow_fallback(self) -> None:
        """Unknown workflow falls back to text rendering."""
        result = _render_workflow_dots("custom-wf", "build")
        assert result is not None
        plain = result.plain
        assert "[custom-wf]" in plain
        assert "build" in plain

    def test_empty_workflow_returns_none(self) -> None:
        """Empty workflow string returns None."""
        result = _render_workflow_dots("", "")
        assert result is None

    def test_trivial_workflow(self) -> None:
        """Trivial workflow should have 4 phases."""
        result = _render_workflow_dots("trivial", "implement")
        assert result is not None
        plain = result.plain
        assert "[trivial]" in plain
        assert "\u25cf" in plain  # current phase marker

    def test_bdd_workflow(self) -> None:
        """BDD workflow should include UX phase."""
        result = _render_workflow_dots("bdd", "design")
        assert result is not None
        plain = result.plain
        assert "UX" in plain


# ===========================================================================
# Compose: review section
# ===========================================================================


class TestReviewSection:
    """Review verdict renders when present, omitted when empty."""

    def test_review_rendered_when_present(self) -> None:
        """dossier-review widget should exist when review_verdict is set."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        review_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-review"]
        assert len(review_widgets) == 1
        plain = _static_plain(review_widgets[0])
        assert "Approved" in plain

    def test_review_omitted_when_empty(self) -> None:
        """No dossier-review widget when review_verdict and review_findings are empty."""
        data = {**SAMPLE_STORY_DATA, "review_verdict": "", "review_findings": ""}
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        review_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-review"]
        assert len(review_widgets) == 0

    def test_review_shows_checkmark_for_approved(self) -> None:
        """Approved review should show ✓ marker."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        review_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-review"]
        plain = _static_plain(review_widgets[0])
        assert "\u2713" in plain


# ===========================================================================
# Compose: context and git are single-line
# ===========================================================================


class TestSingleLineSections:
    """Context and Git render as single lines (no newlines in rendered text)."""

    def test_context_single_line(self) -> None:
        """Context section should be a single line."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        ctx_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-context"]
        assert len(ctx_widgets) == 1
        plain = _static_plain(ctx_widgets[0])
        assert "\n" not in plain, f"Context should be single-line, got: {plain!r}"

    def test_git_single_line(self) -> None:
        """Git section should be a single line."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        git_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-git"]
        assert len(git_widgets) == 1
        plain = _static_plain(git_widgets[0])
        assert "\n" not in plain, f"Git should be single-line, got: {plain!r}"

    def test_context_contains_epic_and_story(self) -> None:
        """Context line should mention both Epic and Story."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        ctx_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-context"]
        plain = _static_plain(ctx_widgets[0])
        assert "Epic" in plain
        assert "Story" in plain

    def test_git_contains_branch(self) -> None:
        """Git line should contain branch name."""
        screen = StoryDetailScreen(story_data=SAMPLE_STORY_DATA)
        widgets = list(screen.compose())
        git_widgets = [w for w in widgets if getattr(w, "id", None) == "dossier-git"]
        plain = _static_plain(git_widgets[0])
        assert "feature/120-1" in plain


# ===========================================================================
# Widget ID preservation
# ===========================================================================


class TestWidgetIDPreservation:
    """Core widget IDs are preserved for backward compatibility."""

    def test_all_core_widget_ids_present(self) -> None:
        """dossier-header, dossier-ac, dossier-workflow, dossier-hint should exist."""
        data = {
            **SAMPLE_STORY_DATA,
            "epic_context_content": "# Epic",
            "story_context_content": "# Story",
            "session_file_content": "# Session",
        }
        screen = StoryDetailScreen(story_data=data)
        widgets = list(screen.compose())
        widget_ids = [getattr(w, "id", None) for w in widgets]
        for required_id in ("dossier-header", "dossier-ac", "dossier-workflow",
                            "dossier-preview", "dossier-hint"):
            assert required_id in widget_ids, (
                f"Widget '{required_id}' should be present, got: {widget_ids}"
            )
