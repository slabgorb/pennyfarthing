"""Shared hook constants for Pennyfarthing infrastructure.

The essential hooks required for a minimal Pennyfarthing installation.
Used by both init (fresh project) and upgrade (npm-to-Python migration).

Each event type has a single dispatcher entry that runs all handlers
in-process. See pf.hooks.dispatch for the handler registry.
"""

from __future__ import annotations

# The canonical hook definitions. One dispatcher entry per event type.
# The dispatcher reads stdin once and runs all handlers internally,
# replacing the old pattern of N separate Python processes per event.
INFRASTRUCTURE_HOOKS: dict = {
    "SessionStart": [
        {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks dispatch SessionStart"}]},
    ],
    "Stop": [
        {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks dispatch Stop"}]},
    ],
    "PreToolUse": [
        {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks dispatch PreToolUse"}]},
    ],
    "PostToolUse": [
        {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks dispatch PostToolUse"}]},
    ],
}
