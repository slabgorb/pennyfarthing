"""Status normalization and transition validation.

Story: 150-12 — Audit in_review flow — spelling consistency and transition gating.

Provides:
- normalize_status(status) — canonical form for variant spellings
- VALID_TRANSITIONS — state machine map
- is_valid_transition(from_status, to_status) — checks with normalization
"""

# Canonical status aliases: maps variant spellings to canonical underscore form.
# Keys are lowercased for case-insensitive lookup.
_STATUS_ALIASES: dict[str, str] = {
    # in_review variants
    "in_review": "in_review",
    "in-review": "in_review",
    "in review": "in_review",
    # in_progress variants
    "in_progress": "in_progress",
    "in-progress": "in_progress",
    "in progress": "in_progress",
    # pass-through statuses (included for completeness)
    "backlog": "backlog",
    "done": "done",
    "canceled": "canceled",
    "ready": "ready",
    "todo": "todo",
}


def normalize_status(status: str | None) -> str:
    """Normalize a status string to its canonical underscore form.

    Handles case-insensitive matching and variant separators
    (hyphen, space, underscore).  Accepts ``None`` (returns ``""``).

    Returns the original string (lowercased) if no alias is found.
    """
    if not status:
        return ""
    lowered = status.strip().lower()
    # Try direct lookup first
    if lowered in _STATUS_ALIASES:
        return _STATUS_ALIASES[lowered]
    # Normalize separators: replace hyphens and spaces with underscores, then retry
    normalized = lowered.replace("-", "_").replace(" ", "_")
    if normalized in _STATUS_ALIASES:
        return _STATUS_ALIASES[normalized]
    return normalized


# Valid transitions: from_status -> list of allowed to_statuses.
# Mirrors story_transition.TRANSITIONS but uses lists for JSON serialization.
VALID_TRANSITIONS: dict[str, list[str]] = {
    "backlog": ["in_progress", "canceled"],
    "in_progress": ["in_review", "canceled"],
    "in_review": ["done", "canceled"],
    "done": ["canceled"],
    "canceled": [],
}


def is_valid_transition(from_status: str, to_status: str) -> bool:
    """Check whether a status transition is allowed.

    Both statuses are normalized before checking the transition map.
    """
    norm_from = normalize_status(from_status)
    norm_to = normalize_status(to_status)
    valid_targets = VALID_TRANSITIONS.get(norm_from, [])
    return norm_to in valid_targets
