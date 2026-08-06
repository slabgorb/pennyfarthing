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

# Mapping from setting keys to (subagent name, dispatch tag or None)
_SUBAGENT_SETTING_MAP: dict[str, tuple[str, str | None]] = {
    "preflight": ("reviewer-preflight", None),
    "edge_hunter": ("reviewer-edge-hunter", "[EDGE]"),
    "silent_failure_hunter": ("reviewer-silent-failure-hunter", "[SILENT]"),
    "test_analyzer": ("reviewer-test-analyzer", "[TEST]"),
    "comment_analyzer": ("reviewer-comment-analyzer", "[DOC]"),
    "type_design": ("reviewer-type-design", "[TYPE]"),
    "security": ("reviewer-security", "[SEC]"),
    "simplifier": ("reviewer-simplifier", "[SIMPLE]"),
    "rule_checker": ("reviewer-rule-checker", "[RULE]"),
}


def _get_enabled_subagents() -> tuple[set[str], set[str]]:
    """Return (enabled_names, enabled_tags) filtered by workflow.reviewer_subagents settings."""
    try:
        from pf.settings.settings import get_setting

        toggles = get_setting("workflow.reviewer_subagents") or {}
    except Exception:
        toggles = {}

    enabled_names: set[str] = set()
    enabled_tags: set[str] = set()
    for key, (name, tag) in _SUBAGENT_SETTING_MAP.items():
        if toggles.get(key, True):  # default enabled
            enabled_names.add(name)
            if tag:
                enabled_tags.add(tag)
    return enabled_names, enabled_tags


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

    from_agent = _get_phase_agent(project_root, workflow, from_phase)

    # Guard: require assessment section before allowing gated phase transitions.
    # Skip/manual transitions (e.g. setup→implement) don't need assessments.
    # Shared with resolve_gate so the two steps can never disagree (gh #49).
    from pf.handoff.session_assessment import (
        has_assessment,
        missing_assessment_error,
        requires_assessment,
    )

    if requires_assessment(gate_type) and not has_assessment(content):
        return {
            "status": "error",
            "session_file": str(session_path),
            "error": missing_assessment_error(from_agent),
        }

    # Subgate: setup-exit requires the epic + story context documents to exist.
    # The sm-setup-exit gate's context checks are markdown instructions run by a
    # subagent the script-first path never spawns, so enforce them mechanically
    # here before any session mutation (SOUL #11, Automatic Beats Instructional).
    if gate_type == "sm_setup_exit":
        context_error = _check_setup_context(project_root, story_id)
        if context_error:
            return {
                "status": "error",
                "session_file": str(session_path),
                "error": context_error,
            }

    # Subgate: approval gate requires subagent completion table AND specialist tags
    if gate_type == "approval":
        # Which assessment is current must be unambiguous before anything is
        # judged against it — otherwise the tag check reports every tag missing
        # when the real problem is a suffixed heading (story 162-21).
        from pf.handoff.gate_recovery import select_last_section

        selected_assessment = select_last_section(content, "Reviewer Assessment")
        if selected_assessment["status"] == "ambiguous":
            return {
                "status": "error",
                "session_file": str(session_path),
                "error": (
                    f"Cannot determine the current '## Reviewer Assessment' section: "
                    f"{selected_assessment['detail']}. To fix: repeat the exact "
                    "`## Reviewer Assessment` heading for each review cycle."
                ),
            }

        completion_error = _check_subagent_completion(content)
        if completion_error:
            return {
                "status": "error",
                "session_file": str(session_path),
                "error": completion_error,
            }

        missing = _check_subagent_dispatch(content)
        if missing:
            _, enabled_tags = _get_enabled_subagents()
            return {
                "status": "error",
                "session_file": str(session_path),
                "error": (
                    f"Reviewer Assessment missing specialist subagent tags: {', '.join(sorted(missing))}. "
                    f"To fix: Incorporate findings from all enabled specialist subagents in the "
                    f"Reviewer Assessment using tags: {', '.join(sorted(enabled_tags))}."
                ),
            }

        freshness = _check_rework_freshness(content)
        if not freshness["pass"]:
            return {
                "status": "error",
                "session_file": str(session_path),
                "error": freshness["message"],
            }

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

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
                r"\1\n**Round-Trip Count:** 1",
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
            continue
        if in_handoff and line.strip().startswith("#"):
            break
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

    # Emit subagent transition event to Frame (Story 143-16)
    try:
        from pf.frame.subagent_events import emit_subagent_event

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


def _check_setup_context(project_root: Path, story_id: str) -> str | None:
    """Verify the epic + story context docs exist and are non-empty.

    Enforces the sm-setup-exit gate's context requirement mechanically so the
    setup→red transition cannot advance into a missing-context condition that
    would later hard-block the TEA RED gate (gh #61).

    Presence + non-empty mirrors the gate file's documented Fallback; it does
    not couple the handoff path to the full context schema validator.

    Returns an actionable error message if either document is missing or empty,
    or None when both are present and non-empty.
    """
    epic_n = story_id.split("-")[0]
    context_dir = project_root / "sprint" / "context"
    required = [
        context_dir / f"context-epic-{epic_n}.md",
        context_dir / f"context-story-{story_id}.md",
    ]
    missing = [p for p in required if not p.exists() or p.stat().st_size == 0]
    if missing:
        names = ", ".join(f"`sprint/context/{p.name}`" for p in missing)
        return (
            f"Setup context missing or empty: {names}. "
            f"To fix: Run `pf context create epic {epic_n}` and "
            f"`pf context create story {story_id}` to generate the context "
            "documents before completing the setup phase."
        )
    return None


def _parse_timestamp(value: str) -> datetime | None:
    """Parse a phase timestamp tolerantly, or return None if unparseable.

    Accepts ISO-8601 with offset, trailing `Z`, and the human-readable
    `YYYY-MM-DD HH:MM[:SS] UTC` shape the sm-setup model sometimes emits
    (gh #74). Never raises — callers degrade gracefully on None.
    """
    normalized = value.strip()
    # Normalize a trailing ` UTC` / `Z` (case-insensitive) to an ISO offset.
    if normalized.upper().endswith(" UTC"):
        normalized = normalized[:-4].rstrip() + "+00:00"
    elif normalized.endswith(("Z", "z")):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _calc_duration(started_str: str, ended_str: str) -> str:
    started = _parse_timestamp(started_str)
    ended = _parse_timestamp(ended_str)
    if started is None or ended is None:
        # Visible sentinel — never a misleading "0s" (lang-review #1).
        return "unknown"
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


SUBAGENT_DISPATCH_TAGS = {"[EDGE]", "[SILENT]", "[TEST]", "[DOC]", "[TYPE]", "[SEC]", "[SIMPLE]", "[RULE]"}

REQUIRED_SUBAGENTS = {
    "reviewer-preflight",
    "reviewer-edge-hunter",
    "reviewer-silent-failure-hunter",
    "reviewer-test-analyzer",
    "reviewer-comment-analyzer",
    "reviewer-type-design",
    "reviewer-security",
    "reviewer-simplifier",
    "reviewer-rule-checker",
}


def _check_subagent_completion(content: str) -> str | None:
    """Check session file for complete Subagent Results table.

    Returns an error message string if incomplete, or None if all good.
    Filters required subagents to only those enabled in settings.
    """
    enabled_names, _ = _get_enabled_subagents()

    # The CURRENT cycle's table — LAST section, same selection as resolve_gate
    # (story 162-21). First-match was the more dangerous half of the 162-5
    # defect: a stale cycle-1 "All received: Yes" silently certified that
    # specialists ran for a cycle whose table was never completed.
    from pf.handoff.gate_recovery import select_last_section

    selected = select_last_section(content, "Subagent Results")
    if selected["status"] == "ambiguous":
        return (
            f"Cannot determine the current '## Subagent Results' section: "
            f"{selected['detail']}. To fix: repeat the exact "
            "`## Subagent Results` heading for each review cycle."
        )
    if selected["status"] != "found":
        count = len(enabled_names)
        return (
            "Missing '## Subagent Results' section in session file. "
            f"To fix: The reviewer must wait for all {count} enabled subagents to return "
            "and fill in the Subagent Results table before writing the Reviewer Assessment. "
            "Context pressure is not a reason to skip this step. "
            "Example row format:\n"
            "| # | Specialist | Received | Status | Findings | Decision |\n"
            "| 1 | reviewer-preflight | Yes | clean | none | N/A |"
        )

    section = selected["section"]

    # Check for "All received: Yes" (tolerates bold markdown: **All received:** **Yes**)
    if not re.search(r"\*{0,2}All received:\*{0,2}\s*\*{0,2}Yes\*{0,2}", section, re.IGNORECASE):
        count = len(enabled_names)
        return (
            "Subagent Results table is incomplete — 'All received: Yes' not found. "
            f"To fix: Wait for all {count} enabled subagents to return results. Fill in "
            "every row of the table with Received: Yes (or explicit error notation). "
            "Do not proceed until all subagents are accounted for."
        )

    # Check that each enabled required subagent appears in the table
    missing = {name for name in REQUIRED_SUBAGENTS & enabled_names if name not in section}
    if missing:
        return (
            f"Subagent Results table missing entries for: {', '.join(sorted(missing))}. "
            "To fix: Every enabled specialist subagent must have a row in the Subagent Results "
            "table with its result status and decision documented."
        )

    return None


def _check_subagent_dispatch(content: str) -> set[str]:
    """Check Reviewer Assessment for required specialist subagent tags.

    Returns set of missing tags, or empty set if all present.
    Filters to only tags for enabled subagents.
    """
    _, enabled_tags = _get_enabled_subagents()
    required_tags = SUBAGENT_DISPATCH_TAGS & enabled_tags

    # The CURRENT cycle's assessment — the LAST section, selected by the same
    # rule resolve_gate uses (story 162-21). Matching the first heading judged a
    # rework session on its oldest section, so cycle 1's tags satisfied the gate
    # even when the current cycle dispatched no specialists (fail-open, 162-5).
    from pf.handoff.gate_recovery import select_last_section

    selected = select_last_section(content, "Reviewer Assessment")
    if selected["status"] != "found":
        return required_tags
    assessment = selected["section"]
    return {tag for tag in required_tags if tag not in assessment}


def _parse_rework_cycle(session_content: str) -> int:
    """Parse rework cycle number from session content.

    Looks for ``**Rework Cycle:** N`` and returns N.
    Returns 0 if the field is absent or the value is not a valid integer.
    """
    match = re.search(r"\*\*Rework Cycle:\*\*\s*(\S+)", session_content)
    if not match:
        return 0
    try:
        return int(match.group(1))
    except ValueError:
        return 0


def _check_rework_freshness(session_content: str) -> dict:
    """Check that subagent results reference the current rework cycle.

    Returns a dict with keys:
        pass: bool — True if results are fresh (or no rework in progress)
        message: str — human-readable explanation
        current_cycle: int — the parsed rework cycle number
    """
    cycle = _parse_rework_cycle(session_content)

    if cycle == 0:
        return {
            "pass": True,
            "message": "No rework cycle — initial review.",
            "current_cycle": 0,
        }

    # Look for "Cycle: N" in the Subagent Results section
    results_match = re.search(r"^## Subagent Results\b.*", session_content, re.MULTILINE)
    if not results_match:
        return {
            "pass": False,
            "message": (
                f"Rework cycle {cycle} is active but no Subagent Results section found. "
                "Re-run all enabled subagents for the current cycle."
            ),
            "current_cycle": cycle,
        }

    section = session_content[results_match.start():]
    next_heading = re.search(r"^## (?!Subagent Results)", section, re.MULTILINE)
    if next_heading:
        section = section[:next_heading.start()]

    # Check for "Cycle: N" matching the current cycle
    cycle_tag = re.search(r"\*{0,2}Cycle:\s*(\d+)\*{0,2}", section)
    if not cycle_tag:
        return {
            "pass": False,
            "message": (
                f"Rework cycle {cycle} is active but Subagent Results has no cycle tag. "
                "To fix: Add '**Cycle: {cycle}**' to the Subagent Results section after "
                "re-running all enabled subagents."
            ),
            "current_cycle": cycle,
        }

    results_cycle = int(cycle_tag.group(1))
    if results_cycle != cycle:
        return {
            "pass": False,
            "message": (
                f"Stale subagent results: results are from cycle {results_cycle} "
                f"but current rework cycle is {cycle}. "
                "To fix: Re-run ALL enabled subagents against the full diff for the "
                "current rework cycle before approving."
            ),
            "current_cycle": cycle,
        }

    return {
        "pass": True,
        "message": f"Subagent results are fresh for rework cycle {cycle}.",
        "current_cycle": cycle,
    }


def _find_project_root() -> Path:
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").is_dir():
            return parent
    return cwd
