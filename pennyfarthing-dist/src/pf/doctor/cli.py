"""Doctor CLI — pf doctor command.

Story 126-8: Reduce doctor to ~10 health checks with --fix mode.
"""

from __future__ import annotations

import json
import sys

import click

from pf.common.config import get_project_root


@click.command()
@click.option("--fix", is_flag=True, help="Attempt to fix failed checks")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def doctor(fix: bool, json_output: bool) -> None:
    """Run Pennyfarthing health checks.

    Checks Python install, config, hooks, symlinks, commands,
    skills, node packages, git hooks, and theme.
    """
    from pf.doctor.core import run_doctor

    root = get_project_root()
    report = run_doctor(root, fix=fix)

    if json_output:
        data = {
            "success": report.success,
            "checks": [
                {"name": c.name, "status": c.status, "detail": c.detail} for c in report.checks
            ],
            "fixed": report.fixed,
        }
        click.echo(json.dumps(data, indent=2))
    else:
        for c in report.checks:
            icon = {"pass": "OK", "warn": "!!", "fail": "FAIL"}[c.status]
            click.echo(f"  [{icon}] {c.name}: {c.detail}")
        if report.fixed:
            click.echo(f"\nFixed {report.fixed} issue(s).")
        if report.success:
            click.echo("\nAll checks passed.")
        else:
            click.echo("\nSome checks failed.")

    if not report.success:
        sys.exit(1)
