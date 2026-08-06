"""Test subagent-dispatch subgate in complete_phase (Story 143-12).

Validates that the approval gate programmatically enforces the presence
of all 8 specialist subagent tags in the Reviewer Assessment
([EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE]).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from pf.handoff.complete_phase import (
    SUBAGENT_DISPATCH_TAGS,
    _check_subagent_completion,
    _check_subagent_dispatch,
)

ALL_TAGS = "[EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE]"

# Ensure all subagents are enabled for these tests (settings may differ per project)
_ALL_ENABLED = {
    "preflight": True, "edge_hunter": True, "silent_failure_hunter": True,
    "test_analyzer": True, "comment_analyzer": True, "type_design": True,
    "security": True, "simplifier": True, "rule_checker": True,
}


@pytest.fixture(autouse=True)
def _all_subagents_enabled():
    with patch("pf.settings.settings.get_setting", return_value=_ALL_ENABLED):
        yield

FULL_ASSESSMENT = f"""## Reviewer Assessment

**Verdict:** APPROVED

- {ALL_TAGS}

**Handoff:** To SM
"""

MISSING_TWO = """## Reviewer Assessment

**Verdict:** APPROVED

- [EDGE] ok
- [TEST] ok
- [DOC] ok
- [TYPE] ok
- [SEC] ok
- [RULE] ok

**Handoff:** To SM
"""


class TestCheckSubagentDispatch:

    def test_all_tags_present_returns_empty(self) -> None:
        assert _check_subagent_dispatch(FULL_ASSESSMENT) == set()

    def test_missing_tags_returned(self) -> None:
        missing = _check_subagent_dispatch(MISSING_TWO)
        assert missing == {"[SILENT]", "[SIMPLE]"}

    def test_no_assessment_returns_all_tags(self) -> None:
        assert _check_subagent_dispatch("# No assessment here") == SUBAGENT_DISPATCH_TAGS

    def test_tags_in_other_section_not_counted(self) -> None:
        content = f"""## Dev Assessment

- {ALL_TAGS}

## Reviewer Assessment

**Verdict:** APPROVED
"""
        missing = _check_subagent_dispatch(content)
        assert missing == SUBAGENT_DISPATCH_TAGS

    def test_tags_scattered_across_assessment(self) -> None:
        content = """## Reviewer Assessment

**Verdict:** APPROVED

1. [EDGE] boundary ok
2. [SILENT] no swallowed errors
3. [TEST] tests good
4. [DOC] docs fine
5. [TYPE] types correct
6. [SEC] secure
7. [SIMPLE] minimal
8. [RULE] conventions followed

**Handoff:** done
"""
        assert _check_subagent_dispatch(content) == set()

    def test_truncates_at_next_heading(self) -> None:
        content = """## Reviewer Assessment

- [EDGE] [TEST] [DOC] [TYPE] [SEC]

## Delivery Findings

- [SILENT] [SIMPLE] found here but shouldn't count
"""
        missing = _check_subagent_dispatch(content)
        assert "[SILENT]" in missing
        assert "[SIMPLE]" in missing


# ===========================================================================
# Duplicate-heading gate bypass (story 162-5 triage finding)
# ===========================================================================


class TestDuplicateHeadingGateBypass:
    """The approval subgates must read the CURRENT assessment, not the first one.

    A rework session accumulates sections by appending, so it legitimately holds
    several `## Reviewer Assessment` and `## Subagent Results` headings. Every
    subgate locates its section with a bare ``re.search`` (first match) and then
    truncates at the next ``## ``, so it inspects the OLDEST section and ignores
    everything the reviewer wrote for the current cycle.

    This fails OPEN: cycle 1's complete tables keep satisfying the gate even
    when the current cycle dispatched no specialists at all. The rework-freshness
    check does not save it — see `TestReworkFreshnessFieldIsNeverWritten`.

    **Un-quarantined by story 162-21.** Both checks now select the LAST section
    via `gate_recovery.select_last_section`, the same selection `resolve_gate`
    uses — so the two halves of the exit protocol can no longer disagree about
    which assessment is current (gh #49).
    """

    def test_stale_first_assessment_must_not_satisfy_gate(self) -> None:
        """Cycle 2 dispatched nothing, yet cycle 1's tags let the gate pass."""
        content = f"""## Reviewer Assessment

CYCLE 1 — APPROVED
- {ALL_TAGS}

## Dev Rework Assessment

Fixes applied.

## Reviewer Assessment

CYCLE 2 — no specialists were dispatched at all.
"""
        missing = _check_subagent_dispatch(content)

        assert missing == SUBAGENT_DISPATCH_TAGS, (
            "the gate must judge the LAST Reviewer Assessment; the current "
            f"cycle has no tags so all should be missing, got: {missing}"
        )

    def test_consecutive_sections_are_not_merged(self) -> None:
        """Companion to the test above — inverted by 162-21, as it was designed to be.

        This previously pinned the first-match behavior so that fixing the
        precedence would fail here and force the xfail above to be
        un-quarantined in the same change. That is what happened. The sections
        must not be merged either: truncating at the next `## ` of a DIFFERENT
        name used to concatenate consecutive same-name sections, which let
        cycle 1's tags satisfy a tagless cycle 2.
        """
        content = f"""## Reviewer Assessment

CYCLE 1 — APPROVED
- {ALL_TAGS}

## Reviewer Assessment

CYCLE 2 — nothing dispatched.
"""
        assert _check_subagent_dispatch(content) == SUBAGENT_DISPATCH_TAGS, (
            "the LAST section has no tags, so all required tags are missing"
        )

    def test_stale_complete_results_table_does_not_satisfy_the_gate(self) -> None:
        """The same fail-open direction for `## Subagent Results`.

        Cycle 1's "All received: Yes" must not vouch for a cycle-2 table that
        never completed. This is the more dangerous half: the dispatch check at
        least needs tags present somewhere, whereas a stale completion table
        silently certifies that specialists ran when none did.
        """
        content = """## Subagent Results

| # | Specialist | Received | Status |
| 1 | reviewer-preflight | Yes | clean |

All received: Yes

## Reviewer Assessment

CYCLE 1

## Subagent Results

| # | Specialist | Received | Status |
| 1 | reviewer-preflight | No | pending |
"""
        error = _check_subagent_completion(content)

        assert error is not None, (
            "a stale cycle-1 results table certified an incomplete current cycle"
        )
        assert "All received" in error


class TestReworkFreshnessFieldIsNeverWritten:
    """The rework-freshness guard reads a field nothing ever writes (162-5).

    ``_check_rework_freshness`` gates on ``**Rework Cycle:** N``, but the only
    rework counter ``complete_phase`` writes is ``**Round-Trip Count:** N``. No
    module in the framework writes ``Rework Cycle`` — grep finds only the reader.
    So ``_parse_rework_cycle`` returns 0 on every real session, the function
    short-circuits to "No rework cycle — initial review", and the staleness
    check it exists to perform never runs.

    Tracking: "162-5 follow-up".
    """

    @pytest.mark.xfail(
        reason=(
            "162-5 follow-up: _check_rework_freshness reads '**Rework Cycle:**' "
            "but complete_phase writes '**Round-Trip Count:**', so the "
            "freshness guard is unreachable on real sessions"
        ),
        strict=False,
    )
    def test_freshness_guard_sees_the_counter_complete_phase_writes(self) -> None:
        """A session carrying the real counter must be treated as in-rework."""
        from pf.handoff.complete_phase import _check_rework_freshness

        session = """**Round-Trip Count:** 2

## Subagent Results

Cycle: 1
(stale — not re-run for the current round trip)

All received: Yes
"""
        result = _check_rework_freshness(session)

        assert result["current_cycle"] == 2, (
            f"guard must read the counter that is actually written: {result}"
        )
        assert result["pass"] is False, (
            f"cycle-1 results are stale for round trip 2: {result}"
        )
