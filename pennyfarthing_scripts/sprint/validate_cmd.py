"""Sprint validate command - stub for TDD RED phase.

Story: MSSCI-14255 - Sprint validate command with --fix flag

This module provides:
- validate_sprint_yaml(path, fix=False) -> ValidateResult
- check_format_drift(path) -> list[FormatIssue]
- validate_command (Click command for CLI registration)

All functions are stubs that raise NotImplementedError.
"""

from dataclasses import dataclass, field
from pathlib import Path

import click


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


def validate_sprint_yaml(path: Path, fix: bool = False) -> ValidateResult:
    """Validate a sprint YAML file for syntax, schema, and format issues.

    Args:
        path: Path to sprint YAML file
        fix: If True, automatically repair format issues

    Returns:
        ValidateResult with errors and format issues
    """
    raise NotImplementedError("validate_sprint_yaml not implemented")


def check_format_drift(path: Path) -> list[FormatIssue]:
    """Check a sprint YAML file for format drift.

    Detects:
    - Key ordering that doesn't match sprint-template.yaml
    - Wrong string styles (plain vs block scalar for multiline)
    - Indentation issues

    Args:
        path: Path to sprint YAML file

    Returns:
        List of FormatIssue objects
    """
    raise NotImplementedError("check_format_drift not implemented")


@click.command("validate")
@click.argument("file", required=False, type=click.Path(exists=False))
@click.option("--fix", is_flag=True, help="Automatically repair format issues")
def validate_command(file: str | None, fix: bool) -> None:
    """Validate sprint YAML for syntax, schema, and format issues."""
    raise NotImplementedError("validate_command not implemented")
