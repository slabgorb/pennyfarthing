"""Load native agent definitions and extract frontmatter metadata."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


def _native_dir(project_root: Path) -> Path:
    return project_root / ".pennyfarthing" / "agents" / "native"


def _parse_frontmatter(content: str) -> dict[str, Any] | None:
    """Parse YAML frontmatter from a markdown file."""
    if not content.startswith("---"):
        return None
    end = content.find("---", 3)
    if end == -1:
        return None
    return yaml.safe_load(content[3:end])


def get_native_agent_path(name: str, project_root: Path) -> Path | None:
    """Get the path to a native agent definition file."""
    path = _native_dir(project_root) / f"{name}.md"
    return path if path.exists() else None


def load_native_agent_definition(
    name: str, project_root: Path
) -> dict[str, Any] | None:
    """Load a native agent definition by name.

    Returns dict with 'content', 'path', 'frontmatter' or None if not found.
    """
    path = get_native_agent_path(name, project_root)
    if path is None:
        return None
    content = path.read_text()
    return {
        "content": content,
        "path": path,
        "frontmatter": _parse_frontmatter(content),
    }


def list_native_agents(project_root: Path) -> list[dict[str, Any]]:
    """List all available native agent definitions."""
    native = _native_dir(project_root)
    if not native.is_dir():
        return []
    return [
        {"name": f.stem, "path": f}
        for f in sorted(native.glob("*.md"))
    ]


def get_agent_tool_restrictions(
    name: str, project_root: Path
) -> list[str] | None:
    """Extract allowed-tools from native agent frontmatter."""
    defn = load_native_agent_definition(name, project_root)
    if defn is None or defn["frontmatter"] is None:
        return None
    return defn["frontmatter"].get("allowed-tools")


def get_agent_model(name: str, project_root: Path) -> str | None:
    """Extract model from native agent frontmatter."""
    defn = load_native_agent_definition(name, project_root)
    if defn is None or defn["frontmatter"] is None:
        return None
    return defn["frontmatter"].get("model")
