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


def get_session_name() -> dict:
    """Get the first session name on the pf socket.

    Returns:
        {success: True, data: "pf-pf-3-0"} or {success: False, error: ...}
    """
    result = _run_tmux("list-sessions", "-F", "#{session_name}")
    if not result["success"]:
        return result
    sessions = result["data"].splitlines()
    if not sessions:
        return {"success": False, "error": "No tmux sessions found on pf socket"}
    return {"success": True, "data": sessions[0]}


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


def kill_pane(pane_id: str) -> dict:
    """Kill a pane."""
    return _run_tmux("kill-pane", "-t", pane_id)
