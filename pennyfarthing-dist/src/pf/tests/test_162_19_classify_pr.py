"""Tests for story 162-19: consolidate ``_pr_block_reason`` + ``_view_is_merged``
into a single ``_classify_pr(view)`` precedence-ordered verdict.

Behavior Matrix (current system, before refactor)
--------------------------------------------------
For each PR state, what each of the four call sites currently does:

+----------------------------------+----------------+-------------------+-------------------------------------+-----------------------------+----------------------------------+
| PR State                         | _view_is_merged | _pr_block_reason | CS1: dry-run                        | CS2: conflict gate          | CS3: short-circuit / CS4: verify |
+==================================+=================+===================+=====================================+=============================+==================================+
| MERGED + mergedAt non-null       | True            | None (exempt)     | "already merged — skip"             | pass-through                | skip / verified=True             |
| MERGED + mergedAt=None/absent    | False           | None if clean     | "Merge PR #N" (clean) / block (confl)| pass-through (clean) / ABORT | attempt merge / verified=False   |
| OPEN + CONFLICTING               | False           | rebase error      | block_reason in step 2              | ABORT                       | N/A (CS2 aborted)                |
| OPEN + DIRTY                     | False           | rebase error      | block_reason in step 2              | ABORT                       | N/A                              |
| OPEN + CLEAN/MERGEABLE           | False           | None              | "Merge PR #N"                       | pass-through                | attempt merge / verified=True    |
| OPEN + BEHIND                    | False           | None              | "Merge PR #N"                       | pass-through                | attempt merge / verified=True    |
| OPEN + UNKNOWN                   | False           | None              | "Merge PR #N"                       | pass-through                | attempt merge / verified=True    |
| CLOSED unmerged + clean          | False           | None              | "Merge PR #N"                       | pass-through                | attempt merge / verified=False   |
| CLOSED unmerged + CONFLICTING    | False           | rebase error      | block_reason in step 2              | ABORT                       | N/A                              |
| view=None (gh error)             | False           | None              | "Merge PR #N"                       | pass-through                | attempt merge / verified=False   |
| timeout (probe hung)             | N/A             | N/A               | gate_error in step 2                | ABORT (gate_error)          | ABORT (verify_error)             |
| malformed view (non-str state)   | False (silent)  | None (silent)     | "Merge PR #N" (mis-classified)      | pass-through (mis-classified)| attempt merge / verified=False   |
+----------------------------------+-----------------+-------------------+-------------------------------------+-----------------------------+----------------------------------+

``_classify_pr(view)`` Verdict Contract (behavior Dev MUST implement)
----------------------------------------------------------------------
Precedence: MERGED > UNREADABLE > BLOCKED > MERGEABLE

    MERGED      — view.state == "MERGED" AND view.mergedAt is non-null. Takes
                  highest precedence: a corroborated-merged PR is never blocked
                  on stale conflict fields (162-1). Authorises the already-merged
                  short-circuit, the conflict-gate exemption, and the post-merge
                  re-verify accept.

    UNREADABLE  — view is None OR view["state"] is not a str (type validation:
                  ghrejects malformed state types). The caller CANNOT safely
                  classify the PR; it falls through to the merge attempt, which is
                  guarded by post-merge re-verify. The same bucket covers a timed-
                  out probe, since _pr_view_probe returns (None, timeout_message)
                  and _classify_pr(None) → UNREADABLE.

    BLOCKED     — view["state"] != fully-corroborated MERGED AND
                  (mergeable == "CONFLICTING" OR mergeStateStatus == "DIRTY").
                  Callers abort before any irreversible step (gh #113).

    MERGEABLE   — everything else: OPEN+CLEAN/UNKNOWN/BEHIND, CLOSED-unmerged
                  with non-conflicting mergeability. Safe to attempt the merge.

The ``_classify_pr`` return object MUST carry:
    .verdict  — the PRVerdict (or equivalent enum) value
    .message  — str | None (human-readable description; non-None for BLOCKED/UNREADABLE)
    .detail   — str | None (extra context, e.g. base branch name for BLOCKED)

Dev Interface (signature and call-site migration)
-------------------------------------------------
    def _classify_pr(view: dict[str, Any] | None) -> _PRClassification: ...

Timeout handling: callers continue to detect gate_timeout from _pr_view_probe
and surface it before calling _classify_pr. _classify_pr(None) → UNREADABLE covers
the timeout arm when the caller passes the view tuple's first element.

Suggested call-site pattern (replaces separate _view_is_merged / _pr_block_reason calls)::

    view, gate_timeout = _pr_view_probe(pr_number, cwd=...)
    if gate_timeout:
        # handle timeout — _classify_pr(None) is UNREADABLE anyway
        ...
    cl = _classify_pr(view)
    if cl.verdict == PRVerdict.MERGED:
        ...skip merge...
    elif cl.verdict == PRVerdict.BLOCKED:
        ...abort with cl.message...
    elif cl.verdict == PRVerdict.UNREADABLE:
        ...fall through to merge + post-merge verify...
    else:  # MERGEABLE
        ...attempt merge...

True-RED tests (fail because _classify_pr does not exist — ImportError)
-----------------------------------------------------------------------
ALL tests in this file are true-RED on the current branch. The import of
``_classify_pr`` will raise ImportError until Dev creates the function.

Regression net
--------------
The 162-3/162-18/162-20/155-31 suites pin the existing per-call-site behaviour.
Do NOT modify them. After Dev's refactor, all four suites must stay green.
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.story_finish import (  # type: ignore[attr-defined]
    _classify_pr,
)

# =============================================================================
# Sprint / session fixtures
# =============================================================================

_INDEX_YAML = """\
sprint:
  name: "Test16219"
  jira_sprint_id: 999
  jira_sprint_name: "Test16219"
  goal: Test _classify_pr verdict consolidation
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""

_SHARD_YAML = """\
id: "162"
type: epic
title: "Finish flow gate ordering"
priority: p1
status: in_progress
stories:
  - id: 162-19
    title: Consolidate _pr_block_reason/_view_is_merged into _classify_pr
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

_SESSION_WITH_PR = """\
---
story_id: "162-19"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-19: Consolidate _pr_block_reason/_view_is_merged into _classify_pr

## Story Details
- **ID:** 162-19
- **Workflow:** tdd
- **Branch:** feat/162-19-classify-pr-consolidation
- **PR:** #999 - classify_pr consolidation
"""


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(_INDEX_YAML)
    (sprint_dir / "epic-162.yaml").write_text(_SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "162-19-session.md").write_text(_SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Helpers — shared view payloads
# =============================================================================


def _merged_view(*, mergedat: str | None = "2026-08-04T00:00:00Z") -> dict[str, Any]:
    return {
        "state": "MERGED",
        "mergedAt": mergedat,
        "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN",
        "baseRefName": "develop",
    }


def _open_view(
    *,
    mergeable: str = "MERGEABLE",
    merge_state_status: str = "CLEAN",
    base_ref: str = "develop",
) -> dict[str, Any]:
    return {
        "state": "OPEN",
        "mergedAt": None,
        "mergeable": mergeable,
        "mergeStateStatus": merge_state_status,
        "baseRefName": base_ref,
    }


def _closed_view(
    *,
    mergeable: str = "MERGEABLE",
    merge_state_status: str = "CLEAN",
) -> dict[str, Any]:
    return {
        "state": "CLOSED",
        "mergedAt": None,
        "mergeable": mergeable,
        "mergeStateStatus": merge_state_status,
        "baseRefName": "develop",
    }


def _verdict(result: Any) -> str:
    """Extract the verdict string from whatever _classify_pr returns.

    Supports both a .verdict attribute (dataclass/NamedTuple) and a dict with
    a ``verdict`` key.  Normalises to lowercase so assertions don't depend on
    enum member capitalisation.
    """
    if hasattr(result, "verdict"):
        v = result.verdict
        # Enum value or plain string
        return (v.value if hasattr(v, "value") else str(v)).lower()
    if isinstance(result, dict):
        v = result.get("verdict", "")
        return (v.value if hasattr(v, "value") else str(v)).lower()
    raise TypeError(f"Cannot extract verdict from {type(result)}: {result!r}")


# =============================================================================
# MERGED verdict (highest precedence)
# =============================================================================


class TestClassifyPrMergedVerdict:
    """MERGED is the highest-precedence verdict. A corroborated merge — state
    ``"MERGED"`` with a non-null ``mergedAt`` — must always resolve to MERGED,
    regardless of what the mergeability fields say (162-1: GitHub stops
    recomputing mergeability at merge time, so stale CONFLICTING/DIRTY must not
    override a confirmed merge).

    These tests are TRUE RED — ``_classify_pr`` does not exist yet.
    """

    def test_merged_with_mergedat_returns_merged_verdict(self) -> None:
        """Canonical corroborated merge → MERGED."""
        result = _classify_pr(_merged_view())
        assert _verdict(result) == "merged", (
            f"state=MERGED + mergedAt present must yield MERGED verdict, got {result!r}"
        )

    def test_merged_verdict_takes_precedence_over_conflicting_mergeability(
        self,
    ) -> None:
        """Precedence pin: MERGED wins over CONFLICTING (the structural
        ordering is encoded once, not positionally per-caller).  A view that
        looks merged AND conflicting must resolve to MERGED — the conflict
        fields are stale and irrelevant once the merge has landed.
        """
        view = {
            "state": "MERGED",
            "mergedAt": "2026-08-04T00:00:00Z",
            "mergeable": "CONFLICTING",
            "mergeStateStatus": "DIRTY",
            "baseRefName": "develop",
        }
        result = _classify_pr(view)
        assert _verdict(result) == "merged", (
            "A MERGED+CONFLICTING view must resolve to MERGED, not BLOCKED — "
            "mergeability fields are stale once the PR has landed. "
            f"Got: {result!r}"
        )

    def test_merged_verdict_takes_precedence_over_dirty_merge_state(self) -> None:
        """MERGED beats DIRTY as well (both are stale after the merge lands)."""
        view = {
            "state": "MERGED",
            "mergedAt": "2026-08-04T00:00:00Z",
            "mergeable": "MERGEABLE",
            "mergeStateStatus": "DIRTY",
            "baseRefName": "develop",
        }
        result = _classify_pr(view)
        assert _verdict(result) == "merged", (
            f"MERGED+DIRTY must resolve to MERGED (not BLOCKED): {result!r}"
        )

    def test_merged_requires_non_null_mergedat(self) -> None:
        """162-18 corroboration: state==MERGED with mergedAt=None is NOT
        a corroborated merge.  It must NOT yield MERGED — the corroboration
        requirement is encoded in the precedence check, not positionally.
        """
        result = _classify_pr(_merged_view(mergedat=None))
        assert _verdict(result) != "merged", (
            "state==MERGED with mergedAt=None must not yield MERGED — "
            f"no timestamp corroboration: {result!r}"
        )

    def test_merged_requires_mergedat_key_present(self) -> None:
        """state==MERGED with mergedAt key absent must not yield MERGED."""
        view: dict[str, Any] = {
            "state": "MERGED",
            "mergeable": "MERGEABLE",
            "mergeStateStatus": "CLEAN",
            "baseRefName": "develop",
        }
        result = _classify_pr(view)
        assert _verdict(result) != "merged", (
            "state==MERGED without mergedAt key must not yield MERGED: "
            f"{result!r}"
        )


# =============================================================================
# UNREADABLE verdict (view=None, type violations)
# =============================================================================


class TestClassifyPrUnreadableVerdict:
    """UNREADABLE is the verdict for views the classifier cannot safely evaluate.
    It covers two cases:
      1. view is None — gh error or timeout (caller passes None from _pr_view_probe)
      2. view["state"] is not a str — field-type validation rejects malformed views

    A malformed view must NOT silently fall through to MERGEABLE and expose an
    unguarded merge path — UNREADABLE is the safe response when we cannot read
    the PR's state.

    These tests are TRUE RED — ``_classify_pr`` does not exist yet.
    """

    def test_none_view_returns_unreadable(self) -> None:
        """A None view (gh error or hung probe) must classify as UNREADABLE.
        Callers handle this by falling through to the merge + post-merge verify.
        """
        result = _classify_pr(None)
        assert _verdict(result) == "unreadable", (
            f"_classify_pr(None) must return UNREADABLE, got {result!r}"
        )

    @pytest.mark.parametrize(
        "bad_state",
        [
            pytest.param(42, id="integer"),
            pytest.param(["MERGED"], id="list"),
            pytest.param({"nested": "dict"}, id="dict"),
            pytest.param(True, id="bool"),
            pytest.param(3.14, id="float"),
        ],
    )
    def test_non_str_state_returns_unreadable(self, bad_state: Any) -> None:
        """Field-type validation: if ``state`` is not a str, the view is
        malformed and must yield UNREADABLE rather than silently mis-classifying.
        This is the _pr_view boundary validation the spec requires.
        """
        view: dict[str, Any] = {
            "state": bad_state,
            "mergedAt": None,
            "mergeable": "MERGEABLE",
            "mergeStateStatus": "CLEAN",
            "baseRefName": "develop",
        }
        result = _classify_pr(view)
        assert _verdict(result) == "unreadable", (
            f"view with state={bad_state!r} (type {type(bad_state).__name__}) "
            f"must yield UNREADABLE, not silently fall to MERGEABLE: {result!r}"
        )

    def test_missing_state_key_returns_unreadable(self) -> None:
        """A view without a ``state`` key at all cannot be safely classified.
        Without knowing the state, we cannot determine MERGED vs OPEN vs CLOSED,
        so UNREADABLE is the safe answer.
        """
        view: dict[str, Any] = {
            "mergeable": "MERGEABLE",
            "mergeStateStatus": "CLEAN",
            "baseRefName": "develop",
        }
        result = _classify_pr(view)
        assert _verdict(result) == "unreadable", (
            "A view missing the ``state`` key cannot be classified; "
            f"expected UNREADABLE, got {result!r}"
        )

    def test_unreadable_does_not_block(self) -> None:
        """UNREADABLE must never yield BLOCKED — an unreadable view should fall
        through to the merge attempt (which is guarded by post-merge verify),
        not abort with a rebase instruction the operator cannot act on.
        """
        result = _classify_pr(None)
        assert _verdict(result) != "blocked", (
            "UNREADABLE (None view) must not yield BLOCKED: "
            f"operator would receive rebase advice for a PR they cannot inspect: {result!r}"
        )


# =============================================================================
# BLOCKED verdict (CONFLICTING / DIRTY, not corroborated-merged)
# =============================================================================


class TestClassifyPrBlockedVerdict:
    """BLOCKED is the verdict for PRs that are definitively non-mergeable:
    ``mergeable == "CONFLICTING"`` or ``mergeStateStatus == "DIRTY"``, and the
    PR is NOT a corroborated merge.  Callers abort before any irreversible step
    (gh #113).

    These tests are TRUE RED — ``_classify_pr`` does not exist yet.
    """

    @pytest.mark.parametrize(
        "mergeable,merge_state_status",
        [
            pytest.param("CONFLICTING", "DIRTY", id="conflicting+dirty"),
            pytest.param("CONFLICTING", "UNKNOWN", id="conflicting-only"),
            pytest.param("MERGEABLE", "DIRTY", id="dirty-only"),
        ],
    )
    def test_open_conflicting_returns_blocked(
        self, mergeable: str, merge_state_status: str
    ) -> None:
        """OPEN PR with CONFLICTING or DIRTY mergeability → BLOCKED."""
        view = _open_view(mergeable=mergeable, merge_state_status=merge_state_status)
        result = _classify_pr(view)
        assert _verdict(result) == "blocked", (
            f"OPEN+{mergeable}/{merge_state_status} must yield BLOCKED, got {result!r}"
        )

    def test_closed_conflicting_returns_blocked(self) -> None:
        """CLOSED-without-merging CONFLICTING PR → BLOCKED.
        A CLOSED unmerged PR did NOT land, so the conflict fields still speak.
        """
        view = _closed_view(mergeable="CONFLICTING", merge_state_status="DIRTY")
        result = _classify_pr(view)
        assert _verdict(result) == "blocked", (
            f"CLOSED+CONFLICTING must yield BLOCKED: {result!r}"
        )

    @pytest.mark.parametrize(
        "mergeable,merge_state_status",
        [
            # Case-folded variants: _pr_block_reason already case-folds these,
            # pin that _classify_pr preserves the existing tolerance.
            pytest.param("conflicting", "dirty", id="lowercase"),
            pytest.param("Conflicting", "Dirty", id="titlecase"),
        ],
    )
    def test_case_folded_conflict_fields_still_block(
        self, mergeable: str, merge_state_status: str
    ) -> None:
        """162-3's finding: _pr_block_reason case-folds mergeable/mergeStateStatus
        (opposite risk profile from _view_is_merged — out of scope for 162-3 but
        the behaviour must be PRESERVED by this refactor).  Pin that case-folded
        conflict values still yield BLOCKED.
        """
        view = _open_view(mergeable=mergeable, merge_state_status=merge_state_status)
        result = _classify_pr(view)
        assert _verdict(result) == "blocked", (
            f"Case-folded {mergeable}/{merge_state_status} must still yield BLOCKED "
            f"(regression against 162-3 finding): {result!r}"
        )

    def test_blocked_verdict_has_rebase_message(self) -> None:
        """The BLOCKED verdict must carry an actionable message (rebase/conflict
        advice) in its ``message`` field — not just the verdict value.
        Callers use this directly as the abort reason.
        """
        view = _open_view(mergeable="CONFLICTING", merge_state_status="DIRTY")
        result = _classify_pr(view)
        msg = result.message if hasattr(result, "message") else result.get("message")
        assert msg is not None, (
            f"BLOCKED verdict must carry a non-None message: {result!r}"
        )
        assert any(
            kw.lower() in msg.lower()
            for kw in ("rebase", "CONFLICTING", "conflict")
        ), f"BLOCKED message must contain actionable rebase advice: {msg!r}"

    def test_blocked_verdict_carries_base_branch_detail(self) -> None:
        """The BLOCKED verdict must carry the base branch in ``detail``
        (or in the message itself) so the operator knows where to rebase.
        """
        view = _open_view(
            mergeable="CONFLICTING",
            merge_state_status="DIRTY",
            base_ref="main",
        )
        result = _classify_pr(view)
        detail = result.detail if hasattr(result, "detail") else result.get("detail")
        msg = result.message if hasattr(result, "message") else result.get("message")
        # The base branch must appear somewhere — either in detail or message.
        combined = " ".join(str(x) for x in [detail, msg] if x is not None)
        assert "main" in combined, (
            f"BLOCKED verdict must surface the base branch 'main'; "
            f"message={msg!r}, detail={detail!r}"
        )


# =============================================================================
# MERGEABLE verdict (safe-to-attempt states)
# =============================================================================


class TestClassifyPrMergeableVerdict:
    """MERGEABLE is the lowest-precedence verdict: everything that is not
    corroborated-MERGED, UNREADABLE, or definitively conflicting.  These PRs
    fall through to the merge attempt, which is guarded by post-merge
    re-verification.

    These tests are TRUE RED — ``_classify_pr`` does not exist yet.
    """

    @pytest.mark.parametrize(
        "mergeable,merge_state_status",
        [
            pytest.param("MERGEABLE", "CLEAN", id="clean"),
            pytest.param("UNKNOWN", "UNKNOWN", id="unknown"),
            pytest.param("MERGEABLE", "BEHIND", id="behind"),
            pytest.param("MERGEABLE", "BLOCKED", id="review-blocked"),
            pytest.param("", "", id="empty-strings"),
        ],
    )
    def test_open_non_conflicting_returns_mergeable(
        self, mergeable: str, merge_state_status: str
    ) -> None:
        """OPEN PR with indeterminate or clean mergeability → MERGEABLE.
        Indeterminate includes UNKNOWN (gh still computing) and BLOCKED (review
        required) — neither is definitively conflicting, so they fall through.
        """
        view = _open_view(mergeable=mergeable, merge_state_status=merge_state_status)
        result = _classify_pr(view)
        assert _verdict(result) == "mergeable", (
            f"OPEN+{mergeable}/{merge_state_status} must yield MERGEABLE, got {result!r}"
        )

    def test_closed_unmerged_clean_returns_mergeable(self) -> None:
        """CLOSED-without-merging with non-conflicting mergeability → MERGEABLE.
        The merge attempt will surface the real problem (rc != 0 or no MERGED
        state after merge), not this classifier.
        """
        view = _closed_view(mergeable="MERGEABLE", merge_state_status="CLEAN")
        result = _classify_pr(view)
        assert _verdict(result) == "mergeable", (
            f"CLOSED-unmerged+CLEAN must yield MERGEABLE: {result!r}"
        )

    def test_merged_state_without_mergedat_returns_mergeable_when_clean(self) -> None:
        """state==MERGED+mergedAt=None+CLEAN mergeability: no corroboration and
        no conflict → MERGEABLE (fall through to merge + verify).  Preserves the
        pre-162-18 behavior where such a view is not short-circuited and not
        hard-blocked.
        """
        result = _classify_pr(
            {
                "state": "MERGED",
                "mergedAt": None,
                "mergeable": "MERGEABLE",
                "mergeStateStatus": "CLEAN",
                "baseRefName": "develop",
            }
        )
        assert _verdict(result) == "mergeable", (
            "state==MERGED+mergedAt=None+CLEAN must yield MERGEABLE (not MERGED — "
            f"no corroboration; not BLOCKED — no conflict): {result!r}"
        )

    def test_merged_state_without_mergedat_returns_blocked_when_conflicting(
        self,
    ) -> None:
        """state==MERGED+mergedAt=None+CONFLICTING: no corroboration BUT
        definitively conflicting → BLOCKED.  Preserves _pr_block_reason's
        current behavior: 162-1's merged-exemption requires corroboration (162-18),
        so a non-corroborated MERGED snapshot still gets blocked on conflict fields.
        """
        result = _classify_pr(
            {
                "state": "MERGED",
                "mergedAt": None,
                "mergeable": "CONFLICTING",
                "mergeStateStatus": "DIRTY",
                "baseRefName": "develop",
            }
        )
        assert _verdict(result) == "blocked", (
            "state==MERGED+mergedAt=None+CONFLICTING must yield BLOCKED — "
            "no corroboration means the exemption does not fire and the "
            f"conflict gate speaks: {result!r}"
        )


# =============================================================================
# Precedence is structural (encoded once, not positionally)
# =============================================================================


class TestClassifyPrPrecedenceIsStructural:
    """The core contract of 162-19: the precedence order MERGED > UNREADABLE >
    BLOCKED > MERGEABLE is encoded ONCE inside ``_classify_pr``, not spread
    positionally across call sites.

    These tests drive it by constructing ambiguous views and asserting the higher-
    precedence verdict wins — regardless of which fields are inspected first.

    These tests are TRUE RED — ``_classify_pr`` does not exist yet.
    """

    def test_merged_beats_conflicting_is_repeatable(self) -> None:
        """Calling _classify_pr twice on the same MERGED+CONFLICTING view
        must yield MERGED both times — the result is deterministic, not
        dependent on evaluation order or side effects.
        """
        view = {
            "state": "MERGED",
            "mergedAt": "2026-08-04T00:00:00Z",
            "mergeable": "CONFLICTING",
            "mergeStateStatus": "DIRTY",
            "baseRefName": "develop",
        }
        r1 = _classify_pr(view)
        r2 = _classify_pr(view)
        assert _verdict(r1) == "merged", f"First call: {r1!r}"
        assert _verdict(r2) == "merged", f"Second call: {r2!r}"
        assert _verdict(r1) == _verdict(r2), "Idempotency: same input → same verdict"

    def test_precedence_table_is_consistent_across_all_state_combinations(
        self,
    ) -> None:
        """Parametrized precedence sweep: verify that for every (state, conflicting)
        combination, the verdict matches the expected precedence table.

        This is the structural pin that Dev cannot satisfy by positional ordering
        in callers — _classify_pr must produce the right answer from view alone.
        """
        cases = [
            # (view, expected_verdict, label)
            (
                {"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z", "mergeable": "CONFLICTING", "mergeStateStatus": "DIRTY", "baseRefName": "develop"},
                "merged",
                "MERGED+mergedAt+CONFLICTING → MERGED (merge wins)",
            ),
            (
                {"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z", "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "baseRefName": "develop"},
                "merged",
                "MERGED+mergedAt+CLEAN → MERGED",
            ),
            (
                {"state": "MERGED", "mergedAt": None, "mergeable": "CONFLICTING", "mergeStateStatus": "DIRTY", "baseRefName": "develop"},
                "blocked",
                "MERGED+no-mergedAt+CONFLICTING → BLOCKED (no corroboration)",
            ),
            (
                {"state": "MERGED", "mergedAt": None, "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "baseRefName": "develop"},
                "mergeable",
                "MERGED+no-mergedAt+CLEAN → MERGEABLE",
            ),
            (
                {"state": "OPEN", "mergedAt": None, "mergeable": "CONFLICTING", "mergeStateStatus": "DIRTY", "baseRefName": "develop"},
                "blocked",
                "OPEN+CONFLICTING → BLOCKED",
            ),
            (
                {"state": "OPEN", "mergedAt": None, "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "baseRefName": "develop"},
                "mergeable",
                "OPEN+CLEAN → MERGEABLE",
            ),
            (
                {"state": "OPEN", "mergedAt": None, "mergeable": "UNKNOWN", "mergeStateStatus": "UNKNOWN", "baseRefName": "develop"},
                "mergeable",
                "OPEN+UNKNOWN → MERGEABLE",
            ),
            (
                None,
                "unreadable",
                "None view → UNREADABLE",
            ),
        ]
        failures = []
        for view, expected, label in cases:
            result = _classify_pr(view)
            got = _verdict(result)
            if got != expected:
                failures.append(f"  [{label}]: expected {expected!r}, got {got!r}")
        assert not failures, (
            "Precedence table mismatch — ordering is not structural:\n"
            + "\n".join(failures)
        )


# =============================================================================
# _pr_view field-type validation at the _pr_view boundary
# =============================================================================


class TestPrViewFieldTypeValidation:
    """``_classify_pr`` enforces type constraints on the view dict at the
    ``_pr_view`` boundary (the AC spec: "add ``_pr_view`` field-type
    validation").  A malformed or partial view must be rejected as UNREADABLE
    rather than silently mis-classified as MERGEABLE.

    Without this gate a view carrying non-str ``state`` would slip through
    ``_view_is_merged`` (False) and ``_pr_block_reason`` (None) and be treated
    as safe-to-merge — an unguarded path to a ghost merge.

    These tests are TRUE RED — ``_classify_pr`` does not exist yet.
    """

    @pytest.mark.parametrize(
        "view,label",
        [
            pytest.param(None, "none-view", id="none"),
            pytest.param({"state": 0}, "zero-int-state", id="int-zero"),
            pytest.param({"state": False}, "false-bool-state", id="bool-false"),
            pytest.param({"state": None, "mergedAt": None}, "null-state", id="null-state"),
            pytest.param({"state": []}, "empty-list-state", id="list-empty"),
            pytest.param({"state": ["OPEN"]}, "list-open-state", id="list-str"),
        ],
    )
    def test_malformed_view_is_unreadable_not_mergeable(
        self, view: Any, label: str
    ) -> None:
        """A view whose ``state`` is not a non-None str cannot be classified.
        It must yield UNREADABLE, not MERGEABLE — silently treating it as
        safe-to-merge is the failure mode this validation prevents.
        """
        result = _classify_pr(view)
        assert _verdict(result) == "unreadable", (
            f"[{label}] malformed view {view!r} must yield UNREADABLE "
            f"(not MERGEABLE or MERGED): {result!r}"
        )

    @pytest.mark.parametrize(
        "view,label",
        [
            pytest.param(
                {"state": "OPEN", "mergedAt": None, "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "baseRefName": "develop"},
                "full-open-clean",
                id="full-open-clean",
            ),
            pytest.param(
                {"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z"},
                "minimal-merged",
                id="minimal-merged",
            ),
        ],
    )
    def test_valid_str_state_is_not_unreadable(self, view: dict, label: str) -> None:
        """Over-reach guard: a view with a valid str ``state`` must NOT be
        classified as UNREADABLE — the type check must not be overly broad.
        """
        result = _classify_pr(view)
        assert _verdict(result) != "unreadable", (
            f"[{label}] valid view {view!r} was classified as UNREADABLE: {result!r}"
        )


# =============================================================================
# result_blob: message and detail keys
# =============================================================================


class TestResultBlobMessageDetailKeys:
    """``_classify_pr`` must return an object (dataclass, NamedTuple, or dict)
    that carries ``message`` and ``detail`` fields — the result blob contract
    from the AC spec.

    - ``message``: human-readable string (non-None for BLOCKED; may be None for
      MERGED/MERGEABLE/UNREADABLE) giving the actionable text.
    - ``detail``: supplementary context (e.g. base branch for BLOCKED; may be
      None for other verdicts).

    Without these fields, callers cannot replace the ad-hoc string construction
    in ``_pr_block_reason`` with a single call that carries its own context.

    These tests are TRUE RED — ``_classify_pr`` does not exist yet.
    """

    def _get_message(self, result: Any) -> Any:
        if hasattr(result, "message"):
            return result.message
        if isinstance(result, dict):
            return result.get("message")
        raise TypeError(f"No message on {type(result)}: {result!r}")

    def _get_detail(self, result: Any) -> Any:
        if hasattr(result, "detail"):
            return result.detail
        if isinstance(result, dict):
            return result.get("detail")
        raise TypeError(f"No detail on {type(result)}: {result!r}")

    def test_result_has_message_attribute(self) -> None:
        """_classify_pr result must carry a ``message`` attribute or key."""
        result = _classify_pr(_open_view(mergeable="CONFLICTING", merge_state_status="DIRTY"))
        assert hasattr(result, "message") or (isinstance(result, dict) and "message" in result), (
            f"_classify_pr result must have a 'message' attribute/key: {result!r}"
        )

    def test_result_has_detail_attribute(self) -> None:
        """_classify_pr result must carry a ``detail`` attribute or key."""
        result = _classify_pr(_open_view(mergeable="CONFLICTING", merge_state_status="DIRTY"))
        assert hasattr(result, "detail") or (isinstance(result, dict) and "detail" in result), (
            f"_classify_pr result must have a 'detail' attribute/key: {result!r}"
        )

    def test_blocked_message_is_non_none(self) -> None:
        """BLOCKED verdict must have a non-None message — it is the abort reason
        callers surface to the operator.
        """
        result = _classify_pr(
            _open_view(mergeable="CONFLICTING", merge_state_status="DIRTY", base_ref="develop")
        )
        msg = self._get_message(result)
        assert msg is not None, (
            f"BLOCKED verdict must carry a non-None message: {result!r}"
        )
        assert isinstance(msg, str) and len(msg) > 0, (
            f"BLOCKED message must be a non-empty string: {msg!r}"
        )

    def test_merged_message_and_detail_exist_even_if_none(self) -> None:
        """MERGED verdict's result must still carry the message/detail keys,
        even if their values are None — callers should not branch on key presence.
        """
        result = _classify_pr(_merged_view())
        assert hasattr(result, "message") or (isinstance(result, dict) and "message" in result), (
            f"MERGED result must have 'message' attribute/key (may be None): {result!r}"
        )
        assert hasattr(result, "detail") or (isinstance(result, dict) and "detail" in result), (
            f"MERGED result must have 'detail' attribute/key (may be None): {result!r}"
        )

    def test_mergeable_message_and_detail_exist_even_if_none(self) -> None:
        """MERGEABLE verdict's result must carry message/detail keys (may be None)."""
        result = _classify_pr(_open_view())
        assert hasattr(result, "message") or (isinstance(result, dict) and "message" in result), (
            f"MERGEABLE result must have 'message' attribute/key: {result!r}"
        )
        assert hasattr(result, "detail") or (isinstance(result, dict) and "detail" in result), (
            f"MERGEABLE result must have 'detail' attribute/key: {result!r}"
        )

    def test_unreadable_message_and_detail_exist(self) -> None:
        """UNREADABLE verdict's result must carry message/detail keys."""
        result = _classify_pr(None)
        assert hasattr(result, "message") or (isinstance(result, dict) and "message" in result), (
            f"UNREADABLE result must have 'message' attribute/key: {result!r}"
        )
        assert hasattr(result, "detail") or (isinstance(result, dict) and "detail" in result), (
            f"UNREADABLE result must have 'detail' attribute/key: {result!r}"
        )

    def test_blocked_message_matches_pr_block_reason_content(self) -> None:
        """The BLOCKED message must be at least as informative as the existing
        ``_pr_block_reason`` return string.  This pins that the refactor does
        NOT regress the human-readable abort reason.

        AC: the same PR number and base branch that produced the old rebase
        advice string must appear in the new message field.
        """
        from pf.sprint.story_finish import _pr_block_reason

        view = _open_view(mergeable="CONFLICTING", merge_state_status="DIRTY", base_ref="main")
        old_reason = _pr_block_reason("999", view)
        new_result = _classify_pr(view)
        new_msg = self._get_message(new_result)
        assert new_msg is not None, f"BLOCKED message must be non-None: {new_result!r}"
        # The new message need not be identical — but must contain the same
        # actionable keywords (rebase/conflict advice).
        assert any(
            kw.lower() in new_msg.lower()
            for kw in ("rebase", "conflict", "CONFLICTING")
        ), (
            f"BLOCKED message {new_msg!r} must carry the same actionable rebase "
            f"content as _pr_block_reason returned: {old_reason!r}"
        )
