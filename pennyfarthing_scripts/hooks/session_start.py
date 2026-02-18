"""
SessionStart hook — initialize environment for Claude Code session.

Consolidates session_start_hook.py and welcome_hook.py into a single module.

Handles:
1. Session directory setup and logging
2. Checkpoint validation (cross-session drift detection)
3. WheelHub auto-start (ensure BikeRack server is running)
4. OTEL auto-configuration via CLAUDE_ENV_FILE
5. Welcome message display (CLI ASCII art or Cyclist API)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

from pennyfarthing_scripts.hooks import (
    find_project_root,
    is_cyclist_running,
    load_settings,
    send_to_cyclist,
)


# =============================================================================
# Session Setup
# =============================================================================


def _read_input() -> dict:
    """Read JSON from stdin (hook protocol)."""
    raw = sys.stdin.read()
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return {}


def _setup_session_dir(project_dir: Path, session_id: str, source_type: str) -> None:
    """Ensure .session directory exists and log session start."""
    session_dir = project_dir / ".session"
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "agents").mkdir(exist_ok=True)

    timestamp = datetime.now(UTC).isoformat()
    log_file = session_dir / "session-log.txt"
    with open(log_file, "a") as f:
        f.write(f"{timestamp} | Session {source_type}: {session_id}\n")


# =============================================================================
# Checkpoint Validation
# =============================================================================


def _validate_checkpoint(project_dir: Path) -> None:
    """Validate previous session checkpoint for cross-session drift detection."""
    try:
        checkpoint_file = project_dir / ".session" / "checkpoints.log"
        if not checkpoint_file.exists():
            return

        # Read the last session_state checkpoint
        prev_state = ""
        with open(checkpoint_file) as f:
            for line in f:
                if "|session_state|" in line:
                    prev_state = line.strip().split("|", 2)[-1] if "|" in line else ""

        if not prev_state:
            return

        # Parse checkpoint data
        fields = {}
        for part in prev_state.split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                fields[k] = v

        prev_sha = fields.get("sha", "")
        if not prev_sha:
            return

        # Get current git SHA
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            cwd=str(project_dir),
            timeout=5,
        )
        current_sha = result.stdout.strip()
        if not current_sha or current_sha == prev_sha:
            return

        # Log drift
        timestamp = datetime.now(UTC).isoformat()
        session_dir = project_dir / ".session"

        warning = f"CROSS_SESSION_DRIFT: Git changed (was: {prev_sha}, now: {current_sha})"
        if fields.get("story"):
            warning += f" | Story: {fields['story']}"
        if fields.get("agent"):
            warning += f" | Agent: {fields['agent']}"

        with open(session_dir / "session-log.txt", "a") as f:
            f.write(f"{timestamp} | {warning}\n")

        drift_entry = f"{timestamp} | prev_sha={prev_sha} | current_sha={current_sha}"
        for key in ("story", "agent", "phase"):
            if fields.get(key):
                drift_entry += f" | {key}={fields[key]}"
        with open(session_dir / "drift-log.txt", "a") as f:
            f.write(drift_entry + "\n")

    except Exception:
        pass


# =============================================================================
# WheelHub Auto-Start
# =============================================================================


def _ensure_wheelhub(project_dir: Path) -> int | None:
    """Auto-start WheelHub if not already running. Returns port or None."""
    from pennyfarthing_scripts.bikerack.launcher import (
        is_already_running,
        poll_for_port_file,
        start_wheelhub,
        write_pid_file,
    )

    # Skip if full Cyclist is running
    cyclist_port_file = project_dir / ".wheelhub-port"
    if cyclist_port_file.exists():
        try:
            return int(cyclist_port_file.read_text().strip())
        except (ValueError, OSError):
            return None

    # Check if BikeRack WheelHub is already running
    running, _pid, port = is_already_running(project_dir)
    if running:
        return port

    # Start WheelHub
    try:
        proc = start_wheelhub(project_dir)
        write_pid_file(project_dir, proc.pid)
        return poll_for_port_file(project_dir)
    except Exception:
        return None


# =============================================================================
# Environment File
# =============================================================================


def _write_env_file(project_dir: Path, session_id: str, otel_port: int | None) -> None:
    """Write environment variables to CLAUDE_ENV_FILE."""
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if not env_file:
        return

    lines = [
        "# Pennyfarthing core environment",
        f'export PROJECT_ROOT="{project_dir}"',
        f'export SESSION_ID="{session_id}"',
    ]

    if otel_port is not None:
        from pennyfarthing_scripts.bikerack.launcher import build_otel_env

        lines.append("# OTEL auto-configuration for Cyclist/WheelHub")
        for key, value in build_otel_env(otel_port).items():
            lines.append(f'export {key}="{value}"')

    with open(env_file, "a") as f:
        f.write("\n".join(lines) + "\n")


# =============================================================================
# Welcome Message
# =============================================================================


def _get_welcome_lock_path(project_root: Path) -> Path:
    """Get path to welcome shown lock file."""
    session_id = os.environ.get("CLAUDE_SESSION_ID", str(os.getpid()))
    session_dir = project_root / ".session"
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir / f".welcome-shown-{session_id}"


def _get_project_name(project_root: Path) -> str:
    """Get project name from package.json or directory name."""
    package_json = project_root / "package.json"
    if package_json.exists():
        try:
            with open(package_json) as f:
                data = json.load(f)
                name = data.get("name")
                if name:
                    return name
        except (json.JSONDecodeError, OSError):
            pass
    return project_root.name


def _display_cli_welcome(project_name: str, theme: str | None) -> None:
    """Display ASCII art welcome for CLI mode."""
    print("""
       ___
      /   \\
     |     |     Welcome to
     |     |    \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
      \\___/     \u2551   \u2554\u2550\u2557\u2554\u2550\u2557\u2554\u2557\u2554\u2554\u2557\u2554\u2566\u2550\u2557\u2554\u2550\u2557\u2554\u2550\u2557\u2554\u2550\u2557\u2566\u2554\u2550\u2557   \u2551
        \u2551       \u2551   \u2560\u2550\u2569\u2551\u2563 \u2551\u2551\u2551\u2551\u2551\u2551 \u2560\u2563 \u2560\u2550\u2563\u2560\u2566\u2569 \u2551 \u2560\u2550\u2563   \u2551
        \u2551       \u2551   \u2569  \u255a\u2550\u255d\u255d\u255a\u255d\u255d\u255a\u255d\u2569  \u2569 \u2569\u2569\u255a\u2550 \u2569 \u2569 \u2569   \u2551
      \u2554\u2550\u2569\u2550\u2557     \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d
     /     \\
    \u2502   O   \u2502   Agent-powered development with style
     \\     /
      \u255a\u2550\u2550\u2550\u255d
""")

    if project_name:
        print(f"    Project: {project_name}")
    if theme:
        print(f"    Theme:   {theme}")
    print()


def _show_welcome(project_dir: Path) -> None:
    """Show welcome message (once per session)."""
    lock_path = _get_welcome_lock_path(project_dir)
    if lock_path.exists():
        return

    lock_path.touch()

    project_name = _get_project_name(project_dir)
    settings = load_settings(project_dir)
    theme = settings.theme

    if is_cyclist_running(project_dir):
        try:
            send_to_cyclist(
                endpoint="/api/welcome",
                data={"project": project_name or "", "theme": theme or ""},
                project_root=project_dir,
                timeout=5,
            )
        except Exception:
            pass
    else:
        _display_cli_welcome(project_name, theme)


# =============================================================================
# Entry Point
# =============================================================================


def main() -> None:
    """Entry point for SessionStart hook."""
    try:
        input_data = _read_input()
        session_id = input_data.get("session_id", "unknown")
        source_type = input_data.get("source", "unknown")

        project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

        _setup_session_dir(project_dir, session_id, source_type)
        _validate_checkpoint(project_dir)

        otel_port = _ensure_wheelhub(project_dir)
        _write_env_file(project_dir, session_id, otel_port)
        _show_welcome(project_dir)

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
