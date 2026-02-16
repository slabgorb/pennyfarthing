#!/usr/bin/env python3
"""Session start hook — initialize environment for Claude Code session.

Handles:
1. Session directory setup and logging
2. Checkpoint validation (cross-session drift detection)
3. WheelHub auto-start (ensure BikeRack server is running)
4. OTEL auto-configuration via CLAUDE_ENV_FILE

Called by Claude Code SessionStart hook via shell wrapper.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


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

    from datetime import UTC, datetime

    timestamp = datetime.now(UTC).isoformat()
    log_file = session_dir / "session-log.txt"
    with open(log_file, "a") as f:
        f.write(f"{timestamp} | Session {source_type}: {session_id}\n")


def _validate_checkpoint(project_dir: Path) -> None:
    """Validate previous session checkpoint for cross-session drift detection."""
    try:
        import subprocess

        script_dir = Path(__file__).resolve().parent.parent
        checkpoint_lib = script_dir / "pennyfarthing-dist" / "scripts" / "lib" / "checkpoint.sh"

        if not checkpoint_lib.exists():
            return

        result = subprocess.run(
            ["bash", "-c", f'source "{checkpoint_lib}" && checkpoint_restore session_state'],
            capture_output=True,
            text=True,
            cwd=str(project_dir),
            timeout=5,
        )

        prev_state = result.stdout.strip()
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
        from datetime import UTC, datetime

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
        lines.extend([
            "# OTEL auto-configuration for Cyclist/WheelHub",
            'export OTEL_EXPORTER_OTLP_PROTOCOL="http/json"',
            f'export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:{otel_port}"',
        ])

    with open(env_file, "a") as f:
        f.write("\n".join(lines) + "\n")


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

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
