"""Review-finding disposition rules (ADR-0043).

The review pipeline used to promote every confirmed finding to a story by
default, so the backlog measured reviewer throughput rather than remaining
product work. ADR-0043 closes that triage gap with a disposition gate at
reviewer exit: every confirmed finding gets exactly one disposition, and only
``[SEC]``/correctness findings may auto-promote to a tracked story.

This module is the pure-logic core the reviewer exit gate calls. It is kept
separate from :mod:`pf.reviewer.findings` (story 150-20), whose ``Finding``
carries a legacy go/no-go ``FIX``/``RECORD`` disposition — see the Design
Deviation logged for 162-78 for the reconciliation decision.

Functions return result dicts (SOUL #10 — return results, don't throw).

Story: 162-78
"""

from __future__ import annotations

# ADR-0043 disposition vocabulary.
VALID_DISPOSITIONS = frozenset({"fix-now", "fold", "defer", "drop"})

# Only these categories may auto-promote a ``defer`` into a tracked story.
PROMOTABLE_CATEGORIES = frozenset({"SEC", "correctness"})

# Findings the reviewer would label chore-grade never earn a story.
_NEVER_PROMOTE_CATEGORY = "chore-grade"

# Dispositions that resolve inside the current PR / review — never a story.
_NON_STORY_DISPOSITIONS = frozenset({"fix-now", "fold", "drop"})

# Per-epic cap on review-spawned ``defer`` stories; overflow collapses into a
# single "review-debt" story instead of unbounded fan-out.
DEFAULT_FOLLOWUP_BUDGET = 10


def classify_promotion(
    *,
    disposition: str,
    category: str | None,
    justification: str | None = None,
) -> dict:
    """Decide whether a confirmed finding becomes a tracked story.

    Args:
        disposition: One of :data:`VALID_DISPOSITIONS`.
        category: The finding category — ``SEC``, ``correctness``,
            ``chore-grade``, or anything else ("other").
        justification: One-line reason required to ``defer`` a
            non-``[SEC]``/non-correctness finding.

    Returns:
        ``{"valid", "becomes_story", "effective_disposition", "error"}``.
    """
    if disposition not in VALID_DISPOSITIONS:
        return {
            "valid": False,
            "becomes_story": False,
            "effective_disposition": disposition,
            "error": (
                f"Invalid disposition '{disposition}'. "
                f"Must be one of: {', '.join(sorted(VALID_DISPOSITIONS))}"
            ),
        }

    # fix-now / fold / drop resolve in place — never a story.
    if disposition in _NON_STORY_DISPOSITIONS:
        return {
            "valid": True,
            "becomes_story": False,
            "effective_disposition": disposition,
            "error": None,
        }

    # disposition == "defer" below.
    if category == _NEVER_PROMOTE_CATEGORY:
        return {
            "valid": False,
            "becomes_story": False,
            "effective_disposition": "drop",
            "error": "chore-grade findings never get a story; drop it",
        }

    if category in PROMOTABLE_CATEGORIES:
        # Auto-promotion: [SEC]/correctness may defer without justification.
        return {
            "valid": True,
            "becomes_story": True,
            "effective_disposition": "defer",
            "error": None,
        }

    # Any other category must argue its way up with an explicit justification.
    if justification and justification.strip():
        return {
            "valid": True,
            "becomes_story": True,
            "effective_disposition": "defer",
            "error": None,
        }

    return {
        "valid": False,
        "becomes_story": False,
        "effective_disposition": "drop",
        "error": (
            "defer on a non-[SEC]/non-correctness finding requires a "
            "justification; defaults to drop"
        ),
    }


def apply_followup_budget(
    *,
    new_defers: int,
    existing_defers: int,
    budget: int = DEFAULT_FOLLOWUP_BUDGET,
) -> dict:
    """Apply the per-epic follow-up budget to a batch of new ``defer`` stories.

    Under (or exactly at) budget, each new defer becomes its own story. Beyond
    the cap, the overflow collapses into a single "review-debt" story.

    Returns:
        ``{"stories_created", "review_debt_story", "collapsed"}``.
    """
    allowed = max(0, budget - existing_defers)
    filled = min(new_defers, allowed)
    collapsed = new_defers - filled
    review_debt_story = collapsed > 0
    stories_created = filled + (1 if review_debt_story else 0)
    return {
        "stories_created": stories_created,
        "review_debt_story": review_debt_story,
        "collapsed": collapsed,
    }


def validate_dispositions(findings: list[dict]) -> dict:
    """Validate that every confirmed finding carries a legal disposition.

    Each finding is a mapping with ``id``, ``disposition``, ``category``, and
    optionally ``justification``. Reports every offender, not just the first
    (162-47 diligence rule).

    Returns:
        ``{"valid": bool, "errors": [str]}``.
    """
    errors: list[str] = []

    for finding in findings:
        fid = finding.get("id", "?")
        disposition = (finding.get("disposition") or "").strip()

        if not disposition:
            errors.append(f"Finding {fid}: missing disposition")
            continue

        result = classify_promotion(
            disposition=disposition,
            category=finding.get("category"),
            justification=finding.get("justification"),
        )
        if not result["valid"]:
            errors.append(f"Finding {fid}: {result['error'] or 'invalid disposition'}")

    return {"valid": len(errors) == 0, "errors": errors}
