"""Regression tests: git_utils tests must not leak a checkout onto the live repo.

Story: 153-9 — Fix test_git_utils.py leaking a feature/test checkout onto the
live repo (full pytest suite silently switches the working branch).

Root cause (verified): every git subprocess call in ``pf.git.create_branches``
already pins ``cwd`` to the explicitly-passed repo path, so the source is NOT
the leak. The leak comes from the test inputs: ``test_git_utils.py`` feeds
``Path(".")`` — the *process cwd*, i.e. the live repository — into
``create_feature_branches`` / ``get_all_repo_status``. For an unknown repo
``should_create_branch(None)`` is permissive, so ``create_or_checkout_branch``
runs a real ``checkout develop`` + ``checkout -b feature/test`` against the
surrounding repo, silently switching the developer's working branch.

These tests fail (RED) until the offending tests are made hermetic (use a
``tmp_path`` git repo instead of ``Path(".")``). They intentionally do NOT
assert a new source-level guard: ``create_or_checkout_branch`` operating on the
repo it is explicitly handed is correct behavior (``pf git branches`` relies on
it). The fix is test hygiene, and these tests enforce it.

Acceptance Criteria covered:
- AC1: running the suite leaves the working tree on its original branch
- AC4: git_utils tests run hermetically against tmp_path fixtures only, with no
  side effects on the surrounding repository
"""

import os
import subprocess
import sys
from pathlib import Path

TEST_GIT_UTILS = Path(__file__).resolve().parent / "test_git_utils.py"


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False)


def _make_repo(repo: Path) -> str:
    """Init a git repo on a known branch with a ``develop`` branch present.

    Returns the starting branch name. ``develop`` must exist so the
    create-from-develop path in ``create_or_checkout_branch`` is reachable —
    that path is what switches the branch when the leak fires.
    """
    repo.mkdir(parents=True, exist_ok=True)
    _git(repo, "-c", "init.defaultBranch=main", "init", "-q")
    _git(repo, "config", "user.email", "test@test.com")
    _git(repo, "config", "user.name", "Test User")
    (repo / "README.md").write_text("# sandbox\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "init")
    _git(repo, "branch", "-M", "main")
    _git(repo, "branch", "develop")
    return _git(repo, "branch", "--show-current").stdout.strip()


def _current_branch(repo: Path) -> str:
    return _git(repo, "branch", "--show-current").stdout.strip()


def test_partial_failure_tests_do_not_leak_branch_to_outer_repo(tmp_path: Path) -> None:
    """AC1/AC4: running the git_utils partial-failure tests from within a repo
    must not switch that repo's branch.

    Reproduces the exact leak: the inner tests pass ``Path(".")`` (the cwd repo)
    into the branch helpers. We run them with cwd set to an isolated sandbox
    repo and assert the sandbox is still on its original branch afterward.
    """
    sandbox = tmp_path / "outer-repo"
    start_branch = _make_repo(sandbox)
    assert start_branch == "main"

    env = dict(os.environ)
    # Pin project-root detection to the sandbox so repos.yaml lookups stay
    # self-contained (unknown repo -> permissive -> the leak path is exercised).
    env["PROJECT_ROOT"] = str(sandbox)
    env.pop("CLAUDE_PROJECT_DIR", None)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", str(TEST_GIT_UTILS), "-k", "partial_failures", "-q"],
        cwd=sandbox,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    # Guard against a false green: the inner tests must actually have run.
    # (They pass even while leaking, so returncode 0 is expected here.)
    assert "no tests ran" not in result.stdout.lower(), (
        "Inner partial-failure tests did not run — cannot assess the leak.\n"
        f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )

    end_branch = _current_branch(sandbox)
    assert end_branch == start_branch, (
        f"git_utils tests switched the surrounding repo from {start_branch!r} to "
        f"{end_branch!r} — a checkout leaked onto the live repository. The "
        f"partial-failure tests must use a tmp_path git repo, not Path('.').\n"
        f"Inner pytest STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )


def test_git_utils_tests_use_no_live_cwd_repo_paths() -> None:
    """AC4: git_utils tests must use tmp_path fixtures only — never the live cwd
    repo. Passing ``Path(".")`` (or ``Path.cwd()``) as a repo path lets the
    branch helpers checkout branches on the surrounding repository.
    """
    src = TEST_GIT_UTILS.read_text()
    leak_vectors = ['Path(".")', "Path('.')", "Path.cwd()"]
    found = [vec for vec in leak_vectors if vec in src]
    assert not found, (
        f"test_git_utils.py passes live-cwd repo path(s) {found} into git helpers; "
        f"create_feature_branches will checkout branches on the surrounding repo. "
        f"Use a tmp_path-based git repo fixture instead."
    )
