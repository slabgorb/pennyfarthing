"""
Shared helpers for workflow commands.

Extracted from complete-step.py and bash scripts. Provides common
functions for session parsing, workflow file resolution, and step management.
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from pf.common.config import get_dist_root, get_project_root


def is_contained_path(candidate: Path, base_dir: Path) -> bool:
    """Return True if ``candidate`` resolves to a path inside ``base_dir``.

    Guards against path traversal (CWE-22). Workflow names are interpolated
    into path joins (``{name}.yaml``, ``{name}/workflow.yaml``) and reach here
    straight from a session file's ``**Workflow:**`` line, so a crafted name
    such as ``../../evil`` — or an absolute path, which makes ``Path.__truediv__``
    discard the base entirely — can otherwise load YAML from outside the
    workflows directory. That YAML's ``agent:`` field decides which agent owns a
    phase. ``resolve()`` is used so symlink escapes are caught too; a purely
    lexical ``..`` check would not catch them.

    Mirrors ``pf.sprint.shard_merge.is_safe_shard_path`` (epic-162, 26cb554).

    On any resolution error the path is treated as unsafe (fail closed).
    """
    try:
        return candidate.resolve().is_relative_to(base_dir.resolve())
    except (OSError, ValueError, RuntimeError):
        return False


def get_workflows_dir(project_root: Path | None = None) -> Path:
    """Get the workflows directory path."""
    root = project_root or get_project_root()
    return root / ".pennyfarthing" / "workflows"


def get_project_workflows_dir(project_root: Path | None = None) -> Path:
    """Get the project-level workflows directory path."""
    root = project_root or get_project_root()
    return root / ".pennyfarthing" / "project" / "workflows"


def get_dist_workflows_dir(project_root: Path | None = None) -> Path:
    """Get the installed dist workflows directory (the packaged floor tier)."""
    root = project_root or get_project_root()
    dist_root = get_dist_root(project_root=root)
    base = dist_root if dist_root else root / "pennyfarthing-dist"
    return base / "workflows"


def get_all_workflows_dirs(
    project_root: Path | None = None, *, include_dist: bool = False
) -> list[Path]:
    """Get workflow directories in priority order.

    Order: ``.pennyfarthing/project/workflows/`` → ``.pennyfarthing/workflows/``
    → (optionally) the installed dist. Project tiers always outrank dist.

    Args:
        project_root: Project root path (auto-detected if not provided)
        include_dist: Append the packaged dist directory as the lowest-priority
            floor. Needed by anything that must resolve a workflow in a
            pip/npm-installed consumer project, where the project ships no
            workflows dir at all. Off by default so listing commands keep
            enumerating only project-local definitions.
    """
    root = project_root or get_project_root()
    dirs: list[Path] = []
    project_dir = get_project_workflows_dir(root)
    if project_dir.is_dir():
        dirs.append(project_dir)
    dist_dir = get_workflows_dir(root)
    if dist_dir.is_dir():
        dirs.append(dist_dir)
    if include_dist:
        packaged = get_dist_workflows_dir(root)
        if packaged.is_dir() and packaged.resolve() not in {d.resolve() for d in dirs}:
            dirs.append(packaged)
    return dirs


def resolve_workflow_file(workflow_name: str, project_root: Path | None = None) -> Path | None:
    """Resolve a workflow YAML for readers AND writers, dist included.

    The single precedence definition for the whole codebase:

    1. ``{root}/.pennyfarthing/project/workflows/``
    2. ``{root}/.pennyfarthing/workflows/``
    3. the installed dist (``get_dist_root()``, else ``{root}/pennyfarthing-dist/``)

    Flat (``{name}.yaml``) and nested (``{name}/workflow.yaml``) layouts are
    accepted at every tier. Project tiers outrank dist; dist is the floor, not
    an override. Every caller must use this so that no two readers of the same
    fact can disagree — a reader resolving a phase owner while a writer reports
    "no such workflow" is what lets agent names get stamped into a session's
    ``**Phase:**`` line.

    The first tier holding a *readable, existing* file wins, and that file is
    authoritative: callers must degrade to None/[]/False when it is malformed
    rather than falling through to a lower tier, because a fall-through would
    answer from a file the other side never sees. Note the narrow exception —
    an entry that is present but unusable (a broken symlink, or a ``{name}/``
    directory with no ``workflow.yaml``) fails the existence check, so
    resolution does continue past it.

    Returns:
        Path to the workflow file, or None if no tier has one.
    """
    root = project_root or get_project_root()
    return find_workflow_file(get_all_workflows_dirs(root, include_dist=True), workflow_name)


def get_session_dir(project_root: Path | None = None) -> Path:
    """Get the session directory path."""
    root = project_root or get_project_root()
    return root / ".session"


def find_workflow_file(workflows_dir: list[Path] | Path, workflow_name: str) -> Path | None:
    """Find workflow YAML definition.

    Supports both flat (name.yaml) and nested (name/workflow.yaml) layouts.
    Accepts a single Path or list of Paths (searched in order, first match wins).
    Flat wins over nested within a single directory.

    ``workflow_name`` is untrusted — it arrives from a session file's
    ``**Workflow:**`` line — so every candidate is checked for containment
    within the directory it was built from (CWE-22). A name that traverses out,
    is absolute, or resolves through a symlink leading outside the directory is
    skipped rather than loaded.

    Returns:
        Path to the workflow file, or None if not found.
    """
    dirs = [workflows_dir] if isinstance(workflows_dir, Path) else workflows_dir

    for d in dirs:
        for candidate in (d / f"{workflow_name}.yaml", d / workflow_name / "workflow.yaml"):
            if candidate.exists() and is_contained_path(candidate, d):
                return candidate

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
    """Resolve a path string relative to workflow dir or project root.

    An absolute ``path_str`` arrives from workflow YAML (``modes`` / ``steps.path``)
    and was otherwise returned verbatim — an absolute-path sink that lets step
    enumeration (``count_steps`` / ``find_step_file``) point at any directory
    (CWE-22). Keep an absolute path only while it stays inside the project root;
    otherwise re-root it under the project so it can never escape.
    """
    if path_str.startswith("./"):
        return workflow_dir / path_str[2:]
    if not Path(path_str).is_absolute():
        return project_root / path_str
    candidate = Path(path_str)
    try:
        if candidate.resolve().is_relative_to(project_root.resolve()):
            return candidate
    except (OSError, ValueError, RuntimeError):
        pass
    return project_root / path_str.lstrip("/")


def count_steps(steps_path: Path) -> int:
    """Count step files in a directory."""
    if not steps_path.is_dir():
        return 0
    return len(
        [
            f
            for f in steps_path.iterdir()
            if f.is_file() and re.match(r"step-\d+", f.name) and f.suffix == ".md"
        ]
    )


def find_step_file(steps_path: Path, step_number: int) -> Path | None:
    """Find step file for a given step number.

    Handles naming variants: step-01.md, step-01-name.md, step-1-name.md
    """
    padded = f"{step_number:02d}"
    matches = sorted(
        [
            f
            for f in steps_path.iterdir()
            if f.is_file()
            and (f.name.startswith(f"step-{padded}") or f.name.startswith(f"step-{step_number}-"))
            and f.suffix == ".md"
        ]
    )
    return matches[0] if matches else None


def strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from step file content."""
    if not content.startswith("---"):
        return content
    end = content.find("---", 3)
    if end == -1:
        return content
    return content[end + 3 :].lstrip("\n")


def parse_session_field(content: str, field: str) -> str:
    """Extract a field value from session markdown.

    Matches lines like: - **Field:** value
    """
    pattern = rf"^- \*\*{re.escape(field)}:\*\*\s*(.+)$"
    match = re.search(pattern, content, re.MULTILINE)
    return match.group(1).strip() if match else ""


def find_workflow_session(session_dir: Path, workflow_name: str | None) -> tuple[Path, str] | None:
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

    Handles various naming patterns: 56-1-session.md, PROJ-12190-session.md
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
