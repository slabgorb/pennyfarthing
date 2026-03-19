"""PostToolUse hook for TeamCreate — split agent panes and render portraits.

After TeamCreate spawns agent teammates (teammateMode: "tmux"), this hook:
1. Checks if peloton is active
2. Reconciles the pane registry to discover newly-created agent panes
3. Splits each agent pane horizontally (20% left for portrait)
4. Renders the portrait image in the split pane

FOUC is expected — the raw panes appear briefly before portraits are added.
"""

from __future__ import annotations

import json
import logging
import sys

from pf.hooks import find_project_root

logger = logging.getLogger(__name__)


def main() -> None:
    """Main entry point for peloton portraits hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            sys.exit(0)

        tool_name = input_data.get("tool_name", "")
        if tool_name != "TeamCreate":
            sys.exit(0)

        project_root = find_project_root()
        if project_root is None:
            sys.exit(0)

        _add_portraits(project_root)

    except SystemExit:
        raise
    except Exception:
        pass  # Fail open — portraits are cosmetic

    sys.exit(0)


def _add_portraits(project_root):
    """Discover agent panes post-TeamCreate and split for portraits."""
    from pathlib import Path

    root = Path(project_root)

    # 1. Check peloton is active
    from pf.peloton.live import load_state

    state = load_state(root)
    if not state.get("active"):
        return

    active_agents = set(state.get("agents", []))
    if not active_agents:
        return

    # 2. Get current theme
    from pf.prime.persona import get_current_theme

    theme = get_current_theme(root)
    if not theme:
        return

    # 3. Get tmux session and reconcile registry to discover new panes
    from pf.tmux.panes import get_session_name, list_live_panes

    session_result = get_session_name()
    if not session_result["success"]:
        return
    session = session_result["data"]

    live_result = list_live_panes(session)
    if not live_result["success"]:
        return

    from pf.tmux.registry import load_registry

    reg_result = load_registry(root, session)
    if not reg_result["success"]:
        return

    registry = reg_result["data"]

    # 4. Find agent panes that need portraits
    from pf.tui.portrait_resolver import detect_image_protocol, resolve_portrait_path

    protocol = detect_image_protocol()

    for entry in registry.get("panes", []):
        role = entry.get("role", "")
        if role not in active_agents:
            continue
        if entry.get("protected"):
            continue

        pane_id = entry["pane_id"]

        # Skip if this pane already has a portrait sibling
        portrait_role = f"{role}-portrait"
        if any(p.get("role") == portrait_role for p in registry.get("panes", [])):
            continue

        # Resolve portrait path
        portrait_path = resolve_portrait_path(
            theme=theme,
            agent=role,
            project_root=root,
            preferred_size="small",
        )
        if portrait_path is None:
            continue

        # 5. Split pane: 20% left for portrait, 80% right keeps the CLI
        # -b = put new pane before (left), so CLI stays in the original pane
        from pf.tmux.panes import send_keys, set_pane_title, split_pane

        split_result = split_pane(session, pane_id, "h", 20)
        if not split_result["success"]:
            continue

        portrait_pane_id = split_result["data"].strip()
        set_pane_title(portrait_pane_id, f"{role}-portrait")

        # 6. Render portrait in the new pane
        _render_portrait(portrait_pane_id, portrait_path, protocol)

        # 7. Update registry with portrait pane
        from pf.tmux.registry import save_registry

        registry["panes"].append({
            "pane_id": portrait_pane_id,
            "role": portrait_role,
            "title": f"{role}-portrait",
            "protected": False,
            "owner": "peloton",
        })
        save_registry(root, registry)


def _render_portrait(pane_id: str, portrait_path, protocol: str | None) -> None:
    """Send the image display command to a portrait pane."""
    from pf.tmux.panes import send_keys

    path_str = str(portrait_path)

    if protocol == "kitty":
        # chafa with kitty backend for best quality
        cmd = f"chafa --format=kitty --size=20 '{path_str}' 2>/dev/null || chafa --size=20 '{path_str}' 2>/dev/null; exec cat"
    elif protocol == "sixel":
        cmd = f"chafa --format=sixel --size=20 '{path_str}' 2>/dev/null || chafa --size=20 '{path_str}' 2>/dev/null; exec cat"
    else:
        # Fallback: chafa auto-detects, or plain symbols
        cmd = f"chafa --size=20 '{path_str}' 2>/dev/null; exec cat"

    send_keys(pane_id, cmd)


if __name__ == "__main__":
    main()
