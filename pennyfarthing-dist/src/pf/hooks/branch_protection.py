"""
Branch protection hook (PreToolUse) — block commits/pushes to protected branches.

Prevents agents from committing or pushing directly to protected branches
(main, develop) during story work. Reads protected branches from repos.yaml
default_branch fields.

Exit 0 = allow, Exit 2 = block.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from pf.hooks import find_project_root

# Git commands that mutate a branch
_COMMIT_PATTERNS = [
    re.compile(r"\bgit\s+commit\b"),
    re.compile(r"\bgit\s+merge\b"),
    re.compile(r"\bgit\s+rebase\b"),
]

_PUSH_PATTERN = re.compile(r"\bgit\s+push\b")

# Checkout patterns (switching TO a protected branch to work on it)
_CHECKOUT_PATTERN = re.compile(r"\bgit\s+(?:checkout|switch)\s+(?!-b\b)(\S+)")


def _detect_current_repo(project_root: Path, repos: dict) -> str | None:
    """Determine which repo we're in by matching git root to repo paths."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None
        git_root = Path(result.stdout.strip()).resolve()
    except Exception:
        return None

    for name, config in repos.items():
        repo_path = (project_root / config.get("path", name)).resolve()
        if git_root == repo_path:
            return name
    return None


def _get_protected_branches(project_root: Path | None) -> set[str]:
    """Read protected branches from repos.yaml, respecting branch_strategy.

    Trunk-based repos allow commits/pushes to their default branch.
    Only gitflow repos have their default branch protected.
    """
    fallback = {"main", "develop", "master"}

    if not project_root:
        return fallback

    import yaml

    repos_yaml = project_root / ".pennyfarthing" / "repos.yaml"
    if not repos_yaml.exists():
        return fallback

    try:
        data = yaml.safe_load(repos_yaml.read_text()) or {}
        repos = data.get("repos") or {}
    except Exception:
        return fallback

    if not repos:
        return fallback

    current_repo = _detect_current_repo(project_root, repos)

    if current_repo:
        config = repos[current_repo]
        strategy = config.get("branch_strategy", "trunk-based")
        if strategy == "trunk-based":
            # Trunk-based repos allow direct commits to their default branch.
            # Still protect other repos' gitflow branches (e.g. block pushing
            # to develop from the orchestrator).
            protected = set()
            for name, rc in repos.items():
                if name != current_repo and rc.get("branch_strategy") == "gitflow":
                    branch = rc.get("default_branch")
                    if branch:
                        protected.add(branch)
            return protected
        else:
            # Gitflow: protect this repo's default branch
            return {config.get("default_branch", "develop")}

    return fallback


def _get_current_branch() -> str | None:
    """Get the current git branch name."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


def _extract_push_target(command: str) -> str | None:
    """Extract the target branch from a git push command, if specified."""
    # git push origin main, git push origin HEAD:main
    parts = command.split()
    try:
        push_idx = parts.index("push")
    except ValueError:
        return None

    args = [p for p in parts[push_idx + 1:] if not p.startswith("-")]
    if len(args) >= 2:
        target = args[1]
        # Handle HEAD:branch refspec
        if ":" in target:
            target = target.split(":")[-1]
        return target
    return None


def main() -> None:
    """Main entry point for branch protection hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            sys.exit(0)

        tool_name = input_data.get("tool_name", "")
        if tool_name != "Bash":
            sys.exit(0)

        tool_input = input_data.get("tool_input", {})
        command = tool_input.get("command", "")
        if not command:
            sys.exit(0)

        project_root = find_project_root()
        protected = _get_protected_branches(project_root)
        current_branch = _get_current_branch()

        # Check for commits/merges/rebases on protected branches
        if current_branch and current_branch in protected:
            for pattern in _COMMIT_PATTERNS:
                if pattern.search(command):
                    print(
                        f"BLOCKED: Cannot commit to protected branch '{current_branch}'.",
                        file=sys.stderr,
                    )
                    print(
                        "To fix: Create a feature branch first with "
                        "'git checkout -b feat/<story-id>-<description>'.",
                        file=sys.stderr,
                    )
                    sys.exit(2)

        # Check for pushes to protected branches
        if _PUSH_PATTERN.search(command):
            push_target = _extract_push_target(command)
            # Explicit push to protected branch
            if push_target and push_target in protected:
                print(
                    f"BLOCKED: Cannot push to protected branch '{push_target}'.",
                    file=sys.stderr,
                )
                print(
                    "To fix: Push to your feature branch instead.",
                    file=sys.stderr,
                )
                sys.exit(2)
            # Push from a protected branch (no explicit target = pushes current)
            if not push_target and current_branch and current_branch in protected:
                print(
                    f"BLOCKED: Cannot push from protected branch '{current_branch}'.",
                    file=sys.stderr,
                )
                print(
                    "To fix: Create a feature branch first with "
                    "'git checkout -b feat/<story-id>-<description>'.",
                    file=sys.stderr,
                )
                sys.exit(2)

    except SystemExit:
        raise
    except Exception:
        pass  # Fail open

    sys.exit(0)


if __name__ == "__main__":
    main()
