"""Sprint validate command.

Story: MSSCI-14255 - Sprint validate command with --fix flag

This module provides:
- validate_sprint_yaml(path, fix=False) -> ValidateResult
- check_format_drift(path) -> list[FormatIssue]
- validate_command (Click command for CLI registration)
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

import click
import yaml

from pf.sprint.validator import (
    REQUIRED_INITIATIVE_FIELDS,
    VALID_INITIATIVE_STATUSES,
    ValidationResult,
    validate_archived_sprint,
    validate_epic,
    validate_full_sprint,
    validate_future,
)
from pf.sprint.yaml_io import (
    EPIC_KEY_ORDER,
    SPRINT_KEY_ORDER,
    STORY_KEY_ORDER,
    TOP_KEY_ORDER,
    _canonicalize,
    read_sprint,
    write_sprint,
)


@dataclass
class FormatIssue:
    """A single format drift issue."""

    message: str
    path: str  # Field path (e.g., "sprint.status")
    line: int | None = None


@dataclass
class ValidateError:
    """A single validation error."""

    message: str
    path: str  # Field path (e.g., "epics[0].stories[1].status")
    category: str = "schema"  # "syntax", "schema", or "format"
    line: int | None = None


@dataclass
class ValidateResult:
    """Result of sprint YAML validation."""

    valid: bool
    errors: list[ValidateError] = field(default_factory=list)
    format_issues: list[FormatIssue] = field(default_factory=list)
    fixed: bool = False


def _check_key_order(
    data: Mapping,
    expected_order: list[str],
    path_prefix: str,
) -> list[FormatIssue]:
    """Check if keys in a mapping follow the expected order."""
    issues: list[FormatIssue] = []
    actual_keys = [k for k in data.keys() if k in expected_order]
    expected_filtered = [k for k in expected_order if k in actual_keys]

    if actual_keys != expected_filtered:
        issues.append(
            FormatIssue(
                message=f"Key order drift: expected {expected_filtered}, got {actual_keys}",
                path=path_prefix,
            )
        )

    return issues


def _check_string_styles(data: Mapping, path_prefix: str) -> list[FormatIssue]:
    """Check if multiline strings use block scalar style."""
    issues: list[FormatIssue] = []

    for key, value in data.items():
        if isinstance(value, str) and "\n" in value:
            # Check if it's using block scalar by examining the raw YAML
            # If it got loaded as a plain string with \n, it wasn't block scalar
            from ruamel.yaml.scalarstring import LiteralScalarString

            if not isinstance(value, LiteralScalarString):
                issues.append(
                    FormatIssue(
                        message=f"Wrong string style for '{key}': multiline text should use block scalar (|)",
                        path=f"{path_prefix}.{key}",
                    )
                )

    return issues


def check_format_drift(path: Path) -> list[FormatIssue]:
    """Check a sprint YAML file for format drift.

    Detects:
    - Key ordering that doesn't match sprint-template.yaml
    - Wrong string styles (plain vs block scalar for multiline)

    Args:
        path: Path to sprint YAML file

    Returns:
        List of FormatIssue objects
    """
    try:
        data = read_sprint(path)
    except (FileNotFoundError, ValueError):
        return []

    issues: list[FormatIssue] = []

    # Check top-level key order
    issues.extend(_check_key_order(data, TOP_KEY_ORDER, ""))

    # Check sprint section key order
    if "sprint" in data and isinstance(data["sprint"], Mapping):
        issues.extend(_check_key_order(data["sprint"], SPRINT_KEY_ORDER, "sprint"))

    # Check epics
    if "epics" in data and isinstance(data["epics"], list):
        for i, epic in enumerate(data["epics"]):
            if isinstance(epic, Mapping):
                epic_path = f"epics[{i}]"
                issues.extend(_check_key_order(epic, EPIC_KEY_ORDER, epic_path))
                issues.extend(_check_string_styles(epic, epic_path))

                # Check stories within epic
                if "stories" in epic and isinstance(epic["stories"], list):
                    for j, story in enumerate(epic["stories"]):
                        if isinstance(story, Mapping):
                            story_path = f"{epic_path}.stories[{j}]"
                            issues.extend(_check_key_order(story, STORY_KEY_ORDER, story_path))
                            issues.extend(_check_string_styles(story, story_path))

    return issues


def _validate_initiative_shard(data: dict) -> ValidationResult:
    """Validate a standalone initiative shard file (initiative-*.yaml)."""
    result = ValidationResult(valid=True)
    if not isinstance(data, dict):
        result.add_error("Initiative shard must be a mapping", "")
        return result
    for field_name in REQUIRED_INITIATIVE_FIELDS:
        if field_name not in data:
            result.add_error(f"Missing required field: {field_name}", field_name)
    if "status" in data:
        status = data["status"]
        if status and status not in VALID_INITIATIVE_STATUSES:
            result.add_error(
                f"Invalid initiative status '{status}'. Must be one of: {', '.join(sorted(VALID_INITIATIVE_STATUSES))}",
                "status",
            )
    return result


def validate_sprint_yaml(path: Path, fix: bool = False) -> ValidateResult:
    """Validate a sprint YAML file for syntax, schema, and format issues.

    Args:
        path: Path to sprint YAML file
        fix: If True, automatically repair format issues

    Returns:
        ValidateResult with errors and format issues
    """
    result = ValidateResult(valid=True)

    # Check file exists
    if not path.exists():
        result.valid = False
        result.errors.append(
            ValidateError(
                message=f"File not found: {path}",
                path=str(path),
                category="syntax",
            )
        )
        return result

    # Step 1: Try to parse YAML (catch syntax errors with line numbers)
    try:
        with open(path) as f:
            raw_content = f.read()

        if not raw_content.strip():
            result.valid = False
            result.errors.append(
                ValidateError(
                    message="Empty YAML file",
                    path=str(path),
                    category="syntax",
                    line=1,
                )
            )
            return result

        data = yaml.safe_load(raw_content)
    except yaml.YAMLError as e:
        result.valid = False
        line = None
        if hasattr(e, "problem_mark") and e.problem_mark is not None:
            line = e.problem_mark.line + 1  # 0-indexed to 1-indexed
        result.errors.append(
            ValidateError(
                message=f"YAML syntax error: {e}",
                path=str(path),
                category="syntax",
                line=line,
            )
        )
        return result

    if data is None:
        result.valid = False
        result.errors.append(
            ValidateError(
                message="Empty YAML file",
                path=str(path),
                category="syntax",
                line=1,
            )
        )
        return result

    # Step 2: Schema validation — detect file type and use appropriate validator
    #
    # Shard files (epic-*.yaml, initiative-*.yaml) are standalone fragments
    # that don't have the full sprint/future structure. Validate their
    # internal structure only — the index files handle cross-references.
    is_epic_shard = path.name.startswith("epic-") and path.name.endswith(".yaml")
    is_initiative_shard = path.name.startswith("initiative-") and path.name.endswith(".yaml")
    is_archive = path.name.startswith("sprint-") and path.name.endswith("-completed.yaml")
    is_future = path.name == "future.yaml" or "future" in data

    if is_epic_shard:
        # Epic shard: validate as a single epic (has id, title, stories)
        schema_result = validate_epic(data, set(), 0)
    elif is_initiative_shard:
        # Initiative shard: validate as a single initiative (has name, status)
        schema_result = _validate_initiative_shard(data)
    elif is_archive:
        # Archive file: must have sprint.number for filtering
        schema_result = validate_archived_sprint(data)
    elif is_future:
        schema_result = validate_future(data)
    else:
        schema_result = validate_full_sprint(data)
    if not schema_result.valid:
        result.valid = False
    for err in schema_result.errors:
        result.errors.append(
            ValidateError(
                message=err.message,
                path=err.path,
                category="schema",
            )
        )

    # Step 3: Format drift detection (sprint files only — shards and future.yaml have different structure)
    if not is_future and not is_epic_shard and not is_initiative_shard:
        format_issues = check_format_drift(path)
        result.format_issues = format_issues

    # Step 4: Fix if requested (only format issues, not schema; sprint files only)
    if fix and not is_future and not is_epic_shard and not is_initiative_shard and path.exists():
        try:
            canon_data = _canonicalize(read_sprint(path))
            write_sprint(path, canon_data)
            result.fixed = True
        except (FileNotFoundError, ValueError):
            pass

    return result


@click.command("validate")
@click.argument("file", required=False, type=click.Path(exists=False))
@click.option("--fix", is_flag=True, help="Automatically repair format issues")
def validate_command(file: str | None, fix: bool) -> None:
    """Validate sprint YAML for syntax, schema, and format issues."""
    if file is None:
        raise click.ClickException("No file specified")

    path = Path(file)
    result = validate_sprint_yaml(path, fix=fix)

    if result.errors:
        for err in result.errors:
            severity = err.category.upper()
            line_info = f" (line {err.line})" if err.line else ""
            click.echo(f"[{severity}] {err.path}: {err.message}{line_info}")

    if result.format_issues:
        for issue in result.format_issues:
            click.echo(f"[FORMAT] {issue.path}: {issue.message}")

    if not result.valid:
        error_count = len(result.errors)
        click.echo(f"\nFound {error_count} error(s). Sprint YAML is invalid.")
        raise SystemExit(1)

    if result.format_issues and not fix:
        click.echo(
            f"\nFound {len(result.format_issues)} format issue(s). Run with --fix to repair."
        )

    if result.valid and not result.errors:
        click.echo("Sprint YAML is valid.")
