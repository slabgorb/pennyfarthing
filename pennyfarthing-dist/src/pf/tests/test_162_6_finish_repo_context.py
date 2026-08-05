"""Tests for story 162-6: every gh/git subprocess in the finish path must run
in the STORY'S CODE REPO, and a multi-repo story must verify EVERY repo's PR.

The bug
-------
``finish_story`` runs its gh probes with no ``cwd`` at all
(``gh pr list``/``gh pr view``/``gh pr merge``) and its git merge-state probe
with ``cwd=project_root`` (155-34/162-4). Both resolve to the ORCHESTRATOR
repo. In a workspace where the story's code lives in an inlined sub-repo
(the dogfood topology: ``pennyfarthing/`` nested inside the orchestrator),
that is the wrong repo:

- ``gh`` resolves the orchestrator's GitHub remote, so it views/merges a PR
  number in a repo that has nothing to do with the story — a number
  collision merges an unrelated PR, and a miss makes finish abort on work
  that actually landed. The live workaround is "remember to run finish from
  inside the sub-repo", memorialized in team memory: a human-memory guard
  around an irreversible merge.
- the 155-34 no-PR merge-state probe interrogates the orchestrator repo for a
  feature branch that only ever existed in the sub-repo, reads
  ``branch not found locally or on origin`` -> ``unknown``, and aborts a
  finish whose work is fully landed (AC1's exact failure).

The story's ``repos:`` field names the code repo; ``.pennyfarthing/repos.yaml``
gives its path and its own ``default_branch``. Both are already loaded
elsewhere in this module family (``_resolve_base_branch`` /
``_git_cleanup`` call ``load_repos_config``); nothing new needs inventing.

Acceptance criteria (story YAML is authoritative; AC3/AC4 are TEA's, per the
155-13 precedent that the test docstring is the AC record)
----------------------------------------------------------------------------
- AC1: the git merge-state probe is routed to the story's code repo alongside
  the gh calls. Probing project_root makes an inlined-sub-repo no-PR finish
  read ``unknown`` and abort.
- AC2: multi-repo stories verify EVERY repo's PR is merged before marking
  done; one merged + one open aborts loudly and leaves the story
  ``in_review`` (session kept, no archive, no partial done).
- AC3 (TEA, from the story title/description): EVERY gh call in the finish
  path — the branch->PR resolution probe, the pre-merge view, ``gh pr merge``
  and the post-merge verification view — carries the story repo as cwd, so a
  finish invoked from the orchestrator root behaves exactly like one invoked
  from inside the sub-repo.
- AC4 (TEA, no-regression): a same-root workspace (the story's repo IS the
  project root, ``path: "."``) is unchanged, and the 155-34 guard keeps
  aborting on genuinely unlanded work — now in the RIGHT repo. The
  orchestrator-owned step 5 (``pf.cli sprint epic archive``, which reads
  ``sprint/``) must NOT be dragged into the code repo.

Designed interface for Dev (tests bind to behavior, not mechanism)
-----------------------------------------------------------------
Suggested seams — any shape that satisfies the assertions is fine:

1. ``_resolve_story_repos(project_root, story) -> list[RepoConfig]`` — read
   the story's ``repos:`` field (a bare string, a comma-separated string, or a
   YAML list; see ``staleness._resolve_repo_path`` for the existing parse) and
   map each name through ``pf.git.repos.load_repos_config(project_root)``.
   Absolute path is ``project_root / rc.path``; a repo whose path is ``"."``
   IS the project root. An unresolvable/absent ``repos:`` field must degrade
   to the project root (that is today's behavior and AC4 keeps it).
2. Thread that path through the gh helpers: ``_pr_view(pr_number, cwd=...)``,
   ``_pr_is_merged(pr_number, cwd=...)``, the ``gh pr list --head`` fallback,
   and ``gh pr merge``.
3. ``_branch_merge_state(repo_path, branch)`` must probe the CODE repo, and
   its base branch must come from THAT repo's ``default_branch`` — not the
   root repo's (``_resolve_base_branch`` currently hardcodes the ``path: "."``
   repo). In the fixtures below the orchestrator is trunk-based ``main`` and
   every code repo is gitflow ``develop``, so a root-scoped base resolution
   cannot pass.
4. Multi-repo: per-repo PR resolution (run the ``gh pr list --head`` probe in
   each repo) and an all-must-be-MERGED verification before the done
   transition. Deliberately UNPINNED (Delivery Finding, not a test): what a
   single session ``**PR:** #N`` line means for a two-repo story — the
   multi-repo tests below use branch-only sessions so the answer stays Dev's.
5. Step 6 cleanup deletes the feature branch, which lives in the code repo —
   route it (and its gitflow/trunk-based decision) to the story's repo config.

RED on HEAD — 9, each failing on an assertion for the right reason (the gh
call resolves the orchestrator / the git probe interrogates project_root /
only one PR is ever considered):
  - TestGhCallsRouteToStoryRepo: 3
    (pre-merge view + merge + verification, no-stray-cwd, branch->PR probe)
  - TestNoPrProbesRunInStoryRepo::test_branch_merged_in_sub_repo_finishes
  - TestMultiRepoVerifiesEveryPr: 2
  - TestMultiRepoNoPrProbes::test_no_pr_all_repos_merged_finishes
  - TestOrchestratorStepsStayAtProjectRoot: red only because its precondition
    is unreachable on HEAD (the run aborts at step 2 and never reaches step
    5); once routing lands it becomes the over-reach guard it is written as
  - TestGitCleanupRunsInStoryRepo
Green-on-arrival guards (over-reach protection — must stay green), 5:
  - TestGhCallsRouteToStoryRepo::test_no_op_merge_in_story_repo_still_aborts
  - TestNoPrProbesRunInStoryRepo::test_unmerged_in_sub_repo_still_aborts
  - TestMultiRepoNoPrProbes::test_no_pr_one_repo_unmerged_aborts
  - TestSameRootWorkspaceUnchanged: 2
Note two of those guards pass on HEAD for the WRONG reason (finish aborts
because it cannot see the PR/branch at all). Their message assertions pin the
right reason, so a fix that keeps them green has to abort on the real state
of the real repo.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

STORY_ID = "162-6"

#: Deliberately not a branch that exists in the pennyfarthing repo (the test
#: runner's own cwd), so a probe that forgets cwd entirely cannot pass by luck.
STORY_BRANCH = "feat/162-6-finish-repo-context"

FRONTMATTER = """\
---
story_id: "162-6"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-6: finish must run gh/git in the story's code repo
"""

#: Single-repo shape: the session records the PR explicitly.
SESSION_WITH_PR = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 162-6
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
- **PR:** #501 - finish repo context
"""
)

#: Branch-only shape: the PR (or, per repo, the PRs) must be resolved by
#: probing ``gh pr list --head`` — in the right repo.
SESSION_BRANCH_ONLY = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 162-6
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
"""
)

INDEX_YAML = """\
sprint:
  name: "Test1626"
  jira_sprint_id: 999
  jira_sprint_name: "Test1626"
  goal: finish must operate on the story's code repo
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""


def _shard_yaml(repos_field: str) -> str:
    """Epic shard whose single story carries the given ``repos:`` value."""
    return f"""\
id: "162"
type: epic
title: "Finish & sprint-tooling truthfulness"
priority: p1
status: in_progress
stories:
  - id: 162-6
    title: finish runs gh/git in the story's code repo
    points: 3
    priority: p2
    status: in_review
    workflow: tdd
    repos: {repos_field}
"""


#: Orchestrator root is trunk-based ``main``; every code repo is gitflow
#: ``develop``. That asymmetry is load-bearing: a base-branch resolution that
#: keeps reading the ``path: "."`` repo (today's ``_resolve_base_branch``)
#: looks for ``main`` inside a code repo that only has ``develop``.
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

REPOS_YAML_MULTI = """\
repos:
  orchestrator:
    path: "."
    type: orchestrator
    default_branch: main
    branch_strategy: trunk-based
  api:
    path: api
    type: api
    default_branch: develop
    branch_strategy: gitflow
  ui:
    path: ui
    type: ui
    default_branch: develop
    branch_strategy: gitflow
"""

REPOS_YAML_SAME_ROOT = """\
repos:
  proj:
    path: "."
    type: framework
    default_branch: develop
    branch_strategy: gitflow
"""


# =============================================================================
# Fixture builders — real git repos, so a mis-routed probe reads a real "no"
# =============================================================================


def _git(root: Path, *args: str) -> None:
    result = subprocess.run(["git", *args], cwd=str(root), capture_output=True, text=True)
    assert result.returncode == 0, f"fixture git {' '.join(args)} failed: {result.stderr}"


def _init_repo(path: Path, tmp_path: Path, *, default_branch: str, world: str) -> None:
    """Make ``path`` a real git repo with a bare origin.

    ``world`` describes ``STORY_BRANCH``'s relationship to ``default_branch``:
      - ``"merged"``: branch exists locally + on origin, fully merged in.
      - ``"unmerged"``: branch exists with one commit the base lacks.
      - ``"absent"``: the branch was never created here.
    """
    path.mkdir(parents=True, exist_ok=True)
    (path / "README.md").write_text(f"# {path.name}\n", encoding="utf-8")
    _git(path, "init", "-q", "-b", default_branch)
    _git(path, "config", "user.email", "tea@162-6.test")
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
    if world == "merged":
        _git(path, "merge", "-q", "--no-ff", STORY_BRANCH, "-m", "land story work")
        _git(path, "push", "-q", "origin", default_branch)


def _make_workspace(
    tmp_path: Path,
    *,
    repos_yaml: str,
    repos_field: str,
    session_body: str,
    code_repos: dict[str, str],
    root_world: str = "absent",
    root_branch: str = "main",
) -> Path:
    """Build an orchestrator project root plus its code sub-repos.

    ``code_repos`` maps a relative sub-repo path to its ``world``. The root is
    always a real git repo (so a mis-routed git probe gets a real answer, not
    a "not a repository" error), and by default it does NOT carry the story
    branch — the whole point of the bug.
    """
    root = tmp_path / "orc"
    sprint_dir = root / "sprint"
    sprint_dir.mkdir(parents=True)
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-162.yaml").write_text(_shard_yaml(repos_field), encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = root / ".session"
    session_dir.mkdir()
    (session_dir / f"{STORY_ID}-session.md").write_text(session_body, encoding="utf-8")
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "repos.yaml").write_text(repos_yaml, encoding="utf-8")

    _init_repo(root, tmp_path, default_branch=root_branch, world=root_world)
    for rel, world in code_repos.items():
        if rel in (".", ""):
            continue
        _init_repo(root / rel, tmp_path, default_branch="develop", world=world)
    return root


# =============================================================================
# The fake — gh answers are per-repo, keyed by the cwd the call arrives with
# =============================================================================


@dataclass
class PrWorld:
    """The PR world visible from ONE repo."""

    pr: str | None = None
    state: str = "OPEN"
    #: True when ``gh pr merge`` actually lands it (False = the gh #71 no-op:
    #: rc 0, PR stays OPEN).
    merge_lands: bool = True
    mergeable: str = "MERGEABLE"
    merge_state_status: str = "CLEAN"


@dataclass
class Recorder:
    calls: list[tuple[list[str], Any]] = field(default_factory=list)

    def argv_with_cwd(self, *needles: str) -> list[tuple[list[str], Any]]:
        return [
            (argv, cwd)
            for argv, cwd in self.calls
            if all(n in argv for n in needles)
        ]

    def gh_calls(self) -> list[tuple[list[str], Any]]:
        return [(argv, cwd) for argv, cwd in self.calls if argv and argv[0] == "gh"]


def _norm(cwd: Any, project_root: Path) -> Path:
    """The repo a subprocess call actually lands in. ``cwd=None`` means the
    process cwd, which in production is wherever the operator invoked ``pf``
    from — the orchestrator root. That is exactly the bug, so it maps to the
    project root rather than being treated as "unknown".
    """
    if cwd in (None, ""):
        return project_root.resolve()
    return Path(str(cwd)).resolve()


def _make_run(
    project_root: Path,
    worlds: dict[str, PrWorld],
    *,
    default_world: PrWorld | None = None,
):
    """Dispatching fake for ``story_finish._run``.

    - ``gh ...`` is answered from the world of the repo the call arrives in.
      A call landing in a repo with no configured world gets gh's real
      wrong-repo behavior: a non-zero exit. That makes routing LOAD-BEARING
      rather than merely observable — a probe left at the orchestrator root
      cannot see the story's PR at all.
    - ``git ...`` passes through to the real subprocess with ``**kwargs``
      forwarded, so the fixture repos' true state answers whatever probe
      shape Dev writes (and an absent ``cwd`` really does interrogate the
      root repo).
    - the step-5 ``pf.cli`` invocation is canned; never run the real CLI.
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
        here = _norm(cwd, project_root)

        if argv and argv[0] == "gh":
            world = resolved.get(here, default_world)
            if world is None:
                # gh in a repo that is not the story's: no such PR here.
                return MagicMock(
                    returncode=1,
                    stdout="",
                    stderr="could not resolve to a PullRequest with the number of 501",
                )
            if "list" in argv:
                return MagicMock(returncode=0, stdout=(world.pr or "") + "\n", stderr="")
            if "view" in argv:
                asked = next((a for a in argv[3:] if a.isdigit()), None)
                if world.pr is None or asked != world.pr:
                    return MagicMock(
                        returncode=1, stdout="", stderr=f"no pull request found for {asked}"
                    )
                return MagicMock(
                    returncode=0,
                    stdout=json.dumps(
                        {
                            "state": live.get(here, world.state),
                            "mergeable": world.mergeable,
                            "mergeStateStatus": world.merge_state_status,
                            "baseRefName": "develop",
                        }
                    ),
                    stderr="",
                )
            if "merge" in argv:
                asked = next((a for a in argv[3:] if a.isdigit()), None)
                if world.pr is None or asked != world.pr:
                    return MagicMock(
                        returncode=1, stdout="", stderr=f"no pull request found for {asked}"
                    )
                if world.merge_lands:
                    live[here] = "MERGED"
                return MagicMock(returncode=0, stdout="", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        if argv and argv[0] == sys.executable:
            return MagicMock(returncode=0, stdout="", stderr="")

        return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

    return _fake, recorder


def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


def _yaml_status(project_root: Path) -> str:
    """The story's status as the sprint YAML actually records it."""
    text = (project_root / "sprint" / "epic-162.yaml").read_text(encoding="utf-8")
    match = re.search(r"status:\s*(\w+)", text.split("id: 162-6", 1)[1])
    return match.group(1) if match else ""


def _assert_abort_invariants(
    result: dict[str, Any],
    project_root: Path,
    mock_transition: MagicMock,
) -> None:
    """The loud-abort contract: nothing irreversible ran, nothing lies."""
    assert result["success"] is False, (
        f"finish reported success while a repo's PR had not landed: {result}"
    )
    assert (project_root / ".session" / f"{STORY_ID}-session.md").exists(), (
        "an aborted finish must keep the session so it can be retried"
    )
    assert list((project_root / "sprint" / "archive").iterdir()) == [], (
        "an aborted finish must leave no stray archive copy (155-15)"
    )
    assert not _requested_done(mock_transition), (
        "an aborted finish must never request the done transition"
    )
    assert _yaml_status(project_root) == "in_review", (
        f"an aborted finish must leave the story in_review, got "
        f"{_yaml_status(project_root)!r}"
    )
    assert not any(
        s.get("action") == "merge_pr" and s.get("skipped") is True and not s.get("error")
        for s in result.get("steps", [])
    ), f"the abort's step record still carries silent-skip wording: {result.get('steps')}"


# =============================================================================
# AC3 — every gh call in the finish path runs in the story's code repo
# =============================================================================


class TestGhCallsRouteToStoryRepo:
    """The dogfood topology: orchestrator root, story code in ``framework/``,
    story ``repos: framework``. Finish is invoked from the orchestrator root
    (as ``pf`` always is) and must behave as if it were run inside the
    sub-repo.
    """

    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        return _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_INLINED,
            repos_field="framework",
            session_body=SESSION_WITH_PR,
            code_repos={"framework": "unmerged"},
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_pre_merge_view_merge_and_verification_all_use_story_repo(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """RED: PR #501 exists only in the ``framework`` repo. On HEAD every gh
        call goes out with no cwd, resolves the orchestrator, and gets "could
        not resolve to a PullRequest" — so the pre-merge probe reads unknown,
        ``gh pr merge`` fails, and finish aborts a story whose PR is perfectly
        mergeable. Behavioral, not argv-introspective: routing is the only way
        to see this PR.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake, rec = _make_run(project, {"framework": PrWorld(pr="501", state="OPEN")})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, (
            "finish could not merge/verify the story's PR from the orchestrator "
            f"root — the repo-context bug this story kills: {result}"
        )
        assert rec.argv_with_cwd("gh", "merge"), "the load-bearing merge never ran"
        assert _requested_done(mock_transition), (
            "a merged-and-verified PR must transition the story to done"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_gh_call_runs_against_the_orchestrator_repo(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """RED: not one gh invocation may land in the orchestrator repo. A
        single stray call is enough to merge (or fail to verify) a PR number in
        the wrong GitHub repository — the irreversible half of this bug. An
        omitted ``cwd`` counts as the orchestrator: that is where ``pf`` runs.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake, rec = _make_run(project, {"framework": PrWorld(pr="501", state="OPEN")})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            finish_story(project, STORY_ID)

        expected = (project / "framework").resolve()
        stray = [
            (argv, cwd)
            for argv, cwd in rec.gh_calls()
            if _norm(cwd, project) != expected
        ]
        assert rec.gh_calls(), "precondition: the finish path made gh calls"
        assert stray == [], (
            "these gh calls ran outside the story's code repo, where the PR "
            f"number means something else entirely: {stray}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_branch_to_pr_resolution_probe_uses_story_repo(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: the session records no PR, so finish resolves one from the
        branch. ``gh pr list --head`` must ask the repo that HAS the branch;
        asked at the orchestrator root it answers empty, and finish silently
        falls into the no-PR arm instead of merging the real PR.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_INLINED,
            repos_field="framework",
            session_body=SESSION_BRANCH_ONLY,
            code_repos={"framework": "unmerged"},
        )
        fake, rec = _make_run(project, {"framework": PrWorld(pr="501", state="OPEN")})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        list_calls = rec.argv_with_cwd("gh", "list")
        assert list_calls, "precondition: the branch->PR fallback probe ran"
        assert all(
            _norm(cwd, project) == (project / "framework").resolve()
            for _argv, cwd in list_calls
        ), f"the branch->PR probe asked the wrong repo: {list_calls}"
        assert rec.argv_with_cwd("gh", "merge"), (
            "the PR resolved from the branch must actually be merged — falling "
            "into the no-PR arm here is the silent-skip bug class"
        )
        assert result["success"] is True, result

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_op_merge_in_story_repo_still_aborts(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """RED-adjacent over-reach guard: routing must not weaken the gh #71
        post-merge verification. ``gh pr merge`` exits 0 but the PR stays OPEN
        in the story's repo — finish must still abort, now for the RIGHT
        reason (unlanded code), not because it looked in the wrong repo.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake, _rec = _make_run(
            project, {"framework": PrWorld(pr="501", state="OPEN", merge_lands=False)}
        )

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, mock_transition)
        assert "501" in str(result.get("error") or ""), (
            f"the abort must name the PR that did not land: {result.get('error')!r}"
        )


# =============================================================================
# AC1 — the no-PR merge-state probe runs in the code repo
# =============================================================================


class TestNoPrProbesRunInStoryRepo:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_branch_merged_in_sub_repo_finishes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC1, verbatim): no PR resolves anywhere, and the story branch is
        fully merged into ``develop`` in the ``framework`` repo (origin agrees).
        This is the accepted 155-1/155-34 clean no-PR world — from the code
        repo's point of view. On HEAD ``_branch_merge_state`` probes
        project_root, where that branch has never existed, reads
        ``unknown`` and aborts a finish whose work has landed.

        Base-branch resolution is equally load-bearing: the orchestrator is
        trunk-based ``main`` and ``framework`` is gitflow ``develop``, so a
        root-scoped ``_resolve_base_branch`` still reads unknown even after the
        cwd is fixed.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_INLINED,
            repos_field="framework",
            session_body=SESSION_BRANCH_ONLY,
            code_repos={"framework": "merged"},
        )
        fake, rec = _make_run(project, {"framework": PrWorld(pr=None)})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, (
            "a no-PR finish whose branch is verifiably merged in the STORY'S "
            f"repo must succeed — AC1's exact failure: {result}"
        )
        assert _requested_done(mock_transition), (
            "the verified-merged no-PR world must still transition to done"
        )
        assert not rec.argv_with_cwd("gh", "merge"), "no PR resolved — nothing to merge"
        assert (project / "sprint" / "archive" / f"{STORY_ID}-session.md").exists(), (
            "a clean no-PR finish must still archive the session"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_unmerged_in_sub_repo_still_aborts(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Green guard (155-34 preservation): the branch exists in the code repo
        with commits ``develop`` lacks, and no PR resolves. Re-routing the probe
        must not turn the guard into a rubber stamp — this must still abort and
        name the branch. (Green on HEAD for the WRONG reason today — "branch not
        found" at the root — so the message assertion pins the right one.)
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_INLINED,
            repos_field="framework",
            session_body=SESSION_BRANCH_ONLY,
            code_repos={"framework": "unmerged"},
        )
        fake, _rec = _make_run(project, {"framework": PrWorld(pr=None)})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, mock_transition)
        assert STORY_BRANCH in str(result.get("error") or ""), (
            f"the abort must name the unlanded branch: {result.get('error')!r}"
        )


# =============================================================================
# AC2 — a multi-repo story verifies EVERY repo's PR
# =============================================================================


class TestMultiRepoVerifiesEveryPr:
    """``repos:`` names two code repos, each with its own PR on the shared
    feature branch. Both sessions below are branch-only, so each repo's PR is
    resolved by probing that repo (see designed-interface note 4).
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_all_repos_merged_finishes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC2, positive half): both PRs are already MERGED, so the
        already-merged short-circuit (155-29) applies per repo and finish
        completes. On HEAD only ONE repo is ever consulted — and from the
        orchestrator root, neither.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_MULTI,
            repos_field="[api, ui]",
            session_body=SESSION_BRANCH_ONLY,
            code_repos={"api": "merged", "ui": "merged"},
        )
        fake, rec = _make_run(
            project,
            {
                "api": PrWorld(pr="11", state="MERGED"),
                "ui": PrWorld(pr="22", state="MERGED"),
            },
        )

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, (
            f"both repos' PRs are MERGED — finish must complete: {result}"
        )
        assert _requested_done(mock_transition), "an all-merged story must go done"
        probed = {_norm(cwd, project) for _argv, cwd in rec.gh_calls()}
        assert probed == {(project / "api").resolve(), (project / "ui").resolve()}, (
            f"every configured repo must be probed, and only those: {probed}"
        )
        assert not rec.argv_with_cwd("gh", "merge"), (
            "already-MERGED PRs must not be re-merged (155-29)"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_one_merged_one_open_aborts_loudly(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC2, the criterion verbatim): ``api``'s PR merged, ``ui``'s PR
        is still open and its merge no-ops (rc 0, stays OPEN — the gh #71
        shape, and also what a review-required guardrail looks like). Finish
        must abort loudly and leave the story ``in_review``: no archive, no
        done transition, no partial completion. On HEAD the single-PR flow
        sees whichever number the session/probe hands it and marks the story
        shipped with half its code unlanded.

        ``repos:`` is the comma-separated string shape here (the other test
        uses the YAML list) — both are in the wild.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_MULTI,
            repos_field='"api,ui"',
            session_body=SESSION_BRANCH_ONLY,
            code_repos={"api": "merged", "ui": "unmerged"},
        )
        fake, _rec = _make_run(
            project,
            {
                "api": PrWorld(pr="11", state="MERGED"),
                "ui": PrWorld(pr="22", state="OPEN", merge_lands=False),
            },
        )

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, mock_transition)
        error = str(result.get("error") or "")
        assert "22" in error, (
            f"the abort must name the PR that has not landed so the operator "
            f"knows which repo to chase: {error!r}"
        )
        assert re.search(r"(?i)merge|land", error), (
            f"the abort must say WHY it refused: {error!r}"
        )


class TestMultiRepoNoPrProbes:
    """AC1 x AC2: the no-PR arm for a multi-repo story. The merge-state probe
    must run in EACH code repo — probing project_root reads ``unknown`` and
    aborts even when every repo's work landed.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_pr_all_repos_merged_finishes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: no PR resolves in either repo, and the branch is fully merged
        into ``develop`` in both. Finish must succeed — the AC1 failure mode
        multiplied by the AC2 fan-out.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_MULTI,
            repos_field="[api, ui]",
            session_body=SESSION_BRANCH_ONLY,
            code_repos={"api": "merged", "ui": "merged"},
        )
        fake, rec = _make_run(project, {"api": PrWorld(pr=None), "ui": PrWorld(pr=None)})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, (
            f"every repo's branch is verifiably merged — finish must complete: {result}"
        )
        assert _requested_done(mock_transition)
        assert not rec.argv_with_cwd("gh", "merge")

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_pr_one_repo_unmerged_aborts(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (the fan-out's teeth): ``api`` landed, ``ui`` still holds
        unmerged commits, and no PR resolves for either. A per-repo probe that
        stops at the first ``merged`` answer would call this done — every repo
        must be verified. Must abort loudly and leave the story ``in_review``.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_MULTI,
            repos_field="[api, ui]",
            session_body=SESSION_BRANCH_ONLY,
            code_repos={"api": "merged", "ui": "unmerged"},
        )
        fake, _rec = _make_run(project, {"api": PrWorld(pr=None), "ui": PrWorld(pr=None)})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, mock_transition)
        assert STORY_BRANCH in str(result.get("error") or ""), (
            f"the abort must name the branch it could not verify: {result.get('error')!r}"
        )


# =============================================================================
# AC4 — no regression for same-root workspaces / orchestrator-owned steps
# =============================================================================


class TestSameRootWorkspaceUnchanged:
    """The common case: one repo, ``path: "."`` — the project root IS the code
    repo. Routing must resolve to the project root (or leave the calls as they
    are); it must not synthesize a sub-path.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_single_root_repo_pr_finish_unchanged(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Green guard: PR world, root repo. Every gh call must land in the
        project root (an omitted cwd is equivalent there) and finish completes
        exactly as before.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_SAME_ROOT,
            repos_field="proj",
            session_body=SESSION_WITH_PR,
            code_repos={},
            root_world="unmerged",
            root_branch="develop",
        )
        fake, rec = _make_run(project, {".": PrWorld(pr="501", state="OPEN")})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, f"the same-root case must not regress: {result}"
        assert all(
            _norm(cwd, project) == project.resolve() for _argv, cwd in rec.gh_calls()
        ), f"a same-root workspace must keep every gh call at the root: {rec.gh_calls()}"
        assert _requested_done(mock_transition)

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_story_without_repos_field_falls_back_to_project_root(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Green guard: a story with an unresolvable ``repos:`` value (an
        operator typo / a repo not in repos.yaml) must degrade to today's
        behavior — the project root — not crash, and not silently skip
        verification. The root repo here holds the branch fully merged, so the
        no-PR arm's accepted world still finishes.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_SAME_ROOT,
            repos_field="no-such-repo",
            session_body=SESSION_BRANCH_ONLY,
            code_repos={},
            root_world="merged",
            root_branch="develop",
        )
        fake, _rec = _make_run(project, {".": PrWorld(pr=None)})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, (
            f"an unresolvable repos value must degrade to the project root: {result}"
        )
        assert _requested_done(mock_transition)


class TestOrchestratorStepsStayAtProjectRoot:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_epic_archive_step_is_not_routed_into_the_code_repo(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Over-reach guard, red until routing lands (on HEAD the run aborts at
        step 2, so step 5 never runs and the precondition fails): step 5 shells
        out to ``pf.cli sprint epic
        archive``, which reads the ORCHESTRATOR's ``sprint/`` tree. Re-routing
        must not sweep it into the code repo, where there is no sprint data —
        the epic archive would silently no-op.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_INLINED,
            repos_field="framework",
            session_body=SESSION_WITH_PR,
            code_repos={"framework": "unmerged"},
        )
        fake, rec = _make_run(project, {"framework": PrWorld(pr="501", state="OPEN")})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            finish_story(project, STORY_ID)

        cli_calls = [
            (argv, cwd) for argv, cwd in rec.calls if argv and argv[0] == sys.executable
        ]
        assert cli_calls, "precondition: step 5 ran the epic-archive CLI"
        assert all(_norm(cwd, project) == project.resolve() for _argv, cwd in cli_calls), (
            f"the epic-archive step must stay at the orchestrator root: {cli_calls}"
        )


class TestGitCleanupRunsInStoryRepo:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_feature_branch_is_deleted_in_the_repo_that_has_it(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (same bug, step 6): the feature branch exists in the CODE repo,
        so cleanup's gitflow decision and its git commands belong there. Today
        cleanup keys off the ``path: "."`` repo — trunk-based here — and skips
        entirely, leaving the merged branch behind in the sub-repo forever;
        in a gitflow-root workspace it would instead run ``git checkout``
        against the wrong repo.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_yaml=REPOS_YAML_INLINED,
            repos_field="framework",
            session_body=SESSION_WITH_PR,
            code_repos={"framework": "merged"},
        )
        fake, rec = _make_run(project, {"framework": PrWorld(pr="501", state="MERGED")})

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, result
        expected = (project / "framework").resolve()
        cleanup = [
            (argv, cwd)
            for argv, cwd in rec.calls
            if argv and argv[0] == "git" and ("checkout" in argv or "branch" in argv)
        ]
        assert cleanup, (
            "step 6 never ran any cleanup git command — the merged feature "
            "branch is stranded in the code repo (cleanup keyed off the "
            "wrong repo's branch_strategy)"
        )
        assert all(_norm(cwd, project) == expected for _argv, cwd in cleanup), (
            f"cleanup ran git outside the repo that owns the branch: {cleanup}"
        )
        deleted = subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", f"refs/heads/{STORY_BRANCH}"],
            cwd=str(project / "framework"),
            capture_output=True,
            text=True,
        )
        assert deleted.returncode != 0, (
            "the merged feature branch must be gone from the code repo after "
            "a successful finish"
        )
