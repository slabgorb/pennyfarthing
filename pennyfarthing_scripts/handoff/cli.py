"""Handoff CLI — Phase gate resolution and atomic session transitions.

Usage:
    pf handoff resolve-gate STORY_ID WORKFLOW PHASE
    pf handoff complete-phase STORY_ID WORKFLOW FROM_PHASE TO_PHASE GATE_TYPE

Story: 105-1 (Script-First Handoff)
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
    from pennyfarthing_scripts.handoff.resolve_gate import resolve_gate

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
    from pennyfarthing_scripts.handoff.complete_phase import complete_phase

    result = complete_phase(story_id, workflow, from_phase, to_phase, gate_type)

    import yaml

    click.echo(yaml.dump({"COMPLETE_RESULT": result}, default_flow_style=False).rstrip())

    if result.get("status") == "error":
        raise SystemExit(1)
