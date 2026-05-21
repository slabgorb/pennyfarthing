"""
Context loading functions for prime.

Provides functions to load various context sources:
- Agent definitions
- Behavior guides
- Sprint context
- Session files
- Sidecars (patterns, gotchas, decisions)
- Domain documentation
"""

from __future__ import annotations

import re
from pathlib import Path

from pf import paths
from pf.common.config import get_dist_root, get_project_root


def load_agent_definition(agent_name: str, project_root: Path | None = None) -> str | None:
    """Load agent definition markdown.

    Args:
        agent_name: Name of the agent (e.g., "dev", "tea", "sm")
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Agent definition content, or None if not found
    """
    root = project_root or get_project_root()

    # Priority 1: agents-local/ (consumer overrides and custom agents)
    local_file = root / ".pennyfarthing" / "agents-local" / f"{agent_name}.md"
    if local_file.exists():
        return local_file.read_text()

    # Priority 2: agents/ (built-in, typically symlinked from pennyfarthing-dist)
    agent_file = root / ".pennyfarthing" / "agents" / f"{agent_name}.md"
    if agent_file.exists():
        return agent_file.read_text()

    # Priority 3: pennyfarthing-dist via get_dist_root (npm/pip context)
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        agent_file = dist_root / "agents" / f"{agent_name}.md"
        if agent_file.exists():
            return agent_file.read_text()

    return None


def load_soul(project_root: Path | None = None) -> str | None:
    """Load SOUL.md project principles (optional).

    Consumer repos may define a SOUL.md at their project root with
    guiding principles that agents should follow. This is loaded
    after the agent definition so principles inform agent behavior.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        SOUL.md content, or None if not found
    """
    root = project_root or get_project_root()
    soul_file = root / "SOUL.md"

    if soul_file.exists():
        return soul_file.read_text()

    return None


def load_output_style(project_root: Path | None = None) -> tuple[str, str] | None:
    """Load output style content based on config.local.yaml setting.

    Reads `output_style` from config and loads the corresponding
    markdown file from output-styles/.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Tuple of (style_name, content), or None if not configured or not found
    """
    from pf.common.config import load_pennyfarthing_config

    root = project_root or get_project_root()
    config = load_pennyfarthing_config(root)
    style = config.get("output_style")
    if not style or not isinstance(style, str):
        return None

    # Try .pennyfarthing/output-styles/{style}.md
    style_file = root / ".pennyfarthing" / "output-styles" / f"{style}.md"
    if style_file.exists():
        return style, style_file.read_text()

    # Fallback: pennyfarthing-dist via get_dist_root
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        style_file = dist_root / "output-styles" / f"{style}.md"
        if style_file.exists():
            return style, style_file.read_text()

    return None


def load_behavior_guide(project_root: Path | None = None) -> str | None:
    """Load shared agent behavior guide.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Behavior guide content, or None if not found
    """
    root = project_root or get_project_root()
    guide_file = root / ".pennyfarthing" / "guides" / "agent-behavior.md"

    if guide_file.exists():
        return guide_file.read_text()

    # Fallback: pennyfarthing-dist via get_dist_root (npm context)
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        guide_file = dist_root / "guides" / "agent-behavior.md"
        if guide_file.exists():
            return guide_file.read_text()

    return None


def load_sprint_context(project_root: Path | None = None) -> str | None:
    """Load sprint summary context.

    Returns brief sprint info: name, goal, and progress.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Formatted sprint summary, or None if no sprint data
    """
    # Import here to avoid circular imports
    from pf.sprint.loader import load_sprint
    from pf.sprint.status import get_sprint_status

    root = project_root or get_project_root()
    sprint_file = root / "sprint" / "current-sprint.yaml"

    if not sprint_file.exists():
        return None

    sprint = load_sprint(root)
    if not sprint:
        return None

    lines = []

    # Sprint summary: "Sprint N: Goal"
    sprint_info = sprint.get("sprint", {})
    sprint_num = sprint_info.get("number")
    sprint_goal = sprint_info.get("goal", "")

    if sprint_num:
        lines.append(f"Sprint {sprint_num}: {sprint_goal}")

    # Progress: "X/Y points"
    status = get_sprint_status()
    if status:
        completed = status.get("completed_points", 0)
        total = status.get("total_points", 0)
        lines.append(f"Progress: {completed}/{total} points")

    return "\n".join(lines) if lines else None


def _find_session_file(project_root: Path) -> Path | None:
    """Find the active session file.

    Args:
        project_root: Project root path

    Returns:
        Path to session file, or None if not found
    """
    session_dir = project_root / ".session"
    if not session_dir.is_dir():
        return None

    # Find *-session.md files
    session_files = list(session_dir.glob("*-session.md"))
    if not session_files:
        return None

    # Return the most recently modified one
    return max(session_files, key=lambda f: f.stat().st_mtime)


def _extract_session_parts(content: str) -> tuple[str, str]:
    """Extract header and last assessment from session markdown.

    Args:
        content: Full session file content

    Returns:
        Tuple of (header, last_assessment) strings
    """
    lines = content.split("\n")

    # Header: everything before first ## heading
    header_lines = []
    for line in lines:
        if line.startswith("## "):
            break
        header_lines.append(line)

    # Find the last assessment section
    assessment_start = None
    for i, line in enumerate(lines):
        if re.match(r"^## .*Assessment", line):
            assessment_start = i

    assessment_lines = []
    if assessment_start is not None:
        # Extract from assessment header to next ## or end
        for line in lines[assessment_start:]:
            # Stop at next ## heading (but not the assessment header itself)
            if line.startswith("## ") and lines.index(line) > assessment_start:
                break
            assessment_lines.append(line)

    return "\n".join(header_lines).strip(), "\n".join(assessment_lines).strip()


def load_session_context(project_root: Path | None = None) -> tuple[str, str, str] | None:
    """Load active session context.

    Extracts header metadata and the most recent assessment section
    from the active session file.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Tuple of (filename, header, last_assessment), or None if no session
    """
    root = project_root or get_project_root()
    session_file = _find_session_file(root)

    if not session_file:
        return None

    content = session_file.read_text()
    header, assessment = _extract_session_parts(content)

    return session_file.name, header, assessment


def load_sidecars(agent_name: str, project_root: Path | None = None) -> dict[str, str]:
    """Load agent sidecar files (patterns, gotchas, decisions).

    Sidecars are loaded in order of usefulness:
    1. patterns.md - Most actionable
    2. gotchas.md - Common pitfalls
    3. decisions.md - Historical context

    Args:
        agent_name: Name of the agent
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Dict mapping filename to content (only includes existing files)
    """
    root = project_root or get_project_root()
    sidecar_dir = paths.sidecars_dir(root) / agent_name

    if not sidecar_dir.is_dir():
        return {}

    sidecars = {}
    # Load in priority order
    for filename in ["patterns.md", "gotchas.md", "decisions.md"]:
        sidecar_file = sidecar_dir / filename
        if sidecar_file.exists():
            sidecars[filename] = sidecar_file.read_text()

    return sidecars


def load_domain_docs(project_root: Path | None = None) -> list[tuple[str, str]]:
    """Load domain documentation files.

    These are CLAUDE-*.md files in .claude/project/ that provide
    domain-specific context.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        List of (filename, content) tuples
    """
    root = project_root or get_project_root()
    project_dir = root / ".claude" / "project"

    if not project_dir.is_dir():
        return []

    docs = []
    for doc_file in sorted(project_dir.glob("CLAUDE-*.md")):
        docs.append((doc_file.name, doc_file.read_text()))

    return docs


def load_team_mode_guide(project_root: Path | None = None) -> str | None:
    """Load team mode guide (conditional — only when workflow phase has team config).

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Team mode guide content, or None if not found
    """
    root = project_root or get_project_root()
    guide_file = root / ".pennyfarthing" / "guides" / "team-mode.md"

    if guide_file.exists():
        return guide_file.read_text()

    # Fallback: pennyfarthing-dist via get_dist_root (npm context)
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        guide_file = dist_root / "guides" / "team-mode.md"
        if guide_file.exists():
            return guide_file.read_text()

    return None


def load_gate_recovery_guide(project_root: Path | None = None) -> str | None:
    """Load gate recovery guide (conditional — only when phase gate has recovery config).

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Gate recovery guide content, or None if not found
    """
    root = project_root or get_project_root()
    guide_file = root / ".pennyfarthing" / "guides" / "gate-recovery.md"

    if guide_file.exists():
        return guide_file.read_text()

    # Fallback: pennyfarthing-dist via get_dist_root (npm context)
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        guide_file = dist_root / "guides" / "gate-recovery.md"
        if guide_file.exists():
            return guide_file.read_text()

    return None


def load_step_content(
    workflow_name: str,
    current_step: int,
    project_root: Path | None = None,
) -> str | None:
    """Load the content of a stepped workflow's current step file.

    Finds step files matching the pattern step-{NN}-*.md where NN is the
    zero-padded step number.

    Args:
        workflow_name: Workflow name (e.g., "architecture")
        current_step: Current step number (1-indexed)
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Step file content, or None if not found
    """
    root = project_root or get_project_root()
    step_num = f"{current_step:02d}"
    pattern = f"step-{step_num}-*.md"

    # Check .pennyfarthing/workflows/{name}/steps/
    steps_dir = root / ".pennyfarthing" / "workflows" / workflow_name / "steps"
    if steps_dir.is_dir():
        matches = list(steps_dir.glob(pattern))
        if matches:
            return matches[0].read_text()

    # Fallback: pennyfarthing-dist via get_dist_root
    dist_root = get_dist_root(project_root=root)
    if dist_root:
        steps_dir = dist_root / "workflows" / workflow_name / "steps"
        if steps_dir.is_dir():
            matches = list(steps_dir.glob(pattern))
            if matches:
                return matches[0].read_text()

    return None


def load_repos_topology(project_root: Path | None = None) -> str | None:
    """Load repos.yaml topology as formatted context for agents.

    Reads .pennyfarthing/repos.yaml and formats the topology fields
    (owns, never_edit, symlinks, ui_layer, components_path) as a
    readable manifest for agent spatial awareness.

    Args:
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Formatted topology context string, or None if unavailable
    """
    import yaml

    root = project_root or get_project_root()
    repos_file = root / ".pennyfarthing" / "repos.yaml"

    if not repos_file.exists():
        return None

    try:
        data = yaml.safe_load(repos_file.read_text())
    except Exception:
        return None

    if not isinstance(data, dict) or "repos" not in data:
        return None

    repos = data["repos"]
    if not repos:
        return None

    lines: list[str] = []
    for name, config in repos.items():
        lines.append(f"## {name}")
        if config.get("path"):
            lines.append(f"Path: {config['path']}")
        if config.get("type"):
            lines.append(f"Type: {config['type']}")
        if config.get("description"):
            lines.append(f"Description: {config['description']}")

        owns = config.get("owns", [])
        if owns:
            lines.append(f"Owns: {', '.join(owns)}")

        never_edit = config.get("never_edit", [])
        if never_edit:
            lines.append(f"Never Edit: {', '.join(never_edit)}")

        symlinks = config.get("symlinks", {})
        if symlinks:
            lines.append("Symlinks:")
            for src, dest in symlinks.items():
                lines.append(f"  {src} → {dest}")

        ui_layer = config.get("ui_layer")
        if ui_layer:
            lines.append(f"UI Layer: {ui_layer}")

        components_path = config.get("components_path")
        if components_path:
            lines.append(f"Components: {components_path}")

        if config.get("simplify"):
            lines.append("Simplify: enabled")

        lines.append("")

    return "\n".join(lines).strip() if lines else None
