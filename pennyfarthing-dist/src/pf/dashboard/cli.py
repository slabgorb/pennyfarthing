"""Dashboard CLI command.

Story 132-11: Build pf status dashboard command.

Provides `pf dashboard` and `pf dashboard --json` commands.
"""

from __future__ import annotations

import click


@click.command()
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def dashboard(json_output: bool) -> None:
    """Show Pennyfarthing installation status and health checks."""
    # Stub — implementation pending
    pass
