"""
Context circuit breaker hook (PreToolUse) — block tool execution at critical usage.

When context exceeds the critical threshold (default 80%), blocks tool execution
with exit code 2 and saves the active agent to a checkpoint for /continue-session.

Unlike context_warning.py which only warns, this is a hard stop.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from pf.context import check_context, load_config


def _checkpoint_save(project_dir: str, label: str, data: str) -> None:
    """Save a checkpoint entry (reimplements checkpoint.sh logic in Python)."""
    try:
        checkpoint_file = Path(project_dir) / ".session" / "checkpoints.log"
        checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(checkpoint_file, "a") as f:
            f.write(f"{timestamp}|{label}|{data}\n")
    except OSError:
        pass


def main() -> None:
    """Main entry point for context circuit breaker hook."""
    try:
        # Read stdin to get session_id
        raw_input = sys.stdin.read()
        input_data = {}
        try:
            input_data = json.loads(raw_input)
        except (json.JSONDecodeError, ValueError):
            pass

        project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
        config = load_config(project_dir)

        result = check_context(project_dir=project_dir)

        if result.error:
            sys.exit(0)

        critical_threshold = config.critical_threshold
        pct = result.usable_percent

        if pct >= critical_threshold:
            # Auto-save active agent to checkpoint
            session_id = input_data.get("session_id", "")
            active_agent = ""

            if session_id:
                agent_file = Path(project_dir) / ".session" / "agents" / session_id
                if agent_file.is_file():
                    try:
                        active_agent = agent_file.read_text().strip()
                    except OSError:
                        pass

            if active_agent:
                _checkpoint_save(project_dir, "circuit_breaker_agent", active_agent)

            # Send error to stderr (Claude sees this)
            msg = f"""CONTEXT CIRCUIT BREAKER TRIGGERED

Context usage: {pct}% - CRITICAL (threshold: {critical_threshold}%)

Tool execution BLOCKED. You must stop and hand off."""

            if active_agent:
                msg += f"""

Active agent saved: {active_agent}
The agent will be restored with FULL context when you run /continue-session."""

            msg += """

Required actions:
1. Commit any pending changes
2. Tell user to start fresh session with /continue-session

DO NOT attempt further tool calls. This is a hard stop.

To resume later: /continue-session"""

            print(msg, file=sys.stderr)
            sys.exit(2)

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
