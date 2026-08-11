"""Tests for story 162-32: three truthfulness guards in the finish path.

162-6 routed every finish subprocess into the story's code repo and taught
finish to verify EVERY repo's PR. That routing trusts three things it never
checks, and each one turns a bookkeeping detail into a lie about shipped work.

The bugs
--------
1. **The resolved repo path is never checked for existence.**
   ``_resolve_story_repos`` maps each name in the story's ``repos:`` field
   through repos.yaml and returns ``(project_root / rc.path).resolve()`` — a
   path, cloned or not. ``Path.resolve()`` does not care. The first consumer
   is ``_run([...], cwd=str(repo_path))``, and ``subprocess`` on a
   non-existent ``cwd`` RAISES ``FileNotFoundError``. That traceback escapes
   ``finish_story``, which is contractually a result-returning function
   (SOUL #6, and the whole point of 162-9's ``_TimedOutProcess``: even a hung
   child comes back as a value). An operator with a topology entry they have
   not cloned — a perfectly normal state in a multi-repo workspace — gets a
   stack trace instead of "repo X is not cloned at Y".
   ``pf.git.repos.get_repo_paths`` already established the precedent guard
   (``if abs_path.exists()``); this story mirrors its shape here, as a
   ``{success: False, error: ...}`` result that NAMES the repo.

2. **The ``repos:`` list is never deduped.**
   ``resolved = [configs[name] for name in names if name in configs]`` keeps
   duplicates, so ``repos: [framework, framework]`` resolves the SAME repo
   twice and every per-repo loop runs twice against it. The merge loop is the
   dangerous one: the already-merged short-circuit reads ``pr_views`` keyed by
   ``repo_path``, and that snapshot was taken BEFORE the merge — so on the
   second pass it still says OPEN, the short-circuit does not fire, and
   ``gh pr merge`` runs a second time on a PR that just landed. Real ``gh``
   exits non-zero there ("Pull request #N is already merged"), which trips the
   rc-!=-0 abort — a FALSE ABORT on fully-landed work, after the irreversible
   merge, leaving the story ``in_review``. The same duplicate also makes
   ``session_pr`` be dropped (``len(story_repos) == 1`` is false for what is
   really one repo).

3. **``_git_cleanup`` discards return codes while reporting a clean step.**
   The cleanup chain is ``git checkout``, ``git pull``, ``git branch -d``.
   Only the checkout's ``returncode`` is examined; the pull's and the delete's
   are read and thrown away, and the function returns the bare ``entry`` — a
   step-6 record with no warning, i.e. "cleanup ran clean". A failed pull
   (no network, diverged base) or a refused delete (``branch -d`` on a branch
   git does not consider merged) is therefore reported as success. That is the
   exact silent-skip failure mode this epic exists to kill, and the function's
   own docstring already promises the opposite: "it must never read as a clean
   step 6 either".

Acceptance criteria (from the story title/description; SM assessment is
authoritative)
--------------
- AC1: ``_resolve_story_repos`` with a topology entry that is not cloned
  returns a ``{success: False, error: ...}`` result naming the repo/path, and
  ``finish_story`` surfaces that as a result — never a raised exception.
- AC2: a ``repos:`` list containing the same repo twice merges the PR exactly
  ONCE and does not abort a finish whose work landed.
- AC3: a non-zero return code from any ``_git_cleanup`` git command surfaces
  in the step-6 record; it must not be reported as a clean cleanup.

Designed interface for Dev (tests bind to behavior where they can)
------------------------------------------------------------------
AC1 changes ``_resolve_story_repos``'s return type from a bare list to a
result object. The tests below read the resolved list through
:func:`_resolved_repos`, which accepts either shape, so the dedup assertion
does not double as a signature assertion. The success shape assumed is
``{"success": True, "data": [(abs_path, RepoConfig|None), ...]}``; any mapping
carrying the list under ``data``/``repos`` satisfies it.

RED on HEAD — 6:
  - TestUnclonedRepoIsAResultNotAThrow: 2 (unit returns a list, no guard;
    end-to-end raises FileNotFoundError out of finish_story)
  - TestDuplicateRepoMergesOnce: 2 (unit keeps the duplicate; end-to-end
    merges twice and false-aborts)
  - TestGitCleanupPropagatesReturnCodes: 2 (failed pull / failed delete both
    reported clean)
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.git.repos import RepoConfig
from pf.sprint.story_finish import _git_cleanup, _resolve_story_repos, finish_story

STORY_ID = "162-32"

#: Not a branch that exists in the repo the test runner is invoked from, so a
#: probe that forgets ``cwd`` cannot pass by luck.
STORY_BRANCH = "feat/162-32-resolve-story-repos-guards-gitcleanup-rc"

PR_NUMBER = "532"


# =============================================================================
# Workspace fixtures — real git repos, so a real "no" is available
# =============================================================================

FRONTMATTER = f"""\
---
story_id: "{STORY_ID}"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story {STORY_ID}: resolver guards for _resolve_story_repos
"""

SESSION_BRANCH_ONLY = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** {STORY_ID}
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
"""
)

INDEX_YAML = """\
sprint:
  name: "Test16232"
  jira_sprint_id: 999
  jira_sprint_name: "Test16232"
  goal: resolver guards
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""

#: Orchestrator root is trunk-based ``main``; the code repo is gitflow
#: ``develop`` — the dogfood topology.
REPOS_YAML_INLINED = """\
repos:
  orchestrator:
    path: "."
    type: orchestrator
    default_branch: main
    branch_strategy: trunk-based
  framework:
    path: framework
    type: framework
    default_branch: develop
    branch_strategy: gitflow
"""


def _shard_yaml(repos_field: str) -> str:
    return f"""\
id: "162"
type: epic
title: "Finish & sprint-tooling truthfulness"
priority: p1
status: in_progress
stories:
  - id: {STORY_ID}
    title: resolver guards for _resolve_story_repos
    points: 2
    priority: p2
    status: in_review
    workflow: tdd
    repos: {repos_field}
"""


def _git(root: Path, *args: str) -> None:
    result = subprocess.run(["git", *args], cwd=str(root), capture_output=True, text=True)
    assert result.returncode == 0, f"fixture git {' '.join(args)} failed: {result.stderr}"


def _init_repo(path: Path, tmp_path: Path, *, default_branch: str, world: str) -> None:
    """Make ``path`` a real git repo with a bare origin.

    ``world``: ``"absent"`` (no story branch), ``"unmerged"`` (branch exists
    with a commit the base lacks).
    """
    path.mkdir(parents=True, exist_ok=True)
    (path / "README.md").write_text(f"# {path.name}\n", encoding="utf-8")
    _git(path, "init", "-q", "-b", default_branch)
    _git(path, "config", "user.email", "tea@162-32.test")
    _git(path, "config", "user.name", "TEA fixture")
    _git(path, "config", "commit.gpgsign", "false")
    _git(path, "config", "core.hooksPath", str(path / ".git" / "hooks"))
    _git(path, "add", "-A")
    _git(path, "commit", "-q", "-m", f"init {default_branch}")

    origin = tmp_path / f"origin-{path.name}.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", str(origin)], capture_output=True, text=True, check=True
    )
    _git(path, "remote", "add", "origin", str(origin))
    _git(path, "push", "-q", "origin", default_branch)

    if world == "absent":
        return

    _git(path, "checkout", "-q", "-b", STORY_BRANCH)
    (path / "work.txt").write_text("story work\n", encoding="utf-8")
    _git(path, "add", "work.txt")
    _git(path, "commit", "-q", "-m", "story work commit")
    _git(path, "push", "-q", "origin", STORY_BRANCH)
    _git(path, "checkout", "-q", default_branch)


def _make_workspace(
    tmp_path: Path,
    *,
    repos_field: str,
    code_repos: dict[str, str],
) -> Path:
    """Orchestrator project root, plus whichever code sub-repos are cloned.

    ``code_repos`` maps a relative sub-repo path to its ``world``. A topology
    entry absent from this mapping is the UNCLONED case: repos.yaml names it,
    the directory does not exist.
    """
    root = tmp_path / "orc"
    sprint_dir = root / "sprint"
    sprint_dir.mkdir(parents=True)
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-162.yaml").write_text(_shard_yaml(repos_field), encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = root / ".session"
    session_dir.mkdir()
    (session_dir / f"{STORY_ID}-session.md").write_text(SESSION_BRANCH_ONLY, encoding="utf-8")
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "repos.yaml").write_text(REPOS_YAML_INLINED, encoding="utf-8")

    _init_repo(root, tmp_path, default_branch="main", world="absent")
    for rel, world in code_repos.items():
        if rel in (".", ""):
            continue
        _init_repo(root / rel, tmp_path, default_branch="develop", world=world)
    return root


def _story(repos: Any) -> dict[str, Any]:
    return {"id": STORY_ID, "status": "in_review", "repos": repos}


def _resolved_repos(returned: Any) -> list[tuple[Path, Any]]:
    """The ``(abs_path, config)`` list, from either return shape.

    AC1 turns ``_resolve_story_repos`` into a result-returning function; the
    dedup assertions care about the LIST, not about which shape carries it.
    """
    if isinstance(returned, dict):
        assert returned.get("success") is True, f"expected a success result, got {returned}"
        for key in ("data", "repos"):
            if key in returned:
                return list(returned[key])
        pytest.fail(f"success result carries no resolved repo list: {returned}")
    return list(returned)


# =============================================================================
# The fake — gh answers per repo, git passes through, a missing cwd raises
# =============================================================================


@dataclass
class PrWorld:
    """The PR world visible from ONE repo."""

    pr: str | None = None
    state: str = "OPEN"


@dataclass
class Recorder:
    calls: list[tuple[list[str], Any]] = field(default_factory=list)

    def matching(self, *needles: str) -> list[tuple[list[str], Any]]:
        return [(argv, cwd) for argv, cwd in self.calls if all(n in argv for n in needles)]


def _norm(cwd: Any, project_root: Path) -> Path:
    if cwd in (None, ""):
        return project_root.resolve()
    return Path(str(cwd)).resolve()


def _make_run(project_root: Path, worlds: dict[str, PrWorld]):
    """Dispatching fake for ``story_finish._run``.

    - a ``cwd`` that does not exist RAISES ``FileNotFoundError``, exactly as
      ``subprocess.run`` does. Faking that away would fake away bug 1.
    - ``gh pr merge`` on a PR already in MERGED state answers NON-ZERO with
      gh's real wording. That is what turns a duplicate repo into a false
      abort, so the fake must not paper over it.
    - ``git`` passes through to the real subprocess against the real fixture
      repos; the step-5 ``pf.cli`` invocation is canned.
    """
    resolved: dict[Path, PrWorld] = {
        (project_root / rel).resolve(): world for rel, world in worlds.items()
    }
    live: dict[Path, str] = {path: w.state for path, w in resolved.items()}
    recorder = Recorder()

    def _fake(cmd: list[Any], **kwargs: Any) -> Any:
        argv = [str(c) for c in cmd]
        cwd = kwargs.get("cwd")
        recorder.calls.append((argv, cwd))
        if cwd not in (None, "") and not Path(str(cwd)).is_dir():
            raise FileNotFoundError(2, "No such file or directory", str(cwd))
        here = _norm(cwd, project_root)

        if argv and argv[0] == "gh":
            world = resolved.get(here)
            if world is None:
                return MagicMock(
                    returncode=1,
                    stdout="",
                    stderr=f"could not resolve to a PullRequest with the number of {PR_NUMBER}",
                )
            if "list" in argv:
                return MagicMock(returncode=0, stdout=(world.pr or "") + "\n", stderr="")
            asked = next((a for a in argv[3:] if a.isdigit()), None)
            if world.pr is None or asked != world.pr:
                return MagicMock(
                    returncode=1, stdout="", stderr=f"no pull request found for {asked}"
                )
            if "view" in argv:
                state = live.get(here, world.state)
                return MagicMock(
                    returncode=0,
                    stdout=json.dumps(
                        {
                            "state": state,
                            "mergedAt": "2026-08-11T00:00:00Z" if state == "MERGED" else None,
                            "mergeable": "MERGEABLE",
                            "mergeStateStatus": "CLEAN",
                            "baseRefName": "develop",
                        }
                    ),
                    stderr="",
                )
            if "merge" in argv:
                if live.get(here) == "MERGED":
                    return MagicMock(
                        returncode=1,
                        stdout="",
                        stderr=f"Pull request #{world.pr} is already merged",
                    )
                live[here] = "MERGED"
                return MagicMock(returncode=0, stdout="", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        if argv and argv[0] == sys.executable:
            return MagicMock(returncode=0, stdout="", stderr="")

        return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

    return _fake, recorder


# =============================================================================
# AC1 — an uncloned topology entry is a result, not a traceback
# =============================================================================


class TestUnclonedRepoIsAResultNotAThrow:
    """repos.yaml names ``framework``; nobody cloned it."""

    def test_resolve_story_repos_returns_result_naming_uncloned_repo(self, tmp_path: Path) -> None:
        """RED: HEAD returns ``[(<missing path>, RepoConfig)]`` with no guard at
        all, so this asserts the guard into existence at the layer that owns
        the path — mirroring ``pf.git.repos.get_repo_paths``'s ``exists()``
        precedent, but LOUD rather than silently dropping the repo (dropping it
        would degrade a story to the project root and verify the wrong repo).
        """
        project_root = _make_workspace(tmp_path, repos_field="framework", code_repos={})
        assert not (project_root / "framework").exists(), "precondition: repo is not cloned"

        returned = _resolve_story_repos(project_root, _story("framework"))

        assert isinstance(returned, dict), (
            "_resolve_story_repos must answer with a result object so an "
            f"uncloned repo can be reported instead of raised; got {type(returned)}"
        )
        assert returned.get("success") is False, (
            f"an uncloned repo must not read as a successful resolution: {returned}"
        )
        error = str(returned.get("error") or "")
        assert "framework" in error, f"the error must name the repo: {error!r}"
        assert str(project_root / "framework") in error, (
            f"the error must name the path that is not there: {error!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_story_reports_uncloned_repo_instead_of_raising(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: on HEAD the first probe runs with ``cwd`` pointing at a
        directory that does not exist and ``subprocess`` raises
        ``FileNotFoundError`` straight out of ``finish_story`` — a traceback
        where the contract promises ``{success, error}``.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project_root = _make_workspace(tmp_path, repos_field="framework", code_repos={})
        fake, _rec = _make_run(project_root, {})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            try:
                result = finish_story(project_root, STORY_ID)
            except Exception as exc:  # noqa: BLE001 - the defect under test
                pytest.fail(
                    "finish_story raised instead of returning a result for an "
                    f"uncloned repo: {type(exc).__name__}: {exc}"
                )

        assert result["success"] is False, f"an uncloned repo cannot finish: {result}"
        assert "framework" in str(result.get("error") or ""), (
            f"the abort must name the repo the operator has to clone: {result}"
        )
        assert (project_root / ".session" / f"{STORY_ID}-session.md").exists(), (
            "an aborted finish must keep the session"
        )
        assert list((project_root / "sprint" / "archive").iterdir()) == [], (
            "an aborted finish must leave no stray archive copy (155-15)"
        )


# =============================================================================
# AC2 — a duplicate repo name merges the PR exactly once
# =============================================================================


class TestDuplicateRepoMergesOnce:
    """``repos: [framework, framework]`` — one repo, named twice."""

    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        return _make_workspace(
            tmp_path,
            repos_field='["framework", "framework"]',
            code_repos={"framework": "unmerged"},
        )

    def test_resolve_story_repos_dedups_preserving_order(self, project: Path) -> None:
        """RED: HEAD's list comprehension keeps both copies, so every per-repo
        loop in finish runs twice against one repo.
        """
        resolved = _resolved_repos(
            _resolve_story_repos(project, _story(["framework", "framework"]))
        )

        paths = [p for p, _c in resolved]
        assert paths == [(project / "framework").resolve()], (
            f"the same repo must resolve once, in order: {paths}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_duplicate_repo_merges_once_and_does_not_false_abort(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """RED: HEAD merges PR #532, then loops onto the duplicate, reads the
        STALE pre-merge snapshot (still OPEN) so the already-merged
        short-circuit does not fire, and runs ``gh pr merge`` again. gh exits
        non-zero ("already merged") and finish aborts work that just landed.

        The merge is irreversible, so the count is the assertion: exactly one
        ``gh pr merge`` for one PR.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake, rec = _make_run(project, {"framework": PrWorld(pr=PR_NUMBER, state="OPEN")})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        merges = rec.matching("gh", "merge")
        assert len(merges) == 1, (
            f"a repo named twice must be merged once, not {len(merges)} times: {merges}"
        )
        assert result["success"] is True, (
            "finish aborted a story whose PR landed, because it tried to merge "
            f"the same PR twice: {result}"
        )
        assert "already merged" not in str(result.get("error") or "").lower(), (
            f"the duplicate produced the false abort this story kills: {result}"
        )


# =============================================================================
# AC3 — a non-zero git return code never reads as a clean cleanup
# =============================================================================

CLEANUP_CONFIG = RepoConfig(
    name="framework",
    path="framework",
    repo_type="framework",
    default_branch="develop",
    branch_strategy="gitflow",
)


def _cleanup_run(*, pull_rc: int = 0, delete_rc: int = 0):
    """Fake ``_run`` for ``_git_cleanup``: validation and the base probe
    succeed, and the two chained mutations answer configurable return codes.
    """
    recorder = Recorder()

    def _fake(cmd: list[Any], **kwargs: Any) -> Any:
        argv = [str(c) for c in cmd]
        recorder.calls.append((argv, kwargs.get("cwd")))
        if argv[:2] == ["git", "pull"]:
            return MagicMock(
                returncode=pull_rc,
                stdout="",
                stderr="" if pull_rc == 0 else "fatal: could not read from remote repository",
            )
        if argv[:3] == ["git", "branch", "-d"]:
            return MagicMock(
                returncode=delete_rc,
                stdout="",
                stderr=""
                if delete_rc == 0
                else f"error: the branch '{STORY_BRANCH}' is not fully merged",
            )
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake, recorder


def _entry_text(entries: list[dict[str, Any]]) -> str:
    """Every string the step-6 record carries, for "did it say anything?"."""
    return " ".join(str(v) for entry in entries for v in entry.values())


class TestGitCleanupPropagatesReturnCodes:
    """The chain's return codes are read and discarded on HEAD."""

    def test_failed_pull_is_not_reported_as_clean(self, tmp_path: Path) -> None:
        """RED: ``git pull`` fails, ``_git_cleanup`` returns the bare entry, and
        step 6 reads exactly like a successful cleanup — the operator is never
        told the base branch was not updated.
        """
        fake, rec = _cleanup_run(pull_rc=1)

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            entries = _git_cleanup(tmp_path, STORY_BRANCH, CLEANUP_CONFIG)

        assert rec.matching("git", "pull"), "precondition: the pull ran"
        text = _entry_text(entries)
        assert "could not read from remote repository" in text, (
            "the failing pull's stderr must reach the step-6 record; the record "
            f"reports a clean cleanup instead: {entries}"
        )
        assert any(
            entry.get("warning") or entry.get("error") or entry.get("success") is False
            for entry in entries
        ), f"a failed git step must not read as a clean step 6: {entries}"

    def test_failed_branch_delete_is_not_reported_as_clean(self, tmp_path: Path) -> None:
        """RED: ``git branch -d`` is refused (git does not consider the branch
        merged — precisely the case where the operator must look), and step 6
        still reports clean. The branch is silently left behind.
        """
        fake, rec = _cleanup_run(delete_rc=1)

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            entries = _git_cleanup(tmp_path, STORY_BRANCH, CLEANUP_CONFIG)

        assert rec.matching("git", "branch", "-d"), "precondition: the delete ran"
        text = _entry_text(entries)
        assert "is not fully merged" in text, (
            "the refused delete's stderr must reach the step-6 record; the "
            f"record reports a clean cleanup instead: {entries}"
        )
        assert any(
            entry.get("warning") or entry.get("error") or entry.get("success") is False
            for entry in entries
        ), f"a refused branch delete must not read as a clean step 6: {entries}"
