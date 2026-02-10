"""
Core dependency analysis engine.

Wraps npm outdated --json and npm audit --json.
Parses output into models following ADR-0008 result pattern.
"""

from __future__ import annotations

import asyncio
import json
import shutil
from collections import Counter
from pathlib import Path

from pennyfarthing_scripts.dependencies.models import (
    DependenciesResult,
    OutdatedPackage,
    SecurityAdvisory,
)


def _find_npm(target_path: Path) -> Path | None:
    """Find npm binary via shutil.which."""
    npm = shutil.which("npm")
    return Path(npm) if npm else None


def _check_package_json(target_path: Path) -> bool:
    """Check if package.json exists in target directory."""
    return (target_path / "package.json").exists()


def _parse_outdated_output(output: str) -> list[OutdatedPackage]:
    """Parse npm outdated --json output into OutdatedPackage models.

    npm outdated --json returns: {pkg_name: {current, wanted, latest, type, ...}}
    """
    if not output:
        return []
    try:
        data = json.loads(output)
    except (json.JSONDecodeError, TypeError):
        return []

    if not data or not isinstance(data, dict):
        return []

    packages = []
    for name, info in data.items():
        packages.append(OutdatedPackage(
            name=name,
            current=info.get("current", ""),
            wanted=info.get("wanted", ""),
            latest=info.get("latest", ""),
            type=info.get("type", ""),
        ))
    return packages


def _parse_audit_output(output: str) -> list[SecurityAdvisory]:
    """Parse npm audit --json output into SecurityAdvisory models.

    npm audit --json returns: {vulnerabilities: {name: {severity, ...}}, metadata: ...}
    Aggregates by severity level.
    """
    if not output:
        return []
    try:
        data = json.loads(output)
    except (json.JSONDecodeError, TypeError):
        return []

    vulns = data.get("vulnerabilities", {})
    if not vulns:
        return []

    severity_counts: Counter[str] = Counter()
    for info in vulns.values():
        sev = info.get("severity", "unknown")
        severity_counts[sev] += 1

    return [
        SecurityAdvisory(severity=sev, count=count)
        for sev, count in severity_counts.items()
    ]


async def _run_npm_outdated(npm_bin: Path, target_path: Path) -> tuple[str, str, int]:
    """Run npm outdated --json subprocess."""
    proc = await asyncio.create_subprocess_exec(
        str(npm_bin),
        "outdated",
        "--json",
        cwd=str(target_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
        proc.returncode or 0,
    )


async def _run_npm_audit(npm_bin: Path, target_path: Path) -> tuple[str, str, int]:
    """Run npm audit --json subprocess."""
    proc = await asyncio.create_subprocess_exec(
        str(npm_bin),
        "audit",
        "--json",
        cwd=str(target_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
        proc.returncode or 0,
    )


async def analyze_dependencies(target_path: Path) -> DependenciesResult:
    """Analyze dependencies of a Node.js project."""
    resolved = target_path.resolve()

    npm_bin = _find_npm(resolved)
    if npm_bin is None:
        return DependenciesResult(
            success=False,
            target_path=str(resolved),
            error="npm not found. Install Node.js to use dependency analysis.",
        )

    if not _check_package_json(resolved):
        return DependenciesResult(
            success=False,
            target_path=str(resolved),
            error="No package.json found in target directory.",
        )

    outdated_stdout, _, _ = await _run_npm_outdated(npm_bin, resolved)
    audit_stdout, _, _ = await _run_npm_audit(npm_bin, resolved)

    outdated = _parse_outdated_output(outdated_stdout)
    advisories = _parse_audit_output(audit_stdout)

    return DependenciesResult(
        success=True,
        target_path=str(resolved),
        outdated=outdated,
        advisories=advisories,
    )
