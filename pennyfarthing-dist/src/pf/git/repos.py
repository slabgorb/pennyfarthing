"""
Repos.yaml loader — Python replacement for repo-utils.sh (778 lines).

Reads .pennyfarthing/repos.yaml and provides structured access to repo
configuration: paths, types, branches, build/test commands, dependencies.

Usage:
    from pf.git.repos import load_repos_config, get_repo_paths

    config = load_repos_config()
    for name, repo in config.items():
        print(f"{name}: {repo.path} ({repo.default_branch})")
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from pf.common.config import get_project_root


@dataclass
class RepoConfig:
    """Configuration for a single repository."""

    name: str
    path: str  # Relative to project root (e.g., "." or "pennyfarthing")
    repo_type: str  # "orchestrator", "framework", "api", "ui", etc.
    default_branch: str  # "main" for trunk-based, "develop" for gitflow
    branch_strategy: str  # "trunk-based" or "gitflow"
    description: str = ""
    language: str = "unknown"
    languages: list[str] = field(default_factory=list)
    test_command: str = ""
    build_command: str = ""
    lint_command: str = ""
    test_filter_flag: str = ""
    dependencies: list[str] = field(default_factory=list)
    owns: list[str] = field(default_factory=list)
    never_edit: list[str] = field(default_factory=list)
    ui_layer: str = "none"

    @property
    def is_gitflow(self) -> bool:
        return self.branch_strategy == "gitflow"

    @property
    def upstream_ref(self) -> str:
        """Remote ref to compare against for unpushed commits."""
        return f"origin/{self.default_branch}"


def _parse_repo_entry(name: str, data: dict[str, Any] | None) -> RepoConfig:
    """Parse a single repo entry from repos.yaml."""
    if data is None:
        data = {}
    return RepoConfig(
        name=name,
        path=data.get("path", name),
        repo_type=data.get("type", "unknown"),
        default_branch=data.get("default_branch", "main"),
        branch_strategy=data.get("branch_strategy", "trunk-based"),
        description=data.get("description", ""),
        language=data.get("language", "unknown"),
        languages=data.get("languages", []) or [],
        test_command=data.get("test_command", ""),
        build_command=data.get("build_command", ""),
        lint_command=data.get("lint_command", ""),
        test_filter_flag=data.get("test_filter_flag", ""),
        dependencies=data.get("dependencies", []) or [],
        owns=data.get("owns", []) or [],
        never_edit=data.get("never_edit", []) or [],
        ui_layer=data.get("ui_layer", "none"),
    )


def load_repos_config(project_root: Path | None = None) -> dict[str, RepoConfig]:
    """Load repos.yaml and return a dict of name -> RepoConfig.

    Args:
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        Ordered dict of repo name -> RepoConfig.
        Empty dict if repos.yaml not found.
    """
    if project_root is None:
        project_root = get_project_root()

    repos_path = project_root / ".pennyfarthing" / "repos.yaml"
    if not repos_path.exists():
        return {}

    with open(repos_path) as f:
        config = yaml.safe_load(f)

    if not config or "repos" not in config:
        return {}

    repos: dict[str, RepoConfig] = {}
    for name, data in config["repos"].items():
        repos[name] = _parse_repo_entry(name, data)

    return repos


def get_repo_paths(project_root: Path | None = None) -> list[tuple[str, Path]]:
    """Get list of (name, absolute_path) tuples for all configured repos.

    Args:
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        List of (repo_name, absolute_path) tuples.
    """
    if project_root is None:
        project_root = get_project_root()

    repos = load_repos_config(project_root)
    result = []
    for name, repo in repos.items():
        abs_path = (project_root / repo.path).resolve()
        if abs_path.exists():
            result.append((name, abs_path))
    return result


def get_default_branch(
    repo_name: str, project_root: Path | None = None
) -> str:
    """Get the default branch for a specific repo.

    Args:
        repo_name: Name of the repo in repos.yaml.
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        Default branch name (e.g., "main" or "develop").
        Falls back to "main" if repo not found.
    """
    repos = load_repos_config(project_root)
    if repo_name in repos:
        return repos[repo_name].default_branch
    return "main"


def get_repo_config(
    repo_name: str, project_root: Path | None = None
) -> RepoConfig | None:
    """Get the full config for a specific repo.

    Args:
        repo_name: Name of the repo in repos.yaml.
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        RepoConfig or None if not found.
    """
    repos = load_repos_config(project_root)
    return repos.get(repo_name)


def load_repos_yaml_raw(project_root: Path | None = None) -> dict[str, Any]:
    """Load raw repos.yaml as a dict (not parsed into RepoConfig).

    Useful for reading top-level config like pr_title_format or gates.

    Returns:
        Raw config dict, or empty dict if not found.
    """
    if project_root is None:
        project_root = get_project_root()

    repos_path = project_root / ".pennyfarthing" / "repos.yaml"
    if not repos_path.exists():
        return {}

    with open(repos_path) as f:
        config = yaml.safe_load(f)

    return config or {}


_DEFAULT_PR_TITLE_FORMAT = "{jira_key} - {type}({scope}): {title}"


def get_pr_title_format(project_root: Path | None = None) -> str:
    """Get the PR title format template from repos.yaml.

    Returns:
        Format string with placeholders: {jira_key}, {type}, {scope}, {title}.
    """
    if project_root is None:
        project_root = get_project_root()

    repos_path = project_root / ".pennyfarthing" / "repos.yaml"
    if not repos_path.exists():
        return _DEFAULT_PR_TITLE_FORMAT

    with open(repos_path) as f:
        config = yaml.safe_load(f)

    if not config:
        return _DEFAULT_PR_TITLE_FORMAT

    return config.get("pr_title_format", _DEFAULT_PR_TITLE_FORMAT)


def format_pr_title(
    *,
    jira_key: str,
    title: str,
    pr_type: str = "feat",
    scope: str = "",
    project_root: Path | None = None,
) -> str:
    """Format a PR title using the project's configured template.

    Args:
        jira_key: Jira issue key (e.g., "MSSCI-16204") or story ID fallback.
        title: Short summary of the change.
        pr_type: Conventional commit type (feat, fix, chore, etc.).
        scope: Optional scope (e.g., "gates", "ui").
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        Formatted PR title string.
    """
    fmt = get_pr_title_format(project_root)
    # If no scope provided, collapse "type(): title" to "type: title"
    if not scope:
        fmt = fmt.replace("({scope})", "")
    return fmt.format(
        jira_key=jira_key,
        type=pr_type,
        scope=scope,
        title=title,
    )


def get_build_order(project_root: Path | None = None) -> list[str]:
    """Get repos in build/dependency order.

    Uses explicit build_order from repos.yaml if present,
    otherwise returns repos in definition order.

    Args:
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        List of repo names in build order.
    """
    if project_root is None:
        project_root = get_project_root()

    repos_path = project_root / ".pennyfarthing" / "repos.yaml"
    if not repos_path.exists():
        return []

    with open(repos_path) as f:
        config = yaml.safe_load(f)

    if not config:
        return []

    if "build_order" in config:
        return config["build_order"]

    if "repos" in config:
        return list(config["repos"].keys())

    return []
