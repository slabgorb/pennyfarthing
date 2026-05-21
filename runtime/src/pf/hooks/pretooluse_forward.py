"""
PreToolUse Hook — forward tool inputs to Frame for audit log enrichment.

Consolidates pretooluse_hook.py into the hooks subpackage.
"""

from __future__ import annotations

import sys
from pathlib import Path

from pf.hooks import (
    find_project_root,
    read_stdin_json,
    send_to_frame,
)


def _forward_tool_input(
    tool_name: str,
    tool_id: str,
    tool_input: dict,
    project_root: Path | None,
) -> None:
    """Forward tool input to Frame for OTEL span correlation.

    Story 120-13: TUI audit log needs tool inputs for Read, Grep, Edit,
    Write, etc. OTEL tool_result events don't include tool_parameters for these
    tools. This function sends tool inputs to Frame's pending-tool-input
    endpoint so the OTLP receiver can correlate them with incoming spans.
    """
    if not project_root:
        return
    try:
        send_to_frame(
            endpoint="/api/pending-tool-input",
            data={
                "toolName": tool_name,
                "toolId": tool_id,
                "input": tool_input,
            },
            project_root=project_root,
        )
    except Exception:
        pass  # Non-blocking — don't fail the hook if forwarding fails


def main() -> None:
    """Main entry point for PreToolUse hook."""
    try:
        tool_data = read_stdin_json()
        tool_name = tool_data.get("tool_name", "")
        tool_id = tool_data.get("tool_use_id", "")
        tool_input = tool_data.get("tool_input", {})

        project_root = find_project_root()

        # Forward tool input for audit log enrichment (Story 120-13)
        # Fails silently if no Frame running
        _forward_tool_input(tool_name, tool_id, tool_input, project_root)

        sys.exit(0)

    except Exception as e:
        print(f"[pretooluse-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
