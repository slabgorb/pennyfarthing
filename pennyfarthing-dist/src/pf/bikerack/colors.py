"""Shared color thresholds and tier styles for BikeRack TUI panels.

Story 136-4: Extracted from base_panel.py, debug_panel.py, and
context_meter_footer.py to eliminate threshold duplication.
"""

from __future__ import annotations

# Percent below which style is "green"
WARN_THRESHOLD_LOW: int = 70

# Percent at or below which style is "yellow"; above is "red"
WARN_THRESHOLD_HIGH: int = 85

# Tier name to Rich style mapping (used by debug_panel context badge)
TIER_STYLES: dict[str, str] = {
    "FULL": "bold green",
    "REFRESH": "bold yellow",
    "HANDOFF": "bold cyan",
    "MINIMAL": "bold red",
}


def warn_style(percent: int | float) -> str:
    """Return a Rich color name based on percent thresholds.

    Returns:
        ``"green"`` if percent <= 70, ``"yellow"`` if percent <= 85,
        ``"red"`` otherwise.
    """
    if percent < WARN_THRESHOLD_LOW:
        return "green"
    if percent <= WARN_THRESHOLD_HIGH:
        return "yellow"
    return "red"
