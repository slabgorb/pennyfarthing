"""
Cyclist PreToolUse Hook — route tool approval through WheelHub.

When Cyclist is running, sends approval requests to WheelHub's /api/hook-request
endpoint. Falls back to Claude Code's built-in permissions when Cyclist is not active.

Consolidates pretooluse_hook.py into the hooks subpackage.
"""

from __future__ import annotations

import sys
from pathlib import Path

from pf.hooks import (
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
    """Resolve agent name from session file."""
    if not project_root:
        return None

    agents_dir = project_root / ".session" / "agents"
    if not agents_dir.is_dir():
        return None

    if session_id:
        agent_file = agents_dir / session_id
        if agent_file.is_file():
            try:
                return agent_file.read_text().strip() or None
            except OSError:
                pass

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


def _forward_tool_input(
    tool_name: str,
    tool_id: str,
    tool_input: dict,
    project_root: Path | None,
) -> None:
    """Forward tool input to WheelHub for OTEL span correlation.

    Story 120-13: BikeRack's audit log needs tool inputs for Read, Grep, Edit,
    Write, etc. OTEL tool_result events don't include tool_parameters for these
    tools. This function sends tool inputs to WheelHub's pending-tool-input
    endpoint so the OTLP receiver can correlate them with incoming spans.
    """
    if not project_root:
        return
    try:
        send_to_cyclist(
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
        session_id = tool_data.get("session_id")

        project_root = find_project_root()
        agent_name = _resolve_agent(session_id, project_root)

        if not is_cyclist_running(project_root):
            sys.exit(0)

        # Forward tool input for audit log enrichment (Story 120-13)
        _forward_tool_input(tool_name, tool_id, tool_input, project_root)

        settings = load_settings(project_root)
        if settings.permission_mode == "accept":
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Auto-accept mode enabled",
            ))
            sys.exit(0)

        context = get_context_state(project_root)
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
        if agent_name:
            request_data["agent"] = agent_name

        response = send_to_cyclist(
            endpoint="/api/hook-request",
            data=request_data,
            project_root=project_root,
        )

        if response is None:
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="ask",
                reason="Could not connect to WheelHub",
            ))
            sys.exit(0)

        decision = response.get("decision", "ask")
        reason = response.get("reason", "")
        data = response.get("data")

        output_hook_response(HookResponse(
            event_name="PreToolUse",
            decision=decision,
            reason=reason,
            updated_input=data,
        ))
        sys.exit(0)

    except Exception as e:
        print(f"[pretooluse-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
