#!/usr/bin/env python3
"""
reflector_check.py - CYCLIST reflector marker enforcement hook

Story: MSSCI-12393 (questions), extended for all markers

EVERY turn end MUST have a CYCLIST reflector marker. This ensures:
- Cyclist UI can render appropriate buttons/actions
- User always has opportunity to intervene
- Workflow handoffs are never silently dropped

Valid markers (any one required):
  <!-- CYCLIST:HANDOFF:/agent -->        - Workflow handoff to next agent
  <!-- CYCLIST:CONTEXT_CLEAR:/agent -->  - Handoff with context clear (TirePump)
  <!-- CYCLIST:QUESTION:yesno -->        - Yes/no question
  <!-- CYCLIST:QUESTION:open -->         - Open-ended question
  <!-- CYCLIST:CHOICES:opt1,opt2,opt3 --> - Multiple choice
  <!-- CYCLIST:CONTINUE -->              - Status update, user can continue or redirect
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# =============================================================================
# Constants
# =============================================================================

# Marker patterns - ALL valid CYCLIST markers
QUESTION_MARKER_PATTERN = re.compile(r'<!--\s*CYCLIST:QUESTION:(yesno|open)\s*-->', re.IGNORECASE)
CHOICES_MARKER_PATTERN = re.compile(r'<!--\s*CYCLIST:CHOICES:[^>]+\s*-->', re.IGNORECASE)
HANDOFF_MARKER_PATTERN = re.compile(r'<!--\s*CYCLIST:HANDOFF:/\w+\s*-->', re.IGNORECASE)
CONTEXT_CLEAR_MARKER_PATTERN = re.compile(r'<!--\s*CYCLIST:CONTEXT_CLEAR:/\w+\s*-->', re.IGNORECASE)
CONTINUE_MARKER_PATTERN = re.compile(r'<!--\s*CYCLIST:CONTINUE\s*-->', re.IGNORECASE)

# Question patterns - direct (with ?)
# Match: end of line, followed by space+capital (new sentence), or followed by newline
DIRECT_QUESTION_PATTERN = re.compile(r'\?(\s*$|\s+[A-Z]|\s*\n)')

# Rhetorical patterns to exclude
RHETORICAL_PATTERNS = re.compile(r'\b(the question (was|is)|asked whether|wondering if)\b', re.IGNORECASE)

# Implicit question patterns
IMPLICIT_PATTERNS = [
    re.compile(r'\bwould you like\b', re.IGNORECASE),
    re.compile(r'\bshould I\b', re.IGNORECASE),
    re.compile(r'\bdo you want\b', re.IGNORECASE),
    re.compile(r'\blet me know if\b', re.IGNORECASE),
    re.compile(r'\bwhat do you (think|prefer)\b', re.IGNORECASE),
    re.compile(r'\byour (preference|thoughts)\b', re.IGNORECASE),
    re.compile(r'\bcould you (clarify|confirm|specify)\b', re.IGNORECASE),
    re.compile(r'\bwhich (option|approach)\b', re.IGNORECASE),
    re.compile(r'\bready to proceed\b', re.IGNORECASE),
]

# Choice offering patterns
CHOICE_PATTERNS = [
    re.compile(r'\boption [A-D]\b', re.IGNORECASE),
    re.compile(r'\bchoice [0-9]\b', re.IGNORECASE),
    re.compile(r'\bwe could (either|do)\b', re.IGNORECASE),
    re.compile(r'\balternatively\b', re.IGNORECASE),
    re.compile(r'\bor would you prefer\b', re.IGNORECASE),
    re.compile(r'\bpick one\b', re.IGNORECASE),
    re.compile(r'\bchoose between\b', re.IGNORECASE),
]


# =============================================================================
# Helper Functions
# =============================================================================

def strip_code_blocks(text: str) -> str:
    """Strip fenced code blocks from text to avoid false positives.

    Args:
        text: The text to process

    Returns:
        Text with code blocks removed
    """
    # Remove fenced code blocks (```...```)
    result = re.sub(r'```[\s\S]*?```', '', text)
    # Remove inline code (`...`)
    result = re.sub(r'`[^`]+`', '', result)
    return result


# =============================================================================
# Exported Functions
# =============================================================================

def should_skip_enforcement(config: dict[str, Any]) -> bool:
    """Check if enforcement should be skipped based on config.

    Args:
        config: The config object with workflow settings

    Returns:
        True if enforcement should be skipped
    """
    # Skip enforcement in CLI mode - markers are only needed for Cyclist UI
    # Cyclist sets CYCLIST=1 in the environment when spawning Claude
    if os.environ.get('CYCLIST') != '1':
        return True

    # In Cyclist mode, never skip enforcement - markers must always be emitted.
    # relay_mode only controls whether Cyclist auto-executes markers
    # vs showing buttons to the user.
    return False


def detect_question(message: str) -> dict[str, Any]:
    """Detect if a message contains a question.

    Args:
        message: The message to check

    Returns:
        Detection result with 'detected' bool and 'type' string
    """
    # Strip code blocks first
    clean_message = strip_code_blocks(message)

    # Check for rhetorical patterns - if found, not a real question
    if RHETORICAL_PATTERNS.search(clean_message):
        return {'detected': False, 'type': ''}

    # Check for direct questions (with ?)
    if DIRECT_QUESTION_PATTERN.search(clean_message):
        return {'detected': True, 'type': 'direct'}

    # Check for implicit questions
    for pattern in IMPLICIT_PATTERNS:
        if pattern.search(clean_message):
            return {'detected': True, 'type': 'implicit'}

    # Check for choice offerings
    for pattern in CHOICE_PATTERNS:
        if pattern.search(clean_message):
            return {'detected': True, 'type': 'choices'}

    return {'detected': False, 'type': ''}


def has_reflector_marker(message: str) -> bool:
    """Check if a message has ANY valid CYCLIST reflector marker.

    Args:
        message: The message to check

    Returns:
        True if any marker is present
    """
    return bool(
        QUESTION_MARKER_PATTERN.search(message) or
        CHOICES_MARKER_PATTERN.search(message) or
        HANDOFF_MARKER_PATTERN.search(message) or
        CONTEXT_CLEAR_MARKER_PATTERN.search(message) or
        CONTINUE_MARKER_PATTERN.search(message)
    )


def extract_last_assistant_message(transcript: list[dict[str, Any]]) -> str:
    """Extract the last assistant message from a transcript.

    Args:
        transcript: Array of message objects

    Returns:
        The last assistant message content
    """
    # Find the last assistant message (reverse order)
    # Claude Code transcript format wraps messages: { message: { role, content }, type, ... }
    for entry in reversed(transcript):
        # Support both wrapped format (Claude Code JSONL) and direct format (tests)
        msg = entry.get('message', entry)
        if msg.get('role') == 'assistant':
            content = msg.get('content', '')
            # Handle content as string or array
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                # Extract text from text blocks, skip tool_use blocks
                return ''.join(
                    block.get('text', '')
                    for block in content
                    if block.get('type') == 'text'
                )
            return ''
    return ''


def build_block_reason(question_type: str) -> str:
    """Build the block reason message.

    Args:
        question_type: The type of question detected (or empty for general)

    Returns:
        The reason message
    """
    reason = 'Every turn MUST end with a CYCLIST reflector marker. '

    if question_type:
        # Specific question type detected
        if question_type == 'direct':
            reason += 'You asked a question. Add <!-- CYCLIST:QUESTION:yesno --> or <!-- CYCLIST:QUESTION:open --> before your question.'
        elif question_type == 'implicit':
            reason += 'You asked an implicit question. Add <!-- CYCLIST:QUESTION:yesno --> before phrases like "would you like" or "should I".'
        elif question_type == 'choices':
            reason += 'You offered choices. Add <!-- CYCLIST:CHOICES:option1,option2,option3 --> listing the choices.'
    else:
        # No question detected, but still need a marker
        reason += 'Valid markers:\n'
        reason += '  <!-- CYCLIST:HANDOFF:/agent --> - workflow handoff\n'
        reason += '  <!-- CYCLIST:QUESTION:yesno --> - yes/no question\n'
        reason += '  <!-- CYCLIST:QUESTION:open --> - open question\n'
        reason += '  <!-- CYCLIST:CHOICES:a,b,c --> - multiple choice\n'
        reason += '  <!-- CYCLIST:CONTINUE --> - status update, user may continue or redirect'

    return reason


def check_question_reflector(
    input_data: dict[str, Any],
    config: dict[str, Any],
    last_message: str
) -> dict[str, Any]:
    """Main check for Stop hook - validates ALL turns have reflector markers.

    Args:
        input_data: Hook input with transcript_path, stop_hook_active
        config: Config with workflow settings
        last_message: The last assistant message (pre-extracted for testing)

    Returns:
        { 'ok': True } or { 'decision': 'block', 'reason': str }
    """
    # Prevent infinite loops
    if input_data.get('stop_hook_active'):
        return {'ok': True}

    # Skip enforcement in relay/turbo mode
    if should_skip_enforcement(config):
        return {'ok': True}

    # If no message, allow (edge case - shouldn't happen)
    if not last_message:
        return {'ok': True}

    # If ANY marker present, allow
    if has_reflector_marker(last_message):
        return {'ok': True}

    # No marker found - block
    # Check if it's a question to give more specific guidance
    detection = detect_question(last_message)
    return {
        'decision': 'block',
        'reason': build_block_reason(detection['type'] if detection['detected'] else ''),
    }


def check_ask_user_question(
    input_data: dict[str, Any],
    config: dict[str, Any],
    recent_output: str = ''
) -> dict[str, Any]:
    """Check for AskUserQuestion PreToolUse hook.

    Args:
        input_data: Hook input with tool_name, tool_input
        config: Config with workflow settings
        recent_output: Recent assistant output to check for marker

    Returns:
        { 'ok': True } or { 'decision': 'block', 'reason': str }
    """
    # Skip enforcement in relay/turbo mode
    if should_skip_enforcement(config):
        return {'ok': True}

    # If marker present in recent output, allow
    if recent_output and has_reflector_marker(recent_output):
        return {'ok': True}

    # Block - AskUserQuestion requires a marker
    return {
        'decision': 'block',
        'reason': 'AskUserQuestion tool requires a CYCLIST marker. Add <!-- CYCLIST:QUESTION:yesno -->, <!-- CYCLIST:QUESTION:open -->, or <!-- CYCLIST:CHOICES:... --> before using this tool.',
    }


# =============================================================================
# CLI Entry Point (for bash wrapper)
# =============================================================================

def load_config(project_dir: str) -> dict[str, Any]:
    """Load config from .pennyfarthing/config.local.yaml.

    Args:
        project_dir: The project directory

    Returns:
        The config object
    """
    try:
        config_path = Path(project_dir) / '.pennyfarthing' / 'config.local.yaml'
        content = config_path.read_text()
        # Simple YAML parsing for the fields we need
        config: dict[str, Any] = {'workflow': {}}

        # Extract permission_mode
        mode_match = re.search(r'permission_mode:\s*(\w+)', content)
        if mode_match:
            config['workflow']['permission_mode'] = mode_match.group(1)

        # Extract relay_mode
        relay_match = re.search(r'relay_mode:\s*(true|false)', content)
        if relay_match:
            config['workflow']['relay_mode'] = relay_match.group(1) == 'true'

        return config
    except Exception:
        # Default config if file doesn't exist
        return {'workflow': {'permission_mode': 'manual'}}


def read_transcript(transcript_path: str) -> str:
    """Read transcript and extract last assistant message.

    Args:
        transcript_path: Path to JSONL transcript

    Returns:
        The last assistant message
    """
    try:
        content = Path(transcript_path).read_text()
        lines = [line for line in content.strip().split('\n') if line]

        # Parse JSONL and build transcript array
        transcript = []
        for line in lines:
            try:
                transcript.append(json.loads(line))
            except json.JSONDecodeError:
                # Skip malformed lines
                pass

        return extract_last_assistant_message(transcript)
    except Exception:
        return ''


def main() -> None:
    """Main CLI entry point."""
    # Read input from stdin
    input_data_str = sys.stdin.read()

    try:
        input_data = json.loads(input_data_str)
    except json.JSONDecodeError:
        # Invalid input - allow to prevent breaking
        print(json.dumps({'ok': True}))
        sys.exit(0)

    # Determine project directory
    project_dir = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())

    # Load config
    config = load_config(project_dir)

    # Determine hook type based on input
    if input_data.get('tool_name') == 'AskUserQuestion':
        # PreToolUse hook for AskUserQuestion
        # For PreToolUse, we'd need the recent output - for now, just check config
        result = check_ask_user_question(input_data, config, '')
        print(json.dumps(result))
    else:
        # Stop hook
        transcript_path = input_data.get('transcript_path', '')
        last_message = read_transcript(transcript_path) if transcript_path else ''
        result = check_question_reflector(input_data, config, last_message)
        print(json.dumps(result))

    sys.exit(0)


if __name__ == '__main__':
    try:
        main()
    except Exception as err:
        print(str(err), file=sys.stderr)
        # On error, allow to prevent breaking
        print(json.dumps({'ok': True}))
        sys.exit(0)
