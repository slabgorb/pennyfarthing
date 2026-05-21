"""Context validation module — validates context documents against schema.

Story: PROJ-15683 (129-3) — Build Context Validator Python Module and CLI

Stubs only. Implementation in GREEN phase.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ValidationError:
    """A single validation error or warning."""

    component: str
    message: str
    field_path: str = ""
    severity: str = "error"  # "error" or "warning"


@dataclass
class ContextValidationResult:
    """Result of validating a context document or component."""

    valid: bool = True
    errors: list[ValidationError] = field(default_factory=list)
    warnings: list[ValidationError] = field(default_factory=list)
    components_checked: int = 0
    tier: str = ""
