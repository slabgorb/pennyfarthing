"""
CLI commands for dependency analysis.

Usage:
    python -m pf.dependencies analyze [OPTIONS]
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

import click

if TYPE_CHECKING:
    from pf.dependencies.models import DependenciesResult


@click.group()
def dependencies():
    """Dependency staleness and security analysis.

    \b
    Commands:
      analyze  - Analyze dependency health
    """
    pass


def _run_analysis(target_path: str | None) -> DependenciesResult:
    """Run analysis and return result."""
    from pf.dependencies.analyze import analyze_dependencies

    p = Path(target_path).resolve() if target_path else Path(".").resolve()
    return asyncio.run(analyze_dependencies(p))


def _output_result(result, fmt: str, output_file: str | None):
    """Format and output the analysis result."""
    from pf.dependencies.formatters import (
        export_csv,
        export_json,
        format_audit_table,
        format_outdated_table,
    )

    if fmt == "json":
        text = export_json(result)
    elif fmt == "csv":
        text = export_csv(result.outdated)
    else:
        parts = [format_outdated_table(result.outdated)]
        if result.advisories:
            parts.append("")
            parts.append(format_audit_table(result.advisories))
        text = "\n".join(parts)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)


@dependencies.command()
@click.option("--path", "target_path", type=click.Path(exists=True),
              help="Directory to analyze")
@click.option("--format", "fmt", type=click.Choice(["table", "json", "csv"]),
              default="table", show_default=True)
@click.option("--output", "output_file", type=click.Path(),
              help="Write output to file")
def analyze(target_path, fmt, output_file):
    """Analyze dependency health."""
    result = _run_analysis(target_path)
    _output_result(result, fmt, output_file)
