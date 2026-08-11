"""Reviewer CLI commands.

Exposes reviewer tooling as ``pf reviewer <subcommand>``.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click


@click.group(name="reviewer")
def reviewer() -> None:
    """Reviewer tooling — audit, diff-mode, and mutation-guard commands."""


@reviewer.command("audit-tree")
@click.option(
    "--cwd",
    default=None,
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    help="Directory to audit (defaults to current working directory).",
)
def audit_tree(cwd: Path | None) -> None:
    """Audit the working tree for unexpected source changes.

    Exit 0 if the tree is clean; exit 1 if any source changes are detected.
    Run this after reviewer mutation-testing subagents return to ensure no
    mutation was left applied in the live working tree.

    Example (from reviewer.md post-subagent gate)::

        pf reviewer audit-tree
    """
    from pf.reviewer.worktree_audit import check_working_tree_clean

    result = check_working_tree_clean(cwd=cwd)

    if result.get("error"):
        click.echo(f"[audit-tree] ERROR: {result['error']}", err=True)
        sys.exit(1)

    if result["success"]:
        click.echo("[audit-tree] CLEAN — no unexpected source changes detected.")
        sys.exit(0)
    else:
        click.echo(
            "[audit-tree] DIRTY — mutation-testing subagent left source changes in the"
            " working tree. HALT: do NOT proceed with the review verdict.",
            err=True,
        )
        click.echo("[audit-tree] Affected files:", err=True)
        for f in result["dirty_files"]:
            click.echo(f"  {f}", err=True)
        click.echo(
            "\nRestore the working tree before continuing:\n"
            "  git checkout -- .\n"
            "  git clean -fd\n"
            "Then re-run the subagent that left the mutation so it operates on a scratch copy.",
            err=True,
        )
        sys.exit(1)
