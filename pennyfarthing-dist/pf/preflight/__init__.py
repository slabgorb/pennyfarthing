"""Preflight checks for Pennyfarthing workflows.

This package provides async preflight checks that run in parallel
to validate story completion before finishing.
"""

from pf.preflight.finish import (
    PreflightIssue,
    PreflightResult,
    run_finish_preflight,
)

__all__ = [
    "PreflightResult",
    "PreflightIssue",
    "run_finish_preflight",
]
