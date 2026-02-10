#!/usr/bin/env python3
"""
Bell Mode PostToolUse Hook (Python)

This hook is called by Claude Code after each tool execution.
When bell mode is enabled and there are queued messages, it returns
the first queued message as additionalContext to be injected into
Claude's next API call.

Configuration files:
  .pennyfarthing/config.local.yaml - workflow.bell_mode: true/false
  .pennyfarthing/bell-queue.json - [{"text": "...", "images": [...]}, ...]

Output format (when injecting):
  {
    "hookSpecificOutput": {
      "hookEventName": "PostToolUse",
      "additionalContext": "User feedback: <message>"
    }
  }

Output when disabled or queue empty: (nothing - exit 0)

Story: MSSCI-12409 - Hook consistency and WheelHub consolidation
"""

import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from hooks import (
    HookResponse,
    find_project_root,
    is_bell_mode_enabled,
    output_hook_response,
    send_to_cyclist,
)


def read_bell_queue(project_root: Path) -> list[dict]:
    """Read the bell message queue.

    Args:
        project_root: Project root directory

    Returns:
        List of queued messages, or empty list if none
    """
    queue_path = project_root / ".pennyfarthing" / "bell-queue.json"
    if not queue_path.exists():
        return []

    try:
        with open(queue_path) as f:
            queue = json.load(f)
            if isinstance(queue, list):
                return queue
    except (json.JSONDecodeError, OSError):
        pass

    return []


def dequeue_message(project_root: Path) -> None:
    """Remove the first message from the queue.

    Args:
        project_root: Project root directory
    """
    queue_path = project_root / ".pennyfarthing" / "bell-queue.json"
    if not queue_path.exists():
        return

    try:
        with open(queue_path) as f:
            queue = json.load(f)

        if isinstance(queue, list) and len(queue) > 0:
            queue = queue[1:]  # Remove first item
            with open(queue_path, "w") as f:
                json.dump(queue, f)
    except (json.JSONDecodeError, OSError):
        pass


def notify_cyclist(project_root: Path, message_text: str) -> None:
    """Notify Cyclist browser that a queued message was consumed.

    Args:
        project_root: Project root directory
        message_text: The message text that was consumed
    """
    try:
        send_to_cyclist(
            endpoint="/api/bell-consumed",
            data={"text": message_text},
            project_root=project_root,
            timeout=5,
        )
    except Exception:
        # Ignore errors - don't block hook
        pass


# =============================================================================
# Tandem Observation Injection (Story 95-7 / MSSCI-14672)
# =============================================================================
# Stubs for tandem observation injection. Dev will implement.


def read_tandem_observations(project_root: Path) -> list[Path]:
    """Find tandem observation files in .session/ directory.

    Looks for files matching .session/*-tandem-*.md pattern.

    Args:
        project_root: Project root directory

    Returns:
        List of Path objects for tandem observation files
    """
    return []  # stub


def get_latest_observation(file_content: str) -> dict | None:
    """Extract the latest observation entry from a tandem observation file.

    Parses the markdown format to extract the most recent ## [HH:MM] Observation
    block, including the observer persona name from the file header.

    Args:
        file_content: Full text content of the tandem observation file

    Returns:
        Dict with 'persona' and 'text' keys, or None if no observations found
    """
    return None  # stub


def format_tandem_message(persona_name: str, observation_text: str) -> str:
    """Format a tandem observation as a bell mode injection message.

    Args:
        persona_name: The backseat agent's persona name
        observation_text: The observation summary text

    Returns:
        Formatted string: [Tandem] {persona_name}: {observation_text}
    """
    return ""  # stub


def get_tandem_mtime(project_root: Path, agent: str) -> float:
    """Read the last-checked mtime for a tandem agent's observation file.

    Args:
        project_root: Project root directory
        agent: Agent name (e.g. 'reviewer', 'tea')

    Returns:
        Last-checked mtime as float, or 0.0 if no sidecar exists
    """
    return 0.0  # stub


def save_tandem_mtime(project_root: Path, agent: str, mtime: float) -> None:
    """Save the mtime for a tandem agent's observation file.

    Writes to .session/.tandem-mtime-{agent} sidecar file.

    Args:
        project_root: Project root directory
        agent: Agent name (e.g. 'reviewer', 'tea')
        mtime: The mtime value to save
    """
    pass  # stub


def check_tandem_files(project_root: Path) -> list[dict]:
    """Check for new tandem observations and return injection messages.

    Main entry point for tandem injection in the PostToolUse hook.
    Checks if bell mode is enabled, finds tandem files, compares mtimes,
    extracts latest observations, and formats injection messages.

    Args:
        project_root: Project root directory

    Returns:
        List of dicts with 'agent', 'message' keys for each new observation
    """
    return []  # stub


def main() -> None:
    """Main entry point for PostToolUse bell mode hook."""
    try:
        # Read and discard stdin (required by hook protocol)
        sys.stdin.read()

        # Find project root
        project_root = find_project_root()
        if not project_root:
            sys.exit(0)

        # Check if bell mode is enabled
        if not is_bell_mode_enabled(project_root):
            sys.exit(0)

        # Read queue
        queue = read_bell_queue(project_root)
        if not queue:
            sys.exit(0)

        # Get first message
        first_message = queue[0]
        message_text = first_message.get("text", "")
        if not message_text:
            sys.exit(0)

        # Output hook response with additionalContext
        output_hook_response(HookResponse(
            event_name="PostToolUse",
            additional_context=f"User feedback: {message_text}",
        ))

        # Dequeue message and notify Cyclist (in background-ish - after output)
        dequeue_message(project_root)
        notify_cyclist(project_root, message_text)

        sys.exit(0)

    except Exception as e:
        # On error, exit silently
        print(f"[bellmode-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
