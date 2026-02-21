"""Core logic for dry-run release simulation.

Simulates the full release pipeline without side effects:
- Version bump (reads package.json, computes new version)
- Changelog update (checks CHANGELOG.md)
- Build validation (TypeScript compilation check)
- Pack validation (npm pack --dry-run)

Does NOT commit, tag, or publish.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def dry_run_release(
    project_root: Path,
    *,
    version: str | None = None,
    bump: str | None = None,
) -> dict:
    """Simulate a release pipeline without executing.

    Args:
        project_root: Path to the project root.
        version: Explicit target version (overrides bump).
        bump: Bump type (major, minor, patch). Ignored if version is set.

    Returns:
        Result dict per ADR-0008: {success, dry_run, data?, error?, steps?}
    """
    return {"success": False, "error": "Not implemented"}
