"""Verdict-parse correctness follow-ups from the 162-21 cycle-5 review.

Story 162-47, Cluster A items 1-4 and the unit-level half of item 6.
Epic: 162 (Finish & sprint-tooling truthfulness)

Every case here comes from a finding the 162-21 Reviewer recorded WITH a probed
fix shape, and the probed shape is what these tests pin — not a guess:

- [AC-A1] ``mask_illustrative_regions`` keeps only ``fence.group(1)[0]``, so a
          3-char closer closes a 6-char opener. CommonMark §6.1 requires the
          closer to be at least as long as the opener AND of the same type.
          Probed fix: store the full delimiter and require
          ``delim[0] == open_delim[0] and len(delim) >= len(open_delim)``,
          "with tests for a long opener closed by a short closer in both
          directions". Called "the highest-value item in this list".
- [AC-A2] the near-miss straggler pattern uses ``\\b``, so
          ``## Reviewer Assessment2`` is neither an exact match nor a near-miss
          and the gate silently reads the OLDER section. Probed fix: drop the
          ``\\b`` so any heading starting with the exact text is a straggler.
- [AC-A3] the round-trip counter is read from the whole (masked) file, so a
          column-0 ``**Round-Trip Count:**`` line written anywhere below the
          preamble becomes operative. Probed fix: "mask first, or scope the
          search to the preamble". Masking landed in 162-28; the preamble
          scoping did not, and BOTH failure directions are live — a forged HIGH
          value wedges the rework loop at the ceiling, a forged LOW one hands
          out extra cycles. The writer must agree with the reader.
- [AC-A4] ``read_agent_verdict`` returns a bare ``dict`` whose load-bearing
          invariant — *verdict is non-None iff status is "found"* — is expressed
          nowhere, and ``resolve_gate`` branches on ``verdict is None`` rather
          than on ``status``, so a reading that carries a verdict with a
          non-``found`` status would ROUTE on it. Same for the implicit
          exhaustive switch over ``classify_verdict``: a fourth value falls
          through to forward routing. Probed fix: ``TypedDict`` with ``Literal``
          statuses, "at minimum add the assertion to the caller".
- [AC-A6] test polish: ``read_agent_verdict`` has no direct unit tests (all
          coverage is integration-level through ``resolve_gate``, so a renamed
          key or a wrong ``detail`` branch would not be caught); heading
          case-insensitivity and 4+ character fences are untested.

Harness note: the fixtures, the real-``tdd.yaml`` loader and the project
scaffolding are imported from ``test_162_21_resolve_gate_rejected_verdict``
rather than re-declared. A second copy of that harness is exactly the
divergence this story exists to remove (SOUL #2), and these tests must track
the same production workflow file that one does.
"""

from __future__ import annotations

import typing
from unittest.mock import patch

import pytest

from pf.handoff import gate_recovery as gr
from pf.handoff.complete_phase import complete_phase
from pf.handoff.gate_recovery import (
    get_rework_recovery,
    mask_illustrative_regions,
    read_agent_verdict,
    read_round_trip_count,
    select_last_section,
)
from pf.handoff.resolve_gate import resolve_gate
from pf.tests.test_162_21_resolve_gate_rejected_verdict import (
    FENCE,
    STORY_ID,
    _load_real_tdd,
    _resolve_review,
    _resolve_with_reviewer_body,
    _session_header,
    _setup_project,
)
from pf.tests.test_162_47_gate_parity import _NONE_ENABLED

TILDE = "~~~"


@pytest.fixture
def no_subagents_required():
    """Every specialist disabled — isolates the counter behaviour under test.

    ``complete_phase``'s approval subgates are AC-A8's subject, not this class's;
    with the toggles off they cannot mask a counter-arithmetic failure.
    """
    with patch("pf.settings.settings.get_setting", return_value=_NONE_ENABLED):
        yield


# ===========================================================================
# AC-A1: fence length is CommonMark-correct
# ===========================================================================


class TestFenceLengthObeysCommonMark:
    """A closer must match the opener's TYPE and be at least as LONG.

    Reviewer-security and reviewer-type-design found this independently and both
    rated it HIGH; the 162-21 Reviewer downgraded it to non-blocking on
    reachability (an exposed extra verdict can only ever BLOCK) and recorded the
    reasoning so this story could disagree with evidence. The reachable
    fail-open needs the reviewer's own verdict fenced — which the last case here
    reproduces.
    """

    def test_a_long_opener_is_not_closed_by_a_short_closer(self) -> None:
        content = f"{FENCE * 2}\n**Verdict:** APPROVED\n{FENCE}\nstill inside the block\n"

        masked = mask_illustrative_regions(content)

        assert "APPROVED" not in masked, (
            "a 3-backtick line closed a 6-backtick fence and exposed the example "
            f"verdict inside it — masked:\n{masked!r}"
        )
        assert "still inside the block" not in masked, (
            f"content after the short closer leaked out of the long fence — {masked!r}"
        )

    def test_a_short_opener_is_closed_by_a_longer_closer(self) -> None:
        """The mirror direction — CommonMark PERMITS a longer closer.

        Over-correcting to `len(delim) == len(open_delim)` would leave this
        fence open and swallow the real verdict below it, so the rule is
        `>=`, not `==`.
        """
        content = f"{FENCE}\nsample output\n{FENCE * 2}\n**Verdict:** REJECTED — real\n"

        masked = mask_illustrative_regions(content)

        assert "sample output" not in masked, f"the fenced example was not masked — {masked!r}"
        assert "**Verdict:** REJECTED — real" in masked, (
            f"a longer closer failed to close the fence and swallowed the real verdict — {masked!r}"
        )

    def test_tilde_fences_obey_the_same_length_rule(self) -> None:
        content = f"{TILDE * 2}\n**Verdict:** APPROVED\n{TILDE}\nstill inside\n"

        masked = mask_illustrative_regions(content)

        assert "APPROVED" not in masked, f"a short tilde closer closed a long one — {masked!r}"
        assert "still inside" not in masked, masked

    def test_the_type_rule_still_holds_alongside_the_length_rule(self) -> None:
        """A ``~~~`` line of ANY length cannot close a backtick fence."""
        content = f"{FENCE}\n{TILDE * 3}\n**Verdict:** APPROVED\n"

        masked = mask_illustrative_regions(content)

        assert "APPROVED" not in masked, f"a long tilde line closed a backtick fence — {masked!r}"

    def test_masking_still_preserves_offsets_and_line_count(self) -> None:
        """Downstream match offsets index into this string — shape must survive."""
        content = f"{FENCE * 2}\n**Verdict:** APPROVED\n{FENCE}\ntail\n"

        masked = mask_illustrative_regions(content)

        assert len(masked) == len(content)
        assert masked.count("\n") == content.count("\n")

    def test_a_short_closer_cannot_leak_an_approval_past_a_fenced_rejection(self, tmp_path) -> None:
        """The reachable fail-open the review probed: archives a rejected story.

        The reviewer fences its real verdict (which the contract says is not a
        verdict) using a 6-backtick wrapper — the standard Markdown idiom for
        showing a 3-backtick block — and an illustrative APPROVED sits below.
        Under the length bug the inner ``` closes the wrapper, the REJECTED
        line is masked as content, and exactly one candidate survives: the
        APPROVED example. That resolves to finish.
        """
        body = (
            f"{FENCE * 2}\n"
            "**Verdict:** REJECTED — the real one, mistakenly fenced\n"
            f"{FENCE}\n"
            "\n"
            "**Verdict:** APPROVED — an example of the format\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body)

        assert result["next_phase"] != "finish", (
            f"a short closer leaked an example approval and archived the story — {result}"
        )
        assert result["status"] == "blocked", (
            "with the real verdict fenced and the only exposed candidate an "
            f"unterminated-fence remainder, the gate must fail closed — {result}"
        )

    def test_a_four_backtick_fence_masks_its_contents(self) -> None:
        """4+ character fences were untested entirely (cycle-5 test-polish item)."""
        content = f"{FENCE}`\n**Verdict:** APPROVED\n{FENCE}`\n**Verdict:** REJECTED — real\n"

        masked = mask_illustrative_regions(content)

        assert "APPROVED" not in masked, masked
        assert "**Verdict:** REJECTED — real" in masked, masked


# ===========================================================================
# AC-A2: the near-miss straggler pattern has no word-boundary hole
# ===========================================================================


class TestNearMissHeadingsHaveNoWordBoundaryHole:
    """``## Reviewer Assessment2`` must be a straggler, not invisible.

    With ``\\b`` between ``t`` and a word character there is no boundary, so the
    heading matches neither the exact pattern nor the near-miss one: the newer
    section is silently skipped and the OLDER one governs. Direction is
    fail-safe in the realistic ordering (a rejection precedes an approval), which
    is why the review filed it non-blocking — but "safe by accident of ordering"
    is not a rule.
    """

    @pytest.mark.parametrize("suffix", ["2", "x", "_cycle2", "5final", "II"])
    def test_a_suffix_starting_with_a_word_character_is_a_straggler(self, suffix: str) -> None:
        content = (
            "## Reviewer Assessment\n\n**Verdict:** REJECTED — cycle 1\n\n"
            f"## Reviewer Assessment{suffix}\n\n**Verdict:** APPROVED — cycle 2\n"
        )

        got = select_last_section(content, "Reviewer Assessment")

        assert got["status"] == "ambiguous", (
            f"`## Reviewer Assessment{suffix}` evaded straggler detection and the "
            f"older section was read instead — {got}"
        )
        assert suffix in got["detail"], (
            f"the ambiguity message does not name the straggler heading — {got['detail']!r}"
        )

    @pytest.mark.parametrize("suffix", [" (Cycle 2)", " — rollup", ": Summary"])
    def test_a_suffix_starting_with_a_boundary_is_still_a_straggler(self, suffix: str) -> None:
        """Control: the cases the ``\\b`` form already caught must keep working."""
        content = (
            "## Reviewer Assessment\n\n**Verdict:** REJECTED\n\n"
            f"## Reviewer Assessment{suffix}\n\n**Verdict:** APPROVED\n"
        )

        assert select_last_section(content, "Reviewer Assessment")["status"] == "ambiguous"

    def test_an_exact_heading_is_not_reported_as_its_own_straggler(self) -> None:
        """Control: dropping ``\\b`` must not make the exact heading match itself."""
        content = (
            "## Reviewer Assessment\n\n**Verdict:** REJECTED — cycle 1\n\n"
            "## Reviewer Assessment\n\n**Verdict:** APPROVED — cycle 2\n"
        )

        got = select_last_section(content, "Reviewer Assessment")

        assert got["status"] == "found", got
        assert "APPROVED — cycle 2" in got["section"]
        assert "cycle 1" not in got["section"]

    def test_a_word_character_suffix_blocks_the_gate(self, tmp_path) -> None:
        """Integration: the gate must block, not resolve the stale section."""
        session = (
            _session_header()
            + "\n## Reviewer Assessment\n\n**Verdict:** REJECTED — cycle 1\n"
            + "\n## Reviewer Assessment2\n\n**Verdict:** APPROVED — cycle 2\n"
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = resolve_gate(STORY_ID, "tdd", "review", project_root=project)

        assert result["status"] == "blocked", (
            f"a hidden straggler heading let a stale verdict govern — {result}"
        )
        assert result["next_phase"] not in ("green", "finish"), result


# ===========================================================================
# AC-A3: the round-trip counter is scoped to the session preamble
# ===========================================================================


class TestTheRoundTripCounterIsScopedToThePreamble:
    """The operative counter is the one ``complete_phase`` writes.

    ``complete_phase`` inserts it after ``**Phase Started:**``, in the Workflow
    Tracking preamble, which precedes every assessment section. Reading the LAST
    column-0 match over the whole file means any agent that writes a
    ``**Round-Trip Count:**`` line into its own prose overrides it.

    Interface pinned here: the counter is read from the text BEFORE the first
    ``## … Assessment`` heading. Reader and writer must agree on that scope —
    a reader that narrows without the writer following would leave the real
    counter frozen at 1 forever, which is the disarmed guard 162-28 closed.
    """

    def test_a_later_counter_line_in_an_assessment_is_not_operative(self) -> None:
        session = (
            _session_header(round_trip_count=1) + "\n## Reviewer Assessment\n\n"
            "I am reviewing at:\n**Round-Trip Count:** 9\n\n**Verdict:** REJECTED\n"
        )

        got = read_round_trip_count(session)

        assert got["count"] == 1, (
            f"a counter line written inside an assessment overrode the real one — {got}"
        )
        assert got["status"] == "found", got

    def test_a_later_counter_line_in_delivery_findings_is_not_operative(self) -> None:
        session = (
            _session_header(round_trip_count=2)
            + "\n## Reviewer Assessment\n\n**Verdict:** REJECTED\n"
            + "\n## Delivery Findings\n\n**Round-Trip Count:** 0\n"
        )

        assert read_round_trip_count(session)["count"] == 2, (
            "a forged LOW counter below the preamble reset the rework ceiling"
        )

    def test_the_preamble_counter_is_still_read(self) -> None:
        """Control: narrowing the scope must not stop finding the real counter."""
        session = _session_header(round_trip_count=2) + "\n## Reviewer Assessment\n\n"

        got = read_round_trip_count(session)

        assert got == {"status": "found", "count": 2, "detail": ""}

    def test_an_absent_counter_is_still_absent_not_unreadable(self) -> None:
        """Control: no counter anywhere is an initial review, not a block."""
        session = _session_header() + "\n## Reviewer Assessment\n\n**Verdict:** APPROVED\n"

        assert read_round_trip_count(session)["status"] == "absent"

    def test_a_forged_high_counter_cannot_wedge_the_rework_loop(self, tmp_path) -> None:
        """tdd.yaml sets ``max_attempts: 3`` — a prose 9 must not exhaust it.

        Two exact reviewer sections against one recorded round-trip, because
        AC-B3 requires a ruling per dispatched round and this case is about the
        CEILING, not staleness: with the forged 9 read as operative the ceiling
        blocks, with the preamble-scoped 1 it does not. That is what discriminates
        here.
        """
        body = (
            "Cycle 1 findings were addressed.\n\n"
            "## Reviewer Assessment\n\n"
            "For the record:\n**Round-Trip Count:** 9\n\n**Verdict:** REJECTED — real\n"
        )

        result = _resolve_with_reviewer_body(tmp_path, body, round_trip_count=1)

        assert result["status"] == "ready", (
            f"a counter forged in reviewer prose blocked a legitimate rework — {result}"
        )
        assert result["next_phase"] == "green", result

    def test_the_writer_increments_the_preamble_counter_not_a_later_one(
        self, tmp_path, no_subagents_required
    ) -> None:
        """Reader and writer must agree, or the guard silently disarms.

        ``complete_phase`` rewrites the LAST masked match. With a decoy below the
        preamble, the decoy is the one incremented — the real counter stays at 1
        for every future round and ``_check_rework_freshness`` never advances.
        """
        session = (
            _session_header(round_trip_count=1) + "\n## Reviewer Assessment\n\n"
            "Context:\n**Round-Trip Count:** 9\n\n**Verdict:** REJECTED\n"
        )
        project = _setup_project(tmp_path, _load_real_tdd(), session)

        result = complete_phase(
            STORY_ID, "tdd", "review", "green", "approval_rework", project_root=project
        )
        assert result["status"] == "success", result

        written = (project / ".session" / f"{STORY_ID}-session.md").read_text(encoding="utf-8")
        preamble = written.split("## Reviewer Assessment")[0]

        assert "**Round-Trip Count:** 2" in preamble, (
            f"the operative counter in the preamble was not incremented — preamble:\n{preamble}"
        )
        assert "**Round-Trip Count:** 10" not in written, (
            "the decoy counter in reviewer prose was rewritten instead"
        )
        assert read_round_trip_count(written)["count"] == 2, (
            f"reader and writer disagree after a rework transition — {written}"
        )


# ===========================================================================
# AC-A4: the tri-state invariant, and the caller that depends on it
# ===========================================================================


_TRI_STATE_SHAPES = [
    ("single verdict", "## Reviewer Assessment\n\n**Verdict:** APPROVED\n"),
    ("no section", "# Story\n\nnothing here\n"),
    ("no verdict line", "## Reviewer Assessment\n\nlooks good to me\n"),
    ("two verdicts", "## Reviewer Assessment\n\n**Verdict:** APPROVED\n**Verdict:** REJECTED\n"),
    (
        "straggler heading",
        "## Reviewer Assessment\n\n**Verdict:** REJECTED\n\n"
        "## Reviewer Assessment (Cycle 2)\n\n**Verdict:** APPROVED\n",
    ),
    (
        "only a fenced verdict",
        f"## Reviewer Assessment\n\n{FENCE}\n**Verdict:** APPROVED\n{FENCE}\n",
    ),
    ("empty verdict value", "## Reviewer Assessment\n\n**Verdict:**\n"),
]


class TestTheVerdictTriStateInvariantIsExpressedAndEnforced:
    """*verdict is non-None iff status is "found"* — and the caller may not
    silently depend on it without expressing it.

    ``resolve_gate`` never reads ``status``; it branches on ``verdict is None``.
    That is correct only while the invariant holds on every return path. A path
    that returned a verdict with a non-``found`` status would ROUTE on an
    ambiguous reading — the exact class of fail-open 162-21 exists to close.
    """

    @pytest.mark.parametrize(
        ("shape", "content"), _TRI_STATE_SHAPES, ids=[s for s, _ in _TRI_STATE_SHAPES]
    )
    def test_verdict_is_non_none_iff_status_is_found(self, shape: str, content: str) -> None:
        got = read_agent_verdict(content, "reviewer")

        assert (got["status"] == "found") == (got["verdict"] is not None), (
            f"the {shape} path breaks the invariant resolve_gate depends on — {got}"
        )
        assert got["status"] in ("found", "absent", "ambiguous"), got

    def test_the_reader_declares_a_typed_return(self) -> None:
        """A bare ``dict`` cannot express the invariant; a TypedDict can.

        The function is the boundary that decides whether a story is archived,
        which is why the review argued a ``TypedDict`` with ``Literal`` statuses
        is justified here where it was not for the other plain dicts.
        """
        annotated = typing.get_type_hints(read_agent_verdict)["return"]

        assert annotated is not dict, (
            "read_agent_verdict still returns a bare `dict`, so the "
            "verdict/status invariant is expressed nowhere"
        )

    def test_the_rework_recovery_return_is_typed_too(self) -> None:
        annotated = typing.get_type_hints(get_rework_recovery)["return"]

        assert annotated != (dict | None), (
            "get_rework_recovery still returns a bare `dict | None` whose "
            "`status` key its caller string-compares"
        )

    def test_an_ambiguous_reading_carrying_a_verdict_never_routes(
        self, tmp_path, monkeypatch
    ) -> None:
        """The mis-route the missing assertion permits.

        Simulates the sixth return path the review warned about. ``status`` says
        the section could not be identified; ``verdict`` carries a word anyway.
        Branching on ``verdict is None`` reads that as an approval and archives.
        """
        monkeypatch.setattr(
            gr,
            "read_agent_verdict",
            lambda content, agent: {
                "status": "ambiguous",
                "verdict": "APPROVED",
                "detail": "two candidate sections",
            },
        )

        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["status"] == "blocked", (
            f"an ambiguous verdict reading was routed on instead of blocking — {result}"
        )
        assert result["next_phase"] != "finish", result

    def test_an_absent_reading_carrying_a_verdict_never_routes(self, tmp_path, monkeypatch) -> None:
        monkeypatch.setattr(
            gr,
            "read_agent_verdict",
            lambda content, agent: {
                "status": "absent",
                "verdict": "REJECTED",
                "detail": "no section",
            },
        )

        result = _resolve_review(tmp_path, verdict="APPROVED")

        assert result["status"] == "blocked", (
            f"an absent verdict reading was routed on instead of blocking — {result}"
        )

    def test_an_unknown_classification_blocks_instead_of_advancing(
        self, tmp_path, monkeypatch
    ) -> None:
        """The implicit exhaustive switch: no explicit ``approved`` branch.

        ``resolve_gate`` blocks on ``None`` and reworks on ``"rework"``;
        everything else FALLS THROUGH to forward routing. A future
        ``"abstain"`` / ``"needs-info"`` value would archive a story — this
        story's own defect, reintroduced by extension rather than by bug.
        """
        monkeypatch.setattr(gr, "classify_verdict", lambda raw: "abstain")

        result = _resolve_review(tmp_path, verdict="ABSTAIN — need more info")

        assert result["status"] != "ready", (
            f"an unrecognized classification advanced the story — {result}"
        )
        assert result["next_phase"] != "finish", result

    def test_an_unknown_recovery_status_does_not_advance(self, tmp_path, monkeypatch) -> None:
        """Control: today this fails closed via the missing-target branch.

        Pinned so a future ``status`` value added to ``get_rework_recovery``
        cannot reach forward routing through a different door.
        """
        monkeypatch.setattr(
            gr, "get_rework_recovery", lambda cfg, count: {"status": "escalate", "reason": "x"}
        )

        result = _resolve_review(tmp_path, verdict="REJECTED")

        assert result["status"] != "ready", result
        assert result["next_phase"] != "finish", result

    def test_the_approved_path_is_explicit_enough_to_still_work(self, tmp_path) -> None:
        """Control: an explicit ``approved`` branch must not break approval."""
        result = _resolve_review(tmp_path, verdict="APPROVED")

        assert result["status"] == "ready"
        assert result["next_phase"] == "finish"
        assert result["next_agent"] == "sm"


# ===========================================================================
# AC-A6: read_agent_verdict has direct unit coverage
# ===========================================================================


class TestReadAgentVerdictDirectly:
    """All prior coverage was integration-level through ``resolve_gate``.

    A renamed key or the wrong ``detail`` branch would not have been caught:
    ``resolve_gate`` only distinguishes "verdict or not" and interpolates
    ``detail`` into prose, so both defects look identical from there.
    """

    def test_the_returned_keys_are_the_contract(self) -> None:
        got = read_agent_verdict("## Reviewer Assessment\n\n**Verdict:** APPROVED\n", "reviewer")

        assert set(got) == {"status", "verdict", "detail"}, got

    def test_the_verdict_text_is_returned_verbatim(self) -> None:
        raw = "REJECTED — 2 blocking findings, see below (supersedes round 1)"
        got = read_agent_verdict(f"## Reviewer Assessment\n\n**Verdict:** {raw}\n", "reviewer")

        assert got["verdict"] == raw, got

    def test_a_missing_section_and_a_missing_verdict_have_distinct_details(self) -> None:
        """The two ``absent`` branches must be distinguishable to the agent."""
        no_section = read_agent_verdict("# Story\n", "reviewer")
        no_verdict = read_agent_verdict("## Reviewer Assessment\n\nlooks good\n", "reviewer")

        assert no_section["status"] == no_verdict["status"] == "absent"
        assert "section" in no_section["detail"], no_section
        assert "Verdict" in no_verdict["detail"], no_verdict
        assert no_section["detail"] != no_verdict["detail"]

    def test_the_ambiguous_detail_names_both_candidates(self) -> None:
        content = "## Reviewer Assessment\n\n**Verdict:** APPROVED — a\n**Verdict:** REJECTED — b\n"

        got = read_agent_verdict(content, "reviewer")

        assert got["status"] == "ambiguous"
        assert "APPROVED — a" in got["detail"]
        assert "REJECTED — b" in got["detail"]

    def test_the_agent_argument_selects_the_heading(self) -> None:
        content = (
            "## Dev Assessment\n\n**Verdict:** GREEN\n\n"
            "## Reviewer Assessment\n\n**Verdict:** REJECTED\n"
        )

        assert read_agent_verdict(content, "dev")["verdict"] == "GREEN"
        assert read_agent_verdict(content, "reviewer")["verdict"] == "REJECTED"

    def test_a_hyphenated_agent_name_resolves_to_its_heading(self) -> None:
        content = "## Tech Writer Assessment\n\n**Verdict:** APPROVED\n"

        assert read_agent_verdict(content, "tech-writer")["status"] == "found"

    def test_exact_heading_matching_requires_canonical_casing(self) -> None:
        """Exact heading identity is case-sensitive (162-60 case-policy fix).

        An all-caps ``## REVIEWER ASSESSMENT`` is not the canonical
        ``## Reviewer Assessment`` produced by ``assessment_heading``.  The
        gate returns ``absent`` and the error tells the agent to add the
        correctly-cased heading — fail-closed.

        If a near-miss (e.g. ``## REVIEWER ASSESSMENT``) appears AFTER a
        properly-cased heading it is caught as a straggler (IGNORECASE
        ``_near_miss_heading_re``) and reported ``ambiguous``.  The case-
        insensitive behaviour this test previously asserted was the
        verdict-supersession fail-open: a lowercase/uppercase variant could
        become the ``last`` exact match and override an earlier REJECTED
        verdict (story 162-60, F1).
        """
        content = "## REVIEWER ASSESSMENT\n\n**Verdict:** REJECTED\n"

        assert read_agent_verdict(content, "reviewer")["status"] == "absent"

    def test_an_indented_verdict_line_is_not_a_verdict(self) -> None:
        content = "## Reviewer Assessment\n\n- note:\n  **Verdict:** APPROVED\n"

        assert read_agent_verdict(content, "reviewer")["status"] == "absent"
