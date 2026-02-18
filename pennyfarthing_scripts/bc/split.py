"""Split layout management — read/write split config in config.local.yaml.

Story 110-4: /bc split <left> <right> command support.
"""

from __future__ import annotations

from pathlib import Path

from pennyfarthing_scripts.bc.focus import (
    VALID_PANELS,
    _read_config,
    _write_config,
)


def set_split_layout(
    left: str, right: str, project_dir: Path | None = None
) -> dict:
    """Set split layout in config.local.yaml.

    Args:
        left: Panel for left pane (must be in VALID_PANELS).
        right: Panel for right pane (must be in VALID_PANELS).
        project_dir: Override project root (for testing).

    Returns:
        {success: bool, data?: dict, error?: str}
    """
    if left not in VALID_PANELS:
        return {
            "success": False,
            "error": f"Invalid panel '{left}'. Valid panels: {', '.join(VALID_PANELS)}",
        }
    if right not in VALID_PANELS:
        return {
            "success": False,
            "error": f"Invalid panel '{right}'. Valid panels: {', '.join(VALID_PANELS)}",
        }
    if left == right:
        return {
            "success": False,
            "error": f"Left and right panels must be different (both are '{left}'). Use same panel in single mode instead.",
        }

    try:
        config_path, config = _read_config(project_dir)
        config["split"] = {"left": left, "right": right}
        _write_config(config_path, config)
        return {"success": True, "data": {"left": left, "right": right}}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
