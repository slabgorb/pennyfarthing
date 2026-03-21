"""PostToolUse hook: auto-apply tmux layout after team agent spawns.

When Claude Code creates team agents via Agent/TeamCreate tools,
the default horizontal splits produce unusably narrow panes. This hook
reads the peloton.layout setting and applies the corresponding tmux
select-layout after agent panes are created.

Registered in dispatch.py for PostToolUse on Agent|TeamCreate.
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    """Apply configured tmux layout after agent/team spawn."""
    stdin_data = sys.stdin.read().strip()
    if not stdin_data:
        return

    try:
        payload = json.loads(stdin_data)
    except json.JSONDecodeError:
        return

    tool_name = payload.get("tool_name", "")
    if tool_name not in ("Agent", "TeamCreate"):
        return

    # Only apply on successful tool use
    # PostToolUse doesn't always have a result status, so we proceed optimistically

    try:
        from pf.settings.settings import get_setting
        from pf.tmux.panes import apply_layout, get_current_session

        layout = get_setting("peloton.layout")
        if not layout or layout == "horizontal":
            # horizontal is the default — no layout change needed
            return

        session_result = get_current_session()
        if not session_result["success"]:
            return

        session = session_result["data"].strip()
        if not session:
            return

        main_width = get_setting("peloton.main_pane_width")
        if not isinstance(main_width, int):
            main_width = 50

        result = apply_layout(session, layout, main_pane_pct=main_width)
        if result["success"]:
            print(f"Applied {layout} layout", file=sys.stderr)

    except Exception:
        # Hook failures must not block the agent
        pass
