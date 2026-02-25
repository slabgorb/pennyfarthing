"""Dashboard CLI command.

Story 132-11: Build pf status dashboard command.

Provides `pf dashboard` and `pf dashboard --json` commands.
"""

from __future__ import annotations

import click

from pf.common.config import get_project_root


@click.command()
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def dashboard(json_output: bool) -> None:
    """Show Pennyfarthing installation status and health checks."""
    import json

    from pf.dashboard.collector import collect_all, format_dashboard

    root = get_project_root()
    data = collect_all(root)

    if json_output:
        output = {}
        for key, val in data.items():
            output[key] = val.get("data", {})
        click.echo(json.dumps(output, indent=2))
    else:
        click.echo(format_dashboard(data))
