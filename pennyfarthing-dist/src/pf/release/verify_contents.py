"""Package contents verification against a known-good manifest.

Runs npm pack --dry-run --json and validates the tarball would contain
all required files, directories, and nothing unexpected.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


def verify_contents(
    project_root: Path,
    *,
    manifest_path: Path | None = None,
) -> dict:
    """Verify package contents against manifest.

    Args:
        project_root: Path to the project root.
        manifest_path: Path to manifest JSON. Defaults to tests/fixtures/package-manifest.json.

    Returns:
        Result dict per ADR-0008: {success, data?, error?, steps?}
    """
    # Resolve manifest
    if manifest_path is None:
        manifest_path = project_root / "tests" / "fixtures" / "package-manifest.json"

    if not manifest_path.is_file():
        return {"success": False, "error": f"Manifest not found: {manifest_path}"}

    try:
        manifest = json.loads(manifest_path.read_text())
    except (json.JSONDecodeError, ValueError):
        return {"success": False, "error": f"Failed to parse manifest: {manifest_path}"}

    # Run npm pack --dry-run --json
    pack_result = subprocess.run(
        ["npm", "pack", "--dry-run", "--json"],
        capture_output=True,
        text=True,
        cwd=str(project_root),
    )

    if pack_result.returncode != 0:
        return {"success": False, "error": f"npm pack failed: {pack_result.stderr.strip()[:200]}"}

    if not pack_result.stdout.strip():
        return {"success": False, "error": "npm pack produced no output"}

    try:
        pack_data = json.loads(pack_result.stdout)
    except (json.JSONDecodeError, ValueError):
        return {"success": False, "error": "Failed to parse npm pack output"}

    # Extract file paths
    file_paths = {f["path"] for f in pack_data[0]["files"]}

    # Run verification steps
    steps = []

    steps.append(_check_root_files(file_paths, manifest))
    steps.append(_check_top_level_dirs(file_paths, manifest))
    steps.append(_check_unexpected_entries(file_paths, manifest))
    steps.append(_check_critical_files(file_paths, manifest))
    steps.append(_check_dist_subdirs(file_paths, manifest))
    steps.append(_check_required_scripts(file_paths, manifest))

    failed = [s for s in steps if not s["success"]]
    passed = [s for s in steps if s["success"]]

    if failed:
        return {
            "success": False,
            "error": f"{len(failed)} verification check(s) failed",
            "data": {
                "total_files": len(file_paths),
                "passed": len(passed),
                "failed": len(failed),
            },
            "steps": steps,
        }

    return {
        "success": True,
        "data": {
            "total_files": len(file_paths),
            "passed": len(passed),
            "failed": 0,
        },
        "steps": steps,
    }


def _check_root_files(file_paths: set[str], manifest: dict) -> dict:
    """Check that all required root files are present."""
    required = manifest.get("required_root_files", [])
    missing = [f for f in required if f not in file_paths]
    if missing:
        return {
            "action": "root_files",
            "detail": f"Missing: {', '.join(missing)}",
            "success": False,
        }
    return {
        "action": "root_files",
        "detail": f"All {len(required)} root files present",
        "success": True,
    }


def _check_top_level_dirs(file_paths: set[str], manifest: dict) -> dict:
    """Check that all required top-level directories are present."""
    required = manifest.get("required_top_level_dirs", [])
    # A dir is present if any file starts with "dir/"
    missing = [d for d in required if not any(f.startswith(d + "/") for f in file_paths)]
    if missing:
        return {
            "action": "top_level_dirs",
            "detail": f"Missing: {', '.join(missing)}",
            "success": False,
        }
    return {
        "action": "top_level_dirs",
        "detail": f"All {len(required)} top-level dirs present",
        "success": True,
    }


def _check_unexpected_entries(file_paths: set[str], manifest: dict) -> dict:
    """Check for unexpected top-level entries."""
    allowed = set(manifest.get("allowed_top_level_entries", []))
    # Extract unique top-level entries
    top_level = set()
    for f in file_paths:
        parts = f.split("/")
        top_level.add(parts[0])

    unexpected = top_level - allowed
    if unexpected:
        return {
            "action": "unexpected_entries",
            "detail": f"Unexpected: {', '.join(sorted(unexpected))}",
            "success": False,
        }
    return {
        "action": "unexpected_entries",
        "detail": "No unexpected top-level entries",
        "success": True,
    }


def _check_critical_files(file_paths: set[str], manifest: dict) -> dict:
    """Check that all critical files are present."""
    required = manifest.get("critical_files", [])
    missing = [f for f in required if f not in file_paths]
    if missing:
        return {
            "action": "critical_files",
            "detail": f"Missing: {', '.join(missing)}",
            "success": False,
        }
    return {
        "action": "critical_files",
        "detail": f"All {len(required)} critical files present",
        "success": True,
    }


def _check_dist_subdirs(file_paths: set[str], manifest: dict) -> dict:
    """Check that required pennyfarthing-dist subdirectories are present and non-empty."""
    required = manifest.get("required_pennyfarthing_dist_subdirs", [])
    missing = [
        d for d in required
        if not any(f.startswith(f"pennyfarthing-dist/{d}/") for f in file_paths)
    ]
    if missing:
        return {
            "action": "dist_subdirs",
            "detail": f"Missing: {', '.join(missing)}",
            "success": False,
        }
    return {
        "action": "dist_subdirs",
        "detail": f"All {len(required)} pennyfarthing-dist subdirs present",
        "success": True,
    }


def _check_required_scripts(file_paths: set[str], manifest: dict) -> dict:
    """Check that required scripts are present."""
    required = manifest.get("required_pennyfarthing_dist_scripts", [])
    missing = [f for f in required if f not in file_paths]
    if missing:
        return {
            "action": "required_scripts",
            "detail": f"Missing: {', '.join(missing)}",
            "success": False,
        }
    return {
        "action": "required_scripts",
        "detail": f"All {len(required)} required scripts present",
        "success": True,
    }
