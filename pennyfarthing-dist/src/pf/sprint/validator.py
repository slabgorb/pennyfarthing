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
VALID_STORY_STATUSES = {
    "backlog",
    "ready",
    "in_progress",
    "in_review",
    "done",
    "canceled",
    "planning",
}
JIRA_KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]+-\d+(\s*/\s*[A-Z][A-Z0-9_]+-\d+)*$")
ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Required fields for sprint section
REQUIRED_SPRINT_FIELDS = {"number", "goal", "start_date", "end_date", "status"}

# Required fields for story
REQUIRED_STORY_FIELDS = {"id", "title", "status", "points"}

# Required fields for epic
REQUIRED_EPIC_FIELDS = {"id", "title"}

# Required fields for epic shard files (write-time validation, ADR-0022)
REQUIRED_EPIC_SHARD_FIELDS = {"id", "title", "status", "stories"}
REQUIRED_SHARD_STORY_FIELDS = {"id", "title", "points", "status"}

# Required fields for future.yaml initiative
REQUIRED_INITIATIVE_FIELDS = {"name", "status"}

# Required fields for future.yaml epic (what promote-epic.sh needs)
REQUIRED_FUTURE_EPIC_FIELDS = {"id", "title", "points"}

# Required fields for future.yaml story (what promote-epic.sh transforms)
REQUIRED_FUTURE_STORY_FIELDS = {"id", "title", "points"}

VALID_INITIATIVE_STATUSES = {
    "ready",
    "planning",
    "blocked",
    "research_complete",
    "backlog",
    "complete",
    "canceled",
}


# =============================================================================
# Validation Functions
# =============================================================================


def validate_sprint(data: dict[str, Any]) -> ValidationResult:
    """Validate sprint-level structure and fields.

    Validates:
    - Required fields present (goal, start_date, end_date, status)
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
        result.add_error(
            "Missing required 'sprint' section. "
            "To fix: Add a `sprint:` key with `number`, `goal`, `start_date`, `end_date`, and `status` fields",
            "sprint",
        )
        return result

    sprint = data["sprint"]

    # Check required fields
    _SPRINT_FIELD_HINTS = {
        "number": "e.g. `number: 12`",
        "goal": "e.g. `goal: Complete the sprint`",
        "start_date": "e.g. `start_date: 2026-01-20`",
        "end_date": "e.g. `end_date: 2026-02-02`",
        "status": "e.g. `status: active`",
    }
    for field_name in REQUIRED_SPRINT_FIELDS:
        if field_name not in sprint:
            hint = _SPRINT_FIELD_HINTS.get(field_name, "")
            fix = f" To fix: Add `{field_name}:` to the sprint section, {hint}" if hint else ""
            result.add_error(
                f"Missing required field: {field_name}.{fix}",
                f"sprint.{field_name}",
            )

    # Validate number is an integer (required for archive filtering)
    if "number" in sprint:
        if not isinstance(sprint["number"], int):
            result.add_error(
                f"Sprint number must be an integer, got {type(sprint['number']).__name__}. "
                "To fix: Use an unquoted integer, e.g. `number: 12`",
                "sprint.number",
            )

    # Validate status if present
    if "status" in sprint:
        status = sprint["status"]
        if status not in VALID_SPRINT_STATUSES:
            result.add_error(
                f"Invalid status '{status}'. "
                f"To fix: Use one of: {', '.join(sorted(VALID_SPRINT_STATUSES))}",
                "sprint.status",
            )

    # Validate date formats
    for date_field in ["start_date", "end_date"]:
        if date_field in sprint:
            date_val = str(sprint[date_field])
            if not ISO_DATE_PATTERN.match(date_val):
                result.add_error(
                    f"Invalid date format for {date_field}: '{date_val}'. "
                    f"To fix: Use YYYY-MM-DD format, e.g. `{date_field}: 2026-01-20`",
                    f"sprint.{date_field}",
                )

    return result


def validate_story(story: dict[str, Any], epic_id: str, story_index: int = 0) -> ValidationResult:
    """Validate a single story's structure and fields.

    Validates:
    - Required fields present (id, title, status, points)
    - status is valid value (backlog, ready, in_progress, in_review, done, canceled)
    - points is numeric
    - jira key follows PROJECT-NUMBER pattern if present
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
    _STORY_FIELD_HINTS = {
        "id": "e.g. `id: 141-1`",
        "title": "e.g. `title: My story title`",
        "status": f"e.g. `status: backlog` (valid: {', '.join(sorted(VALID_STORY_STATUSES))})",
        "points": "e.g. `points: 3`",
    }
    for field_name in REQUIRED_STORY_FIELDS:
        if field_name not in story:
            hint = _STORY_FIELD_HINTS.get(field_name, "")
            result.add_error(
                f"Missing required field: {field_name}. To fix: Add `{field_name}:` to the story, {hint}",
                f"{base_path}.{field_name}",
            )

    # Validate status if present
    if "status" in story:
        status = story["status"]
        if status not in VALID_STORY_STATUSES:
            result.add_error(
                f"Invalid status '{status}'. "
                f"To fix: Use one of: {', '.join(sorted(VALID_STORY_STATUSES))}",
                f"{base_path}.status",
            )

    # Validate points is numeric
    if "points" in story:
        points = story["points"]
        if not isinstance(points, (int, float)):
            result.add_error(
                f"Invalid points value '{points}'. To fix: Use a number, e.g. `points: 3`",
                f"{base_path}.points",
            )

    # Validate jira key format if present
    if "jira" in story:
        jira_key = str(story["jira"])
        if not JIRA_KEY_PATTERN.match(jira_key):
            result.add_error(
                f"Invalid Jira key format '{jira_key}'. "
                "To fix: Use PROJECT-NUMBER format, e.g. `jira: MSSCI-12345`",
                f"{base_path}.jira",
            )

    return result


def validate_epic(
    epic: dict[str, Any], all_story_ids: set[str], epic_index: int = 0
) -> ValidationResult:
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
    _EPIC_FIELD_HINTS = {"id": 'e.g. `id: "141"`', "title": "e.g. `title: My Epic`"}
    for field_name in REQUIRED_EPIC_FIELDS:
        if field_name not in epic:
            hint = _EPIC_FIELD_HINTS.get(field_name, "")
            result.add_error(
                f"Missing required field: {field_name}. To fix: Add `{field_name}:` to the epic, {hint}",
                f"{base_path}.{field_name}",
            )

    # Reject non-string IDs (YAML parses bare integers like `id: 87` as int,
    # which crashes Cyclist's sprint-data.ts — epicId.match() fails on non-strings)
    if "id" in epic and not isinstance(epic["id"], str):
        result.add_error(
            f"Epic ID must be a string, got {type(epic['id']).__name__} ({epic['id']!r}). "
            'Quote it in YAML (e.g., id: "87" not id: 87)',
            f"{base_path}.id",
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


def validate_epic_shard(epic: dict[str, Any]) -> ValidationResult:
    """Validate an epic shard dict before writing to disk.

    Enforces stricter requirements than validate_epic() since shards
    are standalone files that must be self-contained.

    Validates:
    - Required fields present (id, title, status, stories)
    - stories is a list
    - Each story has required fields (id, title, points, status)
    - No duplicate story IDs within the epic
    - jira key follows PROJECT-NUMBER pattern if present

    Args:
        epic: Epic shard dict to validate

    Returns:
        ValidationResult with any errors found
    """
    result = ValidationResult(valid=True)

    # Check required shard fields
    _SHARD_FIELD_HINTS = {
        "id": 'e.g. `id: "141"`',
        "title": "e.g. `title: My Epic`",
        "status": "e.g. `status: active`",
        "stories": "e.g. `stories: []`",
    }
    for field_name in REQUIRED_EPIC_SHARD_FIELDS:
        if field_name not in epic:
            hint = _SHARD_FIELD_HINTS.get(field_name, "")
            result.add_error(
                f"Missing required field: {field_name}. To fix: Add `{field_name}:` to the epic shard, {hint}",
                f"epic.{field_name}",
            )

    # Reject non-string IDs (YAML parses bare integers like `id: 87` as int,
    # which crashes Cyclist's sprint-data.ts checkEpicContext — epicId.match() fails)
    if "id" in epic and not isinstance(epic["id"], str):
        result.add_error(
            f"Epic ID must be a string, got {type(epic['id']).__name__} ({epic['id']!r}). "
            'Quote it in YAML (e.g., id: "87" not id: 87)',
            "epic.id",
        )

    # Reject epic- prefix in ID (ADR-0022: reference prefix should not be baked into value)
    if "id" in epic:
        epic_id_val = str(epic["id"])
        if epic_id_val.startswith("epic-"):
            result.add_error(
                f"Epic ID '{epic_id_val}' starts with 'epic-' prefix. "
                "Use the numeric ID (e.g., '94' not 'epic-94')",
                "epic.id",
            )

    # Validate jira key format if present
    if "jira" in epic:
        jira_key = str(epic["jira"])
        if not JIRA_KEY_PATTERN.match(jira_key):
            result.add_error(
                f"Invalid Jira key format '{jira_key}'. Expected PROJECT-NUMBER format (e.g., DPGD-17, MSSCI-12345)",
                "epic.jira",
            )

    # Validate stories field
    if "stories" in epic:
        stories = epic["stories"]
        if not isinstance(stories, list):
            result.add_error(
                "'stories' must be a list",
                "epic.stories",
            )
        else:
            seen_ids: set[str] = set()
            epic_id = epic.get("id", "epic")
            for idx, story in enumerate(stories):
                story_id = story.get("id")
                if story_id:
                    if story_id in seen_ids:
                        result.add_error(
                            f"Duplicate story ID '{story_id}' within epic",
                            f"epic.stories[{idx}].id",
                        )
                    seen_ids.add(story_id)

                # Check required story fields
                for field_name in REQUIRED_SHARD_STORY_FIELDS:
                    if field_name not in story:
                        result.add_error(
                            f"Missing required field: {field_name}",
                            f"{epic_id}.stories[{idx}].{field_name}",
                        )

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

    # Validate epics (skip if sharded — epics are string refs to shard files)
    all_story_ids: set[str] = set()
    if "epics" in data:
        for idx, epic in enumerate(data["epics"]):
            # Sharded format: epics are string refs, not dicts
            if isinstance(epic, str):
                continue
            epic_result = validate_epic(epic, all_story_ids, idx)
            result.merge(epic_result)

            # Collect story IDs for cross-epic duplicate detection
            if "stories" in epic:
                for story in epic["stories"]:
                    story_id = story.get("id")
                    if story_id:
                        all_story_ids.add(story_id)

    # Validate depends_on references and detect cycles
    if all_story_ids:
        _validate_depends_on(data, all_story_ids, result)

    return result


def _validate_depends_on(
    data: dict[str, Any], all_story_ids: set[str], result: ValidationResult
) -> None:
    """Validate depends_on references: targets exist and no cycles."""
    deps: dict[str, str] = {}  # story_id -> depends_on target

    for epic in data.get("epics", []):
        if isinstance(epic, str):
            continue
        for story in epic.get("stories", []):
            sid = str(story.get("id", ""))
            dep = story.get("depends_on")
            if dep is None:
                continue
            dep = str(dep)
            if dep not in all_story_ids:
                result.add_error(
                    f"depends_on '{dep}' references non-existent story. "
                    f"To fix: Use an existing story ID or remove depends_on",
                    f"{sid}.depends_on",
                )
            else:
                deps[sid] = dep

    # Cycle detection via visited set
    for start in deps:
        visited: set[str] = set()
        current = start
        while current in deps:
            if current in visited:
                cycle = " -> ".join(list(visited) + [current])
                result.add_error(
                    f"Circular dependency detected: {cycle}. "
                    "To fix: Remove one depends_on to break the cycle",
                    f"{start}.depends_on",
                )
                break
            visited.add(current)
            current = deps[current]


def validate_archived_sprint(data: dict[str, Any]) -> ValidationResult:
    """Validate an archived sprint file.

    Archived sprints must have a sprint.number field so that
    get_archived_stories(only_current=True) can filter correctly.
    Without it, all archives are included in status counts.

    Args:
        data: Archived sprint YAML data

    Returns:
        ValidationResult with any errors found
    """
    result = ValidationResult(valid=True)

    # Require sprint.number — without it, archive filtering breaks
    sprint = data.get("sprint", {})
    if "number" not in sprint:
        result.add_error(
            "Missing required field: number (required for archive filtering)",
            "sprint.number",
        )
    elif not isinstance(sprint["number"], int):
        result.add_error(
            f"Sprint number must be an integer, got {type(sprint['number']).__name__}",
            "sprint.number",
        )

    return result


def validate_future(data: dict[str, Any]) -> ValidationResult:
    """Validate future.yaml structure.

    Validates the structure that promote-epic.sh and list-future.sh depend on:
    - future.initiatives[] array exists
    - Each initiative has name, status
    - Each epic has id, title, points (required by promote-epic.sh)
    - Each story has id, title, points (required by promote-epic.sh)

    Args:
        data: Future YAML data (full document)

    Returns:
        ValidationResult with any errors found
    """
    result = ValidationResult(valid=True)

    if "future" not in data:
        result.add_error("Missing required 'future' section", "future")
        return result

    future = data["future"]
    if "initiatives" not in future:
        result.add_error("Missing required 'initiatives' array", "future.initiatives")
        return result

    initiatives = future["initiatives"]
    if not isinstance(initiatives, list):
        result.add_error("'initiatives' must be an array", "future.initiatives")
        return result

    for i, initiative in enumerate(initiatives):
        # Sharded format: initiatives are string slugs, not dicts
        if isinstance(initiative, str):
            continue
        if not isinstance(initiative, dict):
            result.add_error("Initiative must be a mapping", f"future.initiatives[{i}]")
            continue

        base_path = f"future.initiatives[{i}]"

        # Check required initiative fields
        for field_name in REQUIRED_INITIATIVE_FIELDS:
            if field_name not in initiative:
                result.add_error(
                    f"Missing required field: {field_name}",
                    f"{base_path}.{field_name}",
                )

        # Validate initiative status
        if "status" in initiative:
            status = initiative["status"]
            if status not in VALID_INITIATIVE_STATUSES:
                result.add_error(
                    f"Invalid initiative status '{status}'. Must be one of: {', '.join(sorted(VALID_INITIATIVE_STATUSES))}",
                    f"{base_path}.status",
                )

        # Validate epics if present
        if "epics" in initiative and isinstance(initiative["epics"], list):
            seen_epic_ids: set[str] = set()
            for j, epic in enumerate(initiative["epics"]):
                if not isinstance(epic, dict):
                    continue
                epic_path = f"{base_path}.epics[{j}]"

                for field_name in REQUIRED_FUTURE_EPIC_FIELDS:
                    if field_name not in epic:
                        result.add_error(
                            f"Missing required field: {field_name}",
                            f"{epic_path}.{field_name}",
                        )

                # Check duplicate epic IDs
                epic_id = epic.get("id")
                if epic_id:
                    if epic_id in seen_epic_ids:
                        result.add_error(
                            f"Duplicate epic ID '{epic_id}'",
                            f"{epic_path}.id",
                        )
                    seen_epic_ids.add(epic_id)

                # Validate points is numeric
                if "points" in epic and not isinstance(epic["points"], (int, float)):
                    result.add_error(
                        f"Invalid points value '{epic['points']}'. Must be numeric",
                        f"{epic_path}.points",
                    )

                # Validate stories if present
                if "stories" in epic and isinstance(epic["stories"], list):
                    for k, story in enumerate(epic["stories"]):
                        if not isinstance(story, dict):
                            continue
                        story_path = f"{epic_path}.stories[{k}]"

                        for field_name in REQUIRED_FUTURE_STORY_FIELDS:
                            if field_name not in story:
                                result.add_error(
                                    f"Missing required field: {field_name}",
                                    f"{story_path}.{field_name}",
                                )

                        if "points" in story and not isinstance(story["points"], (int, float)):
                            result.add_error(
                                f"Invalid points value '{story['points']}'. Must be numeric",
                                f"{story_path}.points",
                            )

    return result


def validate_sprint_file(file_path: Path, *, strict: bool = False) -> ValidationResult:
    """Validate a sprint YAML file from disk.

    Loads the file and validates its contents. In strict mode, loader
    warnings (e.g., unresolvable shard refs) are promoted to errors.

    Args:
        file_path: Path to sprint YAML file
        strict: If True, treat loader warnings as validation errors

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

    # Read raw content for cross-parser compatibility check
    raw_content = file_path.read_text()

    # Detect single-quoted YAML values spanning blank lines. These parse in
    # Python's yaml but fail in Node's yaml library (used by Cyclist's panel).
    # Walk lines tracking whether we're inside a single-quoted value.
    in_sq = False
    sq_start_line = 0
    has_blank = False
    for line_num, line in enumerate(raw_content.splitlines(), 1):
        if not in_sq:
            # Look for a value starting with single quote: "key: 'text..."
            # Must be a YAML value position (after colon+space), not inside
            # block scalars (|, >) or comments.
            stripped = line.lstrip()
            if stripped.startswith("#"):
                continue
            colon_match = re.search(r":\s+'", line)
            if colon_match:
                after = line[colon_match.end() - 1 :]  # from the opening quote
                # Count unescaped quotes ('' is escape for ' in YAML)
                clean = after.replace("''", "")
                if clean.count("'") == 1:
                    # Opening quote without closing — multiline single-quoted string
                    in_sq = True
                    sq_start_line = line_num
                    has_blank = False
        else:
            if line.strip() == "":
                has_blank = True
            # Check if this line closes the single-quoted string
            clean = line.replace("''", "")
            if "'" in clean:
                if has_blank:
                    result.add_error(
                        "Single-quoted string contains blank lines (breaks Cyclist panel parser). "
                        "Use block scalar (|) or flow-style double-quoted string instead.",
                        f"{file_path}:{sq_start_line}",
                    )
                in_sq = False
                has_blank = False

    if result.errors:
        return result

    # Try to load YAML
    try:
        data = yaml.safe_load(raw_content)
    except yaml.YAMLError as e:
        result.add_error(
            f"Failed to parse YAML: {e}",
            str(file_path),
        )
        return result

    # Merge sharded epic files if present, capturing warnings in strict mode
    from pf.sprint.loader import _merge_epic_shards

    if strict:
        import warnings as _warnings

        with _warnings.catch_warnings(record=True) as caught:
            _warnings.simplefilter("always")
            data = _merge_epic_shards(data, file_path.parent)
        for w in caught:
            result.add_error(str(w.message), str(file_path))
    else:
        data = _merge_epic_shards(data, file_path.parent)

    # Validate loaded data
    full_result = validate_full_sprint(data)
    result.merge(full_result)
    return result


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
        python -m pf.sprint.validator [file_path]

    If no file_path is provided, validates sprint/current-sprint.yaml.

    Returns:
        0 if valid, 1 if invalid
    """
    import sys

    from pf.common.config import get_project_root

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
