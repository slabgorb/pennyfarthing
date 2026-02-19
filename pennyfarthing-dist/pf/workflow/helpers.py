"""
Shared helpers for workflow commands.

Extracted from complete-step.py and bash scripts. Provides common
functions for session parsing, workflow file resolution, and step management.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from pf.common.config import get_project_root


def get_workflows_dir(project_root: Path | None = None) -> Path:
    """Get the workflows directory path."""
    root = project_root or get_project_root()
    return root / ".pennyfarthing" / "workflows"


def get_session_dir(project_root: Path | None = None) -> Path:
    """Get the session directory path."""
    root = project_root or get_project_root()
    return root / ".session"


def find_workflow_file(workflows_dir: Path, workflow_name: str) -> Path | None:
    """Find workflow YAML definition.

    Supports both flat (name.yaml) and nested (name/workflow.yaml) layouts.

    Returns:
        Path to the workflow file, or None if not found.
    """
    flat = workflows_dir / f"{workflow_name}.yaml"
    if flat.exists():
        return flat

    nested = workflows_dir / workflow_name / "workflow.yaml"
    if nested.exists():
        return nested

    return None


def load_workflow_data(workflow_file: Path) -> dict:
    """Load and parse workflow YAML file.

    Returns:
        Parsed YAML data dict.
    """
    with open(workflow_file) as f:
        return yaml.safe_load(f) or {}


def get_workflow_type(workflow_data: dict) -> str:
    """Get workflow type from parsed YAML data.

    Returns:
        'phased', 'stepped', or 'procedural'
    """
    wf = workflow_data.get("workflow", {})
    wf_type = wf.get("type", "phased")
    has_steps = wf.get("steps") is not None
    if has_steps or wf_type == "stepped":
        return "stepped"
    return wf_type


def resolve_steps_path(
    workflow_data: dict,
    workflow_dir: Path,
    mode: str | None,
    project_root: Path,
) -> Path:
    """Resolve the steps directory path from workflow data.

    Handles mode-specific paths, relative paths, and absolute paths.

    Args:
        workflow_data: Parsed workflow YAML
        workflow_dir: Directory containing the workflow.yaml file
        mode: Active mode (create, validate, edit) or None
        project_root: Project root directory

    Returns:
        Resolved absolute Path to steps directory
    """
    wf = workflow_data.get("workflow", {})

    # Try mode-specific path first
    if mode:
        modes = wf.get("modes", {})
        mode_path = modes.get(mode)
        if mode_path and mode_path != "null":
            return _resolve_path(mode_path, workflow_dir, project_root)

    # Try default mode
    default_mode = wf.get("modes", {}).get("default")
    if default_mode:
        modes = wf.get("modes", {})
        mode_path = modes.get(default_mode)
        if mode_path and mode_path != "null":
            return _resolve_path(mode_path, workflow_dir, project_root)

    # Fall back to steps.path
    steps_path_str = wf.get("steps", {}).get("path", ".")
    return _resolve_path(steps_path_str, workflow_dir, project_root)


def _resolve_path(path_str: str, workflow_dir: Path, project_root: Path) -> Path:
    """Resolve a path string relative to workflow dir or project root."""
    if path_str.startswith("./"):
        return workflow_dir / path_str[2:]
    elif not Path(path_str).is_absolute():
        return project_root / path_str
    else:
        return Path(path_str)


def count_steps(steps_path: Path) -> int:
    """Count step files in a directory."""
    if not steps_path.is_dir():
        return 0
    return len([
        f for f in steps_path.iterdir()
        if f.is_file() and re.match(r"step-\d+", f.name) and f.suffix == ".md"
    ])


def find_step_file(steps_path: Path, step_number: int) -> Path | None:
    """Find step file for a given step number.

    Handles naming variants: step-01.md, step-01-name.md, step-1-name.md
    """
    padded = f"{step_number:02d}"
    matches = sorted([
        f for f in steps_path.iterdir()
        if f.is_file()
        and (f.name.startswith(f"step-{padded}") or f.name.startswith(f"step-{step_number}-"))
        and f.suffix == ".md"
    ])
    return matches[0] if matches else None


def strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from step file content."""
    if not content.startswith("---"):
        return content
    end = content.find("---", 3)
    if end == -1:
        return content
    return content[end + 3:].lstrip("\n")


def parse_session_field(content: str, field: str) -> str:
    """Extract a field value from session markdown.

    Matches lines like: - **Field:** value
    """
    pattern = rf"^- \*\*{re.escape(field)}:\*\*\s*(.+)$"
    match = re.search(pattern, content, re.MULTILINE)
    return match.group(1).strip() if match else ""


def find_workflow_session(
    session_dir: Path, workflow_name: str | None
) -> tuple[Path, str] | None:
    """Find workflow session file and determine workflow name.

    Args:
        session_dir: Path to .session/ directory
        workflow_name: Explicit workflow name, or None to auto-detect

    Returns:
        Tuple of (session_path, workflow_name), or None if not found
    """
    if workflow_name:
        session_file = session_dir / f"{workflow_name}-workflow-session.md"
        if session_file.exists():
            return session_file, workflow_name
        return None

    # Auto-detect from session directory
    sessions = sorted(session_dir.glob("*-workflow-session.md"))
    if not sessions:
        return None

    session_file = sessions[0]
    content = session_file.read_text()

    # Try to extract workflow name from content
    wf_match = re.search(r"^\*\*Workflow:\*\*\s*(.+)$", content, re.MULTILINE)
    if wf_match:
        name = wf_match.group(1).strip()
    else:
        name = session_file.stem.replace("-workflow-session", "")

    return session_file, name


def parse_steps_completed(value: str) -> list[int]:
    """Parse steps completed array from string like '[1, 2, 3]'."""
    if not value or value == "[]":
        return []
    return [int(n) for n in re.findall(r"\d+", value)]


def format_steps_completed(steps: list[int]) -> str:
    """Format steps list as bracket notation."""
    if not steps:
        return "[]"
    return "[" + ", ".join(str(s) for s in steps) + "]"


def find_story_session(session_dir: Path, story_id: str) -> Path | None:
    """Find a story session file by story ID.

    Handles various naming patterns: 56-1-session.md, MSSCI-12190-session.md
    Also searches file content for matching Jira/ID fields.
    """
    # Try direct filename match
    story_id_lower = story_id.lower()
    for pattern in [f"{story_id}-session.md", f"{story_id_lower}-session.md"]:
        candidate = session_dir / pattern
        if candidate.exists():
            return candidate

    # Search file contents for matching story ID
    for session_file in session_dir.glob("*-session.md"):
        try:
            content = session_file.read_text()
            if f"Jira:** {story_id}" in content or f"ID:** {story_id}" in content:
                return session_file
        except OSError:
            continue

    return None
