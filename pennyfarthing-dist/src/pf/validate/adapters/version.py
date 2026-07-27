"""Version consistency validator adapter.

Ensures VERSION, __init__.py __version__, and pyproject.toml version stay in sync.
VERSION file is the source of truth. The other two are derived:
  - __init__.py gets the semver string as-is
  - pyproject.toml gets the PEP 440 normalized form

Supports --fix to auto-sync __init__.py and pyproject.toml from VERSION.
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.validate import ValidateReport


def _semver_to_pep440(semver: str) -> str:
    """Convert semver prerelease string to PEP 440.

    Examples:
        1.0.0 -> 1.0.0
        1.0.0-alpha.1 -> 1.0.0a1
        1.0.0-beta.2 -> 1.0.0b2
        1.0.0-rc.3 -> 1.0.0rc3
    """
    m = re.match(r"^(\d+\.\d+\.\d+)(?:-(alpha|beta|rc)\.(\d+))?$", semver)
    if not m:
        return semver  # Can't convert, return as-is
    base, pre_type, pre_num = m.group(1), m.group(2), m.group(3)
    if pre_type is None:
        return base
    pep_map = {"alpha": "a", "beta": "b", "rc": "rc"}
    return f"{base}{pep_map[pre_type]}{pre_num}"


def _pep440_to_semver(pep: str) -> str:
    """Convert PEP 440 prerelease back to semver for comparison.

    Examples:
        1.0.0 -> 1.0.0
        1.0.0a1 -> 1.0.0-alpha.1
        1.0.0b2 -> 1.0.0-beta.2
        1.0.0rc3 -> 1.0.0-rc.3
    """
    m = re.match(r"^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$", pep)
    if not m:
        return pep
    base, pre_type, pre_num = m.group(1), m.group(2), m.group(3)
    sem_map = {"a": "alpha", "b": "beta", "rc": "rc"}
    return f"{base}-{sem_map[pre_type]}.{pre_num}"


def _read_version_file(path: Path) -> str | None:
    """Read VERSION file, return stripped content or None."""
    if not path.is_file():
        return None
    return path.read_text().strip()


def _read_init_version(path: Path) -> str | None:
    """Extract __version__ from __init__.py."""
    if not path.is_file():
        return None
    m = re.search(r'^__version__\s*=\s*["\']([^"\']+)["\']', path.read_text(), re.MULTILINE)
    return m.group(1) if m else None


def _read_pyproject_version(path: Path) -> str | None:
    """Extract version from pyproject.toml without importing toml."""
    if not path.is_file():
        return None
    m = re.search(r'^version\s*=\s*"([^"]+)"', path.read_text(), re.MULTILINE)
    return m.group(1) if m else None


def _fix_init_version(path: Path, version: str) -> bool:
    """Update __version__ in __init__.py."""
    text = path.read_text()
    new_text = re.sub(
        r'^(__version__\s*=\s*["\'])([^"\']+)(["\'])',
        rf"\g<1>{version}\3",
        text,
        flags=re.MULTILINE,
    )
    if new_text != text:
        path.write_text(new_text)
        return True
    return False


def _fix_pyproject_version(path: Path, version: str) -> bool:
    """Update version in pyproject.toml."""
    text = path.read_text()
    new_text = re.sub(
        r'^(version\s*=\s*")([^"]+)(")',
        rf"\g<1>{version}\3",
        text,
        flags=re.MULTILINE,
    )
    if new_text != text:
        path.write_text(new_text)
        return True
    return False


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Check version consistency across VERSION, __init__.py, and pyproject.toml."""
    report = ValidateReport(validator="version")

    # Locate files — walk up from project root to find pennyfarthing/
    fw_root = root / "pennyfarthing"
    if not fw_root.is_dir():
        # Maybe we ARE in the framework repo
        fw_root = root

    version_file = fw_root / "VERSION"
    init_file = fw_root / "pennyfarthing-dist" / "src" / "pf" / "__init__.py"
    pyproject_file = fw_root / "pyproject.toml"

    # Read all three
    ver_version = _read_version_file(version_file)
    init_version = _read_init_version(init_file)
    pyproject_version = _read_pyproject_version(pyproject_file)

    if ver_version is None:
        report.errors.append("VERSION file not found")
        report.details.append("[ERROR] VERSION file not found")
        return report

    report.details.append(f"  VERSION:        {ver_version}")
    report.details.append(f"  __init__.py:    {init_version or '(not found)'}")
    report.details.append(f"  pyproject.toml: {pyproject_version or '(not found)'}")

    expected_pep440 = _semver_to_pep440(ver_version)
    all_ok = True

    # Check __init__.py
    if init_version is None:
        report.errors.append("__init__.py: __version__ not found")
        report.details.append("[ERROR] __init__.py: __version__ not found")
        all_ok = False
    elif init_version != ver_version:
        init_msg = f"__init__.py: expected '{ver_version}', got '{init_version}'"
        report.errors.append(init_msg)
        report.details.append(f"[ERROR] {init_msg}")
        all_ok = False
        if fix:
            _fix_init_version(init_file, ver_version)
            report.details.append(f"  → fixed __init__.py to '{ver_version}'")
            report.fixed = True

    # Check pyproject.toml
    if pyproject_version is None:
        report.errors.append("pyproject.toml: version not found")
        report.details.append("[ERROR] pyproject.toml: version not found")
        all_ok = False
    elif pyproject_version != expected_pep440:
        # Also accept the semver form (in case someone wrote it that way)
        pyproject_as_semver = _pep440_to_semver(pyproject_version)
        if pyproject_as_semver == ver_version:
            report.passed += 1
        else:
            pyproject_msg = (
                f"pyproject.toml: expected '{expected_pep440}' "
                f"(PEP 440 for '{ver_version}'), got '{pyproject_version}'"
            )
            report.errors.append(pyproject_msg)
            report.details.append(f"[ERROR] {pyproject_msg}")
            all_ok = False
            if fix:
                _fix_pyproject_version(pyproject_file, expected_pep440)
                report.details.append(f"  → fixed pyproject.toml to '{expected_pep440}'")
                report.fixed = True

    if all_ok:
        report.passed += 1
        report.details.append("  All version sources consistent ✓")

    return report
