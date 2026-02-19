"""
Context warning hook (PreToolUse) — warn agent when context usage is high.

Uses context.py to check transcript-based context percentage.
Outputs warning text to stdout but always exits 0 (never blocks).
"""

from __future__ import annotations

import os
import sys

from pf.context import check_context, load_config


def main() -> None:
    """Main entry point for context warning hook."""
    try:
        # Read and discard stdin (required by hook protocol)
        sys.stdin.read()

        project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
        config = load_config(project_dir)

        result = check_context(project_dir=project_dir)

        if result.error:
            sys.exit(0)

        warning_threshold = config.warning_threshold
        critical_threshold = config.critical_threshold
        pct = result.usable_percent

        if pct >= critical_threshold:
            print(f"""
---
CONTEXT WARNING: {pct}% (CRITICAL)

Context usage is critically high. Recommended actions:
1. Complete current task immediately
2. Commit any pending changes
3. Hand off to next agent or ask user to start fresh session

Do NOT start new subtasks. Wrap up and hand off.
---
""")
        elif pct >= warning_threshold:
            print(f"""
---
CONTEXT WARNING: {pct}%

Context usage is high. Consider:
- Wrapping up current task soon
- Preparing for handoff to next agent
- Avoiding large file reads or complex operations
---
""")

    except Exception:
        pass

    sys.exit(0)


if __name__ == "__main__":
    main()
