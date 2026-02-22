"""
Sprint context resolution.

Story: MSSCI-15422 - resolve_sprint_context() function

Consolidates all sprint path resolution logic into a single function
that returns a SprintContext dataclass.
"""

from pathlib import Path

import yaml

from pf.core.models import SprintContext


def _load_yaml(path: Path) -> dict:
    """Load and parse a YAML file.

    Raises:
        FileNotFoundError: If the file does not exist
        ValueError: If the YAML is malformed
    """
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    try:
        with open(path) as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise ValueError(f"Malformed YAML in {path}: {e}") from e
    if data is None:
        raise ValueError(f"Empty YAML file: {path}")
    return data


def _collect_repos(sprint_data: dict) -> list[str]:
    """Collect unique repo names from all epics in sprint data."""
    repos: list[str] = []
    seen: set[str] = set()
    for epic in sprint_data.get("epics", []):
        if isinstance(epic, dict):
            for repo in epic.get("repos", []):
                if repo not in seen:
                    repos.append(repo)
                    seen.add(repo)
    return repos


def resolve_sprint_context(project_root: str) -> SprintContext:
    """Resolve sprint context for a project.

    Resolution order:
      1. Check .pennyfarthing/config.local.yaml for sprint.active preference
      2. If set, look up the sprint in sprint/sprints.yaml registry
      3. If no preference or no registry, fall back to sprint/current-sprint.yaml

    Args:
        project_root: Absolute path to the project root directory

    Returns:
        SprintContext with all fields populated

    Raises:
        FileNotFoundError: If sprint file cannot be found
        ValueError: If sprint YAML is malformed
    """
    root = Path(project_root)
    sprint_dir = root / "sprint"

    # Step 1: Check for active sprint preference
    active_name = _get_active_preference(root)

    # Step 2: If preference set, try registry lookup
    if active_name:
        registry = _load_registry(sprint_dir)
        if registry:
            sprints = registry.get("sprints", {})
            entry = sprints.get(active_name)
            if entry and entry.get("file"):
                sprint_path = (sprint_dir / entry["file"]).resolve()
                if sprint_path.exists():
                    sprint_data = _load_yaml(sprint_path)
                    repos = entry.get("repos", _collect_repos(sprint_data))
                    return SprintContext(
                        sprint_file=str(sprint_path),
                        context_root=entry.get("context_root", str(root)),
                        session_root=entry.get(
                            "session_root", str(root / ".session")
                        ),
                        repos=repos,
                        name=active_name,
                        type=entry.get("type", "project"),
                        is_default=False,
                    )

    # Step 3: Fall back to default sprint
    default_path = (sprint_dir / "current-sprint.yaml").resolve()
    sprint_data = _load_yaml(default_path)

    sprint_meta = sprint_data.get("sprint", {})
    return SprintContext(
        sprint_file=str(default_path),
        context_root=str(root),
        session_root=str(root / ".session"),
        repos=_collect_repos(sprint_data),
        name=sprint_meta.get("name", ""),
        type="orchestrator",
        is_default=True,
    )


def _get_active_preference(root: Path) -> str | None:
    """Read sprint.active from .pennyfarthing/config.local.yaml."""
    config_path = root / ".pennyfarthing" / "config.local.yaml"
    if not config_path.exists():
        return None
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f) or {}
    except yaml.YAMLError:
        return None
    sprint_config = config.get("sprint", {})
    if isinstance(sprint_config, dict):
        return sprint_config.get("active")
    return None


def _load_registry(sprint_dir: Path) -> dict | None:
    """Load sprint/sprints.yaml registry if it exists."""
    registry_path = sprint_dir / "sprints.yaml"
    if not registry_path.exists():
        return None
    try:
        with open(registry_path) as f:
            return yaml.safe_load(f)
    except yaml.YAMLError:
        return None
