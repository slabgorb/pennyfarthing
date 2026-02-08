"""
Core dependency analysis engine.

Wraps npm outdated --json and npm audit --json.
Parses output into models following ADR-0008 result pattern.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from pennyfarthing_scripts.dependencies.models import (
    OutdatedPackage,
    SecurityAdvisory,
    DependenciesResult,
)


def _find_npm(target_path: Path) -> Path | None:
    """Find npm binary. Stub — not implemented."""
    raise NotImplementedError("_find_npm not implemented")


def _check_package_json(target_path: Path) -> bool:
    """Check if package.json exists in target directory. Stub."""
    raise NotImplementedError("_check_package_json not implemented")


def _parse_outdated_output(output: str) -> list[OutdatedPackage]:
    """Parse npm outdated --json output into OutdatedPackage models. Stub."""
    raise NotImplementedError("_parse_outdated_output not implemented")


def _parse_audit_output(output: str) -> list[SecurityAdvisory]:
    """Parse npm audit --json output into SecurityAdvisory models. Stub."""
    raise NotImplementedError("_parse_audit_output not implemented")


async def _run_npm_outdated(npm_bin: Path, target_path: Path) -> tuple[str, str, int]:
    """Run npm outdated --json subprocess. Stub."""
    raise NotImplementedError("_run_npm_outdated not implemented")


async def _run_npm_audit(npm_bin: Path, target_path: Path) -> tuple[str, str, int]:
    """Run npm audit --json subprocess. Stub."""
    raise NotImplementedError("_run_npm_audit not implemented")


async def analyze_dependencies(target_path: Path) -> DependenciesResult:
    """Analyze dependencies of a Node.js project. Stub."""
    raise NotImplementedError("analyze_dependencies not implemented")
