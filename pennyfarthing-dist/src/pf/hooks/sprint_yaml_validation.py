"""
Sprint YAML validation hook (PostToolUse) — validate sprint YAML after edits.

Validates sprint YAML files in-process using the Python validator
(``pf.sprint.validator`` — single source of truth per ADR-0034). When
validation fails, returns ``additionalContext`` prompting the agent to fix the
format. This is advisory only: every path exits 0 and never blocks the write.

History: this hook previously shelled out to ``node`` with an ``import { parse }
from 'yaml'`` script. That npm package is unresolvable in consumer projects, so
every sprint-YAML write crashed the hook with ``ERR_MODULE_NOT_FOUND`` (or
silently no-op'd when ``node`` was absent). Story 153-7 replaced the Node
subprocess with the in-tree Python validator.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pf.hooks import (
    HookResponse,
    output_hook_response,
)


def main() -> None:
    """Main entry point for sprint YAML validation hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            sys.exit(0)

        tool_name = input_data.get("tool_name", "")
        tool_input = input_data.get("tool_input", {})
        file_path = tool_input.get("file_path", "")

        # Only process Edit/Write on sprint YAML files
        if tool_name not in ("Edit", "Write"):
            sys.exit(0)

        if not re.search(r"sprint/.*\.(yaml|yml)$", file_path):
            sys.exit(0)

        path = Path(file_path)
        if not path.is_file():
            sys.exit(0)

        # Validate in-process via the Python validator (ADR-0034, single truth).
        # Route through the shard-aware document validator so epic shards
        # (sprint/epic-*.yaml — matched by the path filter too) are not
        # false-flagged with "Missing required 'sprint' section".
        result = _validate(path)

        if result is None or result.valid:
            sys.exit(0)

        from pf.sprint.validator import format_validation_errors

        errors = format_validation_errors(result)
        output_hook_response(
            HookResponse(
                event_name="PostToolUse",
                additional_context=(
                    f"SPRINT YAML VALIDATION FAILED\n\n"
                    f"File: {file_path}\n"
                    f"{errors}\n\n"
                    f"The sprint YAML file has validation errors. Fix them so the "
                    f"Cyclist SprintPanel can parse the file."
                ),
            )
        )

    except SystemExit:
        raise
    except Exception:
        pass

    sys.exit(0)


def _validate(path: Path):
    """Validate a sprint YAML file, returning a ``ValidationResult`` or ``None``.

    Reuses the cross-parser blank-line check from ``validate_sprint_file`` but
    dispatches the parsed document through ``validate_sprint_document`` so epic
    shards are validated as shards, not full sprints.
    """
    from pf.sprint.validator import (
        ValidationResult,
        validate_sprint_document,
    )

    result = ValidationResult(valid=True)
    raw_content = path.read_text()

    # Single-quoted YAML values spanning blank lines parse in Python's yaml but
    # fail in Node's yaml library (Cyclist's panel). Flag them.
    in_sq = False
    sq_start_line = 0
    has_blank = False
    for line_num, line in enumerate(raw_content.splitlines(), 1):
        if not in_sq:
            stripped = line.lstrip()
            if stripped.startswith("#"):
                continue
            colon_match = re.search(r":\s+'", line)
            if colon_match:
                after = line[colon_match.end() - 1 :]
                clean = after.replace("''", "")
                if clean.count("'") == 1:
                    in_sq = True
                    sq_start_line = line_num
                    has_blank = False
        else:
            if line.strip() == "":
                has_blank = True
            clean = line.replace("''", "")
            if "'" in clean:
                if has_blank:
                    result.add_error(
                        "Single-quoted string contains blank lines (breaks Cyclist "
                        "panel parser). Use block scalar (|) or flow-style "
                        "double-quoted string instead.",
                        f"{path}:{sq_start_line}",
                    )
                in_sq = False
                has_blank = False

    if result.errors:
        return result

    import yaml

    try:
        data = yaml.safe_load(raw_content)
    except yaml.YAMLError as e:
        result.add_error(f"Failed to parse YAML: {e}", str(path))
        return result

    # Merge sharded epic files for full sprint documents (no-op for raw shards).
    from pf.sprint.loader import _merge_epic_shards

    data = _merge_epic_shards(data, path.parent)

    result.merge(validate_sprint_document(data))
    return result


if __name__ == "__main__":
    main()
