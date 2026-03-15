"""Peloton CLI — native agent teams for story workflows.

Uses Claude Code's built-in agent teams (TeamCreate / SendMessage / TeamDelete)
with teammateMode: "tmux" for persistent panes per agent role.

  pf peloton start              — Initialize team for current story
  pf peloton status             — Show team state
  pf peloton stop               — Clear peloton state
"""

from __future__ import annotations

import json
from pathlib import Path

import click

from pf.common.config import get_project_root


@click.group()
def peloton():
    """Peloton mode — agent teams for story work.

    \b
    Uses Claude Code native agent teams with tmux split panes.
    SM is the team lead. Each agent role gets a persistent teammate pane.

    \b
    Commands:
      start    — Create team for current story
      status   — Show team state
      stop     — Clear peloton state
    """
    pass


@peloton.command("start")
@click.option("--workflow", default=None, help="Workflow override (default: from session)")
@click.option("--story-id", default=None, help="Story ID override (default: from session)")
def start(workflow: str | None, story_id: str | None):
    """Initialize peloton team for the current story.

    Reads the active story's workflow, determines which agents are needed,
    and outputs the TeamCreate prompt for SM to execute. SM then uses
    native agent teams to spawn teammates in tmux panes.
    """
    from pf.peloton import live

    root = get_project_root()

    wf_name = workflow or _detect_workflow(root)
    sid = story_id or _detect_story_id(root)

    if not wf_name:
        click.echo("Error: No workflow found. Provide --workflow or start a story first.", err=True)
        raise SystemExit(1)
    if not sid:
        click.echo("Error: No story ID found. Provide --story-id or start a story first.", err=True)
        raise SystemExit(1)

    result = live.start_session(root, sid, wf_name)
    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    data = result["data"]
    stale = data.get("stale_cleaned", [])
    if stale:
        click.echo(f"Cleaned {len(stale)} stale team(s): {', '.join(stale)}")
    click.echo(f"Peloton: initialized for story {sid} ({wf_name})")
    click.echo(f"Team: {data['team_name']}")
    click.echo(f"Agents: {', '.join(data['agents'])}")
    click.echo("")
    click.echo("SM: use the following to create the team:")
    click.echo("─" * 50)
    click.echo(data["prompt"])
    click.echo("─" * 50)


@peloton.command("status")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def status(as_json: bool):
    """Show current peloton team state."""
    from pf.peloton import live

    root = get_project_root()
    result = live.get_status(root)

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    data = result["data"]

    if as_json:
        click.echo(json.dumps(data, indent=2))
        return

    if not data["active"]:
        click.echo("No peloton session active.")
        return

    click.echo(f"Story: {data['story_id']}  Workflow: {data['workflow']}")
    click.echo(f"Team: {data['team_name']}")
    click.echo(f"Agents: {', '.join(data['agents'])}")


@peloton.command("stop")
def stop_cmd():
    """Clear peloton state.

    SM should call TeamDelete in the Claude Code session first,
    then run this to clean up the state file.
    """
    from pf.peloton import live

    root = get_project_root()
    result = live.stop(root)

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    click.echo("Peloton state cleared. Run TeamDelete in your session to clean up teammates.")


def _detect_workflow(root: Path) -> str | None:
    """Detect workflow from active session file."""
    session_dir = root / ".session"
    if not session_dir.exists():
        return None
    for f in session_dir.glob("*-session.md"):
        text = f.read_text()
        for line in text.splitlines():
            if line.startswith("**Workflow:**"):
                return line.split(":**", 1)[1].strip()
    return None


def _detect_story_id(root: Path) -> str | None:
    """Detect story ID from active session file."""
    session_dir = root / ".session"
    if not session_dir.exists():
        return None
    for f in session_dir.glob("*-session.md"):
        name = f.stem.replace("-session", "")
        if name:
            return name
    return None
