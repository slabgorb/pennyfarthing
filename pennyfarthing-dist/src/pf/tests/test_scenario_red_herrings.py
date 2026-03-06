"""Tests for red_herrings schema validation in scenario YAML.

Story 43-1: Add red_herrings schema to scenarios.

Acceptance Criteria:
- [AC1] Schema accepts red_herrings array with valid entries (type, description, severity)
- [AC2] Scenario without red_herrings still validates (backward compatible)
- [AC3] Invalid red_herring entry rejects (missing required fields)
- [AC4] Partial red_herring (type only, no description) validates or rejects per schema rules
"""

from __future__ import annotations

import pytest

from pf.benchmark.scenario_validator import validate_red_herrings, validate_scenario


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _minimal_scenario(**overrides) -> dict:
    """Return a minimal valid scenario dict."""
    base = {
        "name": "test-scenario",
        "title": "Test Scenario",
        "category": "code-review",
        "difficulty": "medium",
        "prompt": "Review this code for issues.",
    }
    base.update(overrides)
    return base


def _valid_red_herring(**overrides) -> dict:
    """Return a valid red herring entry."""
    base = {
        "type": "misleading-log",
        "description": "Log message suggests auth failure but is actually a stale cache entry",
        "severity": "medium",
    }
    base.update(overrides)
    return base


# ===========================================================================
# AC1: Schema accepts red_herrings array with valid entries
# ===========================================================================

class TestRedHerringValidEntries:
    """AC1: Valid red_herrings array passes validation."""

    def test_single_valid_red_herring(self):
        result = validate_red_herrings([_valid_red_herring()])
        assert result["valid"] is True
        assert result["errors"] == []

    def test_multiple_valid_red_herrings(self):
        herrings = [
            _valid_red_herring(type="misleading-log", severity="low"),
            _valid_red_herring(type="irrelevant-error", severity="high"),
            _valid_red_herring(type="stale-data", severity="medium"),
        ]
        result = validate_red_herrings(herrings)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_empty_array_is_valid(self):
        result = validate_red_herrings([])
        assert result["valid"] is True
        assert result["errors"] == []

    def test_severity_low_accepted(self):
        result = validate_red_herrings([_valid_red_herring(severity="low")])
        assert result["valid"] is True

    def test_severity_medium_accepted(self):
        result = validate_red_herrings([_valid_red_herring(severity="medium")])
        assert result["valid"] is True

    def test_severity_high_accepted(self):
        result = validate_red_herrings([_valid_red_herring(severity="high")])
        assert result["valid"] is True

    def test_scenario_with_red_herrings_validates(self):
        """Full scenario with red_herrings field passes validation."""
        scenario = _minimal_scenario(red_herrings=[_valid_red_herring()])
        result = validate_scenario(scenario)
        assert result["valid"] is True


# ===========================================================================
# AC2: Backward compatibility — scenario without red_herrings validates
# ===========================================================================

class TestBackwardCompatibility:
    """AC2: Existing scenarios without red_herrings still validate."""

    def test_scenario_without_red_herrings_valid(self):
        scenario = _minimal_scenario()
        assert "red_herrings" not in scenario
        result = validate_scenario(scenario)
        assert result["valid"] is True

    def test_scenario_with_all_required_fields_only(self):
        scenario = {
            "name": "basic-scenario",
            "title": "Basic Scenario",
            "category": "dev",
            "difficulty": "easy",
            "prompt": "Do the thing.",
        }
        result = validate_scenario(scenario)
        assert result["valid"] is True

    def test_scenario_with_other_optional_fields(self):
        """Scenario with existing optional fields but no red_herrings."""
        scenario = _minimal_scenario(
            description="A test scenario",
            tags=["security", "review"],
            version="1.0",
        )
        result = validate_scenario(scenario)
        assert result["valid"] is True


# ===========================================================================
# AC3: Invalid red_herring entry rejects (missing required fields)
# ===========================================================================

class TestInvalidRedHerringRejects:
    """AC3: Red herrings missing required fields are rejected."""

    def test_missing_type_field(self):
        herring = {"description": "Some trap", "severity": "low"}
        result = validate_red_herrings([herring])
        assert result["valid"] is False
        assert any("type" in e for e in result["errors"])

    def test_missing_description_field(self):
        herring = {"type": "misleading-log", "severity": "medium"}
        result = validate_red_herrings([herring])
        assert result["valid"] is False
        assert any("description" in e for e in result["errors"])

    def test_missing_severity_field(self):
        herring = {"type": "misleading-log", "description": "Some trap"}
        result = validate_red_herrings([herring])
        assert result["valid"] is False
        assert any("severity" in e for e in result["errors"])

    def test_empty_object_rejects(self):
        result = validate_red_herrings([{}])
        assert result["valid"] is False
        assert len(result["errors"]) >= 3  # all three required fields missing

    def test_invalid_severity_value(self):
        herring = _valid_red_herring(severity="critical")
        result = validate_red_herrings([herring])
        assert result["valid"] is False
        assert any("severity" in e for e in result["errors"])

    def test_not_a_list_rejects(self):
        result = validate_red_herrings("not a list")
        assert result["valid"] is False

    def test_not_a_dict_entry_rejects(self):
        result = validate_red_herrings(["just a string"])
        assert result["valid"] is False

    def test_null_rejects(self):
        result = validate_red_herrings(None)
        assert result["valid"] is False

    def test_one_bad_entry_in_many(self):
        """One invalid entry among valid ones should fail the whole array."""
        herrings = [
            _valid_red_herring(),
            {"type": "bad-one"},  # missing description and severity
            _valid_red_herring(type="another-valid"),
        ]
        result = validate_red_herrings(herrings)
        assert result["valid"] is False


# ===========================================================================
# AC4: Partial red_herring (type only) rejects per schema rules
# ===========================================================================

class TestPartialRedHerring:
    """AC4: Partial entries (e.g. type only) are rejected — all three fields required."""

    def test_type_only_rejects(self):
        herring = {"type": "misleading-log"}
        result = validate_red_herrings([herring])
        assert result["valid"] is False
        assert any("description" in e for e in result["errors"])
        assert any("severity" in e for e in result["errors"])

    def test_type_and_description_only_rejects(self):
        herring = {"type": "misleading-log", "description": "A trap"}
        result = validate_red_herrings([herring])
        assert result["valid"] is False
        assert any("severity" in e for e in result["errors"])

    def test_type_and_severity_only_rejects(self):
        herring = {"type": "misleading-log", "severity": "high"}
        result = validate_red_herrings([herring])
        assert result["valid"] is False
        assert any("description" in e for e in result["errors"])

    def test_extra_fields_accepted(self):
        """Extra fields beyond required should not cause rejection."""
        herring = _valid_red_herring(expected_trap="agent ignores it", notes="optional context")
        result = validate_red_herrings([herring])
        assert result["valid"] is True

    def test_error_messages_identify_entry_index(self):
        """Error messages should indicate which entry (by index) is invalid."""
        herrings = [_valid_red_herring(), {"type": "bad"}]
        result = validate_red_herrings(herrings)
        assert result["valid"] is False
        assert any("1" in e or "[1]" in e for e in result["errors"])
