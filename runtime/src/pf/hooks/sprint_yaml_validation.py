"""
Sprint YAML validation hook (PostToolUse) — validate sprint YAML after edits.

Validates that sprint YAML files are compatible with the yaml npm package
used by Cyclist's SprintPanel (strict YAML 1.2). When validation fails,
returns additionalContext prompting the agent to fix the format.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys

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

        from pathlib import Path

        if not Path(file_path).is_file():
            sys.exit(0)

        # Validate using Node.js yaml package (same parser Cyclist uses)
        validation_script = """
import { parse } from 'yaml';
import { readFileSync } from 'fs';
try {
  const content = readFileSync(process.argv[1], 'utf-8');
  parse(content);
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
"""
        try:
            result = subprocess.run(
                ["node", "--input-type=module", "-e", validation_script, file_path],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            sys.exit(0)

        if result.returncode == 0:
            sys.exit(0)

        # Validation failed
        error_text = result.stderr.strip().replace('"', '\\"').replace("\n", " ")
        escaped_path = file_path.replace('"', '\\"')

        output_hook_response(
            HookResponse(
                event_name="PostToolUse",
                additional_context=(
                    f"SPRINT YAML VALIDATION FAILED\n\n"
                    f"File: {escaped_path}\n"
                    f"Error: {error_text}\n\n"
                    f"The sprint YAML file has invalid syntax that will break the Cyclist SprintPanel.\n\n"
                    f"Common fix: Single-quoted strings cannot contain blank lines in YAML 1.2.\n"
                    f"Use literal block scalars (|) for multiline strings instead."
                ),
            )
        )

    except SystemExit:
        raise
    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
