"""Version sentinel detection for auto-update in prime.

MSSCI-14698: Reads .pennyfarthing/.installed-version sentinel and compares
against current package version. On mismatch, signals that auto-update
is needed.
"""

from __future__ import annotations

import json
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
    sentinel_path = project_root / ".pennyfarthing" / SENTINEL_FILENAME

    if not sentinel_path.exists():
        return None

    content = sentinel_path.read_text().strip()
    return content or None


def get_package_version(project_root: Path) -> str:
    """Get the current package version from VERSION file or package.json.

    Checks VERSION file first (plain text), then falls back to package.json.

    Args:
        project_root: Project root directory

    Returns:
        Version string

    Raises:
        FileNotFoundError: If no version source found
    """
    # Try VERSION file first
    version_file = project_root / "VERSION"
    if version_file.exists():
        version = version_file.read_text().strip()
        if version:
            return version

    # Fall back to package.json
    package_json = project_root / "package.json"
    if package_json.exists():
        data = json.loads(package_json.read_text())
        version = data.get("version", "")
        if version:
            return version

    raise FileNotFoundError(f"No VERSION file or package.json found in {project_root}")


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
    if package_version is None:
        package_version = get_package_version(project_root)

    installed = read_sentinel_version(project_root)
    needs_update = installed != package_version

    return VersionCheckResult(
        needs_update=needs_update,
        installed_version=installed,
        package_version=package_version,
    )
