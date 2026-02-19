"""Handoff CLI — Phase gate resolution, session transitions, and marker generation.

Usage:
    pf handoff resolve-gate STORY_ID WORKFLOW PHASE
    pf handoff complete-phase STORY_ID WORKFLOW FROM_PHASE TO_PHASE GATE_TYPE
    pf handoff marker NEXT_AGENT [--error MESSAGE]
    pf handoff phase-check AGENT

Stories: 105-1, 105-4 (Script-First Handoff), 110-8 (CLI Relay Handoff Fix)
"""

from __future__ import annotations

import click


@click.group()
def handoff():
    """Phase gate resolution and session transitions.

    \b
    Commands:
      resolve-gate    - Resolve gate for current phase
      complete-phase  - Complete phase transition atomically
      marker          - Generate AGENT_COMMAND handoff marker
      phase-check     - Check if agent owns current phase
    """
    pass


@handoff.command("resolve-gate")
@click.argument("story_id")
@click.argument("workflow")
@click.argument("phase")
def resolve_gate_cmd(story_id: str, workflow: str, phase: str):
    """Resolve the gate for the current workflow phase.

    Reads workflow YAML, checks assessment, returns RESOLVE_RESULT.

    \b
    Arguments:
      STORY_ID  - Story identifier (e.g., 105-1)
      WORKFLOW  - Workflow name (e.g., tdd, trivial, patch)
      PHASE     - Current phase name (e.g., green, implement, fix)
    """
    from pf.handoff.resolve_gate import resolve_gate

    result = resolve_gate(story_id, workflow, phase)

    import yaml

    click.echo(yaml.dump({"RESOLVE_RESULT": result}, default_flow_style=False).rstrip())

    if result.get("status") == "blocked":
        raise SystemExit(1)


@handoff.command("complete-phase")
@click.argument("story_id")
@click.argument("workflow")
@click.argument("from_phase")
@click.argument("to_phase")
@click.argument("gate_type")
def complete_phase_cmd(
    story_id: str,
    workflow: str,
    from_phase: str,
    to_phase: str,
    gate_type: str,
):
    """Complete a phase transition with atomic session update.

    Updates session file: phase line, timestamps, history tables.

    \b
    Arguments:
      STORY_ID    - Story identifier (e.g., 105-1)
      WORKFLOW    - Workflow name (e.g., tdd, trivial)
      FROM_PHASE  - Phase being completed (e.g., green)
      TO_PHASE    - Phase being entered (e.g., review)
      GATE_TYPE   - Gate type that was passed (e.g., tests_pass)
    """
    from pf.handoff.complete_phase import complete_phase

    result = complete_phase(story_id, workflow, from_phase, to_phase, gate_type)

    import yaml

    click.echo(yaml.dump({"COMPLETE_RESULT": result}, default_flow_style=False).rstrip())

    if result.get("status") == "error":
        raise SystemExit(1)


@handoff.command("marker")
@click.argument("next_agent", required=False, default=None)
@click.option("--error", "error_msg", default=None, help="Generate error marker")
def marker_cmd(next_agent: str | None, error_msg: str | None):
    """Generate AGENT_COMMAND handoff marker block.

    Environment-aware marker generation. Detects Cyclist, relay mode,
    and context usage to choose the appropriate marker type.

    \b
    Arguments:
      NEXT_AGENT  - Agent to hand off to (e.g., dev, tea, reviewer)

    \b
    Options:
      --error MSG - Generate an error marker instead of a handoff
    """
    from pf.handoff.marker import generate_marker

    if not next_agent and not error_msg:
        raise click.UsageError(
            "Provide NEXT_AGENT or --error MESSAGE.\n\n"
            "Examples:\n"
            "  pf handoff marker dev\n"
            "  pf handoff marker --error 'Tests failing'"
        )

    click.echo(generate_marker(next_agent, error=error_msg))


@handoff.command("phase-check")
@click.argument("agent")
def phase_check_cmd(agent: str):
    """Check if the requested agent owns the current workflow phase.

    Returns a YAML block with action ("start" or "redirect"), the correct
    agent, story ID, phase, and a human-readable message.

    If the agent does not own the phase, generates a handoff marker for
    the correct agent.

    \b
    Arguments:
      AGENT  - Agent to check (e.g., dev, tea, reviewer, sm)
    """
    from pf.handoff.phase_check import phase_check_start

    result = phase_check_start(agent)

    import yaml

    click.echo(yaml.dump({"PHASE_CHECK": result}, default_flow_style=False).rstrip())

    if result["action"] == "redirect":
        click.echo("")
        from pf.handoff.marker import generate_marker

        click.echo(generate_marker(result["agent"]))
