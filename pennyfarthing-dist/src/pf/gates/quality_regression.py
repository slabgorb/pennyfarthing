"""Quality regression gate.

Detects changes that weaken the test suite:
- Snapshot test file deletion
- Snapshot assertion replacement with weaker checks
- Test file deletion
- #[ignore] or .skip() additions without justification

Returns {success, data, error} per SOUL.md #10.

Story: 150-6
"""

from __future__ import annotations

import re

# Patterns for detecting test file paths
_TEST_FILE_RE = re.compile(
    r"(test[_\-]|_test\.|\.test\.|\.spec\.|tests/|spec/|__tests__/)"
)
_SNAPSHOT_FILE_RE = re.compile(r"\.(snap|snapshot)$|snapshots/")

# Patterns for detecting regression indicators in added lines
_IGNORE_RE = re.compile(r"^\+\s*#\[ignore\]", re.MULTILINE)
_SKIP_RE = re.compile(r"^\+.*\b(it|describe|test)\.skip\b", re.MULTILINE)

# Patterns for snapshot assertion removal
# Note: No trailing \b after ! because ! is not a word character
_SNAPSHOT_ASSERT_REMOVED_RE = re.compile(
    r"^-\s*.*\b(assert_json_snapshot!|assert_snapshot!|assert_debug_snapshot!|"
    r"insta::assert_|toMatchSnapshot|toMatchInlineSnapshot)",
    re.MULTILINE
)

# Deleted file detection
_DELETED_FILE_RE = re.compile(r"^deleted file mode", re.MULTILINE)
_DIFF_HEADER_RE = re.compile(r"^diff --git a/(.+?) b/", re.MULTILINE)


def check_quality_regression(diff_content: str) -> dict:
    """Check a git diff for quality regressions in the test suite.

    Args:
        diff_content: Raw git diff output.

    Returns:
        dict with keys:
            success: bool
            data: dict with checks array
            error: str | None
    """
    if not diff_content.strip():
        return {
            "success": True,
            "data": {"checks": [
                {"name": "quality-regression", "status": "pass",
                 "detail": "Empty diff — no regressions possible"},
            ]},
            "error": None,
        }

    checks: list[dict] = []
    failures: list[str] = []

    # Parse diff into per-file hunks
    file_diffs = _split_diff_by_file(diff_content)

    for file_path, file_diff in file_diffs:
        # Check for deleted test/snapshot files
        if _DELETED_FILE_RE.search(file_diff):
            if _SNAPSHOT_FILE_RE.search(file_path):
                msg = f"Snapshot file deleted: {file_path}"
                checks.append({"name": "snapshot-deletion", "status": "fail",
                                "detail": msg})
                failures.append(msg)
            elif _TEST_FILE_RE.search(file_path):
                msg = f"Test file deleted: {file_path}"
                checks.append({"name": "test-file-deletion", "status": "fail",
                                "detail": msg})
                failures.append(msg)
            continue

        # Check added lines for regression indicators
        for line in file_diff.split("\n"):
            if _IGNORE_RE.match(line):
                msg = f"#[ignore] added in {file_path}"
                checks.append({"name": "ignore-added", "status": "fail",
                                "detail": msg})
                failures.append(msg)

            if _SKIP_RE.match(line):
                msg = f".skip() added in {file_path}"
                checks.append({"name": "skip-added", "status": "fail",
                                "detail": msg})
                failures.append(msg)

        # Check for snapshot assertion removal (stronger replaced with weaker)
        if _SNAPSHOT_ASSERT_REMOVED_RE.search(file_diff):
            msg = f"Snapshot assertion removed in {file_path}"
            checks.append({"name": "snapshot-weakened", "status": "fail",
                            "detail": msg})
            failures.append(msg)

    if not checks:
        checks.append({"name": "quality-regression", "status": "pass",
                        "detail": "No quality regressions detected"})

    if failures:
        return {
            "success": False,
            "data": {"checks": checks},
            "error": "; ".join(failures),
        }

    return {"success": True, "data": {"checks": checks}, "error": None}


def _split_diff_by_file(diff_content: str) -> list[tuple[str, str]]:
    """Split a unified diff into per-file sections.

    Returns list of (file_path, file_diff_content) tuples.
    """
    parts = re.split(r"(?=^diff --git )", diff_content, flags=re.MULTILINE)
    result: list[tuple[str, str]] = []

    for part in parts:
        part = part.strip()
        if not part:
            continue
        match = _DIFF_HEADER_RE.match(part)
        if match:
            file_path = match.group(1)
            result.append((file_path, part))

    return result
