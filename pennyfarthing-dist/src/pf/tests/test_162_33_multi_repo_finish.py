"""Tests for story 162-33: multi-repo finish edge cases (162-6 review M4-M6).

The bugs
--------
M4 — **verification is interleaved with merges.** ``finish_story``'s step-2 loop
walks ``repo_prs`` and, per repo, either merges that repo's PR or (no PR)
verifies its branch. A mixed multi-repo story therefore MERGES repo A and only
THEN discovers repo B has nothing to verify against — an irreversible partial
landing plus a false "refusing to mark done". The 162-6 comment already states
the intent ("Every repo is gated BEFORE any repo is merged"), but only the
*PR-conflict* gate was hoisted; the no-PR/branch verification stayed in the
merge loop.

M5 — **a landed repo is not named when a later merge fails.** When repo B's
``gh pr merge`` fails after repo A's already landed, the result is a blanket
"PR #B merge failed" — the operator is not told that repo A is now shipped, so
recovery (revert, or re-run) has to be reconstructed by hand. A multi-repo
finish cannot be atomic; the least it can do is report what it did.

M6 — **the dry-run preview pairs positionally.** The preview computes
``pr_number = next((rp for ... if rp), None)`` (the FIRST resolved PR) and
``primary_repo_path = repo_prs[0][0]`` (the FIRST repo), then probes one against
the other. For two repos with different PRs, repo B's PR is never previewed at
all; when repo A has no PR, repo B's PR number is probed *in repo A* — the
exact wrong-repo/wrong-number class 162-6 exists to kill, still live in the
preview path. "Finish must not lie" applies to the preview too (155-31).

Deliverable 5 — **the degradation docstring overclaims.**
``_resolve_story_repos``'s docstring says a ``repos:`` value that names nothing
degrades to the project root "so an operator typo cannot silently skip
verification". But a PARTIAL typo (``"framework, tpyo"``) resolves the good name
and drops the bad one silently — no degradation, no error, one repo's
verification skipped. Docstring and behavior must agree; either direction is a
valid fix and the test below accepts both.

Acceptance criteria (story title is the spec; these are the testable ones)
-------------------------------------------------------------------------
- AC-M4: verification for EVERY repo runs before ANY merge. A story where repo
  A is mergeable and repo B is unverifiable merges NOTHING (all-or-nothing) and
  aborts loudly, leaving the story ``in_review``.
- AC-M5: a merge failure AFTER an earlier repo landed reports the landed
  repo(s) by name in the result (not only in the step log).
- AC-M6: the dry-run preview pairs each repo with ITS OWN PR — every previewed
  PR number is probed in the repo that owns it, and no repo's PR is dropped.
- AC-5: the ``_resolve_story_repos`` degradation docstring matches actual
  behavior for stories that omit / mistype ``repos:``.

Deliverables 1 (per-repo PR-field docs) and 6 (epic-level ``repos:``
inheritance) are Dev's docs/decision and deliberately not pinned here beyond a
light documentation presence check.

RED on HEAD — 7 failing, each on the defect itself:
  - TestPreMergeVerificationPrecedesEveryMerge::test_unverifiable_repo_blocks_all_merges
    (``gh pr merge 11`` really runs in ``api/`` before ``ui`` is checked)
  - TestLandedRepoRecovery::test_second_merge_failure_names_the_landed_repo
    (the error is "PR #22 merge failed…" — ``api`` is never mentioned)
  - TestDryRunPairsEachRepoWithItsOwnPr::test_both_repos_prs_are_previewed
    (the plan lists only "Merge PR #11")
  - TestDryRunPairsEachRepoWithItsOwnPr::test_pr_number_is_never_probed_in_another_repo
    (``gh pr view 22`` runs with ``cwd=api/``)
  - TestDegradationDocstringMatchesBehavior::test_partial_typo_claim_is_honest
  - TestPerRepoPrFieldIsDocumented (x2 — deliverable 1's docs do not exist yet;
    a presence check only, the prose is Dev's)
Green-on-arrival guards (must stay green):
  - TestPreMergeVerificationPrecedesEveryMerge::test_all_repos_verifiable_still_merges_every_pr
  - TestDegradationDocstringMatchesBehavior::test_story_without_repos_degrades_to_project_root
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

from pf.sprint.story_finish import _resolve_story_repos, finish_story

STORY_ID = "162-33"

#: Not a branch of the pennyfarthing repo (the runner's own cwd), so a probe
#: that forgets ``cwd`` cannot pass by luck.
STORY_BRANCH = "feat/162-33-multi-repo-session-schema-finish-edgecases"

DIST_ROOT = Path(__file__).resolve().parents[3]

FRONTMATTER = """\
---
story_id: "162-33"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-33: multi-repo finish edge cases
"""

#: Branch-only session: each repo's PR must be resolved per repo. A single
#: ``**PR:**`` line is single-repo-only since 162-6, so multi-repo scenarios
#: cannot use it.
SESSION_BRANCH_ONLY = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 162-33
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
"""
)

INDEX_YAML = """\
sprint:
  name: "Test16233"
  jira_sprint_id: 999
  jira_sprint_name: "Test16233"
  goal: multi-repo finish must be all-or-nothing and must not lie
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
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


def _shard_yaml(repos_field: str) -> str:
    return f"""\
id: "162"
type: epic
title: "Finish & sprint-tooling truthfulness"
priority: p1
status: in_progress
stories:
  - id: 162-33
    title: multi-repo session schema + finish edge cases
    points: 3
    priority: p2
    status: in_review
    workflow: tdd
    repos: {repos_field}
"""


# =============================================================================
# Fixture builders — real git repos, so a mis-routed git probe gets a real "no"
# =============================================================================


def _git(root: Path, *args: str) -> None:
    result = subprocess.run(["git", *args], cwd=str(root), capture_output=True, text=True)
    assert result.returncode == 0, f"fixture git {' '.join(args)} failed: {result.stderr}"


def _init_repo(path: Path, tmp_path: Path, *, default_branch: str, world: str) -> None:
    """Real git repo with a bare origin.

    ``world`` describes ``STORY_BRANCH`` vs ``default_branch``: ``"merged"``,
    ``"unmerged"``, or ``"absent"`` (branch never created here).
    """
    path.mkdir(parents=True, exist_ok=True)
    (path / "README.md").write_text(f"# {path.name}\n", encoding="utf-8")
    _git(path, "init", "-q", "-b", default_branch)
    _git(path, "config", "user.email", "tea@162-33.test")
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
    repos_yaml: str = REPOS_YAML_MULTI,
    repos_field: str,
    session_body: str = SESSION_BRANCH_ONLY,
    code_repos: dict[str, str],
) -> Path:
    """Orchestrator project root (trunk-based ``main``) plus its code sub-repos."""
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

    _init_repo(root, tmp_path, default_branch="main", world="absent")
    for rel, world in code_repos.items():
        if rel in (".", ""):
            continue
        _init_repo(root / rel, tmp_path, default_branch="develop", world=world)
    return root


# =============================================================================
# The fake — gh answers come from the world of the repo the call arrives in
# =============================================================================


@dataclass
class PrWorld:
    """The PR world visible from ONE repo."""

    pr: str | None = None
    state: str = "OPEN"
    #: rc of ``gh pr merge`` (non-zero = GitHub refused the merge).
    merge_rc: int = 0
    merge_stderr: str = ""
    #: True when a zero-rc ``gh pr merge`` actually lands it.
    merge_lands: bool = True
    mergeable: str = "MERGEABLE"
    merge_state_status: str = "CLEAN"


@dataclass
class Recorder:
    calls: list[tuple[list[str], Any]] = field(default_factory=list)

    def argv_with_cwd(self, *needles: str) -> list[tuple[list[str], Any]]:
        return [(argv, cwd) for argv, cwd in self.calls if all(n in argv for n in needles)]

    def gh_calls(self) -> list[tuple[list[str], Any]]:
        return [(argv, cwd) for argv, cwd in self.calls if argv and argv[0] == "gh"]


def _norm(cwd: Any, project_root: Path) -> Path:
    """The repo a call actually lands in; ``cwd=None`` is the orchestrator root."""
    if cwd in (None, ""):
        return project_root.resolve()
    return Path(str(cwd)).resolve()


def _asked_pr(argv: list[str]) -> str | None:
    return next((a for a in argv[3:] if a.isdigit()), None)


def _make_run(project_root: Path, worlds: dict[str, PrWorld]):
    """Dispatching fake for ``story_finish._run``.

    ``gh`` is answered from the world of the repo the call arrives in; a call
    landing anywhere else gets gh's real wrong-repo behavior (non-zero). ``git``
    passes through to the real fixture repos. Step 5's ``pf.cli`` shell-out is
    canned. ``live`` tracks server-side PR state so a landed merge is
    observable — which is how "nothing merged" is asserted.
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
            world = resolved.get(here)
            if world is None:
                return MagicMock(
                    returncode=1,
                    stdout="",
                    stderr="could not resolve to a PullRequest in this repository",
                )
            if "list" in argv:
                return MagicMock(returncode=0, stdout=(world.pr or "") + "\n", stderr="")
            if "view" in argv:
                asked = _asked_pr(argv)
                if world.pr is None or asked != world.pr:
                    return MagicMock(
                        returncode=1, stdout="", stderr=f"no pull request found for {asked}"
                    )
                current = live.get(here, world.state)
                return MagicMock(
                    returncode=0,
                    stdout=json.dumps(
                        {
                            "state": current,
                            "mergedAt": "2026-08-11T00:00:00Z" if current == "MERGED" else None,
                            "mergeable": world.mergeable,
                            "mergeStateStatus": world.merge_state_status,
                            "baseRefName": "develop",
                        }
                    ),
                    stderr="",
                )
            if "merge" in argv:
                asked = _asked_pr(argv)
                if world.pr is None or asked != world.pr:
                    return MagicMock(
                        returncode=1, stdout="", stderr=f"no pull request found for {asked}"
                    )
                if world.merge_rc != 0:
                    return MagicMock(
                        returncode=world.merge_rc,
                        stdout="",
                        stderr=world.merge_stderr or "GraphQL: Pull request is not mergeable",
                    )
                if world.merge_lands:
                    live[here] = "MERGED"
                return MagicMock(returncode=0, stdout="", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        if argv and argv[0] == sys.executable:
            return MagicMock(returncode=0, stdout="", stderr="")

        return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

    return _fake, recorder, live


def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


def _yaml_status(project_root: Path) -> str:
    text = (project_root / "sprint" / "epic-162.yaml").read_text(encoding="utf-8")
    match = re.search(r"status:\s*(\w+)", text.split("id: 162-33", 1)[1])
    return match.group(1) if match else ""


def _assert_abort_invariants(
    result: dict[str, Any],
    project_root: Path,
    mock_transition: MagicMock,
) -> None:
    """The loud-abort contract: nothing irreversible ran, nothing lies."""
    assert result["success"] is False, f"finish reported success on a half-landed story: {result}"
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
        f"an aborted finish must leave the story in_review, got {_yaml_status(project_root)!r}"
    )


# =============================================================================
# AC-M4 — every repo is verified BEFORE any repo is merged
# =============================================================================


class TestPreMergeVerificationPrecedesEveryMerge:
    """``repos: [api, ui]``. ``api`` has a perfectly mergeable PR; ``ui`` has no
    PR and a branch with unmerged commits, i.e. the story is NOT finishable.
    Because a multi-repo finish cannot be atomic, the only safe ordering is
    verify-everything-then-merge: an unfinishable story must merge NOTHING.
    """

    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        return _make_workspace(
            tmp_path,
            repos_field="[api, ui]",
            code_repos={"api": "unmerged", "ui": "unmerged"},
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_unverifiable_repo_blocks_all_merges(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """RED (M4): on HEAD the step-2 loop merges ``api``'s PR #11 and only
        then reaches ``ui``, whose no-PR branch check fails — so the run both
        LANDS code irreversibly and reports a refusal. ``ui``'s unverifiability
        is knowable before any merge, so ``gh pr merge`` must never run.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake, rec, live = _make_run(
            project,
            {"api": PrWorld(pr="11", state="OPEN"), "ui": PrWorld(pr=None)},
        )

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        merges = rec.argv_with_cwd("gh", "merge")
        assert merges == [], (
            "repo 'ui' cannot be verified, so this story is not finishable — yet "
            f"finish irreversibly merged another repo's PR first: {merges}"
        )
        assert live[(project / "api").resolve()] == "OPEN", (
            "api's PR landed during a finish that then refused to mark the story "
            "done — partial landing is exactly the M4 defect"
        )
        _assert_abort_invariants(result, project, mock_transition)
        error = str(result.get("error") or "")
        assert STORY_BRANCH in error or "ui" in error, (
            f"the abort must name what could not be verified: {error!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_all_repos_verifiable_still_merges_every_pr(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Over-reach guard: hoisting verification must not stop merging. Both
        repos have mergeable PRs — both must be merged and the story goes done.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_field="[api, ui]",
            code_repos={"api": "unmerged", "ui": "unmerged"},
        )
        fake, rec, live = _make_run(
            project,
            {"api": PrWorld(pr="11", state="OPEN"), "ui": PrWorld(pr="22", state="OPEN")},
        )

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, f"two mergeable PRs must finish: {result}"
        merged_prs = {_asked_pr(argv) for argv, _cwd in rec.argv_with_cwd("gh", "merge")}
        assert merged_prs == {"11", "22"}, f"every repo's PR must be merged: {merged_prs}"
        assert live[(project / "api").resolve()] == "MERGED"
        assert live[(project / "ui").resolve()] == "MERGED"
        assert _requested_done(mock_transition)


# =============================================================================
# AC-M5 — a merge failure after an earlier repo landed names the landed repo
# =============================================================================


class TestLandedRepoRecovery:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_second_merge_failure_names_the_landed_repo(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (M5): both repos pass every pre-merge gate (both PRs OPEN,
        MERGEABLE/CLEAN), ``api``'s merge LANDS, and then ``ui``'s ``gh pr
        merge`` is refused server-side — the residual non-atomic case that
        hoisting verification cannot remove. The result must NAME ``api`` as
        landed so the operator can revert or re-run; on HEAD it reports only
        "PR #22 merge failed", hiding shipped code.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_workspace(
            tmp_path,
            repos_field="[api, ui]",
            code_repos={"api": "unmerged", "ui": "unmerged"},
        )
        fake, _rec, live = _make_run(
            project,
            {
                "api": PrWorld(pr="11", state="OPEN"),
                "ui": PrWorld(
                    pr="22",
                    state="OPEN",
                    merge_rc=1,
                    merge_stderr="GraphQL: Changes must be approved (mergePullRequest)",
                ),
            },
        )

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert live[(project / "api").resolve()] == "MERGED", (
            "precondition: api's PR really landed before ui's merge was refused"
        )
        _assert_abort_invariants(result, project, mock_transition)

        # The recovery report: the top-level result (not just the step log) must
        # say what already landed. Search every top-level value except `steps`.
        reported = " ".join(
            str(value) for key, value in result.items() if key != "steps"
        )
        assert "api" in reported, (
            "the failure report never names the repo whose PR already LANDED — an "
            "operator reading this cannot tell that half the story shipped: "
            f"{reported!r}"
        )
        assert "22" in reported, (
            f"the failure must still name the PR that did not land: {reported!r}"
        )


# =============================================================================
# AC-M6 — the dry-run preview pairs each repo with its own PR
# =============================================================================


class TestDryRunPairsEachRepoWithItsOwnPr:
    """The preview path must be as repo-aware as the real run (155-31 parity):
    it previews an irreversible merge, so a preview that describes the wrong
    repo's PR — or silently omits one — is finish lying.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_both_repos_prs_are_previewed(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (M6): two repos, two DIFFERENT PR numbers. HEAD previews only the
        first resolved PR (#11) and never mentions #22, so the operator approves
        a plan that hides a second irreversible merge.
        """
        project = _make_workspace(
            tmp_path,
            repos_field="[api, ui]",
            code_repos={"api": "unmerged", "ui": "unmerged"},
        )
        fake, _rec, _live = _make_run(
            project,
            {"api": PrWorld(pr="11", state="OPEN"), "ui": PrWorld(pr="22", state="OPEN")},
        )

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID, dry_run=True)

        assert result["success"] is True, result
        preview = " ".join(str(step) for step in result["steps"])
        assert "11" in preview, f"the preview dropped api's PR: {preview!r}"
        assert "22" in preview, (
            f"the preview dropped ui's PR — a merge the run will actually attempt "
            f"is missing from the plan: {preview!r}"
        )
        assert not _requested_done(mock_transition), "a dry run must change nothing"
        assert list((project / "sprint" / "archive").iterdir()) == []

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_pr_number_is_never_probed_in_another_repo(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (M6, the positional bug's teeth): ``api`` has NO PR and ``ui``
        has PR #22. HEAD takes the first RESOLVED PR (#22) and the first REPO
        (``api``) and probes one against the other — the wrong-repo/wrong-number
        pairing of 162-6, alive in the preview. Every gh probe must ask a PR
        number in the repo that owns it.
        """
        project = _make_workspace(
            tmp_path,
            repos_field="[api, ui]",
            code_repos={"api": "merged", "ui": "unmerged"},
        )
        owners = {"api": PrWorld(pr=None), "ui": PrWorld(pr="22", state="OPEN")}
        fake, rec, _live = _make_run(project, owners)

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            finish_story(project, STORY_ID, dry_run=True)

        by_path = {(project / rel).resolve(): world for rel, world in owners.items()}
        mispaired = [
            (argv, cwd)
            for argv, cwd in rec.gh_calls()
            if _asked_pr(argv) is not None
            and _asked_pr(argv) != (by_path.get(_norm(cwd, project)) or PrWorld()).pr
        ]
        assert rec.gh_calls(), "precondition: the preview made gh calls"
        assert mispaired == [], (
            "the dry-run preview asked about a PR number in a repo that does not "
            f"own it — that number means something else there: {mispaired}"
        )


# =============================================================================
# Deliverable 5 — the degradation docstring must match behavior
# =============================================================================


class TestDegradationDocstringMatchesBehavior:
    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        root = tmp_path / "orc"
        (root / ".pennyfarthing").mkdir(parents=True)
        (root / ".pennyfarthing" / "repos.yaml").write_text(REPOS_YAML_MULTI, encoding="utf-8")
        (root / "api").mkdir()
        (root / "ui").mkdir()
        return root

    def test_story_without_repos_degrades_to_project_root(self, project: Path) -> None:
        """Pin (docstring's stated contract): a story omitting ``repos:``
        resolves to the project root paired with the root repo's config — the
        pre-162-6 behavior. Reconciling the docstring must not change this.
        """
        result = _resolve_story_repos(project, {"id": STORY_ID})

        assert result["success"] is True, result
        paths = [path for path, _config in result["data"]]
        assert paths == [project], f"a story with no repos: must degrade to the root: {paths}"
        configs = [config for _path, config in result["data"]]
        assert configs and getattr(configs[0], "path", None) in (".", ""), (
            f"the degraded pairing must carry the ROOT repo's config: {configs}"
        )
        assert "repos" in (_resolve_story_repos.__doc__ or ""), (
            "the docstring must still document the degradation contract"
        )

    def test_partial_typo_claim_is_honest(self, project: Path) -> None:
        """RED (deliverable 5): the docstring justifies degradation with "so an
        operator typo cannot silently skip verification", but a PARTIAL typo
        (``"api, tpyo"``) resolves ``api``, drops ``tpyo``, and returns success
        — one repo's verification silently skipped, no degradation, no error.
        Either the behavior must become loud or the claim must go; this accepts
        whichever direction Dev chooses.
        """
        doc = _resolve_story_repos.__doc__ or ""
        result = _resolve_story_repos(project, {"id": STORY_ID, "repos": "api, tpyo"})

        silently_dropped = bool(result.get("success")) and [
            path for path, _config in result.get("data", [])
        ] == [(project / "api").resolve()]

        if silently_dropped:
            assert "typo cannot silently skip verification" not in doc, (
                "a partial typo IS silently dropped ('api, tpyo' resolves only "
                "'api'), so the docstring's claim that an operator typo cannot "
                "silently skip verification is false — reconcile the docstring "
                "with the behavior, or make the unknown name loud"
            )
        else:
            assert "tpyo" in str(result.get("error") or ""), (
                "if unknown names are no longer dropped, the result must name the "
                f"one it refused: {result}"
            )


# =============================================================================
# Deliverable 1 — advisory: per-repo PR syntax is documented
# =============================================================================


class TestPerRepoPrFieldIsDocumented:
    """Light presence check (Dev owns the prose). A single ``**PR:**`` line is
    single-repo-only since 162-6; multi-repo sessions need a per-repo syntax,
    and ``finish_story`` reads whatever the schema promises.
    """

    @pytest.mark.parametrize(
        "rel_path",
        ["schemas/session-schema.md", "agents/sm-setup.md"],
    )
    def test_doc_mentions_per_repo_pr(self, rel_path: str) -> None:
        text = (DIST_ROOT / rel_path).read_text(encoding="utf-8")
        assert re.search(r"(?is)pr.{0,80}per[- ]repo|per[- ]repo.{0,80}pr", text), (
            f"{rel_path} does not document the per-repo PR field syntax, so a "
            "multi-repo session has no way to record a PR per repo"
        )
