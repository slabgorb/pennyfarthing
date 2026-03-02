"""
SessionEnd hook — cleanup when Claude Code session terminates.

Stops BikeRack/WheelHub if running, cleans up tmux status files,
and writes a final checkpoint. This is the true teardown signal
(Stop fires when the agent stops responding, SessionEnd fires
when the session actually ends).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path


def _cleanup_bikerack(project_dir: Path) -> str | None:
    """Stop BikeRack/WheelHub if running. Returns message or None."""
    try:
        from pf.bikerack.launcher import stop_bikerack

        result = stop_bikerack(project_dir)
        if result.get("success"):
            return result.get("message", "BikeRack stopped")
    except Exception:
        pass
    return None


def _cleanup_tmux_status(project_dir: Path) -> None:
    """Remove tmux status cache files."""
    pf_dir = project_dir / ".pennyfarthing"
    for name in ("tmux-status", "tmux-status-left", "tmux-status-right", "tmux-activity"):
        path = pf_dir / name
        try:
            if path.is_file():
                path.unlink()
        except OSError:
            pass


def _write_final_checkpoint(project_dir: Path, session_id: str) -> None:
    """Write a session_end checkpoint entry."""
    try:
        checkpoint_file = project_dir / ".session" / "checkpoints.log"
        checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(checkpoint_file, "a") as f:
            f.write(f"{timestamp}|session_end|session={session_id}\n")
    except OSError:
        pass


def main() -> None:
    """Main entry point for SessionEnd hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            input_data = {}

        session_id = input_data.get("session_id", "unknown")
        project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

        # Don't stop WheelHub on session end — it's shared across
        # tmux panes and should outlive individual Claude sessions.
        # Use `pf launch stop` to stop it explicitly.
        _cleanup_tmux_status(project_dir)
        _write_final_checkpoint(project_dir, session_id)

    except Exception:
        pass  # Fail open — never block session exit

    sys.exit(0)


if __name__ == "__main__":
    main()
