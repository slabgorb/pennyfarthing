"""Tests for sprint/validator.py module.

Story: MSSCI-12394 - Sprint and Story YAML validators

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. Sprint YAML validates structure and required fields
2. Story entries validate all required fields
3. Epic entries validate story references
4. Clear error messages for validation failures
5. Can validate archived sprints
6. just validate-sprint recipe works
"""

from pathlib import Path
from typing import Any

import pytest

from pennyfarthing_scripts.sprint.validator import (
    ValidationResult,
    ValidationSeverity,
    format_validation_errors,
    validate_archived_sprint,
    validate_epic,
    validate_epic_shard,
    validate_full_sprint,
    validate_sprint,
    validate_sprint_file,
    validate_story,
)

# =============================================================================
# Test Fixtures - Valid Data
# =============================================================================


@pytest.fixture
def valid_sprint_data() -> dict[str, Any]:
    """A minimal valid sprint structure."""
    return {
        "sprint": {
            "number": 12,
            "jira_sprint_id": 276,
            "jira_sprint_name": "TO Sprint 2604",
            "goal": "Complete the sprint",
            "start_date": "2026-01-20",
            "end_date": "2026-02-02",
            "status": "active",
        },
        "epics": [],
    }


@pytest.fixture
def valid_story() -> dict[str, Any]:
    """A minimal valid story."""
    return {
        "id": "63-1",
        "title": "Test Story",
        "status": "backlog",
        "points": 3,
    }


@pytest.fixture
def valid_epic(valid_story: dict[str, Any]) -> dict[str, Any]:
    """A minimal valid epic with one story."""
    return {
        "id": "epic-63",
        "title": "Test Epic",
        "stories": [valid_story],
    }


@pytest.fixture
def full_valid_sprint(valid_epic: dict[str, Any]) -> dict[str, Any]:
    """A complete valid sprint with epic and story."""
    return {
        "sprint": {
            "number": 12,
            "jira_sprint_id": 276,
            "jira_sprint_name": "TO Sprint 2604",
            "goal": "Complete the sprint",
            "start_date": "2026-01-20",
            "end_date": "2026-02-02",
            "status": "active",
        },
        "epics": [valid_epic],
    }


# =============================================================================
# AC1: Sprint YAML validates structure and required fields
# =============================================================================


class TestSprintValidation:
    """Tests for sprint-level validation."""

    def test_valid_sprint_passes(self, valid_sprint_data: dict[str, Any]) -> None:
        """A valid sprint structure should pass validation."""
        result = validate_sprint(valid_sprint_data)

        assert result.valid is True
        assert len(result.errors) == 0

    def test_missing_sprint_section_fails(self) -> None:
        """Missing 'sprint' section should fail."""
        data = {"epics": []}

        result = validate_sprint(data)

        assert result.valid is False
        assert any("sprint" in e.message.lower() for e in result.errors)

    def test_missing_required_sprint_fields_fails(self) -> None:
        """Missing required sprint fields should produce errors."""
        data = {
            "sprint": {
                "number": 12,
                # Missing: jira_sprint_id, goal, start_date, end_date, status
            },
            "epics": [],
        }

        result = validate_sprint(data)

        assert result.valid is False
        # Should report specific missing fields
        error_messages = " ".join(e.message for e in result.errors)
        assert "goal" in error_messages.lower() or len(result.errors) > 0

    def test_invalid_sprint_status_fails(self) -> None:
        """Invalid sprint status value should fail."""
        data = {
            "sprint": {
                "number": 12,
                "jira_sprint_id": 276,
                "goal": "Test",
                "start_date": "2026-01-20",
                "end_date": "2026-02-02",
                "status": "invalid_status",  # Should be 'active' or 'closed'
            },
            "epics": [],
        }

        result = validate_sprint(data)

        assert result.valid is False
        assert any("status" in e.message.lower() for e in result.errors)

    def test_invalid_date_format_fails(self) -> None:
        """Non-ISO date format should fail."""
        data = {
            "sprint": {
                "number": 12,
                "jira_sprint_id": 276,
                "goal": "Test",
                "start_date": "01/20/2026",  # Wrong format
                "end_date": "2026-02-02",
                "status": "active",
            },
            "epics": [],
        }

        result = validate_sprint(data)

        assert result.valid is False
        assert any("date" in e.message.lower() for e in result.errors)


# =============================================================================
# AC2: Story entries validate all required fields
# =============================================================================


class TestStoryValidation:
    """Tests for story-level validation."""

    def test_valid_story_passes(self, valid_story: dict[str, Any]) -> None:
        """A valid story should pass validation."""
        result = validate_story(valid_story, "epic-63")

        assert result.valid is True
        assert len(result.errors) == 0

    def test_missing_story_id_fails(self) -> None:
        """Story without id should fail."""
        story = {"title": "Test", "status": "backlog", "points": 3}

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("id" in e.message.lower() for e in result.errors)

    def test_missing_story_title_fails(self) -> None:
        """Story without title should fail."""
        story = {"id": "63-1", "status": "backlog", "points": 3}

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("title" in e.message.lower() for e in result.errors)

    def test_missing_story_status_fails(self) -> None:
        """Story without status should fail."""
        story = {"id": "63-1", "title": "Test", "points": 3}

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("status" in e.message.lower() for e in result.errors)

    def test_missing_story_points_fails(self) -> None:
        """Story without points should fail."""
        story = {"id": "63-1", "title": "Test", "status": "backlog"}

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("points" in e.message.lower() for e in result.errors)

    def test_invalid_story_status_fails(self) -> None:
        """Story with invalid status should fail."""
        story = {
            "id": "63-1",
            "title": "Test",
            "status": "invalid",  # Should be backlog/in_progress/done/cancelled
            "points": 3,
        }

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("status" in e.message.lower() for e in result.errors)

    def test_all_valid_story_statuses_pass(self) -> None:
        """All valid status values should pass."""
        valid_statuses = ["backlog", "ready", "in_progress", "done", "canceled", "planning"]

        for status in valid_statuses:
            story = {"id": "63-1", "title": "Test", "status": status, "points": 3}
            result = validate_story(story, "epic-63")
            assert result.valid is True, f"Status '{status}' should be valid"

    def test_non_numeric_points_fails(self) -> None:
        """Story with non-numeric points should fail."""
        story = {
            "id": "63-1",
            "title": "Test",
            "status": "backlog",
            "points": "three",  # Should be numeric
        }

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("points" in e.message.lower() for e in result.errors)

    def test_invalid_jira_key_fails(self) -> None:
        """Story with invalid Jira key format should fail."""
        story = {
            "id": "63-1",
            "title": "Test",
            "status": "backlog",
            "points": 3,
            "jira": "INVALID-KEY",  # Should match MSSCI-NNNNN
        }

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("jira" in e.message.lower() for e in result.errors)

    def test_valid_jira_key_passes(self) -> None:
        """Story with valid Jira key should pass."""
        story = {
            "id": "63-1",
            "title": "Test",
            "status": "backlog",
            "points": 3,
            "jira": "MSSCI-12345",
        }

        result = validate_story(story, "epic-63")

        assert result.valid is True

    def test_error_path_includes_epic_context(self) -> None:
        """Error path should include epic ID for context."""
        story = {"id": "63-1", "title": "Test", "points": 3}  # Missing status

        result = validate_story(story, "epic-63")

        assert result.valid is False
        assert any("epic-63" in e.path for e in result.errors)


# =============================================================================
# AC3: Epic entries validate story references
# =============================================================================


class TestEpicValidation:
    """Tests for epic-level validation."""

    def test_valid_epic_passes(self, valid_epic: dict[str, Any]) -> None:
        """A valid epic should pass validation."""
        result = validate_epic(valid_epic, set())

        assert result.valid is True
        assert len(result.errors) == 0

    def test_missing_epic_id_fails(self, valid_story: dict[str, Any]) -> None:
        """Epic without id should fail."""
        epic = {"title": "Test Epic", "stories": [valid_story]}

        result = validate_epic(epic, set())

        assert result.valid is False
        assert any("id" in e.message.lower() for e in result.errors)

    def test_missing_epic_title_fails(self, valid_story: dict[str, Any]) -> None:
        """Epic without title should fail."""
        epic = {"id": "epic-63", "stories": [valid_story]}

        result = validate_epic(epic, set())

        assert result.valid is False
        assert any("title" in e.message.lower() for e in result.errors)

    def test_duplicate_story_ids_in_epic_fails(self) -> None:
        """Duplicate story IDs within an epic should fail."""
        epic = {
            "id": "epic-63",
            "title": "Test Epic",
            "stories": [
                {"id": "63-1", "title": "Story 1", "status": "backlog", "points": 3},
                {"id": "63-1", "title": "Story 2", "status": "done", "points": 2},  # Duplicate!
            ],
        }

        result = validate_epic(epic, set())

        assert result.valid is False
        assert any("duplicate" in e.message.lower() for e in result.errors)

    def test_duplicate_story_ids_across_epics_fails(self, valid_story: dict[str, Any]) -> None:
        """Story ID already used in another epic should fail."""
        epic = {
            "id": "epic-63",
            "title": "Test Epic",
            "stories": [valid_story],  # Has id "63-1"
        }

        # Simulate "63-1" already existing in another epic
        existing_ids = {"63-1"}

        result = validate_epic(epic, existing_ids)

        assert result.valid is False
        assert any("duplicate" in e.message.lower() for e in result.errors)

    def test_integer_epic_id_fails(self) -> None:
        """Epic with integer id (YAML bare number) should fail.

        YAML parses `id: 87` as int. Cyclist's sprint-data.ts calls
        epicId.match() which crashes on non-strings, blanking the panel.
        """
        epic = {
            "id": 87,  # Bare integer — not quoted in YAML
            "title": "Test Epic",
            "stories": [
                {"id": "87-1", "title": "Story 1", "status": "backlog", "points": 2},
            ],
        }

        result = validate_epic(epic, set())

        assert result.valid is False
        assert any("must be a string" in e.message.lower() for e in result.errors)

    def test_integer_epic_id_fails_in_shard(self) -> None:
        """Epic shard with integer id should fail validation."""
        epic = {
            "id": 87,
            "title": "Test Epic",
            "status": "planning",
            "stories": [
                {"id": "87-1", "title": "Story 1", "status": "backlog", "points": 2},
            ],
        }

        result = validate_epic_shard(epic)

        assert result.valid is False
        assert any("must be a string" in e.message.lower() for e in result.errors)

    def test_string_epic_id_passes(self) -> None:
        """Epic with properly quoted string id should pass."""
        epic = {
            "id": "87",  # Quoted in YAML — parsed as string
            "title": "Test Epic",
            "stories": [
                {"id": "87-1", "title": "Story 1", "status": "backlog", "points": 2},
            ],
        }

        result = validate_epic(epic, set())

        assert result.valid is True


# =============================================================================
# AC4: Clear error messages for validation failures
# =============================================================================


class TestErrorMessages:
    """Tests for error message clarity."""

    def test_error_message_specifies_field_name(self) -> None:
        """Error message should specify which field is invalid."""
        story = {"id": "63-1", "title": "Test", "points": 3}  # Missing status

        result = validate_story(story, "epic-63")

        assert result.valid is False
        # Error should mention "status" specifically
        assert any("status" in e.message.lower() for e in result.errors)

    def test_error_message_specifies_expected_values(self) -> None:
        """Error for invalid enum should list valid values."""
        story = {
            "id": "63-1",
            "title": "Test",
            "status": "invalid",
            "points": 3,
        }

        result = validate_story(story, "epic-63")

        assert result.valid is False
        # Error should list valid status values
        error_text = " ".join(e.message for e in result.errors).lower()
        assert "backlog" in error_text or "in_progress" in error_text

    def test_error_path_is_json_path_format(self) -> None:
        """Error path should be JSON-path format for navigation."""
        story = {"id": "63-1", "title": "Test", "points": 3}  # Missing status

        result = validate_story(story, "epic-63")

        assert result.valid is False
        # Path should include epic and story context
        error = result.errors[0]
        assert "." in error.path or "[" in error.path  # JSON path-like

    def test_format_validation_errors_is_readable(self) -> None:
        """format_validation_errors should produce human-readable output."""
        result = ValidationResult(valid=False)
        result.add_error("Missing required field: status", "epics[0].stories[0]")
        result.add_error("Invalid points value", "epics[0].stories[1].points")

        output = format_validation_errors(result)

        # Should be multi-line, human readable
        assert "\n" in output or len(output) > 20
        assert "status" in output
        assert "points" in output

    def test_format_shows_severity(self) -> None:
        """Formatted output should show error severity."""
        result = ValidationResult(valid=False)
        result.add_error("Critical error", "sprint.status", ValidationSeverity.ERROR)
        result.add_error("Minor warning", "epics[0].title", ValidationSeverity.WARNING)

        output = format_validation_errors(result)

        # Should distinguish errors from warnings
        assert "error" in output.lower() or "warning" in output.lower()


# =============================================================================
# AC5: Can validate archived sprints
# =============================================================================


class TestArchivedSprintValidation:
    """Tests for archived sprint validation."""

    def test_valid_archived_sprint_passes(self) -> None:
        """A valid archived sprint should pass validation."""
        data = {
            "sprint": {
                "number": 11,
                "jira_sprint_id": 275,
                "goal": "Previous sprint",
                "start_date": "2026-01-06",
                "end_date": "2026-01-19",
                "status": "closed",  # Archived sprints should be closed
            },
            "epics": [
                {
                    "id": "epic-50",
                    "title": "Old Epic",
                    "stories": [
                        {"id": "50-1", "title": "Done Story", "status": "done", "points": 3},
                    ],
                }
            ],
        }

        result = validate_archived_sprint(data)

        assert result.valid is True

    def test_archived_sprint_allows_all_done_stories(self) -> None:
        """Archived sprints should allow all stories to be done/canceled."""
        data = {
            "sprint": {
                "number": 11,
                "jira_sprint_id": 275,
                "goal": "Previous sprint",
                "start_date": "2026-01-06",
                "end_date": "2026-01-19",
                "status": "closed",
            },
            "epics": [
                {
                    "id": "epic-50",
                    "title": "Old Epic",
                    "stories": [
                        {"id": "50-1", "title": "Done Story", "status": "done", "points": 3},
                        {"id": "50-2", "title": "Canceled Story", "status": "canceled", "points": 2},
                    ],
                }
            ],
        }

        result = validate_archived_sprint(data)

        assert result.valid is True

    def test_archived_sprint_validates_structure(self) -> None:
        """Archived sprints should still validate structure (missing fields)."""
        data = {
            "sprint": {
                "number": 11,
                # Missing required fields
            },
            "epics": [],
        }

        result = validate_archived_sprint(data)

        assert result.valid is False


# =============================================================================
# AC6: just validate-sprint recipe works
# =============================================================================


class TestValidateSprintFile:
    """Tests for file-based validation."""

    def test_validate_current_sprint_file(self) -> None:
        """Should be able to validate current-sprint.yaml from disk."""
        # Get project root
        project_root = Path(__file__).parent.parent.parent
        sprint_file = project_root / "sprint" / "current-sprint.yaml"

        if sprint_file.exists():
            result = validate_sprint_file(sprint_file)

            # The actual sprint file should be valid (or we have bugs to fix!)
            assert isinstance(result, ValidationResult)
            # If it's invalid, print errors for debugging
            if not result.valid:
                print("\nValidation errors in current-sprint.yaml:")
                for error in result.errors:
                    print(f"  {error.path}: {error.message}")

    def test_validate_nonexistent_file(self) -> None:
        """Should return error for nonexistent file."""
        result = validate_sprint_file(Path("/nonexistent/file.yaml"))

        assert result.valid is False
        assert any("not found" in e.message.lower() or "exist" in e.message.lower() for e in result.errors)

    def test_validate_invalid_yaml_file(self, tmp_path: Path) -> None:
        """Should return error for malformed YAML."""
        bad_file = tmp_path / "bad.yaml"
        bad_file.write_text("this: is: not: valid: yaml: [")

        result = validate_sprint_file(bad_file)

        assert result.valid is False
        assert any("yaml" in e.message.lower() or "parse" in e.message.lower() for e in result.errors)

    def test_single_quoted_strings_with_blank_lines_fail(self, tmp_path: Path) -> None:
        """Single-quoted strings with blank lines break Node yaml parser (Cyclist panel)."""
        bad_file = tmp_path / "bad-quotes.yaml"
        bad_file.write_text(
            "sprint:\n"
            "  number: 12\n"
            "  jira_sprint_id: 276\n"
            "  goal: Test\n"
            "  start_date: 2026-01-20\n"
            "  end_date: 2026-02-02\n"
            "  status: active\n"
            "epics:\n"
            "  - id: epic-1\n"
            "    title: Test Epic\n"
            "    description: 'Line one\n"
            "\n"
            "      Line after blank\n"
            "\n"
            "'\n"
            "    stories: []\n"
        )

        result = validate_sprint_file(bad_file)

        assert result.valid is False
        assert any("single-quoted" in e.message.lower() for e in result.errors)

    def test_block_scalar_descriptions_pass(self, tmp_path: Path) -> None:
        """Block scalar (|) descriptions should pass validation."""
        good_file = tmp_path / "good-blocks.yaml"
        good_file.write_text(
            "sprint:\n"
            "  number: 12\n"
            "  jira_sprint_id: 276\n"
            "  goal: Test\n"
            "  start_date: 2026-01-20\n"
            "  end_date: 2026-02-02\n"
            "  status: active\n"
            "epics:\n"
            "  - id: epic-1\n"
            "    title: Test Epic\n"
            "    description: |\n"
            "      Line one.\n"
            "\n"
            "      Line after blank.\n"
            "    stories:\n"
            "      - id: MSSCI-10001\n"
            "        title: A story\n"
            "        status: backlog\n"
            "        points: 3\n"
        )

        result = validate_sprint_file(good_file)

        assert result.valid is True


# =============================================================================
# Full Sprint Validation (integration)
# =============================================================================


class TestFullSprintValidation:
    """Integration tests for complete sprint validation."""

    def test_valid_full_sprint_passes(self, full_valid_sprint: dict[str, Any]) -> None:
        """A complete valid sprint should pass all validations."""
        result = validate_full_sprint(full_valid_sprint)

        assert result.valid is True
        assert len(result.errors) == 0

    def test_errors_from_all_levels_collected(self) -> None:
        """Validation should collect errors from sprint, epics, and stories."""
        data = {
            "sprint": {
                "number": 12,
                # Missing required fields
            },
            "epics": [
                {
                    "id": "epic-63",
                    # Missing title
                    "stories": [
                        {
                            "id": "63-1",
                            "title": "Story",
                            # Missing status and points
                        }
                    ],
                }
            ],
        }

        result = validate_full_sprint(data)

        assert result.valid is False
        # Should have errors from multiple levels
        assert len(result.errors) >= 3  # At least sprint, epic, and story errors

    def test_multiple_epics_all_validated(self) -> None:
        """All epics in a sprint should be validated."""
        data = {
            "sprint": {
                "number": 12,
                "jira_sprint_id": 276,
                "goal": "Test",
                "start_date": "2026-01-20",
                "end_date": "2026-02-02",
                "status": "active",
            },
            "epics": [
                {
                    "id": "epic-63",
                    "title": "Epic 1",
                    "stories": [
                        {"id": "63-1", "title": "S1", "status": "backlog", "points": 3},
                    ],
                },
                {
                    # Missing id and title
                    "stories": [],
                },
            ],
        }

        result = validate_full_sprint(data)

        assert result.valid is False
        # Second epic should have errors
        assert any("epic" in e.path.lower() and "1" in e.path for e in result.errors)


# =============================================================================
# ValidationResult behavior
# =============================================================================


class TestValidationResult:
    """Tests for ValidationResult dataclass behavior."""

    def test_starts_valid(self) -> None:
        """New ValidationResult should be valid by default."""
        result = ValidationResult(valid=True)

        assert result.valid is True
        assert len(result.errors) == 0

    def test_add_error_makes_invalid(self) -> None:
        """Adding an error should mark result as invalid."""
        result = ValidationResult(valid=True)

        result.add_error("Test error", "test.path")

        assert result.valid is False
        assert len(result.errors) == 1

    def test_add_warning_keeps_valid(self) -> None:
        """Adding a warning should NOT mark result as invalid."""
        result = ValidationResult(valid=True)

        result.add_error("Test warning", "test.path", ValidationSeverity.WARNING)

        assert result.valid is True
        assert len(result.errors) == 1

    def test_multiple_errors_accumulate(self) -> None:
        """Multiple errors should accumulate."""
        result = ValidationResult(valid=True)

        result.add_error("Error 1", "path.1")
        result.add_error("Error 2", "path.2")
        result.add_error("Error 3", "path.3")

        assert result.valid is False
        assert len(result.errors) == 3
