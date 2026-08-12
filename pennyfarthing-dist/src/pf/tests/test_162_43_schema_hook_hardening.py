"""Tests for story 162-43: schema-hook hardening tail (162-11 review).

162-11 put a mechanical backstop on session writes (a session whose
``## Story Details`` block lacks the branch/PR field lines is DENIED, because
that is the 155-32 shape that went ``done`` with an open PR). Review of that
story found three places where the backstop over-blocks or mis-routes, plus two
places where its own tests are weaker than they look. This suite pins all five.

Deliverable 1 — ``.session/archive/`` writes are DENIED today
------------------------------------------------------------
``_is_session_file`` = ``endswith("-session.md") and ".session/" in path``. The
162-11 suite's archive case (``/project/sprint/archive/...``) passes by
ACCIDENT: ``sprint/archive/`` holds no ``.session/`` substring, so the path was
never classified as a session in the first place. The REAL archive location is
``.session/archive/`` (``migration/session.py`` globs
``session_dir/"archive"/"*-session.md"``), and that path matches BOTH clauses —
so an archived session gets validated as a LIVE one. ``story_finish`` rewrites
archives, and an in-flight/complete archived session need not satisfy the live
field or XML contract, so the hook blocks a legitimate write.

Deliverable 2 — the trailing-colon Story Details heading
--------------------------------------------------------
``_story_details_field_labels`` flips ``in_details`` on
``line[3:].strip().lower() == "story details"``. A heading written
``## Story Details:`` never flips it, so ZERO fields are found and the hook
denies with "Missing Branch/PR" — a misleading message, because the consumer
(``session_parse._parse_session_lines``) still resolves branch/PR from that
session via its global first-wins fallback (only the *authority* override is
section-gated). The hook must not refuse a session finish can read: that is the
whole invariant of 162-11, applied in the other direction.

Deliverable 3 — XML routing is a whole-body substring test
----------------------------------------------------------
``_validate_session`` routes on ``if "<session" not in content``. A MARKDOWN
session that merely QUOTES the token in prose (documenting the XML shape — a
live artifact in the 162-11 session file itself) trips the substring, routes to
the XML arm, and is denied for ``story=``/``workflow=``/``<meta>`` it was never
supposed to have. Routing must key on a STRUCTURAL opening tag (line-anchored),
not a mention.

Deliverable 4 — behavioral round-trip beside the pattern-string pin
-------------------------------------------------------------------
``test_162_11_...::test_consumer_parses_every_shape_the_hook_accepts`` pins
``_FIELD_LINE_RE.pattern == SESSION_FIELD_RE.pattern`` by STRING equality. That
pin stays (it is the cheapest possible drift alarm), but it is blind in both
directions: a cosmetic rewrite that preserves semantics breaks it, and it
proves nothing about parse behavior. ``TestFieldPatternRoundTrip`` below adds
the behavioral guard: a corpus of real field-line shapes through BOTH regexes,
asserting identical (label, value) extraction per line.

Deliverable 5 — per-field, not per-joined-message
-------------------------------------------------
``_validate_session_fields`` returns a LIST that ``main()`` joins into one
string. A test asserting on the joined text can pass while an individual
field's detection regresses (branch OK masks PR broken). ``TestPerFieldGuard``
checks each required field independently: one message per missing field, each
naming exactly its own field.

RED on HEAD (assertion failures, for the right reason)
------------------------------------------------------
- ``TestSessionArchiveExempt``: 3 (``.session/archive/`` classified + denied)
- ``TestTrailingColonHeading``: 5 (heading never matches → zero fields)
- ``TestXmlRoutingIsStructural``: 3 (prose mention routes to the XML arm)
- ``TestPerFieldGuard``: 6 (the trailing-colon parametrizations)

Green-on-arrival regression pins (intentional — deliverables 4 and 5 are test
strengthenings, and every guard here exists to stop the GREEN fix from
weakening a 162-11 invariant): the ``sprint/archive/`` case, live-session
classification and denial, the plain heading, non-broadened heading suffixes,
genuine XML sessions (valid and malformed), the round-trip corpus, and the
plain-heading per-field parametrizations.
"""

from __future__ import annotations

import json
import re
from io import StringIO
from typing import Any
from unittest.mock import patch

import pytest

from pf.hooks import schema_validation
from pf.hooks.schema_validation import (
    _get_file_type,
    _story_details_field_labels,
    _validate_session,
)
from pf.sprint.session_parse import _parse_session_lines
from pf.sprint.story_finish import SESSION_FIELD_RE

# =============================================================================
# Fixtures
# =============================================================================

FRONTMATTER = '---\nstory_id: "162-43"\njira_key: ""\nworkflow: "tdd"\n---\n'

BRANCH_LINE = "- **Branch:** feat/162-43-schema-hook-hardening-tail\n"
PR_LINE = "- **PR:** (none yet - recorded when the PR is created)\n"
COMMON_DETAILS = "- **ID:** 162-43\n- **Workflow:** tdd\n- **Stack Parent:** none\n"

DETAILS_COMPLETE = COMMON_DETAILS + BRANCH_LINE + PR_LINE
DETAILS_MISSING_BRANCH = COMMON_DETAILS + PR_LINE
DETAILS_MISSING_PR = COMMON_DETAILS + BRANCH_LINE
DETAILS_MISSING_BOTH = COMMON_DETAILS

PLAIN_HEADING = "## Story Details"
COLON_HEADING = "## Story Details:"

#: The live artifact from the 162-11 session file: markdown prose that
#: documents the XML session shape. No structural session root anywhere.
PROSE_QUOTING_TAG = (
    "\n## Delivery Findings\n"
    'The XML session shape is `<session story="162-43" workflow="tdd">` '
    "with a `<meta>` block inside it; this file is the markdown shape.\n"
)
BULLET_QUOTING_TAG = (
    "\n## Delivery Findings\n- `<session>` is the XML root; markdown sessions have none.\n"
)

LIVE_PATH = "/project/.session/162-43-session.md"
SESSION_ARCHIVE_PATH = "/project/.session/archive/162-43-session.md"
SPRINT_ARCHIVE_PATH = "/project/sprint/archive/162-43-session.md"


def _session(details: str, *, heading: str = PLAIN_HEADING, tail: str = "") -> str:
    """A markdown session file with ``details`` as its Story Details body."""
    return (
        FRONTMATTER
        + "# Story 162-43: schema hook hardening tail\n\n"
        + heading
        + "\n"
        + details
        + "\n## Workflow Tracking\n**Workflow:** tdd\n**Phase:** red\n"
        + tail
    )


COMPLETE = _session(DETAILS_COMPLETE)
MISSING_BOTH = _session(DETAILS_MISSING_BOTH)

#: An archived session body that would FAIL live validation both ways: no
#: Story Details fields, and a bare ``<session>`` root with no attributes.
ARCHIVED_UNVALIDATABLE = (
    "<session>\n# Story 162-43 (archived by finish)\n**Phase:** done\n</session>\n"
)

#: A genuine XML session — structural root at line start, with attributes.
XML_COMPLETE = (
    '<session story="162-43" workflow="tdd">\n'
    "<meta><jira>PROJ-1</jira><started>2026-08-12</started></meta>\n"
    '<status phase="red">in_progress</status>\n'
    "</session>\n"
)
XML_NO_STORY = (
    '<session workflow="tdd">\n'
    "<meta><jira>PROJ-1</jira><started>2026-08-12</started></meta>\n"
    '<status phase="red">in_progress</status>\n'
    "</session>\n"
)
XML_NO_WORKFLOW = (
    '<session story="162-43">\n'
    "<meta><jira>PROJ-1</jira><started>2026-08-12</started></meta>\n"
    '<status phase="red">in_progress</status>\n'
    "</session>\n"
)


# =============================================================================
# Helpers
# =============================================================================


def _flagged(errors: list[str]) -> set[str]:
    """Which required field each error message names (same mapping as 162-11)."""
    found: set[str] = set()
    for err in errors:
        low = err.lower()
        if re.search(r"\bbranch\b", low):
            found.add("branch")
        if re.search(r"\bpr\b|pull request", low):
            found.add("pr")
    return found


def _run_hook(payload: dict[str, Any]) -> dict[str, Any]:
    """Drive ``schema_validation.main()`` and return its hook JSON output."""
    captured = StringIO()
    with patch("sys.stdin", StringIO(json.dumps(payload))):
        with patch("sys.stdout", captured):
            with pytest.raises(SystemExit) as exc:
                schema_validation.main()
    assert exc.value.code == 0, (
        "hooks must always exit 0 and express refusal via permissionDecision — "
        f"got exit {exc.value.code}"
    )
    out = captured.getvalue().strip()
    assert out, "hook produced no stdout — Claude Code sees no decision at all"
    return json.loads(out)["hookSpecificOutput"]


def _write_payload(file_path: str, content: str) -> dict[str, Any]:
    return {
        "tool_name": "Write",
        "tool_input": {"file_path": file_path, "content": content},
    }


def _extract(pattern: re.Pattern[str], line: str) -> tuple[str, str] | None:
    """(label, value) a pattern extracts from ``line``, or None if no field.

    Normalized exactly the way both consumers normalize: label stripped and
    lowercased, value stripped. Comparing normalized output is what makes this
    a BEHAVIORAL equivalence check rather than a pattern-text one.
    """
    match = pattern.search(line)
    if not match:
        return None
    return (match.group(1).strip().lower(), match.group(2).strip())


# =============================================================================
# Deliverable 1 — .session/archive/ is not a live session
# =============================================================================


class TestSessionArchiveExempt:
    """``.session/archive/`` is the real archive location. Writes there must be
    exempt from live-session validation without weakening live detection."""

    def test_dot_session_archive_is_not_a_live_session_file(self) -> None:
        assert _get_file_type(SESSION_ARCHIVE_PATH) is None, (
            "a write to the REAL archive location (.session/archive/) was "
            "classified as a live session file. Both clauses of "
            "_is_session_file match it, so an archived session gets held to the "
            "live field/XML contract and finish's archive rewrite is blocked. "
            "The 162-11 archive test only ever covered sprint/archive/, which "
            "is exempt for an unrelated reason (no '.session/' substring)."
        )

    def test_dot_session_archive_write_missing_fields_allowed(self) -> None:
        out = _run_hook(_write_payload(SESSION_ARCHIVE_PATH, MISSING_BOTH))
        assert out.get("permissionDecision") == "allow", (
            "an archived session write was DENIED for missing the live "
            f"branch/PR field lines: {out!r}"
        )

    def test_dot_session_archive_write_unvalidatable_body_allowed(self) -> None:
        """The archived body finish actually produces need satisfy neither the
        markdown field contract nor the XML tag contract."""
        out = _run_hook(_write_payload(SESSION_ARCHIVE_PATH, ARCHIVED_UNVALIDATABLE))
        assert out.get("permissionDecision") == "allow", (
            f"an archived session body was held to the live contract: {out!r}"
        )

    # --- guards: the exemption must not spill ------------------------------

    def test_sprint_archive_still_exempt(self) -> None:
        """162-11 invariant, kept green."""
        assert _get_file_type(SPRINT_ARCHIVE_PATH) is None, (
            "the sprint/archive/ exemption regressed"
        )

    def test_live_session_still_classified(self) -> None:
        assert _get_file_type(LIVE_PATH) == "session", (
            "live-session detection was weakened while exempting the archive — "
            "the backstop 162-11 exists for is now off for every session write"
        )

    def test_live_session_missing_fields_still_denied(self) -> None:
        out = _run_hook(_write_payload(LIVE_PATH, MISSING_BOTH))
        assert out.get("permissionDecision") == "deny", (
            f"the 155-32 session shape is no longer refused: {out!r}"
        )

    @pytest.mark.parametrize(
        "path",
        [
            "/project/.session/162-43-archive-session.md",
            "/project/.session/archive-notes-session.md",
        ],
    )
    def test_archive_in_the_filename_is_still_a_live_session(self, path: str) -> None:
        """The exemption is the ``archive/`` DIRECTORY segment, not the
        substring 'archive'. A live session whose name contains the word must
        still be validated, or a filename choice silently disables the hook."""
        assert _get_file_type(path) == "session", (
            f"{path} was exempted because its NAME contains 'archive'; the "
            "guard must match a path segment, not a substring"
        )


# =============================================================================
# Deliverable 2 — trailing-colon Story Details heading
# =============================================================================


class TestTrailingColonHeading:
    """``## Story Details:`` is a heading agents write. Finish reads the fields
    under it; the hook must not deny it with a misleading message."""

    def test_trailing_colon_heading_fields_are_detected(self) -> None:
        labels = _story_details_field_labels(_session(DETAILS_COMPLETE, heading=COLON_HEADING))
        assert {"branch", "pr"} <= labels, (
            "no fields were found under a '## Story Details:' heading — the "
            "equality test against 'story details' never matches, so the hook "
            f"reports both merge-target lines missing when both exist: {labels!r}"
        )

    def test_trailing_colon_heading_session_passes(self) -> None:
        content = _session(DETAILS_COMPLETE, heading=COLON_HEADING)
        assert _validate_session(content) == [], (
            "a complete session was refused for writing its Story Details "
            "heading with a trailing colon"
        )

    def test_trailing_colon_heading_with_trailing_space_passes(self) -> None:
        content = _session(DETAILS_COMPLETE, heading="## Story Details:  ")
        assert _validate_session(content) == [], (
            "'## Story Details:  ' (colon plus trailing whitespace) was "
            "refused; the heading is normalized by stripping, so the colon must "
            "be stripped from the already-stripped text"
        )

    def test_hook_does_not_refuse_what_finish_can_read(self) -> None:
        """The 162-11 invariant in the other direction, stated behaviorally.

        The consumer resolves branch/PR from a trailing-colon session via its
        global first-wins pass (only the Story-Details AUTHORITY override is
        section-gated). So finish is fine here and the hook is wrong.
        """
        content = _session(DETAILS_COMPLETE, heading=COLON_HEADING)
        resolved = _parse_session_lines(content.splitlines())
        assert resolved.get("branch") and resolved.get("pr"), (
            "premise broken: the consumer no longer resolves branch/PR from a "
            f"trailing-colon session, so this test's claim is stale: {resolved!r}"
        )
        assert _validate_session(content) == [], (
            "the hook refused a session the consumer resolves both "
            f"merge-target fields from (branch={resolved.get('branch')!r}, "
            f"pr={resolved.get('pr')!r}). Blocking a write finish can read is "
            "the failure mode 162-11's pattern-mirroring exists to prevent."
        )

    def test_trailing_colon_heading_still_enforces_missing_fields(self) -> None:
        """Accepting the heading variant must not turn the section into a
        free pass: a genuinely missing branch line is still an error."""
        content = _session(DETAILS_MISSING_BRANCH, heading=COLON_HEADING)
        assert _flagged(_validate_session(content)) == {"branch"}, (
            "under a trailing-colon heading the hook must flag exactly the "
            "field that is actually missing: "
            f"{_validate_session(content)!r}"
        )

    # --- guards: do not broaden ---------------------------------------------

    def test_plain_heading_still_works(self) -> None:
        assert _validate_session(COMPLETE) == [], (
            "the canonical '## Story Details' heading stopped being recognized"
        )

    @pytest.mark.parametrize(
        "heading",
        [
            "## Story Details Extra",
            "## Story Details::",
            "## Story Details -",
            "## Story Detail",
        ],
    )
    def test_other_heading_suffixes_are_not_story_details(self, heading: str) -> None:
        """Normalization strips ONE trailing colon, not arbitrary suffixes. A
        different section must not become authoritative for branch/PR — the
        155-40 authority boundary."""
        labels = _story_details_field_labels(_session(DETAILS_COMPLETE, heading=heading))
        assert not {"branch", "pr"} & labels, (
            f"heading {heading!r} was treated as Story Details: {labels!r}"
        )


# =============================================================================
# Deliverable 3 — structural XML routing
# =============================================================================


class TestXmlRoutingIsStructural:
    """Route to the XML arm on a structural session root, not a mention."""

    @pytest.mark.parametrize("prose", [PROSE_QUOTING_TAG, BULLET_QUOTING_TAG])
    def test_markdown_session_quoting_the_tag_passes(self, prose: str) -> None:
        content = _session(DETAILS_COMPLETE, tail=prose)
        assert _validate_session(content) == [], (
            "a markdown session that merely QUOTES the session tag in prose "
            "was routed to the XML arm and denied for tags it never had; the "
            "routing test is a whole-body substring instead of a structural "
            "opening tag"
        )

    def test_markdown_session_quoting_the_tag_still_checks_fields(self) -> None:
        """Routing correctly is only half of it: the markdown arm must then
        actually run, so a real missing field is still caught (and named as a
        field problem, not as missing XML tags)."""
        content = _session(DETAILS_MISSING_BRANCH, tail=PROSE_QUOTING_TAG)
        assert _flagged(_validate_session(content)) == {"branch"}, (
            "a markdown session quoting the tag did not get the field contract "
            f"applied: {_validate_session(content)!r}"
        )

    def test_markdown_session_quoting_the_tag_without_details_denies_both(self) -> None:
        content = _session(DETAILS_MISSING_BOTH, tail=PROSE_QUOTING_TAG)
        assert _flagged(_validate_session(content)) == {"branch", "pr"}, (
            "the 155-32 shape escaped the backstop by quoting the session tag "
            f"in prose: {_validate_session(content)!r}"
        )

    # --- guards: genuine XML sessions keep their validation -----------------

    def test_genuine_xml_session_passes(self) -> None:
        assert _validate_session(XML_COMPLETE) == [], (
            f"a valid XML session was rejected: {_validate_session(XML_COMPLETE)!r}"
        )

    def test_genuine_xml_session_missing_story_still_caught(self) -> None:
        errors = _validate_session(XML_NO_STORY)
        assert any("story attribute" in e.lower() for e in errors), (
            "an XML session with no story= attribute was no longer routed to "
            f"the XML arm — malformed XML sessions now pass silently: {errors!r}"
        )

    def test_genuine_xml_session_missing_workflow_still_caught(self) -> None:
        errors = _validate_session(XML_NO_WORKFLOW)
        assert any("workflow attribute" in e.lower() for e in errors), (
            f"an XML session with no workflow= attribute passed: {errors!r}"
        )

    def test_indented_xml_root_still_routes_to_xml(self) -> None:
        """The structural test must tolerate leading whitespace on the root
        line (a re-indented file is still an XML session), or a malformed XML
        session slips through the markdown arm."""
        errors = _validate_session("  " + XML_NO_STORY)
        assert any("story attribute" in e.lower() for e in errors), (
            "an indented XML session root was treated as markdown, so its "
            f"missing story= attribute went unreported: {errors!r}"
        )


# =============================================================================
# Deliverable 4 — behavioral round-trip beside the pattern-string pin
# =============================================================================

#: Field-line shapes that actually occur in session files, plus the near-misses
#: the anchoring and label class exist to reject. Each must extract IDENTICALLY
#: through the hook's pattern and the consumer's.
FIELD_LINE_CORPUS: list[str] = [
    # canonical template shapes
    "- **Branch:** feat/162-43-schema-hook-hardening-tail",
    "**Branch:** feat/162-43-x",
    "* **PR:** #182",
    "  - **PR:** #182",
    "- **PR:**\t#182",
    # case: finish lowercases the label, so a lowercase label IS the field
    "- **branch:** feat/162-43-x",
    # 162-33 hyphenated per-repo label (parses, keyed 'pr my-repo')
    "- **PR my-repo:** #227",
    "- **Stack Parent:** none",
    # blank / whitespace-only values (parse, but carry no value)
    "- **Branch:**",
    "- **Branch:** ",
    "- **PR:**   ",
    # qualified labels the consumer cannot parse (must be None for BOTH)
    "- **PR (pennyfarthing):** #182",
    "- **PR [ui]:** #7",
    # anchoring: mid-prose mentions are not fields (155-40)
    "Note that finish reads the `**Branch:**` field from Story Details.",
    "See **PR:** #1 mentioned inline.",
    # bullet must be followed by whitespace
    "-**Branch:** feat/x",
    # lookalike labels (parse as a DIFFERENT field, identically for both)
    "- **Branch Strategy:** gitflow",
    "- **PR Status:** open",
    # headings and structural lines are not fields
    "## Story Details",
    "## Story Details:",
    "",
    "   ",
    # label class edge cases
    "- **_Branch:** feat/x",
    "- **1Branch:** feat/x",
    "- **:** empty label",
]


class TestFieldPatternRoundTrip:
    """Behavioral counterpart to the 162-11 ``.pattern`` string-equality pin.

    That pin (kept, in ``test_162_11_schema_hook_session_fields.py``) catches
    textual drift but proves nothing about parse behavior. This one asserts the
    two regexes make the same DECISION on every shape that matters, so a
    semantics-preserving rewrite is allowed and a semantics-changing one is not.
    """

    @pytest.mark.parametrize("line", FIELD_LINE_CORPUS)
    def test_hook_and_consumer_extract_identically(self, line: str) -> None:
        hook = _extract(schema_validation._FIELD_LINE_RE, line)
        consumer = _extract(SESSION_FIELD_RE, line)
        assert hook == consumer, (
            f"hook and consumer disagree on {line!r}: hook={hook!r} "
            f"consumer={consumer!r}. A looser hook accepts sessions finish "
            "cannot resolve (the 155-32 failure class); a stricter one blocks "
            "legal sessions."
        )

    def test_corpus_exercises_both_outcomes(self) -> None:
        """Anti-vacuity: an all-None corpus would make the check above pass no
        matter how the patterns drift on real field lines."""
        extracted = [_extract(SESSION_FIELD_RE, line) for line in FIELD_LINE_CORPUS]
        matched = [e for e in extracted if e is not None]
        rejected = [e for e in extracted if e is None]
        assert len(matched) >= 10, (
            f"corpus barely matches anything; it cannot detect drift: {matched!r}"
        )
        assert len(rejected) >= 5, (
            f"corpus has no near-misses, so anchoring drift is invisible: {FIELD_LINE_CORPUS!r}"
        )
        assert ("branch", "feat/162-43-x") in matched, (
            f"corpus no longer extracts a canonical branch value: {matched!r}"
        )
        assert ("pr", "") in matched, (
            f"corpus no longer covers a blank-valued field line: {matched!r}"
        )


# =============================================================================
# Deliverable 5 — per-field guard, not the joined message
# =============================================================================


class TestPerFieldGuard:
    """Each missing required field gets its OWN message naming ONLY itself.

    Asserting on ``main()``'s joined reason lets one field's detection regress
    unnoticed: with both messages concatenated, 'branch' appearing is satisfied
    by the branch message even when the PR check has stopped working. These
    check the list element-by-element, under BOTH heading spellings (the
    trailing-colon parametrizations are the RED ones — today no field is
    detected there at all, so every case reports both fields missing).
    """

    CASES = [
        (DETAILS_MISSING_BRANCH, {"branch"}),
        (DETAILS_MISSING_PR, {"pr"}),
        (DETAILS_MISSING_BOTH, {"branch", "pr"}),
    ]

    @pytest.mark.parametrize("heading", [PLAIN_HEADING, COLON_HEADING])
    @pytest.mark.parametrize(("details", "expected"), CASES)
    def test_one_message_per_missing_field_naming_only_itself(
        self, details: str, expected: set[str], heading: str
    ) -> None:
        errors = _validate_session(_session(details, heading=heading))
        per_message = [_flagged([e]) for e in errors]
        assert len(errors) == len(expected), (
            f"expected exactly {len(expected)} message(s) for missing "
            f"{sorted(expected)} under {heading!r}, got {errors!r}"
        )
        for flags in per_message:
            assert len(flags) == 1, (
                "a message names more than one field, so a per-field "
                f"regression can hide behind it: {flags!r} in {errors!r}"
            )
        assert {next(iter(f)) for f in per_message} == expected, (
            f"the messages name {[sorted(f) for f in per_message]!r}, expected "
            f"one each for {sorted(expected)}: {errors!r}"
        )

    @pytest.mark.parametrize("heading", [PLAIN_HEADING, COLON_HEADING])
    @pytest.mark.parametrize(("details", "expected"), CASES)
    def test_hook_deny_reason_names_exactly_the_missing_fields(
        self, details: str, expected: set[str], heading: str
    ) -> None:
        out = _run_hook(_write_payload(LIVE_PATH, _session(details, heading=heading)))
        assert out.get("permissionDecision") == "deny", (
            f"a session missing {sorted(expected)} was allowed: {out!r}"
        )
        reason = out.get("permissionDecisionReason", "")
        assert _flagged([reason]) == expected, (
            f"deny reason names {sorted(_flagged([reason]))}, expected "
            f"{sorted(expected)}: {reason!r}"
        )
