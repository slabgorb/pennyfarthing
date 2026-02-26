"""Tests for gate recovery — auto-trigger context creation on gate failure.

Story: 131-2 (SM Auto-Triggers Context Creation on Gate Failure)
Epic: 131 (Gate-Enforced Context Pipeline)

Tests the recovery module that:
- Detects context-related gate failures (missing, not invalid)
- Returns ordered recovery actions from workflow config
- Formats outcome messages per the three failure scenarios
- Parses story IDs to extract epic/story identifiers

Acceptance Criteria (from epic context):
- [AC1] When gate reports epic-context-validated failed (exit 2/not found),
         returns epic creation recovery action
- [AC2] When gate reports story-context-validated failed (exit 2/not found),
         returns story creation recovery action
- [AC3] Recovery cascade: epic first, then story
- [AC4] One attempt per level (max_attempts=1), no retry loops
- [AC5] Validation errors (exit 1) do NOT trigger recovery
- [AC6] Message: created+passed → continue silently
- [AC7] Message: created+failed → "Context created but has validation errors.
         Manual fix needed at {path}"
- [AC8] Message: creation failed → "Context creation failed.
         Run `/pf-context create {type} {id}` manually"
"""

from __future__ import annotations

import pytest

from pf.handoff.gate_recovery import (
    format_recovery_outcome,
    get_recovery_actions,
    parse_story_id,
)


# ---------------------------------------------------------------------------
# Fixtures: Gate results
# ---------------------------------------------------------------------------

GATE_ALL_PASS = {
    "status": "pass",
    "message": "Session 131-2 ready. Workflow: tdd, Branch: feature/131-2",
    "checks": [
        {
            "name": "session-exists",
            "status": "pass",
            "detail": ".session/131-2-session.md exists",
        },
        {
            "name": "session-fields-set",
            "status": "pass",
            "detail": "Workflow: tdd, Phase: setup",
        },
        {
            "name": "epic-context-validated",
            "status": "pass",
            "detail": "sprint/context/context-epic-131.md valid",
        },
        {
            "name": "story-context-validated",
            "status": "pass",
            "detail": "sprint/context/context-story-131-2.md valid",
        },
        {
            "name": "branch-created",
            "status": "pass",
            "detail": "Branch feature/131-2 created in pennyfarthing",
        },
    ],
}

GATE_EPIC_MISSING = {
    "status": "fail",
    "message": "Setup incomplete: epic context missing",
    "checks": [
        {
            "name": "session-exists",
            "status": "pass",
            "detail": ".session/131-2-session.md exists",
        },
        {
            "name": "session-fields-set",
            "status": "pass",
            "detail": "Workflow: tdd, Phase: setup",
        },
        {
            "name": "epic-context-validated",
            "status": "fail",
            "detail": "sprint/context/context-epic-131.md missing",
        },
        {
            "name": "story-context-validated",
            "status": "pass",
            "detail": "sprint/context/context-story-131-2.md valid",
        },
        {
            "name": "branch-created",
            "status": "pass",
            "detail": "Branch feature/131-2 created in pennyfarthing",
        },
    ],
}

GATE_STORY_MISSING = {
    "status": "fail",
    "message": "Setup incomplete: story context missing",
    "checks": [
        {
            "name": "session-exists",
            "status": "pass",
            "detail": ".session/131-2-session.md exists",
        },
        {
            "name": "session-fields-set",
            "status": "pass",
            "detail": "Workflow: tdd, Phase: setup",
        },
        {
            "name": "epic-context-validated",
            "status": "pass",
            "detail": "sprint/context/context-epic-131.md valid",
        },
        {
            "name": "story-context-validated",
            "status": "fail",
            "detail": "sprint/context/context-story-131-2.md missing",
        },
        {
            "name": "branch-created",
            "status": "pass",
            "detail": "Branch feature/131-2 created in pennyfarthing",
        },
    ],
}

GATE_BOTH_MISSING = {
    "status": "fail",
    "message": "Setup incomplete: epic and story context missing",
    "checks": [
        {
            "name": "session-exists",
            "status": "pass",
            "detail": ".session/131-2-session.md exists",
        },
        {
            "name": "session-fields-set",
            "status": "pass",
            "detail": "Workflow: tdd, Phase: setup",
        },
        {
            "name": "epic-context-validated",
            "status": "fail",
            "detail": "sprint/context/context-epic-131.md missing",
        },
        {
            "name": "story-context-validated",
            "status": "fail",
            "detail": "sprint/context/context-story-131-2.md missing",
        },
        {
            "name": "branch-created",
            "status": "pass",
            "detail": "Branch feature/131-2 created in pennyfarthing",
        },
    ],
}

GATE_EPIC_INVALID = {
    "status": "fail",
    "message": "Setup incomplete: epic context has validation errors",
    "checks": [
        {
            "name": "session-exists",
            "status": "pass",
            "detail": ".session/131-2-session.md exists",
        },
        {
            "name": "session-fields-set",
            "status": "pass",
            "detail": "Workflow: tdd, Phase: setup",
        },
        {
            "name": "epic-context-validated",
            "status": "fail",
            "detail": "Validation errors: missing sections [Background, Technical Architecture]",
        },
        {
            "name": "story-context-validated",
            "status": "pass",
            "detail": "sprint/context/context-story-131-2.md valid",
        },
        {
            "name": "branch-created",
            "status": "pass",
            "detail": "Branch feature/131-2 created in pennyfarthing",
        },
    ],
}

GATE_BRANCH_FAILED = {
    "status": "fail",
    "message": "Setup incomplete: still on main branch",
    "checks": [
        {
            "name": "session-exists",
            "status": "pass",
            "detail": ".session/131-2-session.md exists",
        },
        {
            "name": "session-fields-set",
            "status": "pass",
            "detail": "Workflow: tdd, Phase: setup",
        },
        {
            "name": "epic-context-validated",
            "status": "pass",
            "detail": "sprint/context/context-epic-131.md valid",
        },
        {
            "name": "story-context-validated",
            "status": "pass",
            "detail": "sprint/context/context-story-131-2.md valid",
        },
        {
            "name": "branch-created",
            "status": "fail",
            "detail": "On branch main, expected feature branch",
        },
    ],
}


# ---------------------------------------------------------------------------
# Fixtures: Recovery config
# ---------------------------------------------------------------------------

RECOVERY_CONFIG = {
    "epic-context-validated": {
        "action": "create_context",
        "type": "epic",
        "max_attempts": 1,
    },
    "story-context-validated": {
        "action": "create_context",
        "type": "story",
        "max_attempts": 1,
    },
}


# ===========================================================================
# AC1 + AC2: get_recovery_actions detects missing context
# ===========================================================================


class TestGetRecoveryActionsNoop:
    """When no recovery is needed, return empty list."""

    def test_all_checks_pass_returns_empty(self) -> None:
        """AC1: Gate with all passing checks → no recovery actions."""
        actions = get_recovery_actions(GATE_ALL_PASS, RECOVERY_CONFIG, "131-2")
        assert actions == []

    def test_no_recovery_config_returns_empty(self) -> None:
        """No recovery config → no recovery actions even when checks fail."""
        actions = get_recovery_actions(GATE_EPIC_MISSING, None, "131-2")
        assert actions == []

    def test_empty_recovery_config_returns_empty(self) -> None:
        """Empty recovery config → no recovery actions."""
        actions = get_recovery_actions(GATE_EPIC_MISSING, {}, "131-2")
        assert actions == []


class TestGetRecoveryActionsEpicMissing:
    """AC1: Epic context missing triggers recovery."""

    def test_epic_missing_returns_one_action(self) -> None:
        """AC1: Epic check fails (missing) → one recovery action."""
        actions = get_recovery_actions(GATE_EPIC_MISSING, RECOVERY_CONFIG, "131-2")
        assert len(actions) == 1

    def test_epic_missing_action_has_correct_check_name(self) -> None:
        """AC1: Recovery action references the correct check."""
        actions = get_recovery_actions(GATE_EPIC_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["check_name"] == "epic-context-validated"

    def test_epic_missing_action_has_context_type_epic(self) -> None:
        """AC1: Recovery action type is 'epic'."""
        actions = get_recovery_actions(GATE_EPIC_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["context_type"] == "epic"

    def test_epic_missing_target_id_is_epic_number(self) -> None:
        """AC1: Target ID for epic recovery is the epic number, not story ID."""
        actions = get_recovery_actions(GATE_EPIC_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["target_id"] == "131"


class TestGetRecoveryActionsStoryMissing:
    """AC2: Story context missing triggers recovery."""

    def test_story_missing_returns_one_action(self) -> None:
        """AC2: Story check fails (missing) → one recovery action."""
        actions = get_recovery_actions(GATE_STORY_MISSING, RECOVERY_CONFIG, "131-2")
        assert len(actions) == 1

    def test_story_missing_action_has_correct_check_name(self) -> None:
        """AC2: Recovery action references the correct check."""
        actions = get_recovery_actions(GATE_STORY_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["check_name"] == "story-context-validated"

    def test_story_missing_action_has_context_type_story(self) -> None:
        """AC2: Recovery action type is 'story'."""
        actions = get_recovery_actions(GATE_STORY_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["context_type"] == "story"

    def test_story_missing_target_id_is_story_id(self) -> None:
        """AC2: Target ID for story recovery is the full story ID."""
        actions = get_recovery_actions(GATE_STORY_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["target_id"] == "131-2"


# ===========================================================================
# AC3: Recovery cascade order
# ===========================================================================


class TestGetRecoveryActionsCascade:
    """AC3: When both epic and story are missing, epic comes first."""

    def test_both_missing_returns_two_actions(self) -> None:
        """AC3: Both checks fail → two recovery actions."""
        actions = get_recovery_actions(GATE_BOTH_MISSING, RECOVERY_CONFIG, "131-2")
        assert len(actions) == 2

    def test_epic_is_first_in_cascade(self) -> None:
        """AC3: Epic recovery comes before story in the cascade."""
        actions = get_recovery_actions(GATE_BOTH_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["context_type"] == "epic"

    def test_story_is_second_in_cascade(self) -> None:
        """AC3: Story recovery comes after epic in the cascade."""
        actions = get_recovery_actions(GATE_BOTH_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[1]["context_type"] == "story"


# ===========================================================================
# AC4: One attempt per level
# ===========================================================================


class TestGetRecoveryActionsMaxAttempts:
    """AC4: Recovery actions respect max_attempts from config."""

    def test_epic_action_has_max_attempts_one(self) -> None:
        """AC4: Epic recovery max_attempts comes from config."""
        actions = get_recovery_actions(GATE_EPIC_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["max_attempts"] == 1

    def test_story_action_has_max_attempts_one(self) -> None:
        """AC4: Story recovery max_attempts comes from config."""
        actions = get_recovery_actions(GATE_STORY_MISSING, RECOVERY_CONFIG, "131-2")
        assert actions[0]["max_attempts"] == 1

    def test_custom_max_attempts_is_respected(self) -> None:
        """AC4: Custom max_attempts value from config is preserved."""
        config = {
            "epic-context-validated": {
                "action": "create_context",
                "type": "epic",
                "max_attempts": 3,
            },
        }
        actions = get_recovery_actions(GATE_EPIC_MISSING, config, "131-2")
        assert actions[0]["max_attempts"] == 3


# ===========================================================================
# AC5: Validation errors do NOT trigger recovery
# ===========================================================================


class TestGetRecoveryActionsValidationErrors:
    """AC5: Checks that fail with validation errors are not recoverable."""

    def test_epic_invalid_returns_no_actions(self) -> None:
        """AC5: Epic check fails with validation errors → no recovery."""
        actions = get_recovery_actions(GATE_EPIC_INVALID, RECOVERY_CONFIG, "131-2")
        assert actions == []

    def test_non_context_failure_returns_no_actions(self) -> None:
        """AC5: Non-context check failures → no recovery actions."""
        actions = get_recovery_actions(GATE_BRANCH_FAILED, RECOVERY_CONFIG, "131-2")
        assert actions == []

    def test_check_not_in_recovery_config_ignored(self) -> None:
        """AC5: Failing check not in recovery config → no action for it."""
        config = {
            "epic-context-validated": {
                "action": "create_context",
                "type": "epic",
                "max_attempts": 1,
            },
            # story-context-validated intentionally missing from config
        }
        actions = get_recovery_actions(GATE_STORY_MISSING, config, "131-2")
        assert actions == []


# ===========================================================================
# AC6 + AC7 + AC8: format_recovery_outcome messages
# ===========================================================================


class TestFormatRecoveryOutcomeSilent:
    """AC6: Created and validated → continue silently."""

    def test_created_and_validated_message_is_none(self) -> None:
        """AC6: Successful creation + validation → no message needed."""
        result = format_recovery_outcome("epic", "131", created=True, validated=True)
        assert result["message"] is None

    def test_created_and_validated_severity_is_info(self) -> None:
        """AC6: Successful outcome is informational."""
        result = format_recovery_outcome("epic", "131", created=True, validated=True)
        assert result["severity"] == "info"


class TestFormatRecoveryOutcomeValidationFailed:
    """AC7: Created but validation failed → warning with path."""

    def test_created_but_invalid_has_warning_message(self) -> None:
        """AC7: Created but re-validation failed → warning message."""
        result = format_recovery_outcome("epic", "131", created=True, validated=False)
        assert result["message"] is not None
        assert "validation errors" in result["message"].lower()

    def test_created_but_invalid_mentions_manual_fix(self) -> None:
        """AC7: Warning message tells user to fix manually."""
        result = format_recovery_outcome("epic", "131", created=True, validated=False)
        assert "manual fix" in result["message"].lower()

    def test_created_but_invalid_includes_path(self) -> None:
        """AC7: Warning message includes the context file path."""
        result = format_recovery_outcome("epic", "131", created=True, validated=False)
        assert "sprint/context/context-epic-131.md" in result["message"]

    def test_created_but_invalid_story_includes_story_path(self) -> None:
        """AC7: Story context warning includes story path."""
        result = format_recovery_outcome(
            "story", "131-2", created=True, validated=False
        )
        assert "sprint/context/context-story-131-2.md" in result["message"]

    def test_created_but_invalid_severity_is_warning(self) -> None:
        """AC7: Partial success is a warning."""
        result = format_recovery_outcome("epic", "131", created=True, validated=False)
        assert result["severity"] == "warning"


class TestFormatRecoveryOutcomeCreationFailed:
    """AC8: Creation failed → error with manual command."""

    def test_creation_failed_has_error_message(self) -> None:
        """AC8: Failed creation → error message."""
        result = format_recovery_outcome("epic", "131", created=False, validated=None)
        assert result["message"] is not None
        assert "failed" in result["message"].lower()

    def test_creation_failed_includes_manual_command(self) -> None:
        """AC8: Error message includes the manual creation command."""
        result = format_recovery_outcome("epic", "131", created=False, validated=None)
        assert "/pf-context create epic 131" in result["message"]

    def test_creation_failed_story_includes_story_command(self) -> None:
        """AC8: Story creation failure includes story command."""
        result = format_recovery_outcome(
            "story", "131-2", created=False, validated=None
        )
        assert "/pf-context create story 131-2" in result["message"]

    def test_creation_failed_severity_is_error(self) -> None:
        """AC8: Failed creation is an error."""
        result = format_recovery_outcome("epic", "131", created=False, validated=None)
        assert result["severity"] == "error"


# ===========================================================================
# parse_story_id — extract epic and story identifiers
# ===========================================================================


class TestParseStoryId:
    """Parse story identifiers into epic and story components."""

    def test_standard_id_returns_epic_and_story(self) -> None:
        """Standard story ID "131-2" → epic="131", story="131-2"."""
        epic_id, story_id = parse_story_id("131-2")
        assert epic_id == "131"
        assert story_id == "131-2"

    def test_single_digit_epic(self) -> None:
        """Single-digit epic "5-1" → epic="5", story="5-1"."""
        epic_id, story_id = parse_story_id("5-1")
        assert epic_id == "5"
        assert story_id == "5-1"

    def test_large_story_number(self) -> None:
        """Large story number "131-15" → epic="131", story="131-15"."""
        epic_id, story_id = parse_story_id("131-15")
        assert epic_id == "131"
        assert story_id == "131-15"

    def test_invalid_format_raises_value_error(self) -> None:
        """Invalid story ID format raises ValueError."""
        with pytest.raises(ValueError):
            parse_story_id("invalid")

    def test_empty_string_raises_value_error(self) -> None:
        """Empty string raises ValueError."""
        with pytest.raises(ValueError):
            parse_story_id("")
