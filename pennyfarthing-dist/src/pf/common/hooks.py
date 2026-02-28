"""Shared hook constants for Pennyfarthing infrastructure.

The essential hooks required for a minimal Pennyfarthing installation.
Used by both init (fresh project) and upgrade (npm-to-Python migration).
"""

from __future__ import annotations

# The canonical hook definitions. Both init/core.py and upgrade/core.py
# import from here instead of maintaining independent copies.
INFRASTRUCTURE_HOOKS: dict = {
    "SessionStart": [
        {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks session-start"}]},
        {
            "matcher": "compact",
            "hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks agent-reload"}],
        },
        {
            "matcher": "clear",
            "hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks agent-reload"}],
        },
    ],
    "Stop": [
        {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks session-stop"}]}
    ],
    "PreToolUse": [
        {
            "matcher": "Edit|Write",
            "hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks pre-edit-check"}],
        },
        {
            "matcher": "Edit|Write|Bash|Task",
            "hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks context-warning"}],
        },
    ],
    "PostToolUse": [
        {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks bell-mode"}]}
    ],
}
