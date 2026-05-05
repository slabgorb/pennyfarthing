"""Story 152-1: Hygiene tests — no company-specific identifiers leak into the open-source framework.

These tests scan every redistributable file in the framework repo and assert the absence
of well-known leak markers:

- The corporate Jira project key (constructed dynamically below to avoid self-match).
- A four-digit numeric brand reference (constructed dynamically below; the framework
  uses port 2898, so the older number must not appear anywhere as a port literal,
  example URL, or narrative).

The forbidden strings are constructed from concatenated halves so this file itself
does not match the scan. Adding a test marker for additional company identifiers
(e.g., the firm name) is left as a delivery finding for the user to populate.

Author: Igor (TEA), Story 152-1.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

# Framework repo root: tests/ -> pf/ -> src/ -> pennyfarthing-dist/ -> pennyfarthing/
REPO_ROOT = Path(__file__).resolve().parents[4]

# Constructed to avoid self-match when this test file is scanned.
FORBIDDEN_JIRA_KEY = "MS" + "SCI"
FORBIDDEN_PORT_NUMBER = "18" + "98"
FORBIDDEN_COMPANY_BRAND = "1898" + "&co"

# Directories that are not redistributables or are derivative caches.
SKIP_DIRS = {
    ".git",
    ".session",  # Gitignored runtime artifact; not redistributed.
    "__pycache__",
    ".venv",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "node_modules",
    "dist",
    "build",
    ".tox",
    "htmlcov",
}

# Binary / opaque file types where substring matches are noise (e.g., SHA hashes
# embedded in git-LFS pointer files for portrait images).
SKIP_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".webp",
    ".pdf",
    ".pyc",
    ".tsbuildinfo",
    ".lock",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".zip",
    ".tar",
    ".gz",
    ".whl",
    ".bin",
    ".onnx",
    ".safetensors",
}

# This test file is the obvious self-reference exception.
SKIP_FILES = {Path(__file__).resolve()}


def _iter_text_files(root: Path):
    """Yield every UTF-8-readable file under root, skipping caches and binaries."""
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.resolve() in SKIP_FILES:
            continue
        # Skip if any parent directory is in SKIP_DIRS
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in SKIP_SUFFIXES:
            continue
        try:
            yield path, path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            # Binary file we did not pre-filter — skip it.
            continue


def _find_offenders(
    needle: str, *, word_bounded: bool, ignore_case: bool = False
) -> list[tuple[Path, int, str]]:
    """Return (path, line_number, line_text) for every line containing the needle.

    word_bounded=True wraps the needle in \\b so embedded matches in hex digests
    or longer numeric values do not produce false positives.
    """
    flags = re.IGNORECASE if ignore_case else 0
    if word_bounded:
        pattern = re.compile(rf"\b{re.escape(needle)}\b", flags)
    else:
        pattern = re.compile(re.escape(needle), flags)

    offenders: list[tuple[Path, int, str]] = []
    for path, content in _iter_text_files(REPO_ROOT):
        for lineno, line in enumerate(content.splitlines(), start=1):
            if pattern.search(line):
                offenders.append((path.relative_to(REPO_ROOT), lineno, line.strip()))
    return offenders


def _format_offenders(offenders: list[tuple[Path, int, str]], needle: str) -> str:
    if not offenders:
        return ""
    lines = [f"Found {len(offenders)} occurrence(s) of forbidden token '{needle}':"]
    for path, lineno, text in offenders[:50]:
        lines.append(f"  {path}:{lineno}: {text[:160]}")
    if len(offenders) > 50:
        lines.append(f"  ... and {len(offenders) - 50} more")
    return "\n".join(lines)


def test_no_corporate_jira_key_in_framework_redistributables():
    """No file shipped with the framework may contain the corporate Jira project key.

    Substring (not word-bounded) match — the project key is uppercase ASCII and
    unique enough that any occurrence is intentional and must be removed.
    """
    offenders = _find_offenders(FORBIDDEN_JIRA_KEY, word_bounded=False)
    assert not offenders, _format_offenders(offenders, FORBIDDEN_JIRA_KEY)


def test_no_company_brand_number_in_framework_redistributables():
    """No file shipped with the framework may contain the company brand number as a token.

    Word-bounded match — the framework's actual Frame port is 2898, so the older
    company-year number 1898 must not appear as a port literal, example URL, or
    narrative reference. SHA-256 hex digests in portrait LFS pointers are not
    word-bounded matches and are correctly ignored.
    """
    offenders = _find_offenders(FORBIDDEN_PORT_NUMBER, word_bounded=True)
    assert not offenders, _format_offenders(offenders, FORBIDDEN_PORT_NUMBER)


def test_no_company_brand_string_in_framework_redistributables():
    """No file shipped with the framework may contain the literal company brand.

    The brand string '1898&co' is unique enough that any occurrence is a
    deliberate company reference and must be removed. Match is case-insensitive
    to catch '1898&Co', '1898&CO', etc.
    """
    offenders = _find_offenders(
        FORBIDDEN_COMPANY_BRAND, word_bounded=False, ignore_case=True
    )
    assert not offenders, _format_offenders(offenders, FORBIDDEN_COMPANY_BRAND)


def test_skip_dirs_actually_exist_in_walk():
    """Sanity check: the walk visits at least one file under pennyfarthing-dist/.

    Guards against an environmental fluke where REPO_ROOT resolves wrong and the
    other tests pass vacuously by walking an empty tree.
    """
    visited = list(_iter_text_files(REPO_ROOT))
    assert len(visited) > 100, (
        f"Walk only found {len(visited)} files under {REPO_ROOT} — "
        f"hygiene tests would be vacuously passing."
    )
    # And confirm we are walking the framework repo, not the orchestrator
    assert (REPO_ROOT / "pennyfarthing-dist").is_dir(), (
        f"REPO_ROOT={REPO_ROOT} does not contain pennyfarthing-dist/ — "
        f"hygiene scan rooted incorrectly."
    )
