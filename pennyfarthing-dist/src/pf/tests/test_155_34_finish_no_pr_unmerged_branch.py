"""Tests for story 155-34: finish must not mark a story done when no PR
resolves but the branch has unmerged commits.

The hole (155-1 guarantee covers only the resolved-PR path)
-----------------------------------------------------------
``finish_story``'s Step 2 has exactly one unguarded arm left: when neither
the session nor ``gh pr list --head`` resolves a PR, it appends
``{"action": "merge_pr", "skipped": True}`` and proceeds through archive,
done-transition, and session removal. 155-1 made the merge load-bearing when
a PR EXISTS; 155-15 moved the archive behind the verified merge; 155-29/31/32
hardened retries and previews — but a story whose branch holds real unmerged
commits still goes ``done`` the moment PR resolution comes up empty. After
155-40, a placeholder/empty ``Branch``/``PR`` value in Story Details blocks
later-section fallback (security-correct), so the placeholder-plus-hand-
written-recovery session resolves NOTHING and glides straight into this arm.

Acceptance criteria (AC-1 from the story YAML; AC-2..AC-4 defined by TEA —
the sprint context delegates refinement to TEA, so this docstring is the AC
record, per the 155-13 precedent)
---------------------------------------------------------------------------
- AC-1 (story YAML, from the 155-40 review): the placeholder-shape
  no-resolution world — a placeholder or empty ``Branch``/``PR`` value in
  Story Details blocks later-section fallback, so the placeholder-plus-hand-
  written-recovery session resolves nothing — must fire the loud abort
  instead of the accepted no-PR done path.
- AC-2 (title): a resolvable branch with commits not merged into the gitflow
  base, and no resolvable PR, aborts finish loudly BEFORE any irreversible
  step: ``success False``, actionable error naming the branch, session kept,
  no archive copy, no done transition, no ``gh pr merge`` attempted, and no
  lying ``skipped`` step record.
- AC-3 (rule #1, unknown is not merged): a branch named by the session but
  absent from the repo (and its origin) cannot be verified — abort loudly,
  never silently done. Same for a ``gh pr list`` probe error: an unanswered
  PR question over an unmerged branch is not permission to skip the merge.
- AC-4 (preservation, 155-1): the accepted no-PR done path SURVIVES for the
  worlds that are actually verifiable as clean: a sentinel ``Branch: none``
  (an agent's affirmative no-branch record) and a branch fully merged into
  the base. The abort must not over-reach into those.

Designed interface for Dev (tests pin behavior, not mechanism)
--------------------------------------------------------------
Route any new git probe through ``story_finish._run`` with an explicit
``cwd=str(project_root)`` — every sibling suite in the finish family fakes
``_run`` for hermeticity, and these tests pass git through to a REAL
throwaway repo whose state answers whatever probe shape you choose
(``rev-list --count base..branch``, ``merge-base --is-ancestor``,
``cherry``, ``branch --no-merged`` all agree here). The fixture branch name
deliberately does not exist in the pennyfarthing repo: a probe that forgets
``cwd`` interrogates the test-runner's repo and fails one of the
paired tests (abort-world or merged-world) whichever way its error path
leans. Base branch: the fixture's ``.pennyfarthing/repos.yaml`` declares the
root repo gitflow with ``default_branch: develop`` and a live ``origin``
remote, so config-driven, hardcoded-``develop``, and ``origin/develop``
resolutions all agree. To distinguish the sentinel world (accepted) from the
placeholder/empty world (abort), read the RAW session field —
``_extract_branch`` collapses both to ``None``; the sentinel set is
``_BRANCH_SENTINELS``, and the PR placeholder's parenthetical strips to
empty under the ``_extract_branch`` annotation rule.

Deliberately unpinned (Delivery Findings, not tests): sessions lacking the
Branch/PR keys entirely (pre-155-33 legacy shape) — Dev's call; dry-run
preview parity for the new abort (155-31 family / 155-39's scope); the
multi-repo probe-target question (155-18's scope).

RED on HEAD (fail on assertions, right reasons):
  - TestNoPrUnmergedBranchAborts (2): unmerged branch + empty PR resolution
    (gh answers empty / gh errors) currently marks done.
  - TestResolvesNothingAborts (1): AC-1's placeholder-plus-recovery shape
    currently marks done.
  - TestMissingBranchRefAborts (1): unverifiable branch currently marks done.
Green-on-arrival guards (intentional — see session Design Deviations):
  - TestAcceptedNoPrWorldsPreserved (2): sentinel and fully-merged worlds.
  - TestModuleConventions (1): all subprocess calls stay inside ``_run``.
"""

import ast
import re
import subprocess
import sys
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pf.sprint.story_finish as story_finish_module
from pf.sprint.story_finish import finish_story

STORY_ID = "155-34"

#: Deliberately NOT a branch that exists in the pennyfarthing repo (the test
#: runner's cwd) — see the designed-interface note on cwd forcing.
STORY_BRANCH = "feat/155-34-story-branch"

#: A branch the session names but the fixture repo never creates.
GHOST_BRANCH = "feat/155-34-ghost-branch"

#: The literal sm-setup template placeholder (agents/sm-setup.md).
PR_PLACEHOLDER = "(none yet — recorded when the PR is created)"

INDEX_YAML = """\
sprint:
  name: "Test15534"
  jira_sprint_id: 999
  jira_sprint_name: "Test15534"
  goal: No-PR finishes must verify the branch actually landed
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "155"
stories: []
standalone_stories: []
"""

SHARD_YAML = """\
id: "155"
type: epic
title: "Finish/merge/archive truthfulness"
priority: p1
status: in_progress
stories:
  - id: 155-34
    title: finish must not mark done when no PR resolves but branch unmerged
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

#: Root repo is gitflow on develop so config-driven base resolution, a
#: hardcoded "develop", and origin/develop all agree in this fixture.
REPOS_YAML = """\
repos:
  proj:
    path: "."
    type: framework
    default_branch: develop
    branch_strategy: gitflow
"""

FRONTMATTER = """\
---
story_id: "155-34"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-34: finish no-PR unmerged-branch guard fixture
"""

#: AC-2 shape: real branch from setup, PR still the template placeholder, and
#: the hand-written recovery field below is BLOCKED by Story Details authority
#: (155-40) — so no PR resolves even though one is named in prose position.
SESSION_PLACEHOLDER_WITH_RECOVERY = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 155-34
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
- **PR:** {PR_PLACEHOLDER}

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Dev Assessment

**PR:** #288 - hand-written recovery (must stay blocked by Story Details authority)
"""
)

#: AC-1 shape: BOTH merge-target fields present-but-empty/placeholder in Story
#: Details, real values hand-written below — post-155-40 this session resolves
#: nothing at all.
SESSION_RESOLVES_NOTHING = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 155-34
- **Workflow:** tdd
- **Branch:**
- **PR:** {PR_PLACEHOLDER}

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Dev Assessment

**Branch:** {STORY_BRANCH} (pushed)
**PR:** #288 - hand-written recovery (must stay blocked by Story Details authority)
"""
)

#: AC-3 shape: the session names a branch the repo does not have.
SESSION_GHOST_BRANCH = (
    FRONTMATTER
    + f"""
## Story Details
- **ID:** 155-34
- **Workflow:** tdd
- **Branch:** {GHOST_BRANCH}
- **PR:** {PR_PLACEHOLDER}
"""
)

#: AC-4 shape: an agent AFFIRMED there is no branch/PR (sentinel, 155-33) —
#: the accepted no-PR done path must survive for this world.
SESSION_SENTINEL = (
    FRONTMATTER
    + """
## Story Details
- **ID:** 155-34
- **Workflow:** tdd
- **Branch:** none
- **PR:** none
"""
)


def _git(root: Path, *args: str) -> None:
    """Run git in the fixture repo, loudly."""
    result = subprocess.run(
        ["git", *args], cwd=str(root), capture_output=True, text=True
    )
    assert result.returncode == 0, (
        f"fixture git {' '.join(args)} failed: {result.stderr}"
    )


def _make_git_project(tmp_path: Path, session_body: str, *, world: str) -> Path:
    """Build a project layout that is also a REAL git repo.

    ``world`` selects the story branch's relationship to develop:
      - ``"unmerged"``: branch exists with one commit develop lacks.
      - ``"merged"``: branch exists, fully merged into develop.
      - ``"absent"``: branch never created.

    A bare ``origin`` remote carries develop (and the branch when it exists)
    so probes against ``origin/develop`` or ``origin/<branch>`` resolve too.
    Local config pins gpgsign/hooksPath so the host's git identity setup
    cannot leak into the fixture.
    """
    root = tmp_path / "proj"
    root.mkdir()
    sprint_dir = root / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML, encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = root / ".session"
    session_dir.mkdir()
    (session_dir / f"{STORY_ID}-session.md").write_text(session_body, encoding="utf-8")
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "repos.yaml").write_text(REPOS_YAML, encoding="utf-8")

    _git(root, "init", "-q", "-b", "develop")
    _git(root, "config", "user.email", "tea@155-34.test")
    _git(root, "config", "user.name", "TEA fixture")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "config", "core.hooksPath", str(root / ".git" / "hooks"))
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "init develop")

    origin = tmp_path / "origin.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", str(origin)],
        capture_output=True,
        text=True,
        check=True,
    )
    _git(root, "remote", "add", "origin", str(origin))
    _git(root, "push", "-q", "origin", "develop")

    if world != "absent":
        _git(root, "checkout", "-q", "-b", STORY_BRANCH)
        (root / "work.txt").write_text("story work\n", encoding="utf-8")
        _git(root, "add", "work.txt")
        _git(root, "commit", "-q", "-m", "story work commit")
        _git(root, "push", "-q", "origin", STORY_BRANCH)
        _git(root, "checkout", "-q", "develop")
        if world == "merged":
            _git(root, "merge", "-q", "--no-ff", STORY_BRANCH, "-m", "land story work")
            _git(root, "push", "-q", "origin", "develop")

    return root


def _make_dispatching_run(*, gh_list_rc: int = 0, gh_list_stdout: str = ""):
    """Fake ``story_finish._run``: gh and the step-5 CLI are canned; everything
    else (git — including whatever probe Dev adds) passes through to the REAL
    subprocess so the fixture repo's true state answers it. ``**kwargs`` is
    forwarded, so a probe's ``cwd=`` is honored — and a probe that omits it
    runs against the test runner's repo, where the fixture branch does not
    exist (the cwd-forcing pair in the designed-interface note).
    """
    seen: dict[str, list[list[str]]] = {"argv": [], "gh_merge": []}

    def _fake(cmd: list[Any], **kwargs: Any) -> Any:
        parts = [str(c) for c in cmd]
        seen["argv"].append(parts)
        if parts[0] == "gh":
            if "merge" in parts:
                seen["gh_merge"].append(parts)
                return MagicMock(returncode=0, stdout="", stderr="")
            if "list" in parts:
                return MagicMock(
                    returncode=gh_list_rc,
                    stdout=gh_list_stdout,
                    stderr="" if gh_list_rc == 0 else "gh: connection refused",
                )
            if "view" in parts:
                return MagicMock(returncode=1, stdout="", stderr="no such pr")
            return MagicMock(returncode=0, stdout="", stderr="")
        if parts[0] == sys.executable:
            # Step 5 (pf.cli sprint epic archive) — never run the real CLI.
            return MagicMock(returncode=0, stdout="", stderr="")
        return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

    return _fake, seen


def _requested_done(mock_transition: MagicMock) -> bool:
    """True if transition_story was ever asked to move the story to done."""
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


def _assert_abort_invariants(
    result: dict[str, Any],
    project: Path,
    seen: dict[str, list[list[str]]],
    mock_transition: MagicMock,
) -> None:
    """The full loud-abort contract shared by every abort world."""
    assert result["success"] is False, (
        f"finish marked the story done in a no-PR world it cannot verify — "
        f"the exact false-done this story exists to kill: {result}"
    )
    assert (project / ".session" / f"{STORY_ID}-session.md").exists(), (
        "an aborted finish must keep the session file so the finish can be "
        "retried after the operator resolves the branch/PR state"
    )
    assert not (project / "sprint" / "archive" / f"{STORY_ID}-session.md").exists(), (
        "an aborted finish left a stray archive copy — the 155-15 no-stray-"
        "archive guarantee must extend to this abort"
    )
    assert not _requested_done(mock_transition), (
        "finish asked transition_story for done despite aborting — the "
        "result and the sprint YAML would disagree about reality"
    )
    assert not seen["gh_merge"], (
        f"finish attempted gh pr merge with no resolved PR: {seen['gh_merge']}"
    )
    steps = result.get("steps", [])
    assert not any(
        s.get("action") == "merge_pr" and s.get("skipped") is True and not s.get("error")
        for s in steps
    ), (
        f"the abort's step record still carries the silent no-PR "
        f"'skipped' wording — a lying report is this epic's own bug class: {steps}"
    )


# =============================================================================
# AC-2 — unmerged branch + no resolvable PR must abort loudly
# =============================================================================


class TestNoPrUnmergedBranchAborts:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_unmerged_branch_no_pr_aborts_loudly(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED: the story branch holds a commit develop lacks; the PR field is
        the template placeholder (authority blocks the hand-written recovery,
        155-40) and ``gh pr list`` answers empty. Today Step 2 records
        ``skipped`` and finish marks the story done — code that never landed
        is reported shipped.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_git_project(
            tmp_path, SESSION_PLACEHOLDER_WITH_RECOVERY, world="unmerged"
        )
        fake, seen = _make_dispatching_run(gh_list_stdout="")

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, seen, mock_transition)
        err = result.get("error", "")
        assert STORY_BRANCH in err, (
            f"the abort message must name the unverified branch so the "
            f"operator knows what to resolve: {err!r}"
        )
        assert re.search(r"(?i)unmerged|commit", err), (
            f"the abort message must say WHY: unmerged commits exist: {err!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_gh_list_error_with_unmerged_branch_still_aborts(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-3, rule #1): ``gh pr list`` fails outright (offline / auth)
        over the same unmerged branch. An UNANSWERED PR question is not
        permission to skip the merge — today the rc!=0 probe quietly leaves
        pr_number None and the story goes done.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_git_project(
            tmp_path, SESSION_PLACEHOLDER_WITH_RECOVERY, world="unmerged"
        )
        fake, seen = _make_dispatching_run(gh_list_rc=1)

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, seen, mock_transition)


# =============================================================================
# AC-1 — the placeholder-shape no-resolution world must abort, not glide
# =============================================================================


class TestResolvesNothingAborts:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_placeholder_and_empty_fields_resolving_nothing_abort(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-1, the story-YAML criterion): Story Details carries an
        EMPTY Branch and the placeholder PR; the real values are hand-written
        in a later section, which 155-40's authority correctly refuses to
        read. The session resolves nothing — and the repo genuinely holds
        unmerged story work. Today finish takes the accepted no-PR arm and
        marks done. It must abort loudly: present-but-unrecorded merge-target
        fields mean "cannot verify", never "nothing to merge".
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_git_project(tmp_path, SESSION_RESOLVES_NOTHING, world="unmerged")
        fake, seen = _make_dispatching_run()

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, seen, mock_transition)
        err = result.get("error", "")
        assert re.search(r"(?i)resolv|placeholder|record|branch", err), (
            f"the abort message must point at the unresolvable session "
            f"fields so the operator knows to record Branch/PR: {err!r}"
        )


# =============================================================================
# AC-3 — a branch the repo cannot verify must abort, not silently done
# =============================================================================


class TestMissingBranchRefAborts:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_session_branch_missing_from_repo_aborts(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-3): the session names a branch that exists neither locally
        nor on origin. Unknown is not merged (rule #1): finish cannot verify
        the work landed, so it must abort with an actionable message — not
        mark done on a branch it cannot see. (TEA contract call, logged as a
        Design Deviation: the truthful wedge — operator affirms the state,
        e.g. sets ``Branch: none`` or records the PR — beats a silent
        false-done.)
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_git_project(tmp_path, SESSION_GHOST_BRANCH, world="absent")
        fake, seen = _make_dispatching_run()

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        _assert_abort_invariants(result, project, seen, mock_transition)
        err = result.get("error", "")
        assert GHOST_BRANCH in err, (
            f"the abort message must name the branch it could not verify: {err!r}"
        )


# =============================================================================
# AC-4 — the accepted no-PR done path survives for verifiable-clean worlds
# =============================================================================


class TestAcceptedNoPrWorldsPreserved:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_fully_merged_branch_no_pr_still_finishes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Green guard (over-reach + cwd forcing): the branch is fully merged
        into develop (and origin agrees), no PR resolves. This is the
        verifiable-clean world the 155-1 product decision accepted — the new
        guard must let it finish. A probe that forgets ``cwd=project_root``
        interrogates the test runner's repo, cannot find this branch, and
        fails here (or in the abort worlds) whichever way its error path
        leans.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_git_project(
            tmp_path, SESSION_PLACEHOLDER_WITH_RECOVERY, world="merged"
        )
        fake, seen = _make_dispatching_run()
        session_path = project / ".session" / f"{STORY_ID}-session.md"

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, (
            f"the unmerged-branch guard over-reached: a fully-merged branch "
            f"with no PR is the accepted 155-1 world and must finish: {result}"
        )
        assert _requested_done(mock_transition), (
            "fully-merged no-PR finish should still transition to done"
        )
        assert (project / "sprint" / "archive" / f"{STORY_ID}-session.md").exists(), (
            "clean no-PR finish must still archive the session"
        )
        assert not session_path.exists(), (
            "clean no-PR finish must still remove the .session file"
        )
        assert not seen["gh_merge"], (
            "no PR resolved — nothing should have been merged"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_sentinel_branch_no_pr_still_finishes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Green guard (sentinel contract, 155-33): ``Branch: none`` is an
        agent's AFFIRMATIVE no-branch record — distinguishable from the
        placeholder/empty "unrecorded" shapes by its RAW field value. The
        accepted no-PR done path must survive for it; there is nothing to
        probe and nothing unverified.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_git_project(tmp_path, SESSION_SENTINEL, world="absent")
        fake, seen = _make_dispatching_run()

        with patch("pf.sprint.story_finish._run", side_effect=fake):
            result = finish_story(project, STORY_ID)

        assert result["success"] is True, (
            f"the guard over-reached into the sentinel world: an affirmed "
            f"no-branch story must keep finishing (155-1/155-33): {result}"
        )
        assert _requested_done(mock_transition), (
            "sentinel no-PR finish should still transition to done"
        )


# =============================================================================
# Module convention — hermeticity of the finish family's test seam
# =============================================================================


class TestModuleConventions:
    def test_no_direct_subprocess_outside_run(self) -> None:
        """Green guard: every subprocess call in story_finish routes through
        ``_run``. Every sibling suite in the finish family patches ``_run``
        as THE hermetic seam; a probe that shells out directly would escape
        those fakes and hit the real gh/git from inside two dozen test
        worlds. (Convention pin for the fix, same spirit as 155-40's
        encoding pin.)
        """
        source = Path(story_finish_module.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)
        offenders: list[str] = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef):
                continue
            for call in ast.walk(node):
                if not isinstance(call, ast.Call):
                    continue
                func = call.func
                if (
                    isinstance(func, ast.Attribute)
                    and func.attr in {"run", "check_output", "check_call", "Popen"}
                    and isinstance(func.value, ast.Name)
                    and func.value.id == "subprocess"
                    and node.name != "_run"
                ):
                    offenders.append(f"{node.name}:{call.lineno}")
        assert offenders == [], (
            f"direct subprocess calls outside _run break the finish family's "
            f"hermetic test seam: {offenders}"
        )
