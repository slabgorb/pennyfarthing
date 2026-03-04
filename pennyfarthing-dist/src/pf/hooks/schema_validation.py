"""
Schema validation hook (PreToolUse) — validate XML schema on Write operations.

Validates session, skill, and workflow step files to ensure they have
required tags and attributes. Blocks the Write if validation fails.

Consolidates schema_validation_hook.py into the hooks subpackage.
"""

from __future__ import annotations

import re
import sys

from pf.hooks import (
    HookResponse,
    output_hook_response,
    read_stdin_json,
)

# =============================================================================
# File Type Detection
# =============================================================================

SKILL_REQUIRED_TAGS = ["run", "output"]
STEP_REQUIRED_TAGS = ["purpose", "instructions", "output"]
STEP_META_FIELDS = ["step", "workflow", "agent", "next"]


def _is_session_file(file_path: str) -> bool:
    return file_path.endswith("-session.md") and ".session/" in file_path


def _is_skill_file(file_path: str) -> bool:
    return file_path.endswith("/SKILL.md") and "/skills/" in file_path


def _is_step_file(file_path: str) -> bool:
    from pathlib import Path
    path = Path(file_path)
    return (
        path.name.startswith("step-")
        and path.name.endswith(".md")
        and "/workflows/" in file_path
        and "/steps/" in file_path
    )


def _get_file_type(file_path: str) -> str | None:
    if _is_session_file(file_path):
        return "session"
    elif _is_skill_file(file_path):
        return "skill"
    elif _is_step_file(file_path):
        return "step"
    return None


def _has_tag(content: str, tag: str) -> bool:
    return f"<{tag}>" in content or f"<{tag} " in content


def _validate_session(content: str) -> list[str]:
    errors = []
    if "<session" not in content:
        return []  # Old markdown format — warn but don't block
    if not re.search(r'<session\s+story="[^"]+"', content):
        errors.append(
            'Missing story attribute on <session>. '
            'To fix: Use `<session story="X-Y" workflow="...">`'
        )
    if not re.search(r'<session[^>]+workflow="[^"]+"', content):
        errors.append(
            'Missing workflow attribute on <session>. '
            'To fix: Use `<session story="X-Y" workflow="tdd">`'
        )
    if not _has_tag(content, "meta"):
        errors.append(
            "Missing <meta> section. "
            "To fix: Add `<meta><jira>PROJ-123</jira><started>YYYY-MM-DD</started></meta>`"
        )
    else:
        if "<jira>" not in content:
            errors.append(
                "Missing <jira> in <meta>. "
                "To fix: Add `<jira>PROJ-123</jira>` inside <meta>"
            )
        if "<started>" not in content:
            errors.append(
                "Missing <started> in <meta>. "
                "To fix: Add `<started>YYYY-MM-DD</started>` inside <meta>"
            )
    if not _has_tag(content, "status"):
        errors.append(
            "Missing <status> element. "
            'To fix: Add `<status phase="setup">in_progress</status>`'
        )
    elif 'phase="' not in content:
        errors.append(
            "Missing phase attribute on <status>. "
            'To fix: Use `<status phase="red">in_progress</status>`'
        )
    return errors


def _validate_skill(content: str) -> list[str]:
    errors = []
    if not content.startswith("---\n"):
        errors.append(
            "Missing YAML frontmatter. "
            "To fix: Start file with `---\\nname: my-skill\\ndescription: What it does\\n---`"
        )
    else:
        parts = content.split("---", 2)
        if len(parts) >= 2:
            frontmatter = parts[1]
            if "name:" not in frontmatter:
                errors.append(
                    "Missing 'name' in frontmatter. "
                    "To fix: Add `name: my-skill` between the `---` markers"
                )
            if "description:" not in frontmatter:
                errors.append(
                    "Missing 'description' in frontmatter. "
                    "To fix: Add `description: What this skill does` between the `---` markers"
                )
    for tag in SKILL_REQUIRED_TAGS:
        if not _has_tag(content, tag):
            errors.append(
                f"Missing <{tag}> tag (required). "
                f"To fix: Add `<{tag}>content here</{tag}>` to the file"
            )
    return errors


def _validate_step(content: str) -> list[str]:
    errors = []
    for tag in STEP_REQUIRED_TAGS:
        if not _has_tag(content, tag):
            errors.append(
                f"Missing <{tag}> tag. "
                f"To fix: Add `<{tag}>content here</{tag}>` to the step file"
            )
    if _has_tag(content, "step-meta"):
        meta_match = re.search(r"<step-meta>(.+?)</step-meta>", content, re.DOTALL)
        if meta_match:
            meta_content = meta_match.group(1)
            for field_name in STEP_META_FIELDS:
                if f"{field_name}:" not in meta_content:
                    errors.append(
                        f"Missing '{field_name}' in step-meta. "
                        f"To fix: Add `{field_name}: value` inside <step-meta>"
                    )
    return errors


def _validate_content(file_path: str, content: str) -> list[str]:
    file_type = _get_file_type(file_path)
    if file_type == "session":
        return _validate_session(content)
    elif file_type == "skill":
        return _validate_skill(content)
    elif file_type == "step":
        return _validate_step(content)
    return []


# =============================================================================
# Entry Point
# =============================================================================


def main() -> None:
    """Main entry point for schema validation hook."""
    try:
        tool_data = read_stdin_json()
        tool_name = tool_data.get("tool_name", "")
        tool_input = tool_data.get("tool_input", {})

        if tool_name not in ("Write", "Edit"):
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Not a Write/Edit operation",
            ))
            sys.exit(0)

        file_path = tool_input.get("file_path", "")
        if not file_path:
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="No file path",
            ))
            sys.exit(0)

        file_type = _get_file_type(file_path)
        if not file_type:
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Not a session/skill/step file",
            ))
            sys.exit(0)

        if tool_name == "Write":
            content = tool_input.get("content", "")
        else:
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason="Edit operations validated post-hoc",
            ))
            sys.exit(0)

        errors = _validate_content(file_path, content)
        if errors:
            error_msg = f"Schema validation failed for {file_type} file:\n"
            error_msg += "\n".join(f"  - {e}" for e in errors)
            error_msg += f"\n\nFile: {file_path}"
            output_hook_response(HookResponse(
                event_name="PreToolUse",
                decision="deny",
                reason=error_msg,
            ))
            sys.exit(0)

        output_hook_response(HookResponse(
            event_name="PreToolUse",
            decision="allow",
            reason=f"Schema validation passed for {file_type} file",
        ))
        sys.exit(0)

    except Exception as e:
        print(f"[schema-validation-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
