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
    raise NotImplementedError("RED state — implementation pending")


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
    raise NotImplementedError("RED state — implementation pending")


def parse_story_id(story_id: str) -> tuple[str, str]:
    """Extract epic ID and story ID from a story identifier.

    Args:
        story_id: Story identifier (e.g., "131-2")

    Returns:
        Tuple of (epic_id, story_id) e.g., ("131", "131-2")

    Raises:
        ValueError: If story_id format is invalid
    """
    raise NotImplementedError("RED state — implementation pending")
