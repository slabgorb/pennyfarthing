"""pf check — Click wrapper around scripts/workflow/check.py.

The auto-detection logic (justfile → npm/pnpm → language-specific tools)
lives in ``pennyfarthing-dist/scripts/workflow/check.py`` and is preserved
as-is. This module exposes it as ``pf check`` so agent workflows can call
the CLI surface without knowing the script's path.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import click

from pf.common.config import get_project_root


def _resolve_check_script() -> Path | None:
    """Locate scripts/workflow/check.py across orchestrator and framework layouts."""
    root = get_project_root()
    candidates = [
        root / "pennyfarthing" / "pennyfarthing-dist" / "scripts" / "workflow" / "check.py",
        root / "pennyfarthing-dist" / "scripts" / "workflow" / "check.py",
        root / ".pennyfarthing" / "scripts" / "workflow" / "check.py",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    # Last resort: relative to this package (installed layout)
    here = Path(__file__).resolve()
    pkg_candidate = here.parents[1] / "_dist" / "scripts" / "workflow" / "check.py"
    if pkg_candidate.exists():
        return pkg_candidate
    return None


@click.command(
    "check",
    context_settings={"ignore_unknown_options": True, "allow_extra_args": True},
)
@click.pass_context
def check(ctx: click.Context) -> None:
    """Run project-agnostic quality checks (lint, typecheck, tests).

    Auto-detects the project's tooling — justfile recipes first, then
    npm/pnpm scripts, then language-specific tools (go test, tsc, etc.).
    Used by TEA's verify-workflow for regression detection.

    \b
    Common flags (passed through to the runner):
      --skip-check       Skip all checks (emergency bypass)
      --tests-only       Run only tests, skip lint and typecheck
      --no-lint          Skip lint check
      --no-typecheck     Skip type check
      --fast             Skip slow packages for rapid iteration
      --filter PATTERN   Filter tests by pattern
      --repo REPO        Run checks in a specific subdirectory

    Exit code 0 means all checks passed (or were skipped); non-zero
    means at least one check failed.
    """
    script = _resolve_check_script()
    if script is None:
        click.echo("Error: scripts/workflow/check.py not found", err=True)
        sys.exit(1)

    cmd = [sys.executable, str(script), *list(ctx.args)]
    result = subprocess.run(cmd)
    sys.exit(result.returncode)
