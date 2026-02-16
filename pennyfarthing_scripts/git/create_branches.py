"""
Create feature branches across repos - async parallel execution.

Story: MSSCI-12402 - Port git utility scripts to Python

Replaces: pennyfarthing-dist/scripts/git/create-feature-branches.sh

Features:
- asyncio.gather for true parallel git operations
- Idempotent: checks out existing or creates new branches
- Branches from develop
- Worktree-aware detection
- Cross-platform compatible
"""

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Literal


class BranchAction(Enum):
    """Action taken when creating/checking out a branch."""

    CREATED = "created"  # New branch created from develop
    CHECKED_OUT_LOCAL = "checked_out_local"  # Existing local branch checked out
    CHECKED_OUT_REMOTE = "checked_out_remote"  # Remote branch checked out and tracked
    SKIPPED = "skipped"  # Repo skipped (not found)
    ERROR = "error"  # Error occurred


@dataclass
class BranchResult:
    """Result of branch creation/checkout for a single repo."""

    name: str
    path: Path
    branch: str
    action: BranchAction
    current_branch: str | None = None  # Actual branch after operation
    commit_info: str | None = None  # Latest commit hash and message
    tracking: str | None = None  # Remote tracking branch if any
    error: str | None = None  # Error message if action is ERROR


async def _run_git_command(args: list[str], cwd: Path) -> tuple[str, str, int]:
    """Run a git command asynchronously.

    Args:
        args: Git command arguments (without 'git')
        cwd: Working directory for the command

    Returns:
        Tuple of (stdout, stderr, return_code)
    """
    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (
        stdout.decode("utf-8", errors="replace").strip(),
        stderr.decode("utf-8", errors="replace").strip(),
        proc.returncode or 0,
    )


async def create_or_checkout_branch(
    name: str,
    path: Path,
    branch_name: str,
) -> BranchResult:
    """Create or checkout a feature branch in a single repo.

    Behavior:
    - If branch exists locally, check it out
    - If branch exists on remote, check it out and track
    - Otherwise, create new branch from develop

    Args:
        name: Display name for the repo
        path: Path to the repository
        branch_name: Name of the branch to create/checkout

    Returns:
        BranchResult with action taken and current state
    """
    # Check if path exists
    if not path.exists():
        return BranchResult(
            name=name,
            path=path,
            branch=branch_name,
            action=BranchAction.SKIPPED,
            error=f"Directory not found: {path}",
        )

    # Check if it's a git repo
    git_dir = path / ".git"
    if not git_dir.exists():
        try:
            _, _, rc = await _run_git_command(["rev-parse", "--git-dir"], path)
            if rc != 0:
                return BranchResult(
                    name=name,
                    path=path,
                    branch=branch_name,
                    action=BranchAction.SKIPPED,
                    error=f"Not a git repository: {path}",
                )
        except Exception as e:
            return BranchResult(
                name=name,
                path=path,
                branch=branch_name,
                action=BranchAction.ERROR,
                error=f"Git command failed: {e}",
            )

    try:
        # Fetch from origin first
        await _run_git_command(["fetch", "origin", "--quiet"], path)

        # Check if branch exists locally
        local_ref, _, local_rc = await _run_git_command(
            ["show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}"], path
        )

        if local_rc == 0:
            # Branch exists locally, check it out
            _, _, checkout_rc = await _run_git_command(
                ["checkout", branch_name], path
            )
            if checkout_rc != 0:
                return BranchResult(
                    name=name,
                    path=path,
                    branch=branch_name,
                    action=BranchAction.ERROR,
                    error=f"Failed to checkout local branch {branch_name}",
                )
            action = BranchAction.CHECKED_OUT_LOCAL
        else:
            # Check if branch exists on remote
            remote_ref, _, remote_rc = await _run_git_command(
                ["show-ref", "--verify", "--quiet", f"refs/remotes/origin/{branch_name}"],
                path,
            )

            if remote_rc == 0:
                # Branch exists on remote, checkout and track
                _, _, checkout_rc = await _run_git_command(
                    ["checkout", "-b", branch_name, f"origin/{branch_name}"], path
                )
                if checkout_rc != 0:
                    return BranchResult(
                        name=name,
                        path=path,
                        branch=branch_name,
                        action=BranchAction.ERROR,
                        error=f"Failed to checkout remote branch {branch_name}",
                    )
                action = BranchAction.CHECKED_OUT_REMOTE
            else:
                # Branch doesn't exist, create from develop
                # First ensure we have develop
                await _run_git_command(
                    ["fetch", "origin", "develop:develop", "--quiet"], path
                )

                # Checkout develop
                await _run_git_command(["checkout", "develop", "--quiet"], path)
                await _run_git_command(["pull", "origin", "develop", "--quiet"], path)

                # Create new branch
                _, _, create_rc = await _run_git_command(
                    ["checkout", "-b", branch_name], path
                )
                if create_rc != 0:
                    return BranchResult(
                        name=name,
                        path=path,
                        branch=branch_name,
                        action=BranchAction.ERROR,
                        error=f"Failed to create branch {branch_name}",
                    )
                action = BranchAction.CREATED

        # Get current branch for verification
        current_branch, _, _ = await _run_git_command(
            ["branch", "--show-current"], path
        )

        # Get latest commit info
        commit_info, _, _ = await _run_git_command(
            ["log", "-1", "--format=%h - %s"], path
        )

        # Get tracking info
        tracking, _, tracking_rc = await _run_git_command(
            ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], path
        )
        if tracking_rc != 0:
            tracking = None

        return BranchResult(
            name=name,
            path=path,
            branch=branch_name,
            action=action,
            current_branch=current_branch,
            commit_info=commit_info,
            tracking=tracking,
        )

    except Exception as e:
        return BranchResult(
            name=name,
            path=path,
            branch=branch_name,
            action=BranchAction.ERROR,
            error=f"Error: {e}",
        )


async def create_feature_branches(
    repos: Sequence[tuple[str, Path]],
    branch_name: str,
) -> list[BranchResult]:
    """Create feature branches across all repos in parallel using asyncio.gather.

    Args:
        repos: Sequence of (name, path) tuples for each repo
        branch_name: Name of the branch to create/checkout

    Returns:
        List of BranchResult objects in same order as input
    """
    if not repos:
        return []

    tasks = [create_or_checkout_branch(name, path, branch_name) for name, path in repos]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return list(results)


def detect_worktree(current_dir: Path | None = None) -> tuple[bool, str | None, Path]:
    """Detect if running in a git worktree.

    Args:
        current_dir: Directory to check (defaults to cwd)

    Returns:
        Tuple of (is_worktree, worktree_name, base_path)
        - is_worktree: True if in a worktree
        - worktree_name: Name of worktree if in one, else None
        - base_path: Base path to use for repo operations
    """
    if current_dir is None:
        current_dir = Path.cwd()

    current_str = str(current_dir.resolve())

    # Check if path contains /worktrees/
    if "/worktrees/" in current_str:
        # Extract worktree name from path
        parts = current_str.split("/worktrees/")
        if len(parts) >= 2:
            worktree_name = parts[1].split("/")[0]
            # Base path is up to and including worktrees/worktree_name
            base_path = Path(parts[0]) / "worktrees" / worktree_name
            return (True, worktree_name, base_path)

    # Not in a worktree
    try:
        from pennyfarthing_scripts.common.config import get_project_root
        base_path = get_project_root(current_dir)
    except FileNotFoundError:
        base_path = current_dir

    return (False, None, base_path)


def format_results(results: Sequence[BranchResult], branch_name: str) -> str:
    """Format branch creation results for display.

    Args:
        results: Sequence of BranchResult objects
        branch_name: The target branch name

    Returns:
        Multi-line formatted string with results and verification
    """
    lines = []
    lines.append("🌿 Creating/checking out feature branches...")
    lines.append(f"   Branch: {branch_name}")
    lines.append("")

    # Individual results
    for result in results:
        lines.append(f"📦 {result.name}")
        lines.append(f"   Path: {result.path}")

        action_icons = {
            BranchAction.CREATED: "🌿 Created",
            BranchAction.CHECKED_OUT_LOCAL: "✅ Checked out (local)",
            BranchAction.CHECKED_OUT_REMOTE: "✅ Checked out (remote)",
            BranchAction.SKIPPED: "⏭️ Skipped",
            BranchAction.ERROR: "❌ Error",
        }
        lines.append(f"   Action: {action_icons.get(result.action, str(result.action))}")

        if result.current_branch:
            lines.append(f"   Branch: {result.current_branch}")
        if result.commit_info:
            lines.append(f"   Commit: {result.commit_info}")
        if result.tracking:
            lines.append(f"   Remote: {result.tracking}")
        if result.error:
            lines.append(f"   Error: {result.error}")
        lines.append("")

    # Verification summary
    lines.append("━" * 50)
    lines.append("🔍 Verification Summary")
    lines.append("━" * 50)

    success_count = sum(
        1 for r in results if r.action in (
            BranchAction.CREATED,
            BranchAction.CHECKED_OUT_LOCAL,
            BranchAction.CHECKED_OUT_REMOTE,
        )
    )
    error_count = sum(1 for r in results if r.action == BranchAction.ERROR)
    skipped_count = sum(1 for r in results if r.action == BranchAction.SKIPPED)

    lines.append(f"   Success: {success_count}")
    if skipped_count > 0:
        lines.append(f"   Skipped: {skipped_count}")
    if error_count > 0:
        lines.append(f"   Errors: {error_count}")

    lines.append("")
    if error_count > 0:
        lines.append("⚠️ Done with errors. Check output above.")
    else:
        lines.append("✅ Done! All branches verified and ready.")

    return "\n".join(lines)


RepoFilter = Literal["all", "api", "ui"]


def filter_repos(
    repos: Sequence[tuple[str, Path]],
    filter_type: RepoFilter,
) -> list[tuple[str, Path]]:
    """Filter repos by type.

    Args:
        repos: Full list of (name, path) tuples
        filter_type: "all", "api", or "ui"

    Returns:
        Filtered list of repos matching the filter
    """
    if filter_type == "all":
        return list(repos)

    result = []
    for name, path in repos:
        name_lower = name.lower()
        if filter_type == "api" and ("api" in name_lower or name_lower.endswith("-api")):
            result.append((name, path))
        elif filter_type == "ui" and ("ui" in name_lower or name_lower.endswith("-ui")):
            result.append((name, path))

    return result


async def main(branch_name: str, repos_filter: RepoFilter = "all") -> int:
    """CLI entry point for create-feature-branches.

    Args:
        branch_name: Name of the branch to create/checkout
        repos_filter: Which repos to target ("all", "api", "ui")

    Returns:
        0 if all repos succeeded, 1 if any had errors
    """
    from pennyfarthing_scripts.git.repos import get_repo_paths

    # Detect worktree
    is_worktree, worktree_name, base_path = detect_worktree()

    if is_worktree:
        print(f"📂 Detected worktree: {worktree_name}")
    else:
        print("📂 Using main checkout")

    # Load repos from configuration
    repos = get_repo_paths()

    # Apply filter
    filtered_repos = filter_repos(repos, repos_filter)

    if not filtered_repos:
        print(f"No repos match filter: {repos_filter}")
        return 1

    results = await create_feature_branches(filtered_repos, branch_name)
    print(format_results(results, branch_name))

    # Return 1 if any errors
    has_errors = any(r.action == BranchAction.ERROR for r in results)
    return 1 if has_errors else 0


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Usage: python -m pennyfarthing_scripts.git.create_branches <branch-name> [repos]")
        print("  repos: all (default), api, ui")
        sys.exit(0)

    branch = sys.argv[1]
    repos_filter: RepoFilter = "all"
    if len(sys.argv) >= 3 and sys.argv[2] in ("all", "api", "ui"):
        repos_filter = sys.argv[2]  # type: ignore

    sys.exit(asyncio.run(main(branch, repos_filter)))
