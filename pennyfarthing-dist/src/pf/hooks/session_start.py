"""
SessionStart hook — initialize environment for Claude Code session.

Handles:
1. Session directory setup and logging
2. Checkpoint validation (cross-session drift detection)
3. Frame auto-start (ensure Frame server is running)
4. OTEL auto-configuration via CLAUDE_ENV_FILE
5. Setup auto-detection (Story 126-12) — nudge if pf init ran but /pf-setup did not
6. Startup agent context injection
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml

from pf.hooks import load_settings

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
# Frame Auto-Start
# =============================================================================


def _ensure_frame(project_dir: Path) -> int | None:
    """Auto-start Frame if not already running. Returns port or None."""
    from pf.frame.launcher import (
        is_already_running,
        poll_for_port_file,
        start_frame,
        write_pid_file,
    )

    running, _pid, port = is_already_running(project_dir)
    if running:
        return port

    # Start Frame
    try:
        proc = start_frame(project_dir)
        if isinstance(proc, dict):
            return None
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
        from pf.frame.launcher import build_otel_env

        lines.append("# OTEL auto-configuration for Frame")
        for key, value in build_otel_env(otel_port).items():
            lines.append(f'export {key}="{value}"')

    with open(env_file, "a") as f:
        f.write("\n".join(lines) + "\n")


# =============================================================================
# Setup Auto-Detection (Story 126-12)
# =============================================================================


def detect_incomplete_setup(project_dir: Path) -> str | None:
    """Detect if pf init ran but /pf-setup did not.

    Returns additionalContext string if setup is incomplete, None otherwise.
    Fast path (setup complete) uses file existence checks only — no YAML parsing.

    Args:
        project_dir: Project root directory

    Returns:
        additionalContext string if setup is incomplete, None if complete or not initialized
    """
    pf_dir = project_dir / ".pennyfarthing"

    # Not initialized at all — nothing to nudge about
    if not pf_dir.is_dir():
        return None

    # Fast path: all files exist and are non-empty → setup complete, no parsing
    config_path = pf_dir / "config.local.yaml"
    repos_path = pf_dir / "repos.yaml"
    settings_path = project_dir / ".claude" / "settings.local.json"

    if (
        config_path.is_file()
        and config_path.stat().st_size > 0
        and repos_path.is_file()
        and repos_path.stat().st_size > 0
        and settings_path.is_file()
    ):
        return None

    # Slow path: something is missing or empty — build detailed report
    missing: list[str] = []

    if not settings_path.is_file():
        missing.append("settings.local.json (Claude Code hooks)")

    if not config_path.is_file():
        missing.append("config.local.yaml (theme and preferences)")
    elif config_path.stat().st_size == 0:
        missing.append("theme selection in config.local.yaml")
    else:
        # File exists and is non-empty — check for theme key
        try:
            content = yaml.safe_load(config_path.read_text())
            if not isinstance(content, dict) or not content.get("theme"):
                missing.append("theme selection in config.local.yaml")
        except Exception:
            missing.append("config.local.yaml (unreadable)")

    if not repos_path.is_file():
        missing.append("repos.yaml (repository discovery)")
    elif repos_path.stat().st_size == 0:
        missing.append("repos.yaml (empty — needs repo discovery)")

    if not missing:
        return None

    items = "\n".join(f"  - {m}" for m in missing)
    return (
        "Pennyfarthing setup is incomplete. Run `/pf-setup` to finish configuration.\n"
        f"\nMissing:\n{items}\n"
        "\nThis usually means `pf init` ran but the interactive setup was skipped."
    )


# =============================================================================
# Portrait LFS Check
# =============================================================================


def _ensure_theme_portraits(project_dir: Path) -> None:
    """Pull git-lfs portrait images for the current theme if needed."""
    try:
        settings = load_settings(project_dir)
        theme = settings.theme
        if not theme:
            return

        from pf.common.themes import ensure_portrait_lfs

        ensure_portrait_lfs(theme, project_root=project_dir, quiet=True)
    except Exception:
        pass


# =============================================================================
# Spinner Settings Reconciliation
# =============================================================================


def _sync_spinner_settings(project_dir: Path) -> None:
    """Reconcile spinner verbs and tips in settings.local.json."""
    try:
        from pf.common.spinner import sync_spinner_settings

        sync_spinner_settings(project_root=project_dir)
    except Exception:
        pass


# =============================================================================
# Startup Agent Context
# =============================================================================


def _load_startup_agent_context(project_dir: Path, agent: str) -> str | None:
    """Load agent context via prime for injection into additionalContext.

    Runs prime with HANDOFF tier (agent definition + persona, ~2K tokens)
    and captures stdout. Skips session registration and workflow detection
    since those happen later when the agent skill runs.

    Returns:
        Agent context string, or None on failure.
    """
    try:
        import io
        from contextlib import redirect_stdout

        from pf.prime import prime

        buf = io.StringIO()
        with redirect_stdout(buf):
            exit_code = prime(
                agent_name=agent,
                tier="handoff",
                no_register=True,
                no_workflow=True,
                quiet=True,
                project_root=project_dir,
            )

        if exit_code != 0:
            return None

        context = buf.getvalue().strip()
        if not context:
            return None

        return (
            f"You are activated as the {agent} agent. "
            f"Adopt the persona and follow the agent instructions below.\n\n"
            + context
        )
    except Exception:
        return None


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

        # Set SESSION_ID in process env BEFORE starting Frame so the
        # subprocess inherits it. This is the single source of truth for
        # agent identity — without it, Frame falls back to mtime-based
        # resolution which picks up stale agent files.
        os.environ["SESSION_ID"] = session_id

        # Detect incomplete setup and emit additionalContext if needed
        setup_context = detect_incomplete_setup(project_dir)
        if setup_context:
            from pf.hooks import HookResponse, output_hook_response

            output_hook_response(
                HookResponse(
                    event_name="SessionStart",
                    additional_context=setup_context,
                )
            )

        otel_port = _ensure_frame(project_dir)
        _write_env_file(project_dir, session_id, otel_port)
        _ensure_theme_portraits(project_dir)
        _sync_spinner_settings(project_dir)

        # Auto-invoke startup agent on new sessions
        if source_type != "compact" and source_type != "clear":
            settings = load_settings(project_dir)
            agent = settings.startup_agent
            if agent and agent != "none":
                agent_context = _load_startup_agent_context(project_dir, agent)
                if agent_context:
                    from pf.hooks import HookResponse, output_hook_response

                    output_hook_response(
                        HookResponse(
                            event_name="SessionStart",
                            additional_context=agent_context,
                        )
                    )

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
