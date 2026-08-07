"""The freshness guard's TERMINAL predicate must be as strict as its selection.

Story 162-28, rework cycle 1. The first pass moved ``_check_rework_freshness``
onto ``select_last_section`` (exact heading, LAST match, ambiguity reported) and
fixed B4 so the guard is reachable at all. Review then showed the guard it armed
is decorative: the ``**Cycle: N**`` tag it demands can be satisfied six ways on a
session whose subagents were never re-run, because the tag regex is unanchored
and asterisk-optional and the masker only knows fenced regions.

The rigour applied to SELECTING the section is applied here to READING the tag:

- The tag is a standalone column-0 ``**Cycle: N**`` line. Prose that merely ends
  in ``Cycle: N`` is not a tag, and neither is a table cell.
- Illustrative regions never vouch for freshness — fenced, 4-space-indented,
  inline-backticked, or inside an HTML comment.
- A ``###`` subsection is content the section owns but does not SPEAK for: the tag
  is read from the section's preamble, so one under an appended ``### Reviewer
  Notes`` does not vouch for the table above it.

Honest note on RED-ness: of the eight cases in the first cycle-1 class, six were
RED before the fix. ``test_a_stale_tag_alongside_a_fresh_one_still_blocks`` and
``test_a_tag_ahead_of_the_counter_blocks`` were already green — the old
first-match regex blocked them by coincidence, not by rule. The case that
actually distinguishes first-match-wins from "every tag must match" is a stale
tag placed AFTER a matching one, pinned in
``TestTheAllTagsRuleIsPinnedByTheCaseThatDistinguishesIt`` (review cycle 2).

Deleting the counter outright still disarms the guard — a self-attesting control,
filed as a Delivery Finding. HIDING it does not: see
``TestAnUnreadableCounterBlocks``.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from pf.handoff.complete_phase import _check_rework_freshness, _parse_rework_cycle
from pf.handoff.gate_recovery import (
    mask_illustrative_regions,
    parse_round_trip_count,
    section_preamble,
    select_last_section,
)

STALE_TABLE = """| # | Specialist | Received | Status |
| 1 | reviewer-preflight | Yes | clean |

**All received:** Yes
"""


def _session(body: str, counter: str = "**Round-Trip Count:** 2") -> str:
    """A cycle-2 rework session whose results table was never re-run."""
    return f"""# Story 162-28

## Workflow Tracking
**Phase:** review
{counter}

## Subagent Results

{body}
"""


class TestForgedCycleTagsDoNotProveFreshness:
    """Six confirmed ways to satisfy the tag without re-running anything.

    Each body below contains NO operative tag — only text that the unanchored
    regex ``\\*{0,2}Cycle:\\s*(\\d+)\\*{0,2}`` accepts as one. Every case must
    block: the guard's whole assertion is "these results are from this cycle".
    """

    @pytest.mark.parametrize(
        ("vector", "body"),
        [
            # 1. Prose ending in the phrase — and in the very field name the
            #    counter reader itself parses.
            ("prose", "Re-ran for Rework Cycle: 2 — see notes.\n\n" + STALE_TABLE),
            # 2. A different, invented field name with the same suffix.
            ("wrong-field", "Round-Trip Cycle: 2\n\n" + STALE_TABLE),
            # 3. A table cell, not a tag line.
            (
                "table-cell",
                STALE_TABLE + "\n| notes | Rework Cycle: 2 |\n",
            ),
            # 4. A 4-space-indented example is a code block.
            (
                "indented",
                "Tag it like this:\n\n    **Cycle: 2**\n\n" + STALE_TABLE,
            ),
            # 5. An inline backtick span is quoted text, not an assertion.
            (
                "inline-code",
                "Remember to add `**Cycle: 2**` to this table.\n\n" + STALE_TABLE,
            ),
            # 6. An HTML comment is invisible in the rendered document.
            (
                "html-comment",
                "<!-- **Cycle: 2** -->\n\n" + STALE_TABLE,
            ),
        ],
    )
    def test_forged_tag_blocks(self, vector: str, body: str) -> None:
        result = _check_rework_freshness(_session(body))

        assert result["pass"] is False, (
            f"vector {vector!r}: the table was never re-run and carries no "
            f"operative `**Cycle: 2**` line, yet freshness passed: {result}"
        )

    def test_tag_in_a_trailing_subsection_does_not_vouch(self) -> None:
        """A tag under a `###` subsection attests to that subsection, not the table.

        Ending the section slice at ``###`` would fail CLOSED (see
        ``TestSubsectionsBelongToTheSectionButDoNotSpeakForIt``), so the tag search
        scopes itself to the section preamble instead.
        """
        session = _session(STALE_TABLE) + "\n### Reviewer Notes\n\n**Cycle: 2**\n"

        result = _check_rework_freshness(session)

        assert result["pass"] is False, (
            f"a tag under a `###` subsection vouched for the table above: {result}"
        )

    def test_a_stale_tag_alongside_a_fresh_one_still_blocks(self) -> None:
        """Two operative tags that disagree cannot both be true — block."""
        body = "**Cycle: 1**\n\n**Cycle: 2**\n\n" + STALE_TABLE

        result = _check_rework_freshness(_session(body))

        assert result["pass"] is False, (
            f"a cycle-1 tag in the current section must not be waved through by "
            f"a cycle-2 tag beside it: {result}"
        )

    def test_a_tag_ahead_of_the_counter_blocks(self) -> None:
        """A tag NEWER than the session's cycle is not fresh, it is wrong."""
        result = _check_rework_freshness(_session("**Cycle: 5**\n\n" + STALE_TABLE))

        assert result["pass"] is False, (
            f"cycle 5 results on a cycle-2 session are not freshness: {result}"
        )


class TestGenuineTagsStillPass:
    """The predicate must stay satisfiable — a fail-closed guard is also a bug."""

    def test_the_documented_form_passes(self) -> None:
        result = _check_rework_freshness(_session("**Cycle: 2**\n\n" + STALE_TABLE))

        assert result["pass"] is True, (
            f"the exact form `agents/reviewer.md` documents must pass: {result}"
        )
        assert result["current_cycle"] == 2

    def test_the_tag_is_case_insensitive(self) -> None:
        """`select_last_section` matches headings IGNORECASE; agree with it."""
        result = _check_rework_freshness(_session("**cycle: 2**\n\n" + STALE_TABLE))

        assert result["pass"] is True, f"`**cycle: 2**` hard-blocked: {result}"

    def test_trailing_whitespace_is_tolerated(self) -> None:
        result = _check_rework_freshness(_session("**Cycle:  2**  \n\n" + STALE_TABLE))

        assert result["pass"] is True, f"padding must not block: {result}"


class TestCounterParsingIsStrict:
    """`(\\S+)` accepted values the sibling reader's `(\\d+)` rejects."""

    @pytest.mark.parametrize("value", ["-3", "1_000", "2.0", "0x10", "banana", ""])
    def test_malformed_counters_do_not_arm_the_guard(self, value: str) -> None:
        """A value the tag regex could never match must not arm the guard.

        ``-3`` was the sharp case: it cleared the ``== 0`` sentinel, armed the
        guard, then demanded a tag no ``(\\d+)`` tag can satisfy — a permanently
        unapprovable session with a misleading "no cycle tag" message.
        """
        assert _parse_rework_cycle(f"**Round-Trip Count:** {value}") == 0

    def test_the_real_counter_wins_over_the_legacy_field(self) -> None:
        """Doc/code alignment: reviewer.md says N is the Round-Trip Count.

        ``max()`` rejected a doc-compliant tag whenever a higher legacy value was
        present — precisely the hand-written shape the legacy field exists for.
        """
        session = "**Round-Trip Count:** 1\n**Rework Cycle:** 4\n"

        assert _parse_rework_cycle(session) == 1

    def test_the_legacy_field_is_still_read_when_alone(self) -> None:
        assert _parse_rework_cycle("**Rework Cycle:** 3") == 3

    def test_the_two_counter_readers_agree(self) -> None:
        """`gate_recovery.parse_round_trip_count` claims the readers agree.

        It read the counter unmasked with `(\\d+)`; ``_parse_rework_cycle`` read
        it masked over two fields with `(\\S+)`. Two readers of one concept that
        provably disagree is the failure class 162-21 set out to remove.
        """
        fenced = "```\n**Round-Trip Count:** 7\n```\n\n**Round-Trip Count:** 2\n"

        assert parse_round_trip_count(fenced) == 2
        assert _parse_rework_cycle(fenced) == parse_round_trip_count(fenced)


class TestMaskingCoversEveryIllustrativeForm:
    """Hardening the shared masker protects 162-21's readers too.

    The docstring already promised indented blocks; it masked only fences.
    """

    def test_indented_code_is_masked(self) -> None:
        masked = mask_illustrative_regions("Example:\n\n    **Verdict:** APPROVED\n")

        assert "APPROVED" not in masked

    def test_inline_code_spans_are_masked(self) -> None:
        masked = mask_illustrative_regions("Write `**Verdict:** APPROVED` at column 0.\n")

        assert "APPROVED" not in masked

    def test_html_comments_are_masked(self) -> None:
        masked = mask_illustrative_regions("<!-- **Verdict:** APPROVED -->\n")

        assert "APPROVED" not in masked

    def test_multiline_html_comments_are_masked(self) -> None:
        masked = mask_illustrative_regions(
            "<!--\n## Reviewer Assessment\n\n**Verdict:** APPROVED\n-->\n"
        )

        assert "APPROVED" not in masked
        assert "Reviewer Assessment" not in masked

    def test_an_unterminated_html_comment_masks_the_rest(self) -> None:
        """Content that cannot be read must block, never be guessed at."""
        masked = mask_illustrative_regions("<!-- oops\n\n**Verdict:** APPROVED\n")

        assert "APPROVED" not in masked

    def test_masking_preserves_offsets(self) -> None:
        content = "a `b` c\n\n    indented\n\n<!-- x -->\n"

        assert len(mask_illustrative_regions(content)) == len(content)

    def test_list_continuations_are_not_mistaken_for_code(self) -> None:
        """Indented prose under a bullet is content — masking it fails CLOSED.

        `_check_subagent_dispatch` searches free-form prose for `[SEC]`-style
        tags, so over-masking would report tags missing that are plainly there.
        """
        content = "- finding one\n\n    more about finding one [SEC]\n"

        assert "[SEC]" in mask_illustrative_regions(content)


class TestTheCounterWriterCannotBeSteeredByProse:
    """The writer half, reproduced live on story 162-28's own session file.

    ``complete_phase`` located the counter with an unmasked ``re.search`` and
    rewrote it with an un-counted ``re.sub``. On the rework transition that
    produced this very test file, the FIRST match was a counter quoted inside
    backticks in TEA's prose, so the writer incremented the quotation, rewrote
    every other quoted mention to match, and never recorded a real counter line at
    all. The freshness guard then read cycle 0 and disarmed itself — the writer
    steering the reader into a fail-OPEN, on the one session that was arming it.
    """

    def _write_rework(self, tmp_path, body: str) -> str:
        from pf.handoff.complete_phase import complete_phase

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "162-28-session.md").write_text(
            f"""# Story 162-28

## Workflow Tracking
**Phase:** review
**Phase Started:** 2026-08-06T00:00:00Z

{body}

## Reviewer Assessment

**Verdict:** REJECTED
"""
        )
        with (
            patch("pf.handoff.complete_phase._get_phase_agent", return_value="dev"),
            patch(
                "pf.handoff.complete_phase._validate_phase_names",
                side_effect=lambda _r, _w, f, t: (f, t),
            ),
            patch("pf.handoff.complete_phase._get_phase_tandem", return_value=None),
        ):
            result = complete_phase(
                "162-28", "tdd", "review", "green", "approval_rework", tmp_path
            )
        assert result["status"] == "success", result
        return (session_dir / "162-28-session.md").read_text()

    def test_a_quoted_counter_is_not_incremented_in_place(self, tmp_path) -> None:
        """A real counter must be recorded, and the quotation left alone."""
        content = self._write_rework(
            tmp_path, "Docs say the counter looks like `**Round-Trip Count:** 5`.\n"
        )

        assert "`**Round-Trip Count:** 5`" in content, (
            "the writer rewrote a counter quoted in prose — that is session "
            f"history corruption: {content}"
        )
        assert parse_round_trip_count(content) == 1, (
            "no operative counter was recorded, so the freshness guard reads "
            f"cycle 0 and disarms: {content}"
        )

    def test_only_the_operative_counter_is_rewritten(self, tmp_path) -> None:
        content = self._write_rework(
            tmp_path,
            "**Round-Trip Count:** 1\n\nEarlier the line read `**Round-Trip Count:** 1`.\n",
        )

        assert parse_round_trip_count(content) == 2
        assert "`**Round-Trip Count:** 1`" in content, (
            f"the quoted mention was rewritten along with the real one: {content}"
        )


class TestSubsectionsBelongToTheSectionButDoNotSpeakForIt:
    """Both halves of the trade-off, pinned together.

    Ending the section slice at ``###`` would have been the obvious fix for the
    trailing-subsection vector, but it fails CLOSED: the reviewer template files
    its specialist tags under ``### Specialist Findings``, so
    ``_check_subagent_dispatch`` would report every tag missing. Sections keep
    their subsections; the freshness tag scopes itself to the preamble instead.
    """

    def test_the_slice_keeps_subsections(self) -> None:
        content = "## Reviewer Assessment\n\ntop\n\n### Specialist Findings\n\n[SEC] ok\n"

        selected = select_last_section(content, "Reviewer Assessment")

        assert selected["status"] == "found"
        assert "[SEC]" in selected["section"], (
            "subsection content is part of the section — dropping it would report "
            "specialist tags missing that are plainly present"
        )

    def test_the_preamble_stops_at_the_first_subsection(self) -> None:
        section = "\n\ntop\n\n### Notes\n\nbottom\n"

        preamble = section_preamble(section)

        assert "top" in preamble
        assert "bottom" not in preamble

    def test_the_reviewer_template_still_passes_the_dispatch_check(self) -> None:
        """The regression this trade-off exists to prevent, pinned at the source."""
        from pf.handoff.complete_phase import _check_subagent_dispatch
        from pf.reviewer.template import generate_reviewer_template

        template = generate_reviewer_template(
            enabled_subagents={"preflight", "edge_hunter", "security"}
        )

        with patch("pf.handoff.complete_phase._get_enabled_subagents") as enabled:
            enabled.return_value = (
                {"reviewer-preflight", "reviewer-edge-hunter", "reviewer-security"},
                {"[EDGE]", "[SEC]"},
            )
            assert _check_subagent_dispatch(template) == set()


class TestAnUnreadableCounterBlocks:
    """Hiding the counter must not read as "never reworked" (review cycle 2).

    The cycle-0 short-circuit equated "no counter" with "counter I cannot see",
    so wrapping the operative ``**Round-Trip Count:**`` line in an HTML comment,
    a fence or backticks disarmed the guard completely. The comment form is worse
    than deleting the line: the document still renders intact, so a human reading
    the session sees nothing missing. Widening the masker widened this hole, so it
    is this commit's to close — found raw but not found masked means hidden, and
    hidden fails closed exactly as an unterminated fence already does.
    """

    @pytest.mark.parametrize(
        ("shape", "counter"),
        [
            ("html-comment", "<!-- **Round-Trip Count:** 2 -->"),
            ("fence", "```\n**Round-Trip Count:** 2\n```"),
            ("backticks", "`**Round-Trip Count:** 2`"),
            ("indented", "    **Round-Trip Count:** 2"),
        ],
    )
    def test_a_hidden_counter_blocks(self, shape: str, counter: str) -> None:
        result = _check_rework_freshness(_session(STALE_TABLE, counter=counter))

        assert result["pass"] is False, (
            f"shape {shape!r}: the counter is present in the file but hidden from "
            f"every reader, and the guard silently stood down: {result}"
        )
        assert "Round-Trip Count" in result["message"], (
            f"the message must name the line the agent has to un-hide: {result}"
        )

    def test_an_unparseable_counter_value_blocks(self) -> None:
        """An annotated counter is live practice — this session was hand-edited."""
        result = _check_rework_freshness(
            _session(STALE_TABLE, counter="**Round-Trip Count:** 2 (restored by hand)")
        )

        assert result["pass"] is False, (
            f"a counter line whose value will not parse must block, not read 0: {result}"
        )

    def test_a_genuinely_absent_counter_is_still_an_initial_review(self) -> None:
        """The tri-state must not turn every non-rework session into a blocker."""
        result = _check_rework_freshness("# Story\n\n## Subagent Results\n\n" + STALE_TABLE)

        assert result["pass"] is True
        assert result["current_cycle"] == 0

    def test_the_counter_reader_reports_the_three_states(self) -> None:
        from pf.handoff.gate_recovery import read_round_trip_count

        assert read_round_trip_count("**Round-Trip Count:** 3")["status"] == "found"
        assert read_round_trip_count("no counter here")["status"] == "absent"
        assert read_round_trip_count("<!-- **Round-Trip Count:** 3 -->")["status"] == (
            "unreadable"
        )


class TestDispatchTagsAreNotEatenByTheMasker:
    """The masker the freshness search needs is too aggressive for this one.

    Opposite failure directions: an illustrative freshness tag that is READ
    approves a stale review (fail-open), while a legitimate dispatch tag that is
    MASKED blocks a valid approval (fail-closed) with a message saying tags are
    missing while they sit plainly in the file. One masker cannot serve both, so
    the two searches no longer share one.
    """

    def _assessment(self, findings: str) -> str:
        return f"## Reviewer Assessment\n\n**Verdict:** APPROVED\n\n{findings}\n"

    @pytest.fixture
    def _enabled(self):
        with patch("pf.handoff.complete_phase._get_enabled_subagents") as enabled:
            enabled.return_value = ({"reviewer-security"}, {"[SEC]"})
            yield enabled

    def test_backticked_tags_are_found(self, _enabled) -> None:
        """`reviewer.md` and `approval.md` both MODEL the backticked form."""
        from pf.handoff.complete_phase import _check_subagent_dispatch

        content = self._assessment("- `[SEC]` no security findings")

        assert _check_subagent_dispatch(content) == set(), (
            "the docs render dispatch tags in backticks, so masking inline spans "
            "reports the documented form missing"
        )

    def test_tags_indented_under_a_subsection_are_found(self, _enabled) -> None:
        """A heading opens prose context; the list/table guard cannot see that."""
        from pf.handoff.complete_phase import _check_subagent_dispatch

        content = self._assessment("### Specialist Findings\n\n    [SEC] none found")

        assert _check_subagent_dispatch(content) == set(), (
            "an indented line under a `###` heading was masked as a code block"
        )

    def test_a_fenced_tag_still_does_not_count(self, _enabled) -> None:
        """Splitting the maskers must not undo 162-21's protection."""
        from pf.handoff.complete_phase import _check_subagent_dispatch

        content = self._assessment("Example of a tagged finding:\n\n```\n[SEC] example\n```")

        assert _check_subagent_dispatch(content) == {"[SEC]"}, (
            "a fenced example tag is not a dispatched specialist"
        )

    def test_completion_rows_in_backticks_are_found(self) -> None:
        """The completion table check is a presence check too — same direction."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = (
            "## Subagent Results\n\n"
            "| # | Specialist | Received |\n"
            "| 1 | `reviewer-security` | Yes |\n\n"
            "**All received:** Yes\n"
        )

        with patch("pf.handoff.complete_phase._get_enabled_subagents") as enabled:
            enabled.return_value = ({"reviewer-security"}, {"[SEC]"})
            assert _check_subagent_completion(content) is None


class TestTheAllTagsRuleIsPinnedByTheCaseThatDistinguishesIt:
    """A stale tag AFTER a matching one — the case first-match-wins let through.

    The cycle-1 commit claimed all six vectors were RED first; two were already
    green because the old first-match regex blocked them by coincidence. This is
    the case that actually separates the rules, so removing "every tag must
    match" now fails a test.
    """

    def test_a_stale_tag_after_a_matching_one_blocks(self) -> None:
        body = "**Cycle: 2**\n\n" + STALE_TABLE + "\n**Cycle: 1**\n"

        result = _check_rework_freshness(_session(body))

        assert result["pass"] is False, (
            f"a cycle-1 tag below the matching one is still an untrue claim about "
            f"the current section: {result}"
        )


class TestMaskerBranchesArePinned:
    """Branches that behave correctly today but nothing would notice losing."""

    def test_indentation_without_a_preceding_blank_line_is_not_code(self) -> None:
        content = "A wrapped paragraph\n    continues here [SEC]\n"

        assert "[SEC]" in mask_illustrative_regions(content)

    def test_indented_table_continuations_are_not_code(self) -> None:
        content = "| a | b |\n\n    | c | d [SEC] |\n"

        assert "[SEC]" in mask_illustrative_regions(content)

    def test_two_bare_counter_lines_resolve_to_the_last(self) -> None:
        assert parse_round_trip_count("**Round-Trip Count:** 1\n**Round-Trip Count:** 4\n") == 4

    def test_the_writer_inserts_a_line_when_the_only_counter_is_fenced(self, tmp_path) -> None:
        """The exact shape that lost this session's counter."""
        content = TestTheCounterWriterCannotBeSteeredByProse()._write_rework(
            tmp_path, "```\n**Round-Trip Count:** 9\n```\n"
        )

        assert parse_round_trip_count(content) == 1
        assert "**Round-Trip Count:** 9" in content, "the fenced example was rewritten"
