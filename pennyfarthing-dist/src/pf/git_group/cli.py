"""
Git CLI - Click-based CLI for git repository operations.

Usage:
    pf git [COMMAND] [ARGS]...

Commands:
    status       Check git status of all project repos
    cleanup      Organize changes into proper commits/branches
    branches     Create feature branches from a story
    worktree     Manage git worktrees for parallel work
    install-hooks Install git hooks with .d/ dispatcher pattern
"""

import asyncio

import click


@click.group()
def git():
    """Repository operations across all configured repos.

    \b
    Commands:
      status        - Check git status of all repos
      cleanup       - Organize changes into commits/branches
      branches      - Create feature branches from a story
      worktree      - Manage git worktrees for parallel work
      install-hooks - Install git hooks with .d/ dispatcher
    """
    pass


@git.command()
@click.option("--brief", is_flag=True, help="One-line-per-repo summary")
def status(brief: bool):
    """Check git status of all project repos.

    Shows branch, uncommitted changes, and ahead/behind status for each repo.
    """
    from pf.git.repos import get_repo_paths, load_repos_config
    from pf.git.status_all import (
        format_status_brief,
        format_status_full,
        format_summary,
        get_all_repo_status,
    )

    repo_paths = get_repo_paths()
    config = load_repos_config()

    # Build repo list with per-repo upstream refs
    repos_with_upstream: list[tuple[str, object, str]] = []
    for name, path in repo_paths:
        upstream = config[name].upstream_ref if name in config else "origin/main"
        repos_with_upstream.append((name, path, upstream))

    statuses = asyncio.run(get_all_repo_status(repos_with_upstream))

    if brief:
        click.echo(format_status_brief(statuses))
    else:
        click.echo("━" * 40)
        click.echo("  Git Status - All Repos")
        click.echo("━" * 40)
        click.echo()
        click.echo(format_status_full(statuses))
        click.echo("━" * 40)
        click.echo(format_summary(statuses))

    has_issues = any(not s.is_clean or s.has_unpushed for s in statuses)
    raise SystemExit(1 if has_issues else 0)


@git.command()
def cleanup():
    """Organize changes into proper commits and branches.

    Starts the git-cleanup stepped workflow via BikeLane.
    Equivalent to: /pf-workflow start git-cleanup
    """
    click.echo("Starting git-cleanup workflow...")
    click.echo("Run: /pf-workflow start git-cleanup")
    click.echo("Or:  pf workflow start git-cleanup")


@git.command()
@click.argument("branch_name")
@click.option(
    "--repos",
    type=click.Choice(["all", "api", "ui"]),
    default="all",
    help="Which repos to target",
)
def branches(branch_name: str, repos: str):
    """Create feature branches across all configured repos.

    \b
    Arguments:
      BRANCH_NAME  - The branch name to create (e.g., feat/86-3-file-upload)
    """
    from pf.git.create_branches import (
        create_feature_branches,
        detect_worktree,
        filter_repos,
        format_results,
    )
    from pf.git.repos import get_repo_paths

    is_worktree, worktree_name, _ = detect_worktree()
    if is_worktree:
        click.echo(f"📂 Detected worktree: {worktree_name}")
    else:
        click.echo("📂 Using main checkout")

    all_repos = get_repo_paths()
    filtered = filter_repos(all_repos, repos)

    if not filtered:
        click.echo(f"No repos match filter: {repos}", err=True)
        raise SystemExit(1)

    results = asyncio.run(create_feature_branches(filtered, branch_name))
    click.echo(format_results(results, branch_name))

    from pf.git.create_branches import BranchAction

    has_errors = any(r.action == BranchAction.ERROR for r in results)
    raise SystemExit(1 if has_errors else 0)


# Worktree subgroup
@git.group()
def worktree():
    """Manage git worktrees for parallel development.

    \b
    Commands:
      create  - Create worktree(s) for parallel work
      remove  - Remove worktree and clean up
      list    - List all active worktrees
      status  - Show detailed worktree status
    """
    pass


@worktree.command("create")
@click.argument("name")
@click.argument("branch")
@click.option(
    "--repos",
    default="all",
    help="Repos filter: all, api, ui, or comma-separated names",
)
def worktree_create(name: str, branch: str, repos: str):
    """Create worktree(s) for parallel work.

    \b
    Arguments:
      NAME    - Worktree name (e.g., wt-5-3a)
      BRANCH  - Branch name (e.g., feat/5-3a-file-upload)
    """
    from pf.git.worktree import create_worktree

    raise SystemExit(create_worktree(name, branch, repos))


@worktree.command("remove")
@click.argument("name")
def worktree_remove(name: str):
    """Remove worktree and clean up."""
    from pf.git.worktree import remove_worktree

    raise SystemExit(remove_worktree(name))


@worktree.command("list")
def worktree_list():
    """List all active worktrees."""
    from pf.git.worktree import list_worktrees

    raise SystemExit(list_worktrees())


@worktree.command("status")
def worktree_status():
    """Show detailed worktree status."""
    from pf.git.worktree import show_worktree_status

    raise SystemExit(show_worktree_status())


@git.command()
@click.option(
    "--label", "-l", default="", help="Label for the snapshot branch (e.g., 'benchmark-work')"
)
def snapshot(label: str):
    """Snapshot all repos: create safety branches and commit everything.

    Creates timestamped snapshot branches in every dirty repo and commits
    all changes (tracked and untracked). Use before risky operations like
    rebases or branch switches to ensure nothing is lost.

    \b
    Examples:
      pf git snapshot
      pf git snapshot --label benchmark-work
    """
    from pf.git.snapshot import format_snapshot_results, snapshot_all_repos

    click.echo("Creating snapshots...")
    results = snapshot_all_repos(label=label)
    click.echo(format_snapshot_results(results))

    has_errors = any(r.error for r in results)
    has_snapshots = any(not r.skipped and not r.error for r in results)

    if has_errors:
        raise SystemExit(1)
    elif not has_snapshots:
        click.echo("\nNothing to snapshot — all repos are clean.")
    else:
        click.echo("\nAll work preserved safely.")


@git.command("format-title")
@click.option("--jira-key", required=True, help="Jira issue key (e.g. PROJ-123)")
@click.option("--title", required=True, help="Short summary of the change")
@click.option("--scope", default="", help="Optional scope (e.g. git, ui)")
def format_title(jira_key: str, title: str, scope: str) -> None:
    """Format a PR title safely via argv (no shell interpolation).

    Calls pf.git.repos.format_pr_title() with arguments passed as argv values,
    so injection metacharacters in TITLE or SCOPE are treated as literal strings.

    \b
    Examples:
      pf git format-title --jira-key PROJ-123 --title "add new feature"
      pf git format-title --jira-key PROJ-456 --title "fix crash" --scope git
    """
    from pf.git.repos import format_pr_title

    result = format_pr_title(jira_key=jira_key, title=title, scope=scope)
    click.echo(result)


@git.command("install-hooks")
def install_hooks():
    """Install git hooks with .d/ dispatcher pattern.

    Creates .d/ directories, symlinks pennyfarthing hooks, and
    migrates existing user hooks.
    """
    from pf.git.hooks_installer import install_git_hooks

    raise SystemExit(install_git_hooks())
