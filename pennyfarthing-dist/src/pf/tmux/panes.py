"""
tmux subprocess wrappers for pane management.

All functions use the dedicated 'pf' socket and return result dicts
with {success, data?, error?}.
"""

from __future__ import annotations

import subprocess

SOCKET = "pf"
IDLE_SHELLS = {"zsh", "bash", "fish", "sh", "-zsh", "-bash"}


def _run_tmux(*args: str, capture: bool = True) -> dict:
    """Run a tmux command on the pf socket."""
    cmd = ["tmux", "-L", SOCKET, *args]
    try:
        result = subprocess.run(
            cmd,
            capture_output=capture,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return {"success": False, "error": result.stderr.strip() or f"tmux exited {result.returncode}"}
        return {"success": True, "data": result.stdout.strip() if capture else ""}
    except FileNotFoundError:
        return {"success": False, "error": "tmux is not installed"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "tmux command timed out"}


def is_tmux_running() -> bool:
    """Check if a tmux server is running on the pf socket."""
    result = _run_tmux("list-sessions")
    return result["success"]


BARE_SESSION_PREFIX = "pf-bare-"


def ensure_server() -> dict:
    """Ensure a tmux server is running on the pf socket.

    If no server exists, creates a detached "bare" session so pane
    commands work immediately without requiring `just start` first.
    The bare session uses a distinct prefix (pf-bare-*) so it never
    collides with start-session's naming scheme (pf-<project>-N).

    Returns:
        {success: True, data: "session_name"} or {success: False, error: ...}
    """
    if is_tmux_running():
        return {"success": True, "data": "already_running"}

    import os

    project = os.path.basename(os.getcwd())
    session_name = f"{BARE_SESSION_PREFIX}{project}"

    result = _run_tmux("new-session", "-d", "-s", session_name)
    if not result["success"]:
        return result

    return {"success": True, "data": session_name}


def get_session_name() -> dict:
    """Get the current attached session name on the pf socket.

    Uses display-message to resolve the attached session rather than
    listing all sessions (which would pick the first alphabetically).
    When listing, prefers real sessions (from start-session) over bare
    auto-started sessions.

    Returns:
        {success: True, data: "pf-pf-2-0"} or {success: False, error: ...}
    """
    # Try attached session first
    result = _run_tmux("display-message", "-p", "#{session_name}")
    if result["success"] and result["data"]:
        return result

    # Fallback: list sessions (e.g. when called outside tmux)
    result = _run_tmux("list-sessions", "-F", "#{session_name}")
    if not result["success"]:
        return result
    sessions = result["data"].splitlines()
    if not sessions:
        return {"success": False, "error": "No tmux sessions found on pf socket"}

    # Prefer real sessions over bare auto-started ones
    real = [s for s in sessions if not s.startswith(BARE_SESSION_PREFIX)]
    return {"success": True, "data": real[0] if real else sessions[0]}


def list_live_panes(session: str) -> dict:
    """List all panes in a session with their properties.

    Returns:
        {success: True, data: [{pane_id, title, command, width, height}, ...]}
    """
    fmt = "#{pane_id}\t#{pane_title}\t#{pane_current_command}\t#{pane_width}\t#{pane_height}"
    result = _run_tmux("list-panes", "-t", session, "-F", fmt)
    if not result["success"]:
        return result

    panes = []
    for line in result["data"].splitlines():
        parts = line.split("\t")
        if len(parts) >= 5:
            panes.append({
                "pane_id": parts[0],
                "title": parts[1],
                "command": parts[2],
                "width": int(parts[3]),
                "height": int(parts[4]),
            })
    return {"success": True, "data": panes}


def is_pane_idle(command: str) -> bool:
    """Check if a pane's current command indicates it's idle (at a shell prompt)."""
    return command in IDLE_SHELLS


def split_pane(
    session: str,
    target: str,
    direction: str = "v",
    size_pct: int = 50,
    cwd: str | None = None,
) -> dict:
    """Split a pane and return the new pane's id.

    Args:
        session: tmux session name
        target: pane_id to split (e.g. %29)
        direction: 'h' for horizontal, 'v' for vertical
        size_pct: percentage of target pane for the new pane
        cwd: working directory for new pane

    Returns:
        {success: True, data: "%31"} — the new pane_id
    """
    args = [
        "split-window",
        f"-{direction}",
        "-t", target,
        "-l", f"{size_pct}%",
        "-P", "-F", "#{pane_id}",
    ]
    if cwd:
        args.extend(["-c", cwd])
    return _run_tmux(*args)


def set_pane_title(pane_id: str, title: str) -> dict:
    """Set a pane's title."""
    return _run_tmux("select-pane", "-t", pane_id, "-T", title)


def send_keys(pane_id: str, keys: str) -> dict:
    """Send keys to a pane."""
    return _run_tmux("send-keys", "-t", pane_id, keys, "Enter")


def capture_pane(pane_id: str, lines: int = 100) -> dict:
    """Capture visible content from a pane.

    Args:
        pane_id: target pane (e.g. %251)
        lines: number of lines to capture from the end of the scrollback.
               Negative start means "from the end". Default 100.

    Returns:
        {success: True, data: "captured text..."} or {success: False, error: ...}
    """
    return _run_tmux(
        "capture-pane", "-t", pane_id, "-p",
        "-S", str(-lines),
    )


def kill_pane(pane_id: str) -> dict:
    """Kill a pane."""
    return _run_tmux("kill-pane", "-t", pane_id)


_PANE_ICONS = {
    "claude": "󰚩",
    "tui": "󰓩",
    "worker": "󰙨",
    "saddle": "󱄅",
}
_FALLBACK_ICON = "◆"


def get_window_for_pane(pane_id: str) -> dict:
    """Get the window ID that contains a given pane.

    Returns:
        {success: True, data: "@1"} or {success: False, error: ...}
    """
    return _run_tmux("display-message", "-t", pane_id, "-p", "#{window_id}")


def list_window_panes(window_id: str) -> dict:
    """List all panes in a specific window.

    Returns:
        {success: True, data: [{pane_id, title, command, width, height}, ...]}
    """
    fmt = "#{pane_id}\t#{pane_title}\t#{pane_current_command}\t#{pane_width}\t#{pane_height}"
    result = _run_tmux("list-panes", "-t", window_id, "-F", fmt)
    if not result["success"]:
        return result

    panes = []
    for line in result["data"].splitlines():
        parts = line.split("\t")
        if len(parts) >= 5:
            panes.append({
                "pane_id": parts[0],
                "title": parts[1],
                "command": parts[2],
                "width": int(parts[3]),
                "height": int(parts[4]),
            })
    return {"success": True, "data": panes}


def find_sibling_tui(cli_pane_id: str) -> dict:
    """Find the TUI pane in the same window as the given CLI pane.

    Returns:
        {success: True, data: {pane_id, title, width, height}} or {success: False, error: ...}
    """
    win_result = get_window_for_pane(cli_pane_id)
    if not win_result["success"]:
        return win_result

    window_id = win_result["data"]
    panes_result = list_window_panes(window_id)
    if not panes_result["success"]:
        return panes_result

    for pane in panes_result["data"]:
        if "tui" in pane["title"].lower():
            return {"success": True, "data": pane}

    return {"success": False, "error": f"No TUI pane found in window {window_id}"}


def get_pane_icon(role: str) -> str:
    """Return a distinctive icon for a pane role.

    Each role (claude, tui, worker, saddle) gets a unique icon
    for instant visual identification in tmux borders and CLI output.
    """
    return _PANE_ICONS.get(role, _FALLBACK_ICON)


def configure_pane_borders(session: str) -> dict:
    """Enable pane-border-status with role labels and icons.

    Sets tmux options so each pane's border shows its role icon and title,
    making panes instantly identifiable.
    """
    result = _run_tmux(
        "set-option", "-t", session, "pane-border-status", "top",
    )
    if not result["success"]:
        return result

    border_fmt = " #{pane_title} "
    return _run_tmux(
        "set-option", "-t", session, "pane-border-format", border_fmt,
    )


def set_pane_env(pane_id: str, role: str) -> dict:
    """Inject PF_PANE_ROLE environment variable into a pane.

    Allows scripts running inside a pane to detect their role
    programmatically.
    """
    return _run_tmux(
        "set-environment", "-t", pane_id, "PF_PANE_ROLE", role,
    )


# --- Layout management ---

# Maps pennyfarthing layout names to tmux select-layout values
LAYOUT_MAP: dict[str, str] = {
    "vertical": "main-vertical",
    "grid": "tiled",
    "horizontal": "even-horizontal",
    "stacked": "even-vertical",
}


def get_current_session() -> dict:
    """Get the tmux session name for the current pane.

    Returns:
        {success: True, data: "session-name"} or {success: False, error: ...}
    """
    return _run_tmux("display-message", "-p", "#{session_name}")


def select_layout(target: str, layout: str) -> dict:
    """Apply a tmux layout to the current window.

    Args:
        target: session or window target (e.g. "my-session" or "@1")
        layout: tmux layout name (tiled, even-horizontal, even-vertical,
                main-horizontal, main-vertical)

    Returns:
        {success, data?, error?}
    """
    return _run_tmux("select-layout", "-t", target, layout)


def resize_main_pane(target: str, size_pct: int, dimension: str = "x") -> dict:
    """Resize pane 0 (the main pane) in the target window.

    Args:
        target: session or window target
        size_pct: percentage of the window for the main pane
        dimension: 'x' for width, 'y' for height

    Returns:
        {success, data?, error?}
    """
    return _run_tmux(
        "resize-pane", "-t", f"{target}:.0",
        f"-{dimension}", f"{size_pct}%",
    )


def apply_layout(target: str, layout_name: str, main_pane_pct: int = 50) -> dict:
    """Apply a pennyfarthing layout name to the current tmux window.

    Maps pennyfarthing names (vertical, grid, horizontal, stacked) to
    tmux select-layout values, and resizes the main pane for main-vertical.

    Args:
        target: session or window target
        layout_name: one of 'vertical', 'grid', 'horizontal', 'stacked'
        main_pane_pct: width percentage for main pane (vertical layout only)

    Returns:
        {success, data?, error?}
    """
    tmux_layout = LAYOUT_MAP.get(layout_name)
    if not tmux_layout:
        return {
            "success": False,
            "error": f"Unknown layout '{layout_name}'. Valid: {', '.join(LAYOUT_MAP)}",
        }

    result = select_layout(target, tmux_layout)
    if not result["success"]:
        return result

    # For main-vertical, resize the main (left) pane
    if tmux_layout == "main-vertical" and main_pane_pct != 50:
        resize_result = resize_main_pane(target, main_pane_pct, "x")
        if not resize_result["success"]:
            return resize_result

    return {"success": True, "data": f"Applied layout: {layout_name} ({tmux_layout})"}
