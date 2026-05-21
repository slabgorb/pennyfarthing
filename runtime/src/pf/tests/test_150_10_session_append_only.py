"""Tests for append-only session file validation — Story 150-10.

RED phase: These tests define the expected behavior of
validate_session_append_only(old_content, new_content) -> dict.

The function enforces that session files are append-only: existing section
content cannot be modified or deleted, only appended to. Certain sections
(Workflow Tracking, Story Details, YAML frontmatter) are exempt.

All tests should FAIL until the validation function is implemented.
"""

from __future__ import annotations

import pytest

from pf.session.append_only import validate_session_append_only


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINIMAL_SESSION = """\
---
story_id: "100-1"
---

## Story Details
- **ID:** 100-1

## Workflow Tracking
**Phase:** red

## Design Notes
Some design notes here.

## Delivery Findings
- Finding one
"""

MINIMAL_SESSION_WITH_REVIEW = """\
---
story_id: "100-1"
---

## Story Details
- **ID:** 100-1

## Workflow Tracking
**Phase:** red

## Design Notes
Some design notes here.

## Delivery Findings
- Finding one

## Reviewer Assessment
Looks good.
"""


# ---------------------------------------------------------------------------
# 1. Identical content → valid
# ---------------------------------------------------------------------------

class TestIdenticalContent:
    def test_no_changes_is_valid(self):
        result = validate_session_append_only(MINIMAL_SESSION, MINIMAL_SESSION)
        assert result["valid"] is True
        assert result["violations"] == []


# ---------------------------------------------------------------------------
# 2. New section appended → valid
# ---------------------------------------------------------------------------

class TestNewSectionAppended:
    def test_appending_new_section_is_valid(self):
        new = MINIMAL_SESSION + "\n## Reviewer Assessment\nAll tests pass.\n"
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []

    def test_appending_multiple_new_sections_is_valid(self):
        new = MINIMAL_SESSION + (
            "\n## Reviewer Assessment\nApproved.\n"
            "\n## Dev Response\nFixed per feedback.\n"
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []


# ---------------------------------------------------------------------------
# 3. Content appended within existing section → valid
# ---------------------------------------------------------------------------

class TestAppendWithinSection:
    def test_appending_line_to_existing_section_is_valid(self):
        new = MINIMAL_SESSION.replace(
            "- Finding one\n",
            "- Finding one\n- Finding two\n",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []

    def test_appending_paragraph_to_existing_section_is_valid(self):
        new = MINIMAL_SESSION.replace(
            "Some design notes here.\n",
            "Some design notes here.\n\nAdditional paragraph with more notes.\n",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []


# ---------------------------------------------------------------------------
# 4. Existing section content modified → invalid
# ---------------------------------------------------------------------------

class TestContentModified:
    def test_modifying_section_content_is_invalid(self):
        new = MINIMAL_SESSION.replace(
            "Some design notes here.",
            "REWRITTEN design notes.",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is False
        assert len(result["violations"]) == 1
        assert result["violations"][0]["section"] == "Design Notes"
        assert result["violations"][0]["type"] == "modified"

    def test_modifying_finding_is_invalid(self):
        new = MINIMAL_SESSION.replace(
            "- Finding one",
            "- Completely different finding",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is False
        assert len(result["violations"]) == 1
        assert result["violations"][0]["section"] == "Delivery Findings"


# ---------------------------------------------------------------------------
# 5. Section deleted → invalid
# ---------------------------------------------------------------------------

class TestSectionDeleted:
    def test_deleting_section_is_invalid(self):
        # Remove the "Design Notes" section entirely
        new = MINIMAL_SESSION.replace(
            "## Design Notes\nSome design notes here.\n\n",
            "",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is False
        assert any(
            v["section"] == "Design Notes" and v["type"] == "deleted"
            for v in result["violations"]
        )

    def test_deleting_last_section_is_invalid(self):
        new = MINIMAL_SESSION.replace(
            "## Delivery Findings\n- Finding one\n",
            "",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is False
        assert any(
            v["section"] == "Delivery Findings" and v["type"] == "deleted"
            for v in result["violations"]
        )


# ---------------------------------------------------------------------------
# 6. Workflow Tracking section modified → valid (exempt)
# ---------------------------------------------------------------------------

class TestWorkflowTrackingExempt:
    def test_modifying_workflow_tracking_is_valid(self):
        new = MINIMAL_SESSION.replace(
            "**Phase:** red",
            "**Phase:** green\n**Phase Started:** 2026-03-20T23:00:00Z",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []


# ---------------------------------------------------------------------------
# 7. Story Details section modified → valid (exempt)
# ---------------------------------------------------------------------------

class TestStoryDetailsExempt:
    def test_modifying_story_details_is_valid(self):
        new = MINIMAL_SESSION.replace(
            "- **ID:** 100-1",
            "- **ID:** 100-1\n- **PR:** #42",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []

    def test_editing_story_details_field_is_valid(self):
        new = MINIMAL_SESSION.replace(
            "- **ID:** 100-1",
            "- **ID:** 100-1-renamed",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []


# ---------------------------------------------------------------------------
# 8. YAML frontmatter modified → valid (exempt)
# ---------------------------------------------------------------------------

class TestFrontmatterExempt:
    def test_modifying_frontmatter_is_valid(self):
        new = MINIMAL_SESSION.replace(
            'story_id: "100-1"',
            'story_id: "100-1"\npr_url: "https://github.com/example/pull/1"',
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is True
        assert result["violations"] == []


# ---------------------------------------------------------------------------
# 9. Multiple violations → all reported
# ---------------------------------------------------------------------------

class TestMultipleViolations:
    def test_multiple_violations_all_reported(self):
        # Modify Design Notes AND delete Delivery Findings
        new = MINIMAL_SESSION.replace(
            "Some design notes here.",
            "REWRITTEN notes.",
        ).replace(
            "## Delivery Findings\n- Finding one\n",
            "",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is False
        assert len(result["violations"]) >= 2
        sections = {v["section"] for v in result["violations"]}
        assert "Design Notes" in sections
        assert "Delivery Findings" in sections


# ---------------------------------------------------------------------------
# 10. Empty old content → valid (initial write)
# ---------------------------------------------------------------------------

class TestEmptyOldContent:
    def test_empty_old_content_is_valid(self):
        result = validate_session_append_only("", MINIMAL_SESSION)
        assert result["valid"] is True
        assert result["violations"] == []

    def test_none_like_empty_is_valid(self):
        result = validate_session_append_only("", "## New Session\nContent here.\n")
        assert result["valid"] is True
        assert result["violations"] == []


# ---------------------------------------------------------------------------
# 11. Section header changed → invalid
# ---------------------------------------------------------------------------

class TestSectionHeaderChanged:
    def test_renaming_section_header_is_invalid(self):
        new = MINIMAL_SESSION.replace(
            "## Design Notes",
            "## Design Decisions",
        )
        result = validate_session_append_only(MINIMAL_SESSION, new)
        assert result["valid"] is False
        # Should detect the old section as deleted
        assert any(
            v["section"] == "Design Notes" and v["type"] == "deleted"
            for v in result["violations"]
        )


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_phase_history_exempt(self):
        """Phase History is part of Workflow Tracking and should be exempt."""
        session_with_history = """\
---
story_id: "100-1"
---

## Phase History
| Phase | Started | Ended |
|-------|---------|-------|
| setup | 2026-03-20 | 2026-03-20 |
"""
        new = session_with_history.replace(
            "| setup | 2026-03-20 | 2026-03-20 |",
            "| setup | 2026-03-20 | 2026-03-20 |\n| red | 2026-03-20 | - |",
        )
        result = validate_session_append_only(session_with_history, new)
        assert result["valid"] is True

    def test_trailing_whitespace_changes_are_valid(self):
        """Trailing whitespace differences should not trigger violations."""
        old = "## Section\nContent here.\n"
        new = "## Section\nContent here.\n\n"
        result = validate_session_append_only(old, new)
        assert result["valid"] is True
