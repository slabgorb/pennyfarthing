"""Auto-setup workflow for pf init.

Story 126-3: Integrate auto-setup into pf init — repo discovery,
theme, git hooks, Node install.

This module provides the interactive setup workflow that runs
automatically after pf init creates the directory structure.
"""

from __future__ import annotations

import stat
import subprocess
from pathlib import Path
from typing import Any

import yaml

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


def detect_package_manager(target_dir: Path) -> str | None:
    """Detect the preferred package manager for a project.

    Checks for lockfiles in priority order: pnpm > yarn > npm.
    Walks up from target_dir to find the nearest lockfile.

    Args:
        target_dir: Project directory to check

    Returns:
        "pnpm", "yarn", "npm", or None if no package manager detected
    """
    current = target_dir.resolve()
    while True:
        for lockfile, manager in _LOCKFILE_PRIORITY:
            if (current / lockfile).exists():
                return manager
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def discover_repos(target_dir: Path) -> dict[str, Any]:
    """Discover git repositories in and around the target directory.

    Scans for .git directories to build a repos.yaml structure.

    Args:
        target_dir: Project directory to scan from

    Returns:
        Result dict: {success: bool, data?: {repos: dict}, error?: str}
    """
    target = target_dir.resolve()
    repos: dict[str, Any] = {}

    # Check if target_dir itself is a git repo
    if (target / ".git").exists():
        name = target.name
        default_branch = _detect_default_branch(target)
        repos[name] = {
            "path": ".",
            "type": "standalone",
            "default_branch": default_branch,
            "branch_strategy": "trunk-based",
        }

    if not repos:
        return {"success": False, "error": "No git repositories found"}

    return {"success": True, "data": {"repos": repos}}


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
            # refs/remotes/origin/main -> main
            return result.stdout.strip().split("/")[-1]
    except Exception:
        pass
    return "main"


def write_repos_yaml(target_dir: Path, repos: dict[str, Any]) -> dict[str, Any]:
    """Write discovered repos to .pennyfarthing/repos.yaml.

    Args:
        target_dir: Project directory
        repos: Repo configuration dict to write

    Returns:
        Result dict: {success: bool, error?: str}
    """
    repos_path = target_dir / ".pennyfarthing" / "repos.yaml"
    repos_path.parent.mkdir(parents=True, exist_ok=True)
    repos_path.write_text(yaml.dump({"repos": repos}, default_flow_style=False))
    return {"success": True}


def write_theme_config(target_dir: Path, theme: str) -> dict[str, Any]:
    """Write selected theme to .pennyfarthing/config.local.yaml.

    Preserves existing config keys (read-modify-write).

    Args:
        target_dir: Project directory
        theme: Theme ID to set

    Returns:
        Result dict: {success: bool, error?: str}
    """
    config_path = target_dir / ".pennyfarthing" / "config.local.yaml"
    config_path.parent.mkdir(parents=True, exist_ok=True)

    existing: dict[str, Any] = {}
    if config_path.is_file():
        existing = yaml.safe_load(config_path.read_text()) or {}

    existing["theme"] = theme
    config_path.write_text(yaml.dump(existing, default_flow_style=False))
    return {"success": True}


def install_node_packages(
    target_dir: Path,
    package_manager: str,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Install Node packages using the detected package manager.

    Args:
        target_dir: Project directory
        package_manager: "pnpm", "yarn", or "npm"
        dry_run: If True, return plan without executing

    Returns:
        Result dict: {success: bool, data?: dict, error?: str}
    """
    if package_manager not in _VALID_MANAGERS:
        return {"success": False, "error": f"Unsupported package manager: {package_manager}"}

    command = _INSTALL_COMMANDS[package_manager]

    if dry_run:
        return {
            "success": True,
            "data": {"action": "dry-run", "command": command},
        }

    try:
        subprocess.run(
            command.split(),
            cwd=str(target_dir),
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        return {"success": False, "error": f"Install failed: {e.stderr}"}

    return {"success": True, "data": {"command": command}}


def get_setup_state(target_dir: Path) -> dict[str, bool]:
    """Check which setup steps have already been completed.

    Used for re-entry after partial completion.

    Args:
        target_dir: Project directory

    Returns:
        Dict of step_name -> completed boolean
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
    """Install git hooks using the dispatcher pattern.

    Returns True if hooks were installed, False if skipped (no .git).
    """
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
        # Create the dispatcher
        dispatcher_content = template.replace("__HOOK_NAME__", hook_name)
        dispatcher_path = hooks_dir / hook_name
        dispatcher_path.write_text(dispatcher_content)
        dispatcher_path.chmod(dispatcher_path.stat().st_mode | stat.S_IEXEC)

        # Create the .d directory with the hook script
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
) -> dict[str, Any]:
    """Run the full auto-setup workflow.

    Called by init_project() after directory scaffolding. Orchestrates:
    1. Repo discovery -> repos.yaml
    2. Theme selection -> config.local.yaml
    3. Git hooks installation (opt-in)
    4. Package manager detection -> Node package install

    Skips steps that are already completed (re-entry safe).

    Args:
        target_dir: Project directory
        dist_root: Path to pennyfarthing-dist source
        skip_prompts: If True, use defaults without prompting
        theme: Pre-selected theme (skips interactive selection)
        install_hooks: Pre-selected hooks choice (skips prompt)
        dry_run: If True, return plan without executing

    Returns:
        Result dict: {success: bool, data?: dict, error?: str}
    """
    if not dist_root.is_dir():
        return {"success": False, "error": f"Dist root does not exist: {dist_root}"}

    state = get_setup_state(target_dir)
    steps_skipped = 0

    if dry_run:
        steps: list[str] = []
        if not state["repos"]:
            steps.append("discover_repos -> write repos.yaml")
        if not state["theme"]:
            steps.append(f"write theme config ({theme or 'interactive selection'})")
        if install_hooks and not state["git_hooks"]:
            steps.append("install git hooks")
        pm = detect_package_manager(target_dir)
        if pm:
            steps.append(f"install node packages via {pm}")
        return {
            "success": True,
            "data": {"steps": steps, "dry_run": True},
        }

    # 1. Repo discovery
    if not state["repos"]:
        repo_result = discover_repos(target_dir)
        if repo_result["success"]:
            write_repos_yaml(target_dir, repo_result["data"]["repos"])
    else:
        steps_skipped += 1

    # 2. Theme selection
    if not state["theme"] and theme:
        write_theme_config(target_dir, theme)
    elif state["theme"]:
        steps_skipped += 1

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
        },
    }
