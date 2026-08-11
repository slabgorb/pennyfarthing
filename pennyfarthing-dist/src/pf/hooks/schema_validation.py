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

#: Session field line — mirrors ``story_finish.SESSION_FIELD_RE`` EXACTLY, label
#: class included, and is pinned equal to it by the 162-11 test suite. The hook
#: may only accept a line the consumer can actually parse. An earlier cut of
#: this story used a looser label class that admitted a trailing repo qualifier
#: (``PR (pennyfarthing)``, ``PR [ui]``) for 162-33 forward compat; that let a
#: session pass whose only PR line finish resolves to nothing — the 155-32
#: failure class this hook exists to prevent. Qualified lines are still
#: tolerated as EXTRAS (an unparsed line is simply not a field here); they just
#: do not count as the required line until finish can read them.
#: Anchoring is the other load-bearing part — a mid-prose mention of a field
#: token is not a field (155-40).
#: Hyphens inside the key are accepted (162-33) so a per-repo ``**PR my-repo:**``
#: line is a field for a real (hyphenated) repo name. Kept byte-identical to the
#: consumer's ``SESSION_FIELD_RE``; the test at
#: ``test_162_11_schema_hook_session_fields.py`` pins that equality.
_FIELD_LINE_RE = re.compile(r"^\s*(?:[-*]\s+)?\*\*(\w[\w\s-]*):\*\*\s*(.*)")

#: Merge-target fields the 155-33 template contract puts in Story Details, and
#: which ``story_finish`` reads. Missing lines here are how 155-32 went done
#: with an open PR, so the hook refuses the write instead of trusting the
#: template (SOUL #11).
STORY_DETAILS_SECTION = "story details"
SESSION_REQUIRED_FIELDS: dict[str, str] = {
    "branch": (
        "Missing the Branch field line in the Story Details section. "
        "To fix: add `- **Branch:** feat/162-11-my-feature` with a non-blank "
        "value (a placeholder note is fine) to Story Details."
    ),
    "pr": (
        "Missing the PR field line in the Story Details section. "
        "To fix: add `- **PR:** (none yet - recorded when the PR is created)` "
        "with a non-blank value to Story Details. The label must be bare: a "
        "per-repo qualifier such as PR (repo-name) is not resolvable yet "
        "(162-33), so such a line may appear in addition but does not satisfy "
        "this requirement."
    ),
}
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


def _story_details_field_labels(content: str) -> set[str]:
    """Labels of the parseable field lines inside Story Details, lowercased.

    Story Details is the section ``story_finish._parse_session`` treats as
    authoritative for branch/PR (155-40), and the line pattern here is the
    consumer's own — so a session that passes is by construction one finish can
    read. Labels are lowercased because finish lowercases before keying. Blank
    values are dropped: an empty field line and an absent one both extract to
    ``None`` at finish time. A line the consumer's pattern cannot parse (a
    qualified per-repo label, for now) contributes no label — it is tolerated,
    not counted.
    """
    labels: set[str] = set()
    in_details = False
    for line in content.splitlines():
        if line.startswith("## "):
            in_details = line[3:].strip().lower() == STORY_DETAILS_SECTION
            continue
        if not in_details:
            continue
        match = _FIELD_LINE_RE.search(line)
        if not match or not match.group(2).strip():
            continue
        labels.add(match.group(1).strip().lower())
    return labels


def _validate_session_fields(content: str) -> list[str]:
    """Require the merge-target field lines in the Story Details block."""
    present = _story_details_field_labels(content)
    return [msg for field, msg in SESSION_REQUIRED_FIELDS.items() if field not in present]


def _validate_session(content: str) -> list[str]:
    errors = []
    if "<session" not in content:
        # Markdown session: only the Story Details field contract applies (the
        # XML tag requirements below describe a shape it does not have).
        return _validate_session_fields(content)
    if not re.search(r'<session\s+story="[^"]+"', content):
        errors.append(
            "Missing story attribute on <session>. "
            'To fix: Use `<session story="X-Y" workflow="...">`'
        )
    if not re.search(r'<session[^>]+workflow="[^"]+"', content):
        errors.append(
            "Missing workflow attribute on <session>. "
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
                "Missing <jira> in <meta>. To fix: Add `<jira>PROJ-123</jira>` inside <meta>"
            )
        if "<started>" not in content:
            errors.append(
                "Missing <started> in <meta>. "
                "To fix: Add `<started>YYYY-MM-DD</started>` inside <meta>"
            )
    if not _has_tag(content, "status"):
        errors.append(
            'Missing <status> element. To fix: Add `<status phase="setup">in_progress</status>`'
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
                f"Missing <{tag}> tag. To fix: Add `<{tag}>content here</{tag}>` to the step file"
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
            output_hook_response(
                HookResponse(
                    event_name="PreToolUse",
                    decision="allow",
                    reason="Not a Write/Edit operation",
                )
            )
            sys.exit(0)

        file_path = tool_input.get("file_path", "")
        if not file_path:
            output_hook_response(
                HookResponse(
                    event_name="PreToolUse",
                    decision="allow",
                    reason="No file path",
                )
            )
            sys.exit(0)

        file_type = _get_file_type(file_path)
        if not file_type:
            output_hook_response(
                HookResponse(
                    event_name="PreToolUse",
                    decision="allow",
                    reason="Not a session/skill/step file",
                )
            )
            sys.exit(0)

        if tool_name == "Write":
            content = tool_input.get("content", "")
        else:
            output_hook_response(
                HookResponse(
                    event_name="PreToolUse",
                    decision="allow",
                    reason="Edit operations validated post-hoc",
                )
            )
            sys.exit(0)

        errors = _validate_content(file_path, content)
        if errors:
            error_msg = f"Schema validation failed for {file_type} file:\n"
            error_msg += "\n".join(f"  - {e}" for e in errors)
            error_msg += f"\n\nFile: {file_path}"
            output_hook_response(
                HookResponse(
                    event_name="PreToolUse",
                    decision="deny",
                    reason=error_msg,
                )
            )
            sys.exit(0)

        output_hook_response(
            HookResponse(
                event_name="PreToolUse",
                decision="allow",
                reason=f"Schema validation passed for {file_type} file",
            )
        )
        sys.exit(0)

    except Exception as e:
        print(f"[schema-validation-hook] Error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
