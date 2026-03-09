"""
DEPRECATED — Reflector-check hook removed from dispatch registry and CLI.

This module is no longer registered in the dispatch registry or CLI.
It remains on disk for reference only. Safe to delete.

Original purpose: Stop hook enforcing CYCLIST reflector markers.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# =============================================================================
# Import detection logic — inline to avoid import path issues
# The logic lives in question_reflector_check.py in pennyfarthing-dist/scripts/hooks/
# We consolidate the essential parts here.
# =============================================================================

# Marker patterns
QUESTION_MARKER_PATTERN = re.compile(r"<!--\s*CYCLIST:QUESTION:(yesno|open)\s*-->", re.IGNORECASE)
CHOICES_MARKER_PATTERN = re.compile(r"<!--\s*CYCLIST:CHOICES:[^>]+\s*-->", re.IGNORECASE)
HANDOFF_MARKER_PATTERN = re.compile(r"<!--\s*CYCLIST:HANDOFF:/\w+\s*-->", re.IGNORECASE)
CONTEXT_CLEAR_MARKER_PATTERN = re.compile(r"<!--\s*CYCLIST:CONTEXT_CLEAR:/\w+\s*-->", re.IGNORECASE)
CONTINUE_MARKER_PATTERN = re.compile(r"<!--\s*CYCLIST:CONTINUE\s*-->", re.IGNORECASE)

DIRECT_QUESTION_PATTERN = re.compile(r"\?(\s*$|\s+[A-Z]|\s*\n)")
RHETORICAL_PATTERNS = re.compile(
    r"\b(the question (was|is)|asked whether|wondering if)\b", re.IGNORECASE
)

IMPLICIT_PATTERNS = [
    re.compile(r"\bwould you like\b", re.IGNORECASE),
    re.compile(r"\bshould I\b", re.IGNORECASE),
    re.compile(r"\bdo you want\b", re.IGNORECASE),
    re.compile(r"\blet me know if\b", re.IGNORECASE),
    re.compile(r"\bwhat do you (think|prefer)\b", re.IGNORECASE),
    re.compile(r"\byour (preference|thoughts)\b", re.IGNORECASE),
    re.compile(r"\bcould you (clarify|confirm|specify)\b", re.IGNORECASE),
    re.compile(r"\bwhich (option|approach)\b", re.IGNORECASE),
    re.compile(r"\bready to proceed\b", re.IGNORECASE),
]

CHOICE_PATTERNS = [
    re.compile(r"\boption [A-D]\b", re.IGNORECASE),
    re.compile(r"\bchoice [0-9]\b", re.IGNORECASE),
    re.compile(r"\bwe could (either|do)\b", re.IGNORECASE),
    re.compile(r"\balternatively\b", re.IGNORECASE),
    re.compile(r"\bor would you prefer\b", re.IGNORECASE),
    re.compile(r"\bpick one\b", re.IGNORECASE),
    re.compile(r"\bchoose between\b", re.IGNORECASE),
]

HANDOFF_PHRASE_PATTERNS = [
    re.compile(r"\bhanding (off )?to\b", re.IGNORECASE),
    re.compile(r"\bpassing to\b", re.IGNORECASE),
    re.compile(r"\bhand(ing)? this (off )?to\b", re.IGNORECASE),
    re.compile(r"\b(Naomi|Amos|Avasarala|Holden|Alex|Drummer) (will|can)\b", re.IGNORECASE),
    re.compile(r"\bfor (the )?(GREEN|RED|REVIEW) phase\b", re.IGNORECASE),
    re.compile(r"\bspawning .* agent\b", re.IGNORECASE),
]


def _strip_code_blocks(text: str) -> str:
    result = re.sub(r"```[\s\S]*?```", "", text)
    return re.sub(r"`[^`]+`", "", result)


def _has_reflector_marker(message: str) -> bool:
    return bool(
        QUESTION_MARKER_PATTERN.search(message)
        or CHOICES_MARKER_PATTERN.search(message)
        or HANDOFF_MARKER_PATTERN.search(message)
        or CONTEXT_CLEAR_MARKER_PATTERN.search(message)
        or CONTINUE_MARKER_PATTERN.search(message)
    )


def _detect_question(message: str) -> dict[str, Any]:
    clean = _strip_code_blocks(message)
    if RHETORICAL_PATTERNS.search(clean):
        return {"detected": False, "type": ""}
    if DIRECT_QUESTION_PATTERN.search(clean):
        return {"detected": True, "type": "direct"}
    for p in IMPLICIT_PATTERNS:
        if p.search(clean):
            return {"detected": True, "type": "implicit"}
    for p in CHOICE_PATTERNS:
        if p.search(clean):
            return {"detected": True, "type": "choices"}
    return {"detected": False, "type": ""}


def _detect_handoff_phrase(message: str) -> bool:
    clean = _strip_code_blocks(message)
    return any(p.search(clean) for p in HANDOFF_PHRASE_PATTERNS)


def _has_task_tool_in_turn(transcript: list[dict[str, Any]]) -> bool:
    current_turn_start = -1
    for i, entry in enumerate(transcript):
        msg = entry.get("message", entry)
        if msg.get("role") == "user":
            current_turn_start = i
    if current_turn_start < 0:
        return False
    for entry in transcript[current_turn_start:]:
        msg = entry.get("message", entry)
        if msg.get("role") == "assistant":
            content = msg.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if block.get("type") == "tool_use" and block.get("name") == "Task":
                        return True
    return False


def _extract_last_assistant_message(transcript: list[dict[str, Any]]) -> str:
    for entry in reversed(transcript):
        msg = entry.get("message", entry)
        if msg.get("role") == "assistant":
            content = msg.get("content", "")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return "".join(
                    block.get("text", "") for block in content if block.get("type") == "text"
                )
            return ""
    return ""


def _build_block_reason(question_type: str, handoff_without_task: bool = False) -> str:
    if handoff_without_task:
        return (
            "HANDOFF COMPLIANCE VIOLATION: You said you would hand off but did NOT use the Task tool.\n\n"
            "SM Protocol: Task tool FIRST, narration SECOND.\n\n"
            "Either:\n"
            "1. Actually spawn the agent now using the Task tool, OR\n"
            "2. If you completed the work yourself, remove handoff language and add <!-- CYCLIST:CONTINUE -->"
        )
    reason = "Missing CYCLIST marker. Your response content is fine - just APPEND the marker.\n\n"
    if question_type == "direct":
        reason += "Detected: direct question (?)\nAPPEND THIS: <!-- CYCLIST:QUESTION:open -->\n(Use yesno if it's a yes/no question)"
    elif question_type == "implicit":
        reason += "Detected: implicit question (would you like, should I, etc.)\nAPPEND THIS: <!-- CYCLIST:QUESTION:yesno -->"
    elif question_type == "choices":
        reason += "Detected: choice offering\nAPPEND THIS: <!-- CYCLIST:CHOICES:option1,option2 -->\n(Replace option1,option2 with actual choices)"
    else:
        reason += (
            "No question detected - this looks like a status update.\n"
            "APPEND THIS: <!-- CYCLIST:CONTINUE -->\n\n"
            "Other markers if needed:\n"
            "  <!-- CYCLIST:HANDOFF:/agent --> - workflow handoff\n"
            "  <!-- CYCLIST:QUESTION:yesno --> - yes/no question\n"
            "  <!-- CYCLIST:QUESTION:open --> - open question"
        )
    return reason


def _load_config(project_dir: str) -> dict[str, Any]:
    try:
        config_path = Path(project_dir) / ".pennyfarthing" / "config.local.yaml"
        content = config_path.read_text()
        config: dict[str, Any] = {"workflow": {}}
        mode_match = re.search(r"permission_mode:\s*(\w+)", content)
        if mode_match:
            config["workflow"]["permission_mode"] = mode_match.group(1)
        relay_match = re.search(r"relay_mode:\s*(true|false)", content)
        if relay_match:
            config["workflow"]["relay_mode"] = relay_match.group(1) == "true"
        return config
    except Exception:
        return {"workflow": {"permission_mode": "manual"}}


def _should_skip_enforcement() -> bool:
    return os.environ.get("PF_GUI") != "1"


def _read_transcript(transcript_path: str) -> tuple[str, list[dict[str, Any]]]:
    try:
        content = Path(transcript_path).read_text()
        lines = [line for line in content.strip().split("\n") if line]
        transcript: list[dict[str, Any]] = []
        for line in lines:
            try:
                transcript.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        return _extract_last_assistant_message(transcript), transcript
    except Exception:
        return "", []


# =============================================================================
# Entry Point
# =============================================================================


def main() -> None:
    """Main CLI entry point for reflector check hook."""
    input_data_str = sys.stdin.read()

    try:
        input_data = json.loads(input_data_str)
    except json.JSONDecodeError:
        print(json.dumps({"ok": True}))
        sys.exit(0)

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    _load_config(project_dir)

    # Prevent infinite loops
    if input_data.get("stop_hook_active"):
        print(json.dumps({"ok": True}))
        sys.exit(0)

    # Skip in CLI mode
    if _should_skip_enforcement():
        print(json.dumps({"ok": True}))
        sys.exit(0)

    # AskUserQuestion PreToolUse check
    if input_data.get("tool_name") == "AskUserQuestion":
        print(json.dumps({"ok": True}))
        sys.exit(0)

    # Stop hook — validate reflector markers
    transcript_path = input_data.get("transcript_path", "")
    last_message, transcript = _read_transcript(transcript_path) if transcript_path else ("", [])

    if not last_message:
        print(json.dumps({"ok": True}))
        sys.exit(0)

    if _has_reflector_marker(last_message):
        print(json.dumps({"ok": True}))
        sys.exit(0)

    # Handoff compliance check
    if _detect_handoff_phrase(last_message):
        has_task = transcript and _has_task_tool_in_turn(transcript)
        if not has_task:
            print(
                json.dumps(
                    {
                        "decision": "block",
                        "reason": _build_block_reason("", handoff_without_task=True),
                    }
                )
            )
            sys.exit(0)

    # No marker — block with guidance
    detection = _detect_question(last_message)
    q_type = detection["type"] if detection["detected"] else ""
    print(
        json.dumps(
            {
                "decision": "block",
                "reason": _build_block_reason(q_type),
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"ok": True}))
        sys.exit(0)
