"""Shared hook constants for Pennyfarthing infrastructure.

The essential hooks required for a minimal Pennyfarthing installation.
Used by both init (fresh project) and upgrade (npm-to-Python migration).

Each event type has a single dispatcher entry that runs all handlers
in-process. See pf.hooks.dispatch for the handler registry.
"""

from __future__ import annotations

from pathlib import Path

# Relative shim path used as a placeholder in templates.
_SHIM_REL = ".pennyfarthing/bin/pf"

# The canonical hook definitions. One dispatcher entry per event type.
# The dispatcher reads stdin once and runs all handlers internally,
# replacing the old pattern of N separate Python processes per event.
#
# These use a relative path as a template. Call
# resolve_hook_paths() to produce absolute paths for a project.
INFRASTRUCTURE_HOOKS: dict = {
    "SessionStart": [
        {"hooks": [{"type": "command", "command": f"{_SHIM_REL} hooks dispatch SessionStart"}]},
    ],
    "Stop": [
        {"hooks": [{"type": "command", "command": f"{_SHIM_REL} hooks dispatch Stop"}]},
    ],
    "PreToolUse": [
        {"hooks": [{"type": "command", "command": f"{_SHIM_REL} hooks dispatch PreToolUse"}]},
    ],
    "PostToolUse": [
        {"hooks": [{"type": "command", "command": f"{_SHIM_REL} hooks dispatch PostToolUse"}]},
    ],
    "SessionEnd": [
        {"hooks": [{"type": "command", "command": f"{_SHIM_REL} hooks dispatch SessionEnd"}]},
    ],
    "PreCompact": [
        {"hooks": [{"type": "command", "command": f"{_SHIM_REL} hooks dispatch PreCompact"}]},
    ],
}

# Bootstrap hook for committed settings.json (not settings.local.json).
# Uses a relative path so it works on any machine after clone.
# When pf is already set up, bootstrap.sh exits in <50ms (fast path).
BOOTSTRAP_HOOKS: dict = {
    "SessionStart": [
        {"hooks": [{"type": "command", "command": "bash .claude/hooks/bootstrap.sh"}]},
    ],
}


def resolve_hook_paths(settings: dict, project_root: Path) -> dict:
    """Replace relative shim paths with absolute paths in a settings dict.

    Hooks and statusLine use `.pennyfarthing/bin/pf` as a template
    placeholder.  This function resolves it to an absolute path so
    hooks work regardless of the shell's working directory.

    Only replaces commands that *start* with the relative prefix to
    avoid double-resolving already-absolute paths.

    Mutates and returns the dict.
    """
    abs_shim = str(project_root / ".pennyfarthing" / "bin" / "pf")

    def _resolve(cmd: str) -> str:
        if cmd.startswith(_SHIM_REL):
            return abs_shim + cmd[len(_SHIM_REL):]
        return cmd

    for _event, entries in settings.get("hooks", {}).items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            for hook in entry.get("hooks", []):
                if isinstance(hook, dict) and "command" in hook:
                    hook["command"] = _resolve(hook["command"])

    if isinstance(settings.get("statusLine"), dict):
        cmd = settings["statusLine"].get("command", "")
        settings["statusLine"]["command"] = _resolve(cmd)

    return settings
