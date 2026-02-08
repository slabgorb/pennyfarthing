"""
CLI commands for dead code detection.

Usage:
    pf deadcode stale [OPTIONS]
"""

from __future__ import annotations

import click


@click.group()
def deadcode():
    """Dead code detection tools.

    \\b
    Commands:
      stale  - Find files with no recent commits
    """
    pass


@deadcode.command()
def stale():
    """Find files with no recent git commits. Stub — not yet implemented."""
    raise NotImplementedError("stale command not implemented")
