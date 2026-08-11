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

    **Un-quarantined by story 162-28 (RED).** This is B4, filed as B1's dead
    safety net: with the guard unreachable, nothing behind it can catch a stale
    cycle, so the section-selection defects below have no backstop. The fix must
    read the counter that is actually written while keeping ``Rework Cycle``
    working — story 150-8's fixtures use it, and a hand-written session may too.
    """

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

    def test_rework_cycle_field_is_still_honoured(self) -> None:
        """The legacy field must keep working — 150-8's fixtures depend on it.

        Pins the compatibility half of the B4 fix so "read the written counter"
        cannot be implemented by swapping one field name for the other.
        """
        from pf.handoff.complete_phase import _parse_rework_cycle

        assert _parse_rework_cycle("**Rework Cycle:** 3") == 3

    def test_illustrative_rework_counter_is_not_read(self) -> None:
        """A counter quoted inside a code fence must not put a session in rework.

        Agents document the session format in prose; `select_last_section` masks
        fenced regions for exactly this reason (162-21). The counter reader does
        not, so a fenced example can fabricate a rework cycle the session is not
        in — and once the B4 fix makes the guard live, that fabrication starts
        hard-blocking real approvals.
        """
        from pf.handoff.complete_phase import _parse_rework_cycle

        session = """## Notes

The rework counter looks like this:

```
**Round-Trip Count:** 7
**Rework Cycle:** 7
```

This story has had no rework.
"""
        assert _parse_rework_cycle(session) == 0, (
            "a fenced example is illustrative, not the session's real counter"
        )


class TestReworkFreshnessSectionSelection:
    """B1's residue after 162-21: the freshness guard never got the shared reader.

    Story 162-21 moved ``_check_subagent_dispatch`` and
    ``_check_subagent_completion`` onto ``gate_recovery.select_last_section``
    (exact heading, LAST match, near-miss ambiguity guard, fenced-region
    masking). ``_check_rework_freshness`` — the third approval subcheck, and the
    one whose whole purpose is detecting staleness on rework sessions — still
    locates ``## Subagent Results`` with a bare ``re.search`` (FIRST match) and
    truncates on ``^## (?!Subagent Results)``, a lookahead that deliberately
    SKIPS same-named headings and therefore concatenates consecutive cycles.

    That is the original 162-5 fail-open, intact: the guard reads cycle 1's
    ``Cycle: N`` tag, finds it fresh, and approves a current cycle that was
    never re-run.

    These tests pin the SELECTION BEHAVIOUR, not a cycle-scoping rewrite: the
    current cycle is the LAST exact section, ambiguity blocks, illustrative
    regions do not count.
    """

    def test_freshness_reads_the_last_results_section_not_the_first(self) -> None:
        """FAIL-OPEN: a fresh cycle-2 table above a stale cycle-1 one approves."""
        from pf.handoff.complete_phase import _check_rework_freshness

        session = """**Rework Cycle:** 2

## Subagent Results

Cycle: 2
All received: Yes

## Reviewer Assessment

Cycle 2 review started, then Dev reworked again.

## Subagent Results

Cycle: 1
(the current cycle's table was copied from cycle 1 and never re-run)
"""
        result = _check_rework_freshness(session)

        assert result["pass"] is False, (
            "the CURRENT (last) Subagent Results section is tagged cycle 1 "
            f"while the session is on cycle 2 — that is stale: {result}"
        )

    def test_consecutive_results_sections_are_not_merged(self) -> None:
        """FAIL-OPEN via the truncation lookahead.

        ``^## (?!Subagent Results)`` refuses to stop at a same-named heading, so
        two consecutive sections are read as one string. Cycle 1's tag then
        answers for a current section that carries no tag at all.
        """
        from pf.handoff.complete_phase import _check_rework_freshness

        session = """**Rework Cycle:** 2

## Subagent Results

Cycle: 2
All received: Yes

## Subagent Results

(the current cycle's table — no cycle tag was ever added)
"""
        result = _check_rework_freshness(session)

        assert result["pass"] is False, (
            "the last section has no cycle tag; the preceding section's tag "
            f"must not answer for it: {result}"
        )

    def test_suffixed_results_heading_after_last_exact_blocks(self) -> None:
        """A near-miss heading after the last exact one is ambiguous (162-21).

        It may be the current cycle, whose staleness would be silently skipped.
        The sibling subchecks report this rather than guess; the freshness guard
        reads straight past it and approves.
        """
        from pf.handoff.complete_phase import _check_rework_freshness

        session = """**Rework Cycle:** 3

## Subagent Results

Cycle: 3
All received: Yes

## Subagent Results (Cycle 4)

Cycle: 3
(cycle 4 re-run never happened)
"""
        result = _check_rework_freshness(session)

        assert result["pass"] is False, (
            "a suffixed `## Subagent Results` heading after the last exact one "
            f"may be the current cycle and must not be read past: {result}"
        )
        assert "Subagent Results" in result["message"], (
            f"the message must name the heading the agent has to repeat: {result}"
        )

    def test_illustrative_cycle_tag_does_not_satisfy_the_guard(self) -> None:
        """A ``Cycle: N`` quoted in a code fence must not vouch for freshness."""
        from pf.handoff.complete_phase import _check_rework_freshness

        session = """**Rework Cycle:** 2

## Subagent Results

Tag the table with the current cycle, like so:

```
**Cycle: 2**
```

| # | Specialist | Received | Status |
| 1 | reviewer-preflight | Yes | clean |

All received: Yes
"""
        result = _check_rework_freshness(session)

        assert result["pass"] is False, (
            "the only `Cycle: 2` is inside a code fence — the table itself is "
            f"untagged, so freshness is unproven: {result}"
        )


class TestApprovalGateFailsOpenOnReworkSessions:
    """End-to-end: the approval gate approves a rework session it must reject.

    Both halves of the defect, at the level the story reported them — a real
    ``complete_phase(gate_type="approval")`` call on a session file, not a
    helper in isolation.
    """

    @patch("pf.handoff.complete_phase._get_enabled_subagents")
    @patch("pf.handoff.complete_phase._find_project_root")
    @patch("pf.handoff.complete_phase._get_phase_agent", return_value="reviewer")
    @patch(
        "pf.handoff.complete_phase._validate_phase_names",
        side_effect=lambda _r, _w, f, t: (f, t),
    )
    @patch("pf.handoff.complete_phase._get_phase_tandem", return_value=None)
    def test_stale_last_cycle_table_is_approved(
        self,
        _mock_tandem,
        _mock_validate,
        _mock_agent,
        mock_root,
        mock_subagents,
        tmp_path,
    ) -> None:
        """First-match selection: the fresh table above hides the stale one below."""
        from pf.handoff.complete_phase import complete_phase

        mock_root.return_value = tmp_path
        mock_subagents.return_value = ({"reviewer-preflight"}, set())

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "162-28-session.md").write_text(
            """# Story 162-28

## Workflow Tracking
**Phase:** review
**Phase Started:** 2026-08-06T00:00:00Z
**Rework Cycle:** 2

## Subagent Results

**Cycle: 2**

| # | Specialist | Received | Status |
| 1 | reviewer-preflight | Yes | clean |

**All received:** Yes

## Subagent Results

**Cycle: 1**

| # | Specialist | Received | Status |
| 1 | reviewer-preflight | Yes | clean |

**All received:** Yes

### Handoff History
| From | To | Gate | Result | Time |

## Reviewer Assessment

**Verdict:** APPROVED
"""
        )

        result = complete_phase("162-28", "tdd", "review", "sm", "approval", tmp_path)

        assert result["status"] == "error", (
            "the current cycle's table is tagged cycle 1 on a cycle-2 session; "
            f"approving it is the 162-5 fail-open: {result}"
        )

    @patch("pf.handoff.complete_phase._get_enabled_subagents")
    @patch("pf.handoff.complete_phase._find_project_root")
    @patch("pf.handoff.complete_phase._get_phase_agent", return_value="reviewer")
    @patch(
        "pf.handoff.complete_phase._validate_phase_names",
        side_effect=lambda _r, _w, f, t: (f, t),
    )
    @patch("pf.handoff.complete_phase._get_phase_tandem", return_value=None)
    def test_stale_results_on_a_real_round_trip_session_is_approved(
        self,
        _mock_tandem,
        _mock_validate,
        _mock_agent,
        mock_root,
        mock_subagents,
        tmp_path,
    ) -> None:
        """B4 end-to-end: the counter complete_phase writes leaves the guard asleep."""
        from pf.handoff.complete_phase import complete_phase

        mock_root.return_value = tmp_path
        mock_subagents.return_value = ({"reviewer-preflight"}, set())

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "162-28-session.md").write_text(
            """# Story 162-28

## Workflow Tracking
**Phase:** review
**Phase Started:** 2026-08-06T00:00:00Z
**Round-Trip Count:** 2

## Subagent Results

**Cycle: 1**

| # | Specialist | Received | Status |
| 1 | reviewer-preflight | Yes | clean |

**All received:** Yes

### Handoff History
| From | To | Gate | Result | Time |

## Reviewer Assessment

**Verdict:** APPROVED
"""
        )

        result = complete_phase("162-28", "tdd", "review", "sm", "approval", tmp_path)

        assert result["status"] == "error", (
            "round trip 2 with cycle-1 results must block; the guard reads a "
            f"field nothing writes, so it never fires: {result}"
        )
