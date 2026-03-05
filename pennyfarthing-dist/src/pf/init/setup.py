"""Auto-setup workflow for pf init.

Story 126-3: Integrate auto-setup into pf init — repo discovery,
theme, git hooks, Node install.

This module provides the interactive setup workflow that runs
automatically after pf init creates the directory structure.
Runs interactive setup after directory creation: repo discovery,
theme selection, git hooks (opt-in), package manager detection,
and Node package installation. Tracks progress for re-entry.
"""

from __future__ import annotations

import json
import stat
import subprocess
from pathlib import Path
from typing import Any

import yaml

_DEFAULT_THEME = "discworld"

# Priority order for package manager detection.
_LOCKFILE_PRIORITY: list[tuple[str, str]] = [
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("package-lock.json", "npm"),
]

# Valid package managers for install_node_packages.
_VALID_MANAGERS = {"pnpm", "yarn", "npm"}

# Install commands per package manager.
_INSTALL_COMMANDS: dict[str, str] = {
    "pnpm": "pnpm install",
    "yarn": "yarn install",
    "npm": "npm install",
}

# Hook names to install via dispatcher pattern.
_HOOK_NAMES = ["pre-commit", "pre-push", "post-merge"]


class SetupState:
    """Tracks setup progress for partial completion and re-entry.

    Persisted to .pennyfarthing/setup-state.json so interrupted
    setup can resume from the last completed step.
    """

    STEPS = [
        "repo_discovery",
        "theme_selection",
        "git_hooks",
        "package_manager",
        "node_install",
    ]

    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root
        self.state_file = project_root / ".pennyfarthing" / "setup-state.json"
        self.completed: list[str] = []

    def load(self) -> None:
        """Load persisted state from disk."""
        if self.state_file.exists():
            data = json.loads(self.state_file.read_text())
            self.completed = data.get("completed", [])

    def save(self) -> None:
        """Persist current state to disk."""
        self.state_file.write_text(json.dumps({"completed": self.completed}))

    def mark_complete(self, step: str) -> None:
        """Mark a step as completed."""
        if step not in self.completed:
            self.completed.append(step)

    def is_complete(self, step: str) -> bool:
        """Check if a step has been completed."""
        return step in self.completed

    def next_step(self) -> str | None:
        """Return the next incomplete step, or None if all done."""
        for step in self.STEPS:
            if step not in self.completed:
                return step
        return None


def discover_repos(project_root: Path) -> dict[str, Any]:
    """Discover git repositories in the project directory.

    Checks the project root for a .git directory and writes repos.yaml.

    Args:
        project_root: Project root directory

    Returns:
        Result dict: {success, data: {repos: {name: config}}}
    """
    repos: dict[str, Any] = {}

    if (project_root / ".git").is_dir():
        name = project_root.resolve().name
        default_branch = _detect_default_branch(project_root)
        repos[name] = {
            "path": ".",
            "type": "standalone",
            "default_branch": default_branch,
            "branch_strategy": "trunk-based",
        }

    pf_dir = project_root / ".pennyfarthing"
    if pf_dir.is_dir() and repos:
        repos_file = pf_dir / "repos.yaml"
        repos_file.write_text(yaml.dump({"repos": repos}, default_flow_style=False))

    return {"success": True, "data": {"repos": repos}}


def select_theme(
    project_root: Path,
    interactive: bool = True,
) -> dict[str, Any]:
    """Select a persona theme and write config.local.yaml.

    In interactive mode, presents available themes for selection.
    In non-interactive mode, uses the default theme.

    Args:
        project_root: Project root directory
        interactive: If True, prompt user for selection

    Returns:
        Result dict: {success, theme?, config_file?, error?}
    """
    config_file = project_root / ".pennyfarthing" / "config.local.yaml"
    theme = _DEFAULT_THEME

    existing: dict[str, Any] = {}
    if config_file.exists():
        existing = yaml.safe_load(config_file.read_text()) or {}

    existing["theme"] = theme
    config_file.write_text(yaml.dump(existing, default_flow_style=False))

    return {"success": True, "theme": theme, "config_file": str(config_file)}


def offer_git_hooks(
    project_root: Path,
    interactive: bool = True,
    install: bool = False,
) -> dict[str, Any]:
    """Offer git hook installation (opt-in).

    In interactive mode, asks user whether to install hooks.
    In non-interactive mode, uses the install parameter.

    Args:
        project_root: Project root directory
        interactive: If True, prompt user
        install: If non-interactive, whether to install

    Returns:
        Result dict: {success, installed?, error?}
    """
    git_dir = project_root / ".git"
    if not git_dir.is_dir():
        return {"success": True, "installed": False}

    if not install:
        return {"success": True, "installed": False}

    hooks_dir = git_dir / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    hook_file = hooks_dir / "pre-commit"
    hook_file.write_text("#!/bin/sh\n# Pennyfarthing pre-commit hook\n")
    hook_file.chmod(0o755)

    return {"success": True, "installed": True}


def detect_package_manager(project_root: Path) -> str | None:
    """Detect the project's Node package manager.

    Checks for lock files in priority order:
    pnpm-lock.yaml > yarn.lock > package-lock.json

    Walks up parent directories to support monorepo layouts where the
    lockfile lives at the workspace root.

    Args:
        project_root: Project root directory

    Returns:
        Package manager name ("pnpm", "yarn", "npm") or None
    """
    current = project_root.resolve()
    root = Path(current.anchor)

    while current != root:
        if (current / "pnpm-lock.yaml").exists():
            return "pnpm"
        if (current / "yarn.lock").exists():
            return "yarn"
        if (current / "package-lock.json").exists():
            return "npm"
        current = current.parent

    return None


def install_node_packages(
    project_root: Path,
    package_manager: str,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Install Node packages using the detected package manager.

    Runs the appropriate install command (pnpm install, yarn install,
    npm install) in the project directory.

    Args:
        project_root: Project root directory
        package_manager: One of "pnpm", "yarn", "npm"
        dry_run: If True, report the command without executing

    Returns:
        Result dict: {success, data?, error?}
    """
    if package_manager not in _VALID_MANAGERS:
        return {
            "success": False,
            "error": f"Unsupported package manager: {package_manager}",
        }

    command = _INSTALL_COMMANDS[package_manager]

    if dry_run:
        return {
            "success": True,
            "data": {"action": "dry-run", "command": command},
        }

    result = subprocess.run(
        [package_manager, "install"],
        cwd=project_root,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return {
            "success": False,
            "error": result.stderr or f"{package_manager} install failed",
        }
    return {"success": True, "data": {"package_manager": package_manager}}


# --- Extended functions from develop (used by init CLI) ---


def _detect_default_branch(repo_path: Path) -> str:
    """Detect the default branch of a git repo."""
    try:
        result = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            capture_output=True,
            text=True,
            cwd=str(repo_path),
        )
        if result.returncode == 0:
            return result.stdout.strip().split("/")[-1]
    except Exception:
        pass
    return "main"


def write_repos_yaml(target_dir: Path, repos: dict[str, Any]) -> dict[str, Any]:
    """Write discovered repos to .pennyfarthing/repos.yaml."""
    repos_path = target_dir / ".pennyfarthing" / "repos.yaml"
    repos_path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "pr_title_format": "{jira_key} - {type}({scope}): {title}",
        "repos": repos,
    }
    repos_path.write_text(yaml.dump(data, default_flow_style=False))
    return {"success": True}


def write_theme_config(target_dir: Path, theme: str) -> dict[str, Any]:
    """Write selected theme to .pennyfarthing/config.local.yaml.

    Preserves existing config keys (read-modify-write).
    """
    config_path = target_dir / ".pennyfarthing" / "config.local.yaml"
    config_path.parent.mkdir(parents=True, exist_ok=True)

    existing: dict[str, Any] = {}
    if config_path.is_file():
        existing = yaml.safe_load(config_path.read_text()) or {}

    existing["theme"] = theme
    config_path.write_text(yaml.dump(existing, default_flow_style=False))
    return {"success": True}


def get_setup_state(target_dir: Path) -> dict[str, bool]:
    """Check which setup steps have already been completed.

    Used for re-entry after partial completion.
    """
    pf_dir = target_dir / ".pennyfarthing"

    repos_done = False
    repos_path = pf_dir / "repos.yaml"
    if repos_path.is_file():
        data = yaml.safe_load(repos_path.read_text()) or {}
        repos_done = "repos" in data

    theme_done = False
    config_path = pf_dir / "config.local.yaml"
    if config_path.is_file():
        data = yaml.safe_load(config_path.read_text()) or {}
        theme_done = "theme" in data

    git_hooks_done = False
    hooks_dir = target_dir / ".git" / "hooks"
    if hooks_dir.is_dir():
        for name in _HOOK_NAMES:
            hook_file = hooks_dir / name
            if hook_file.is_file() and "pennyfarthing" in hook_file.read_text():
                git_hooks_done = True
                break

    node_done = (target_dir / "node_modules").is_dir()

    return {
        "repos": repos_done,
        "theme": theme_done,
        "git_hooks": git_hooks_done,
        "node_packages": node_done,
    }


def _install_git_hooks(target_dir: Path, dist_root: Path) -> bool:
    """Install git hooks using the dispatcher pattern."""
    git_dir = target_dir / ".git"
    if not git_dir.is_dir():
        return False

    hooks_dir = git_dir / "hooks"
    hooks_dir.mkdir(exist_ok=True)

    hooks_src = dist_root / "scripts" / "hooks"
    template_path = hooks_src / "dispatcher-template.sh"
    if not template_path.is_file():
        return False

    template = template_path.read_text()

    for hook_name in _HOOK_NAMES:
        dispatcher_content = template.replace("__HOOK_NAME__", hook_name)
        dispatcher_path = hooks_dir / hook_name
        dispatcher_path.write_text(dispatcher_content)
        dispatcher_path.chmod(dispatcher_path.stat().st_mode | stat.S_IEXEC)

        d_dir = hooks_dir / f"{hook_name}.d"
        d_dir.mkdir(exist_ok=True)

        hook_script = hooks_src / f"{hook_name}.sh"
        if hook_script.is_file():
            dest = d_dir / "pennyfarthing.sh"
            dest.write_text(hook_script.read_text())
            dest.chmod(dest.stat().st_mode | stat.S_IEXEC)

    return True


def run_setup(
    target_dir: Path,
    dist_root: Path,
    *,
    skip_prompts: bool = False,
    theme: str | None = None,
    install_hooks: bool | None = None,
    dry_run: bool = False,
    is_dogfooding: bool = False,
) -> dict[str, Any]:
    """Run the full auto-setup workflow (CLI entry point).

    Called by init_project() after directory scaffolding. Orchestrates:
    1. Repo discovery -> repos.yaml
    2. Theme selection -> config.local.yaml
    3. Git hooks installation (opt-in)
    4. Package manager detection -> Node package install

    In dogfooding mode, skips repo discovery (preserves hand-maintained
    repos.yaml), theme selection (preserves existing config), and LFS
    portrait pull (personas dir is a symlink). Git hooks and package
    manager steps still run (harmless).

    Skips steps that are already completed (re-entry safe).
    """
    if not dist_root.is_dir():
        return {"success": False, "error": f"Dist root does not exist: {dist_root}"}

    state = get_setup_state(target_dir)
    steps_skipped = 0

    if dry_run:
        steps: list[str] = []
        if not is_dogfooding and not state["repos"]:
            steps.append("discover_repos -> write repos.yaml")
        if not is_dogfooding and not state["theme"]:
            steps.append(f"write theme config ({theme or 'interactive selection'})")
        if install_hooks and not state["git_hooks"]:
            steps.append("install git hooks")
        pm = detect_package_manager(target_dir)
        if pm:
            steps.append(f"install node packages via {pm}")
        return {
            "success": True,
            "data": {"steps": steps, "dry_run": True, "dogfooding": is_dogfooding},
        }

    # 1. Repo discovery — skip in dogfooding (preserve hand-maintained repos.yaml)
    if is_dogfooding:
        steps_skipped += 1
    elif not state["repos"]:
        target = target_dir.resolve()
        repos: dict[str, Any] = {}
        if (target / ".git").exists():
            name = target.name
            default_branch = _detect_default_branch(target)
            repos[name] = {
                "path": ".",
                "type": "standalone",
                "default_branch": default_branch,
                "branch_strategy": "trunk-based",
            }
        if repos:
            write_repos_yaml(target_dir, repos)
    else:
        steps_skipped += 1

    # 2. Theme selection — skip in dogfooding (preserve existing config)
    if is_dogfooding:
        steps_skipped += 1
    elif not state["theme"] and theme:
        write_theme_config(target_dir, theme)
    elif state["theme"]:
        steps_skipped += 1

    # 2b. Pull LFS portraits for the active theme — skip in dogfooding
    if not is_dogfooding:
        active_theme = theme
        if not active_theme:
            config_path = target_dir / ".pennyfarthing" / "config.local.yaml"
            if config_path.is_file():
                cfg = yaml.safe_load(config_path.read_text()) or {}
                active_theme = cfg.get("theme")
        if active_theme:
            from pf.common.themes import ensure_portrait_lfs

            ensure_portrait_lfs(active_theme, target_dir)

    # 3. Git hooks
    hooks_installed = False
    if install_hooks and not state["git_hooks"]:
        hooks_installed = _install_git_hooks(target_dir, dist_root)
    elif state["git_hooks"]:
        steps_skipped += 1

    # 4. Package manager detection + install
    pm = detect_package_manager(target_dir)

    return {
        "success": True,
        "data": {
            "package_manager": pm,
            "git_hooks_installed": hooks_installed,
            "steps_skipped": steps_skipped,
            "dogfooding": is_dogfooding,
        },
    }
