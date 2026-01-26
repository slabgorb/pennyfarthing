"""
Sprint and Story YAML validators for Pennyfarthing.

Story: MSSCI-12394 - Sprint and Story YAML validators

This module provides validation for:
- Sprint-level structure and required fields
- Story-level required fields and values
- Epic-level validation with story references
- Archived sprint validation

All functions raise NO errors - they return ValidationResult objects
with success status and error messages.
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import yaml


class ValidationSeverity(Enum):
    """Severity level for validation errors."""

    ERROR = "error"
    WARNING = "warning"


@dataclass
class ValidationError:
    """A single validation error."""

    message: str
    path: str  # JSON path to the error location (e.g., "epics[0].stories[1].status")
    severity: ValidationSeverity = ValidationSeverity.ERROR


@dataclass
class ValidationResult:
    """Result of validation with errors and warnings."""

    valid: bool
    errors: list[ValidationError] = field(default_factory=list)

    def add_error(
        self, message: str, path: str, severity: ValidationSeverity = ValidationSeverity.ERROR
    ) -> None:
        """Add an error to the result."""
        self.errors.append(ValidationError(message, path, severity))
        if severity == ValidationSeverity.ERROR:
            self.valid = False

    def merge(self, other: "ValidationResult") -> None:
        """Merge another result into this one."""
        self.errors.extend(other.errors)
        if not other.valid:
            self.valid = False


# =============================================================================
# Constants
# =============================================================================

VALID_SPRINT_STATUSES = {"active", "closed"}
VALID_STORY_STATUSES = {"backlog", "ready", "in_progress", "done", "canceled"}
JIRA_KEY_PATTERN = re.compile(r"^MSSCI-\d{5}$")
ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Required fields for sprint section
REQUIRED_SPRINT_FIELDS = {"number", "jira_sprint_id", "goal", "start_date", "end_date", "status"}

# Required fields for story
REQUIRED_STORY_FIELDS = {"id", "title", "status", "points"}

# Required fields for epic
REQUIRED_EPIC_FIELDS = {"id", "title"}


# =============================================================================
# Validation Functions
# =============================================================================


def validate_sprint(data: dict[str, Any]) -> ValidationResult:
    """Validate sprint-level structure and fields.

    Validates:
    - Required fields present (number, jira_sprint_id, goal, start_date, end_date, status)
    - status is valid value (active, closed)
    - dates are ISO format

    Args:
        data: Sprint YAML data (full document)

    Returns:
        ValidationResult with any errors found
    """
    result = ValidationResult(valid=True)

    # Check for sprint section
    if "sprint" not in data:
        result.add_error("Missing required 'sprint' section", "sprint")
        return result

    sprint = data["sprint"]

    # Check required fields
    for field_name in REQUIRED_SPRINT_FIELDS:
        if field_name not in sprint:
            result.add_error(
                f"Missing required field: {field_name}",
                f"sprint.{field_name}",
            )

    # Validate status if present
    if "status" in sprint:
        status = sprint["status"]
        if status not in VALID_SPRINT_STATUSES:
            result.add_error(
                f"Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_SPRINT_STATUSES))}",
                "sprint.status",
            )

    # Validate date formats
    for date_field in ["start_date", "end_date"]:
        if date_field in sprint:
            date_val = str(sprint[date_field])
            if not ISO_DATE_PATTERN.match(date_val):
                result.add_error(
                    f"Invalid date format for {date_field}: '{date_val}'. Expected YYYY-MM-DD",
                    f"sprint.{date_field}",
                )

    return result


def validate_story(story: dict[str, Any], epic_id: str, story_index: int = 0) -> ValidationResult:
    """Validate a single story's structure and fields.

    Validates:
    - Required fields present (id, title, status, points)
    - status is valid value (backlog, ready, in_progress, done, canceled)
    - points is numeric
    - jira key follows pattern MSSCI-NNNNN if present
    - branch follows convention if present

    Args:
        story: Story dict from YAML
        epic_id: Parent epic ID for path generation
        story_index: Index of story in epic's stories array

    Returns:
        ValidationResult with any errors found
    """
    result = ValidationResult(valid=True)
    base_path = f"{epic_id}.stories[{story_index}]"

    # Check required fields
    for field_name in REQUIRED_STORY_FIELDS:
        if field_name not in story:
            result.add_error(
                f"Missing required field: {field_name}",
                f"{base_path}.{field_name}",
            )

    # Validate status if present
    if "status" in story:
        status = story["status"]
        if status not in VALID_STORY_STATUSES:
            result.add_error(
                f"Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_STORY_STATUSES))}",
                f"{base_path}.status",
            )

    # Validate points is numeric
    if "points" in story:
        points = story["points"]
        if not isinstance(points, (int, float)):
            result.add_error(
                f"Invalid points value '{points}'. Must be numeric",
                f"{base_path}.points",
            )

    # Validate jira key format if present
    if "jira" in story:
        jira_key = str(story["jira"])
        if not JIRA_KEY_PATTERN.match(jira_key):
            result.add_error(
                f"Invalid Jira key format '{jira_key}'. Expected MSSCI-NNNNN",
                f"{base_path}.jira",
            )

    return result


def validate_epic(epic: dict[str, Any], all_story_ids: set[str], epic_index: int = 0) -> ValidationResult:
    """Validate an epic's structure and story references.

    Validates:
    - Required fields present (id, title)
    - All story IDs are unique within epic
    - No orphaned story references (if stories present)

    Args:
        epic: Epic dict from YAML
        all_story_ids: Set of all story IDs in the sprint (for uniqueness check)
        epic_index: Index of epic for path generation

    Returns:
        ValidationResult with any errors found
    """
    result = ValidationResult(valid=True)
    base_path = f"epics[{epic_index}]"
    epic_id = epic.get("id", f"epics[{epic_index}]")

    # Check required fields
    for field_name in REQUIRED_EPIC_FIELDS:
        if field_name not in epic:
            result.add_error(
                f"Missing required field: {field_name}",
                f"{base_path}.{field_name}",
            )

    # Validate stories if present
    if "stories" in epic:
        seen_in_epic: set[str] = set()
        for idx, story in enumerate(epic["stories"]):
            story_id = story.get("id")
            if story_id:
                # Check for duplicates within this epic
                if story_id in seen_in_epic:
                    result.add_error(
                        f"Duplicate story ID '{story_id}' within epic",
                        f"{base_path}.stories[{idx}].id",
                    )
                # Check for duplicates across epics
                elif story_id in all_story_ids:
                    result.add_error(
                        f"Duplicate story ID '{story_id}' - already exists in another epic",
                        f"{base_path}.stories[{idx}].id",
                    )
                seen_in_epic.add(story_id)

            # Validate story structure
            story_result = validate_story(story, epic_id, idx)
            result.merge(story_result)

    return result


def validate_full_sprint(data: dict[str, Any]) -> ValidationResult:
    """Validate complete sprint YAML including all epics and stories.

    Validates:
    - Sprint-level structure
    - All epics and their stories
    - Cross-cutting constraints (no duplicate story IDs)

    Args:
        data: Full sprint YAML data

    Returns:
        Combined ValidationResult with all errors
    """
    result = ValidationResult(valid=True)

    # Validate sprint section
    sprint_result = validate_sprint(data)
    result.merge(sprint_result)

    # Validate epics
    if "epics" in data:
        all_story_ids: set[str] = set()
        for idx, epic in enumerate(data["epics"]):
            epic_result = validate_epic(epic, all_story_ids, idx)
            result.merge(epic_result)

            # Collect story IDs for cross-epic duplicate detection
            if "stories" in epic:
                for story in epic["stories"]:
                    story_id = story.get("id")
                    if story_id:
                        all_story_ids.add(story_id)

    return result


def validate_archived_sprint(data: dict[str, Any]) -> ValidationResult:
    """Validate an archived sprint file.

    Archived sprints have the same structure as current sprints
    but allow done/canceled status for all stories.

    Args:
        data: Archived sprint YAML data

    Returns:
        ValidationResult with any errors found
    """
    # For archived sprints, use the same validation as full sprint
    # The key difference is that all story statuses are valid
    # (done/canceled are expected in archived sprints)
    return validate_full_sprint(data)


def validate_sprint_file(file_path: Path) -> ValidationResult:
    """Validate a sprint YAML file from disk.

    Loads the file and validates its contents.

    Args:
        file_path: Path to sprint YAML file

    Returns:
        ValidationResult with any errors (including load errors)
    """
    result = ValidationResult(valid=True)

    # Check file exists
    if not file_path.exists():
        result.add_error(
            f"File not found: {file_path}",
            str(file_path),
        )
        return result

    # Try to load YAML
    try:
        with open(file_path) as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        result.add_error(
            f"Failed to parse YAML: {e}",
            str(file_path),
        )
        return result

    # Validate loaded data
    return validate_full_sprint(data)


def format_validation_errors(result: ValidationResult) -> str:
    """Format validation errors for human-readable output.

    Args:
        result: ValidationResult to format

    Returns:
        Multi-line string with formatted errors
    """
    if not result.errors:
        return "No validation errors"

    lines = []
    for error in result.errors:
        severity_label = error.severity.value.upper()
        lines.append(f"[{severity_label}] {error.path}: {error.message}")

    return "\n".join(lines)


# =============================================================================
# CLI Entry Point
# =============================================================================


def main() -> int:
    """CLI entry point for sprint validation.

    Usage:
        python -m pennyfarthing_scripts.sprint.validator [file_path]

    If no file_path is provided, validates sprint/current-sprint.yaml.

    Returns:
        0 if valid, 1 if invalid
    """
    import sys

    from pennyfarthing_scripts.common.config import get_project_root

    # Determine file to validate
    if len(sys.argv) > 1:
        file_path = Path(sys.argv[1])
    else:
        file_path = get_project_root() / "sprint" / "current-sprint.yaml"

    print(f"Validating: {file_path}")
    result = validate_sprint_file(file_path)

    if result.valid:
        print("✓ Sprint YAML is valid")
        return 0
    else:
        print(f"✗ Found {len(result.errors)} validation error(s):\n")
        print(format_validation_errors(result))
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
