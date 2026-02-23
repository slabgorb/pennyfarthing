"""
CLI commands for complexity analysis.

Usage:
    python -m pf.complexity analyze [OPTIONS]
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

import click

if TYPE_CHECKING:
    from pf.complexity.models import ComplexityResult


@click.group()
def complexity():
    """Code complexity analysis.

    \b
    Commands:
      analyze  - Analyze code complexity metrics
    """
    pass


def _common_options(fn):
    """Shared options for complexity commands."""
    fn = click.option("--path", "target_path", type=click.Path(exists=True),
                       help="Directory to analyze")(fn)
    fn = click.option("--format", "fmt", type=click.Choice(["table", "json", "csv"]),
                       default="table", show_default=True)(fn)
    fn = click.option("--top", default=20, show_default=True,
                       help="Number of top results")(fn)
    fn = click.option("--output", "output_file", type=click.Path(),
                       help="Write output to file")(fn)
    fn = click.option("--exclude", multiple=True,
                       help="Exclude patterns (repeatable)")(fn)
    return fn


def _run_analysis(target_path: str | None, exclude: tuple) -> ComplexityResult:
    """Run analysis and return result."""
    from pf.complexity.analyze import analyze_complexity

    excludes = list(exclude) if exclude else None
    p = Path(target_path).resolve() if target_path else Path(".").resolve()
    return asyncio.run(analyze_complexity(p, excludes))


def _output_result(result, fmt: str, output_file: str | None, top: int):
    """Format and output the analysis result."""
    from pf.complexity.formatters import (
        export_csv,
        export_json,
        format_file_table,
    )

    if fmt == "json":
        text = export_json(result)
    elif fmt == "csv":
        text = export_csv(result.files[:top])
    else:
        text = format_file_table(result.files, top)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)


@complexity.command()
@_common_options
def analyze(target_path, fmt, top, output_file, exclude):
    """Analyze code complexity."""
    result = _run_analysis(target_path, exclude)
    _output_result(result, fmt, output_file, top)
