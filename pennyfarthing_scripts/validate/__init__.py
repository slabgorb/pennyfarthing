"""Top-level validate command — auto-discovers and runs project validators."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ValidateReport:
    """Unified report from a single validator domain."""

    validator: str
    passed: int = 0
    warnings: int = 0
    errors: int = 0
    details: list[str] = field(default_factory=list)
    fixed: bool = False

    @property
    def success(self) -> bool:
        return self.errors == 0
