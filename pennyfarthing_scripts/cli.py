"""
Pennyfarthing CLI - Command line interface for agent orchestration.

Usage:
    python -m pennyfarthing_scripts.cli [OPTIONS] COMMAND [ARGS]...
    pf [OPTIONS] COMMAND [ARGS]...

This module uses lazy loading to keep startup time under 200ms.
Heavy imports (httpx, workflow modules) are deferred until needed.
"""

import click

# Get version from package - this is a fast import
from pennyfarthing_scripts import __version__


@click.group()
@click.version_option(version=__version__, prog_name="pf")
def cli():
    """Pennyfarthing CLI - Agent orchestration utilities.

    Commands are organized into groups:

    \b
    workflow  - Workflow state and phase management
    agent     - Agent session management
    sprint    - Sprint status and story operations
    git       - Repository operations (status, cleanup, branches, release)
    session   - Session lifecycle (new, continue, parallel)
    epic      - Epic lifecycle (start, close)
    debug     - Analysis tools (hotspots, deadcode, healthscore)

    \b
    Shortcuts (sugar for common operations):
      status   - Show sprint status (= sprint status)
      backlog  - Show available stories (= sprint backlog)
      work     - Start work on a story (= sprint work)
      story    - Story operations (= sprint story)
      gui      - Open BikeRack dashboard (= launch gui)
      tui      - Launch terminal UI (= launch tui)
    """
    pass


# Import and register sprint group (lazy registration preserves startup time)
from pennyfarthing_scripts.sprint.cli import sprint  # noqa: E402

cli.add_command(sprint)

# Top-level sugar shortcuts for common sprint operations
cli.add_command(sprint.commands["status"], "status")
cli.add_command(sprint.commands["backlog"], "backlog")
cli.add_command(sprint.commands["work"], "work")
cli.add_command(sprint.commands["story"], "story")

# Import analysis groups
from pennyfarthing_scripts.deadcode.cli import deadcode  # noqa: E402
from pennyfarthing_scripts.healthscore.cli import healthscore  # noqa: E402
from pennyfarthing_scripts.hotspots.cli import hotspots  # noqa: E402


@cli.group()
def debug():
    """Debug and analysis tools.

    \b
    Subcommands:
      hotspots     - Git history hotspot detection
      deadcode     - Dead code detection tools
      healthscore  - Composite codebase health score
    """
    pass


debug.add_command(hotspots)
debug.add_command(deadcode)
debug.add_command(healthscore)

# Hidden backward-compat aliases
cli.add_command(hotspots, "hotspots")
cli.commands["hotspots"].hidden = True
cli.add_command(deadcode, "deadcode")
cli.commands["deadcode"].hidden = True
cli.add_command(healthscore, "healthscore")
cli.commands["healthscore"].hidden = True

# Import and register jira group
from pennyfarthing_scripts.jira.cli import jira  # noqa: E402

cli.add_command(jira)

# Import and register theme group
from pennyfarthing_scripts.theme.cli import theme  # noqa: E402

cli.add_command(theme)

# Import and register validate group
from pennyfarthing_scripts.validate.cli import validate  # noqa: E402

cli.add_command(validate)

# Import and register bikerack group
from pennyfarthing_scripts.bikerack.cli import bikerack  # noqa: E402

cli.add_command(bikerack)

# Import and register launch group + top-level sugar aliases
from pennyfarthing_scripts.launch.cli import launch  # noqa: E402

cli.add_command(launch)
cli.add_command(launch.commands["gui"], "gui")
cli.add_command(launch.commands["tui"], "tui")

# Import and register bc group
from pennyfarthing_scripts.bc.cli import bc  # noqa: E402

cli.add_command(bc)

# Import and register handoff group
from pennyfarthing_scripts.handoff.cli import handoff  # noqa: E402

cli.add_command(handoff)

# Import and register git group
from pennyfarthing_scripts.git_group.cli import git  # noqa: E402

cli.add_command(git)

# Import and register session group
from pennyfarthing_scripts.session.cli import session  # noqa: E402

cli.add_command(session)

# Import and register epic group
from pennyfarthing_scripts.epic.cli import epic  # noqa: E402

cli.add_command(epic)

# Import and register consultation group
from pennyfarthing_scripts.consultation.cli import consultation  # noqa: E402

cli.add_command(consultation)

# Import and register hooks group
from pennyfarthing_scripts.hooks.cli import hooks  # noqa: E402

cli.add_command(hooks)

# Import and register settings group
from pennyfarthing_scripts.settings.cli import settings  # noqa: E402

cli.add_command(settings)


@cli.group()
def agent():
    """Agent session management.

    \b
    Commands:
      start    - Start an agent session with context
      heatmap  - Visualize context distribution and attention
    """
    pass


@agent.command("start")
@click.argument("name")
@click.option("--session-id", help="Use explicit session ID")
@click.option("--no-persona", is_flag=True, help="Skip persona loading")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
@click.option("--minimal", is_flag=True, help="Skip all context (fastest)")
@click.option("--full", is_flag=True, help="Include domain docs")
@click.option("--quiet", is_flag=True, help="Suppress section headers")
@click.option("--tier", type=click.Choice(["full", "refresh", "handoff", "minimal"], case_sensitive=False), help="Context tier level")
def agent_start(
    name: str,
    session_id: str | None,
    no_persona: bool,
    output_json: bool,
    minimal: bool,
    full: bool,
    quiet: bool,
    tier: str | None,
):
    """Start an agent session with full context.

    Loads agent definition, persona, behavior guide, sprint context,
    session context, and sidecar memory.

    \b
    Arguments:
      NAME  - Agent name (sm, tea, dev, reviewer, etc.)
    """
    # Lazy import - only load when command is actually invoked
    from pennyfarthing_scripts.prime import prime

    exit_code = prime(
        agent_name=name,
        session_id=session_id,
        no_persona=no_persona,
        json_output=output_json,
        minimal=minimal,
        full=full,
        quiet=quiet,
        tier=tier,
    )
    raise SystemExit(exit_code)


@agent.command("heatmap")
@click.argument("name", required=False)
@click.option("--all", "show_all", is_flag=True, help="Show summary across all primary agents")
@click.option("--csv", "csv_output", is_flag=True, help="Output CSV for machine consumption")
@click.option("--json", "json_output", is_flag=True, help="Output JSON")
def agent_heatmap(
    name: str | None,
    show_all: bool,
    csv_output: bool,
    json_output: bool,
):
    """Visualize context distribution and attention for agent activation.

    Shows a heat map of how tokens are distributed across sections of an
    agent's activation context, with attention scores based on the
    "Lost in the Middle" U-shaped attention model.

    \b
    Examples:
      pf agent heatmap sm           # Detailed view for SM
      pf agent heatmap --all        # Summary across all agents
      pf agent heatmap dev --json   # JSON output for tooling
    """
    from pennyfarthing_scripts.prime.heatmap import run_heatmap

    exit_code = run_heatmap(
        agent_name=name,
        show_all=show_all,
        csv_output=csv_output,
        json_output=json_output,
    )
    raise SystemExit(exit_code)


# Import and register workflow group
from pennyfarthing_scripts.workflow.cli import workflow  # noqa: E402

cli.add_command(workflow)


@cli.command("help")
@click.argument("group", required=False)
def help_cmd(group: str | None):
    """Context-aware help for Pennyfarthing commands.

    \b
    Arguments:
      GROUP  - Optional command group name (sprint, git, session, epic, jira, theme, workflow, etc.)
    """

    import yaml

    from pennyfarthing_scripts.common.config import get_project_root

    root = get_project_root()
    registry_path = root / "pennyfarthing-dist" / "command-registry.yaml"

    if not registry_path.is_file():
        click.echo("Command registry not found. Run /pf-health-check.", err=True)
        raise SystemExit(1)

    registry = yaml.safe_load(registry_path.read_text())

    if group is None:
        # Show overview
        click.echo("Pennyfarthing CLI — Command Reference")
        click.echo("=" * 45)
        click.echo("")
        click.echo("Resource Groups:")
        for name, grp in registry.get("groups", {}).items():
            cli_cmd = grp.get("cli", "")
            slash = grp.get("slash", "")
            desc = grp.get("description", "")
            parts = []
            if slash:
                parts.append(slash)
            if cli_cmd:
                parts.append(cli_cmd)
            ref = ", ".join(parts)
            click.echo(f"  {name:<12} {desc:<45} ({ref})")
        click.echo("")
        click.echo("Standalone:")
        for name, cmd in registry.get("standalone", {}).items():
            slash = cmd.get("slash", "")
            desc = cmd.get("description", "")
            click.echo(f"  {name:<12} {desc:<45} ({slash})")
        click.echo("")
        click.echo("Use 'pf help <group>' for detailed commands.")
        return

    # Show specific group
    groups = registry.get("groups", {})
    if group not in groups:
        click.echo(f"Unknown group: {group}", err=True)
        click.echo(f"Available groups: {', '.join(groups.keys())}", err=True)
        raise SystemExit(1)

    grp = groups[group]
    click.echo(f"{group} — {grp.get('description', '')}")
    click.echo("-" * 45)
    if grp.get("cli"):
        click.echo(f"CLI:   {grp['cli']}")
    if grp.get("slash"):
        click.echo(f"Slash: {grp['slash']}")
    if grp.get("skill"):
        click.echo(f"Skill: {grp['skill']}")
    click.echo("")

    commands = grp.get("commands", {})
    if commands:
        click.echo("Commands:")
        for cmd_name, cmd in commands.items():
            args = cmd.get("args", "")
            desc = cmd.get("description", "")
            if args:
                click.echo(f"  {cmd_name} {args:<20} {desc}")
            else:
                click.echo(f"  {cmd_name:<25} {desc}")

    subgroups = grp.get("subgroups", {})
    for sg_name, sg in subgroups.items():
        click.echo(f"\n  {sg_name} — {sg.get('description', '')}")
        for cmd_name, cmd in sg.get("commands", {}).items():
            args = cmd.get("args", "")
            desc = cmd.get("description", "")
            if args:
                click.echo(f"    {cmd_name} {args:<18} {desc}")
            else:
                click.echo(f"    {cmd_name:<23} {desc}")


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
