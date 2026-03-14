"""Demo CLI — commands for demo artifact generation.

Story 146-1: pf demo generate CLI command + dry-run
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from pf.demo.orchestrator import generate


@click.group()
def demo():
    """Demo artifact generation.

    \b
    Commands:
      generate  - Generate demo artifacts for a completed story
    """
    pass


@demo.command("generate")
@click.argument("story_id")
@click.option("--dry-run", is_flag=True, default=False, help="Show what would be generated without writing files.")
@click.option("--corrections", default=None, help="Developer feedback for regeneration.")
def generate_cmd(story_id: str, dry_run: bool, corrections: str | None) -> None:
    """Generate demo artifacts for a completed story.

    STORY_ID is the story identifier (e.g., 42-1).
    """
    result = generate(story_id=story_id, dry_run=dry_run, corrections=corrections, project_root=Path.cwd())

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        sys.exit(1)

    data = result["data"]
    output_dir = data["output_dir"]
    files = data.get("files", [])
    warnings = data.get("warnings", [])

    if dry_run:
        click.echo(f"Dry run — would generate to: {output_dir}")
    else:
        click.echo(f"Generated demo artifacts in: {output_dir}")
        if files:
            click.echo(f"Files generated ({len(files)}):")
            for f in files:
                click.echo(f"  {f}")

    for w in warnings:
        click.echo(f"Warning: {w}")
