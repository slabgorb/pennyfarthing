"""Layout order configuration for Frame TUI TUI.

Story 120-10: Customizable bar layout ordering (menu/profile/content/status).

Validates and resolves the layout_order setting from config.local.yaml.
"""

from __future__ import annotations

from typing import Any

# The four layout regions in their default order
VALID_REGIONS = frozenset({"menu", "profile", "content", "status"})
DEFAULT_ORDER: list[str] = ["menu", "profile", "content", "status"]

# Maps region name → workflow config toggle key
_BAR_TOGGLE_MAP: dict[str, str] = {
    "status": "tui_statusbar",
    "profile": "profile_bar",
    "menu": "menu_bar",
}


def validate_layout_order(order: Any) -> dict[str, Any]:
    """Validate a layout_order setting.

    Args:
        order: The layout_order value from config (should be a list of 4 region strings).

    Returns:
        Result dict: {success: bool, error?: str}
    """
    if not isinstance(order, list):
        return {"success": False, "error": "layout_order must be a list"}
    if len(order) != 4:
        return {
            "success": False,
            "error": f"layout_order must have exactly 4 regions, got {len(order)}",
        }
    if len(set(order)) != len(order):
        return {"success": False, "error": "layout_order contains duplicate regions"}
    if set(order) != VALID_REGIONS:
        unknown = set(order) - VALID_REGIONS
        if unknown:
            return {
                "success": False,
                "error": f"Unknown regions: {', '.join(sorted(unknown))}",
            }
        missing = VALID_REGIONS - set(order)
        return {
            "success": False,
            "error": f"Missing regions: {', '.join(sorted(missing))}",
        }
    return {"success": True}


def get_layout_order(config: dict[str, Any]) -> list[str]:
    """Resolve the effective layout order from config.

    Uses ``portrait_dock`` (top/bottom) to position the profile region
    relative to content.  Falls back to ``layout_order`` list if set.

    Filters out any bars disabled via ``workflow.<toggle>`` settings.

    Args:
        config: The full pennyfarthing config dict.

    Returns:
        Ordered list of region names to render.
    """
    portrait_dock = config.get("portrait_dock", "top")

    if portrait_dock == "bottom":
        order = ["menu", "content", "profile", "status"]
    else:
        # Check legacy layout_order for backward compat
        raw = config.get("layout_order")
        if raw is not None and validate_layout_order(raw)["success"]:
            order = list(raw)
        else:
            order = list(DEFAULT_ORDER)

    workflow = config.get("workflow") or {}
    return [r for r in order if _is_bar_enabled(r, workflow)]


def _is_bar_enabled(region: str, workflow: dict[str, Any]) -> bool:
    """Check whether a bar region is enabled in the workflow config."""
    toggle_key = _BAR_TOGGLE_MAP.get(region)
    if toggle_key is None:
        return True  # content has no toggle — always enabled
    return workflow.get(toggle_key, True)
