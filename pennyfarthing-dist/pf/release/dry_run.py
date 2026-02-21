"""Core logic for dry-run release simulation.

Simulates the full release pipeline without side effects:
- Version bump (reads package.json, computes new version)
- Changelog update (checks CHANGELOG.md)
- Build validation (TypeScript compilation check)
- Pack validation (npm pack --dry-run)

Does NOT commit, tag, or publish.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

_SEMVER_RE = re.compile(
    r"^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.\d+)?)?$"
)

_VALID_BUMPS = {"major", "minor", "patch"}


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
    # --- Input validation ---
    if bump and bump not in _VALID_BUMPS:
        return {"success": False, "error": f"Invalid bump type: {bump}"}

    if version and not _SEMVER_RE.match(version):
        return {"success": False, "error": f"Invalid version: {version}"}

    # --- Read current version from package.json ---
    pkg_path = project_root / "package.json"
    if not pkg_path.is_file():
        return {"success": False, "error": "package.json not found in project root"}

    try:
        pkg_data = json.loads(pkg_path.read_text())
    except (json.JSONDecodeError, ValueError):
        return {"success": False, "error": "Failed to parse package.json"}

    current_version = pkg_data.get("version", "0.0.0")

    # --- Compute target version ---
    if version:
        target_version = version
    elif bump:
        target_version = _bump_version(current_version, bump)
    else:
        target_version = current_version

    # --- Discover workspace packages ---
    packages = _discover_packages(project_root, pkg_data)

    # --- Build version files list ---
    version_files = ["package.json"]
    if (project_root / "VERSION").is_file():
        version_files.append("VERSION")

    # --- Simulate steps ---
    steps = []

    # Step 1: Version bump
    steps.append({
        "action": "version_bump",
        "detail": f"{current_version} -> {target_version} ({', '.join(version_files)})",
        "success": True,
    })

    # Step 2: Changelog update
    changelog_path = project_root / "CHANGELOG.md"
    if changelog_path.is_file():
        content = changelog_path.read_text()
        has_unreleased = "## [Unreleased]" in content
        steps.append({
            "action": "changelog_update",
            "detail": f"Would update CHANGELOG.md (unreleased section: {'yes' if has_unreleased else 'no'})",
            "success": True,
        })
    else:
        steps.append({
            "action": "changelog_update",
            "detail": "CHANGELOG.md not found",
            "success": False,
        })

    # Step 3: Build check (tsc --noEmit)
    build_result = subprocess.run(
        ["npx", "tsc", "--noEmit"],
        capture_output=True,
        text=True,
        cwd=str(project_root),
    )
    build_ok = build_result.returncode == 0
    steps.append({
        "action": "build",
        "detail": "TypeScript compilation check (tsc --noEmit)"
                  if build_ok
                  else f"Build failed: {build_result.stderr.strip()[:200]}",
        "success": build_ok,
    })

    # Step 4: Pack check (npm pack --dry-run)
    pack_result = subprocess.run(
        ["npm", "pack", "--dry-run"],
        capture_output=True,
        text=True,
        cwd=str(project_root),
    )
    pack_ok = pack_result.returncode == 0
    steps.append({
        "action": "pack",
        "detail": "npm pack --dry-run"
                  if pack_ok
                  else f"Pack failed: {pack_result.stderr.strip()[:200]}",
        "success": pack_ok,
    })

    return {
        "success": True,
        "dry_run": True,
        "data": {
            "current_version": current_version,
            "target_version": target_version,
            "packages": packages,
        },
        "steps": steps,
    }


def _bump_version(current: str, bump: str) -> str:
    """Compute a new version from a bump type."""
    base = current.split("-")[0]
    parts = base.split(".")
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])

    if bump == "major":
        return f"{major + 1}.0.0"
    elif bump == "minor":
        return f"{major}.{minor + 1}.0"
    else:  # patch
        return f"{major}.{minor}.{patch + 1}"


def _discover_packages(project_root: Path, root_pkg: dict) -> list[dict]:
    """Discover root and workspace packages."""
    packages = []

    # Root package
    packages.append({
        "name": root_pkg.get("name", "unknown"),
        "version": root_pkg.get("version", "0.0.0"),
    })

    # Workspace packages
    packages_dir = project_root / "packages"
    if packages_dir.is_dir():
        for pkg_dir in sorted(packages_dir.iterdir()):
            pkg_json = pkg_dir / "package.json"
            if pkg_json.is_file():
                try:
                    data = json.loads(pkg_json.read_text())
                    packages.append({
                        "name": data.get("name", pkg_dir.name),
                        "version": data.get("version", "0.0.0"),
                    })
                except (json.JSONDecodeError, ValueError):
                    pass

    return packages
