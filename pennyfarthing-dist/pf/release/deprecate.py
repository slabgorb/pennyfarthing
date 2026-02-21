"""Core logic for deprecating npm package versions.

Handles:
- npm deprecate command execution
- CHANGELOG.md deprecation entry insertion
- Git notes creation on version tags
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def deprecate_version(
    project_root: Path,
    version: str,
    reason: str,
    *,
    dry_run: bool = False,
    package_name: str = "pennyfarthing",
) -> dict:
    """Deprecate a published npm package version.

    Steps:
    1. Validate version exists (npm view + git tag)
    2. Run npm deprecate to mark version in registry
    3. Append deprecation entry to CHANGELOG.md
    4. Create git note on the version tag

    Returns:
        Result dict per ADR-0008: {success, data?, error?, steps?}
    """
    return {"success": False, "error": "not implemented"}
