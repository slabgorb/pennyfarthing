"""Single hook dispatcher — runs all handlers for an event in one process.

Replaces N separate Python processes with one dispatcher that reads stdin
once, filters by matcher, and runs each handler in sequence.

Usage: pf hooks dispatch <event>
"""

from __future__ import annotations

import importlib
import io
import json
import sys
from typing import Any

# Registry: event -> [(name, matcher, module_path), ...]
# matcher: pipe-separated values matched against tool_name (PreToolUse/PostToolUse)
#          or source (SessionStart), or None for unconditional.
DISPATCH_REGISTRY: dict[str, list[tuple[str, str | None, str]]] = {
    "PreToolUse": [
        ("pre-edit-check", "Edit|Write", "pf.hooks.pre_edit_check"),
        ("context-warning", "Edit|Write|Bash|Task", "pf.hooks.context_warning"),
        ("context-breaker", "Edit|Write|Bash|Task", "pf.hooks.context_breaker"),
        ("schema-validation", "Write", "pf.hooks.schema_validation"),
        ("pretooluse-forward", None, "pf.hooks.pretooluse_forward"),
    ],
    "PostToolUse": [
        ("sprint-yaml", "Edit|Write", "pf.hooks.sprint_yaml_validation"),
    ],
    "Stop": [
        ("session-stop", None, "pf.hooks.session_stop"),
    ],
    "SessionStart": [
        ("session-start", None, "pf.hooks.session_start"),
        ("agent-reload", "compact|clear", "pf.hooks.agent_reload"),
    ],
    "SessionEnd": [
        ("session-end", None, "pf.hooks.session_end"),
    ],
    "PreCompact": [
        ("pre-compact", None, "pf.hooks.pre_compact"),
    ],
}

# Match field per event type
_MATCH_FIELD: dict[str, str] = {
    "PreToolUse": "tool_name",
    "PostToolUse": "tool_name",
    "SessionStart": "source",
}

# Decision priority (higher = more restrictive)
_DECISION_PRIORITY: dict[str, int] = {"allow": 1, "ask": 2, "deny": 3}


def _matches(pattern: str | None, value: str) -> bool:
    """Check if value matches a pipe-separated pattern (exact match per segment)."""
    if pattern is None:
        return True
    if not value:
        return False
    return value in pattern.split("|")


def _run_handler(module_path: str, stdin_data: str) -> tuple[str, str, int]:
    """Run a handler's main() with patched stdin/stdout/stderr.

    Returns:
        (stdout, stderr, exit_code)
    """
    old_stdin, old_stdout, old_stderr = sys.stdin, sys.stdout, sys.stderr
    captured_out = io.StringIO()
    captured_err = io.StringIO()
    exit_code = 0

    try:
        sys.stdin = io.StringIO(stdin_data)
        sys.stdout = captured_out
        sys.stderr = captured_err
        mod = importlib.import_module(module_path)
        mod.main()
    except SystemExit as exc:
        exit_code = exc.code if isinstance(exc.code, int) else 0
    except Exception:
        pass  # Fail open
    finally:
        sys.stdin, sys.stdout, sys.stderr = old_stdin, old_stdout, old_stderr

    return captured_out.getvalue(), captured_err.getvalue(), exit_code


def _parse_hook_json(text: str) -> dict[str, Any] | None:
    """Extract first HookResponse JSON from handler output."""
    for line in text.strip().splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
            if "hookSpecificOutput" in data:
                return data
        except json.JSONDecodeError:
            continue
    return None


def dispatch(event: str) -> None:
    """Run all registered handlers for *event*, merge output, exit."""
    handlers = DISPATCH_REGISTRY.get(event)
    if not handlers:
        sys.exit(0)

    # Read stdin once
    stdin_data = sys.stdin.read()
    try:
        input_json = json.loads(stdin_data)
    except (json.JSONDecodeError, ValueError):
        input_json = {}

    match_field = _MATCH_FIELD.get(event, "")
    match_value = input_json.get(match_field, "") if match_field else ""

    # Accumulators
    contexts: list[str] = []
    decision: str | None = None
    reason: str | None = None
    final_exit = 0

    for _name, matcher, module_path in handlers:
        if not _matches(matcher, match_value):
            continue

        stdout, stderr, exit_code = _run_handler(module_path, stdin_data)

        # Forward stderr immediately
        if stderr:
            print(stderr, end="", file=sys.stderr)

        # Parse structured response
        resp = _parse_hook_json(stdout)
        if resp:
            ho = resp.get("hookSpecificOutput", {})

            # Most restrictive decision wins
            d = ho.get("permissionDecision")
            if d and _DECISION_PRIORITY.get(d, 0) > _DECISION_PRIORITY.get(decision, 0):
                decision = d
                reason = ho.get("permissionDecisionReason") or reason

            ctx = ho.get("additionalContext")
            if ctx:
                contexts.append(ctx)
        else:
            # Non-JSON text -> additional context
            plain = stdout.strip()
            if plain:
                contexts.append(plain)

        # Exit 2 = block — stop chain
        if exit_code == 2:
            final_exit = 2
            break

        # JSON deny — stop chain
        if decision == "deny":
            break

    # Emit merged response
    if decision or contexts:
        output: dict[str, Any] = {
            "hookSpecificOutput": {"hookEventName": event}
        }
        if decision:
            output["hookSpecificOutput"]["permissionDecision"] = decision
        if reason:
            output["hookSpecificOutput"]["permissionDecisionReason"] = reason
        if contexts:
            output["hookSpecificOutput"]["additionalContext"] = "\n\n".join(contexts)
        print(json.dumps(output))

    sys.exit(final_exit)
