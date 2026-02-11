"""
CLI commands for health score analysis.

Usage:
    pf healthscore analyze [OPTIONS]
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

import click

if TYPE_CHECKING:
    from pennyfarthing_scripts.healthscore.models import HealthscoreResult


@click.group()
def healthscore():
    """Composite codebase health score.

    \b
    Commands:
      analyze  - Compute health score across all dimensions
    """
    pass


def _common_options(fn):
    """Shared options for healthscore commands."""
    fn = click.option("--path", "target_path", type=click.Path(exists=True),
                       help="Directory to analyze")(fn)
    fn = click.option("--format", "fmt", type=click.Choice(["table", "json", "csv"]),
                       default="table", show_default=True)(fn)
    fn = click.option("--output", "output_file", type=click.Path(),
                       help="Write output to file")(fn)
    fn = click.option("--no-cache", is_flag=True,
                       help="Bypass cache, force fresh analysis")(fn)
    return fn


def _run_analysis(target_path: str | None, no_cache: bool) -> HealthscoreResult:
    """Run analysis and return result."""
    from pennyfarthing_scripts.healthscore.analyze import analyze_healthscore

    p = Path(target_path).resolve() if target_path else Path(".").resolve()
    cache_ttl = 0 if no_cache else 300
    return asyncio.run(analyze_healthscore(p, cache_ttl=cache_ttl))


def _output_result(result, fmt: str, output_file: str | None):
    """Format and output the analysis result."""
    from pennyfarthing_scripts.healthscore.formatters import (
        export_csv,
        export_json,
        format_table,
    )

    if fmt == "json":
        text = export_json(result)
    elif fmt == "csv":
        text = export_csv(result)
    else:
        text = format_table(result)

    if output_file:
        Path(output_file).write_text(text)
        click.echo(f"Output written to {output_file}", err=True)
    else:
        click.echo(text)


@healthscore.command()
@_common_options
def analyze(target_path, fmt, output_file, no_cache):
    """Compute composite health score."""
    result = _run_analysis(target_path, no_cache)
    _output_result(result, fmt, output_file)
