#!/usr/bin/env python3
"""
XML Schema Validation Hook for PreToolUse.

Validates session, skill, and workflow step files on Write/Edit operations.
Blocks the tool call if validation fails, providing immediate feedback.

Usage in settings.json:
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "python3 -m pennyfarthing_scripts.schema_validation_hook"
      }]
    }]
  }
}

Story: XML Schema Migration Tools
"""

import re
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from hooks import (
    HookResponse,
    output_hook_response,
    read_stdin_json,
)

# =============================================================================
# File Type Detection
# =============================================================================


def is_session_file(file_path: str) -> bool:
    """Check if path is a session file."""
    return file_path.endswith("-session.md") and ".session/" in file_path


def is_skill_file(file_path: str) -> bool:
    """Check if path is a skill SKILL.md file."""
    return file_path.endswith("/SKILL.md") and "/skills/" in file_path


def is_step_file(file_path: str) -> bool:
    """Check if path is a workflow step file."""
    path = Path(file_path)
    return (
        path.name.startswith("step-")
        and path.name.endswith(".md")
        and "/workflows/" in file_path
        and "/steps/" in file_path
    )


def get_file_type(file_path: str) -> str | None:
    """Detect file type from path."""
    if is_session_file(file_path):
        return "session"
    elif is_skill_file(file_path):
        return "skill"
    elif is_step_file(file_path):
        return "step"
    return None


# =============================================================================
# Content-Based Validation (inline to avoid import issues)
# =============================================================================

# Skill required tags
SKILL_REQUIRED_TAGS = ["run", "output"]

# Workflow step required tags
STEP_REQUIRED_TAGS = ["purpose", "instructions", "output"]

# Step meta required fields
STEP_META_FIELDS = ["step", "workflow", "agent", "next"]


def _has_tag(content: str, tag: str) -> bool:
    """Check if content contains a specific XML tag."""
    return f"<{tag}>" in content or f"<{tag} " in content


def validate_session_content(content: str) -> list[str]:
    """Validate session file content.

    Args:
        content: File content to validate

    Returns:
        List of error messages (empty if valid)
    """
    errors = []

    # Check for XML format indicator
    if "<session" not in content:
        # Old markdown format - warn but don't block during migration
        return []

    # Validate <session> root with attributes
    if not re.search(r'<session\s+story="[^"]+"', content):
        errors.append("Missing story attribute on <session>")

    if not re.search(r'<session[^>]+workflow="[^"]+"', content):
        errors.append("Missing workflow attribute on <session>")

    # Validate <meta> section
    if not _has_tag(content, "meta"):
        errors.append("Missing <meta> section")
    else:
        if "<jira>" not in content:
            errors.append("Missing <jira> in <meta>")
        if "<started>" not in content:
            errors.append("Missing <started> in <meta>")

    # Validate <status> element
    if not _has_tag(content, "status"):
        errors.append("Missing <status> element")
    else:
        if 'phase="' not in content:
            errors.append("Missing phase attribute on <status>")

    return errors


def validate_skill_content(content: str) -> list[str]:
    """Validate skill file content.

    Args:
        content: File content to validate

    Returns:
        List of error messages (empty if valid)
    """
    errors = []

    # Check YAML frontmatter
    if not content.startswith("---\n"):
        errors.append("Missing YAML frontmatter")
    else:
        parts = content.split("---", 2)
        if len(parts) >= 2:
            frontmatter = parts[1]
            if "name:" not in frontmatter:
                errors.append("Missing 'name' in frontmatter")
            if "description:" not in frontmatter:
                errors.append("Missing 'description' in frontmatter")

    # Check required tags
    for tag in SKILL_REQUIRED_TAGS:
        if not _has_tag(content, tag):
            errors.append(f"Missing <{tag}> tag (required)")

    return errors


def validate_step_content(content: str) -> list[str]:
    """Validate workflow step file content.

    Args:
        content: File content to validate

    Returns:
        List of error messages (empty if valid)
    """
    errors = []

    # Check required tags
    for tag in STEP_REQUIRED_TAGS:
        if not _has_tag(content, tag):
            errors.append(f"Missing <{tag}> tag")

    # Check step-meta fields if tag exists
    if _has_tag(content, "step-meta"):
        meta_match = re.search(r"<step-meta>(.+?)</step-meta>", content, re.DOTALL)
        if meta_match:
            meta_content = meta_match.group(1)
            for field_name in STEP_META_FIELDS:
                if f"{field_name}:" not in meta_content:
                    errors.append(f"Missing '{field_name}' in step-meta")

    return errors


def validate_content(file_path: str, content: str) -> list[str]:
    """Validate content based on file type.

    Args:
        file_path: Path to file being written
        content: Content being written

    Returns:
        List of error messages (empty if valid)
    """
    file_type = get_file_type(file_path)

    if file_type == "session":
        return validate_session_content(content)
    elif file_type == "skill":
        return validate_skill_content(content)
    elif file_type == "step":
        return validate_step_content(content)

    return []


# =============================================================================
# Hook Entry Point
# =============================================================================


def main() -> None:
    """Main entry point for schema validation hook."""
    try:
        # Read tool data from Claude Code
        tool_data = read_stdin_json()

        tool_name = tool_data.get("tool_name", "")
        tool_input = tool_data.get("tool_input", {})

        # Only process Write and Edit tools
        if tool_name not in ("Write", "Edit"):
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Not a Write/Edit operation",
            ))
            sys.exit(0)

        # Get file path
        file_path = tool_input.get("file_path", "")
        if not file_path:
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="No file path",
            ))
            sys.exit(0)

        # Check if this is a file we care about
        file_type = get_file_type(file_path)
        if not file_type:
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Not a session/skill/step file",
            ))
            sys.exit(0)

        # Get content to validate
        # For Write: use 'content'
        # For Edit: we need to simulate the edit result
        if tool_name == "Write":
            content = tool_input.get("content", "")
        else:
            # Edit operation - we can't easily validate without reading the file
            # For now, allow Edits and validate on Write only
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Edit operations validated post-hoc",
            ))
            sys.exit(0)

        # Validate content
        errors = validate_content(file_path, content)

        if errors:
            # Block the write
            error_msg = f"Schema validation failed for {file_type} file:\n"
            error_msg += "\n".join(f"  - {e}" for e in errors)
            error_msg += f"\n\nFile: {file_path}"

            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="deny",
                reason=error_msg,
            ))
            sys.exit(0)

        # Validation passed
        output_hook_response(HookResponse(
            event_name="PreToolUse",
            decision="allow",
            reason=f"Schema validation passed for {file_type} file",
        ))
        sys.exit(0)

    except Exception as e:
        # On error, allow to avoid blocking legitimate work
        print(f"[schema-validation-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
