"""Scenario YAML validator — validates benchmark scenario files against schema.

Story 43-1: Add red_herrings schema to scenarios.
Ported from TypeScript packages/core/scenarios/schema.yaml to Python validation.
"""

from __future__ import annotations

from typing import Any


def validate_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    """Validate a scenario dict against the scenario schema.

    Returns:
        dict with keys:
            valid (bool): Whether the scenario is valid
            errors (list[str]): Validation error messages
    """
    raise NotImplementedError("validate_scenario not yet implemented")


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
    raise NotImplementedError("validate_red_herrings not yet implemented")
