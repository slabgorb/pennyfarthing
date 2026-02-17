"""Workflow CLI — phase management, stepped workflow control, and state queries.

Usage:
    pf workflow check [--json]
    pf workflow phase-check WORKFLOW PHASE
    pf workflow handoff NEXT_AGENT
    pf workflow type WORKFLOW
    pf workflow list
    pf workflow show [NAME]
    pf workflow start NAME [--mode MODE]
    pf workflow resume [NAME]
    pf workflow status [NAME]
    pf workflow fix-phase STORY_ID PHASE [--dry-run]
    pf workflow complete-step [NAME] [--step N]
"""

from __future__ import annotations

from datetime import UTC

import click


@click.group()
def workflow():
    """Workflow state and phase management.

    \b
    Commands:
      check          - Check current workflow state
      phase-check    - Verify phase ownership
      handoff        - Emit handoff marker
      type           - Get workflow type (phased/stepped/procedural)
      list           - List all available workflows
      show           - Show workflow details
      start          - Start a stepped workflow
      resume         - Resume an interrupted workflow
      status         - Show stepped workflow progress
      fix-phase      - Repair session phase tracking
      complete-step  - Complete current step in stepped workflow
    """
    pass


# ---------------------------------------------------------------------------
# Existing commands (migrated from inline cli.py)
# ---------------------------------------------------------------------------


@workflow.command("check")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def workflow_check(output_json: bool):
    """Check current workflow state.

    Returns the current story ID, phase, and workflow state.
    """
    from pennyfarthing_scripts.workflow.state import get_workflow_state

    state = get_workflow_state()

    if output_json:
        import json

        click.echo(json.dumps(state, indent=2))
    else:
        click.echo(f"State: {state.get('state', 'unknown')}")
        if state.get("story_id"):
            click.echo(f"Story: {state['story_id']}")
        if state.get("workflow"):
            click.echo(f"Workflow: {state['workflow']}")
        if state.get("phase"):
            click.echo(f"Phase: {state['phase']}")


@workflow.command("phase-check")
@click.argument("workflow_name")
@click.argument("phase")
def workflow_phase_check(workflow_name: str, phase: str):
    """Check which agent owns a workflow phase.

    \b
    Arguments:
      WORKFLOW_NAME  - The workflow type (tdd, trivial, etc.)
      PHASE          - The phase to check (red, implement, review, etc.)
    """
    from pennyfarthing_scripts.workflow.state import get_phase_owner

    owner = get_phase_owner(workflow_name, phase)
    click.echo(owner)


@workflow.command("handoff")
@click.argument("next_agent")
def workflow_handoff(next_agent: str):
    """Emit an environment-aware handoff marker.

    Delegates to generate_marker() which detects Cyclist, relay mode,
    and context usage to choose the appropriate marker type.

    \b
    Arguments:
      NEXT_AGENT  - The agent to hand off to (tea, dev, reviewer, etc.)
    """
    from pennyfarthing_scripts.handoff.marker import generate_marker

    click.echo(generate_marker(next_agent))


# ---------------------------------------------------------------------------
# New commands (migrated from bash scripts)
# ---------------------------------------------------------------------------


@workflow.command("type")
@click.argument("workflow_name")
def workflow_type_cmd(workflow_name: str):
    """Get workflow type (phased, stepped, or procedural).

    \b
    Arguments:
      WORKFLOW_NAME  - Workflow name (e.g., tdd, architecture)
    """
    from pennyfarthing_scripts.workflow.helpers import (
        find_workflow_file,
        get_workflow_type,
        get_workflows_dir,
        load_workflow_data,
    )

    workflows_dir = get_workflows_dir()
    wf_file = find_workflow_file(workflows_dir, workflow_name)
    if not wf_file:
        click.echo(f"Error: Workflow '{workflow_name}' not found", err=True)
        raise SystemExit(1)

    data = load_workflow_data(wf_file)
    click.echo(get_workflow_type(data))


@workflow.command("list")
def workflow_list_cmd():
    """List all available workflows.

    Shows a markdown table with type, phases/steps, modes, and descriptions.
    """

    from pennyfarthing_scripts.workflow.helpers import (
        count_steps,
        get_workflows_dir,
        load_workflow_data,
        resolve_steps_path,
    )

    workflows_dir = get_workflows_dir()

    if not workflows_dir.is_dir():
        click.echo(f"Error: Workflows directory not found at {workflows_dir}", err=True)
        raise SystemExit(1)

    # Collect workflow files: top-level *.yaml and nested workflow.yaml
    workflow_files = sorted(workflows_dir.glob("*.yaml"))
    for subdir in sorted(workflows_dir.iterdir()):
        if subdir.is_dir():
            nested = subdir / "workflow.yaml"
            if nested.exists():
                workflow_files.append(nested)

    if not workflow_files:
        click.echo("No workflows found.")
        return

    click.echo("# Available Workflows")
    click.echo("")
    click.echo("| Workflow | Type | Default | Steps/Phases | Modes | Description |")
    click.echo("|----------|------|---------|--------------|-------|-------------|")

    from pennyfarthing_scripts.common.config import get_project_root

    project_root = get_project_root()

    for wf_file in workflow_files:
        data = load_workflow_data(wf_file)
        wf = data.get("workflow", {})

        name = wf.get("name", wf_file.stem)
        desc = (wf.get("description") or "-")
        if isinstance(desc, str):
            desc = desc.split("\n")[0][:80]
        is_default = wf.get("triggers", {}).get("default", False)

        # Detect type
        wf_type_raw = wf.get("type", "phased")
        has_steps = wf.get("steps") is not None

        if has_steps or wf_type_raw == "stepped":
            type_col = "stepped"
            try:
                steps_path = resolve_steps_path(data, wf_file.parent, None, project_root)
                step_count = count_steps(steps_path)
                steps_col = f"{step_count} steps" if step_count > 0 else "-"
            except Exception:
                steps_col = "-"
        elif wf_type_raw == "procedural":
            type_col = "procedural"
            steps_col = "instructions"
        else:
            type_col = "phased"
            phases = wf.get("phases", [])
            steps_col = f"{len(phases)} phases"

        default_col = "yes" if is_default else "no"

        # Modes
        modes_available = wf.get("modes", {}).get("available", [])
        if modes_available:
            modes_col = ",".join(modes_available)
        else:
            modes_col = "-"

        click.echo(f"| {name} | {type_col} | {default_col} | {steps_col} | {modes_col} | {desc} |")

    click.echo("")
    click.echo("**Legend:**")
    click.echo("- **phased**: Agent-driven workflow (SM > TEA > Dev > Reviewer)")
    click.echo("- **stepped**: Step-by-step guided workflow with progressive disclosure")
    click.echo("- **procedural**: BMAD reference workflow with instructions file")
    click.echo("")
    click.echo("Use `pf workflow show <name>` for workflow details.")


@workflow.command("show")
@click.argument("name", required=False, default=None)
def workflow_show_cmd(name: str | None):
    """Show workflow details including phase flow, triggers, and gates.

    \b
    Arguments:
      NAME  - Workflow name (defaults to current session's workflow or tdd)
    """
    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.workflow.helpers import (
        find_workflow_file,
        get_session_dir,
        get_workflows_dir,
        load_workflow_data,
    )

    project_root = get_project_root()
    workflows_dir = get_workflows_dir(project_root)
    session_dir = get_session_dir(project_root)

    workflow_name = name

    if not workflow_name:
        # Try to detect from current session
        if session_dir.is_dir():
            for sf in session_dir.glob("*-session.md"):
                content = sf.read_text()
                import re

                match = re.search(r"\*\*Workflow:\*\*\s*(\S+)", content)
                if match:
                    workflow_name = match.group(1)
                    break

        if not workflow_name:
            click.echo("# Current Workflow")
            click.echo("")
            click.echo("No active session found. Showing default workflow (tdd).")
            click.echo("")
            workflow_name = "tdd"
        else:
            click.echo(f"# Current Session Workflow: {workflow_name}")
            click.echo("")
    else:
        click.echo(f"# Workflow: {workflow_name}")
        click.echo("")

    wf_file = find_workflow_file(workflows_dir, workflow_name)
    if not wf_file:
        click.echo(f"Error: Workflow '{workflow_name}' not found", err=True)
        click.echo("", err=True)
        click.echo("Available workflows:", err=True)
        for f in sorted(workflows_dir.glob("*.yaml")):
            click.echo(f"  {f.stem}", err=True)
        raise SystemExit(1)

    data = load_workflow_data(wf_file)
    wf = data.get("workflow", {})

    desc = wf.get("description", "-")
    version = wf.get("version", "-")

    click.echo(f"**Description:** {desc}")
    click.echo(f"**Version:** {version}")
    click.echo("")

    # Phase flow diagram
    phases = wf.get("phases", [])
    if phases:
        click.echo("## Phase Flow")
        click.echo("")
        phase_names = [p.get("name", "?") for p in phases]
        click.echo("```")
        click.echo(" -> ".join(phase_names))
        click.echo("```")
        click.echo("")

        # Phases table
        click.echo("## Phases")
        click.echo("")
        click.echo("| Phase | Agent | Gate |")
        click.echo("|-------|-------|------|")
        for p in phases:
            pname = p.get("name", "?")
            pagent = p.get("agent", "?")
            pgate = p.get("gate", {}).get("type", "none") if isinstance(p.get("gate"), dict) else "none"
            click.echo(f"| {pname} | {pagent} | {pgate} |")
        click.echo("")

    # Triggers
    triggers = wf.get("triggers", {})
    if triggers:
        click.echo("## Triggers")
        click.echo("")

        types = triggers.get("types", [])
        if types:
            click.echo(f"**Types:** {', '.join(types)}")

        points = triggers.get("points", {})
        if points.get("min") is not None:
            click.echo(f"**Points Min:** {points['min']}")
        if points.get("max") is not None:
            click.echo(f"**Points Max:** {points['max']}")

        if triggers.get("default"):
            click.echo("**Default:** yes (used when no other workflow matches)")

        tags = triggers.get("tags", [])
        if tags:
            click.echo(f"**Tags:** {', '.join(tags)}")


@workflow.command("start")
@click.argument("name")
@click.option("--mode", "-m", default=None, help="Mode: create, validate, or edit")
def workflow_start_cmd(name: str, mode: str | None):
    """Start a stepped workflow from step 1.

    Creates a new workflow session and loads the first step.

    \b
    Arguments:
      NAME  - Workflow name (e.g., architecture, release)
    """
    from datetime import datetime

    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.workflow.helpers import (
        count_steps,
        find_step_file,
        find_workflow_file,
        get_session_dir,
        get_workflows_dir,
        load_workflow_data,
        resolve_steps_path,
        strip_frontmatter,
    )

    project_root = get_project_root()
    workflows_dir = get_workflows_dir(project_root)
    session_dir = get_session_dir(project_root)

    # Find workflow file
    wf_file = find_workflow_file(workflows_dir, name)
    if not wf_file:
        click.echo(f"Error: Workflow '{name}' not found", err=True)
        raise SystemExit(1)

    data = load_workflow_data(wf_file)
    wf = data.get("workflow", {})

    # Validate it's a stepped workflow
    wf_type = wf.get("type", "phased")
    has_steps = wf.get("steps") is not None
    if wf_type != "stepped" and not has_steps:
        click.echo(f"Error: '{name}' is a phased workflow, not stepped", err=True)
        click.echo("Use TDD workflow commands (/sm, /tea, /dev, /reviewer) for phased workflows", err=True)
        raise SystemExit(1)

    # Validate mode
    if mode:
        valid_modes = {"create", "validate", "edit"}
        if mode not in valid_modes:
            click.echo(f"Error: Invalid mode '{mode}'. Must be one of: {', '.join(sorted(valid_modes))}", err=True)
            raise SystemExit(1)

    # Resolve mode
    effective_mode = mode
    if not effective_mode:
        default_mode = wf.get("modes", {}).get("default")
        if default_mode:
            effective_mode = default_mode
        else:
            effective_mode = "create"

    # If explicit mode, validate it exists for this workflow
    if mode:
        modes = wf.get("modes", {})
        mode_path = modes.get(mode)
        if not mode_path or mode_path == "null":
            available = [k for k in modes if k not in ("default", "available")]
            click.echo(f"Error: Mode '{mode}' not available for workflow '{name}'", err=True)
            if available:
                click.echo(f"Available modes: {', '.join(available)}", err=True)
            raise SystemExit(1)

    # Resolve steps path
    steps_path = resolve_steps_path(data, wf_file.parent, effective_mode, project_root)
    step_count = count_steps(steps_path)

    if step_count == 0:
        click.echo(f"Error: No step files found in {steps_path}", err=True)
        raise SystemExit(1)

    # Create session directory
    session_dir.mkdir(parents=True, exist_ok=True)

    # Check for existing session
    session_file = session_dir / f"{name}-workflow-session.md"
    if session_file.exists():
        click.echo("**Warning:** Existing session found")
        click.echo("")
        click.echo(f"Session: {session_file}")
        click.echo("")
        click.echo("Options:")
        click.echo(f"1. Use `pf workflow resume {name}` to continue")
        click.echo("2. Delete the session file to start fresh")
        click.echo("")
        click.echo("To start fresh, run:")
        click.echo("```bash")
        click.echo(f'rm "{session_file}"')
        click.echo("```")
        return

    # Create session file
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    wf_agent = wf.get("agent", "pm")
    wf_desc = wf.get("description", "-")

    session_content = f"""# Workflow Session: {name}

**Workflow:** {name}
**Type:** stepped
**Agent:** {wf_agent}
**Started:** {now}

## Workflow State
- **Workflow Name:** {name}
- **Type:** stepped
- **Mode:** {effective_mode}
- **Started:** {now}
- **Last Updated:** {now}
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
- **Notes:** Session created via pf workflow start

## Progress
- Total Steps: {step_count}
- Completion: 0%

---

"""
    session_file.write_text(session_content)

    # Find step 1
    step_file = find_step_file(steps_path, 1)
    if not step_file:
        click.echo(f"Error: Could not find step 1 file in {steps_path}", err=True)
        raise SystemExit(1)

    # Output
    click.echo(f"# Starting Workflow: {name}")
    click.echo("")
    click.echo(f"**Description:** {wf_desc}")
    click.echo(f"**Mode:** {effective_mode}")
    click.echo(f"**Steps:** {step_count}")
    click.echo(f"**Agent:** {wf_agent}")
    click.echo(f"**Session:** {session_file}")
    click.echo("")
    click.echo("---")
    click.echo("")
    click.echo(f"## Step 1 of {step_count}")
    click.echo("")

    step_content = step_file.read_text()
    click.echo(strip_frontmatter(step_content))

    click.echo("")
    click.echo("---")
    click.echo("")
    click.echo("**Controls:**")
    click.echo("- `C` - Continue to next step")
    click.echo("- `pf workflow status` - Check progress")
    click.echo("- `pf workflow resume` - Resume after break")


@workflow.command("resume")
@click.argument("name", required=False, default=None)
def workflow_resume_cmd(name: str | None):
    """Resume a stepped workflow from the current step.

    \b
    Arguments:
      NAME  - Workflow name (auto-detects from active session if omitted)
    """
    from datetime import datetime

    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.workflow.helpers import (
        count_steps,
        find_step_file,
        find_workflow_file,
        find_workflow_session,
        get_session_dir,
        get_workflows_dir,
        load_workflow_data,
        parse_session_field,
        parse_steps_completed,
        resolve_steps_path,
        strip_frontmatter,
    )

    project_root = get_project_root()
    workflows_dir = get_workflows_dir(project_root)
    session_dir = get_session_dir(project_root)

    if not session_dir.is_dir():
        click.echo("# Resume Stepped Workflow")
        click.echo("")
        click.echo("No active workflow session found.")
        click.echo("")
        click.echo("Use `pf workflow start <name>` to begin a new workflow.")
        raise SystemExit(1)

    result = find_workflow_session(session_dir, name)
    if not result:
        if name:
            click.echo(f"Error: No session found for workflow '{name}'", err=True)
            click.echo(f"\nUse `pf workflow start {name}` to begin.", err=True)
        else:
            click.echo("# Resume Stepped Workflow")
            click.echo("")
            click.echo("No active workflow session found.")
            click.echo("")
            click.echo("Use `pf workflow start <name>` to begin a new workflow.")
        raise SystemExit(1)

    session_file, workflow_name = result
    content = session_file.read_text()

    # Parse session state
    current_step_str = parse_session_field(content, "Current Step") or "1"
    current_step = int(current_step_str)
    mode_val = parse_session_field(content, "Mode") or "create"
    status = parse_session_field(content, "Status") or "in_progress"
    steps_completed_str = parse_session_field(content, "Steps Completed") or "[]"

    # Check if complete
    if status == "completed":
        click.echo(f"# Workflow Complete: {workflow_name}")
        click.echo("")
        click.echo("This workflow has already been completed.")
        click.echo("")
        click.echo("To start a new session, delete the session file:")
        click.echo("```bash")
        click.echo(f'rm "{session_file}"')
        click.echo("```")
        click.echo("")
        click.echo(f"Then run `pf workflow start {workflow_name}`")
        return

    # Find workflow definition
    wf_file = find_workflow_file(workflows_dir, workflow_name)
    if not wf_file:
        click.echo(f"Error: Workflow definition '{workflow_name}' not found", err=True)
        raise SystemExit(1)

    data = load_workflow_data(wf_file)

    # Resolve steps path
    steps_path = resolve_steps_path(data, wf_file.parent, mode_val, project_root)
    step_count = count_steps(steps_path)

    # Find current step file
    step_file = find_step_file(steps_path, current_step)
    if not step_file:
        click.echo(f"Error: Could not find step {current_step} file in {steps_path}", err=True)
        raise SystemExit(1)

    # Update last updated timestamp
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    import re

    updated_content = re.sub(
        r"^- \*\*Last Updated:\*\*.*$",
        f"- **Last Updated:** {now}",
        content, flags=re.MULTILINE
    )
    session_file.write_text(updated_content)

    # Calculate completion
    steps_completed = parse_steps_completed(steps_completed_str)
    completed_count = len(steps_completed)
    completion_pct = (completed_count * 100 // step_count) if step_count > 0 else 0

    # Output
    click.echo(f"# Resuming Workflow: {workflow_name}")
    click.echo("")
    click.echo(f"**Mode:** {mode_val}")
    click.echo(f"**Progress:** Step {current_step} of {step_count} ({completion_pct}% complete)")
    click.echo(f"**Steps Completed:** {steps_completed_str}")
    click.echo(f"**Session:** {session_file}")
    click.echo("")
    click.echo("---")
    click.echo("")
    click.echo(f"## Step {current_step} of {step_count}")
    click.echo("")

    step_content = step_file.read_text()
    click.echo(strip_frontmatter(step_content))

    click.echo("")
    click.echo("---")
    click.echo("")
    click.echo("**Controls:**")
    click.echo("- `C` - Continue to next step")
    click.echo("- `pf workflow status` - Check progress")


@workflow.command("status")
@click.argument("name", required=False, default=None)
def workflow_status_cmd(name: str | None):
    """Show current stepped workflow progress.

    \b
    Arguments:
      NAME  - Workflow name (auto-detects from active session if omitted)
    """
    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.workflow.helpers import (
        count_steps,
        find_workflow_file,
        find_workflow_session,
        get_session_dir,
        get_workflows_dir,
        load_workflow_data,
        parse_session_field,
        parse_steps_completed,
        resolve_steps_path,
    )

    project_root = get_project_root()
    workflows_dir = get_workflows_dir(project_root)
    session_dir = get_session_dir(project_root)

    if not session_dir.is_dir():
        click.echo("# Workflow Status")
        click.echo("")
        click.echo("No active workflow session found.")
        click.echo("")
        click.echo("Use `pf workflow start <name>` to begin a new workflow.")
        return

    result = find_workflow_session(session_dir, name)
    if not result:
        if name:
            click.echo(f"# Workflow Status: {name}")
            click.echo("")
            click.echo(f"No session found for workflow '{name}'")
            click.echo("")
            click.echo(f"Use `pf workflow start {name}` to begin.")
        else:
            click.echo("# Workflow Status")
            click.echo("")
            click.echo("No active workflow session found.")
            click.echo("")
            click.echo("Use `pf workflow start <name>` to begin a new workflow.")
        return

    session_file, workflow_name = result
    content = session_file.read_text()

    # Parse session state
    current_step_str = parse_session_field(content, "Current Step") or "1"
    current_step = int(current_step_str)
    mode_val = parse_session_field(content, "Mode") or "create"
    status = parse_session_field(content, "Status") or "in_progress"
    started = parse_session_field(content, "Started") or "-"
    last_updated = parse_session_field(content, "Last Updated") or "-"
    steps_completed_str = parse_session_field(content, "Steps Completed") or "[]"
    notes = parse_session_field(content, "Notes") or "-"

    # Get step count from workflow file
    step_count_str = "?"
    wf_desc = "-"
    wf_file = find_workflow_file(workflows_dir, workflow_name)
    if wf_file:
        data = load_workflow_data(wf_file)
        wf_desc = data.get("workflow", {}).get("description", "-")
        if isinstance(wf_desc, str):
            wf_desc = wf_desc.split("\n")[0]
        try:
            steps_path = resolve_steps_path(data, wf_file.parent, mode_val, project_root)
            step_count = count_steps(steps_path)
            step_count_str = str(step_count)
        except Exception:
            step_count = 0
    else:
        step_count = 0

    # Calculate completion
    steps_completed = parse_steps_completed(steps_completed_str)
    completed_count = len(steps_completed)
    if step_count > 0:
        completion_pct = completed_count * 100 // step_count
    else:
        completion_pct = 0

    # Progress bar
    bar_width = 20
    if step_count > 0:
        filled = completion_pct * bar_width // 100
        empty = bar_width - filled
        progress_bar = "#" * filled + "-" * empty
    else:
        progress_bar = "?" * bar_width

    # Status indicator
    status_icons = {
        "completed": "[COMPLETE]",
        "paused": "[PAUSED]",
    }
    status_icon = status_icons.get(status, "[IN PROGRESS]")

    # Output
    click.echo(f"# Workflow Status: {workflow_name}")
    click.echo("")
    click.echo(f"**Description:** {wf_desc}")
    click.echo("")
    click.echo("## Progress")
    click.echo("")
    click.echo("```")
    click.echo(f"[{progress_bar}] {completion_pct}%")
    click.echo("```")
    click.echo("")
    click.echo("| Field | Value |")
    click.echo("|-------|-------|")
    click.echo(f"| Status | {status_icon} |")
    click.echo(f"| Mode | {mode_val} |")
    click.echo(f"| Current Step | {current_step} of {step_count_str} |")
    click.echo(f"| Completed | {completed_count} steps |")
    click.echo(f"| Steps Done | {steps_completed_str} |")
    click.echo(f"| Started | {started} |")
    click.echo(f"| Last Updated | {last_updated} |")
    if notes != "-":
        click.echo(f"| Notes | {notes} |")
    click.echo("")
    click.echo(f"**Session:** {session_file}")
    click.echo("")

    if status != "completed":
        click.echo(f"**Next:** Use `pf workflow resume` to continue from step {current_step}")


@workflow.command("fix-phase")
@click.argument("story_id")
@click.argument("target_phase")
@click.option("--dry-run", is_flag=True, help="Preview without making changes")
def workflow_fix_phase_cmd(story_id: str, target_phase: str, dry_run: bool):
    """Repair session phase tracking when handoffs didn't update properly.

    \b
    Arguments:
      STORY_ID      - Story ID (e.g., 56-1 or MSSCI-12190)
      TARGET_PHASE  - Target phase to set (e.g., review, approved, finish)
    """
    import re
    from datetime import datetime

    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.workflow.helpers import (
        find_story_session,
        get_session_dir,
    )

    project_root = get_project_root()
    session_dir = get_session_dir(project_root)

    if not session_dir.is_dir():
        click.echo(f"Error: Session directory not found at {session_dir}", err=True)
        raise SystemExit(1)

    session_file = find_story_session(session_dir, story_id)
    if not session_file:
        click.echo(f"Error: Session file not found for story {story_id}", err=True)
        click.echo(f"Searched in: {session_dir}", err=True)
        raise SystemExit(1)

    click.echo(f"Session file: {session_file}")

    content = session_file.read_text()

    # Extract current state
    current_phase_match = re.search(r"\*\*Phase:\*\*\s*(\S+)", content)
    current_phase = current_phase_match.group(1) if current_phase_match else "unknown"

    workflow_match = re.search(r"\*\*Workflow:\*\*\s*(\S+)", content)
    workflow_name = workflow_match.group(1) if workflow_match else "tdd"

    click.echo(f"Current phase: {current_phase}")
    click.echo(f"Target phase: {target_phase}")
    click.echo(f"Workflow: {workflow_name}")

    # Define valid phase sequences
    phase_defs: dict[str, tuple[list[str], list[str], list[str]]] = {
        "tdd": (
            ["setup", "red", "green", "review", "approved", "finish"],
            ["sm", "tea", "dev", "reviewer", "sm", "sm"],
            ["manual", "tests_fail", "tests_pass", "approval", "complete", ""],
        ),
        "trivial": (
            ["setup", "implement", "review", "approved", "finish"],
            ["sm", "dev", "reviewer", "sm", "sm"],
            ["manual", "tests_pass", "approval", "complete", ""],
        ),
    }

    phases, agents, gates = phase_defs.get(
        workflow_name,
        phase_defs["tdd"],  # Default to TDD
    )

    if workflow_name not in phase_defs:
        click.echo(f"Warning: Unknown workflow '{workflow_name}', assuming TDD")

    # Find indices
    try:
        current_idx = phases.index(current_phase)
    except ValueError as err:
        click.echo(f"Error: Current phase '{current_phase}' not found in {workflow_name} workflow", err=True)
        click.echo(f"Valid phases: {', '.join(phases)}", err=True)
        raise SystemExit(1) from err

    try:
        target_idx = phases.index(target_phase)
    except ValueError as err:
        click.echo(f"Error: Target phase '{target_phase}' not found in {workflow_name} workflow", err=True)
        click.echo(f"Valid phases: {', '.join(phases)}", err=True)
        raise SystemExit(1) from err

    if target_idx <= current_idx:
        click.echo(f"Error: Target phase '{target_phase}' is not ahead of current phase '{current_phase}'", err=True)
        click.echo(f"Phase sequence: {', '.join(phases)}", err=True)
        raise SystemExit(1)

    # Calculate transitions
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    click.echo("")
    click.echo("Transitions needed:")

    transitions: list[tuple[str, str, str, str, str]] = []
    for i in range(current_idx, target_idx):
        from_phase = phases[i]
        to_phase = phases[i + 1]
        from_agent = agents[i]
        to_agent = agents[i + 1]
        gate = gates[i + 1]
        click.echo(f"  {from_phase} ({from_agent}) -> {to_phase} ({to_agent}) [gate: {gate}]")
        transitions.append((from_phase, to_phase, from_agent, to_agent, gate))

    if dry_run:
        click.echo("")
        click.echo("[DRY RUN] Would update session file with:")
        click.echo(f"  - **Phase:** {target_phase}")
        click.echo(f"  - **Phase Started:** {now}")
        click.echo(f"  - Phase History: close out {current_phase}, add intermediate phases")
        click.echo(f"  - Handoff History: add {len(transitions)} handoff(s)")
        return

    click.echo("")
    click.echo("Updating session file...")

    # Update Phase line
    content = re.sub(
        r"\*\*Phase:\*\*\s*\S+",
        f"**Phase:** {target_phase}",
        content,
    )

    # Update Phase Started line
    content = re.sub(
        r"\*\*Phase Started:\*\*\s*\S+",
        f"**Phase Started:** {now}",
        content,
    )

    # Build handoff history additions
    handoff_lines = []
    for _from_phase, _to_phase, from_agent, to_agent, gate in transitions:
        handoff_lines.append(f"| {from_agent} | {to_agent} | {gate} | PASSED | {now} |")

    # Insert handoff rows after the last PASSED/FAILED row
    if handoff_lines:
        lines = content.split("\n")
        insert_idx = None
        for i, line in enumerate(lines):
            if ("PASSED" in line or "FAILED" in line) and line.strip().startswith("|"):
                insert_idx = i

        if insert_idx is not None:
            for j, hl in enumerate(handoff_lines):
                lines.insert(insert_idx + 1 + j, hl)
            content = "\n".join(lines)

    session_file.write_text(content)

    click.echo("")
    click.echo("Session file updated")
    click.echo(f"  Phase: {current_phase} -> {target_phase}")
    click.echo(f"  Handoffs added: {len(transitions)}")
    click.echo("")
    click.echo("Note: Phase History end times set to now. Review and adjust if needed.")


@workflow.command("complete-step")
@click.argument("name", required=False, default=None)
@click.option("--step", "step_override", type=int, default=None,
              help="Complete a specific step number instead of current step")
def workflow_complete_step_cmd(name: str | None, step_override: int | None):
    """Complete the current step of a stepped workflow.

    Advances session state: increments current step, updates steps completed,
    recalculates completion percentage. Marks workflow as completed when
    all steps are done.

    \b
    Arguments:
      NAME  - Workflow name (auto-detects from session if omitted)
    """
    import re
    from datetime import datetime

    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.workflow.helpers import (
        count_steps,
        find_step_file,
        find_workflow_file,
        find_workflow_session,
        format_steps_completed,
        get_session_dir,
        get_workflows_dir,
        load_workflow_data,
        parse_session_field,
        parse_steps_completed,
        resolve_steps_path,
        strip_frontmatter,
    )

    project_root = get_project_root()
    workflows_dir = get_workflows_dir(project_root)
    session_dir = get_session_dir(project_root)

    if not session_dir.is_dir():
        click.echo("Error: No active workflow session found.", err=True)
        raise SystemExit(1)

    result = find_workflow_session(session_dir, name)
    if not result:
        if name:
            click.echo(f"Error: No session found for workflow '{name}'", err=True)
            click.echo(f"\nUse `pf workflow start {name}` to begin.", err=True)
        else:
            click.echo("Error: No active workflow session found.", err=True)
        raise SystemExit(1)

    session_file, workflow_name = result
    content = session_file.read_text()

    # Parse session state
    current_step_str = parse_session_field(content, "Current Step") or "1"
    current_step = int(current_step_str)
    mode_val = parse_session_field(content, "Mode") or "create"
    status = parse_session_field(content, "Status") or "in_progress"
    steps_completed_str = parse_session_field(content, "Steps Completed") or "[]"

    # Check if already completed
    if status == "completed":
        click.echo(f"# Workflow Already Completed: {workflow_name}")
        click.echo("")
        click.echo("This workflow has already been completed.")
        click.echo("")
        click.echo("To start a new session, delete the session file:")
        click.echo("```bash")
        click.echo(f'rm "{session_file}"')
        click.echo("```")
        click.echo("")
        click.echo(f"Then run `pf workflow start {workflow_name}`")
        return

    # Determine which step to complete
    completing_step = step_override if step_override is not None else current_step

    # Find workflow file and resolve steps path
    wf_file = find_workflow_file(workflows_dir, workflow_name)
    if not wf_file:
        click.echo(f"Error: Workflow definition '{workflow_name}' not found", err=True)
        raise SystemExit(1)

    data = load_workflow_data(wf_file)
    steps_path = resolve_steps_path(data, wf_file.parent, mode_val, project_root)
    step_count = count_steps(steps_path)

    # Update steps completed
    steps_completed = parse_steps_completed(steps_completed_str)
    if completing_step not in steps_completed:
        steps_completed.append(completing_step)
    new_steps_completed = format_steps_completed(steps_completed)

    # Calculate
    next_step = completing_step + 1
    completed_count = len(steps_completed)
    completion_pct = (completed_count * 100 // step_count) if step_count > 0 else 0
    new_status = "completed" if completed_count >= step_count else "in_progress"

    # Update session file
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    content = re.sub(
        r"^- \*\*Current Step:\*\*.*$",
        f"- **Current Step:** {next_step}",
        content, flags=re.MULTILINE
    )
    content = re.sub(
        r"^- \*\*Steps Completed:\*\*.*$",
        f"- **Steps Completed:** {new_steps_completed}",
        content, flags=re.MULTILINE
    )
    content = re.sub(
        r"^- \*\*Last Updated:\*\*.*$",
        f"- **Last Updated:** {now}",
        content, flags=re.MULTILINE
    )
    content = re.sub(
        r"^- \*\*Status:\*\*.*$",
        f"- **Status:** {new_status}",
        content, flags=re.MULTILINE
    )
    content = re.sub(
        r"^- Completion:.*$",
        f"- Completion: {completion_pct}%",
        content, flags=re.MULTILINE
    )

    session_file.write_text(content)

    # Output
    if new_status == "completed":
        click.echo(f"# Workflow Complete: {workflow_name}")
        click.echo("")
        click.echo(f"All {step_count} steps completed!")
        click.echo("")
        click.echo(f"**Final Progress:** {completion_pct}%")
        click.echo(f"**Steps Completed:** {new_steps_completed}")
        click.echo("")
        click.echo(f"Session updated: {session_file}")
    else:
        click.echo(f"# Step {completing_step} Complete")
        click.echo("")
        click.echo(f"**Progress:** Step {next_step} of {step_count} ({completion_pct}% complete)")
        click.echo(f"**Steps Completed:** {new_steps_completed}")
        click.echo("")
        click.echo("---")
        click.echo("")
        click.echo(f"## Step {next_step} of {step_count}")
        click.echo("")

        next_step_file = find_step_file(steps_path, next_step)
        if next_step_file:
            step_content = next_step_file.read_text()
            click.echo(strip_frontmatter(step_content))

        click.echo("")
        click.echo("---")
        click.echo("")
        click.echo("**Controls:**")
        click.echo("- `C` - Continue to next step")
        click.echo("- `pf workflow status` - Check progress")
