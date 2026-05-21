"""Test ratchet enforcement — detect test quality regressions.

The ratchet principle: test suite quality only tightens, never loosens.
Detects regressions like removed assertions, added skips without linked
issues, weakened assertions (specific → truthy), and removed test functions.

Language-agnostic for Python test files (``assert`` keyword matching).
"""

from __future__ import annotations

import re
from typing import TypedDict


class Regression(TypedDict):
    type: str
    detail: str
    severity: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TEST_FUNC_RE = re.compile(r"^def (test_\w+)\s*\(", re.MULTILINE)

# Matches bare ``assert <expr>`` where <expr> is a single identifier (truthy check).
# Does NOT match ``assert x == ...``, ``assert x is ...``, ``assert x in ...``, etc.
_BARE_ASSERT_RE = re.compile(r"^\s*assert\s+(\w+)\s*$", re.MULTILINE)

# Matches any assert statement (to count assertions).
_ASSERT_RE = re.compile(r"^\s*assert\s+", re.MULTILINE)

# Matches skip/ignore markers without a linked issue reference.
_SKIP_MARKERS = [
    # Rust #[ignore]
    re.compile(r"#\[ignore\]"),
    # Python @pytest.mark.skip (no reason with issue)
    re.compile(r"@pytest\.mark\.skip(?:If)?\b(?!\s*\(.*?(?:[A-Z]+-\d+|#\d+|issue|ticket|bug))"),
]

# Issue reference pattern — used to check if a skip has a linked issue.
_ISSUE_REF_RE = re.compile(r"[A-Z]+-\d+|#\d+|issue|ticket|bug", re.IGNORECASE)


def _extract_test_functions(content: str) -> dict[str, str]:
    """Return {func_name: func_body} for each test function in *content*."""
    functions: dict[str, str] = {}
    matches = list(_TEST_FUNC_RE.finditer(content))
    for i, match in enumerate(matches):
        name = match.group(1)
        start = match.start()
        # Function body extends to next function def or end of content.
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        functions[name] = content[start:end]
    return functions


def _count_assertions(text: str) -> int:
    """Count ``assert`` statements in *text*."""
    return len(_ASSERT_RE.findall(text))


def _find_bare_asserts(text: str) -> list[str]:
    """Return list of bare truthy assert lines in *text*."""
    return _BARE_ASSERT_RE.findall(text)


def _has_specific_assert(text: str, var_name: str) -> bool:
    """Check if *text* has a specific assertion (==, is, in, not, !=, >=, etc.) for *var_name*."""
    specific_re = re.compile(
        rf"^\s*assert\s+{re.escape(var_name)}\s+"
        r"(?:==|!=|is\b|in\b|not\b|>=|<=|>|<)",
        re.MULTILINE,
    )
    return bool(specific_re.search(text))


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------


def detect_test_regressions(
    old_test_content: str,
    new_test_content: str,
) -> list[dict]:
    """Detect test quality regressions between old and new test content.

    Returns a list of regression dicts, each with keys:
      - ``type``: one of ``removed_assertion``, ``added_skip``,
        ``weakened_assertion``, ``removed_test``
      - ``detail``: human-readable description
      - ``severity``: ``"warning"`` or ``"error"``
    """
    regressions: list[dict] = []

    old_funcs = _extract_test_functions(old_test_content)
    new_funcs = _extract_test_functions(new_test_content)

    # 1. Removed test functions
    for name in old_funcs:
        if name not in new_funcs:
            regressions.append(
                {
                    "type": "removed_test",
                    "detail": f"Test function '{name}' was removed",
                    "severity": "error",
                }
            )

    # 2. Per-function checks (assertions removed, weakened)
    for name in old_funcs:
        if name not in new_funcs:
            continue  # already reported as removed_test

        old_body = old_funcs[name]
        new_body = new_funcs[name]

        old_count = _count_assertions(old_body)
        new_count = _count_assertions(new_body)

        # 2a. Removed assertions (count decreased)
        if new_count < old_count:
            regressions.append(
                {
                    "type": "removed_assertion",
                    "detail": (
                        f"Assertion count in '{name}' decreased "
                        f"from {old_count} to {new_count}"
                    ),
                    "severity": "warning",
                }
            )

        # 2b. Weakened assertions — specific assert replaced with bare truthy
        new_bare = _find_bare_asserts(new_body)
        for var_name in new_bare:
            # Only flag if the OLD version had a specific assertion for this var
            if _has_specific_assert(old_body, var_name):
                regressions.append(
                    {
                        "type": "weakened_assertion",
                        "detail": (
                            f"'assert {var_name}' in '{name}' replaces a "
                            f"specific assertion (e.g. assert {var_name} == ...)"
                        ),
                        "severity": "warning",
                    }
                )

    # 3. Added skip/ignore markers without linked issue
    old_lines = set(old_test_content.splitlines())
    for line in new_test_content.splitlines():
        stripped = line.strip()
        if stripped in {l.strip() for l in old_lines}:
            continue  # line already existed

        for pattern in _SKIP_MARKERS:
            if pattern.search(stripped):
                # Check if the line (or nearby context) has an issue ref
                if not _ISSUE_REF_RE.search(stripped):
                    # Find which test function this skip is near
                    line_idx = new_test_content.splitlines().index(line)
                    func_name = _find_next_test_func(new_test_content, line_idx)
                    regressions.append(
                        {
                            "type": "added_skip",
                            "detail": (
                                f"Skip/ignore added near '{func_name}' "
                                f"without linked issue: {stripped}"
                            ),
                            "severity": "error",
                        }
                    )
                break

    return regressions


def _find_next_test_func(content: str, line_idx: int) -> str:
    """Find the test function name at or after *line_idx*."""
    lines = content.splitlines()
    for i in range(line_idx, min(line_idx + 5, len(lines))):
        match = _TEST_FUNC_RE.search(lines[i])
        if match:
            return match.group(1)
    return "unknown"


def is_ratchet_violation(regressions: list[dict]) -> bool:
    """Return True if any regressions were detected."""
    return len(regressions) > 0
