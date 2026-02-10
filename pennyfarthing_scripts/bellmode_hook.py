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
