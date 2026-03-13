"""Gate validation CLI.

Usage:
    pf gate validate GATE_FILE

Story: 144-6 (Create Architect spec-check phase and gate)
"""

from __future__ import annotations

from pathlib import Path

import click

from pf.common.output import error, success


@click.group()
def gate():
    """Gate file validation and checks.

    \b
    Commands:
      validate  - Validate gate file schema
    """
    pass


@gate.command("validate")
@click.argument("gate_file", type=click.Path(exists=True))
def validate_cmd(gate_file: str) -> None:
    """Validate a gate file against the gate schema.

    Checks:
      - File exists and is readable
      - Contains required XML tags (<gate>, <purpose>, <pass>, <fail>)
      - Valid gate file structure

    \b
    Arguments:
      GATE_FILE  - Path to gate markdown file

    Exit code: 0 on success, 1 on validation failure.
    """
    gate_path = Path(gate_file)

    if not gate_path.exists():
        error(f"Gate file not found: {gate_path}")
        raise SystemExit(1)

    content = gate_path.read_text()

    # Basic validation: check for required tags (more flexible pattern)
    required_patterns = [
        (r"<gate\b", "<gate>"),
        (r"</gate>", "</gate>"),
        (r"<purpose>", "<purpose>"),
        (r"<pass>", "<pass>"),
        (r"<fail>", "<fail>"),
    ]

    import re

    missing_tags = []
    for pattern, tag_name in required_patterns:
        if not re.search(pattern, content):
            missing_tags.append(tag_name)

    if missing_tags:
        error(f"Gate file missing required tags: {', '.join(missing_tags)}")
        raise SystemExit(1)

    # Additional check: model specification
    if 'model="haiku"' not in content and "model='haiku'" not in content:
        error("Gate file must specify model='haiku' for fast execution")
        raise SystemExit(1)

    success(f"Gate file validated: {gate_path}")
