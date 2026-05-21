"""Spec traceability audit for TEA workflow.

Parses acceptance criteria from session files, maps test functions to
criteria via keyword matching, and produces coverage reports.

Story: 150-14
"""

from __future__ import annotations

import re


def parse_acceptance_criteria(session_content: str) -> list[str]:
    """Extract acceptance criteria from session file checkbox format.

    Matches both unchecked ``- [ ] text`` and checked ``- [x] text`` lines.

    Args:
        session_content: Raw markdown content of a session file.

    Returns:
        List of AC text strings (without the checkbox prefix).
    """
    pattern = re.compile(r"^- \[[ x]\] (.+)$", re.MULTILINE)
    return [m.group(1).strip() for m in pattern.finditer(session_content)]


def _extract_test_functions(test_content: str) -> list[dict[str, str]]:
    """Extract test function names and their docstrings from test source.

    Args:
        test_content: Raw Python source of a test file.

    Returns:
        List of dicts with 'name' and 'docstring' keys.
    """
    # Match def test_...(...):\n    """docstring"""
    pattern = re.compile(
        r'def (test_\w+)\s*\([^)]*\):\s*\n'
        r'(?:\s*"""((?:[^"]|"(?!""))*?)""")?',
        re.DOTALL,
    )
    results = []
    for m in pattern.finditer(test_content):
        results.append({
            "name": m.group(1),
            "docstring": m.group(2) or "",
        })
    return results


def _keywords_from_ac(ac: str) -> list[str]:
    """Extract meaningful keywords from an acceptance criterion.

    Strips short/common words and returns lowercase keywords.

    Args:
        ac: An acceptance criterion string.

    Returns:
        List of lowercase keyword strings.
    """
    stop_words = {
        "a", "an", "the", "is", "are", "was", "were", "be", "been",
        "has", "have", "had", "do", "does", "did", "will", "would",
        "can", "could", "should", "may", "might", "must", "shall",
        "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "and", "or", "not", "no", "if", "then", "that", "this",
        "it", "its", "as", "so", "but",
    }
    words = re.findall(r"[a-z]+", ac.lower())
    return [w for w in words if w not in stop_words and len(w) > 1]


def map_tests_to_criteria(
    test_content: str, criteria: list[str]
) -> dict[str, list[str]]:
    """Map each acceptance criterion to test functions that reference it.

    Uses keyword matching: for each AC, extracts meaningful keywords and
    checks whether a test function's name or docstring contains enough
    of those keywords to indicate coverage.

    A test is considered to cover an AC if at least 60% of the AC's
    keywords appear in the test's name (underscores as separators) or
    docstring (case-insensitive).

    Args:
        test_content: Raw Python source of a test file.
        criteria: List of acceptance criteria strings.

    Returns:
        Dict mapping each AC string to a list of covering test function names.
    """
    tests = _extract_test_functions(test_content)
    mapping: dict[str, list[str]] = {}

    for ac in criteria:
        keywords = _keywords_from_ac(ac)
        if not keywords:
            mapping[ac] = []
            continue

        covering: list[str] = []
        for test in tests:
            # Build searchable text from name (replace _ with space) and docstring
            searchable = (
                test["name"].replace("_", " ").lower()
                + " "
                + test["docstring"].lower()
            )
            matched = sum(1 for kw in keywords if kw in searchable)
            # Require at least 60% keyword match
            if matched / len(keywords) >= 0.6:
                covering.append(test["name"])

        mapping[ac] = covering

    return mapping


def audit_spec_traceability(
    session_content: str, test_content: str
) -> dict:
    """Produce a spec traceability coverage report.

    Combines AC parsing and test mapping to determine which acceptance
    criteria are covered by tests and which are not.

    Args:
        session_content: Raw markdown content of a session file.
        test_content: Raw Python source of a test file.

    Returns:
        Dict with keys:
            - covered: list of ACs that have at least one covering test
            - uncovered: list of ACs with no covering tests
            - coverage_pct: float percentage of covered ACs
            - mapping: dict mapping each AC to its covering test names
    """
    criteria = parse_acceptance_criteria(session_content)
    mapping = map_tests_to_criteria(test_content, criteria)

    covered = [ac for ac in criteria if mapping.get(ac)]
    uncovered = [ac for ac in criteria if not mapping.get(ac)]

    total = len(criteria)
    coverage_pct = 100.0 if total == 0 else round(len(covered) / total * 100, 2)

    return {
        "covered": covered,
        "uncovered": uncovered,
        "coverage_pct": coverage_pct,
        "mapping": mapping,
    }
