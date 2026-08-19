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

from pf.handoff.session_assessment import assessment_heading, normalize_session
from pf.workflow.helpers import resolve_workflow_file

# The agent whose assessment the approval subgates judge. Its heading comes from
# the shared formula, never a literal: one truth, one place (SOUL #2). A reader
# and a writer that disagreed about the heading would search for a section agents
# are no longer told to write, and every verdict would read as absent.
_APPROVAL_AGENT = "reviewer"

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

    content = session_path.read_text(encoding="utf-8")

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

    # Subgate: approval-family gates require a subagent completion table AND
    # specialist tags — on the way OUT to rework as much as on the way to finish.
    if is_approval_family(gate_type):
        unmet = _check_approval_requirements(content, gate_type)
        if unmet:
            return {
                "status": "error",
                "session_file": str(session_path),
                # ALL unmet requirements at once. Reporting one per attempt made
                # the reviewer discover the contract by five sequential gate
                # failures — a cost the gate charged for its own shape, paid live
                # in the 162-49 run (story 162-47, AC-B1).
                "error": _format_unmet(unmet),
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

    # Update all **Phase Started:** lines to now.
    # 164-17: match the whole rest of the line, not `\S+`. The timestamp may be
    # the space-separated `YYYY-MM-DD HH:MM:SS UTC` form 159-4 taught the parser
    # to accept; `\S+` stopped at the first space and left a stale tail glued to
    # the fresh value (`**Phase Started:** 2026-08-11T12:48:16Z 22:00 UTC`).
    content = re.sub(r"(\*\*Phase Started:\*\*) [^\n]+", rf"\1 {now}", content)

    # Track round-trip count for rework transitions
    if gate_type and "rework" in gate_type:
        # 162-28: Find the counter the same way every reader does — masked, so a
        # counter quoted in prose or a fence is not mistaken for the operative
        # one — and rewrite ONLY that occurrence.
        # 162-47 AC-A3: the locator is shared with every reader; it returns the
        # last counter line in the session PREAMBLE so a writer cannot increment
        # a decoy in agent prose.
        # 162-50 WRITER: tri-state the read (absent / unreadable / found) so the
        # absent and unreadable paths are handled distinctly. Collapsing them
        # inserted a fresh ``**Round-Trip Count:** 1`` BESIDE a corrupt line,
        # creating a second counter and silently resetting the round-trip budget
        # — 162-59's unreadable guard then never fired because the reader found
        # the newly inserted valid line.
        # 162-60: normalize ONCE before read/locate/splice so all three operations
        # agree on the same byte sequence.  find_operative_round_trip_line returns
        # offsets into the string it received; if content were normalized inside
        # the locator while the splice target remained raw, any Cf/NFKC-changed
        # byte before the counter line would shift the offsets and mangle the
        # counter (review CRITICAL finding).
        content = normalize_session(content)
        from pf.handoff.gate_recovery import (
            find_operative_round_trip_line,
            mask_illustrative_regions,
            preamble_end,
            read_round_trip_count,
        )

        rt_reading = read_round_trip_count(content)
        if rt_reading["status"] == "found":
            # Readable counter: locate via the shared locator and increment in-place.
            rt_match = find_operative_round_trip_line(content)
            new_count = int(rt_match.group(1)) + 1
            content = (
                content[: rt_match.start()]
                + f"**Round-Trip Count:** {new_count}"
                + content[rt_match.end() :]
            )
        elif rt_reading["status"] == "unreadable":
            # 162-50 WRITER: unreadable counter present. Two sub-cases:
            #
            # (a) VISIBLE corrupt line (bad value, not hidden): replace it rather
            #     than inserting a second line beside it. Inserting resets the
            #     budget: the reader finds the new valid line, returns found/1,
            #     and 162-59's unreadable guard never fires.
            # (b) HIDDEN line only (fence, HTML comment, backtick, indented):
            #     these are illustrations or deliberately hidden; do NOT strip
            #     them (that would corrupt prose in 162-28's pinned tests).
            #     Fall through to the absent branch and insert a new counter.
            _masked = mask_illustrative_regions(content)
            _end = preamble_end(_masked)
            _masked_preamble = _masked[:_end]
            from pf.handoff.gate_recovery import COUNTER_LINE_RE as _COUNTER_LINE_RE

            if _COUNTER_LINE_RE.search(_masked_preamble):
                # Case (a): visible corrupt line — strip it and inject a clean one.
                _preamble = content[:_end]
                _rest = content[_end:]
                _clean_preamble = re.sub(
                    r"^.*\*\*Round-Trip Count:\*\*.*\n?",
                    "",
                    _preamble,
                    flags=re.MULTILINE,
                )
                content = (
                    re.sub(
                        r"(\*\*Phase Started:\*\*[^\n]*)",
                        r"\1\n**Round-Trip Count:** 1",
                        _clean_preamble,
                        count=1,
                    )
                    + _rest
                )
            else:
                # Case (b): hidden line only — insert after Phase Started
                # (same as absent; the hidden line is left in place).
                content = re.sub(
                    r"(\*\*Phase Started:\*\*[^\n]*)",
                    r"\1\n**Round-Trip Count:** 1",
                    content,
                    count=1,
                )
        else:
            # Absent: insert after Phase Started line — pre-162-50 behaviour.
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
        temp_path.write_text(content, encoding="utf-8")
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


def is_approval_family(gate_type: str | None) -> bool:
    """Whether ``gate_type`` is an approval gate or a variant resolved from one.

    Keyed off the FAMILY, not the exact string ``"approval"``. A REJECTED verdict
    resolves to ``approval_rework``, so an exact-string check enforced reviewer
    diligence only on the path where the reviewer AGREES with the code and left it
    unenforced on the path that costs a full Dev cycle. Verified live in the
    162-21 review: a REJECTED handoff with no ``## Subagent Results`` section was
    accepted while the byte-identical APPROVED handoff was refused (story 162-47,
    AC-A8).
    """
    if not gate_type:
        return False
    return gate_type == "approval" or gate_type.startswith("approval_")


def _check_approval_requirements(content: str, gate_type: str) -> list[str]:
    """Every unmet approval requirement, in the order a reviewer should fix them.

    Returns an empty list when the assessment is compliant. Each entry is a
    complete, actionable sentence — :func:`_format_unmet` renders them as ONE error
    so the full contract is discoverable in a single attempt (AC-B1).

    **Only requirements that are genuinely unmet appear.** Aggregating removed the
    short-circuit that used to stop after the first problem, and the checks behind
    it were written expecting to run only on input the earlier check had already
    vetted — so each one has to be truthful on its own now. See
    :func:`_check_subagent_dispatch`, which searches the candidate sections when
    the heading is ambiguous rather than declaring every tag missing (story 162-47
    review, F1).

    ``_check_rework_freshness`` is the one subcheck scoped to bare ``approval``:
    its subject is the staleness of results being used to APPROVE, and demanding a
    ``**Cycle: N**`` tag on the way out to rework would ask the reviewer to attest
    freshness for the very cycle it is rejecting (AC-A8, carried from the probed
    fix including this deliberate exclusion).
    """
    from pf.handoff.gate_recovery import mask_quoted_blocks, select_last_section

    heading = assessment_heading(_APPROVAL_AGENT)
    problems: list[str] = []

    # Which assessment is current must be unambiguous before anything is judged
    # against it — reported FIRST because it is the problem that makes the others
    # hard to interpret (story 162-21). It no longer suppresses them: the sibling
    # checks handle an ambiguous heading themselves.
    selected_assessment = select_last_section(content, heading, mask_quoted_blocks)
    if selected_assessment["status"] == "ambiguous":
        problems.append(
            f"Cannot determine the current '## {heading}' section: "
            f"{selected_assessment['detail']}. To fix: repeat the exact "
            f"`## {heading}` heading for each review cycle."
        )

    completion_error = _check_subagent_completion(content)
    if completion_error:
        problems.append(completion_error)

    missing = _check_subagent_dispatch(content)
    if missing:
        _, enabled_tags = _get_enabled_subagents()
        problems.append(
            f"{heading} missing specialist subagent tags: {', '.join(sorted(missing))}. "
            "To fix: Incorporate findings from all enabled specialist subagents in the "
            f"{heading} using tags: {', '.join(sorted(enabled_tags))}."
        )

    if gate_type == "approval":
        freshness = _check_rework_freshness(content)
        if not freshness["pass"]:
            problems.append(freshness["message"])

    return problems


def _format_unmet(unmet: list[str]) -> str:
    """Render the unmet approval requirements as one legible error.

    Blank-line separated and numbered, because these entries are multi-line: the
    completion error ends in a two-line markdown example table, so joining on a
    space spliced the next requirement onto the table's final row and produced one
    unbroken paragraph containing a malformed table. Aggregating five legible
    sequential errors into one illegible blob would have taken back most of what
    AC-B1 bought (story 162-47 review, F2).
    """
    if len(unmet) == 1:
        return unmet[0]
    numbered = "\n\n".join(f"{i}. {problem}" for i, problem in enumerate(unmet, start=1))
    return f"{len(unmet)} approval requirements are unmet — fix all of them:\n\n{numbered}"


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
    path = resolve_workflow_file(workflow, project_root)
    if path is not None:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            for p in data["workflow"]["phases"]:
                if p["name"] == phase:
                    return p.get("tandem")
        except Exception:
            pass
    return None


def _get_phase_agent(project_root: Path, workflow: str, phase: str) -> str | None:
    """Return the agent that owns a phase, or None if it cannot be determined.

    Mirrors ``prime.workflow.get_phase_owner`` exactly: an unknown workflow, an
    unknown phase, or a phase with no ``agent:`` key all yield None. The old
    ``p.get("agent", phase)`` fallback invented a non-agent owner (it is why
    ``handoff marker`` had to avoid this function to keep from emitting
    ``/pf-red``); returning None removes that reader/writer divergence.
    """
    path = resolve_workflow_file(workflow, project_root)
    if path is not None:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            for p in data["workflow"]["phases"]:
                if p["name"] == phase:
                    return p.get("agent")
        except Exception:
            pass
    return None


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
    path = resolve_workflow_file(workflow, project_root)
    if path is not None:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            return data.get("workflow", {}).get("phases", [])
        except Exception:
            pass
    return []


SUBAGENT_DISPATCH_TAGS = {
    "[EDGE]",
    "[SILENT]",
    "[TEST]",
    "[DOC]",
    "[TYPE]",
    "[SEC]",
    "[SIMPLE]",
    "[RULE]",
}

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


# Every specialist the framework knows, longest name first so containment matching
# can never award a row to a shorter name that happens to be a prefix.
_ALL_SUBAGENT_NAMES = tuple(
    sorted((name for name, _tag in _SUBAGENT_SETTING_MAP.values()), key=len, reverse=True)
)

# The five cells a row must carry, in the order the documented table declares them.
_ROW_FIELDS = ("specialist", "received", "status", "findings", "decision")

# A table row that is structure, not evidence: `|---|---|`, `|:--|--:|`.
_SEPARATOR_ROW_RE = re.compile(r"^[\s|:\-]+$")

# Cells that assert nothing. A row of these is the GENERATED TEMPLATE, not a
# result: `pf.reviewer.template` emits `| 1 | reviewer-preflight | Yes/No | - | - | - |`
# for the reviewer to fill in, and the substring gate accepted it verbatim.
# `N/A` is deliberately absent — `agents/reviewer.md` documents it as the correct
# Decision for a clean specialist, so rejecting it would fail honest reviews.
_UNFILLED_CELLS = frozenset(
    {
        "",
        "-",
        "--",
        "---",
        "–",
        "—",
        ".",
        "..",
        "...",
        "…",
        "?",
        "??",
        "tbd",
        "todo",
        "pending",
        "unknown",
        "yes/no",
        "clean/findings/error",
        "confirmed n, dismissed n, deferred n",
        'count or "none"',
    }
)

# `{count or "none"}` — the template's brace placeholders, whatever they contain.
_BRACE_PLACEHOLDER_RE = re.compile(r"^\{.*\}$", re.DOTALL)

# A Received cell that says the specialist came back.
_RECEIVED_YES_RE = re.compile(r"^(?:yes|y|true|received|returned|complete[d]?)\b", re.IGNORECASE)

# A Received/Status pair that explicitly records a NON-return. `agents/reviewer.md`
# rule 1 requires the reviewer to record a timeout or error rather than leave the
# row blank, and rule 4 requires it to assess that domain first-hand — so a
# recorded failure is compliant evidence and must pass. This is the exact shape the
# 162-44 review needed and could not express: all nine specialists timed out.
#
# A bare `Skipped` is NOT here. Every notation named is something that happened TO
# the specialist; skipping is the reviewer's own decision, and `gates/approval.md`
# is explicit that "skipped because context was high" is not a valid one. The
# documented disabled row — `| N | x | Skipped | disabled | … |` — still passes,
# because `disabled` is matched and the pair is searched together; and a disabled
# specialist is filtered out of the required set before it gets here anyway.
_RECORDED_FAILURE_RE = re.compile(
    r"\b(?:error(?:ed|s)?|timed[ -]?out|time[ -]?out|timeout|fail(?:ed|ure|s)?|"
    r"crash(?:ed)?|unavailable|unreachable|disabled|not[ -]enabled)\b",
    re.IGNORECASE,
)

# A Findings cell whose leading number is the count of findings, so `3`,
# `3 findings` and `2 (1 dup)` all read as positive, while `none` and `0` do not.
_FINDING_COUNT_RE = re.compile(r"^(\d+)\b")

# A Decision cell that decides nothing — legitimate ONLY for a specialist that
# found nothing.
_NO_DECISION_RE = re.compile(r"^(?:n/?a|none|nothing|no decision)\b", re.IGNORECASE)

# `N/A` and nothing else. Deliberately NARROWER than _NO_DECISION_RE, which also
# matches `none` — `Findings: none` is the value `agents/reviewer.md` documents for
# a clean specialist and must stay accepted.
_NOT_APPLICABLE_RE = re.compile(r"^(?:n\.?/?a\.?|not applicable)$", re.IGNORECASE)


def _cell_text(raw: str) -> str:
    """A table cell with markdown emphasis and code quoting stripped."""
    text = raw.strip()
    # Backtick spans and bold/italic runs wrap the value; they do not change it.
    text = text.strip("`").strip()
    text = re.sub(r"^[*_]+", "", text)
    text = re.sub(r"[*_]+$", "", text)
    return text.strip()


def _split_table_row(line: str) -> list[str] | None:
    """The cells of a markdown pipe row, or None if the line is not a row."""
    stripped = line.strip()
    if not stripped.startswith("|"):
        return None
    cells = stripped.split("|")
    # `| a | b |` splits with an empty element on each side of the outer pipes.
    # Drop AT MOST one from each end so a genuinely empty final cell survives —
    # an empty Decision is precisely what the gate has to see.
    if cells and not cells[0].strip():
        cells = cells[1:]
    if cells and not cells[-1].strip():
        cells = cells[:-1]
    return [_cell_text(cell) for cell in cells]


def _is_unfilled(cell: str) -> bool:
    """Whether a cell is blank, a dash, or a template placeholder."""
    normalized = cell.strip().lower()
    return normalized in _UNFILLED_CELLS or bool(_BRACE_PLACEHOLDER_RE.match(cell.strip()))


def _records_non_return(row: dict[str, str | None]) -> bool:
    """Whether this row records something that happened TO the specialist.

    **A row whose Received says `Yes` never counts, whatever its Status says.** The
    failure vocabulary is read across Received and Status together, because the
    documented disabled row spreads the notation over both cells (`Skipped` /
    `disabled`) — but `error` is also a Status value ``agents/reviewer.md``
    documents for a specialist that DID return and reported an error, and
    `clean, no errors` is ordinary prose. Without this guard, an honest
    fully-returned round of `| i | name | Yes | error | none | N/A |` rows read as
    "nothing was received" and the gate told the reviewer to write
    `All received: No` — asserting something false, which is the exact failure mode
    the all-non-return branch exists to remove (review finding, fix round 2).

    Every intended non-return has a non-`Yes` Received (`No — timed out`,
    `Skipped`), so the guard costs the all-timeout detection nothing.
    """
    if _RECEIVED_YES_RE.match(row["received"] or ""):
        return False
    return bool(_RECORDED_FAILURE_RE.search(f"{row['received'] or ''} {row['status'] or ''}"))


def parse_subagent_result_rows(section: str) -> dict[str, list[dict[str, str | None]]]:
    """Parse a ``## Subagent Results`` section into per-specialist ROWS.

    Maps each specialist name to every row claiming to be its result — a list,
    because two rows for one specialist is itself a finding the gate reports.
    Each row is a dict with the keys in :data:`_ROW_FIELDS`.

    **The two absent-cell values are not interchangeable, and the distinction is
    load-bearing:**

    - ``None`` — the table has no such COLUMN. :func:`_row_problem` does not
      demand it (see that docstring for why absent columns are not required).
    - ``""`` — the column exists and the cell is empty. That FAILS. A row DECLARED
      by the header but truncated before that column yields ``""`` too, so
      deleting trailing pipes is not a way out of the filled-cell rule (review
      finding, fix round 1: ``| 1 | name | Yes |`` under a six-column header used
      to read as "those columns don't exist" and passed).

    **This makes the filled-cell rule header-conditional, deliberately.** With no
    header — or one that renames `Specialist`/`Received` — nothing is declared, so
    the enforced floor is that every specialist HAS a row, not that the row is six
    cells wide. Legitimate three- and four-column sessions exist in the wild
    (pinned in `test_143_9`, `test_162_21`, `test_162_28`) and rejecting them would
    not cost a forger a keystroke: anyone typing a fake table types six columns as
    easily as three. Forgery cost is set by ROW count.

    Columns are located by the table's own header when one is present, so an
    extra trailing `Notes` column or a renamed `#` column does not shift the
    values. Failing that, the five fields are read as consecutive cells starting
    at the one naming the specialist, which is the documented layout — those
    offsets are INFERRED rather than declared, so a short row genuinely means the
    column is absent and stays ``None``.

    The section is expected to be one already selected and masked by
    :func:`gate_recovery.select_last_section` — a fenced example table is blanked
    before it gets here, so quoted documentation cannot present itself as a row.
    """
    rows: dict[str, list[dict[str, str | None]]] = {}
    header_index: dict[str, int] | None = None

    for line in section.splitlines():
        cells = _split_table_row(line)
        if cells is None or not cells:
            continue

        lowered = [cell.lower() for cell in cells]

        # Header row: remember where each documented column sits.
        if "specialist" in lowered and "received" in lowered:
            found = {field: lowered.index(field) for field in _ROW_FIELDS if field in lowered}
            if "specialist" in found:
                header_index = found
            continue

        if _SEPARATOR_ROW_RE.match(line.strip()):
            continue

        # Which specialist does this row claim to be? Containment, because a cell
        # may carry a tag or a note beside the name.
        name = next((n for n in _ALL_SUBAGENT_NAMES if n in line), None)
        if name is None:
            continue

        if header_index is not None and header_index.get("specialist", -1) < len(cells):
            offsets = header_index
            declared = True
        else:
            # No usable header — read the fields as consecutive cells from the
            # one naming the specialist. These offsets are a GUESS about an
            # undeclared layout, not a promise the table made.
            anchor = next((i for i, cell in enumerate(cells) if name in cell), None)
            if anchor is None:
                continue
            offsets = {field: anchor + i for i, field in enumerate(_ROW_FIELDS)}
            declared = False

        row: dict[str, str | None] = {}
        for field in _ROW_FIELDS:
            idx = offsets.get(field, -1)
            if 0 <= idx < len(cells):
                row[field] = cells[idx]
            elif declared and field in offsets:
                # The HEADER declares this column and the row stops short of it.
                # That is an empty declared cell, not an absent column — otherwise
                # a forger drops the trailing pipes and the filled-cell rule never
                # runs (review finding, fix round 1).
                row[field] = ""
            else:
                row[field] = None
        rows.setdefault(name, []).append(row)

    return rows


def _row_problem(row: dict[str, str | None]) -> str | None:
    """Why this row is not a usable specialist result, or None if it is.

    Judges the row on its own terms: every cell the table DECLARES is filled, and
    the filled cells do not contradict each other. A record whose parts contradict
    each other was not produced by reading a specialist's output.

    **Columns the table does not have are not demanded.** Sessions in the wild
    carry `| Subagent | Received | Result |` and `| # | Specialist | Received |`
    as well as the six-column form ``agents/reviewer.md`` documents, and requiring
    the absent columns would reject those without raising the cost of a forgery by
    one keystroke — anyone typing a fake table can type six columns as easily as
    three. What the check buys is that a DECLARED cell cannot be left empty or
    left as the generated template's ``-``, which is the shape an unfilled table
    actually has (story 162-85).
    """
    received = row["received"]
    if received is None:
        return "the row has no Received cell — add a `Received` column to the table"
    if _is_unfilled(received):
        return "the Received cell is blank or a placeholder"
    non_return = _records_non_return(row)
    if not _RECEIVED_YES_RE.match(received) and not non_return:
        return (
            f"Received is '{received}' — write 'Yes', or name what happened to the "
            "specialist (e.g. 'No — timed out') and assess that domain yourself. "
            "Choosing to skip an enabled specialist is not a recordable result"
        )

    def _empty(field: str) -> bool:
        value = row[field]
        if value is None:  # column not declared and not truncated away
            return False
        if _is_unfilled(value):
            return True
        # `N/A` says nothing about a specialist that RAN. `agents/reviewer.md`
        # exempts it for Decision only — a clean run reports `Status: clean,
        # Findings: none`, not N/A (review finding, fix round 1). On a row that
        # records a non-return, N/A is the honest value for both: there is no
        # status or finding to report from a specialist that never ran.
        if field != "decision" and not non_return and _NOT_APPLICABLE_RE.match(value):
            return True
        return False

    unfilled = [field for field in ("status", "findings", "decision") if _empty(field)]
    if unfilled:
        return (
            f"the {', '.join(unfilled)} cell(s) are blank or still the template's "
            "placeholder — a row nobody filled in is not a result"
        )

    findings, status, decision = row["findings"], row["status"], row["decision"]
    count_match = _FINDING_COUNT_RE.match(findings) if findings else None
    count = int(count_match.group(1)) if count_match else 0

    if count and status and status.lower().startswith("clean"):
        return (
            f"Status is 'clean' but Findings claims {count} — a clean specialist "
            "reports no findings"
        )
    if count and decision and _NO_DECISION_RE.match(decision):
        return (
            f"Findings claims {count} but Decision is '{decision}' — every "
            "finding needs a confirmed / dismissed / deferred decision"
        )
    return None


def _check_subagent_completion(content: str) -> str | None:
    """Check session file for complete Subagent Results table.

    Returns an error message string if incomplete, or None if all good.
    Filters required subagents to only those enabled in settings.

    **The table is verified as STRUCTURE, not as text** (story 162-85). The
    predicate this replaced was two substring searches over the section — an
    ``All received: Yes`` line anywhere in it, plus each specialist's name
    appearing anywhere in it — so a review that dispatched nothing passed by
    typing one line and nine names. That forgery was performed live, twice,
    during the 162-44 review. There is no out-of-band tool-call log a session-file
    hook can consult, so the honest strongest check available is that the claim be
    a COMPLETE, INTERNALLY CONSISTENT record: one row per enabled specialist, with
    filled Received / Status / Findings / Decision cells that do not contradict
    each other. See :func:`parse_subagent_result_rows` and :func:`_row_problem`.
    """
    enabled_names, _ = _get_enabled_subagents()

    # The CURRENT cycle's table — LAST section, same selection as resolve_gate
    # (story 162-21). First-match was the more dangerous half of the 162-5
    # defect: a stale cycle-1 "All received: Yes" silently certified that
    # specialists ran for a cycle whose table was never completed.
    # Presence search (row names, "All received") — lenient masker, as above.
    from pf.handoff.gate_recovery import mask_quoted_blocks, select_last_section

    selected = select_last_section(content, "Subagent Results", mask_quoted_blocks)
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

    # Every enabled specialist must have exactly ONE complete, self-consistent ROW.
    # A NAME appearing in the section's prose is not a result: the check this
    # replaced was `name not in section`, which the specialist list quoted in a
    # sentence satisfied for all nine (story 162-85).
    rows = parse_subagent_result_rows(section)
    required = sorted(REQUIRED_SUBAGENTS & enabled_names)

    problems: list[str] = []

    # The summary line, judged AGAINST the rows rather than alone.
    #
    # `All received: Yes` is still required — except when EVERY required row
    # records a non-return, the shape of the 162-44 rounds where all nine
    # specialists timed out. Demanding `Yes` there asked the reviewer to assert
    # something false in order to report the truth honestly, which is how a gate
    # teaches forgery. In that one case a `No` (or absent) summary is accepted, and
    # a `Yes` is REFUSED as the contradiction it is: nothing was received.
    single_rows = [rows[name][0] for name in required if len(rows.get(name) or []) == 1]
    all_non_return = (
        bool(required)
        and len(single_rows) == len(required)
        and all(_records_non_return(row) for row in single_rows)
    )
    summary_says_yes = bool(
        re.search(r"\*{0,2}All received:\*{0,2}\s*\*{0,2}Yes\*{0,2}", section, re.IGNORECASE)
    )
    if all_non_return:
        if summary_says_yes:
            problems.append(
                "every row records a specialist that did NOT return, yet the section "
                "claims 'All received: Yes' — write 'All received: No' and keep the "
                "per-specialist rows, which is the honest record of that round"
            )
    elif not summary_says_yes:
        problems.append(
            f"'All received: Yes' not found. Wait for all {len(enabled_names)} enabled "
            "subagents to return, then fill in every row with Received: Yes (or an "
            "explicit error notation). Accepted forms of the line: `All received: Yes`, "
            "`**All received:** Yes`, `**All received:** **Yes**`, and either with "
            "parenthetical context after `Yes`"
        )

    missing = [name for name in required if not rows.get(name)]
    if missing:
        problems.append(
            f"no row at all for: {', '.join(missing)} (a name mentioned in prose is not a row)"
        )
    for name in required:
        candidates = rows.get(name) or []
        if len(candidates) > 1:
            # Which row is operative cannot be decided, and picking one is how a
            # reader fails open — the same reasoning as the duplicate-heading and
            # duplicate-cycle-tag rules.
            problems.append(
                f"{name} has {len(candidates)} rows in the current table — "
                "which one is the result cannot be determined"
            )
            continue
        if candidates:
            problem = _row_problem(candidates[0])
            if problem:
                problems.append(f"{name}: {problem}")

    if problems:
        joined = "".join(f"\n  - {problem}" for problem in problems)
        return (
            "Subagent Results is not a usable record of specialist results — the "
            f"summary line is not corroborated by the table:{joined}\n"
            "To fix: give EVERY enabled specialist its own row with all four cells "
            "filled from what the specialist actually returned. A specialist that "
            "timed out or errored is recorded as such (e.g. `| 3 | reviewer-security "
            "| No — timed out | error | none | domain assessed first-hand |`) and its "
            "domain assessed first-hand — never left blank, and never claimed as "
            "coverage. Row format:\n"
            "| # | Specialist | Received | Status | Findings | Decision |\n"
            "| 1 | reviewer-preflight | Yes | clean | none | N/A |"
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
    # PRESENCE search, so the lenient masker: a tag in backticks is exactly how
    # `agents/reviewer.md` and `gates/approval.md` render these, and an indented
    # line under a `###` heading is prose. Masking either reported tags missing
    # while they sat plainly in the file — a fail-CLOSED that is close to
    # undiagnosable from the message (story 162-28, cycle 2). Fenced examples are
    # still masked, so 162-21's fail-open stays closed.
    from pf.handoff.gate_recovery import (
        candidate_section_region,
        mask_quoted_blocks,
        select_last_section,
    )

    heading = assessment_heading(_APPROVAL_AGENT)
    selected = select_last_section(content, heading, mask_quoted_blocks)
    if selected["status"] == "found":
        assessment = selected["section"]
    elif selected["status"] == "ambiguous":
        # Which section is current is unknown, but the candidates are knowable, so
        # search them rather than declaring every tag missing. Returning
        # `required_tags` wholesale here reported all eight specialist tags absent
        # while all eight sat plainly in the file — the aggregated error then named
        # a requirement that was SATISFIED, sending the reviewer to chase tags it
        # had already written. Before AC-B1 a short-circuit hid this by returning
        # the ambiguity alone; aggregating without fixing the underlying report
        # re-opened the 162-21 diagnostic defect (story 162-47 review, F1). The
        # ambiguity is still reported by the caller either way.
        assessment = candidate_section_region(content, heading, mask_quoted_blocks)
    else:
        # Absent: there is no assessment, so every required tag really is missing.
        return required_tags
    return {tag for tag in required_tags if tag not in assessment}


_LEGACY_REWORK_COUNTER_RE = re.compile(r"^\*\*Rework Cycle:\*\*[ \t]*(\d+)[ \t]*$", re.MULTILINE)
_LEGACY_COUNTER_LINE_RE = re.compile(r"^.*\*\*Rework Cycle:\*\*.*$", re.MULTILINE)
# The freshness tag, and nothing that merely resembles one. A standalone column-0
# `**Cycle: N**` line — the form `agents/reviewer.md` documents. The unanchored,
# asterisk-optional predicate this replaces was satisfied by any prose ending in
# `Cycle: N`, including `Re-ran for Rework Cycle: 2` and a table cell, so the
# guard could be cleared by text that asserts nothing (story 162-28 review).
_CYCLE_TAG_RE = re.compile(r"^\*\*Cycle:[ \t]*(\d+)\*\*[ \t]*$", re.MULTILINE | re.IGNORECASE)


def _parse_rework_cycle(session_content: str) -> int:
    """Parse the current rework cycle number from session content.

    **NOT FOR PRODUCTION USE — kept only for the tests that characterise the
    reader**, for the same reason as ``gate_recovery.parse_round_trip_count``: it
    flattens ``unreadable`` onto ``absent``. Every production caller goes through
    :func:`_read_rework_cycle` and branches on ``["status"]`` (story 162-59, AC4).

    ``**Round-Trip Count:** N`` — the counter ``complete_phase`` actually writes
    on every rework transition — is authoritative, and is read through
    :func:`_read_rework_cycle` so this module does not fork a second
    reader of it. ``**Rework Cycle:** N`` is the field the original guard read but
    nothing ever wrote (story 162-28, B4); it remains a FALLBACK for hand-written
    sessions and story 150-8's fixtures, consulted only when the real counter is
    absent.

    The real field wins rather than the higher value: ``agents/reviewer.md`` tells
    the Reviewer to tag with the Round-Trip Count, and a ``max()`` across both
    fields rejected that documented tag whenever a stale legacy field sat above it
    — an unsatisfiable instruction, which is its own kind of gate failure.

    Both readings mask illustrative regions and accept digits only. A value the
    tag regex could never match must not arm the guard: ``-3`` used to clear the
    ``== 0`` sentinel and then demand a tag no digits can satisfy, leaving the
    session permanently unapprovable.

    Returns 0 when no counter is present or none parses as a non-negative integer.
    A counter that is present but HIDDEN or unparseable is not 0 — see
    :func:`_read_rework_cycle`, which the guard uses so it can block on that state.
    """
    return _read_rework_cycle(session_content)["count"]


def _read_rework_cycle(session_content: str) -> dict:
    """Tri-state rework-cycle read: ``absent``, ``found`` or ``unreadable``.

    Delegates the real counter to ``gate_recovery.read_round_trip_count`` and falls
    back to the legacy ``**Rework Cycle:**`` field only when the real one is
    genuinely absent — an unreadable real counter must not be papered over by a
    legacy line, and a hidden legacy line is unreadable for the same reason
    (story 162-28, review cycle 2).
    """
    from pf.handoff.gate_recovery import (
        mask_illustrative_regions,
        read_round_trip_count,
    )

    # 162-60: normalize before all matchers — homoglyph/format-char variants in
    # the legacy "**Rework Cycle:**" label must not render it absent/unreadable.
    # read_round_trip_count normalizes internally; the legacy matchers below do not.
    session_content = normalize_session(session_content)

    reading = read_round_trip_count(session_content)
    if reading["status"] != "absent":
        return reading

    legacy = _LEGACY_REWORK_COUNTER_RE.findall(mask_illustrative_regions(session_content))
    if legacy:
        return {"status": "found", "count": int(legacy[-1]), "detail": ""}

    if _LEGACY_COUNTER_LINE_RE.search(session_content):
        return {
            "status": "unreadable",
            "count": 0,
            "detail": (
                "a '**Rework Cycle:**' line is present but cannot be read as "
                "operative — its value does not parse as a plain integer ending "
                "the line, or it sits inside a code fence, HTML comment, indented "
                "block or backticks"
            ),
        }

    return {"status": "absent", "count": 0, "detail": ""}


# How the reviewer may honestly satisfy the freshness tag. Naming only the full
# generalist sweep told a reviewer under context pressure that the honest answer
# was unaffordable — so it added the tag without re-running anything, and the gate
# certified the false attestation (story 162-47, AC-B2, observed in the 162-49
# run). Targeted re-verification of already-characterized findings is STRONGER
# evidence than a fresh sweep, so it is named as an accepted route and the
# reviewer is asked to disclose which it used.
_FRESHNESS_ROUTES = (
    "Either re-run all enabled subagents, or re-verify each previously recorded "
    "finding with targeted probes — targeted re-verification of characterized "
    "findings is accepted, and is stronger evidence than a fresh generalist sweep. "
    "State which method you used alongside the tag."
)


def _check_rework_freshness(session_content: str) -> dict:
    """Check that subagent results reference the current rework cycle.

    Returns a dict with keys:
        pass: bool — True if results are fresh (or no rework in progress)
        message: str — human-readable explanation
        current_cycle: int — the parsed rework cycle number
    """
    reading = _read_rework_cycle(session_content)

    # "I cannot read the counter" is not "there was no rework". Treating them the
    # same let the guard be disarmed by hiding the operative line — in an HTML
    # comment it does not even leave a visible hole (story 162-28, cycle 2).
    if reading["status"] == "unreadable":
        return {
            "pass": False,
            "message": (
                f"Cannot determine the rework cycle: {reading['detail']}. "
                "To fix: put the counter back on its own line as "
                "'**Round-Trip Count:** N', outside any code fence, HTML comment or "
                "backticks, with nothing after the number."
            ),
            "current_cycle": 0,
        }

    cycle = reading["count"]

    if cycle == 0:
        return {
            "pass": True,
            "message": "No rework cycle — initial review.",
            "current_cycle": 0,
        }

    # The CURRENT cycle's results — the LAST exact section, selected by the same
    # rule the sibling subchecks and resolve_gate use (stories 162-21, 162-28).
    # The old reader took the FIRST match and truncated on
    # `^## (?!Subagent Results)`, a lookahead that skipped same-named headings and
    # so concatenated consecutive cycles: an older cycle's tag vouched for a
    # current section that was never re-run. That is B1's fail-open.
    from pf.handoff.gate_recovery import section_preamble, select_last_section

    selected = select_last_section(session_content, "Subagent Results")
    if selected["status"] == "absent":
        return {
            "pass": False,
            "message": (
                f"Rework cycle {cycle} is active but no Subagent Results section found. "
                f"To fix: add a `## Subagent Results` section for the current cycle. "
                f"{_FRESHNESS_ROUTES}"
            ),
            "current_cycle": cycle,
        }
    if selected["status"] == "ambiguous":
        return {
            "pass": False,
            "message": (
                f"Rework cycle {cycle} is active but the current '## Subagent Results' "
                f"section cannot be determined: {selected['detail']}. To fix: repeat the "
                "exact `## Subagent Results` heading for each review cycle."
            ),
            "current_cycle": cycle,
        }

    # Only the section's own preamble attests to its table — a tag under an
    # appended `### Reviewer Notes` speaks for that subsection, not for the results.
    section = section_preamble(selected["section"])

    # The tag is a standalone column-0 `**Cycle: N**` line, nothing that merely
    # resembles one. select_last_section has already masked illustrative regions
    # (fences, HTML comments, indented blocks, inline backticks), so no quoted
    # example can vouch for this table either.
    tags = [int(value) for value in _CYCLE_TAG_RE.findall(section)]
    if not tags:
        return {
            "pass": False,
            "message": (
                f"Rework cycle {cycle} is active but Subagent Results has no cycle tag. "
                f"To fix: add the line '**Cycle: {cycle}**' to the Subagent Results "
                "section. It must be a line of its own, starting at column 0 — a tag "
                "quoted in a code fence, an indented example, backticks, an HTML "
                "comment, a table cell or prose does not count, and neither does one "
                f"under a `###` subsection of this section. {_FRESHNESS_ROUTES}"
            ),
            "current_cycle": cycle,
        }

    # EVERY tag in the section must agree. Tags that disagree cannot both be true,
    # and picking one is how the section reader used to fail open.
    stale = [value for value in tags if value != cycle]
    if stale:
        return {
            "pass": False,
            "message": (
                f"Stale subagent results: results are from cycle {stale[0]} "
                f"but current rework cycle is {cycle}. "
                f"To fix: leave no tag other than '**Cycle: {cycle}**' in the current "
                f"section. {_FRESHNESS_ROUTES}"
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
