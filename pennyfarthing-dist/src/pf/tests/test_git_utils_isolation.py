"""Regression tests: git_utils tests must not leak a checkout onto the live repo.

Story: 153-9 — Fix test_git_utils.py leaking a feature/test checkout onto the
live repo (full pytest suite silently switches the working branch).

Root cause (verified): every git subprocess call in ``pf.git.create_branches``
already pins ``cwd`` to the explicitly-passed repo path, so the source is NOT
the leak. The leak comes from the test inputs: ``test_git_utils.py`` fed the
*process cwd* (the live repository) into ``create_feature_branches`` /
``get_all_repo_status``. For an unknown repo ``should_create_branch(None)`` is
permissive, so ``create_or_checkout_branch`` runs a real ``checkout develop`` +
``checkout -b feature/test`` against the surrounding repo, silently switching
the developer's working branch.

These tests fail (RED) until the offending tests are made hermetic (use a
``tmp_path`` git repo). They intentionally do NOT assert a new source-level
guard: ``create_or_checkout_branch`` operating on the repo it is explicitly
handed is correct behavior (``pf git branches`` relies on it). The fix is test
hygiene, and these tests enforce it.

Acceptance Criteria covered:
- AC1: running the suite leaves the working tree on its original branch
- AC4: git_utils tests run hermetically against tmp_path fixtures only, with no
  side effects on the surrounding repository
"""

import ast
import os
import subprocess
import sys
from pathlib import Path

import pytest

TEST_GIT_UTILS = Path(__file__).resolve().parent / "test_git_utils.py"

# Hard ceiling for the inner pytest run so a hung git operation (e.g. a
# credential prompt) fails loudly instead of wedging the suite / CI.
_INNER_PYTEST_TIMEOUT = 120


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False)


def _git_checked(repo: Path, *args: str) -> subprocess.CompletedProcess:
    """Run a git command and raise with diagnostics if it fails.

    The sandbox setup must not fail silently — a missing commit or branch would
    make the leak path unreachable and the regression false-green.
    """
    result = _git(repo, *args)
    if result.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed in {repo} (rc={result.returncode}): "
            f"{result.stderr.strip() or result.stdout.strip()}"
        )
    return result


def _make_repo(repo: Path) -> str:
    """Init a git repo on ``main`` with a ``develop`` branch present.

    Returns the starting branch name. ``develop`` MUST exist — it is the
    precondition the create-from-develop leak path needs, so its absence would
    make the meta-test pass for the wrong reason. Every setup step is checked,
    and ``develop``'s existence is asserted before returning.
    """
    repo.mkdir(parents=True, exist_ok=True)
    _git_checked(repo, "-c", "init.defaultBranch=main", "init", "-q")
    _git_checked(repo, "config", "user.email", "test@test.com")
    _git_checked(repo, "config", "user.name", "Test User")
    (repo / "README.md").write_text("# sandbox\n")
    _git_checked(repo, "add", ".")
    _git_checked(repo, "commit", "-q", "-m", "init")
    _git_checked(repo, "branch", "-M", "main")
    _git_checked(repo, "branch", "develop")

    branches = _git(repo, "branch", "--format=%(refname:short)").stdout.split()
    assert "develop" in branches, f"sandbox setup failed to create develop: {branches}"
    start = _current_branch(repo)
    assert start == "main", f"sandbox setup left repo on {start!r}, expected 'main'"
    return start


def _current_branch(repo: Path) -> str:
    return _git(repo, "branch", "--show-current").stdout.strip()


def _live_cwd_calls(src: str) -> list[str]:
    """Return descriptions of any live-cwd repo-path expressions in ``src``.

    AST-based, so comments and docstrings that merely *mention* the patterns
    (like this module's own prose) do not trip it. Catches ``Path(".")``,
    ``Path('.')``, ``Path.cwd()``, ``os.getcwd()``, and ``Path(os.curdir)`` —
    every easy way to hand a test the surrounding repo.
    """
    found: list[str] = []
    for node in ast.walk(ast.parse(src)):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name) and func.id == "Path" and node.args:
            arg0 = node.args[0]
            if isinstance(arg0, ast.Constant) and arg0.value in (".", ""):
                found.append(f"Path({arg0.value!r})")
            elif isinstance(arg0, ast.Attribute) and arg0.attr == "curdir":
                found.append("Path(os.curdir)")
        elif isinstance(func, ast.Attribute):
            if func.attr == "cwd" and isinstance(func.value, ast.Name) and func.value.id == "Path":
                found.append("Path.cwd()")
            elif (
                func.attr == "getcwd" and isinstance(func.value, ast.Name) and func.value.id == "os"
            ):
                found.append("os.getcwd()")
    return found


def test_partial_failure_tests_do_not_leak_branch_to_outer_repo(tmp_path: Path) -> None:
    """AC1/AC4: running the git_utils partial-failure tests from within a repo
    must not switch that repo's branch.

    Runs the inner tests with cwd set to an isolated sandbox repo and asserts
    the sandbox is still on its original branch afterward. The leak path needs a
    ``develop`` branch in the cwd repo (provided by ``_make_repo``).
    """
    sandbox = tmp_path / "outer-repo"
    start_branch = _make_repo(sandbox)

    env = dict(os.environ)
    # Pin project-root detection to the sandbox so repos.yaml lookups stay
    # self-contained (unknown repo -> permissive -> the leak path is exercised).
    env["PROJECT_ROOT"] = str(sandbox)
    env.pop("CLAUDE_PROJECT_DIR", None)

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", str(TEST_GIT_UTILS), "-k", "partial_failures", "-q"],
            cwd=sandbox,
            env=env,
            capture_output=True,
            text=True,
            check=False,
            timeout=_INNER_PYTEST_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:  # pragma: no cover - hang guard
        pytest.fail(f"Inner partial-failure pytest hung > {_INNER_PYTEST_TIMEOUT}s: {exc}")

    # Liveness gate (NOT a stdout-string match — pytest prints "deselected",
    # not "no tests ran", on a zero-match -k, and exits 5; an import/collection
    # error exits 4). Only rc 0 means the leak-exercising tests actually ran and
    # passed, so the branch assertion below is meaningful.
    assert result.returncode == 0, (
        f"Inner partial-failure pytest did not run+pass (rc={result.returncode}; "
        f"0=ran+passed, 4=collection/usage error, 5=no tests collected) — the "
        f"leak check below would be vacuous.\nSTDOUT:\n{result.stdout}\n"
        f"STDERR:\n{result.stderr}"
    )

    end_branch = _current_branch(sandbox)
    assert end_branch == start_branch, (
        f"git_utils tests switched the surrounding repo from {start_branch!r} to "
        f"{end_branch!r} — a checkout leaked onto the live repository. The "
        f"partial-failure tests must use a tmp_path git repo, not the cwd.\n"
        f"Inner pytest STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )


def test_git_utils_tests_use_no_live_cwd_repo_paths() -> None:
    """AC4: git_utils tests must use tmp_path fixtures only — never the live cwd
    repo. Passing the process cwd (``Path(".")``, ``Path.cwd()``,
    ``os.getcwd()``, ``Path(os.curdir)``) as a repo path lets the branch helpers
    checkout branches on the surrounding repository.
    """
    found = _live_cwd_calls(TEST_GIT_UTILS.read_text())
    assert not found, (
        f"test_git_utils.py passes live-cwd repo path(s) {found} into git helpers; "
        f"create_feature_branches will checkout branches on the surrounding repo. "
        f"Use a tmp_path-based git repo fixture instead."
    )
