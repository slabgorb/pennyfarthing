"""Version sentinel detection for auto-update in prime.

MSSCI-14698: Reads .pennyfarthing/.installed-version sentinel and compares
against current package version. On mismatch, signals that auto-update
is needed.

STUB: Implementation needed by Dev (story 98-1).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


SENTINEL_FILENAME = ".installed-version"


@dataclass
class VersionCheckResult:
    """Result of version mismatch check."""

    needs_update: bool
    installed_version: str | None
    package_version: str


def read_sentinel_version(project_root: Path) -> str | None:
    """Read version from .pennyfarthing/.installed-version sentinel.

    Args:
        project_root: Project root directory

    Returns:
        Version string, or None if sentinel doesn't exist or is empty
    """
    # STUB: Not yet implemented — tests should fail on assertions
    raise NotImplementedError("read_sentinel_version not implemented")


def get_package_version(project_root: Path) -> str:
    """Get the current package version from VERSION file or package.json.

    Args:
        project_root: Project root directory

    Returns:
        Version string
    """
    # STUB: Not yet implemented
    raise NotImplementedError("get_package_version not implemented")


def check_version_mismatch(
    project_root: Path,
    *,
    package_version: str | None = None,
) -> VersionCheckResult:
    """Compare sentinel version against package version.

    Args:
        project_root: Project root directory
        package_version: Override package version (for testing).
            If None, reads from VERSION file.

    Returns:
        VersionCheckResult with needs_update flag
    """
    # STUB: Not yet implemented — tests should fail on assertions
    raise NotImplementedError("check_version_mismatch not implemented")
