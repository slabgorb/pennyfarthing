"""Tests for story 155-35: the already-merged short-circuit must win over the
conflict gate when the two disagree (from the 155-32 review).

The bug (why this story exists)
-------------------------------
In auto merge mode ``finish_story`` takes ONE pre-merge ``gh pr view`` snapshot
(155-32) and asks it two questions — but in the wrong order:

1. ``_pr_block_reason``: ``mergeable == CONFLICTING`` / ``mergeStateStatus ==
   DIRTY`` → hard-abort with rebase advice (the 155-12 conflict gate).
2. Only then ``_view_is_merged``: ``state == MERGED`` → short-circuit the merge
   (the 155-29 retry path).

``_pr_block_reason`` never consults ``state``. GitHub serves stale mergeability
on freshly-merged PRs (it stops recomputing once a PR lands, and cached
CONFLICTING/DIRTY readings linger), so the exact retry world 155-29 exists for
— a prior finish landed the merge, then aborted on a later step — dies in the
conflict gate with "rebase on develop and resolve the conflicts": un-actionable
advice about a PR that is already in the base branch. The dry-run preview
already answers merged-first (155-31), so today the preview promises "already
merged — will skip merge" while the real run aborts: live preview/reality
drift that the fix also resolves.

Acceptance criteria (AC record — context file defers ACs to TEA, 155-13
precedent; refines the session's AC-1..AC-4)
----------------------------------------------------------------------
- AC-1: auto mode, ``state=MERGED`` with stale ``mergeable=CONFLICTING``
  and/or ``mergeStateStatus=DIRTY`` → finish completes via the 155-29
  short-circuit (truthful step-2 record: ``merged``/``already_merged``, never
  ``skipped``), whichever stale field (or both) the snapshot carries.
- AC-2: that world never invokes ``gh pr merge`` and never emits the
  conflict-gate abort (no rebase advice anywhere in the result).
- AC-3: the conflict gate is NOT weakened — a genuinely OPEN
  CONFLICTING/DIRTY PR still hard-aborts before any irreversible step with
  the actionable rebase message.
- AC-4: unverifiable probe unchanged — ``gh pr view`` failure reads as
  neither merged nor blocked and falls through to the real merge attempt
  (unknown ≠ merged: no false-done hole; lang-review python #1).
- AC-5: probe economy preserved — still exactly ONE shared pre-merge probe
  (155-32), the post-merge verification stays a fresh separate probe, and
  human mode stays probe-free.

Fix-shape freedom
-----------------
Tests bind to observable behavior only — the ``_run`` command sequence and the
``finish_story`` result. They pass whether Dev reorders the checks in
``finish_story`` (merged-check before ``_pr_block_reason``) or teaches
``_pr_block_reason`` itself that ``state == MERGED`` is never blockable. The
session-field parsing path (155-40 authority parser) is exercised implicitly:
every test resolves branch + PR #999 from the fixture session's Story Details.

RED on HEAD (fail on assertions, for the right reason — the conflict gate
aborts the run before the short-circuit is consulted):
  - ``TestMergedWinsOverStaleMergeability`` (AC-1, AC-2) — all four tests.

Green-on-arrival guards (over-reach protection — must stay green; logged as
intentional-green Design Deviations):
  - ``TestConflictGateNotWeakened`` (AC-3)
  - ``TestUnverifiableProbeStillFallsThrough`` (AC-4)
  - ``TestProbeEconomyPreserved`` (AC-5)

Harness mirrors ``test_155_32_finish_single_pr_view_probe.py`` verbatim: a
command-dispatching fake for ``story_finish._run`` plus patched
``transition_story`` / ``_add_story_to_completed``.
"""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Fixtures — minimal sprint/.session project (mirrors test_155_32)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test15535"
  jira_sprint_id: 999
  jira_sprint_name: "Test15535"
  goal: Test merged-wins-over-stale-conflict ordering
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
  - id: 155-35
    title: finish evaluates the conflict gate before the already-merged short-circuit
    points: 1
    priority: p1
    status: in_review
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "155-35"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-35: merged short-circuit must win over the conflict gate

## Story Details
- **ID:** 155-35
- **Workflow:** tdd
- **Branch:** feat/155-35-finish-conflict-gate-order
- **PR:** #999 - merged short-circuit ordering
"""


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "155-35-session.md").write_text(SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Fakes (mirror test_155_32)
# =============================================================================

BASE_BRANCH = "develop"


def _view_result(
    *,
    state: str = "OPEN",
    mergeable: str | None = "MERGEABLE",
    merge_state_status: str | None = "CLEAN",
) -> MagicMock:
    """A ``gh pr view`` response carrying the union of the fields both readers
    consume, so the shared 155-32 probe and any narrower probe are equally
    satisfied.
    """
    return MagicMock(
        returncode=0,
        stdout=json.dumps(
            {
                "state": state,
                "mergedAt": "2026-08-01T00:00:00Z" if state == "MERGED" else None,
                "mergeable": mergeable,
                "mergeStateStatus": merge_state_status,
                "baseRefName": BASE_BRANCH,
            }
        ),
        stderr="",
    )


def _make_static_run(
    *,
    state: str = "OPEN",
    mergeable: str | None = "MERGEABLE",
    merge_state_status: str | None = "CLEAN",
    merge_rc: int = 0,
) -> Callable[..., MagicMock]:
    """World whose PR state never changes.

    The story's own world is ``state="MERGED"`` with stale
    ``CONFLICTING``/``DIRTY`` mergeability — GitHub's cached answer on a PR
    that already landed. ``merge_rc=1`` with the realistic "already merged"
    stderr models what ``gh pr merge`` would do if the flow (wrongly) reached
    it.
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


def _make_stateful_run(
    *,
    merge_rc: int = 0,
    merge_lands: bool = True,
) -> Callable[..., MagicMock]:
    """Honest clean-path world: OPEN/MERGEABLE, becomes MERGED only after a
    successful ``gh pr merge`` (the 155-29 stateful shape — keeps the real
    merge path observable so the short-circuit cannot over-apply).
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


def _make_broken_probe_run() -> Callable[..., MagicMock]:
    """World where ``gh pr view`` cannot establish the PR state; ``gh pr
    merge`` succeeds so the fall-through is observable.
    """

    def _fake_run(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(
                returncode=1,
                stdout="",
                stderr="could not resolve to a PullRequest",
            )
        if "merge" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


# =============================================================================
# Call-sequence introspection (mirror test_155_32)
# =============================================================================


def _argvs(fake: MagicMock) -> list[list[str]]:
    return [[str(x) for x in call.args[0]] for call in fake.call_args_list]


def _view_calls(fake: MagicMock) -> list[list[str]]:
    return [argv for argv in _argvs(fake) if "view" in argv]


def _view_calls_before_merge(fake: MagicMock) -> list[list[str]]:
    out: list[list[str]] = []
    for argv in _argvs(fake):
        if "merge" in argv:
            break
        if "view" in argv:
            out.append(argv)
    return out


def _view_calls_after_merge(fake: MagicMock) -> list[list[str]]:
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


def _step2_entries(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        s for s in result.get("steps", []) if s.get("step") == 2 and s.get("action") == "merge_pr"
    ]


def _describe(calls: list[list[str]]) -> str:
    return " | ".join(" ".join(argv) for argv in calls) or "(none)"


def _all_error_text(result: dict[str, Any]) -> str:
    """Every error/message string in the result, flattened — the surface the
    un-actionable rebase advice would appear on.
    """
    chunks = [str(result.get("error", ""))]
    for step in result.get("steps", []):
        chunks.append(str(step.get("error", "")))
        chunks.append(str(step.get("message", "")))
    return " ".join(chunks)


# =============================================================================
# AC-1 / AC-2 — MERGED wins over stale mergeability (GENUINELY RED on HEAD:
# the conflict gate reads the snapshot first and aborts)
# =============================================================================


class TestMergedWinsOverStaleMergeability:
    """The retry world 155-29 exists for, with GitHub's stale mergeability
    cache still saying CONFLICTING/DIRTY. ``state == MERGED`` is the ground
    truth — the PR landed; nothing about its mergeability is actionable.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_with_stale_dirty_snapshot_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-1, the incident world: MERGED + CONFLICTING + DIRTY must finish
        via the short-circuit with the truthful 155-29/155-30 step record.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="DIRTY",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert result["success"] is True, (
            "a MERGED PR with stale DIRTY mergeability must finish via the "
            f"already-merged short-circuit, not abort in the conflict gate: {result}"
        )
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

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_with_stale_dirty_snapshot_never_attempts_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-2: no ``gh pr merge`` (re-merging a merged PR exits non-zero and
        would wedge the retry — 155-29) and no rebase advice anywhere in the
        result (the abort message is the bug's user-visible symptom; pinned
        separately from the success flag so either mutation is caught on its
        own).
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="DIRTY",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert not _merge_invoked(fake), (
            "finish attempted `gh pr merge` on an already-MERGED PR — the "
            "short-circuit must be consulted before any merge attempt"
        )
        error_text = _all_error_text(result)
        assert "CONFLICTING" not in error_text and "rebase" not in error_text, (
            "finish emitted conflict-gate abort advice for a PR that already "
            f"landed — un-actionable by definition: {error_text!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_stale_conflicting_mergeable_alone_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-1 variant: ``mergeable=CONFLICTING`` alone (state status CLEAN).
        Kills a fix keyed only on ``mergeStateStatus``.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="CLEAN",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert result["success"] is True, (
            f"MERGED must beat a stale mergeable=CONFLICTING reading: {result}"
        )
        assert not _merge_invoked(fake), "an already-MERGED PR must not be re-merged"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_stale_dirty_status_alone_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-1 variant: ``mergeStateStatus=DIRTY`` alone (mergeable
        MERGEABLE). Kills a fix keyed only on ``mergeable``.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="MERGEABLE",
                merge_state_status="DIRTY",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert result["success"] is True, (
            f"MERGED must beat a stale mergeStateStatus=DIRTY reading: {result}"
        )
        assert not _merge_invoked(fake), "an already-MERGED PR must not be re-merged"


# =============================================================================
# AC-3 — the conflict gate is not weakened (green-on-arrival guards)
# =============================================================================


class TestConflictGateNotWeakened:
    """The 155-12 contract survives the reorder: a genuinely OPEN
    CONFLICTING/DIRTY PR still hard-aborts, actionably, before any
    irreversible step.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_open_conflicting_pr_still_aborts_with_actionable_message(
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
                state="OPEN", mergeable="CONFLICTING", merge_state_status="DIRTY"
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert result["success"] is False, f"an OPEN CONFLICTING PR must abort finish: {result}"
        error = str(result.get("error", ""))
        assert "CONFLICTING" in error, f"abort must name the conflict: {error!r}"
        assert "rebase" in error, f"abort must carry the actionable rebase advice: {error!r}"
        assert not _merge_invoked(fake), "a CONFLICTING PR must never reach `gh pr merge`"
        assert (project / ".session" / "155-35-session.md").exists(), (
            "aborted finish must keep the session file"
        )
        assert not (project / "sprint" / "archive" / "155-35-session.md").exists(), (
            "aborted finish must not leave a stray archived session copy (155-12/155-15)"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_open_dirty_status_alone_still_blocks(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """``mergeStateStatus=DIRTY`` alone still blocks an OPEN PR (the
        155-32 OR-contract) — the state check must scope to MERGED, not
        weaken either mergeability field.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="OPEN", mergeable="MERGEABLE", merge_state_status="DIRTY"
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert result["success"] is False, (
            f"a DIRTY mergeStateStatus must still abort an OPEN PR on its own: {result}"
        )
        assert not _merge_invoked(fake), "a DIRTY OPEN PR must never reach `gh pr merge`"


# =============================================================================
# AC-4 — unverifiable probe still falls through (green-on-arrival guard)
# =============================================================================


class TestUnverifiableProbeStillFallsThrough:
    """lang-review python #1: unknown ≠ merged and unknown ≠ blocked. A broken
    probe must fall through to the real merge attempt — a reorder that reads
    probe-error as "merged" would open a silent false-done hole; one that
    reads it as "blocked" would wedge every finish behind a gh hiccup.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_unreadable_probe_still_falls_through_to_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(side_effect=_make_broken_probe_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert _merge_invoked(fake), (
            "an unreadable PR state must fall through to the real merge "
            "attempt — it is neither a block nor a short-circuit"
        )
        assert result["success"] is False, (
            "with the probe permanently broken the post-merge verification "
            f"cannot confirm MERGED — the 155-1 backstop must abort loud: {result}"
        )


# =============================================================================
# AC-5 — probe economy preserved (green-on-arrival guards)
# =============================================================================


class TestProbeEconomyPreserved:
    """The reorder must not undo 155-32: one shared pre-merge probe, a fresh
    post-merge probe, and zero probes in human mode.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_stale_dirty_world_uses_single_shared_probe(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Green on HEAD (the aborting run also probes once) — pins that the
        fix answers merged-or-conflicting from the ONE shared snapshot rather
        than adding a second ``gh pr view``.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="DIRTY",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            finish_story(project, "155-35")

        views = _view_calls(fake)
        assert len(views) == 1, (
            f"expected exactly 1 `gh pr view` in the stale-merged world, got "
            f"{len(views)}: {_describe(views)} — both pre-merge questions share "
            "one probe (155-32)"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_open_pr_still_merges_with_fresh_post_merge_probe(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """The genuinely-open clean path is untouched: one pre-merge probe,
        a real merge, one fresh post-merge verification probe (the 155-32
        anti-memo discriminator), success.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(side_effect=_make_stateful_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        assert _merge_invoked(fake), "a genuinely OPEN PR must still be merged"
        assert result["success"] is True, f"the clean path must still complete: {result}"
        pre = _view_calls_before_merge(fake)
        post = _view_calls_after_merge(fake)
        assert len(pre) == 1, (
            f"expected exactly 1 pre-merge `gh pr view`, got {len(pre)}: {_describe(pre)}"
        )
        assert len(post) == 1, (
            f"expected exactly 1 fresh post-merge `gh pr view`, got "
            f"{len(post)}: {_describe(post)} — the post-merge verification must "
            "observe the world the merge produced, not the pre-merge snapshot"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="human")
    def test_human_mode_merged_stale_dirty_issues_no_probe(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Human mode needs neither pre-merge answer, in this story's stale
        world as in any other — the merged-first check must live inside the
        auto branch, not hoisted above the mode split (155-32 AC-6).
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(
            side_effect=_make_static_run(
                state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="DIRTY",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-35")

        views = _view_calls(fake)
        assert views == [], (
            f"human merge mode must issue no `gh pr view` at all, got: {_describe(views)}"
        )
        assert not _merge_invoked(fake), "human merge mode must never auto-merge"
        assert result["success"] is True, (
            f"human mode leaves the PR to the human and must not hard-block: {result}"
        )
        entries = _step2_entries(result)
        assert entries, f"no step-2 merge_pr entry: {result.get('steps')}"
        assert entries[0].get("mode") == "human", (
            f"step-2 entry must record human mode: {entries[0]!r}"
        )
