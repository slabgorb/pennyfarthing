"""Scenario YAML validator — validates benchmark scenario files against schema.

Story 43-1: Add red_herrings schema to scenarios.
Ported from TypeScript packages/core/scenarios/schema.yaml to Python validation.
"""

from __future__ import annotations

from typing import Any

REQUIRED_SCENARIO_FIELDS = ("name", "title", "category", "difficulty", "prompt")
VALID_CATEGORIES = ("code-review", "architecture", "dev", "tea", "sm", "pm", "reviewer", "general")
VALID_DIFFICULTIES = ("easy", "medium", "hard", "extreme")

RED_HERRING_REQUIRED_FIELDS = ("type", "description", "severity")
VALID_SEVERITIES = ("low", "medium", "high")


def validate_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    """Validate a scenario dict against the scenario schema.

    Returns:
        dict with keys:
            valid (bool): Whether the scenario is valid
            errors (list[str]): Validation error messages
    """
    errors: list[str] = []

    for field in REQUIRED_SCENARIO_FIELDS:
        if field not in scenario:
            errors.append(f"Missing required field: {field}")

    if "red_herrings" in scenario:
        rh_result = validate_red_herrings(scenario["red_herrings"])
        errors.extend(rh_result["errors"])

    return {"valid": len(errors) == 0, "errors": errors}


def validate_red_herrings(red_herrings: Any) -> dict[str, Any]:
    """Validate the red_herrings field of a scenario.

    red_herrings must be a list of objects, each with required fields:
        - type (str): Category of the red herring
        - description (str): What the red herring is
        - severity (str): One of "low", "medium", "high"

    Returns:
        dict with keys:
            valid (bool): Whether the red_herrings field is valid
            errors (list[str]): Validation error messages
    """
    errors: list[str] = []

    if red_herrings is None:
        return {"valid": False, "errors": ["red_herrings must be a list, got None"]}

    if not isinstance(red_herrings, list):
        return {"valid": False, "errors": [f"red_herrings must be a list, got {type(red_herrings).__name__}"]}

    for i, entry in enumerate(red_herrings):
        if not isinstance(entry, dict):
            errors.append(f"red_herrings[{i}] must be an object, got {type(entry).__name__}")
            continue

        for field in RED_HERRING_REQUIRED_FIELDS:
            if field not in entry:
                errors.append(f"red_herrings[{i}] missing required field: {field}")

        if "severity" in entry and entry["severity"] not in VALID_SEVERITIES:
            errors.append(f"red_herrings[{i}] invalid severity: {entry['severity']} (must be one of {', '.join(VALID_SEVERITIES)})")

    return {"valid": len(errors) == 0, "errors": errors}
