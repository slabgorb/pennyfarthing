"""Tests for story 162-3: ``_view_is_merged`` must compare the gh PR ``state``
STRICTLY against "MERGED" — no case-fold (finding from the 155-32 review).

The bug
-------
``_view_is_merged`` reads the merged-ness of a PR off a ``gh pr view`` snapshot
and on HEAD it case-folds first::

    return str(view.get("state", "")).upper() == "MERGED"

gh's contract is uppercase enum values; nothing in this codebase or in gh emits
a lowercase ``state``. The ``.upper()`` therefore buys nothing and silently
WIDENS the one boolean that, since 162-1, authorises four separate decisions:

  1. the dry-run step-2 preview ("already merged — will skip merge"),
  2. the conflict-gate exemption inside ``_pr_block_reason`` (a merged PR is
     never hard-blocked on stale CONFLICTING/DIRTY mergeability),
  3. the already-merged short-circuit that skips ``gh pr merge`` and carries
     the story into the ``done`` ceremony,
  4. the post-merge re-verification (``_pr_is_merged``) that is the last thing
     standing between a no-op merge and a story marked shipped (gh #71 / #60).

A predicate that authorises all four must not accept inputs its producer cannot
emit. Any value other than the canonical "MERGED" is a snapshot finish does not
understand, and an ununderstood snapshot must read as NOT merged — which is the
permissive-in-the-safe-direction answer everywhere the predicate is consulted:
it previews the merge, it lets the conflict gate speak, it attempts the real
merge, and it refuses the ``done`` transition.

Producer sweep (why REVERT and not PIN)
---------------------------------------
Searched every ``state`` producer that can reach this predicate: the real
``gh pr view --json state,...`` (uppercase enum), and every fake in the finish
suites (155-1/12/15/29/31/32/33/40, 160-3, 162-1, 162-2) — all uppercase
"MERGED"/"OPEN"/"CLOSED". No test on HEAD asserts that a lowercase state IS
accepted, so no existing test pins the case-fold. The lone lowercase "merged"
literal in story_finish.py is ``_branch_merge_status``'s own return vocabulary,
a different namespace that never flows into ``_view_is_merged``. Verdict:
revert to strict, per the SM direction. No design deviation.

Acceptance criteria (from the session file — authoritative)
-----------------------------------------------------------
- AC-1: lowercase/mixed-case ``state`` values are NOT treated as MERGED
  anywhere the predicate is consulted.
- AC-2: uppercase "MERGED" behaviour is unchanged at all decision sites.
- AC-3: sibling finish suites stay green.

Designed interface (for Dev — tests bind to behaviour, not to a mechanism)
--------------------------------------------------------------------------
Drop the case-fold in ``_view_is_merged``: compare the raw ``state`` value to
"MERGED" exactly. Do NOT add compensating leniency elsewhere (no ``.strip()``,
no alias set, no "starts with MERGE"). The ``view is None`` → False guard and
the missing-key → False behaviour must survive untouched: those are the
"unknown reads as not merged" contract the four call sites already lean on.

Out of scope, filed as a finding: ``_pr_block_reason`` also case-folds
``mergeable`` and ``mergeStateStatus`` (lines ~314-315). Those two feed a
BLOCKING predicate, so removing their case-fold loosens a safety gate rather
than tightening an authorisation — the opposite risk profile, and a separate
decision. This file only guards that the canonical uppercase values still
block (``TestConflictGateStillBlocksCanonicalMergeability``).

RED tests (fail on HEAD, for the right reason — the case-fold accepting
lowercase):
  - ``TestViewIsMergedRejectsNonCanonicalState``
  - ``TestConflictGateExemptionRequiresCanonicalMerged``
  - ``TestShortCircuitRequiresCanonicalMerged``
  - ``TestPostMergeVerificationRequiresCanonicalMerged``
  - ``TestDryRunPreviewRequiresCanonicalMerged``

Green-on-arrival guards (over-reach protection — must stay green before and
after):
  - the ``MERGED``/unknown halves of every class above
  - ``TestConflictGateStillBlocksCanonicalMergeability``

Harness mirrors ``test_162_1_finish_merged_before_conflict_gate.py`` (command
dispatching fake for ``story_finish._run`` + patched ``transition_story`` /
``_add_story_to_completed``), with ``state`` promoted to a per-phase knob so a
pre-merge and a post-merge snapshot can disagree.
"""

import json
import re
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import (
    _pr_block_reason,
    _pr_is_merged,
    _view_is_merged,
    finish_story,
)

# =============================================================================
# The inputs under test
# =============================================================================

#: Every non-canonical spelling of "merged" that HEAD's ``.upper()`` accepts.
#: Each one is a value no producer emits, so each one is a snapshot finish
#: cannot vouch for. Parametrized rather than looped so a partial fix (e.g.
#: special-casing only the all-lowercase form) reports which spelling leaked.
NON_CANONICAL_MERGED = [
    pytest.param("merged", id="lowercase"),
    pytest.param("Merged", id="titlecase"),
    pytest.param("MeRgEd", id="mixedcase"),
    pytest.param("mERGED", id="inverted"),
    # 162-18/R1: a .strip() mutant on _view_is_merged would accept these —
    # pin that whitespace-padded spellings are refused by the state comparison.
    # Tests supply a non-null mergedAt so the timestamp cannot mask a broken
    # state check; the state comparison is the only thing under test.
    pytest.param(" MERGED", id="leading-whitespace"),
    pytest.param("MERGED ", id="trailing-whitespace"),
]

#: Values that must read as NOT merged both before and after the fix — the
#: control group that proves a RED failure comes from the case-fold and not
#: from the predicate collapsing to a constant.
ALREADY_NOT_MERGED = [
    pytest.param("OPEN", id="open"),
    pytest.param("CLOSED", id="closed"),
    pytest.param("", id="empty"),
    pytest.param("MERGE", id="prefix-only"),
    pytest.param("MERGEDX", id="superstring"),
]

# =============================================================================
# Fixtures — minimal sprint/.session project
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test1623"
  jira_sprint_id: 999
  jira_sprint_name: "Test1623"
  goal: Test strict PR-state comparison in the finish flow
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""

SHARD_YAML = """\
id: "162"
type: epic
title: "Finish flow gate ordering"
priority: p1
status: in_progress
stories:
  - id: 162-3
    title: view_is_merged compares PR state strictly
    points: 1
    priority: p1
    status: in_review
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "162-3"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-3: view_is_merged compares PR state strictly

## Story Details
- **ID:** 162-3
- **Workflow:** tdd
- **Branch:** feat/162-3-view-is-merged-case-fold
- **PR:** #999 - strict state comparison
"""


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-162.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "162-3-session.md").write_text(SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Fakes — ``state`` varies per phase (pre-merge vs post-merge snapshot)
# =============================================================================


def _view_payload(
    *,
    state: str,
    mergedat: str | None = "2026-08-04T00:00:00Z",
    mergeable: str,
    merge_state_status: str,
    base_ref: str = "develop",
) -> str:
    """Build a ``gh pr view`` JSON payload.

    ``mergedat`` is explicit rather than derived from ``state`` — derivation
    via case-fold makes every non-canonical state yield a null timestamp, which
    means the state comparison is no longer the thing under test (162-18/R1).
    Default is a non-null timestamp so callers that vary only ``state`` test
    only the state comparison.
    """
    return json.dumps(
        {
            "state": state,
            "mergedAt": mergedat,
            "mergeable": mergeable,
            "mergeStateStatus": merge_state_status,
            "baseRefName": base_ref,
        }
    )


def _make_run(
    *,
    pre_merge_state: str,
    post_merge_state: str | None = None,
    mergeable: str = "MERGEABLE",
    merge_state_status: str = "CLEAN",
    merge_rc: int = 0,
    list_stdout: str = "",
):
    """Dispatching fake for ``story_finish._run``.

    ``gh pr view`` answers with ``pre_merge_state`` until ``gh pr merge`` runs,
    then with ``post_merge_state`` (defaulting to the pre-merge value). That
    split is what lets a test isolate the short-circuit site from the
    post-merge verification site: the same lowercase snapshot means two
    different things depending on which question is being asked of it.
    """

    merged_yet = {"done": False}

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            merged_yet["done"] = True
            return MagicMock(
                returncode=merge_rc,
                stdout="",
                stderr="" if merge_rc == 0 else "gh pr merge failed",
            )
        if "view" in parts:
            state = (
                (post_merge_state if post_merge_state is not None else pre_merge_state)
                if merged_yet["done"]
                else pre_merge_state
            )
            return MagicMock(
                returncode=0,
                stdout=_view_payload(
                    state=state,
                    mergeable=mergeable,
                    merge_state_status=merge_state_status,
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout=list_stdout, stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _merge_invoked(fake: MagicMock) -> bool:
    """True if ``gh pr merge`` was ever called through the fake ``_run``."""
    for call in fake.call_args_list:
        argv = [str(x) for x in call.args[0]]
        if "merge" in argv:
            return True
    return False


def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


def _step2_entries(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for s in result.get("steps", []) if s.get("step") == 2]


def _step2_actions(result: dict[str, Any]) -> list[str]:
    return [str(s.get("action", "")) for s in _step2_entries(result)]


ALREADY_MERGED_RE = re.compile(r"already[\s—–-]*merged", re.IGNORECASE)
SKIP_RE = re.compile(r"skip", re.IGNORECASE)
NOT_MERGED_RE = re.compile(r"not\s+(in\s+)?MERGED", re.IGNORECASE)
REBASE_ADVICE_RE = re.compile(r"rebase|CONFLICTING|resolve the conflicts", re.IGNORECASE)


# =============================================================================
# AC-1 / AC-2 — the predicate itself (GENUINELY RED on HEAD)
# =============================================================================


class TestViewIsMergedRejectsNonCanonicalState:
    """``_view_is_merged`` is the single source of "did this land?" for four
    decisions. It must answer True for exactly one input value.
    """

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    def test_non_canonical_state_is_not_merged(self, state: str) -> None:
        """AC-1: HEAD's ``.upper()`` accepts every one of these; gh emits none
        of them. A state finish cannot vouch for must read as NOT merged.
        """
        assert _view_is_merged({"state": state, "mergedAt": "2026-08-04T00:00:00Z"}) is False, (
            f"state={state!r} was treated as MERGED — the case-fold widens the "
            "boolean that authorises the done transition, the conflict-gate "
            "exemption, the merge short-circuit and the post-merge re-verify"
        )

    def test_canonical_uppercase_state_is_merged(self) -> None:
        """AC-2: the one value gh actually emits still reads as merged. Guards
        against a fix that tightens the predicate into uselessness.
        """
        assert _view_is_merged({"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z"}) is True

    @pytest.mark.parametrize("state", ALREADY_NOT_MERGED)
    def test_other_states_remain_not_merged(self, state: str) -> None:
        """Control group: already False on HEAD, must stay False. "MERGE" and
        "MERGEDX" also pin that the fix stays an equality check rather than
        drifting into a prefix or substring test.
        """
        assert _view_is_merged({"state": state, "mergedAt": "2026-08-04T00:00:00Z"}) is False

    def test_unreadable_snapshot_is_not_merged(self) -> None:
        """The "unknown reads as not merged" contract every call site leans on
        (``_pr_view`` returns None on a gh error / non-object payload). Must
        survive the fix untouched.
        """
        assert _view_is_merged(None) is False

    def test_missing_state_key_is_not_merged(self) -> None:
        """A snapshot without ``state`` at all (gh field-list drift) is
        unknown, not merged.
        """
        assert _view_is_merged({"mergeable": "MERGEABLE", "mergedAt": "2026-08-04T00:00:00Z"}) is False

    def test_null_state_is_not_merged(self) -> None:
        """JSON ``null`` for ``state`` is unknown, not merged. Pins that a fix
        which drops the ``str()`` wrapper still cannot raise or return None-ish
        truth here.
        """
        assert _view_is_merged({"state": None, "mergedAt": "2026-08-04T00:00:00Z"}) is False


# =============================================================================
# AC-1 / AC-2 — decision site 2: the conflict-gate exemption (RED on HEAD)
# =============================================================================


class TestConflictGateExemptionRequiresCanonicalMerged:
    """162-1 exempted MERGED PRs from the hard conflict block because GitHub
    stops recomputing mergeability at merge time. That exemption disarms the
    only gate standing in front of a definitively-conflicting PR, so it must
    require the canonical state — a snapshot finish cannot read is exactly the
    case where the gate should be allowed to speak.
    """

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    def test_non_canonical_merged_does_not_exempt_conflict_block(self, state: str) -> None:
        """AC-1: CONFLICTING/DIRTY plus an unvouchable state must still block
        with actionable rebase advice. On HEAD the case-fold grants the
        exemption and the gate returns None.
        """
        reason = _pr_block_reason(
            "999",
            {
                "state": state,
                "mergedAt": "2026-08-04T00:00:00Z",
                "mergeable": "CONFLICTING",
                "mergeStateStatus": "DIRTY",
                "baseRefName": "develop",
            },
        )
        assert reason is not None, (
            f"state={state!r} bought the 162-1 merged-PR exemption from the "
            "conflict gate — a CONFLICTING PR whose state finish cannot vouch "
            "for must still hard-block before any irreversible step"
        )
        assert REBASE_ADVICE_RE.search(reason), (
            f"block reason must stay actionable (rebase advice): {reason!r}"
        )

    def test_canonical_merged_still_exempt(self) -> None:
        """AC-2: 162-1's behaviour is untouched — a genuinely MERGED PR is
        never blocked on its stale mergeability fields.
        """
        assert (
            _pr_block_reason(
                "999",
                {
                    "state": "MERGED",
                    "mergedAt": "2026-08-04T00:00:00Z",
                    "mergeable": "CONFLICTING",
                    "mergeStateStatus": "DIRTY",
                    "baseRefName": "develop",
                },
            )
            is None
        )

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    def test_non_canonical_merged_with_clean_mergeability_still_passes(
        self, state: str
    ) -> None:
        """Over-reach guard: tightening the exemption must not turn an
        unvouchable state into a block by itself. Only definitively
        non-mergeable PRs are blocked here (gh #113); a CLEAN one falls through
        to the merge attempt regardless of what ``state`` says.
        """
        assert (
            _pr_block_reason(
                "999",
                {
                    "state": state,
                    "mergeable": "MERGEABLE",
                    "mergeStateStatus": "CLEAN",
                    "baseRefName": "develop",
                },
            )
            is None
        )


# =============================================================================
# AC-2 — the adjacent case-folds stay in place (GREEN on arrival, both sides)
# =============================================================================


class TestConflictGateStillBlocksCanonicalMergeability:
    """``mergeable`` / ``mergeStateStatus`` are also case-folded on HEAD
    (filed as a finding, out of scope here: they feed a BLOCKING predicate, so
    de-folding them loosens a gate instead of tightening an authorisation).
    These pin that the canonical uppercase values still block, so a Dev who
    sweeps all three ``.upper()`` calls at once cannot silently drop the 155-12
    conflict abort.
    """

    @pytest.mark.parametrize(
        "mergeable,merge_state_status",
        [
            pytest.param("CONFLICTING", "DIRTY", id="conflicting+dirty"),
            pytest.param("CONFLICTING", "UNKNOWN", id="conflicting-only"),
            pytest.param("MERGEABLE", "DIRTY", id="dirty-only"),
            # 162-18/R2: _pr_block_reason currently case-folds mergeable /
            # mergeStateStatus (the finding is out of scope for _view_is_merged,
            # but the fold is present). Pin that lowercase inputs still block so
            # a sweep that removes the .upper() calls from _pr_block_reason cannot
            # silently drop the 155-12 conflict abort.
            pytest.param("conflicting", "dirty", id="lowercase-conflicting+dirty"),
            pytest.param("conflicting", "unknown", id="lowercase-conflicting-only"),
        ],
    )
    def test_open_pr_with_canonical_conflict_fields_blocks(
        self, mergeable: str, merge_state_status: str
    ) -> None:
        reason = _pr_block_reason(
            "999",
            {
                "state": "OPEN",
                "mergeable": mergeable,
                "mergeStateStatus": merge_state_status,
                "baseRefName": "develop",
            },
        )
        assert reason is not None and REBASE_ADVICE_RE.search(reason), (
            f"155-12's conflict abort regressed for {mergeable}/{merge_state_status}: "
            f"{reason!r}"
        )

    def test_indeterminate_mergeability_still_falls_through(self) -> None:
        """UNKNOWN mergeability is not a block (gh #113) — the merge attempt
        plus the post-merge verification own that path.
        """
        assert (
            _pr_block_reason(
                "999",
                {
                    "state": "OPEN",
                    "mergeable": "UNKNOWN",
                    "mergeStateStatus": "UNKNOWN",
                    "baseRefName": "develop",
                },
            )
            is None
        )


# =============================================================================
# AC-1 / AC-2 — decision site 3: the merge short-circuit (RED on HEAD)
# =============================================================================


class TestShortCircuitRequiresCanonicalMerged:
    """The 155-29 short-circuit skips ``gh pr merge`` entirely and reports
    ``merged: True`` into the done ceremony. Skipping the merge on a snapshot
    finish cannot vouch for is exactly the gh #71/#60 failure mode: a story
    marked shipped whose code never reached the base branch.
    """

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_non_canonical_merged_still_attempts_the_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
        state: str,
    ) -> None:
        """AC-1: the real merge must be attempted. The fake flips to canonical
        MERGED once the merge runs, so the post-merge verification passes and
        finish still succeeds — isolating this site from site 4. On HEAD the
        case-fold takes the short-circuit and ``gh pr merge`` is never called.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake = MagicMock(
            side_effect=_make_run(pre_merge_state=state, post_merge_state="MERGED")
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-3")

        assert _merge_invoked(fake), (
            f"finish skipped `gh pr merge` on state={state!r} — the "
            "already-merged short-circuit must require the canonical MERGED "
            "state, otherwise an unvouchable snapshot silently skips the merge"
        )
        assert result["success"] is True, (
            f"the merge landed, so finish must complete: {result}"
        )
        assert not any(s.get("already_merged") for s in _step2_entries(result)), (
            "step 2 reported already_merged for a PR that had to be merged: "
            f"{_step2_entries(result)}"
        )

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_non_canonical_merged_that_never_lands_refuses_done(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
        state: str,
    ) -> None:
        """AC-1, the whole point of the story: an unvouchable state that stays
        unvouchable across the merge must abort BEFORE the done transition and
        BEFORE any irreversible step. On HEAD finish short-circuits and marks
        the story done on the strength of a snapshot it invented meaning for.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        session_path = project / ".session" / "162-3-session.md"
        archive_dir = project / "sprint" / "archive"
        fake = MagicMock(side_effect=_make_run(pre_merge_state=state))
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-3")

        assert result["success"] is False, (
            f"finish succeeded on a PR whose state is {state!r} and never "
            f"reached MERGED: {result}"
        )
        assert not _requested_done(mock_transition), (
            "the story was transitioned to done without a verified merge"
        )
        assert session_path.exists(), (
            "the session must be kept so finish can be retried after an "
            "unverified merge"
        )
        assert not list(archive_dir.iterdir()), (
            "an aborted finish must leave no stray archive copy (155-15): "
            f"{list(archive_dir.iterdir())}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_canonical_merged_still_short_circuits(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-2: 155-29's retry path is untouched — a genuinely MERGED PR is
        not re-merged, and the ceremony completes.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        session_path = project / ".session" / "162-3-session.md"
        fake = MagicMock(side_effect=_make_run(pre_merge_state="MERGED", merge_rc=1))
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-3")

        assert not _merge_invoked(fake), (
            "finish ran `gh pr merge` on an already-MERGED PR — the 155-29 "
            "short-circuit regressed"
        )
        assert result["success"] is True, result
        assert any(s.get("already_merged") for s in _step2_entries(result)), (
            f"step 2 must record the already-merged skip: {_step2_entries(result)}"
        )
        assert _requested_done(mock_transition)
        assert not session_path.exists()


# =============================================================================
# AC-1 / AC-2 — decision site 4: post-merge re-verification (RED on HEAD)
# =============================================================================


class TestPostMergeVerificationRequiresCanonicalMerged:
    """``_pr_is_merged`` is the backstop for a ``gh pr merge`` that exits zero
    without landing anything (gh #71 / #60). It reads a FRESH snapshot through
    the same predicate, so the case-fold lets a state gh never emits satisfy
    the last check before ``done``.
    """

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    def test_non_canonical_state_fails_verification(self, state: str) -> None:
        """AC-1 at the helper boundary: the fresh probe returns an unvouchable
        state, so verification must fail.
        """
        with patch(
            "pf.sprint.story_finish._pr_view",
            return_value={"state": state, "mergeable": "MERGEABLE"},
        ):
            assert _pr_is_merged("999") is False, (
                f"post-merge verification accepted state={state!r} — this is "
                "the last guard before the story is marked shipped"
            )

    def test_canonical_state_passes_verification(self) -> None:
        """AC-2: a real merge still verifies."""
        with patch(
            "pf.sprint.story_finish._pr_view",
            return_value={"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z", "mergeable": "MERGEABLE"},
        ):
            assert _pr_is_merged("999") is True

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merge_that_reports_non_canonical_state_aborts_with_reason(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
        state: str,
    ) -> None:
        """AC-1 end to end through site 4 specifically: the PR is OPEN before
        the merge (so the short-circuit cannot fire), ``gh pr merge`` exits
        zero, and the post-merge snapshot comes back unvouchable. Finish must
        abort and say so.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake = MagicMock(
            side_effect=_make_run(pre_merge_state="OPEN", post_merge_state=state)
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-3")

        assert _merge_invoked(fake), "precondition: the merge must be attempted"
        assert result["success"] is False, (
            f"post-merge state {state!r} was accepted as landed: {result}"
        )
        assert NOT_MERGED_RE.search(str(result.get("error") or "")), (
            "the abort must tell the operator the PR is not MERGED: "
            f"{result.get('error')!r}"
        )
        assert not _requested_done(mock_transition)


# =============================================================================
# AC-1 / AC-2 — decision site 1: the dry-run preview (RED on HEAD)
# =============================================================================


class TestDryRunPreviewRequiresCanonicalMerged:
    """155-31 requires the plan to preview what the run will actually do. Once
    the predicate is strict, an unvouchable state means the run WILL attempt
    the merge — so the plan must promise it, or preview/reality parity breaks
    in the other direction.
    """

    @pytest.mark.parametrize("state", NON_CANONICAL_MERGED)
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_non_canonical_state_previews_the_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project: Path,
        state: str,
    ) -> None:
        """AC-1: the step-2 preview must promise the merge and must NOT claim
        the PR is already merged. On HEAD the case-fold previews the skip.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_run(pre_merge_state=state),
        ):
            result = finish_story(project, "162-3", dry_run=True)

        actions = _step2_actions(result)
        assert len(actions) == 1, (
            f"dry-run plan must contain exactly one step-2 entry: {result.get('steps')}"
        )
        action = actions[0]
        assert not ALREADY_MERGED_RE.search(action), (
            f"dry-run previewed an already-merged skip for state={state!r} — "
            f"the real run will attempt the merge: {action!r}"
        )
        assert "Merge PR #999" in action, (
            f"dry-run step 2 must preview the merge the run will attempt: {action!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_canonical_merged_still_previews_the_skip(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-2: 155-31's preview for a genuinely merged PR is unchanged."""
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_run(pre_merge_state="MERGED", merge_rc=1),
        ):
            result = finish_story(project, "162-3", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        assert ALREADY_MERGED_RE.search(actions[0]) and SKIP_RE.search(actions[0]), (
            f"dry-run step 2 for a MERGED PR must preview the skip: {actions[0]!r}"
        )
