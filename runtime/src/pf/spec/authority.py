"""Spec authority hierarchy validation.

Provides the 4-level authority hierarchy used by all agents to resolve
conflicting guidance. Higher levels (lower numbers) take precedence.

Levels:
    1. Story scope — ACs in the session file (highest authority)
    2. Story context — technical approach, design decisions in session
    3. Epic context — epic-level goals and constraints
    4. Architecture docs / SOUL.md — project-wide principles
"""

from __future__ import annotations

_AUTHORITY_LEVELS: list[dict[str, object]] = [
    {
        "level": 1,
        "name": "Story scope",
        "description": (
            "Acceptance criteria in the session file. "
            "Highest authority — defines what must be built."
        ),
    },
    {
        "level": 2,
        "name": "Story context",
        "description": (
            "Technical approach and design decisions in the session file. "
            "Informs how to satisfy ACs but does not override them."
        ),
    },
    {
        "level": 3,
        "name": "Epic context",
        "description": (
            "Epic-level goals, constraints, and non-functional requirements. "
            "Broader direction that yields to story-level specifics."
        ),
    },
    {
        "level": 4,
        "name": "Architecture docs / SOUL.md",
        "description": (
            "Project-wide architectural principles, ADRs, and SOUL.md. "
            "Default baseline when no higher-level spec addresses the topic."
        ),
    },
]


def get_authority_levels() -> list[dict[str, object]]:
    """Return the 4 authority levels in precedence order (1 = highest).

    Each dict has keys: level (int), name (str), description (str).
    """
    # Return copies to prevent mutation of the module-level data.
    return [dict(item) for item in _AUTHORITY_LEVELS]


def check_deviation_required(
    proposed_change_level: int,
    current_spec_level: int,
) -> bool:
    """Check whether a proposed change requires deviation logging.

    Returns True when the proposed change operates at a *lower* authority
    level (higher number) than the current spec — meaning the agent would
    be overriding a higher-authority spec with a lower-authority rationale.

    Args:
        proposed_change_level: Authority level of the proposed change (1-4).
        current_spec_level: Authority level of the spec being overridden (1-4).

    Returns:
        True if deviation logging and escalation are required.
    """
    return proposed_change_level > current_spec_level
