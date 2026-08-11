"""Story 162-30: pin the removal of the stale second test tree.

The framework repo once carried a second, stale Python test tree at
``tests/python/`` (99 files, 287 failures + 22 errors = 309 unmarked).  It was
invisible to a bare ``pytest`` run (``testpaths`` points only at the canonical
tree) but WAS executed by ``just test``, so the two entrypoints disagreed.

Product-owner-sanctioned disposition: de-reference and delete the tree.  These
tests pin the invariant so the tree cannot silently come back and so no test
entrypoint starts pointing at it again.

Run with:
    cd pennyfarthing-dist && uv run pytest \
        src/pf/tests/test_162_30_second_tree_removed.py -q
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

STALE_TREE_REL = "tests/python"


def _find_repo_root() -> Path | None:
    """Walk up from this file to the framework repo root.

    The root is identified by holding BOTH a ``justfile`` and a
    ``pennyfarthing-dist`` directory.  Returns ``None`` if not found, so callers
    can skip rather than fail on an unexpected checkout layout.
    """
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "justfile").is_file() and (
            candidate / "pennyfarthing-dist"
        ).is_dir():
            return candidate
    return None


@pytest.fixture(scope="module")
def repo_root() -> Path:
    root = _find_repo_root()
    if root is None:
        pytest.skip("framework repo root not found from test file location")
    return root


def _test_recipe_body(justfile_text: str) -> list[str]:
    """Extract the indented body lines of the justfile ``test`` recipe."""
    lines = justfile_text.splitlines()
    body: list[str] = []
    in_recipe = False
    for line in lines:
        if re.match(r"^test\s*(\+?\*?[\w-]+\s*)*:", line):
            in_recipe = True
            continue
        if in_recipe:
            if line.strip() == "":
                continue
            if not line.startswith((" ", "\t")):
                break
            body.append(line)
    return body


def test_stale_tests_python_tree_does_not_exist(repo_root: Path) -> None:
    """The stale second test tree must not exist anywhere in the repo."""
    stale = repo_root / STALE_TREE_REL
    assert not stale.exists(), (
        f"stale second test tree is back at {stale} — 162-30 deleted it "
        "deliberately (309 unmarked failures, zero canonical-CI value). "
        "Add new tests to pennyfarthing-dist/src/pf/tests/ instead."
    )


def test_justfile_test_recipe_does_not_reference_stale_tree(
    repo_root: Path,
) -> None:
    """``just test`` must run only the canonical tree."""
    justfile = repo_root / "justfile"
    assert justfile.is_file(), f"expected a justfile at {justfile}"

    body = _test_recipe_body(justfile.read_text(encoding="utf-8"))
    assert body, "could not locate the `test` recipe body in the justfile"

    joined = "\n".join(body)
    assert STALE_TREE_REL not in joined, (
        "justfile `test` recipe still references the deleted "
        f"{STALE_TREE_REL}/ tree:\n{joined}"
    )
    assert "pennyfarthing-dist/src/pf/tests" in joined, (
        "justfile `test` recipe must run the canonical test tree "
        f"(pennyfarthing-dist/src/pf/tests/), got:\n{joined}"
    )


def test_no_justfile_recipe_references_stale_tree(repo_root: Path) -> None:
    """No justfile recipe at all may point at the deleted tree."""
    text = (repo_root / "justfile").read_text(encoding="utf-8")
    offenders = [
        line for line in text.splitlines() if STALE_TREE_REL in line
    ]
    assert not offenders, (
        f"justfile still references {STALE_TREE_REL}/: {offenders}"
    )


@pytest.mark.parametrize(
    "rel_path", ["pyproject.toml", "pennyfarthing-dist/pyproject.toml"]
)
def test_pyproject_does_not_reference_stale_tree(
    repo_root: Path, rel_path: str
) -> None:
    """Neither pyproject may name the deleted tree (testpaths or otherwise)."""
    pyproject = repo_root / rel_path
    if not pyproject.is_file():
        pytest.skip(f"{rel_path} not present")
    offenders = [
        line
        for line in pyproject.read_text(encoding="utf-8").splitlines()
        if STALE_TREE_REL in line
    ]
    assert not offenders, (
        f"{rel_path} still references {STALE_TREE_REL}/: {offenders}"
    )
