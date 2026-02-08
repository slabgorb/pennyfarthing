"""
CLI commands for dependency analysis.

Usage:
    python -m pennyfarthing_scripts.dependencies analyze [OPTIONS]
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import click


@click.group()
def dependencies():
    """Dependency staleness and security analysis.

    \b
    Commands:
      analyze  - Analyze dependency health
    """
    pass


def _run_analysis(target_path: str | None) -> "DependenciesResult":
    """Run analysis and return result. Stub."""
    raise NotImplementedError("_run_analysis not implemented")


def _output_result(result, fmt: str, output_file: str | None):
    """Format and output the analysis result. Stub."""
    raise NotImplementedError("_output_result not implemented")


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
