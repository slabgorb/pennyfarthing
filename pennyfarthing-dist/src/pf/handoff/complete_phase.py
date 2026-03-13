"""Complete phase transition with atomic session update.

Atomically updates the session file (temp + mv) with phase transition,
timestamps, and history table entries.

Story: 105-1 (Script-First Handoff)
"""

from __future__ import annotations

import os
import re
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import yaml


def complete_phase(
    story_id: str,
    workflow: str,
    from_phase: str,
    to_phase: str,
    gate_type: str,
    project_root: Path | None = None,
) -> dict:
    """Complete a phase transition with atomic session file update.

    Args:
        story_id: Story identifier (e.g., "105-1")
        workflow: Workflow name (e.g., "tdd", "trivial")
        from_phase: Phase being completed (e.g., "green")
        to_phase: Phase being entered (e.g., "review")
        gate_type: Gate type that was passed (e.g., "tests_pass")
        project_root: Project root path. Auto-detected if None.

    Returns:
        COMPLETE_RESULT dict with keys:
            status: "success" | "error"
            session_file: str (path to session file)
            error: str | None
    """
    if project_root is None:
        project_root = _find_project_root()

    # Validate phase names against workflow YAML to catch agent-name confusion
    from_phase, to_phase = _validate_phase_names(project_root, workflow, from_phase, to_phase)

    session_path = project_root / ".session" / f"{story_id}-session.md"
    if not session_path.exists():
        return {
            "status": "error",
            "session_file": None,
            "error": (
                f"Session file not found at `.session/{story_id}-session.md`. "
                "To fix: Run `/pf-sm` to set up the story, which creates the session file."
            ),
        }

    content = session_path.read_text()

    # Guard: require assessment section before allowing gated phase transitions.
    # Skip/manual transitions (e.g. setup→implement) don't need assessments.
    if gate_type not in ("skip", "manual", "-", None, "") and not re.search(
        r"^##\s+.*Assessment", content, re.MULTILINE
    ):
        return {
            "status": "error",
            "session_file": str(session_path),
            "error": (
                "No assessment found in session file. "
                "To fix: Add a `## {Agent} Assessment` heading (e.g. `## TEA Assessment` or `## Dev Assessment`) "
                "to the session file before completing the phase."
            ),
        }

    # Subgate: approval gate requires subagent completion table AND specialist tags
    if gate_type == "approval":
        completion_error = _check_subagent_completion(content)
        if completion_error:
            return {
                "status": "error",
                "session_file": str(session_path),
                "error": completion_error,
            }

        missing = _check_subagent_dispatch(content)
        if missing:
            return {
                "status": "error",
                "session_file": str(session_path),
                "error": (
                    f"Reviewer Assessment missing specialist subagent tags: {', '.join(sorted(missing))}. "
                    "To fix: Incorporate findings from all 7 specialist subagents in the "
                    "Reviewer Assessment using tags: [EDGE], [SILENT], [TEST], [DOC], [TYPE], [SEC], [SIMPLE]."
                ),
            }

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    from_agent = _get_phase_agent(project_root, workflow, from_phase)
    to_agent = _get_phase_agent(project_root, workflow, to_phase)

    # Update tandem line: remove existing, add if to_phase has tandem config
    content = re.sub(r"\*\*Tandem:\*\*[^\n]*\n", "", content)
    tandem = _get_phase_tandem(project_root, workflow, to_phase)
    if tandem:
        partner = tandem["partner"]
        scope = tandem["scope"]
        tandem_line = f"**Tandem:** {partner} ({scope})\n"
        content = re.sub(
            r"(\*\*Workflow:\*\*[^\n]*\n)",
            rf"\1{tandem_line}",
            content,
        )

    # Update all **Phase:** lines to new phase
    content = re.sub(r"(\*\*Phase:\*\*) \S+", rf"\1 {to_phase}", content)

    # Update all **Phase Started:** lines to now
    content = re.sub(r"(\*\*Phase Started:\*\*) \S+", rf"\1 {now}", content)

    # Track round-trip count for rework transitions
    if gate_type and "rework" in gate_type:
        rt_match = re.search(r"\*\*Round-Trip Count:\*\*\s*(\d+)", content)
        if rt_match:
            new_count = int(rt_match.group(1)) + 1
            content = re.sub(
                r"\*\*Round-Trip Count:\*\*\s*\d+",
                f"**Round-Trip Count:** {new_count}",
                content,
            )
        else:
            # Insert after Phase Started line
            content = re.sub(
                r"(\*\*Phase Started:\*\*[^\n]*)",
                rf"\1\n**Round-Trip Count:** 1",
                content,
                count=1,
            )

    # Update Phase History: fill Ended/Duration for from_phase, add new row
    lines = content.splitlines()
    result_lines = []
    for line in lines:
        if line.strip().startswith(f"| {from_phase}"):
            cols = [c.strip() for c in line.split("|") if c.strip()]
            if len(cols) >= 4 and cols[2] == "-":
                started_str = cols[1]
                duration = _calc_duration(started_str, now)
                result_lines.append(f"| {from_phase} | {started_str} | {now} | {duration} |")
                result_lines.append(f"| {to_phase} | {now} | - | - |")
                continue
        result_lines.append(line)
    content = "\n".join(result_lines)

    # Add Handoff History row at end of table
    handoff_row = (
        f"| {from_phase} ({from_agent}) | {to_phase} ({to_agent}) | {gate_type} | PASSED | {now} |"
    )
    lines = content.splitlines()
    insert_after = None
    in_handoff = False
    for i, line in enumerate(lines):
        if "### Handoff History" in line:
            in_handoff = True
        if in_handoff and line.strip().startswith("|"):
            insert_after = i
    if insert_after is not None:
        lines.insert(insert_after + 1, handoff_row)
    content = "\n".join(lines)

    # Atomic write: temp file in same directory + rename
    temp_fd, temp_path_str = tempfile.mkstemp(dir=str(session_path.parent), suffix=".tmp")
    os.close(temp_fd)
    temp_path = Path(temp_path_str)
    try:
        temp_path.write_text(content)
        temp_path.rename(session_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    # Transition story to in_review when entering review phase
    if to_phase == "review":
        try:
            from pf.sprint.story_transition import transition_story

            transition_story(project_root, story_id, "in_review")
        except Exception:
            pass  # Non-fatal — status-sync gate will catch mismatches

    # Emit subagent transition event to BikeRack (Story 143-16)
    try:
        from pf.wheelhub.subagent_events import emit_subagent_event

        emit_subagent_event(
            "phase_complete",
            agent=from_agent,
            story_id=story_id,
            workflow=workflow,
            from_phase=from_phase,
            to_phase=to_phase,
            gate_type=gate_type,
            next_agent=to_agent,
        )
    except Exception:
        pass  # Non-fatal — observability should never block workflow

    return {
        "status": "success",
        "session_file": f".session/{story_id}-session.md",
        "error": None,
    }


def _calc_duration(started_str: str, ended_str: str) -> str:
    started = datetime.fromisoformat(started_str.replace("Z", "+00:00"))
    ended = datetime.fromisoformat(ended_str.replace("Z", "+00:00"))
    # Normalize: if one is naive and the other aware, treat naive as UTC
    if started.tzinfo is None and ended.tzinfo is not None:
        started = started.replace(tzinfo=ended.tzinfo)
    elif ended.tzinfo is None and started.tzinfo is not None:
        ended = ended.replace(tzinfo=started.tzinfo)
    total_seconds = int((ended - started).total_seconds())
    if total_seconds < 60:
        return f"{total_seconds}s"
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    if total_seconds < 3600:
        return f"{minutes}m {seconds}s" if seconds else f"{minutes}m"
    hours = total_seconds // 3600
    rem_minutes = (total_seconds % 3600) // 60
    return f"{hours}h {rem_minutes}m" if rem_minutes else f"{hours}h"


def _get_phase_tandem(project_root: Path, workflow: str, phase: str) -> dict | None:
    """Return tandem config for a phase, or None if no tandem block."""
    for name in [f"{workflow}.yaml", f"{workflow}/workflow.yaml"]:
        path = project_root / ".pennyfarthing" / "workflows" / name
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text())
                for p in data["workflow"]["phases"]:
                    if p["name"] == phase:
                        return p.get("tandem")
            except Exception:
                pass
    return None


def _get_phase_agent(project_root: Path, workflow: str, phase: str) -> str:
    for name in [f"{workflow}.yaml", f"{workflow}/workflow.yaml"]:
        path = project_root / ".pennyfarthing" / "workflows" / name
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text())
                for p in data["workflow"]["phases"]:
                    if p["name"] == phase:
                        return p.get("agent", phase)
            except Exception:
                pass
    return phase


def _validate_phase_names(
    project_root: Path, workflow: str, from_phase: str, to_phase: str
) -> tuple[str, str]:
    """Validate and auto-correct phase names against workflow YAML.

    If an agent name is passed instead of a phase name, resolves it to the
    correct phase name. This prevents the '**Phase:** sm' bug where agent
    names get written to the session file instead of phase names.
    """
    phases = _load_workflow_phases(project_root, workflow)
    if not phases:
        return from_phase, to_phase

    phase_names = {p["name"] for p in phases}
    agent_to_phases: dict[str, list[str]] = {}
    for p in phases:
        agent = p.get("agent", p["name"])
        agent_to_phases.setdefault(agent, []).append(p["name"])

    resolved_from = _resolve_one(from_phase, phase_names, agent_to_phases)
    resolved_to = _resolve_one(to_phase, phase_names, agent_to_phases)

    # If to_phase resolved from an agent name and is ambiguous, pick the phase
    # that comes after from_phase in the workflow order
    if resolved_to != to_phase or to_phase not in phase_names:
        phase_order = [p["name"] for p in phases]
        if resolved_from in phase_order:
            idx = phase_order.index(resolved_from)
            if idx + 1 < len(phase_order):
                resolved_to = phase_order[idx + 1]

    return resolved_from, resolved_to


def _resolve_one(value: str, phase_names: set[str], agent_to_phases: dict[str, list[str]]) -> str:
    """Resolve a single value: return as-is if phase name, else try agent→phase."""
    if value in phase_names:
        return value
    if value in agent_to_phases:
        candidates = agent_to_phases[value]
        if len(candidates) == 1:
            return candidates[0]
        # Ambiguous — return first match, caller may refine
        return candidates[0]
    return value


def _load_workflow_phases(project_root: Path, workflow: str) -> list[dict]:
    """Load phases list from workflow YAML."""
    for name in [f"{workflow}.yaml", f"{workflow}/workflow.yaml"]:
        path = project_root / ".pennyfarthing" / "workflows" / name
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text())
                return data.get("workflow", {}).get("phases", [])
            except Exception:
                pass
    return []


SUBAGENT_DISPATCH_TAGS = {"[EDGE]", "[SILENT]", "[TEST]", "[DOC]", "[TYPE]", "[SEC]", "[SIMPLE]"}

REQUIRED_SUBAGENTS = {
    "reviewer-preflight",
    "reviewer-edge-hunter",
    "reviewer-silent-failure-hunter",
    "reviewer-test-analyzer",
    "reviewer-comment-analyzer",
    "reviewer-type-design",
    "reviewer-security",
    "reviewer-simplifier",
}


def _check_subagent_completion(content: str) -> str | None:
    """Check session file for complete Subagent Results table.

    Returns an error message string if incomplete, or None if all good.
    """
    # Look for ## Subagent Results section
    match = re.search(r"^## Subagent Results\b.*", content, re.MULTILINE)
    if not match:
        return (
            "Missing '## Subagent Results' section in session file. "
            "To fix: The reviewer must wait for ALL 8 subagents to return and fill in the "
            "Subagent Results table before writing the Reviewer Assessment. "
            "Context pressure is not a reason to skip this step."
        )

    section = content[match.start():]
    next_heading = re.search(r"^## (?!Subagent Results)", section, re.MULTILINE)
    if next_heading:
        section = section[:next_heading.start()]

    # Check for "All received: Yes"
    if not re.search(r"All received:\s*Yes", section, re.IGNORECASE):
        return (
            "Subagent Results table is incomplete — 'All received: Yes' not found. "
            "To fix: Wait for ALL 8 subagents to return results. Fill in every row of "
            "the table with Received: Yes (or explicit error notation). Do not proceed "
            "until all subagents are accounted for."
        )

    # Check that each required subagent appears in the table
    missing = {name for name in REQUIRED_SUBAGENTS if name not in section}
    if missing:
        return (
            f"Subagent Results table missing entries for: {', '.join(sorted(missing))}. "
            "To fix: Every specialist subagent must have a row in the Subagent Results table "
            "with its result status and decision documented."
        )

    return None


def _check_subagent_dispatch(content: str) -> set[str]:
    """Check Reviewer Assessment for required specialist subagent tags.

    Returns set of missing tags, or empty set if all present.
    """
    # Extract content after "## Reviewer Assessment"
    match = re.search(r"^## Reviewer Assessment\b.*", content, re.MULTILINE)
    if not match:
        return SUBAGENT_DISPATCH_TAGS
    assessment = content[match.start():]
    # Truncate at next ## heading
    next_heading = re.search(r"^## (?!Reviewer Assessment)", assessment, re.MULTILINE)
    if next_heading:
        assessment = assessment[:next_heading.start()]
    return {tag for tag in SUBAGENT_DISPATCH_TAGS if tag not in assessment}


def _find_project_root() -> Path:
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").is_dir():
            return parent
    return cwd
