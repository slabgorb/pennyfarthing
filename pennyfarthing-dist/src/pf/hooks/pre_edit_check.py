"""
Pre-edit check hook (PreToolUse) — block edits to protected files.

Prevents editing sensitive files (.env, .pem, .key, credentials, secrets),
git internals, node_modules, and managed pennyfarthing files.

Exit 0 = allow, Exit 2 = block.
"""

from __future__ import annotations

import fnmatch
import json
import os
import sys
from pathlib import Path

# Protected patterns — files that should never be edited automatically
PROTECTED_PATTERNS = [
    "*.env",
    "*.pem",
    "*.key",
    "*credentials*",
    "*secrets*",
    ".git/*",
    "node_modules/*",
    "vendor/*",
]


_PATTERN_FIX_HINTS = {
    "*.env": "To fix: Use environment-specific config files (e.g. `.env.example`) or set values via `pf settings`.",
    "*.pem": "To fix: Reference certificates from a secure store; do not edit key files directly.",
    "*.key": "To fix: Reference keys from a secure store; do not edit key files directly.",
    "*credentials*": "To fix: Store credentials in a vault or environment variables, not in files.",
    "*secrets*": "To fix: Store secrets in a vault or environment variables, not in files.",
    ".git/*": "To fix: Use `git` CLI commands instead of editing `.git/` internals directly.",
    "node_modules/*": "To fix: Edit the source package and run `pnpm install` to update `node_modules/`.",
    "vendor/*": "To fix: Edit the upstream dependency and re-vendor.",
}


def main() -> None:
    """Main entry point for pre-edit check hook."""
    try:
        raw = sys.stdin.read()
        try:
            input_data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            sys.exit(0)

        tool_input = input_data.get("tool_input", {})
        file_path = tool_input.get("file_path", "") or tool_input.get("path", "")

        if not file_path:
            sys.exit(0)

        # Check managed pennyfarthing files protection
        # EXCEPTION: If we ARE in the pennyfarthing library itself, allow edits
        project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
        is_pennyfarthing_lib = Path(project_dir, "pennyfarthing-dist").is_dir()

        if ".claude/pennyfarthing/" in file_path and not is_pennyfarthing_lib:
            print("BLOCKED: Cannot edit managed pennyfarthing files.", file=sys.stderr)
            print(f"File: {file_path}", file=sys.stderr)
            print("", file=sys.stderr)
            print(
                "These files are managed by pennyfarthing and will be overwritten on update.",
                file=sys.stderr,
            )
            print("Instead:", file=sys.stderr)
            print("  - Put project-specific customizations in .claude/project/", file=sys.stderr)
            print(
                "  - For framework changes, edit the pennyfarthing repo and run 'pennyfarthing update'",
                file=sys.stderr,
            )
            sys.exit(2)

        # Check protected patterns
        for pattern in PROTECTED_PATTERNS:
            if fnmatch.fnmatch(file_path, pattern):
                print(
                    f"BLOCKED: Cannot edit protected file matching pattern: {pattern}",
                    file=sys.stderr,
                )
                print(f"File: {file_path}", file=sys.stderr)
                fix = _PATTERN_FIX_HINTS.get(
                    pattern, "To fix: Use an alternative file path outside the protected pattern."
                )
                print(f"\n{fix}", file=sys.stderr)
                sys.exit(2)

    except SystemExit:
        raise
    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
