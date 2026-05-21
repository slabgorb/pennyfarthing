"""
Workflow step file auditing tools.

Audits workflow step files for conformance to schemas/workflow-step-schema.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from pf.common.config import get_dist_root

# Tag requirements
REQUIRED_TAGS = ["step-meta", "purpose", "instructions", "output"]
RECOMMENDED_TAGS = ["prerequisites", "actions", "collaboration-menu", "next-step"]
OPTIONAL_TAGS = ["gate"]

# step-meta required fields
STEP_META_FIELDS = ["number", "name", "gate"]


@dataclass
class StepAuditResult:
    """Result of auditing a workflow step file."""

    workflow_name: str
    step_name: str
    file_path: Path
    missing_required: list[str] = field(default_factory=list)
    missing_recommended: list[str] = field(default_factory=list)
    missing_meta_fields: list[str] = field(default_factory=list)
    present_tags: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        """Check if step passes validation (has all required)."""
        return len(self.missing_required) == 0 and len(self.missing_meta_fields) == 0

    @property
    def status(self) -> str:
        """Get status string."""
        if not self.is_valid:
            return "NEEDS UPDATE"
        if self.missing_recommended:
            return "PARTIAL"
        return "OK"


def _has_tag(content: str, tag: str) -> bool:
    """Check if content contains a specific XML tag."""
    return f"<{tag}>" in content or f"<{tag} " in content


def _check_step_meta_fields(content: str) -> list[str]:
    """Check which step-meta fields are missing."""
    # Extract step-meta section
    meta_match = re.search(r"<step-meta>(.+?)</step-meta>", content, re.DOTALL)
    if not meta_match:
        return STEP_META_FIELDS.copy()

    meta_content = meta_match.group(1)
    missing = []

    for field_name in STEP_META_FIELDS:
        if f"{field_name}:" not in meta_content:
            missing.append(field_name)

    return missing


def audit_step_file(file_path: Path) -> StepAuditResult:
    """Audit a single workflow step file.

    Args:
        file_path: Path to step-*.md file

    Returns:
        StepAuditResult with findings
    """
    # Determine workflow name from path
    # Could be workflows/{name}/steps/step-*.md
    # or workflows/{name}/steps-{mode}/step-*.md
    steps_dir = file_path.parent
    workflow_dir = steps_dir.parent
    workflow_name = workflow_dir.name
    step_name = file_path.stem

    content = file_path.read_text()

    result = StepAuditResult(workflow_name=workflow_name, step_name=step_name, file_path=file_path)

    # Check required tags
    for tag in REQUIRED_TAGS:
        if _has_tag(content, tag):
            result.present_tags.append(tag)
        else:
            result.missing_required.append(tag)

    # Check step-meta fields if tag exists
    if "step-meta" in result.present_tags:
        result.missing_meta_fields = _check_step_meta_fields(content)
        if result.missing_meta_fields:
            # Add to required as "step-meta fields: x, y"
            missing_str = ", ".join(result.missing_meta_fields)
            result.missing_required.append(f"step-meta fields ({missing_str})")

    # Check recommended tags
    for tag in RECOMMENDED_TAGS:
        if _has_tag(content, tag):
            result.present_tags.append(tag)
        else:
            result.missing_recommended.append(tag)

    # Check optional tags (just track presence)
    for tag in OPTIONAL_TAGS:
        if _has_tag(content, tag):
            result.present_tags.append(tag)

    return result


def find_step_files(root: Path) -> list[Path]:
    """Find all workflow step files in a project.

    Args:
        root: Project root directory

    Returns:
        List of step-*.md file paths
    """
    # Try multiple locations
    _dist = get_dist_root()
    workflow_dirs = [
        *([_dist / "workflows"] if _dist is not None else []),
        root / ".pennyfarthing" / "workflows",
        root / "pennyfarthing" / "pennyfarthing-dist" / "workflows",
        root / "pennyfarthing-dist" / "workflows",
    ]

    step_files = []

    for workflows_dir in workflow_dirs:
        if workflows_dir.exists():
            # Find step files in steps/ and steps-*/ directories
            for workflow_dir in workflows_dir.iterdir():
                if not workflow_dir.is_dir():
                    continue

                for steps_dir in workflow_dir.iterdir():
                    if steps_dir.is_dir() and steps_dir.name.startswith("steps"):
                        step_files.extend(steps_dir.glob("step-*.md"))

            break  # Only use first found workflows dir

    return sorted(step_files)


@dataclass
class WorkflowAuditResult:
    """Result of auditing a workflow's step files."""

    workflow_name: str
    step_results: list[StepAuditResult] = field(default_factory=list)

    @property
    def total_steps(self) -> int:
        return len(self.step_results)

    @property
    def valid_steps(self) -> int:
        return sum(1 for r in self.step_results if r.is_valid)

    @property
    def needs_update(self) -> int:
        return sum(1 for r in self.step_results if not r.is_valid)


def audit_workflow_steps(root: Path, *, workflow_name: str | None = None) -> dict[str, list | dict]:
    """Audit workflow step files in a project.

    Args:
        root: Project root directory
        workflow_name: Optional specific workflow to audit

    Returns:
        Dict with 'workflows', 'summary' keys
    """
    step_files = find_step_files(root)

    # Group by workflow
    workflows: dict[str, WorkflowAuditResult] = {}

    for file_path in step_files:
        result = audit_step_file(file_path)

        if workflow_name and result.workflow_name != workflow_name:
            continue

        if result.workflow_name not in workflows:
            workflows[result.workflow_name] = WorkflowAuditResult(
                workflow_name=result.workflow_name
            )

        workflows[result.workflow_name].step_results.append(result)

    # Calculate summary
    workflow_list = list(workflows.values())
    total_files = sum(w.total_steps for w in workflow_list)
    total_valid = sum(w.valid_steps for w in workflow_list)
    total_needs_update = sum(w.needs_update for w in workflow_list)

    all_results = [r for w in workflow_list for r in w.step_results]
    total_missing_required = sum(len(r.missing_required) for r in all_results)
    total_missing_recommended = sum(len(r.missing_recommended) for r in all_results)

    return {
        "workflows": workflow_list,
        "summary": {
            "total_workflows": len(workflow_list),
            "total_files": total_files,
            "valid": total_valid,
            "needs_update": total_needs_update,
            "missing_required": total_missing_required,
            "missing_recommended": total_missing_recommended,
        },
    }
