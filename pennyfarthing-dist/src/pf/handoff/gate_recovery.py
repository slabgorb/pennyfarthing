"""Gate recovery — auto-trigger context creation on gate failure.

When a gate check fails because required context is missing (not invalid),
the recovery module identifies which context needs creation and returns
ordered recovery actions. Recovery config lives in the workflow YAML
as a `recovery:` block on the gate definition.

Story: 131-2 (SM Auto-Triggers Context Creation on Gate Failure)
Epic: 131 (Gate-Enforced Context Pipeline)

Key constraints:
- One attempt per level (Rule #6) — no retry loops
- Only "not found" failures trigger creation, not validation errors
- Recovery order: epic first, then story (cascade)
"""

from __future__ import annotations

import re

from pf.handoff.session_assessment import assessment_heading

# Verdict vocabulary — one place. `gates/approval.md` and the reviewer
# template cite the same words (APPROVED / CHANGES_REQUESTED / REJECTED).
# Column 0 only: every verdict line in this repo's history is unindented, so an
# indented one is an illustration inside a list or code block, not the verdict.
_VERDICT_RE = re.compile(r"^\*\*Verdict:\*\*[ \t]*(.*)$", re.MULTILINE)
# Fence opener/closer, capturing the delimiter so a ``` line cannot close a ~~~
# block. CommonMark treats the two types as non-interchangeable, and mixing them
# inside one explanation is ordinary agent output.
_FENCE_RE = re.compile(r"^[ \t]*(`{3,}|~{3,})")
# Rejection vocabulary is deliberately WIDER than the approval vocabulary: every
# spelling reviewers actually use (`REJECT`, `⛔ REJECT — return to Dev`,
# `REQUEST-CHANGES`, `CHANGES-REQUESTED` all appear in this repo's history) must
# reach the rework loop, whereas an unrecognized near-approval (`APPROVE`,
# `APPROVE WITH FINDINGS`) must block and be told to write `APPROVED`. The
# asymmetry is the point — widening rejections is fail-safe, widening approvals
# is how a story gets archived unreviewed. `REJECT(?:ED)?\b` refuses `REJECTION`,
# which post-rework approvals mention ("initial rejection resolved").
_REJECTION_WORDS = (
    r"REJECT(?:ED)?|CHANGES REQUESTED|REQUEST(?:ED)? CHANGES|NOT APPROVED|BLOCKED"
)
# Leading-token forms decide first. A post-rework approval routinely cites the
# round it supersedes — "APPROVED (round-trip 1 — Round 1 REJECTED, rework
# verified closed)" is real verdict text from this repo's history — so a
# whole-line rejection search would send a genuine approval back to Dev until
# max_attempts blocked it. `NOT APPROVED` stays in the rejection alternation so
# it wins over the bare `APPROVED` prefix.
_LEADING_REJECTION_RE = re.compile(rf"^({_REJECTION_WORDS})\b")
_LEADING_APPROVAL_RE = re.compile(r"^APPROVED\b")
_REJECTION_RE = re.compile(rf"\b({_REJECTION_WORDS})\b")
_APPROVAL_RE = re.compile(r"\bAPPROVED\b")


def get_recovery_actions(
    gate_result: dict,
    recovery_config: dict | None,
    story_id: str,
) -> list[dict]:
    """Match failed gate checks against recovery definitions.

    Scans gate_result checks for failures that match recovery config entries.
    Only triggers recovery for "not found" failures (exit 2), not validation
    errors (exit 1).

    Args:
        gate_result: Parsed GATE_RESULT from extract_gate_result().
            Expected shape: {status, message, checks: [{name, status, detail}]}
        recovery_config: Recovery section from workflow phase gate config.
            Shape: {check_name: {action, type, max_attempts}}
            None if no recovery config exists.
        story_id: Story identifier (e.g., "131-2")

    Returns:
        Ordered list of recovery action dicts:
            check_name: str - which check failed
            context_type: str - "epic" | "story"
            target_id: str - epic number or story ID
            max_attempts: int
    """
    if not recovery_config:
        return []

    epic_id, _ = parse_story_id(story_id)
    actions: list[dict] = []

    for check in gate_result.get("checks", []):
        if check.get("status") != "fail":
            continue

        name = check.get("name", "")
        if name not in recovery_config:
            continue

        if not _is_recoverable(check):
            continue

        cfg = recovery_config[name]
        context_type = cfg["type"]
        target_id = epic_id if context_type == "epic" else story_id

        actions.append(
            {
                "check_name": name,
                "context_type": context_type,
                "target_id": target_id,
                "max_attempts": cfg.get("max_attempts", 1),
            }
        )

    return actions


def format_recovery_outcome(
    context_type: str,
    target_id: str,
    created: bool,
    validated: bool | None,
) -> dict:
    """Format outcome message for context auto-creation.

    Three scenarios per story spec:
    1. created=True, validated=True → continue silently (no message)
    2. created=True, validated=False → warning with manual fix path
    3. created=False → error with manual creation command

    Args:
        context_type: "epic" or "story"
        target_id: Epic number or story ID
        created: Whether creation succeeded
        validated: Whether re-validation passed (None if creation failed)

    Returns:
        dict with keys:
            message: str | None (None = continue silently)
            severity: "info" | "warning" | "error"
    """
    path = f"sprint/context/context-{context_type}-{target_id}.md"

    if not created:
        return {
            "message": (
                f"Context creation failed. "
                f"Run `/pf-context create {context_type} {target_id}` manually"
            ),
            "severity": "error",
        }

    if validated:
        return {"message": None, "severity": "info"}

    return {
        "message": (f"Context created but has validation errors. Manual fix needed at {path}"),
        "severity": "warning",
    }


def parse_story_id(story_id: str) -> tuple[str, str]:
    """Extract epic ID and story ID from a story identifier.

    Args:
        story_id: Story identifier (e.g., "131-2")

    Returns:
        Tuple of (epic_id, story_id) e.g., ("131", "131-2")

    Raises:
        ValueError: If story_id format is invalid
    """
    if not story_id:
        raise ValueError(f"Invalid story ID: {story_id!r}")

    match = re.match(r"^(\d+)-(\d+)$", story_id)
    if not match:
        raise ValueError(f"Invalid story ID format: {story_id!r}")

    return match.group(1), story_id


def has_rework_action(recovery_config: dict | None) -> bool:
    """Whether ``recovery_config`` declares a ``rework`` action at all.

    Checked separately from :func:`get_rework_recovery` because the attempt
    ceiling must only be consulted once the verdict says rework — an APPROVED
    verdict finishes even after max_attempts round-trips.
    """
    if not recovery_config:
        return False
    return any(
        isinstance(entry, dict) and entry.get("action") == "rework"
        for entry in recovery_config.values()
    )


def mask_illustrative_regions(content: str) -> str:
    """Blank out fenced and indented code regions, preserving byte offsets.

    Reviewers quote the verdict format when explaining it, so a session can
    legitimately contain a ``**Verdict:**`` or ``## … Assessment`` line that is
    an EXAMPLE. Reading one as operative is fail-open: it can archive a rejected
    story, the exact defect 162-21 exists to close. Requiring agents to know
    "never let a verdict-shaped line appear in your prose" would be a rule
    enforced by goodwill (SOUL #6); masking enforces it mechanically.

    Every masked line becomes spaces of the same length so downstream match
    offsets still index into a string of identical shape. An unterminated fence
    masks everything after it — a verdict that cannot be read blocks, which is
    the safe direction.
    """
    masked: list[str] = []
    open_delim: str | None = None
    for line in content.split("\n"):
        fence = _FENCE_RE.match(line)
        if fence:
            delim = fence.group(1)[0]
            if open_delim is None:
                open_delim = delim
                masked.append(" " * len(line))
                continue
            if delim == open_delim:
                open_delim = None
                masked.append(" " * len(line))
                continue
            # A fence of the OTHER type inside an open block is content, not a
            # closer — closing on it would expose the rest of the block.
            masked.append(" " * len(line))
            continue
        masked.append(" " * len(line) if open_delim is not None else line)
    return "\n".join(masked)


def select_last_section(content: str, heading: str) -> dict:
    """Slice the LAST section introduced by an exact ``## <heading>`` line.

    The single selection rule for every reader of a session file. Both halves of
    the exit protocol use it — ``resolve_gate`` to find the verdict and
    ``complete_phase`` to find the specialist tags and results table — so they
    cannot disagree about which cycle is current (gh #49). A session accumulates
    one section per rework cycle by appending, so the current cycle is the last.

    Illustrative regions are masked first, so a heading quoted inside a code
    fence neither becomes the section nor moves its boundary.

    Args:
        content: Full session file text.
        heading: Heading text without the leading ``##`` (e.g. "Subagent Results").

    Returns:
        dict with:
            status: "found" | "absent" | "ambiguous"
            section: the section body when status is "found", else ""
            detail: human-readable reason for "absent"/"ambiguous"
    """
    exact = re.compile(rf"^##[ \t]+{re.escape(heading)}[ \t]*$", re.MULTILINE | re.IGNORECASE)
    near_miss = re.compile(rf"^##[ \t]+{re.escape(heading)}\b.*$", re.MULTILINE | re.IGNORECASE)

    masked = mask_illustrative_regions(content)
    matches = list(exact.finditer(masked))
    if not matches:
        return {"status": "absent", "section": "", "detail": f"no `## {heading}` section"}

    last = matches[-1]

    # A heading that merely STARTS with the phrase may be a newer cycle whose
    # content would be silently skipped, so it is neither read nor ignored. No
    # character class can tell a cycle marker `(Cycle 2)` from a section title
    # `(Summary)`, so the ambiguity is reported instead of guessed at.
    stragglers = [
        m.group(0).strip() for m in near_miss.finditer(masked) if m.start() > last.start()
    ]
    if stragglers:
        return {
            "status": "ambiguous",
            "section": "",
            "detail": (
                f"the heading {stragglers[-1]!r} follows the last exact "
                f"`## {heading}` heading. Cycles are identified by repeating the "
                f"EXACT heading, so a suffixed one is not read — and it cannot be "
                f"ignored either, since it may be the current cycle"
            ),
        }

    section = masked[last.end() :]
    next_heading = re.search(r"^##[ \t]+", section, re.MULTILINE)
    if next_heading:
        section = section[: next_heading.start()]

    return {"status": "found", "section": section, "detail": ""}


def read_agent_verdict(session_content: str, agent: str) -> dict:
    """Read the operative verdict from an agent's assessment section.

    **This function never picks a winner.** Three review cycles established that
    every selection rule has a mirror failure: first-line-wins lets an
    illustrative example above the real verdict govern, last-line-wins lets a
    prose citation of a superseded verdict govern, and any accepted heading
    suffix lets a supplementary section shadow the real one. Each patch closed
    one direction and opened the other. So instead of resolving ambiguity, this
    reports it, and the caller blocks — the only outcome that cannot archive a
    rejected story.

    The rules:

    - **Section identity is the EXACT heading.** Cycles are distinguished by
      POSITION (the last exact match), never by parsing suffix prose — no
      character class can tell a cycle marker (``(Cycle 2)``) from a section
      title (``(Summary)``).
    - **A near-miss heading after the last exact one is ambiguous.** It may be a
      newer cycle whose verdict would be silently ignored, so it blocks with an
      actionable message instead of reading the older section.
    - **Exactly one column-0 verdict line** in the selected section. Zero is
      absent; two or more is ambiguous. Illustrations are excluded first (see
      :func:`mask_illustrative_regions`), and an indented verdict line is an
      example, not a verdict.

    Returns:
        dict with:
            status: "found" | "absent" | "ambiguous"
            verdict: raw verdict text when status is "found", else None
            detail: human-readable reason for "absent"/"ambiguous"
    """
    selected = select_last_section(session_content, assessment_heading(agent))
    if selected["status"] != "found":
        return {"status": selected["status"], "verdict": None, "detail": selected["detail"]}

    section = selected["section"]
    verdicts = [m.group(1) for m in _VERDICT_RE.finditer(section)]
    if not verdicts:
        return {"status": "absent", "verdict": None, "detail": "no `**Verdict:**` line"}
    if len(verdicts) > 1:
        return {
            "status": "ambiguous",
            "verdict": None,
            "detail": (
                f"{len(verdicts)} `**Verdict:**` lines in one section "
                f"({', '.join(repr(v[:40]) for v in verdicts)})"
            ),
        }

    return {"status": "found", "verdict": verdicts[0], "detail": ""}


def classify_verdict(raw: str | None) -> str | None:
    """Classify a raw verdict string.

    The verdict is the LEADING token; everything after it is the reviewer's
    prose, which frequently names the opposite outcome ("APPROVED (supersedes
    the round-1 REJECTED verdict above)"). Only when the line opens with
    neither vocabulary word do we fall back to searching the whole line, so
    free-form text still fails closed rather than reading as approval.

    Returns:
        "approved" | "rework" | None (absent or unrecognized — fail closed).
    """
    if raw is None:
        return None

    # Markdown, punctuation, emoji and underscores are noise: `**APPROVED**`,
    # `changes_requested` and `APPROVED ✅` all normalize to bare words.
    normalized = re.sub(r"[^A-Za-z0-9]+", " ", raw).upper().strip()
    if not normalized:
        return None

    # Leading token wins. Rejections are tested first so `NOT APPROVED` beats
    # the bare `APPROVED` prefix.
    if _LEADING_REJECTION_RE.match(normalized):
        return "rework"
    if _LEADING_APPROVAL_RE.match(normalized):
        return "approved"

    # No recognized opening token — fall back to a whole-line search, still
    # rejection-first, so anything ambiguous errs toward another Dev cycle.
    if _REJECTION_RE.search(normalized):
        return "rework"
    if _APPROVAL_RE.search(normalized):
        return "approved"
    return None


def parse_round_trip_count(session_content: str) -> int:
    """Round-trips already recorded in the session. Unparseable → 0.

    Same pattern complete_phase writes with, so the two agree.
    """
    match = re.search(r"\*\*Round-Trip Count:\*\*\s*(\d+)", session_content)
    return int(match.group(1)) if match else 0


def get_rework_recovery(
    recovery_config: dict,
    round_trip_count: int,
) -> dict | None:
    """Check if a recovery config contains a rework action and whether it's allowed.

    Args:
        recovery_config: Recovery section from workflow phase gate config.
        round_trip_count: How many round-trips have already occurred.

    Returns:
        Dict with status/target_phase/reason if rework action found, None otherwise.
    """
    for entry in recovery_config.values():
        if not isinstance(entry, dict) or entry.get("action") != "rework":
            continue

        max_attempts = entry.get("max_attempts", 1)
        target_phase = entry.get("target_phase")

        if round_trip_count >= max_attempts:
            return {
                "status": "blocked",
                "reason": f"Max_attempts ({max_attempts}) reached after {round_trip_count} round-trips",
            }

        return {
            "status": "rework",
            "target_phase": target_phase,
        }

    return None


def _is_recoverable(check: dict) -> bool:
    """Check if a failed gate check is recoverable (missing vs invalid).

    Returns True if the check failed because the target was not found,
    not because it had validation errors.
    """
    detail = check.get("detail", "").lower()
    if "validation error" in detail:
        return False
    return any(kw in detail for kw in ("missing", "not found", "not exist"))
