"""
Sprint findings CLI command — `pf sprint findings [SPRINT_NUMBER]`.

Wires the aggregation pipeline from pf.findings.aggregate into a CLI command
that produces sprint-level findings reports for retro consumption.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click
import yaml

from pf.common.config import get_project_root
from pf.findings.aggregate import (
    aggregate_findings,
    collect_session_files,
    detect_patterns,
    format_report,
)


def _get_project_root() -> Path:
    """Get project root (mockable for tests)."""
    return get_project_root()


@click.command("findings")
@click.argument("sprint_number", required=False, type=int)
@click.option(
    "--format",
    "output_format",
    default="markdown",
    type=click.Choice(["markdown", "json"]),
    help="Output format (default: markdown).",
)
def findings_command(sprint_number: int | None, output_format: str):
    """Show aggregated findings for a sprint.

    Collects delivery findings from all archived session files for the
    specified sprint, groups them by type/path/agent, detects recurring
    patterns, and outputs a formatted report.

    If SPRINT_NUMBER is omitted, uses the current sprint.

    \b
    Examples:
      pf sprint findings              # Current sprint, markdown
      pf sprint findings 2608         # Specific sprint
      pf sprint findings --format json # JSON output
    """
    project_root = _get_project_root()
    archive_dir = project_root / "sprint" / "archive"

    if not archive_dir.exists():
        click.echo("Error: Archive directory not found.")
        sys.exit(1)

    if sprint_number is None:
        current_sprint_file = project_root / "sprint" / "current-sprint.yaml"
        if not current_sprint_file.exists():
            click.echo("Error: No sprint number and current-sprint.yaml not found.")
            sys.exit(1)
        with open(current_sprint_file) as f:
            data = yaml.safe_load(f)
        sprint_number = data.get("sprint", {}).get("number")
        if sprint_number is None:
            click.echo("Error: Could not determine sprint number.")
            sys.exit(1)

    result = collect_session_files(archive_dir, sprint_number)
    if not result["success"]:
        click.echo(f"Sprint {sprint_number} not found.")
        sys.exit(1)

    agg = aggregate_findings(result["data"]["sessions"])
    if not agg["success"]:
        click.echo(f"Error: {agg['error']}")
        sys.exit(1)

    pats = detect_patterns(agg["data"])
    pat_data = pats["data"] if pats["success"] else {"patterns": [], "pattern_count": 0}

    fmt = format_report(agg["data"], pat_data, output_format)
    if not fmt["success"]:
        click.echo(f"Error: {fmt['error']}")
        sys.exit(1)

    click.echo(fmt["data"]["output"])
