"""
Git worktree management — Python replacement for worktree-manager.sh (498 lines).

Manages git worktrees for parallel development across multiple repos.

Usage via CLI:
    pf git worktree create <name> <branch> [--repos all|api|ui|name1,name2]
    pf git worktree remove <name>
    pf git worktree list
    pf git worktree status
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from pennyfarthing_scripts.common.config import get_project_root
from pennyfarthing_scripts.git.repos import load_repos_config


def _git(args: list[str], cwd: Path) -> tuple[str, int]:
    """Run a git command synchronously.

    Returns:
        Tuple of (stdout, return_code)
    """
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip(), result.returncode


def _get_worktree_root(project_root: Path | None = None) -> Path:
    """Get worktree root directory."""
    if project_root is None:
        project_root = get_project_root()
    env_root = os.environ.get("WORKTREE_ROOT")
    if env_root:
        return Path(env_root)
    return project_root / "worktrees"


def _filter_repos(
    repos: dict[str, object], filter_str: str
) -> list[str]:
    """Filter repo names by type or comma-separated list."""
    from pennyfarthing_scripts.git.repos import RepoConfig

    if filter_str in ("all", "both"):
        return list(repos.keys())

    # Check if it's a type filter
    if filter_str in ("api", "ui", "adapter", "service"):
        return [
            name
            for name, cfg in repos.items()
            if isinstance(cfg, RepoConfig) and cfg.repo_type == filter_str
        ]

    # Comma-separated list of names
    return [n.strip() for n in filter_str.split(",") if n.strip()]


def create_worktree(name: str, branch: str, repos_filter: str = "all") -> int:
    """Create worktree(s) for parallel work.

    Args:
        name: Worktree name (e.g., wt-5-3a)
        branch: Branch name (e.g., feat/5-3a-file-upload)
        repos_filter: Which repos to target (all, api, ui, or comma-separated)

    Returns:
        0 on success, 1 on error
    """
    project_root = get_project_root()
    wt_root = _get_worktree_root(project_root)
    wt_path = wt_root / name

    if wt_path.exists():
        print(f"Error: Worktree '{name}' already exists at {wt_path}")
        return 1

    repos = load_repos_config(project_root)
    if not repos:
        print("Error: No repositories configured in repos.yaml")
        return 1

    target_names = _filter_repos(repos, repos_filter)
    if not target_names:
        print(f"No repos match filter: {repos_filter}")
        return 1

    wt_path.mkdir(parents=True, exist_ok=True)

    print(f"Creating worktree: {name}")
    print(f"  Branch: {branch}")
    print(f"  Path: {wt_path}")
    print(f"  Repos: {repos_filter}")
    print()

    created = []
    for repo_name in target_names:
        if repo_name not in repos:
            print(f"  SKIP {repo_name} (not in config)")
            continue

        cfg = repos[repo_name]
        full_path = (project_root / cfg.path).resolve()

        if not full_path.exists():
            print(f"  SKIP {repo_name} (path not found: {full_path})")
            continue

        print(f"Creating worktree for {repo_name} ({cfg.repo_type})...")
        repo_wt = wt_path / repo_name

        # Check if branch exists locally or remotely
        _, local_rc = _git(
            ["show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
            full_path,
        )
        _, remote_rc = _git(
            ["show-ref", "--verify", "--quiet", f"refs/remotes/origin/{branch}"],
            full_path,
        )

        if local_rc == 0 or remote_rc == 0:
            _, rc = _git(["worktree", "add", str(repo_wt), branch], full_path)
        else:
            # Create new branch from default branch
            base = cfg.default_branch
            _, base_rc = _git(
                ["show-ref", "--verify", "--quiet", f"refs/heads/{base}"],
                full_path,
            )
            if base_rc != 0:
                base = "main"
            _, rc = _git(
                ["worktree", "add", "-b", branch, str(repo_wt), base],
                full_path,
            )

        if rc == 0:
            print(f"  OK {repo_name}")
            created.append(repo_name)
        else:
            print(f"  FAIL {repo_name}")

    print()
    if created:
        print(f"Worktree '{name}' created successfully!")
        print()
        print("Next steps:")
        for repo_name in created:
            print(f"  cd {wt_path / repo_name}")
    else:
        print("No worktrees created.")
        return 1

    return 0


def remove_worktree(name: str) -> int:
    """Remove worktree and clean up.

    Args:
        name: Worktree name to remove

    Returns:
        0 on success, 1 on error
    """
    project_root = get_project_root()
    wt_root = _get_worktree_root(project_root)
    wt_path = wt_root / name

    if not wt_path.exists():
        print(f"Error: Worktree '{name}' not found at {wt_path}")
        return 1

    print(f"Removing worktree: {name}")

    repos = load_repos_config(project_root)
    for repo_name, cfg in repos.items():
        repo_wt = wt_path / repo_name
        if repo_wt.exists():
            full_path = (project_root / cfg.path).resolve()
            print(f"  Removing {repo_name} worktree...")
            _git(["worktree", "remove", str(repo_wt), "--force"], full_path)

    # Clean up directory
    import shutil

    if wt_path.exists():
        shutil.rmtree(wt_path)

    # Prune worktree references
    for repo_name, cfg in repos.items():
        full_path = (project_root / cfg.path).resolve()
        if full_path.exists():
            _git(["worktree", "prune"], full_path)

    print()
    print("Note: Session file (if any) should be archived via /sm finish")
    print()
    print(f"Worktree '{name}' removed successfully!")
    return 0


def list_worktrees() -> int:
    """List all active worktrees.

    Returns:
        0 always
    """
    project_root = get_project_root()
    wt_root = _get_worktree_root(project_root)
    repos = load_repos_config(project_root)

    print("=== Active Worktrees ===")
    print()

    for repo_name, cfg in repos.items():
        full_path = (project_root / cfg.path).resolve()
        if full_path.exists():
            print(f"{repo_name} ({cfg.repo_type}):")
            output, _ = _git(["worktree", "list"], full_path)
            if output:
                print(output)
            print()

    print("Worktree Directory:")
    if wt_root.exists() and any(wt_root.iterdir()):
        for item in sorted(wt_root.iterdir()):
            if item.is_dir():
                print(f"  {item.name}/")
    else:
        print("  (empty)")

    return 0


def show_worktree_status() -> int:
    """Show detailed worktree status.

    Returns:
        0 always
    """
    project_root = get_project_root()
    wt_root = _get_worktree_root(project_root)
    repos = load_repos_config(project_root)

    print("=== Worktree Status ===")
    print()

    if not wt_root.exists() or not any(wt_root.iterdir()):
        print("No active worktrees.")
        print()
        print("Create one with:")
        print("  pf git worktree create <name> <branch>")
        return 0

    for wt_dir in sorted(wt_root.iterdir()):
        if not wt_dir.is_dir():
            continue

        wt_name = wt_dir.name
        print(f"{wt_name}")
        print(f"  Path: {wt_dir}")

        for repo_name, cfg in repos.items():
            repo_wt = wt_dir / repo_name
            if repo_wt.exists():
                branch, _ = _git(["branch", "--show-current"], repo_wt)
                status_out, _ = _git(["status", "--short"], repo_wt)
                count = len([l for l in status_out.split("\n") if l.strip()]) if status_out else 0
                print(f"  {repo_name} ({cfg.repo_type}): {branch} ({count} uncommitted)")

        # Check for session files referencing this worktree
        session_dir = project_root / ".session"
        found_session = None
        if session_dir.exists():
            for sf in session_dir.glob("*-session.md"):
                try:
                    content = sf.read_text()
                    if f"worktree: {wt_name}" in content:
                        found_session = sf.name
                        break
                except OSError:
                    pass

        if found_session:
            print(f"  Session: .session/{found_session}")
        else:
            print("  Session: (no session file references this worktree)")
        print()

    return 0
