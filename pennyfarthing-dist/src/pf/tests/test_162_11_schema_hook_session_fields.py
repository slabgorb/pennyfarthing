"""Tests for story 162-11: the schema-validation hook must REFUSE a session
write whose Story Details block is missing the branch / PR field lines.

Why this exists (SOUL #11 — automatic beats instructional)
----------------------------------------------------------
155-32 went ``done`` with its PR still OPEN. Root cause: sm-setup's session
template had no branch and no PR field line, so ``story_finish``'s
``_extract_branch`` / ``_extract_pr_number`` resolved nothing, the
``gh pr list --head`` fallback (gated on a truthy branch) never fired, step 2
recorded ``skipped``, and the story was marked done. 155-33 fixed the
*template*; that is an instruction, and instructions rot — any agent that
rewrites a session file by hand (they all do, every phase) can drop the lines
again and finish goes quietly false-done a second time.

This story adds the mechanical backstop: the PreToolUse hook already wired on
Write (``pf hooks schema-validation``, ``pennyfarthing-dist/src/pf/hooks/
schema_validation.py``) denies the write instead of trusting the template.

The enforcement contract mirrors the CONSUMER (story_finish), not a new idea:
``_parse_session`` treats the ``## Story Details`` section as authoritative for
the ``branch``/``pr`` keys (155-40), matches only line-anchored field lines
with an optional list bullet (``SESSION_FIELD_RE``), and lowercases the label.
So the hook requires exactly what finish reads.

Acceptance criteria (from the SM assessment in .session/162-11-session.md)
--------------------------------------------------------------------------
- AC-1: a session write whose Story Details block lacks the branch line, the
  PR line, or both is DENIED, and the message names the missing line(s) and
  shows the expected shape (the 141-23 fix-instruction contract).
- AC-2: non-session writes, skill/step writes, archived sessions
  (``sprint/archive/...-session.md``), and complete sessions PASS.
- AC-3: placeholder values are accepted — the LINES must exist, the values may
  be ``(none yet ...)`` / ``(created in Step 5)`` / the trunk-based note.
  Forward-compatible with the per-repo PR shape 162-33 will design.
- AC-4: suite exit 0.

Designed interface (for Dev)
----------------------------
Extend ``schema_validation._validate_session`` — do NOT fork a second hook.
A session is field-complete when its ``## Story Details`` section contains:

- at least one anchored field line whose lowercased label is exactly
  ``branch``, and
- at least one anchored field line whose lowercased label is ``pr``, or ``pr``
  followed by a parenthesized/bracketed repo qualifier

each with a non-blank value. Anchored = ``^\\s*(?:[-*]\\s+)?\\*\\*LABEL:\\*\\*``,
i.e. the shape ``SESSION_FIELD_RE`` parses; a mid-prose mention is NOT a field
(155-40, where prose became ``branch='field like the gitflow arm'`` and finish
probed a garbage head).

Two deliberate scope boundaries, pinned by tests below so nobody "fixes" them
by accident:

1. **PR is at-least-one, qualifier-tolerant.** 162-6 opened multi-repo
   stories; 162-33 designs per-repo PR recording. A rule of "exactly one PR
   line named exactly PR" would have to be redesigned then, so this hook
   accepts ``- **PR (pennyfarthing):** #1`` / ``- **PR [ui]:** #2`` with or
   without a bare PR line. It still rejects a *different* field whose label
   merely starts with those letters (``PR Status``) — 155-33 established that
   a lookalike label does not parse as the session field, so it must not
   satisfy the requirement either.
2. **XML-format sessions keep their existing (XML) validation only.** The
   ``## Story Details`` contract is a markdown-session contract; an XML
   session has no such block and its own required tags are already checked.
   Adding tag-level branch/PR enforcement to the XML shape is out of scope.

RED on HEAD (all fail on assertions, for the right reason — today
``_validate_session`` returns ``[]`` for every markdown session):
  TestMissingFieldsBlocked (7), TestBlankValuesBlocked (3),
  TestLookalikeLabels (2), TestProseIsNotAField (2), TestStoryDetailsAuthority
  (1), TestErrorMessageQuality (3), TestHookDenies (2).
Green-on-arrival guards (regression pins, intentional):
  TestAllowedWrites (8), TestPlaceholdersAccepted (4),
  TestForwardCompatPrShape (3, partially red), TestScopeBoundaries (3).
"""

from __future__ import annotations

import json
import re
import sys
from io import StringIO
from typing import Any
from unittest.mock import patch

import pytest

from pf.hooks import schema_validation
from pf.hooks.schema_validation import _get_file_type, _validate_session
from pf.sprint.story_finish import SESSION_FIELD_RE

# =============================================================================
# Fixtures — sessions shaped like the real 155-33 template
# =============================================================================

FRONTMATTER = '---\nstory_id: "162-11"\njira_key: ""\nworkflow: "tdd"\n---\n'

#: The two field lines the 155-33 template contract puts in Story Details, and
#: which ``story_finish`` reads. Built from the label + the bold-field syntax so
#: the expected shape lives in exactly one place.
BRANCH_LINE = "- **Branch:** feat/162-11-schema-hook-branch-pr-fields\n"
PR_LINE = "- **PR:** (none yet — recorded when the PR is created)\n"
COMMON_DETAILS = "- **ID:** 162-11\n- **Workflow:** tdd\n- **Stack Parent:** none\n"


def _session(details: str, *, tail: str = "", head: str = "") -> str:
    """A markdown session file with ``details`` as its Story Details body."""
    return (
        FRONTMATTER
        + "# Story 162-11: schema hook requires the merge-target fields\n\n"
        + head
        + "## Story Details\n"
        + details
        + "\n## Workflow Tracking\n**Workflow:** tdd\n**Phase:** red\n"
        + tail
    )


COMPLETE = _session(COMMON_DETAILS + BRANCH_LINE + PR_LINE)
MISSING_BRANCH = _session(COMMON_DETAILS + PR_LINE)
MISSING_PR = _session(COMMON_DETAILS + BRANCH_LINE)
MISSING_BOTH = _session(COMMON_DETAILS)

SESSION_PATH = "/project/.session/162-11-session.md"
ARCHIVE_PATH = "/project/sprint/archive/162-11-session.md"


# =============================================================================
# Helpers
# =============================================================================


def _flagged(errors: list[str]) -> set[str]:
    """Which missing field each error message names.

    AC-1 requires the message to name the missing LINE(S) — so a single
    catch-all "add the branch and PR lines" message is not enough when only one
    is missing. This maps each error to the field label(s) it mentions.
    """
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


# =============================================================================
# AC-1 — missing field lines are blocked
# =============================================================================


class TestMissingFieldsBlocked:
    def test_missing_branch_line_is_error(self) -> None:
        errors = _validate_session(MISSING_BRANCH)
        assert "branch" in _flagged(errors), (
            "a session whose Story Details block has no branch field line was "
            "accepted — this is exactly the 155-32 shape: finish resolves no "
            f"branch, probes nothing, and marks the story done. errors={errors!r}"
        )

    def test_missing_branch_does_not_blame_pr(self) -> None:
        """The message must name what is actually missing (AC-1). The PR line
        IS present here, so telling the agent to add it sends it in circles."""
        errors = _validate_session(MISSING_BRANCH)
        assert _flagged(errors) == {"branch"}, (
            "only the branch line is missing, but the errors do not name it "
            f"exclusively: {errors!r}"
        )

    def test_missing_pr_line_is_error(self) -> None:
        errors = _validate_session(MISSING_PR)
        assert "pr" in _flagged(errors), (
            "a session whose Story Details block has no PR field line was "
            "accepted — the resolved-PR merge path (the 155-1 verification "
            f"guarantee) is then unreachable. errors={errors!r}"
        )

    def test_missing_pr_does_not_blame_branch(self) -> None:
        errors = _validate_session(MISSING_PR)
        assert _flagged(errors) == {"pr"}, (
            f"only the PR line is missing, but errors say otherwise: {errors!r}"
        )

    def test_missing_both_names_both(self) -> None:
        errors = _validate_session(MISSING_BOTH)
        assert _flagged(errors) == {"branch", "pr"}, (
            "a Story Details block missing BOTH merge-target field lines (the "
            "verbatim 155-32 template) must be refused with both named: "
            f"errors={errors!r}"
        )

    def test_no_story_details_section_at_all_is_error(self) -> None:
        """A hand-rewritten session that drops the whole block is the worst
        case: nothing for finish to read, and no obvious symptom until a story
        goes done with an open PR."""
        content = (
            FRONTMATTER
            + "# Story 162-11\n\n## Workflow Tracking\n**Phase:** red\n"
        )
        errors = _validate_session(content)
        assert _flagged(errors) == {"branch", "pr"}, (
            f"session with no Story Details section was accepted: {errors!r}"
        )

    def test_story_details_as_last_section_still_scanned(self) -> None:
        """Section scanning must not depend on a following ``## `` heading —
        an EOF-terminated Story Details block is a legal session."""
        content = (
            FRONTMATTER
            + "# Story 162-11\n\n## Story Details\n"
            + COMMON_DETAILS
            + PR_LINE
        )
        errors = _validate_session(content)
        assert _flagged(errors) == {"branch"}, (
            "Story Details at EOF was not scanned for the field lines (the "
            f"branch line is genuinely absent here): {errors!r}"
        )


class TestBlankValuesBlocked:
    """A field line with no value carries no more information than no line at
    all — finish extracts ``None`` from both. The line must exist AND say
    something (a placeholder counts; emptiness does not)."""

    @pytest.mark.parametrize(
        "line",
        [
            "- **Branch:**\n",
            "- **Branch:** \n",
            "- **Branch:**\t\n",
        ],
    )
    def test_blank_branch_value_is_error(self, line: str) -> None:
        errors = _validate_session(_session(COMMON_DETAILS + line + PR_LINE))
        assert "branch" in _flagged(errors), (
            f"branch field line {line!r} has no value at all yet was accepted "
            f"— finish extracts nothing from it: {errors!r}"
        )

    def test_blank_pr_value_is_error(self) -> None:
        errors = _validate_session(
            _session(COMMON_DETAILS + BRANCH_LINE + "- **PR:**\n")
        )
        assert "pr" in _flagged(errors), (
            f"valueless PR field line accepted: {errors!r}"
        )


class TestLookalikeLabels:
    """155-33 established that a lookalike label does not parse as the session
    field (``**Branch Strategy:**`` prose is not the branch field). It must not
    satisfy the requirement either, or the hook passes sessions finish cannot
    read — a green light on a broken contract, worse than no hook."""

    def test_branch_strategy_does_not_satisfy_branch(self) -> None:
        errors = _validate_session(
            _session(COMMON_DETAILS + "- **Branch Strategy:** gitflow\n" + PR_LINE)
        )
        assert "branch" in _flagged(errors), (
            "a 'Branch Strategy' line satisfied the branch-field requirement; "
            "finish keys on the label 'branch' and would resolve nothing: "
            f"{errors!r}"
        )

    def test_pr_status_does_not_satisfy_pr(self) -> None:
        errors = _validate_session(
            _session(COMMON_DETAILS + BRANCH_LINE + "- **PR Status:** open\n")
        )
        assert "pr" in _flagged(errors), (
            f"a 'PR Status' line satisfied the PR-field requirement: {errors!r}"
        )


class TestProseIsNotAField:
    """The 155-40 incident in reverse: mid-prose mentions of the field tokens
    must not count as the field lines, or an agent's assessment prose silently
    satisfies the hook while Story Details stays empty."""

    def test_inline_prose_mention_does_not_satisfy(self) -> None:
        errors = _validate_session(
            _session(
                COMMON_DETAILS,
                tail=(
                    "\n## Delivery Findings\n"
                    "Note that finish reads the `**Branch:**` field and the "
                    "`**PR:**` field from Story Details.\n"
                ),
            )
        )
        assert _flagged(errors) == {"branch", "pr"}, (
            "prose mentioning the field tokens mid-line satisfied the hook — "
            f"Story Details is still empty of both fields: {errors!r}"
        )

    def test_heading_mention_does_not_satisfy(self) -> None:
        errors = _validate_session(
            _session(COMMON_DETAILS, tail="\n## Branch and PR notes\nnone\n")
        )
        assert _flagged(errors) == {"branch", "pr"}, (
            f"a section HEADING satisfied the field requirement: {errors!r}"
        )


class TestStoryDetailsAuthority:
    """``_parse_session`` gives the Story Details section authority over the
    branch/PR keys (155-40). The hook enforces the same location, so the
    template contract is what gets checked — not a stray line anywhere."""

    def test_fields_only_in_a_later_section_is_error(self) -> None:
        errors = _validate_session(
            _session(
                COMMON_DETAILS,
                tail="\n## Dev Assessment\n" + BRANCH_LINE + PR_LINE,
            )
        )
        assert _flagged(errors) == {"branch", "pr"}, (
            "anchored field lines in a later assessment section satisfied the "
            "hook; the 155-33 contract puts the merge-target fields in Story "
            f"Details, which is what finish treats as authoritative: {errors!r}"
        )


class TestErrorMessageQuality:
    """141-23 contract: an error that halts an agent must tell it how to
    proceed, with a concrete example it can copy."""

    def test_errors_include_fix_instruction(self) -> None:
        errors = _validate_session(MISSING_BOTH)
        assert errors, "no errors to inspect (upstream test covers this)"
        for err in errors:
            assert re.search(r"(?i)to fix:|example:|required format:", err), (
                f"error has no actionable fix instruction: {err!r}"
            )

    def test_errors_show_the_expected_line_shape(self) -> None:
        errors = _validate_session(MISSING_BOTH)
        joined = "\n".join(errors)
        assert re.search(r"\*\*Branch:\*\*", joined) and re.search(
            r"\*\*PR:\*\*", joined
        ), (
            "the errors never show the expected field-line shape, so the agent "
            f"has to guess the exact syntax finish parses: {errors!r}"
        )

    def test_errors_name_the_story_details_section(self) -> None:
        errors = _validate_session(MISSING_BOTH)
        assert any("story details" in e.lower() for e in errors), (
            "the errors do not say WHERE the lines belong; location is the "
            f"whole point (Story Details is authoritative): {errors!r}"
        )

    def test_suggested_shape_actually_parses_as_the_field(self) -> None:
        """Closing the loop: whatever shape the message tells the agent to
        write must be a shape ``SESSION_FIELD_RE`` accepts. A fix instruction
        that produces an unparseable line is worse than none."""
        errors = _validate_session(MISSING_BOTH)
        joined = "\n".join(errors)
        samples = re.findall(r"`([^`]*\*\*\w[\w\s]*:\*\*[^`]*)`", joined)
        assert samples, (
            f"no backtick-quoted example field line in the errors: {errors!r}"
        )
        for sample in samples:
            match = SESSION_FIELD_RE.search(sample.strip())
            assert match, f"suggested line does not parse as a field: {sample!r}"
            assert match.group(1).strip().lower() in ("branch", "pr"), (
                f"suggested line parses as the wrong field: {sample!r}"
            )


# =============================================================================
# AC-3 — placeholders and the forward-compatible PR shape
# =============================================================================


class TestPlaceholdersAccepted:
    """At setup time neither value exists yet. The LINES are the contract; the
    values are placeholders until Step 5 / PR creation fills them."""

    @pytest.mark.parametrize(
        "branch_value",
        [
            "(created in Step 5)",
            "(trunk-based — work happens on the default branch)",
            "feat/162-11-schema-hook-branch-pr-fields",
        ],
    )
    def test_branch_placeholders_pass(self, branch_value: str) -> None:
        content = _session(
            COMMON_DETAILS + f"- **Branch:** {branch_value}\n" + PR_LINE
        )
        assert _validate_session(content) == [], (
            f"legal branch placeholder {branch_value!r} was rejected — the hook "
            "must require the LINE, not a resolved value"
        )

    @pytest.mark.parametrize(
        "pr_value",
        [
            "(none yet — recorded when the PR is created)",
            "(not applicable — no PR for this story)",
            "#182",
        ],
    )
    def test_pr_placeholders_pass(self, pr_value: str) -> None:
        content = _session(COMMON_DETAILS + BRANCH_LINE + f"- **PR:** {pr_value}\n")
        assert _validate_session(content) == [], (
            f"legal PR placeholder {pr_value!r} was rejected"
        )

    def test_unbulleted_field_lines_pass(self) -> None:
        """``SESSION_FIELD_RE``'s list bullet is optional and agents write both
        shapes (Dev assessments are unbulleted). Both must satisfy the hook."""
        content = _session(
            COMMON_DETAILS
            + "**Branch:** feat/162-11-x\n**PR:** (none yet)\n"
        )
        assert _validate_session(content) == [], (
            "unbulleted field lines were rejected even though finish parses "
            "them (the bullet prefix is optional in SESSION_FIELD_RE)"
        )

    def test_lowercased_labels_pass(self) -> None:
        """finish lowercases the label before keying, so a lowercase label IS
        the field. Refusing it would block a session finish can read."""
        content = _session(
            COMMON_DETAILS + "- **branch:** feat/162-11-x\n- **pr:** (none yet)\n"
        )
        assert _validate_session(content) == [], (
            "case-different labels rejected, though _parse_session lowercases "
            "the label and would resolve them fine"
        )


class TestForwardCompatPrShape:
    """162-6 opened multi-repo stories; 162-33 designs per-repo PR recording.
    The hook must not have to be redesigned then — hence at-least-one PR line
    with an optional repo qualifier."""

    def test_per_repo_pr_lines_without_a_bare_pr_line_pass(self) -> None:
        content = _session(
            COMMON_DETAILS
            + BRANCH_LINE
            + "- **PR (pennyfarthing):** #182\n"
            + "- **PR (orchestrator):** #63\n"
        )
        assert _validate_session(content) == [], (
            "the per-repo PR shape 162-33 will introduce was refused — the "
            "hook would have to be redesigned to ship that story"
        )

    def test_bracketed_repo_qualifier_passes(self) -> None:
        content = _session(
            COMMON_DETAILS + BRANCH_LINE + "- **PR [ui]:** #7\n"
        )
        assert _validate_session(content) == [], (
            "bracketed per-repo PR qualifier refused"
        )

    def test_bare_plus_per_repo_pr_lines_pass(self) -> None:
        """Multiple PR lines are not a duplicate-field error: today's parser
        takes first-wins, and a summary line beside per-repo lines is the
        likeliest transitional shape."""
        content = _session(
            COMMON_DETAILS
            + BRANCH_LINE
            + PR_LINE
            + "- **PR (pennyfarthing):** #182\n"
        )
        assert _validate_session(content) == [], (
            "a bare PR line alongside per-repo PR lines was refused"
        )


# =============================================================================
# AC-2 — everything else keeps passing
# =============================================================================


class TestAllowedWrites:
    def test_complete_session_passes(self) -> None:
        assert _validate_session(COMPLETE) == [], (
            "the canonical 155-33-template session was rejected — the hook "
            "would block every legal session write"
        )

    def test_archive_path_is_not_a_session_file(self) -> None:
        assert _get_file_type(ARCHIVE_PATH) is None, (
            "an archived session was classified as a live session file; finish "
            "rewrites archives and must not be blocked by this hook"
        )

    def test_archived_session_write_allowed(self) -> None:
        out = _run_hook(_write_payload(ARCHIVE_PATH, MISSING_BOTH))
        assert out.get("permissionDecision") == "allow", (
            f"archived session write was not allowed: {out!r}"
        )

    def test_non_session_markdown_allowed(self) -> None:
        out = _run_hook(_write_payload("/project/docs/notes.md", MISSING_BOTH))
        assert out.get("permissionDecision") == "allow", (
            f"an unrelated markdown write was blocked: {out!r}"
        )

    def test_source_file_allowed(self) -> None:
        out = _run_hook(_write_payload("/project/src/pf/app.py", "x = 1\n"))
        assert out.get("permissionDecision") == "allow", (
            f"a source write was blocked: {out!r}"
        )

    def test_session_named_file_outside_session_dir_allowed(self) -> None:
        assert _get_file_type("/project/docs/162-11-session.md") is None, (
            "a doc that merely ends in -session.md was treated as a session"
        )

    def test_skill_write_unaffected(self) -> None:
        """Skill validation must not inherit session field errors."""
        content = "---\nname: t\ndescription: d\n---\n<run>x</run>\n<output>y</output>"
        out = _run_hook(_write_payload("/project/skills/t/SKILL.md", content))
        assert out.get("permissionDecision") == "allow", (
            f"a valid skill write picked up session-field errors: {out!r}"
        )

    def test_step_write_unaffected(self) -> None:
        content = "<purpose>p</purpose>\n<instructions>i</instructions>\n<output>o</output>"
        out = _run_hook(
            _write_payload("/project/workflows/tdd/steps/step-01.md", content)
        )
        assert out.get("permissionDecision") == "allow", (
            f"a valid step write picked up session-field errors: {out!r}"
        )


class TestHookDenies:
    """End-to-end through ``main()``: the refusal must actually reach Claude
    Code as a deny decision, not just exist as a list of strings."""

    def test_write_missing_both_is_denied(self) -> None:
        out = _run_hook(_write_payload(SESSION_PATH, MISSING_BOTH))
        assert out.get("permissionDecision") == "deny", (
            "the hook allowed a session write with neither merge-target field "
            f"line — the mechanical backstop does not exist: {out!r}"
        )
        reason = out.get("permissionDecisionReason", "")
        assert _flagged([reason]) == {"branch", "pr"}, (
            f"deny reason does not name both missing lines: {reason!r}"
        )
        assert SESSION_PATH in reason, (
            f"deny reason does not say which file to fix: {reason!r}"
        )

    def test_write_missing_branch_only_is_denied(self) -> None:
        out = _run_hook(_write_payload(SESSION_PATH, MISSING_BRANCH))
        assert out.get("permissionDecision") == "deny", (
            f"session write missing only the branch line was allowed: {out!r}"
        )

    def test_complete_write_is_allowed(self) -> None:
        out = _run_hook(_write_payload(SESSION_PATH, COMPLETE))
        assert out.get("permissionDecision") == "allow", (
            "a complete session write was blocked — this hook runs on every "
            f"agent's session write and would deadlock the pipeline: {out!r}"
        )


class TestScopeBoundaries:
    """Pinned non-goals. Changing any of these is a design decision, not a
    cleanup."""

    def test_xml_session_keeps_xml_only_validation(self) -> None:
        """An XML-shaped session has no markdown Story Details block; its own
        required tags are already validated. Field enforcement is the markdown
        contract (see module docstring, boundary 2)."""
        content = (
            '<session story="162-11" workflow="tdd">\n'
            "<meta><jira>PROJ-1</jira><started>2026-08-05</started></meta>\n"
            '<status phase="red">in_progress</status>\n'
            "</session>\n"
        )
        assert _validate_session(content) == [], (
            "the XML session shape picked up markdown Story Details field "
            "errors — out of scope for 162-11"
        )

    def test_edit_tool_still_allowed(self) -> None:
        """The hook validates Write only (Edit sees a fragment, not the whole
        file, so content checks are meaningless). Session Edits stay allowed —
        a known gap, not this story's scope."""
        out = _run_hook(
            {
                "tool_name": "Edit",
                "tool_input": {
                    "file_path": SESSION_PATH,
                    "old_string": "a",
                    "new_string": "b",
                },
            }
        )
        assert out.get("permissionDecision") == "allow", (
            f"Edit on a session file was blocked: {out!r}"
        )

    def test_malformed_stdin_never_blocks(self) -> None:
        """A hook crash must never wedge an agent: bad input exits 0 (SOUL —
        fail open on infrastructure errors, loud on stderr)."""
        with patch("sys.stdin", StringIO("not json")):
            with pytest.raises(SystemExit) as exc:
                schema_validation.main()
        assert exc.value.code == 0, (
            f"malformed hook input exited {exc.value.code}, wedging the agent"
        )


def test_module_imports_cleanly() -> None:
    """Guard against the hook module being renamed out from under the CLI
    dispatch (``pf hooks schema-validation``)."""
    assert "pf.hooks.schema_validation" in sys.modules
    assert callable(schema_validation.main)
