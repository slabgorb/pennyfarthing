"""
Pennyfarthing CLI - Command line interface for agent orchestration.

Usage:
    python -m pf.cli [OPTIONS] COMMAND [ARGS]...
    pf [OPTIONS] COMMAND [ARGS]...

This module uses lazy loading to keep startup time under 100ms.
Command groups are imported on demand — only the invoked command's
module is loaded. The LazyGroup class defers all imports until
Click resolves the command name.
"""

from __future__ import annotations

from importlib import import_module

import click

# Get version from package - this is a fast import
from pf import __version__


class LazyGroup(click.Group):
    """A Click group that lazily imports subcommands on first access.

    Each entry in ``lazy_commands`` maps a command name to a tuple of
    (module_path, attribute_name).  The module is only imported when
    the command is actually invoked or listed.
    """

    def __init__(
        self,
        *args,
        lazy_commands: dict[str, tuple[str, str]] | None = None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self._lazy_commands: dict[str, tuple[str, str]] = lazy_commands or {}

    def list_commands(self, ctx: click.Context) -> list[str]:
        base = super().list_commands(ctx)
        lazy = sorted(self._lazy_commands.keys())
        return sorted(set(base + lazy))

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.BaseCommand | None:
        # Check eagerly-registered commands first (inline groups like agent/debug)
        cmd = super().get_command(ctx, cmd_name)
        if cmd is not None:
            return cmd

        # Resolve lazy command
        if cmd_name in self._lazy_commands:
            module_path, attr_name = self._lazy_commands[cmd_name]
            mod = import_module(module_path)
            return getattr(mod, attr_name)

        return None


# ---------------------------------------------------------------------------
# Lazy command registry — maps command name → (module, attribute)
# These modules are only imported when the user invokes the command.
# ---------------------------------------------------------------------------
_LAZY_COMMANDS: dict[str, tuple[str, str]] = {
    "sprint": ("pf.sprint.cli", "sprint"),
    "jira": ("pf.jira.cli", "jira"),
    "context": ("pf.context.cli", "context"),
    "bmad": ("pf.bmad.cli", "bmad"),
    "theme": ("pf.theme.cli", "theme"),
    "validate": ("pf.validate.cli", "validate"),
    "bikerack": ("pf.bikerack.cli", "bikerack"),
    "launch": ("pf.launch.cli", "launch"),
    "bc": ("pf.bc.cli", "bc"),
    "handoff": ("pf.handoff.cli", "handoff"),
    "persona": ("pf.persona.cli", "persona"),
    "git": ("pf.git_group.cli", "git"),
    "session": ("pf.session.cli", "session"),
    "epic": ("pf.epic.cli", "epic"),
    "consultation": ("pf.consultation.cli", "consultation"),
    "hooks": ("pf.hooks.cli", "hooks"),
    "settings": ("pf.settings.cli", "settings"),
    "workflow": ("pf.workflow.cli", "workflow"),
    "release": ("pf.release.cli", "release"),
    "hotspots": ("pf.hotspots.cli", "hotspots"),
    "deadcode": ("pf.deadcode.cli", "deadcode"),
    "healthscore": ("pf.healthscore.cli", "healthscore"),
    "package": ("pf.package.cli", "package"),
    "init": ("pf.init.cli", "init"),
    "setup": ("pf.init.cli", "init"),
    "prime": ("pf.prime.cli", "prime_cmd"),
    "upgrade": ("pf.upgrade.cli", "upgrade"),
    "docs": ("pf.docs.cli", "docs"),
    "doctor": ("pf.doctor.cli", "doctor"),
    "dashboard": ("pf.dashboard.cli", "dashboard"),
    "benchmark": ("pf.benchmark.cli", "benchmark"),
    "tmux": ("pf.tmux.cli", "tmux"),
    "gate": ("pf.gates.cli", "gate"),
}


# ---------------------------------------------------------------------------
# Sugar shortcuts — resolved lazily via get_command override
# ---------------------------------------------------------------------------
_SUGAR_SHORTCUTS: dict[str, tuple[str, str, str]] = {
    # name → (parent_module, parent_attr, sub_command_name)
    "status": ("pf.sprint.cli", "sprint", "status"),
    "backlog": ("pf.sprint.cli", "sprint", "backlog"),
    "work": ("pf.sprint.cli", "sprint", "work"),
    "story": ("pf.sprint.cli", "sprint", "story"),
    "gui": ("pf.launch.cli", "launch", "gui"),
    "tui": ("pf.launch.cli", "launch", "tui"),
}

# Hidden backward-compat aliases — these resolve via _LAZY_COMMANDS
# but are excluded from help output
_HIDDEN_ALIASES: set[str] = {"hotspots", "deadcode", "healthscore", "init", "hooks"}


class PennyfarthingCLI(LazyGroup):
    """Top-level CLI group with sugar shortcuts and hidden aliases."""

    def list_commands(self, ctx: click.Context) -> list[str]:
        cmds = super().list_commands(ctx)
        # Add visible sugar shortcuts, exclude hidden aliases
        cmds.extend(_SUGAR_SHORTCUTS.keys())
        return sorted(c for c in set(cmds) if c not in _HIDDEN_ALIASES)

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.BaseCommand | None:
        # Sugar shortcuts — resolve the sub-command from a lazy parent group
        if cmd_name in _SUGAR_SHORTCUTS:
            module_path, parent_attr, sub_name = _SUGAR_SHORTCUTS[cmd_name]
            mod = import_module(module_path)
            parent = getattr(mod, parent_attr)
            return parent.commands[sub_name]

        # Normal lazy/eager resolution (handles both regular commands
        # and hidden aliases since both are in _LAZY_COMMANDS)
        return super().get_command(ctx, cmd_name)

    def format_commands(self, ctx: click.Context, formatter: click.HelpFormatter) -> None:
        """Override to hide sugar shortcuts from main help listing."""
        commands = []
        for subcommand in self.list_commands(ctx):
            cmd = self.get_command(ctx, subcommand)
            if cmd is None or subcommand in _SUGAR_SHORTCUTS:
                continue
            help_text = cmd.get_short_help_str(limit=150)
            commands.append((subcommand, help_text))

        if commands:
            with formatter.section("Commands"):
                formatter.write_dl(commands)


@click.group(cls=PennyfarthingCLI, lazy_commands=_LAZY_COMMANDS)
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


# ---------------------------------------------------------------------------
# Eagerly-defined groups (no heavy imports, just Click decorators)
# ---------------------------------------------------------------------------

_DEBUG_COMMANDS: dict[str, tuple[str, str]] = {
    "hotspots": ("pf.hotspots.cli", "hotspots"),
    "deadcode": ("pf.deadcode.cli", "deadcode"),
    "healthscore": ("pf.healthscore.cli", "healthscore"),
}


@cli.group(cls=LazyGroup, lazy_commands=_DEBUG_COMMANDS)
def debug():
    """Debug and analysis tools.

    \b
    Subcommands:
      hotspots     - Git history hotspot detection
      deadcode     - Dead code detection tools
      healthscore  - Composite codebase health score
    """
    pass


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
@click.option("--greeting", is_flag=True, help="Emit agent greeting to stderr")
@click.option(
    "--tier",
    type=click.Choice(["full", "refresh", "handoff", "minimal"], case_sensitive=False),
    help="Context tier level",
)
def agent_start(
    name: str,
    session_id: str | None,
    no_persona: bool,
    output_json: bool,
    minimal: bool,
    full: bool,
    quiet: bool,
    greeting: bool,
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
    from pf.prime import prime

    exit_code = prime(
        agent_name=name,
        session_id=session_id,
        no_persona=no_persona,
        json_output=output_json,
        minimal=minimal,
        full=full,
        quiet=quiet,
        greeting=greeting,
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
    from pf.prime.heatmap import run_heatmap

    exit_code = run_heatmap(
        agent_name=name,
        show_all=show_all,
        csv_output=csv_output,
        json_output=json_output,
    )
    raise SystemExit(exit_code)


@cli.command("help")
@click.argument("group", required=False)
def help_cmd(group: str | None):
    """Context-aware help for Pennyfarthing commands.

    \b
    Arguments:
      GROUP  - Optional command group name (sprint, git, session, epic, jira, theme, workflow, etc.)
    """

    import yaml

    from pf.common.config import get_dist_root, get_project_root

    root = get_project_root()
    dist_root = get_dist_root(project_root=root)
    if dist_root is None:
        click.echo("Command registry not found. Run /pf-health-check.", err=True)
        raise SystemExit(1)

    registry_path = dist_root / "command-registry.yaml"

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
