"""
CLI commands for complexity analysis.

Usage:
    python -m pennyfarthing_scripts.complexity analyze [OPTIONS]

Stub implementation — to be completed by Dev.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import click


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


def _run_analysis(target_path: str | None, exclude: tuple) -> "ComplexityResult":
    """Run analysis and return result."""
    raise NotImplementedError("_run_analysis not implemented")


def _output_result(result, fmt: str, output_file: str | None, top: int):
    """Format and output the analysis result."""
    raise NotImplementedError("_output_result not implemented")


@complexity.command()
@_common_options
def analyze(target_path, fmt, top, output_file, exclude):
    """Analyze code complexity."""
    result = _run_analysis(target_path, exclude)
    _output_result(result, fmt, output_file, top)
