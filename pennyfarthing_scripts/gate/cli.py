"""Gate CLI — gate file operations.

Usage:
    pf gate validate <file>    # Validate a gate file
"""

from __future__ import annotations

import click

from pennyfarthing_scripts.common.output import error, info, success


@click.group()
def gate():
    """Gate file operations.

    \b
    Commands:
      validate  - Validate a gate file for schema, depth, and cycles
    """
    pass


@gate.command("validate")
@click.argument("file", type=click.Path(exists=True))
def gate_validate(file: str):
    """Validate a gate file for schema, cycles, and depth.

    Checks:
      - Schema: <gate name="...">, <purpose>, <pass>, <fail>
      - Depth: nesting does not exceed 3 levels
      - Cycles: no duplicate gate names
      - Completeness: all required elements non-empty

    Reports ALL errors at once. On success, prints a structure summary.
    """
    from pennyfarthing_scripts.gate.validate import validate_gate_file

    result = validate_gate_file(file)

    if result.valid:
        name = result.gate_name or "(unnamed)"
        success(f"Gate '{name}' is valid")
        info(f"  Model: {result.model or 'haiku'}")
        if result.child_count > 0:
            info(f"  Depth: {result.depth} ({result.child_count} nested gate(s))")
        else:
            info(f"  Depth: {result.depth} (no nesting)")
        info(f"  Children: {result.child_count}")
    else:
        name = result.gate_name or file
        error(f"Gate '{name}' has {len(result.errors)} error(s):")
        for err in result.errors:
            error(f"  - {err}")
        raise SystemExit(1)
