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

# Verdict vocabulary — one place. `gates/approval.md` and the reviewer
# template cite the same words (APPROVED / CHANGES_REQUESTED / REJECTED).
_VERDICT_RE = re.compile(r"^[ \t]*\*\*Verdict:\*\*[ \t]*(.*)$", re.MULTILINE)
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


def assessment_heading(agent: str) -> str:
    """The session heading an agent writes its assessment under.

    Mirrors ``session_assessment.missing_assessment_error`` so the heading
    resolve_gate reads is the heading agents are told to write (SOUL #2).
    """
    return f"{agent.replace('-', ' ').title()} Assessment"


def extract_agent_verdict(session_content: str, agent: str) -> str | None:
    """Raw verdict text from the LAST ``## <Agent> Assessment`` section.

    A rework session accumulates one assessment section per cycle; the current
    cycle is the LAST one. Matching the first heading reads a stale verdict —
    the defect class story 162-5 documented.

    The heading match is deliberately as permissive as every other reader of
    the same heading — ``session_assessment.has_assessment`` and
    ``complete_phase._check_subagent_dispatch`` both accept a suffixed
    ``## Reviewer Assessment (Cycle 2)``. A stricter pattern here would skip
    the suffixed CURRENT section and read the stale prior one (gh #49). The
    trailing ``\\b`` still refuses a different word: ``## Reviewer Assessments``
    is not this heading.

    Returns:
        The text after ``**Verdict:**``, or None if the section or the verdict
        line is absent.
    """
    heading = assessment_heading(agent)
    pattern = re.compile(rf"^##\s+{re.escape(heading)}\b.*$", re.MULTILINE | re.IGNORECASE)
    matches = list(pattern.finditer(session_content))
    if not matches:
        return None

    section = session_content[matches[-1].end() :]
    next_heading = re.search(r"^##\s+", section, re.MULTILINE)
    if next_heading:
        section = section[: next_heading.start()]

    verdict = _VERDICT_RE.search(section)
    return verdict.group(1) if verdict else None


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
