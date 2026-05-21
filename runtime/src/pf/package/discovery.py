"""Package discovery and npm install wrapper for theme packages.

Checks installation status of @pennyfarthing/themes-* packages and
provides npm install functionality.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from pf.common.config import get_project_root

THEME_PACKAGES = [
    "comedy",
    "literary",
    "mythology-fantasy",
    "prestige-tv",
    "realistic",
    "scifi",
    "superheroes",
]

PORTRAIT_SIZES = ["small", "medium", "large", "xlarge"]


def _node_modules_dir(project_root: Path | None = None) -> Path:
    """Return the node_modules/@pennyfarthing directory."""
    root = project_root or get_project_root()
    return root / "node_modules" / "@pennyfarthing"


def get_package_dir(name: str, project_root: Path | None = None) -> Path:
    """Return the path to a theme package in node_modules."""
    return _node_modules_dir(project_root) / f"themes-{name}"


def is_package_installed(name: str, project_root: Path | None = None) -> bool:
    """Check if a theme package is installed in node_modules."""
    pkg_dir = get_package_dir(name, project_root)
    pkg_json = pkg_dir / "package.json"
    if not pkg_json.is_file():
        return False
    try:
        data = json.loads(pkg_json.read_text())
        return data.get("pennyfarthing-theme-pack") is True
    except Exception:
        return False


def has_portraits(name: str, project_root: Path | None = None) -> bool:
    """Check if a theme package has portraits downloaded."""
    pkg_dir = get_package_dir(name, project_root)
    portraits_dir = pkg_dir / "portraits"
    if not portraits_dir.is_dir():
        return False
    # Check for at least one image file in any subdirectory
    for child in portraits_dir.rglob("*"):
        if child.is_file() and child.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            return True
    return False


def get_package_status(
    project_root: Path | None = None,
) -> list[dict[str, Any]]:
    """Get installation status for all theme packages.

    Returns:
        List of dicts with keys: name, installed, portraits
    """
    results = []
    for name in THEME_PACKAGES:
        installed = is_package_installed(name, project_root)
        portraits = has_portraits(name, project_root) if installed else False
        results.append(
            {
                "name": name,
                "installed": installed,
                "portraits": portraits,
            }
        )
    return results


def npm_install(
    name: str,
    project_root: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Install a theme package via npm.

    Args:
        name: Theme package name (e.g. "comedy")
        project_root: Project root (auto-detected if not provided)
        dry_run: If True, show what would happen without executing

    Returns:
        Result dict with success, data?, error?
    """
    if name not in THEME_PACKAGES:
        return {"success": False, "error": f"Unknown theme package: {name}"}

    if shutil.which("npm") is None:
        return {"success": False, "error": "npm not found. Install Node.js first."}

    root = project_root or get_project_root()
    pkg_spec = f"@pennyfarthing/themes-{name}"

    if dry_run:
        return {
            "success": True,
            "data": {"action": "dry-run", "command": f"npm install {pkg_spec}", "cwd": str(root)},
        }

    result = subprocess.run(
        ["npm", "install", pkg_spec],
        capture_output=True,
        text=True,
        cwd=str(root),
    )

    if result.returncode != 0:
        return {
            "success": False,
            "error": f"npm install failed: {result.stderr.strip()}",
        }

    return {"success": True, "data": {"package": pkg_spec, "output": result.stdout.strip()}}
