#!/usr/bin/env python3
"""
Cyclist PreToolUse Hook (Python)

This script is called by Claude Code before each tool execution.
It communicates with WheelHub (Cyclist's central coordination server)
via HTTP to get approval decisions.

Flow:
1. Claude Code calls this script with tool info via stdin (JSON)
2. Script reads port from .cyclist-port in project directory
3. Script sends request to WheelHub's /api/hook-request endpoint
4. WheelHub shows approval modal, user decides
5. Script receives response, outputs JSON decision to stdout
6. Claude Code proceeds or blocks based on decision

Per ADR-0004: All communication converges through WheelHub.

Story: MSSCI-12409 - Hook consistency and WheelHub consolidation

Usage:
  Install in ~/.claude/settings.json or project .claude/settings.json:
  {
    "hooks": {
      "PreToolUse": [{
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "python3 /path/to/pretooluse_hook.py"
        }]
      }]
    }
  }
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from hooks import (
    HookResponse,
    find_project_root,
    get_context_state,
    is_cyclist_running,
    load_settings,
    output_hook_response,
    read_stdin_json,
    send_to_cyclist,
)


def _resolve_agent(session_id: str | None, project_root: Path | None) -> str | None:
    """Resolve agent name from session file.

    Looks up .session/agents/{session_id} to find the active agent name.
    Falls back to the most recently modified agent file if session_id
    doesn't match.

    Args:
        session_id: Claude Code session ID
        project_root: Project root directory

    Returns:
        Agent name string, or None if not found
    """
    if not project_root:
        return None

    agents_dir = project_root / ".session" / "agents"
    if not agents_dir.is_dir():
        return None

    # Try exact session_id match first
    if session_id:
        agent_file = agents_dir / session_id
        if agent_file.is_file():
            try:
                return agent_file.read_text().strip() or None
            except OSError:
                pass

    # Fallback: most recently modified agent file
    try:
        agent_files = sorted(
            (f for f in agents_dir.iterdir() if f.is_file()),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
        if agent_files:
            return agent_files[0].read_text().strip() or None
    except OSError:
        pass

    return None


def main() -> None:
    """Main entry point for PreToolUse hook."""
    try:
        # Read tool data from Claude Code
        tool_data = read_stdin_json()

        # Extract relevant fields
        tool_name = tool_data.get("tool_name", "")
        tool_id = tool_data.get("tool_use_id", "")
        tool_input = tool_data.get("tool_input", {})
        session_id = tool_data.get("session_id")

        # Find project root
        project_root = find_project_root()

        # Resolve agent name from session file (MSSCI-14392)
        agent_name = _resolve_agent(session_id, project_root)

        # Check if Cyclist is running
        if not is_cyclist_running(project_root):
            # No Cyclist - pass through to Claude Code's built-in permissions
            # Using "allow" so the hook doesn't override Claude Code's own
            # permission system (settings.json allow lists still apply)
            sys.exit(0)

        # Load settings to check for auto-approval mode
        settings = load_settings(project_root)
        if settings.permission_mode == "accept":
            # Auto-accept mode - approve everything
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Auto-accept mode enabled",
            ))
            sys.exit(0)

        # Get context state for inclusion in request
        context = get_context_state(project_root)

        # Build request data
        request_data = {
            "toolName": tool_name,
            "toolId": tool_id,
            "input": tool_input,
            "sessionId": session_id,
            "context": {
                "percentage": context.percentage,
                "isHigh": context.is_high,
                "isCritical": context.is_critical,
            },
        }
        # Include agent identity if resolved (MSSCI-14392)
        if agent_name:
            request_data["agent"] = agent_name

        # Send approval request to WheelHub with context info
        response = send_to_cyclist(
            endpoint="/api/hook-request",
            data=request_data,
            project_root=project_root,
        )

        if response is None:
            # Connection failed - defer to Claude Code
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="ask",
                reason="Could not connect to WheelHub",
            ))
            sys.exit(0)

        # Extract decision from response
        decision = response.get("decision", "ask")
        reason = response.get("reason", "")
        data = response.get("data")

        # Output decision
        output_hook_response(HookResponse(
            event_name="PreToolUse",
            decision=decision,
            reason=reason,
            updated_input=data,
        ))
        sys.exit(0)

    except Exception as e:
        # On error, output to stderr and exit with code 0 (allow)
        # We don't want hook failures to block the user
        print(f"[pretooluse-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
