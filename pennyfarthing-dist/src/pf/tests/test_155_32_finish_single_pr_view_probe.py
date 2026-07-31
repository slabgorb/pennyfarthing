"""Tests for story 155-32: consolidate the back-to-back ``gh pr view`` probes in
the pre-merge path of ``finish_story`` into one shared call (from the 155-29
review).

The waste (why this story exists)
---------------------------------
In auto merge mode with a PR present, ``finish_story`` shells out to
``gh pr view`` twice in a row, for the same PR, microseconds apart:

- ``_pr_block_reason(pr)`` — ``--json mergeable,mergeStateStatus,baseRefName``
  (the 155-12 pre-merge conflict gate)
- ``_pr_is_merged(pr)`` — ``--json state`` (the 155-29 already-merged
  short-circuit pre-check)

Two round trips to the GitHub API to answer two questions about one snapshot
of one PR. One call over the union of the fields answers both.

Acceptance criteria (from ``context-story-155-32.md`` — authoritative)
----------------------------------------------------------------------
- AC-1: auto mode + PR present issues exactly ONE ``gh pr view`` pre-merge.
- AC-2: blocking unchanged — CONFLICTING/DIRTY still aborts before any
  irreversible step, with the same actionable rebase message.
- AC-3: short-circuit unchanged — a MERGED PR still skips ``gh pr merge`` and
  records ``already_merged: True``.
- AC-4: failure semantics preserved — a non-zero ``gh`` exit or unparseable
  JSON must yield BOTH "do not block" AND "not merged", so the flow falls
  through to the real merge attempt. An unverifiable PR state must never
  silently skip the merge.
- AC-5: the POST-merge verification stays a fresh, separate ``gh pr view``.
- AC-6: human merge mode still issues no pre-merge probe.

The trap this suite is built around (AC-5)
------------------------------------------
The cheapest way to make a call-count assertion go green is to memoize the PR
view for the whole of ``finish_story`` — one fetch, three readers. That also
silently destroys the gh #71/#60 guarantee: the post-merge verification would
re-read the PRE-merge snapshot (``state: OPEN``) and either wedge every clean
finish or, with the memo warmed differently, report a merge that never landed
as done. ``test_clean_path_issues_one_view_on_each_side_of_the_merge`` is the
discriminator: HEAD issues 3 views (RED), the correct fix issues 2, and a
whole-function memo issues 1 (also fails). Only the intended shape passes.

Tests bind to OBSERVABLE behavior — the command sequence through
``story_finish._run`` and the ``finish_story`` result — never to the name or
signature of whatever helper Dev introduces. The consolidation shape (struct,
optional-snapshot parameter, small fetch helper) is deliberately unconstrained.

RED on HEAD (fail for the right reason):
  - ``TestSinglePreMergeProbe`` — the pre-merge window issues 2 views today.
  - ``TestNonDictProbePayloadDoesNotCrashFinish`` — a pre-existing crash in the
    very parse being consolidated: valid-JSON-but-not-an-object payloads raise
    an uncaught ``AttributeError`` out of ``finish_story``. See that class's
    docstring for the scope rationale (logged as a Design Deviation).

Green-on-arrival guards (over-reach protection — must stay green):
  - ``TestPostMergeVerificationStaysFresh`` — AC-5, the anti-memo guard.
  - ``TestBlockingBehaviorPreserved`` — AC-2.
  - ``TestShortCircuitRecordPreserved`` — AC-3.
  - ``TestUnverifiableStateFallsThrough`` — AC-4 (lang-review python #1).
  - ``TestHumanModeIssuesNoProbe`` — AC-6, the anti-hoist guard.
  - ``TestModuleRuleCompliance`` — lang-review python #3.

Harness mirrors ``test_155_29_finish_short_circuit_merged_pr.py``: a
command-dispatching fake for ``story_finish._run`` plus patched
``transition_story`` / ``_add_story_to_completed``.
"""

import ast
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Fixtures — minimal sprint/.session project (mirrors test_155_29)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test15532"
  jira_sprint_id: 999
  jira_sprint_name: "Test15532"
  goal: Test single pre-merge PR probe
  start_date: 2026-07-01
  end_date: 2026-07-14
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
  - id: 155-32
    title: consolidate the back-to-back gh pr view probes into one shared call
    points: 1
    priority: p1
    status: in_review
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "155-32"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-32: consolidate the pre-merge gh pr view probes

## Story Details
- **ID:** 155-32
- **Workflow:** tdd
- **Branch:** feat/155-32-consolidate-pr-view-probes
- **PR:** #999 - consolidate pre-merge PR probes
"""


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "155-32-session.md").write_text(SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Fakes
# =============================================================================

BASE_BRANCH = "develop"


def _view_result(
    *,
    state: str = "OPEN",
    mergeable: str | None = "MERGEABLE",
    merge_state_status: str | None = "CLEAN",
) -> MagicMock:
    """A ``gh pr view`` response carrying the union of the fields both probes
    read. The real ``gh`` only returns the fields named in ``--json``; the fake
    returns them all, so a consolidated call and either of today's narrow calls
    are both satisfied by the same payload.
    """
    return MagicMock(
        returncode=0,
        stdout=json.dumps(
            {
                "state": state,
                "mergedAt": "2026-07-31T00:00:00Z" if state == "MERGED" else None,
                "mergeable": mergeable,
                "mergeStateStatus": merge_state_status,
                "baseRefName": BASE_BRANCH,
            }
        ),
        stderr="",
    )


def _make_stateful_run(
    *,
    merge_rc: int = 0,
    merge_lands: bool = True,
) -> Callable[..., MagicMock]:
    """Honest clean-path world: the PR is OPEN/MERGEABLE and becomes MERGED
    only after a successful ``gh pr merge``.

    This statefulness is what makes AC-5 testable at all. A stateless
    always-MERGED fake cannot tell a fresh post-merge probe from a replayed
    pre-merge snapshot, because both would read MERGED.

    ``merge_lands=False`` simulates gh #71/#60 — ``gh pr merge`` exits 0 while
    the PR silently stays OPEN.
    """
    state = {"merged": False}

    def _fake_run(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            if merge_rc == 0 and merge_lands:
                state["merged"] = True
            return MagicMock(
                returncode=merge_rc,
                stdout="",
                stderr="" if merge_rc == 0 else "merge failed: pull request is not mergeable",
            )
        if "view" in parts:
            return _view_result(state="MERGED" if state["merged"] else "OPEN")
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_static_run(
    *,
    state: str = "OPEN",
    mergeable: str | None = "MERGEABLE",
    merge_state_status: str | None = "CLEAN",
    merge_rc: int = 0,
) -> Callable[..., MagicMock]:
    """World whose PR state never changes — for the paths that abort or
    short-circuit before any state transition matters.
    """

    def _fake_run(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            return MagicMock(
                returncode=merge_rc,
                stdout="",
                stderr=""
                if merge_rc == 0
                else "GraphQL: Pull request #999 is already merged (mergePullRequest)",
            )
        if "view" in parts:
            return _view_result(
                state=state, mergeable=mergeable, merge_state_status=merge_state_status
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_broken_probe_run(*, stdout: str = "", returncode: int = 1) -> Callable[..., MagicMock]:
    """World where ``gh pr view`` cannot establish the PR state — a non-zero
    exit, or a zero exit with a payload that will not parse into the expected
    shape. ``gh pr merge`` succeeds so the fall-through is observable.
    """

    def _fake_run(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(
                returncode=returncode,
                stdout=stdout,
                stderr="could not resolve to a PullRequest" if returncode else "",
            )
        if "merge" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


# =============================================================================
# Call-sequence introspection
#
# The subprocess argv is the only contract these tests bind to. `gh pr view`,
# `gh pr merge`, `gh pr list` and the `git checkout/pull/branch` cleanup calls
# share no tokens, so token membership identifies each unambiguously.
# =============================================================================


def _argvs(fake: MagicMock) -> list[list[str]]:
    return [[str(x) for x in call.args[0]] for call in fake.call_args_list]


def _view_calls_before_merge(fake: MagicMock) -> list[list[str]]:
    """``gh pr view`` invocations issued before the first ``gh pr merge``.

    When no merge is attempted (short-circuit / blocked paths) every view in
    the run is a pre-merge probe, which is exactly the window AC-1 bounds.
    """
    out: list[list[str]] = []
    for argv in _argvs(fake):
        if "merge" in argv:
            break
        if "view" in argv:
            out.append(argv)
    return out


def _view_calls_after_merge(fake: MagicMock) -> list[list[str]]:
    """``gh pr view`` invocations issued after the first ``gh pr merge``."""
    out: list[list[str]] = []
    seen_merge = False
    for argv in _argvs(fake):
        if "merge" in argv:
            seen_merge = True
            continue
        if seen_merge and "view" in argv:
            out.append(argv)
    return out


def _merge_invoked(fake: MagicMock) -> bool:
    return any("merge" in argv for argv in _argvs(fake))


def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


def _step2_entries(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        s for s in result.get("steps", []) if s.get("step") == 2 and s.get("action") == "merge_pr"
    ]


def _describe(calls: list[list[str]]) -> str:
    return " | ".join(" ".join(argv) for argv in calls) or "(none)"


# =============================================================================
# AC-1 — one pre-merge probe (GENUINELY RED: HEAD issues two)
# =============================================================================


class TestSinglePreMergeProbe:
    """The pre-merge window — everything before ``gh pr merge`` — must contain
    exactly one ``gh pr view``. Today it contains two: the conflict gate's and
    the already-merged pre-check's, back to back on the same PR.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_open_pr_issues_one_pre_merge_view(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-1, clean path: an OPEN/MERGEABLE PR is asked about once before
        the merge, not twice.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(side_effect=_make_stateful_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        pre = _view_calls_before_merge(fake)
        assert len(pre) == 1, (
            f"expected exactly 1 pre-merge `gh pr view`, got {len(pre)}: {_describe(pre)} "
            "— the conflict gate and the already-merged pre-check must share one call (AC-1)"
        )
        assert result["success"] is True, f"the clean path must still complete: {result}"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_already_merged_pr_issues_one_view_total(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-1, retry path: an already-MERGED PR short-circuits the merge, so
        every probe in the run is pre-merge. One call must answer both "is it
        conflicting?" and "is it already merged?".

        ``mergeable=UNKNOWN`` is the real shape here — GitHub stops computing
        mergeability once a PR merges.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="UNKNOWN",
                merge_state_status="UNKNOWN",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert not _merge_invoked(fake), (
            "precondition broken: an already-MERGED PR must still short-circuit "
            "the merge (155-29) — this test measures the probes on that path"
        )
        pre = _view_calls_before_merge(fake)
        assert len(pre) == 1, (
            f"expected exactly 1 `gh pr view` on the already-merged path, got "
            f"{len(pre)}: {_describe(pre)} (AC-1)"
        )
        assert result["success"] is True, f"the already-merged retry must complete: {result}"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_path_issues_one_view_on_each_side_of_the_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-1 + AC-5 together — the discriminating test.

        A clean auto-mode finish must issue exactly two ``gh pr view`` calls:
        one shared pre-merge probe, and one fresh post-merge verification.

        - HEAD issues 3 (conflict gate, merged pre-check, post-merge verify).
        - The intended fix issues 2.
        - A whole-function memo — the cheap way to satisfy a naive call
          count — issues 1, and fails here. That shape must fail: replaying
          the pre-merge snapshot after the merge is precisely the gh #71/#60
          hole this epic exists to close.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(side_effect=_make_stateful_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        pre = _view_calls_before_merge(fake)
        post = _view_calls_after_merge(fake)
        assert len(pre) == 1, (
            f"expected 1 pre-merge `gh pr view`, got {len(pre)}: {_describe(pre)} (AC-1)"
        )
        assert len(post) == 1, (
            f"expected 1 post-merge `gh pr view`, got {len(post)}: {_describe(post)} — "
            "the post-merge verification must be its own fresh probe, never a "
            "replay of the pre-merge snapshot (AC-5)"
        )
        assert result["success"] is True, f"the clean path must still complete: {result}"


# =============================================================================
# AC-5 — the post-merge verification stays fresh (anti-memo guard)
# =============================================================================


class TestPostMergeVerificationStaysFresh:
    """155-1 made the merge load-bearing: finish only marks a story done after
    ``gh pr view`` confirms MERGED. That confirmation must observe the world
    AFTER the merge. Consolidating the pre-merge probes must not tempt a shared
    snapshot into the post-merge check.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_post_merge_probe_observes_the_landed_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """The PR reads OPEN before the merge and MERGED after. Finish must
        complete — which it can only do by re-reading the state. An
        implementation that answers the post-merge question from the pre-merge
        snapshot sees OPEN and wedges every clean finish.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        session_path = project / ".session" / "155-32-session.md"
        fake = MagicMock(side_effect=_make_stateful_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert _view_calls_after_merge(fake), (
            "no `gh pr view` was issued after `gh pr merge` — the post-merge "
            "verification must be a fresh probe (AC-5, gh #71/#60)"
        )
        assert result["success"] is True, (
            "a merge that genuinely landed must finish; a stale pre-merge "
            f"snapshot would report it as un-landed: {result}"
        )
        assert _requested_done(mock_transition), "a landed merge must transition the story to done"
        assert not session_path.exists(), "a completed finish must remove the session"

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_silent_no_op_merge_still_aborts(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """gh #71/#60 itself: ``gh pr merge`` exits 0 while the PR silently
        stays OPEN. The post-merge probe must catch that and abort loud —
        no done transition, no session removal, no archive left behind.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-32-session.md"
        archive_dir = project / "sprint" / "archive"
        fake = MagicMock(side_effect=_make_stateful_run(merge_lands=False))
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert result["success"] is False, f"a merge that never landed must abort finish: {result}"
        assert not _requested_done(mock_transition), (
            "finish marked a story done whose code never reached the base branch"
        )
        assert session_path.exists(), "session removed despite an un-landed merge"
        assert not list(archive_dir.iterdir()), (
            f"stray archive written for an un-landed merge (155-15): "
            f"{[p.name for p in archive_dir.iterdir()]}"
        )


# =============================================================================
# AC-2 — the conflict gate still blocks, before anything irreversible
# =============================================================================


class TestBlockingBehaviorPreserved:
    """A definitively non-mergeable PR aborts finish ahead of the merge AND
    ahead of the archive, with an actionable message naming the base branch
    (155-12 / gh #113).
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_conflicting_pr_still_aborts_with_rebase_message(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """``mergeable: CONFLICTING`` blocks. The message must still name the
        base branch, which means the consolidated ``--json`` field list must
        still request ``baseRefName`` — dropping it degrades the guidance to a
        generic "the base branch" and the operator loses the rebase target.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-32-session.md"
        archive_dir = project / "sprint" / "archive"
        fake = MagicMock(
            side_effect=_make_static_run(mergeable="CONFLICTING", merge_state_status="DIRTY")
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert result["success"] is False, f"a CONFLICTING PR must abort finish: {result}"
        error = str(result.get("error", ""))
        assert "CONFLICTING" in error, f"abort message must name the conflict: {error!r}"
        assert BASE_BRANCH in error, (
            f"abort message must name the base branch to rebase on — "
            f"`baseRefName` must survive the consolidation: {error!r}"
        )
        assert not _merge_invoked(fake), "a CONFLICTING PR must never reach `gh pr merge`"
        assert session_path.exists(), "session removed despite a blocked finish"
        assert not list(archive_dir.iterdir()), (
            "blocked finish must leave no archive behind (gh #113 / 155-15)"
        )
        assert not _requested_done(mock_transition), "blocked finish must not mark the story done"

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_dirty_merge_state_status_still_blocks(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """``mergeStateStatus: DIRTY`` blocks on its own, even when
        ``mergeable`` reads MERGEABLE — both fields are independently
        load-bearing and both must survive into the shared call.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        fake = MagicMock(
            side_effect=_make_static_run(mergeable="MERGEABLE", merge_state_status="DIRTY")
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert result["success"] is False, (
            f"a DIRTY mergeStateStatus must abort finish on its own: {result}"
        )
        assert not _merge_invoked(fake), "a DIRTY PR must never reach `gh pr merge`"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_unknown_mergeability_does_not_block(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Indeterminate mergeability (GitHub still computing) must NOT block —
        it falls through to the merge, guarded by the post-merge verification.
        Only a *definitively* conflicting PR is hard-blocked (155-12).
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        state = {"merged": False}

        def _unknown_then_merged(cmd: list[Any], **kwargs: Any) -> MagicMock:
            parts = [str(c) for c in cmd]
            if "merge" in parts:
                state["merged"] = True
                return MagicMock(returncode=0, stdout="", stderr="")
            if "view" in parts:
                return _view_result(
                    state="MERGED" if state["merged"] else "OPEN",
                    mergeable="UNKNOWN",
                    merge_state_status="UNKNOWN",
                )
            return MagicMock(returncode=0, stdout="", stderr="")

        fake = MagicMock(side_effect=_unknown_then_merged)
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert _merge_invoked(fake), (
            "UNKNOWN mergeability must fall through to the merge attempt, not block"
        )
        assert result["success"] is True, f"an UNKNOWN-then-merged PR must finish: {result}"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_null_mergeability_fields_do_not_block(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """A payload whose mergeability fields are JSON ``null`` must not be
        read as a conflict. Today ``str(data.get("mergeable", "")).upper()``
        yields ``"NONE"`` — harmless. A consolidated parse that switches to
        strict typing or truthiness checks could turn absent data into a hard
        block, refusing to finish perfectly mergeable PRs.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        state = {"merged": False}

        def _null_fields(cmd: list[Any], **kwargs: Any) -> MagicMock:
            parts = [str(c) for c in cmd]
            if "merge" in parts:
                state["merged"] = True
                return MagicMock(returncode=0, stdout="", stderr="")
            if "view" in parts:
                return _view_result(
                    state="MERGED" if state["merged"] else "OPEN",
                    mergeable=None,
                    merge_state_status=None,
                )
            return MagicMock(returncode=0, stdout="", stderr="")

        fake = MagicMock(side_effect=_null_fields)
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert _merge_invoked(fake), "null mergeability fields must not block the merge"
        assert result["success"] is True, (
            f"absent mergeability data must not fail an otherwise clean finish: {result}"
        )


# =============================================================================
# AC-3 — the already-merged short-circuit record stays truthful
# =============================================================================


class TestShortCircuitRecordPreserved:
    """155-29/155-30 contract: the step-2 entry for an already-merged PR
    reports ``merged`` and ``already_merged``, and never ``skipped``.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_short_circuits_and_records_truthfully(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="UNKNOWN",
                merge_state_status="UNKNOWN",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert not _merge_invoked(fake), (
            "an already-MERGED PR must not be re-merged — gh exits non-zero on "
            "a merged PR and wedges every retry (155-29)"
        )
        assert result["success"] is True, f"the already-merged retry must complete: {result}"
        entries = _step2_entries(result)
        assert entries, f"no step-2 merge_pr entry: {result.get('steps')}"
        entry = entries[0]
        assert entry.get("pr") == "999", f"step-2 entry must name the PR: {entry!r}"
        assert entry.get("merged") is True, (
            f"step-2 entry must record merged=True for a landed merge: {entry!r}"
        )
        assert entry.get("already_merged") is True, (
            f"step-2 entry must record already_merged=True: {entry!r}"
        )
        assert not entry.get("skipped"), (
            f"'skipped' is the no-PR wording — a merged PR is not skipped: {entry!r}"
        )


# =============================================================================
# AC-4 — an unverifiable PR state falls through (lang-review python #1)
# =============================================================================


class TestUnverifiableStateFallsThrough:
    """A probe that cannot establish the PR state must resolve to BOTH "do not
    block" and "not merged". Either answer alone is a hole: "block" refuses
    finishes over a transient gh hiccup; "merged" silently skips the
    load-bearing merge and finishes a story whose code never landed.

    One shared call means one shared failure path — these pin that the
    permissive-but-not-credulous semantics survive consolidation.
    """

    @pytest.mark.parametrize(
        "label,kwargs",
        [
            ("non-zero exit", {"returncode": 1, "stdout": ""}),
            ("unparseable payload", {"returncode": 0, "stdout": "not json{{"}),
            ("empty payload", {"returncode": 0, "stdout": ""}),
            ("empty json object", {"returncode": 0, "stdout": "{}"}),
        ],
    )
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_broken_probe_falls_through_to_merge_then_aborts_loud(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project: Path,
        label: str,
        kwargs: dict[str, Any],
    ) -> None:
        """Each malformed response must (a) not block, (b) not short-circuit,
        (c) not raise — and then, since the post-merge verification is equally
        unable to confirm MERGED, finish must abort loud with the session and
        archive untouched.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-32-session.md"
        archive_dir = project / "sprint" / "archive"
        fake = MagicMock(side_effect=_make_broken_probe_run(**kwargs))
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert _merge_invoked(fake), (
            f"[{label}] an unverifiable PR state must fall through to the real "
            "merge attempt — never block, never short-circuit as if merged (AC-4)"
        )
        assert result["success"] is False, (
            f"[{label}] an unconfirmable merge must abort finish: {result}"
        )
        assert not _requested_done(mock_transition), (
            f"[{label}] finish marked a story done it could not verify"
        )
        assert session_path.exists(), f"[{label}] session removed despite an unverifiable PR"
        assert not list(archive_dir.iterdir()), (
            f"[{label}] stray archive written for an unverifiable finish"
        )


class TestNonDictProbePayloadDoesNotCrashFinish:
    """RED — a pre-existing crash, in the exact parse this story consolidates.

    Both probes do ``json.loads(stdout).get(...)`` under a guard that catches
    only ``(json.JSONDecodeError, ValueError)``. Any payload that is VALID JSON
    but not an object — ``null``, ``[]``, ``"str"``, a bare number — parses
    fine and then raises ``AttributeError`` on ``.get``, which nothing catches.
    ``finish_story`` propagates a traceback instead of returning the
    ``{success, error}`` result object it contracts for (CLAUDE.md rule #6),
    and the operator gets a stack trace where this epic promises a truthful,
    actionable abort.

    Verified on HEAD — ``_pr_is_merged`` and ``_pr_block_reason`` both raise
    for ``null`` / ``[]`` / ``"str"`` (``{}`` is fine: it is a dict).

    Scope note: AC-4 names "unparseable JSON", and these payloads do parse, so
    this sits just outside the AC as literally worded but squarely inside its
    intent — an unverifiable PR state must abort loud, not explode. It is
    included because the consolidation rewrites this parse into ONE shared
    place: fixing it costs an ``isinstance(data, dict)`` guard now, whereas
    skipping it copies the crash forward into the shared helper. Logged as a
    Design Deviation and a Delivery Finding.
    """

    @pytest.mark.parametrize(
        "label,stdout",
        [
            ("json null", "null"),
            ("json array", "[]"),
            ("json string", '"MERGED"'),
            ("json number", "42"),
        ],
    )
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_non_dict_payload_aborts_cleanly_instead_of_raising(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project: Path,
        label: str,
        stdout: str,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-32-session.md"
        fake = MagicMock(side_effect=_make_broken_probe_run(returncode=0, stdout=stdout))

        try:
            with patch("pf.sprint.story_finish._run", fake):
                result = finish_story(project, "155-32")
        except Exception as exc:  # noqa: BLE001 - the defect under test
            pytest.fail(
                f"[{label}] finish_story raised {type(exc).__name__}: {exc} — a "
                "valid-JSON non-object probe payload must abort through the "
                "result object, never propagate an exception (CLAUDE.md rule #6)"
            )

        assert result["success"] is False, (
            f"[{label}] an unverifiable PR state must abort finish: {result}"
        )
        assert not _requested_done(mock_transition), (
            f"[{label}] finish marked a story done it could not verify"
        )
        assert session_path.exists(), f"[{label}] session removed despite an unverifiable PR"


# =============================================================================
# AC-6 — human merge mode probes nothing (anti-hoist guard)
# =============================================================================


class TestHumanModeIssuesNoProbe:
    """Human merge mode never auto-merges, so it needs no mergeability answer
    and no merged answer. It issues zero ``gh pr view`` calls today.

    The natural way to "consolidate" is to hoist one fetch to the top of the
    PR handling — which would start probing in human mode, adding an API round
    trip to every human-mode finish and putting the conflict gate's blocking
    behavior on a path that is explicitly meant to be non-load-bearing.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="human")
    def test_human_mode_issues_no_pr_view_and_no_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(side_effect=_make_static_run(state="OPEN"))
        with patch("pf.sprint.story_finish._run", fake):
            finish_story(project, "155-32")

        views = [argv for argv in _argvs(fake) if "view" in argv]
        assert views == [], (
            f"human merge mode must issue no `gh pr view` at all, got: {_describe(views)} "
            "— the shared probe must stay inside the auto-mode branch (AC-6)"
        )
        assert not _merge_invoked(fake), "human merge mode must never auto-merge"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="human")
    def test_human_mode_conflicting_pr_is_not_blocked(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """A CONFLICTING PR in human mode must not trip the auto-mode conflict
        gate — the human is the one merging, and finish leaves the story for
        them. A hoisted probe that also hoists the block would break this.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(mergeable="CONFLICTING", merge_state_status="DIRTY")
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-32")

        assert result["success"] is True, (
            "human merge mode must not hard-block on mergeability — the "
            f"conflict gate belongs to the auto-merge path only: {result}"
        )
        entries = _step2_entries(result)
        assert entries, f"no step-2 merge_pr entry: {result.get('steps')}"
        assert entries[0].get("mode") == "human", (
            f"step-2 entry must record human mode: {entries[0]!r}"
        )


# =============================================================================
# lang-review python #3 — type annotations at module boundaries
# =============================================================================


class TestModuleRuleCompliance:
    """Green on HEAD; pinned so the consolidation's new helper arrives
    annotated. Checked structurally (AST over the module source) rather than
    by name, so it applies to whatever Dev introduces without constraining the
    refactor's shape.
    """

    def test_all_module_level_functions_are_fully_annotated(self) -> None:
        import pf.sprint.story_finish as mod

        source = Path(mod.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)
        missing: list[str] = []
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if node.returns is None:
                missing.append(f"{node.name}() -> missing return annotation")
            args = node.args
            for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs]:
                if arg.annotation is None:
                    missing.append(f"{node.name}({arg.arg}) -> missing parameter annotation")

        assert missing == [], (
            "story_finish module-level functions must be fully annotated "
            f"(lang-review python #3): {missing}"
        )
