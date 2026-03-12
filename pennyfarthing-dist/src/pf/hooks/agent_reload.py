"""
SessionStart hook — reload active agent after context clear or compaction.

Fires on `compact` and `clear` SessionStart matchers. Detects the active
session, determines which agent owns the current phase, and injects
additionalContext instructing Claude to reload that agent.

Story: td-5
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from pf.hooks import HookResponse, output_hook_response


def _parse_workflow_phase(session_path: Path) -> tuple[str | None, str | None]:
    """Extract workflow and phase from session file.

    Looks for standalone ``**Workflow:**`` and ``**Phase:**`` lines in the
    Workflow Tracking section. These are not bullet-prefixed, unlike the
    Story Details section which uses ``- **Workflow:** ...``.

    Returns:
        (workflow, phase) tuple, either may be None.
    """
    content = session_path.read_text()
    workflow = None
    phase = None

    for line in content.split("\n"):
        stripped = line.strip()
        # Match "**Workflow:** trivial" (not "- **Workflow:** ..." in Story Details)
        if stripped.startswith("**Workflow:**") and not stripped.startswith("- "):
            workflow = stripped.split(":**", 1)[1].strip().lower()
        elif stripped.startswith("**Phase:**") and not stripped.startswith("- "):
            phase = stripped.split(":**", 1)[1].strip().lower()

    return workflow, phase


def _find_active_agent(project_dir: Path) -> str | None:
    """Detect the active agent from the session file.

    Reads the most recent session file and extracts the workflow + phase,
    then looks up the phase owner from the workflow YAML.

    Returns:
        Agent name (sm, tea, dev, reviewer, etc.) or None if no active session.
    """
    from pf.prime.workflow import find_active_session, get_phase_owner

    session_file = find_active_session(project_dir)
    if not session_file:
        return None

    workflow, phase = _parse_workflow_phase(session_file)

    if not workflow or not phase:
        return None

    # Look up who owns this phase
    owner = get_phase_owner(workflow, phase, project_dir)
    return owner


def main() -> None:
    """Entry point for agent-reload SessionStart hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            input_data = {}

        source = input_data.get("source", "unknown")
        project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))

        agent = _find_active_agent(project_dir)

        if not agent:
            # No active session — nothing to reload
            sys.exit(0)

        # Build the reload instruction
        source_label = "context compaction" if source == "compact" else "context clear"
        context = (
            f"AGENT RELOAD after {source_label}: "
            f"Active agent is `{agent}`. "
            f"Run `pf agent start {agent}` via Bash as your FIRST action to reload "
            f"agent context and persona. Then tell the user: "
            f'"Agent `{agent}` reloaded after {source_label}. Resuming work."'
        )

        output_hook_response(
            HookResponse(
                event_name="SessionStart",
                additional_context=context,
            )
        )

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
