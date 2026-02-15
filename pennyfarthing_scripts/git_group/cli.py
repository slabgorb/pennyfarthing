"""
Git CLI - Click-based CLI for git repository operations.

Usage:
    pf git [COMMAND] [ARGS]...

Commands:
    status    Check git status of all project repos
    cleanup   Organize changes into proper commits/branches
    branches  Create feature branches from a story
    release   Interactive release with verification gates
"""

import click

from pennyfarthing_scripts.common.config import get_project_root


@click.group()
def git():
    """Repository operations across all configured repos.

    \b
    Commands:
      status    - Check git status of all repos
      cleanup   - Organize changes into commits/branches
      branches  - Create feature branches from a story
      release   - Interactive release with verification gates
    """
    pass


@git.command()
@click.option("--brief", is_flag=True, help="One-line-per-repo summary")
def status(brief: bool):
    """Check git status of all project repos.

    Shows branch, uncommitted changes, and ahead/behind status for each repo.
    """
    import subprocess

    root = get_project_root()
    script = root / ".pennyfarthing" / "scripts" / "git" / "git-status-all.sh"

    if not script.is_file():
        click.echo("Error: git-status-all.sh not found", err=True)
        raise SystemExit(1)

    cmd = [str(script)]
    if brief:
        cmd.append("--brief")

    result = subprocess.run(cmd, cwd=str(root))
    raise SystemExit(result.returncode)


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
@click.argument("story_id")
def branches(story_id: str):
    """Create feature branches in both repos from a story.

    \b
    Arguments:
      STORY_ID  - The story ID to create branches for (e.g., 86-3)
    """
    import subprocess

    root = get_project_root()
    script = root / ".pennyfarthing" / "scripts" / "git" / "create-branches.sh"

    if not script.is_file():
        click.echo("Error: create-branches.sh not found", err=True)
        raise SystemExit(1)

    result = subprocess.run([str(script), story_id], cwd=str(root))
    raise SystemExit(result.returncode)


@git.command()
def release():
    """Interactive release with verification gates.

    Starts the release stepped workflow via BikeLane.
    Equivalent to: /pf-workflow start release
    """
    click.echo("Starting release workflow...")
    click.echo("Run: /pf-workflow start release")
    click.echo("Or:  pf workflow start release")
