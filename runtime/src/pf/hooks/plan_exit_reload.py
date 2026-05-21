"""
PreToolUse hook — reload active agent when exiting plan mode.

Fires on `ExitPlanMode` tool use. Determines which agent should execute
the plan and injects additionalContext with the agent's refresh-tier
prime output so the executing agent has full persona and workflow state.

Agent resolution order:
1. Signal file `.session/.plan-exit-agent` (explicit override, consumed on read)
2. Phase owner from active session (default fallback)

To target a specific agent for plan execution, write the agent name to
`.session/.plan-exit-agent` before entering plan mode. The hook consumes
the file after reading it — one-shot by design.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from pf.hooks import HookResponse, output_hook_response
from pf.hooks.agent_reload import _find_active_agent

SIGNAL_FILE = ".session/.plan-exit-agent"

VALID_AGENTS = frozenset({
    "sm", "tea", "dev", "reviewer", "architect",
    "pm", "tech-writer", "ux-designer", "devops",
    "orchestrator", "ba",
})


def _read_and_consume_signal(project_dir: Path) -> str | None:
    """Read target agent from signal file and delete it.

    Returns:
        Agent name if signal file exists and contains a valid agent, else None.
    """
    signal_path = project_dir / SIGNAL_FILE
    if not signal_path.exists():
        return None

    try:
        agent = signal_path.read_text().strip().lower()
        signal_path.unlink()
        if agent in VALID_AGENTS:
            return agent
    except OSError:
        pass
    return None


def _get_agent_prime(agent: str, project_dir: Path) -> str | None:
    """Run pf agent start with refresh tier and capture output.

    Returns:
        Prime output string, or None on failure.
    """
    try:
        result = subprocess.run(
            ["pf", "agent", "start", agent, "--tier", "refresh", "--quiet"],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=str(project_dir),
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    return None


def main() -> None:
    """Entry point for plan-exit-reload PreToolUse hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            input_data = {}

        tool_name = input_data.get("tool_name", "")
        if tool_name != "ExitPlanMode":
            sys.exit(0)

        project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

        # Resolution order: signal file > phase owner
        agent = _read_and_consume_signal(project_dir)
        source = "plan-exit-agent signal"
        if not agent:
            agent = _find_active_agent(project_dir)
            source = "session phase owner"

        if not agent:
            # No signal and no active session — nothing to reload
            sys.exit(0)

        # Try to get refresh-tier prime output inline
        prime_output = _get_agent_prime(agent, project_dir)

        if prime_output:
            context = (
                f"AGENT RELOAD on plan exit (source: {source}): "
                f"You are the `{agent}` agent. Your persona and workflow state follow.\n\n"
                f"{prime_output}\n\n"
                f"Resume executing the plan as `{agent}`. "
                f"You have full agent context loaded."
            )
        else:
            # Fallback: instruct Claude to reload manually
            context = (
                f"AGENT RELOAD on plan exit (source: {source}): "
                f"Active agent is `{agent}`. "
                f"Run `pf agent start {agent}` via Bash as your FIRST action to reload "
                f"agent context and persona before executing the plan."
            )

        output_hook_response(
            HookResponse(
                event_name="PreToolUse",
                additional_context=context,
            )
        )

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
