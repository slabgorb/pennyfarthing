"""Agent creation — scaffold custom agents from templates.

Story 150-2: pf agent create CLI command.

Creates a custom agent definition in agents-local/ from a template,
along with sidecar files (patterns.md, gotchas.md, decisions.md).
"""

from __future__ import annotations

import re
from pathlib import Path

from pf import paths


def create_agent(
    name: str,
    agent_type: str = "tactical",
    project_root: Path | None = None,
) -> dict:
    """Create a custom agent from template.

    Args:
        name: Agent name (e.g., "data-engineer")
        agent_type: Template type — "tactical" or "strategic"
        project_root: Project root path (auto-detected if not provided)

    Returns:
        Result dict: {success, agent_file?, sidecar_dir?, error?}
    """
    from pf.common.config import get_project_root

    root = project_root or get_project_root()
    pf_dir = root / ".pennyfarthing"

    # --- Validate name ---
    if not name or not name.strip():
        return {"success": False, "error": "Agent name cannot be empty"}

    if not re.fullmatch(r"[\w][\w.-]*", name):
        return {
            "success": False,
            "error": f"Invalid agent name '{name}': must contain only letters, digits, hyphens, dots, and underscores",
        }

    # --- Check for conflicts ---
    agents_dir = pf_dir / "agents"
    if agents_dir.is_dir() and (agents_dir / f"{name}.md").exists():
        return {
            "success": False,
            "error": f"Agent '{name}' conflicts with a built-in agent",
        }

    agents_local_dir = pf_dir / "agents-local"
    if agents_local_dir.is_dir() and (agents_local_dir / f"{name}.md").exists():
        return {
            "success": False,
            "error": f"Agent '{name}' already exists in agents-local/",
        }

    # --- Load template ---
    template_content = _load_template(agent_type, root)
    if template_content is None:
        return {
            "success": False,
            "error": f"Template 'agent-template-{agent_type}.md' not found",
        }

    # --- Render template ---
    display_name = name.replace("-", " ").replace("_", " ").title()
    rendered = template_content.replace("{NAME}", display_name)
    rendered = rendered.replace("{Role Title}", f"{display_name} Role")
    rendered = rendered.replace("{ROLE_DESCRIPTION}", f"{display_name} agent role description")

    # --- Write agent file ---
    agents_local_dir.mkdir(parents=True, exist_ok=True)
    agent_file = agents_local_dir / f"{name}.md"
    agent_file.write_text(rendered)

    # --- Create sidecar files ---
    sidecar_dir = paths.sidecars_dir(root) / name
    sidecar_dir.mkdir(parents=True, exist_ok=True)

    sidecar_files = {
        "patterns.md": f"# {display_name} Agent Patterns\n",
        "gotchas.md": f"# {display_name} Agent Gotchas\n",
        "decisions.md": f"# {display_name} Agent Decisions\n",
    }

    for filename, header in sidecar_files.items():
        filepath = sidecar_dir / filename
        if not filepath.exists():
            filepath.write_text(header)

    return {
        "success": True,
        "agent_file": str(agent_file),
        "sidecar_dir": str(sidecar_dir),
    }


def _load_template(agent_type: str, project_root: Path) -> str | None:
    """Load an agent template file.

    Searches: .pennyfarthing/agents/templates/ then dist_root/agents/templates/

    Args:
        agent_type: "tactical" or "strategic"
        project_root: Project root path

    Returns:
        Template content, or None if not found
    """
    template_name = f"agent-template-{agent_type}.md"

    # Check .pennyfarthing/agents/templates/
    local = project_root / ".pennyfarthing" / "agents" / "templates" / template_name
    if local.exists():
        return local.read_text()

    # Fallback to dist_root
    from pf.common.config import get_dist_root

    dist_root = get_dist_root(project_root=project_root)
    if dist_root:
        dist = dist_root / "agents" / "templates" / template_name
        if dist.exists():
            return dist.read_text()

    return None
