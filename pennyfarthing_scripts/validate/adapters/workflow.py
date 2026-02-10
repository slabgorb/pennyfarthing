"""Workflow YAML schema validator adapter.

Validates workflow definition files in pennyfarthing-dist/workflows/.
Checks common fields, variant-specific structure (phased/stepped/procedural),
and cross-references agent names against agent definitions.

Story: MSSCI-14709 (91-11)
"""

from __future__ import annotations

from pathlib import Path

from pennyfarthing_scripts.validate import ValidateReport

# Known workflow types
VALID_TYPES = {"phased", "stepped", "procedural"}

# Known gate types for phased workflows
VALID_GATE_TYPES = {
    "tests_pass",
    "tests_fail",
    "approval",
    "manual",
    "validation",
    "design_review",
    "quality_pass",
}


def discover_workflow_files(workflows_dir: Path) -> list[Path]:
    """Discover all workflow YAML files.

    Finds root-level *.yaml files and subdirectory workflow.yaml files.

    Returns:
        List of Path objects for workflow YAML files.
    """
    # Stub — not implemented
    return []


def validate_common(data: dict, path: Path) -> tuple[list[str], list[str]]:
    """Validate common fields present in all workflow types.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    # Stub — not implemented
    return [], []


def validate_phased(data: dict, path: Path, agents_dir: Path) -> tuple[list[str], list[str]]:
    """Validate phased workflow structure.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    # Stub — not implemented
    return [], []


def validate_stepped(data: dict, path: Path, agents_dir: Path) -> tuple[list[str], list[str]]:
    """Validate stepped workflow structure.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    # Stub — not implemented
    return [], []


def validate_procedural(data: dict, path: Path, agents_dir: Path) -> tuple[list[str], list[str]]:
    """Validate procedural workflow structure.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    # Stub — not implemented
    return [], []


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all workflow definition files."""
    # Stub — returns empty report
    return ValidateReport(validator="workflow")
