"""PR mode configuration reader.

Reads the pr_mode and pr_merge preferences from .pennyfarthing/config.local.yaml.

pr_mode values: draft | ready | none (default: draft)
pr_merge values: auto | human (default: auto)
"""

from __future__ import annotations

from pf.common.config import load_pennyfarthing_config

VALID_PR_MODES = {"draft", "ready", "none"}
DEFAULT_PR_MODE = "draft"

VALID_PR_MERGE_MODES = {"auto", "human"}
DEFAULT_PR_MERGE_MODE = "auto"


def get_pr_mode() -> str:
    """Read pr_mode from pennyfarthing config.

    Looks for workflow.pr_mode in .pennyfarthing/config.local.yaml.
    Falls back to 'draft' if not set or invalid.

    Returns:
        One of: 'draft', 'ready', 'none'
    """
    config = load_pennyfarthing_config()
    workflow = config.get("workflow", {})
    if not isinstance(workflow, dict):
        return DEFAULT_PR_MODE

    mode = workflow.get("pr_mode", DEFAULT_PR_MODE)
    if mode not in VALID_PR_MODES:
        return DEFAULT_PR_MODE

    return mode


def get_pr_merge_mode() -> str:
    """Read pr_merge from pennyfarthing config.

    Looks for workflow.pr_merge in .pennyfarthing/config.local.yaml.
    Falls back to 'auto' if not set or invalid.

    Returns:
        One of: 'auto', 'human'
    """
    config = load_pennyfarthing_config()
    workflow = config.get("workflow", {})
    if not isinstance(workflow, dict):
        return DEFAULT_PR_MERGE_MODE

    mode = workflow.get("pr_merge", DEFAULT_PR_MERGE_MODE)
    if mode not in VALID_PR_MERGE_MODES:
        return DEFAULT_PR_MERGE_MODE

    return mode


if __name__ == "__main__":
    print(get_pr_mode())
