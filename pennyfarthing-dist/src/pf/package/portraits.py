"""Portrait download via GitHub Contents API + gh CLI.

Downloads portrait images from the pennyfarthing monorepo using the
GitHub CLI, saving them into the installed theme package's portraits/
directory in node_modules.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from pf.package.discovery import (
    PORTRAIT_SIZES,
    THEME_PACKAGES,
    get_package_dir,
    is_package_installed,
)

GITHUB_REPO = "slabgorb/pennyfarthing"
GITHUB_BRANCH = "develop"


def _gh_available() -> bool:
    """Check if the gh CLI is available."""
    return shutil.which("gh") is not None


def _list_contents(path: str) -> dict[str, Any]:
    """List contents of a path in the GitHub repo via gh API.

    Args:
        path: Repo-relative path (e.g. "packages/themes-comedy/portraits")

    Returns:
        Result dict with success, data (list of entries), or error
    """
    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{GITHUB_REPO}/contents/{path}?ref={GITHUB_BRANCH}",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return {"success": False, "error": result.stderr.strip()}

    try:
        data = json.loads(result.stdout)
        if isinstance(data, dict) and data.get("message"):
            return {"success": False, "error": data["message"]}
        return {"success": True, "data": data if isinstance(data, list) else [data]}
    except json.JSONDecodeError:
        return {"success": False, "error": f"Invalid JSON response for {path}"}


def _collect_portrait_files(
    name: str,
    all_sizes: bool = False,
) -> dict[str, Any]:
    """Recursively collect portrait file paths from GitHub.

    Uses the Contents API to walk the portrait directory tree.
    Default: only collects files under the 'large/' size directory.
    With all_sizes: collects all 4 resolution directories.

    Args:
        name: Theme package name (e.g. "comedy")
        all_sizes: If True, download all portrait sizes

    Returns:
        Result dict with success, data (list of file entries), or error
    """
    base_path = f"packages/themes-{name}/portraits"
    allowed_sizes = set(PORTRAIT_SIZES) if all_sizes else {"large"}

    # List top-level portrait directory — expect theme subdirectories
    top_result = _list_contents(base_path)
    if not top_result["success"]:
        return top_result

    files_to_download: list[dict[str, str]] = []

    # Each entry at top level is a theme subdirectory (e.g. "classical-composers")
    for theme_entry in top_result["data"]:
        if theme_entry.get("type") != "dir":
            continue

        theme_name = theme_entry["name"]
        theme_path = f"{base_path}/{theme_name}"

        # List size directories under each theme
        sizes_result = _list_contents(theme_path)
        if not sizes_result["success"]:
            continue

        for size_entry in sizes_result["data"]:
            if size_entry.get("type") != "dir":
                continue
            if size_entry["name"] not in allowed_sizes:
                continue

            size_path = f"{theme_path}/{size_entry['name']}"

            # List image files in this size directory
            images_result = _list_contents(size_path)
            if not images_result["success"]:
                continue

            for img_entry in images_result["data"]:
                if img_entry.get("type") != "file":
                    continue
                files_to_download.append(
                    {
                        "path": img_entry["path"],
                        "download_url": img_entry.get("download_url", ""),
                        "name": img_entry["name"],
                        "relative": f"{theme_name}/{size_entry['name']}/{img_entry['name']}",
                    }
                )

    return {"success": True, "data": files_to_download}


def _download_file(download_url: str, dest: Path) -> dict[str, Any]:
    """Download a single file using curl.

    Args:
        download_url: Direct download URL (from GitHub Contents API download_url field)
        dest: Local destination path

    Returns:
        Result dict with success or error
    """
    dest.parent.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["curl", "-fsSL", "-o", str(dest), download_url],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        dest.unlink(missing_ok=True)
        return {"success": False, "error": result.stderr.strip()}

    return {"success": True}


def download_portraits(
    name: str,
    project_root: Path | None = None,
    all_sizes: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Download portraits for a theme package.

    1. Validates gh CLI is available
    2. Validates the package is installed
    3. Lists portrait files from GitHub Contents API
    4. Downloads each file, skipping already-existing ones

    Args:
        name: Theme package name (e.g. "comedy")
        project_root: Project root (auto-detected if not provided)
        all_sizes: If True, download all portrait sizes (default: large only)
        dry_run: If True, show what would happen without downloading

    Returns:
        Result dict with success, data (download stats), or error
    """
    if name not in THEME_PACKAGES:
        return {"success": False, "error": f"Unknown theme package: {name}"}

    if not _gh_available():
        return {
            "success": False,
            "error": "gh CLI not found. Install with: brew install gh",
        }

    if not dry_run and not is_package_installed(name, project_root):
        return {
            "success": False,
            "error": f"Package @pennyfarthing/themes-{name} is not installed. Run: pf package install {name}",
        }

    if dry_run:
        pkg_dir = get_package_dir(name, project_root)
        portraits_dir = pkg_dir / "portraits"
        return {
            "success": True,
            "data": {
                "action": "dry-run",
                "total_files": "(would query GitHub API)",
                "destination": str(portraits_dir),
                "sizes": "all" if all_sizes else "large only",
            },
        }

    # Collect file list from GitHub
    collect_result = _collect_portrait_files(name, all_sizes=all_sizes)
    if not collect_result["success"]:
        return collect_result

    files = collect_result["data"]
    if not files:
        return {
            "success": True,
            "data": {"downloaded": 0, "skipped": 0, "message": "No portrait files found"},
        }

    pkg_dir = get_package_dir(name, project_root)
    portraits_dir = pkg_dir / "portraits"

    downloaded = 0
    skipped = 0
    errors = []

    for file_entry in files:
        dest = portraits_dir / file_entry["relative"]

        # Skip files that already exist (idempotent)
        if dest.is_file():
            skipped += 1
            continue

        dl_result = _download_file(file_entry["download_url"], dest)
        if dl_result["success"]:
            downloaded += 1
        else:
            errors.append(f"{file_entry['relative']}: {dl_result['error']}")

    result_data: dict[str, Any] = {
        "downloaded": downloaded,
        "skipped": skipped,
        "total": len(files),
        "destination": str(portraits_dir),
    }
    if errors:
        result_data["errors"] = errors[:5]
        result_data["error_count"] = len(errors)

    return {"success": True, "data": result_data}
