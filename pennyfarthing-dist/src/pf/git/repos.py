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
    pr_strategy: str = "standard"  # "standard" or "stacked"
    stack_tool: str = ""  # "graphite" when pr_strategy is stacked
    simplify: bool = False  # Enable simplify subagents during TEA verify phase
    remote: str = ""  # Clone URL for the repo (e.g., git@github.com:org/repo.git)
    #: Git remote NAME (``git remote add <name> <url>``), not a URL. Distinct
    #: from ``remote`` above, which holds the clone URL and therefore cannot
    #: double as the argv token git wants in ``git pull <name> <refspec>`` or in
    #: a ``refs/remotes/<name>/...`` ref path. Empty means ``origin``.
    remote_name: str = "origin"
    symlinks: dict[str, str] = field(default_factory=dict)  # link-path -> target, both rel to root

    @property
    def is_gitflow(self) -> bool:
        return self.branch_strategy == "gitflow"

    @property
    def is_stacked(self) -> bool:
        return self.pr_strategy == "stacked"

    @property
    def upstream_ref(self) -> str:
        """Remote ref to compare against for unpushed commits.

        Honors ``remote_name`` so this object gives one answer to "which
        remote?" — an empty/unset value keeps today's ``origin``.
        """
        return f"{self.remote_name or 'origin'}/{self.default_branch}"


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
        pr_strategy=data.get("pr_strategy", "standard"),
        stack_tool=data.get("stack_tool", ""),
        simplify=data.get("simplify", False),
        remote=data.get("remote", ""),
        remote_name=data.get("remote_name", "") or "origin",
        symlinks=data.get("symlinks", {}) or {},
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


def get_default_branch(repo_name: str, project_root: Path | None = None) -> str:
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


def get_repo_config(repo_name: str, project_root: Path | None = None) -> RepoConfig | None:
    """Get the full config for a specific repo.

    Args:
        repo_name: Name of the repo in repos.yaml.
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        RepoConfig or None if not found.
    """
    repos = load_repos_config(project_root)
    return repos.get(repo_name)


def should_create_branch(repo_config: RepoConfig | None) -> bool:
    """Decide whether story *setup* should create a feature branch for a repo.

    Delegates to :attr:`RepoConfig.is_gitflow` so the trunk-based/gitflow
    predicate lives in exactly one place (SOUL #2):

    - gitflow repos create feature branches as before
    - trunk-based repos skip branch creation (no stray ``feat/*`` branches)
    - an unknown repo (``None``, i.e. not in repos.yaml) preserves the legacy
      "branch everything" behavior and never raises

    Note the ``None`` case is permissive (branch) for the *setup* path. The
    *cleanup* path (``story_finish._git_cleanup``) deliberately treats ``None``
    conservatively (skip), since it must not guess a base branch for an
    unidentified repo — both paths key off :attr:`RepoConfig.is_gitflow`.

    Args:
        repo_config: The target repo's config, or None if it is not configured.

    Returns:
        True if a feature branch should be created, False to skip.
    """
    return repo_config is None or repo_config.is_gitflow


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
        jira_key: Jira issue key (e.g., "PROJ-16204") or story ID fallback.
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


def check_stack_tool_health(project_root: Path | None = None) -> dict[str, Any]:
    """Check if required stack tools are installed for stacked PR repos.

    Returns:
        Dict with success, checks list, and any errors.
    """
    import shutil

    repos = load_repos_config(project_root)
    stacked = {n: r for n, r in repos.items() if r.is_stacked}

    if not stacked:
        return {"success": True, "checks": [], "message": "No stacked PR repos configured"}

    checks = []
    errors = []

    gt_path = shutil.which("gt")
    checks.append({"name": "gt-installed", "pass": gt_path is not None})
    if not gt_path:
        errors.append(
            "Graphite CLI (gt) not found. Install: brew install withgraphite/tap/graphite"
        )

    return {
        "success": len(errors) == 0,
        "stacked_repos": list(stacked.keys()),
        "checks": checks,
        "errors": errors,
    }


def set_repo_field(
    repo_name: str,
    field: str,
    value: Any,
    *,
    project_root: Path | None = None,
) -> dict[str, Any]:
    """Set a single field on a repo entry in .pennyfarthing/repos.yaml.

    Args:
        repo_name: Name of the repo in repos.yaml.
        field: Field name to set or update.
        value: New value for the field.
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        Result dict {success, data?, error?}. Never throws.
    """
    try:
        # Validate before writing
        from pf.settings.validators import validate_repo_field

        validation = validate_repo_field(field, value)
        if not validation.valid:
            return {"success": False, "error": validation.errors[0].message}

        if project_root is None:
            project_root = get_project_root()

        repos_path = project_root / ".pennyfarthing" / "repos.yaml"
        if not repos_path.exists():
            return {"success": False, "error": f"repos.yaml not found at {repos_path}"}

        with open(repos_path) as f:
            config = yaml.safe_load(f)

        if not config or "repos" not in config:
            return {"success": False, "error": "repos.yaml missing 'repos' key"}

        if repo_name not in config["repos"]:
            return {"success": False, "error": f"repo '{repo_name}' not found in repos.yaml"}

        repo_data = config["repos"][repo_name]
        old_value = repo_data.get(field)
        repo_data[field] = value

        with open(repos_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False)

        return {
            "success": True,
            "data": {"old_value": old_value, "new_value": value},
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


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
