"""Tiered context injection for Prime.

Implements four context tiers based on session state:
- FULL (~4000 tokens): First turn of new session
- REFRESH (~600 tokens): Resumed session, same agent
- HANDOFF (~700 tokens): Resumed session, different agent
- MINIMAL (~200 tokens): Deep conversation (turn 3+), same agent

Story: MSSCI-12797 - Python Prime Tier Support
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any


class ContextTier(Enum):
    """Context tier levels for session-aware injection."""

    FULL = "FULL"
    REFRESH = "REFRESH"
    HANDOFF = "HANDOFF"
    MINIMAL = "MINIMAL"


def tier_from_string(value: str) -> ContextTier:
    """Convert string to ContextTier enum.

    Args:
        value: Tier name (case-insensitive)

    Returns:
        ContextTier enum value

    Raises:
        ValueError: If value is not a valid tier name
    """
    raise NotImplementedError("tier_from_string not implemented")


def load_tier_components(
    tier: ContextTier,
    agent_name: str,
    project_root: Path,
) -> dict[str, Any]:
    """Load components for the specified tier.

    Args:
        tier: Context tier level
        agent_name: Name of the agent to load context for
        project_root: Project root path

    Returns:
        Dict mapping component name to content
    """
    raise NotImplementedError("load_tier_components not implemented")
