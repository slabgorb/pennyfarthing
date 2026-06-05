"""Handoff CLI — Phase gate resolution, session transitions, and marker generation.

Usage:
    pf handoff resolve-gate [STORY_ID WORKFLOW PHASE]
    pf handoff complete-phase [STORY_ID WORKFLOW FROM_PHASE TO_PHASE GATE_TYPE]
    pf handoff marker [NEXT_AGENT] [--error MESSAGE]
    pf handoff phase-check AGENT

All positional arguments are optional when an active session exists: the
commands infer story/workflow/phase from `.session/{id}-session.md` and the
transition targets from the workflow YAML (SOUL #3, Detect State Don't Demand
Commands), so the bare exit protocol documented in the agent-behavior guide
is literally executable. Explicit arguments override inference.

Stories: 105-1, 105-4 (Script-First Handoff), 110-8 (CLI Relay Handoff Fix),
158-4 (bare-invocation inference)
"""

from __future__ import annotations

import click


def _infer_session_args() -> dict:
    """Resolve story_id/workflow/phase (+ project root) from the active session.

    Returns ``{"ok": True, "story_id", "workflow", "phase", "root"}`` or
    ``{"ok": False, "error": <actionable message>}``.
    """
    import re
    from pathlib import Path

    from pf.prime.workflow import find_active_session, parse_session_header

    try:
        from pf.common.config import get_project_root

        root = get_project_root()
    except FileNotFoundError:
        # No project root markers found — fall back to cwd detection.
        root = Path.cwd()
    except Exception as e:
        # A real config error must surface, not be masked as "no session".
        return {"ok": False, "error": f"Project root detection failed: {e}"}

    try:
        session = find_active_session(root)
        if session is None:
            return {
                "ok": False,
                "error": (
                    "No active session found in `.session/` — cannot infer arguments. "
                    "Pass them explicitly (see --help) or run `/pf-sm` to start a story."
                ),
            }
        header = parse_session_header(session)
    except OSError as e:
        return {"ok": False, "error": f"Cannot read session file: {e}"}

    story_id = header.get("story_id")
    workflow = header.get("workflow")
    phase = header.get("phase")
    if not (story_id and workflow and phase):
        return {
            "ok": False,
            "error": (
                f"Active session `{session.name}` is missing story/workflow/phase "
                "fields — cannot infer arguments. Pass them explicitly (see --help)."
            ),
        }

    # Inferred values come from session file content and are later interpolated
    # into filesystem paths (workflow YAML lookup, session path) — accept only
    # plain identifiers (CWE-22).
    ident = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
    for field, value in (("story", story_id), ("workflow", workflow), ("phase", phase)):
        if not ident.fullmatch(value):
            return {
                "ok": False,
                "error": (
                    f"Inferred {field} value {value!r} from `{session.name}` is "
                    "invalid — not a plain identifier. Fix the session file or "
                    "pass arguments explicitly."
                ),
            }
    return {"ok": True, "story_id": story_id, "workflow": workflow, "phase": phase, "root": root}


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
@click.argument("story_id", required=False, default=None)
@click.argument("workflow", required=False, default=None)
@click.argument("phase", required=False, default=None)
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def resolve_gate_cmd(
    story_id: str | None, workflow: str | None, phase: str | None, output_json: bool
):
    """Resolve the gate for the current workflow phase.

    Reads workflow YAML, checks assessment, returns RESOLVE_RESULT.
    Arguments omitted on the command line are inferred from the active
    session file (story 158-4).

    \b
    Arguments:
      STORY_ID  - Story identifier (e.g., 105-1)
      WORKFLOW  - Workflow name (e.g., tdd, trivial, patch)
      PHASE     - Current phase name (e.g., green, implement, fix)

    \b
    JSON Output (--json):
      {
        "status": "ready" | "blocked" | "skip" | "error",
        "gate_type": string | null,
        "gate_file": string | null,
        "next_agent": string | null,
        "next_phase": string | null,
        "assessment_found": boolean,
        "error": string | null
      }
    """
    from pf.handoff.resolve_gate import resolve_gate

    if not (story_id and workflow and phase):
        inferred = _infer_session_args()
        if not inferred["ok"]:
            click.echo(f"Error: {inferred['error']}")
            raise SystemExit(1)
        story_id = story_id or inferred["story_id"]
        workflow = workflow or inferred["workflow"]
        phase = phase or inferred["phase"]

    result = resolve_gate(story_id, workflow, phase)

    if output_json:
        import json

        click.echo(json.dumps(result, indent=2))
    else:
        import yaml

        click.echo(yaml.dump({"RESOLVE_RESULT": result}, default_flow_style=False).rstrip())

    if result.get("status") in ("blocked", "error"):
        # Fail loud: relay automation treats exit 0 as success (gh #50).
        raise SystemExit(1)


@handoff.command("complete-phase")
@click.argument("story_id", required=False, default=None)
@click.argument("workflow", required=False, default=None)
@click.argument("from_phase", required=False, default=None)
@click.argument("to_phase", required=False, default=None)
@click.argument("gate_type", required=False, default=None)
def complete_phase_cmd(
    story_id: str | None,
    workflow: str | None,
    from_phase: str | None,
    to_phase: str | None,
    gate_type: str | None,
):
    """Complete a phase transition with atomic session update.

    Updates session file: phase line, timestamps, history tables.
    Arguments omitted on the command line are inferred: story/workflow/
    from-phase from the active session, to-phase and gate-type from the
    workflow YAML via resolve-gate (story 158-4).

    \b
    Arguments:
      STORY_ID    - Story identifier (e.g., 105-1)
      WORKFLOW    - Workflow name (e.g., tdd, trivial)
      FROM_PHASE  - Phase being completed (e.g., green)
      TO_PHASE    - Phase being entered (e.g., review)
      GATE_TYPE   - Gate type that was passed (e.g., tests_pass)
    """
    from pf.handoff.complete_phase import complete_phase

    if not (story_id and workflow and from_phase):
        inferred = _infer_session_args()
        if not inferred["ok"]:
            click.echo(f"Error: {inferred['error']}")
            raise SystemExit(1)
        story_id = story_id or inferred["story_id"]
        workflow = workflow or inferred["workflow"]
        from_phase = from_phase or inferred["phase"]

    if not (to_phase and gate_type):
        # The transition targets live in the workflow YAML; resolve-gate
        # already computes them (and enforces the assessment precondition,
        # so inference cannot bypass any guard).
        from pf.handoff.resolve_gate import resolve_gate

        resolved = resolve_gate(story_id, workflow, from_phase)
        if resolved["status"] in ("blocked", "error"):
            click.echo(f"Error: {resolved.get('error')}")
            raise SystemExit(1)
        if not to_phase and not resolved.get("next_phase"):
            click.echo(
                f"Error: Phase '{from_phase}' has no next phase in workflow "
                f"'{workflow}' — pass TO_PHASE explicitly."
            )
            raise SystemExit(1)
        to_phase = to_phase or resolved["next_phase"]
        gate_type = gate_type or resolved.get("gate_type") or "skip"

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
        # Infer the CURRENT phase owner: marker runs AFTER complete-phase, so
        # the session already shows the phase the next agent owns. (This is
        # deliberately NOT `handoff status`'s next_agent, which is the phase
        # AFTER the current one — wrong for this call site.)
        inferred = _infer_session_args()
        if not inferred["ok"]:
            raise click.UsageError(
                f"{inferred['error']}\n\n"
                "Provide NEXT_AGENT or --error MESSAGE. Examples:\n"
                "  pf handoff marker dev\n"
                "  pf handoff marker --error 'Tests failing'"
            )
        # Explicit owner lookup — _get_phase_agent's phase-name fallback would
        # silently emit a non-agent target (e.g. /pf-red) on a failed lookup.
        from pf.handoff.complete_phase import _load_workflow_phases

        phases = _load_workflow_phases(inferred["root"], inferred["workflow"])
        owner = next(
            (p.get("agent") for p in phases if p.get("name") == inferred["phase"]),
            None,
        )
        if not owner:
            raise click.UsageError(
                f"Cannot determine the owner of phase '{inferred['phase']}' in "
                f"workflow '{inferred['workflow']}' — provide NEXT_AGENT explicitly."
            )
        next_agent = owner

    click.echo(generate_marker(next_agent, error=error_msg))


@handoff.command("status")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def status_cmd(output_json: bool):
    """Show current handoff/gate state for the active session.

    \b
    JSON Output (--json):
      {
        "story_id": string | null,
        "phase": string | null,
        "workflow": string | null,
        "gate_type": string | null,
        "next_phase": string | null,
        "next_agent": string | null,
        "status": "active" | "no_session"
      }
    """
    import re

    from pf.common.config import get_project_root

    root = get_project_root()
    session_dir = root / ".session"

    result = {
        "story_id": None,
        "phase": None,
        "workflow": None,
        "gate_type": None,
        "next_phase": None,
        "next_agent": None,
        "status": "no_session",
    }

    if session_dir.is_dir():
        for sf in sorted(session_dir.glob("*-session.md")):
            content = sf.read_text()
            wf_match = re.search(r"\*\*Workflow:\*\*\s*(\S+)", content)
            ph_match = re.search(r"\*\*Phase:\*\*\s*(\S+)", content)
            sid_match = re.search(r"# Story (\S+)", content)

            if wf_match or ph_match:
                result["status"] = "active"
                if wf_match:
                    result["workflow"] = wf_match.group(1)
                if ph_match:
                    result["phase"] = ph_match.group(1)
                if sid_match:
                    result["story_id"] = sid_match.group(1)

                # Resolve gate_type, next_phase, next_agent from workflow YAML
                if result["workflow"] and result["phase"]:
                    try:
                        from pf.workflow.helpers import (
                            find_workflow_file,
                            get_workflows_dir,
                            load_workflow_data,
                        )

                        workflows_dir = get_workflows_dir(root)
                        wf_file = find_workflow_file(workflows_dir, result["workflow"])
                        if wf_file:
                            data = load_workflow_data(wf_file)
                            phases = data.get("workflow", {}).get("phases", [])
                            for i, p in enumerate(phases):
                                if p.get("name") == result["phase"]:
                                    gate = p.get("gate", {})
                                    if isinstance(gate, dict):
                                        result["gate_type"] = gate.get("type")
                                    if i + 1 < len(phases):
                                        result["next_phase"] = phases[i + 1].get("name")
                                        result["next_agent"] = phases[i + 1].get("agent")
                                    break
                    except Exception:
                        pass
                break

    if output_json:
        import json

        click.echo(json.dumps(result, indent=2))
    else:
        if result["status"] == "no_session":
            click.echo("No active session found.")
        else:
            click.echo(f"Story: {result['story_id']}")
            click.echo(f"Phase: {result['phase']}")
            click.echo(f"Workflow: {result['workflow']}")
            if result["gate_type"]:
                click.echo(f"Gate: {result['gate_type']}")
            if result["next_phase"]:
                click.echo(f"Next: {result['next_phase']} ({result['next_agent']})")


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
