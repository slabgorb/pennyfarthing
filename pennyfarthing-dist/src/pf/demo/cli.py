"""Demo CLI — commands for demo artifact generation.

Story 146-1: pf demo generate CLI command + dry-run
"""

from __future__ import annotations

import click


@click.group()
def demo():
    """Demo artifact generation.

    \b
    Commands:
      generate  - Generate demo artifacts for a completed story
    """
    pass
