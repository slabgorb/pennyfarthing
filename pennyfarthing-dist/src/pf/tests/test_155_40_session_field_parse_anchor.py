"""Tests for story 155-40: anchor SESSION_FIELD_RE to line start and give the
Story Details section authority over ``Branch:``/``PR:`` resolution.

The live incident (ground truth: sprint/archive/155-33-session.md)
------------------------------------------------------------------
``_parse_session`` runs an UNANCHORED ``SESSION_FIELD_RE.search`` per line and
accumulates last-match-wins. The archived 155-33 session carried CORRECT
Story Details fields, yet finish parsed:

- branch = ``'field like the gitflow arm'`` — a Design Deviation sub-bullet
  ending in "...updating the ``**Branch:**`` field like the gitflow arm" was
  the LAST line whose mid-prose token matched; ``_extract_branch`` then
  stripped the stray backtick and served the prose fragment as a branch.
- pr = ``None`` — a Delivery Finding ("who records the ``**PR:**`` field
  when SM pre-creates the PR...") matched mid-prose with no ``#N`` in its
  tail, overriding the real ``- **PR:** #165`` field.

Result: ``gh pr list --head 'field like the gitflow arm'`` answered empty,
Step 2 took the no-PR SKIPPED arm, and the story went done while PR #165
stayed OPEN — the exact done-while-PR-open class this epic exists to kill.
A richer, better-documented session is MORE likely to trip this than a
sparse one.

Acceptance criteria (defined by TEA per context-story-155-40.md)
----------------------------------------------------------------
- AC-1 (anchoring): a field token mentioned MID-LINE in prose — inside any
  section, including Story Details itself — never parses as a field. Only
  lines that START with the field (optionally behind a markdown list
  bullet) match.
- AC-2 (Story Details authority): when the ``## Story Details`` section
  carries a ``Branch:``/``PR:`` field, its value is what finish resolves —
  no later section's field line (line-start or otherwise) overrides it.
- AC-3 (no fabrication): with no real field value, prose mentions yield
  ``None`` — never captured prose garbage, and never a PR number scraped
  out of surrounding prose (``#999`` in a finding's tail must not become
  the merge target).
- AC-4 (end-to-end): a session shaped like the archived 155-33 incident
  (correct Story Details + poison prose below) leads ``finish_story`` to
  probe/merge the REAL branch/PR — the silent no-PR skip and the
  wrong-PR merge are both dead.
- AC-5 (preservation): the shapes shipped siblings rely on keep working —
  bulleted and bare line-start fields inside Story Details parse; the
  155-33 fallback (a session whose ONLY Branch field is a hand-written
  line-start field in a later section, e.g. Dev Assessment) still
  resolves; annotation/backtick stripping and none-sentinels unchanged;
  ``- **Jira:** PROJ-N`` still resolves.
- AC-6 (rule #5, CWE-838): ``_parse_session``'s ``read_text`` call carries
  ``encoding="utf-8"``.

Contract note — title vs shipped sibling (logged as a Design Deviation)
-----------------------------------------------------------------------
The story title says "scope Branch/PR resolution to Story Details".
Applied STRICTLY that breaks the shipped 155-33 pin
``test_backticked_branch_field_resolves_and_merges``, whose session's only
Branch field lives under ``## Dev Assessment`` (the live 155-32 recovery
shape). These tests therefore pin the compatible contract: Story Details
WINS when it carries the field; an anchored line-start field elsewhere is
FALLBACK only; mid-prose mentions never match anywhere. Any implementation
with those observable properties passes — a Story-Details-first overlay or
an anchored first-match scan both qualify.

RED on HEAD (fail on assertions, right reasons):
  - TestAnchoring (3): mid-prose deviation/finding/inside-details poisons.
  - TestNoFabrication (2): prose-only mentions yield None, never #999.
  - TestStoryDetailsAuthority (2): later line-start field lines lose.
  - TestFinishEndToEnd (2): wrong-PR merge and silent-skip incident replay.
  - TestEncodingRule (1): read_text lacks encoding=.
Green-on-arrival guards (intentional — see session Design Deviations):
  - TestPreservedShapes (4): bullet/bare shapes, 155-33 fallback session,
    normalization + sentinels, Jira field.
"""

import ast
import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pf.sprint.story_finish as story_finish_module
from pf.sprint.story_finish import (
    _extract_branch,
    _extract_jira_key,
    _extract_pr_number,
    _parse_session,
    finish_story,
)

# =============================================================================
# Fixture text — poison lines are verbatim-derived from the archived
# 155-33 session (sprint/archive/155-33-session.md).
# =============================================================================

REAL_BRANCH = "feat/155-40-real-branch"

#: Archived line 259 (Design Deviation sub-bullet) — the mid-prose match that
#: last-wins parsing served as the branch: 'field like the gitflow arm'.
POISON_DEVIATION_LINE = (
    "  - Implementation: the stacked arm (`gt create feat/{STORY_ID}-{SLUG}`) "
    "also instructs updating the `**Branch:**` field like the gitflow arm"
)

#: Archived line 208 (Delivery Finding) — the mid-prose match whose tail has
#: no ``#N``, poisoning pr to None (the silent no-PR skip).
POISON_FINDING_LINE_NO_DIGITS = (
    "- **Question** (non-blocking): who records the `**PR:**` field when SM "
    "pre-creates the PR at finish time? Affects `pennyfarthing-dist/agents/sm.md` "
    "(out of this story's file scope). *Found by TEA during test design.*"
)

#: The nastier variant of the same finding shape: the prose tail carries an
#: issue reference, so today's parser FABRICATES pr=999 out of prose.
POISON_FINDING_LINE_WITH_NUMBER = (
    "- **Question** (non-blocking): who records the `**PR:**` field when SM "
    "pre-creates it? (see the #999 discussion). *Found by TEA during test design.*"
)

#: Archived line 119 shape — Dev hand-writes the branch at LINE START in its
#: own assessment section. A different value than Story Details makes the
#: override observable.
WRONG_SECTION_BRANCH_LINE = "**Branch:** feat/155-40-wrong-section (pushed, commits abc1234)"
WRONG_SECTION_PR_LINE = "**PR:** #999 - wrong-section hand-written note"

FRONTMATTER = """\
---
story_id: "155-40"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-40: session field parse fixture
"""

STORY_DETAILS_FULL = f"""
## Story Details
- **ID:** 155-40
- **Workflow:** tdd
- **Branch:** {REAL_BRANCH}
- **PR:** #288 - session field parsing fix
"""

STORY_DETAILS_PR_PLACEHOLDER = f"""
## Story Details
- **ID:** 155-40
- **Workflow:** tdd
- **Branch:** {REAL_BRANCH}
- **PR:** (none yet — recorded when the PR is created)
"""


def _parse_text(tmp_path: Path, text: str) -> dict[str, str]:
    p = tmp_path / "155-40-session.md"
    p.write_text(text, encoding="utf-8")
    return _parse_session(p)


# =============================================================================
# AC-1 — anchoring: mid-prose token mentions never parse as fields
# =============================================================================


class TestAnchoring:
    def test_mid_prose_deviation_cannot_poison_branch(self, tmp_path: Path) -> None:
        """RED: the verbatim 155-33 deviation line must not override the real
        Story Details Branch field. Today last-wins hands finish the prose
        fragment 'field like the gitflow arm' as the branch.
        """
        body = (
            FRONTMATTER
            + STORY_DETAILS_FULL
            + "\n## Design Deviations\n\n- **Stacked-arm instruction beyond spec wording**\n"
            + POISON_DEVIATION_LINE
            + "\n"
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            "a mid-prose `Branch:` token mention in a Design Deviation overrode "
            "the real Story Details field — the 155-33 poisoning is alive"
        )

    def test_mid_prose_finding_cannot_poison_pr(self, tmp_path: Path) -> None:
        """RED: the verbatim 155-33 finding line must not override the real
        Story Details PR field. Today last-wins captures a prose tail with no
        #N, so pr resolves to None and Step 2 takes the silent no-PR arm.
        """
        body = (
            FRONTMATTER
            + STORY_DETAILS_FULL
            + "\n## Delivery Findings\n\n"
            + POISON_FINDING_LINE_NO_DIGITS
            + "\n"
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_pr_number(fields) == "288", (
            "a mid-prose `PR:` token mention in a Delivery Finding overrode the "
            "real Story Details field — finish would silently skip the merge"
        )

    def test_mid_prose_inside_story_details_cannot_poison(self, tmp_path: Path) -> None:
        """RED: anchoring must hold INSIDE Story Details too — a prose note
        bullet mentioning the token mid-line is not a field. This is the pin
        that section-scoping alone cannot satisfy.
        """
        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 155-40
- **Branch:** {REAL_BRANCH}
- Note: Step 5 updates the `**Branch:**` field like the gitflow arm
- **PR:** #288 - session field parsing fix
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            "a mid-prose token mention inside Story Details itself overrode "
            "the real field — the parser is scoped but still unanchored"
        )


# =============================================================================
# AC-3 — no fabrication: prose-only mentions resolve to None, never garbage
# =============================================================================


class TestNoFabrication:
    def test_prose_only_branch_mention_yields_none(self, tmp_path: Path) -> None:
        """RED: with NO Branch field anywhere (pre-155-33 session shape), a
        mid-prose mention must not manufacture a branch. Today it yields
        'field like the gitflow arm', which reaches `gh pr list --head`.
        """
        body = (
            FRONTMATTER
            + """
## Story Details
- **ID:** 155-40
- **Workflow:** tdd

## Design Deviations

- **Stacked-arm instruction beyond spec wording**
"""
            + POISON_DEVIATION_LINE
            + "\n"
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) is None, (
            f"prose-only mention fabricated branch "
            f"{_extract_branch(fields)!r} — garbage reaches gh pr list --head"
        )

    def test_prose_pr_mention_never_fabricates_number(self, tmp_path: Path) -> None:
        """RED: the PR placeholder is the field's value; a later prose mention
        whose tail contains '#999' must not become the merge target. Today
        last-wins captures the tail and finish would merge PR #999.
        """
        body = (
            FRONTMATTER
            + STORY_DETAILS_PR_PLACEHOLDER
            + "\n## Delivery Findings\n\n"
            + POISON_FINDING_LINE_WITH_NUMBER
            + "\n"
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_pr_number(fields) is None, (
            f"prose mention fabricated PR #{_extract_pr_number(fields)} — "
            "finish would merge a PR scraped out of a finding's prose"
        )


# =============================================================================
# AC-2 — Story Details authority over later field-shaped lines
# =============================================================================


class TestStoryDetailsAuthority:
    def test_story_details_branch_beats_later_assessment_field(
        self, tmp_path: Path
    ) -> None:
        """RED: a hand-written line-start Branch field in a LATER section (the
        archived 155-33 Dev Assessment shape) must not override Story
        Details. Today last-wins serves the assessment's value.
        """
        body = (
            FRONTMATTER
            + STORY_DETAILS_FULL
            + "\n## Dev Assessment\n\n"
            + WRONG_SECTION_BRANCH_LINE
            + "\n"
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            "a line-start Branch field in Dev Assessment overrode Story "
            "Details — the authoritative section lost to later prose sections"
        )

    def test_story_details_pr_beats_later_assessment_field(
        self, tmp_path: Path
    ) -> None:
        """RED: same authority pin for the PR field — #288 in Story Details
        must beat a hand-written #999 in a later section.
        """
        body = (
            FRONTMATTER
            + STORY_DETAILS_FULL
            + "\n## Dev Assessment\n\n"
            + WRONG_SECTION_PR_LINE
            + "\n"
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_pr_number(fields) == "288", (
            "a line-start PR field in Dev Assessment overrode Story Details — "
            "finish would merge the wrong PR"
        )


# =============================================================================
# AC-5 — preservation guards (green on arrival; intentional — see session
# Design Deviations). These stop an over-strict fix from breaking the shapes
# shipped siblings and live sessions rely on.
# =============================================================================


class TestPreservedShapes:
    def test_bulleted_story_details_fields_parse(self, tmp_path: Path) -> None:
        """Green guard: the sm-setup template writes Story Details as a
        bullet list — an anchor that rejects the `- ` prefix would blank
        every field the 155-33 template contract guarantees.
        """
        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 155-40
- **Jira:** PROJ-14467
- **Branch:** {REAL_BRANCH}
- **PR:** #748 - bulleted shape guard
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH
        assert _extract_pr_number(fields) == "748"
        assert _extract_jira_key(fields) == "PROJ-14467"

    def test_bare_line_start_field_in_story_details_parses(
        self, tmp_path: Path
    ) -> None:
        """Green guard: an unbulleted line-start field inside Story Details
        (the shape Step 5's field update can produce) keeps parsing.
        """
        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 155-40
**Branch:** {REAL_BRANCH}
**PR:** #288 - bare shape guard
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH
        assert _extract_pr_number(fields) == "288"

    def test_fallback_to_later_section_when_story_details_lacks_field(
        self, tmp_path: Path
    ) -> None:
        """Green guard (sibling compat): the shipped 155-33 pin
        ``test_backticked_branch_field_resolves_and_merges`` requires a
        session whose ONLY Branch field is Dev's hand-written line-start,
        backticked one to still resolve. An over-strict Story-Details-only
        scope breaks that live-incident recovery — fallback must survive.
        """
        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 155-40
- **Workflow:** tdd

## Dev Assessment
**Branch:** `{REAL_BRANCH}` (pushed)
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            "the 155-33 fallback died: a session whose only Branch field is "
            "the hand-written Dev Assessment line no longer resolves"
        )

    def test_normalization_and_sentinels_preserved_through_parse(
        self, tmp_path: Path
    ) -> None:
        """Green guard: backtick/annotation stripping and none-sentinels
        (155-33 ``_extract_branch`` hardening) keep working through the
        full parse path.
        """
        backticked = (
            FRONTMATTER
            + f"""
## Story Details
- **Branch:** `{REAL_BRANCH}` (pushed)
"""
        )
        assert _extract_branch(_parse_text(tmp_path, backticked)) == REAL_BRANCH

        sentinel = (
            FRONTMATTER
            + """
## Story Details
- **Branch:** none
"""
        )
        assert _extract_branch(_parse_text(tmp_path, sentinel)) is None


# =============================================================================
# AC-4 — end-to-end: finish_story on a poisoned session (155-1/155-33 harness)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test15540"
  jira_sprint_id: 999
  jira_sprint_name: "Test15540"
  goal: Session field parsing must survive prose mentions
  start_date: 2026-08-01
  end_date: 2026-08-14
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
  - id: 155-40
    title: Session field parsing anchor and Story Details authority
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

#: Full verbatim-shaped incident replica: correct Story Details, then the
#: three poison shapes below it in archive order (assessment field line,
#: finding with #999, deviation prose).
SESSION_POISONED_WITH_PR = (
    FRONTMATTER
    + STORY_DETAILS_FULL
    + f"""
## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Dev Assessment

{WRONG_SECTION_BRANCH_LINE}

## Delivery Findings

{POISON_FINDING_LINE_WITH_NUMBER}

## Design Deviations

- **Stacked-arm instruction beyond spec wording**
{POISON_DEVIATION_LINE}
"""
)

#: The exact live-incident variant: PR field still the placeholder (SM had
#: not recorded it), poison tails carry no digits — today branch parses to
#: prose garbage, pr to None, and Step 2 silently skips.
SESSION_POISONED_INCIDENT = (
    FRONTMATTER
    + STORY_DETAILS_PR_PLACEHOLDER
    + f"""
## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

{POISON_FINDING_LINE_NO_DIGITS}

## Design Deviations

- **Stacked-arm instruction beyond spec wording**
{POISON_DEVIATION_LINE}
"""
)


def _make_project(tmp_path: Path, session_body: str) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML, encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "155-40-session.md").write_text(session_body, encoding="utf-8")
    return tmp_path


def _make_stateful_run(branch_to_pr: dict[str, str]):
    """Stateful gh fake (155-29/155-33 shape) + recorders.

    - ``gh pr list --head X`` answers from ``branch_to_pr``; every probed
      head is recorded (garbage heads answer "").
    - ``gh pr view N`` reports OPEN/MERGEABLE/CLEAN until a merge ran.
    - ``gh pr merge N`` rc=0 flips the state to MERGED.
    """
    state = {"merged": False}
    seen: dict[str, list[str]] = {"list_heads": [], "merge_argv": []}

    def _fake_run(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            state["merged"] = True
            seen["merge_argv"].append(" ".join(parts))
            return MagicMock(returncode=0, stdout="", stderr="")
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": "MERGED" if state["merged"] else "OPEN",
                        "mergedAt": "2026-08-01T00:00:00Z" if state["merged"] else None,
                        "mergeable": "MERGEABLE",
                        "mergeStateStatus": "CLEAN",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            head = ""
            if "--head" in parts:
                head = parts[parts.index("--head") + 1]
            seen["list_heads"].append(head)
            return MagicMock(returncode=0, stdout=branch_to_pr.get(head, ""), stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run, seen


class TestFinishEndToEnd:
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_poisoned_session_merges_the_real_pr_not_a_fabricated_one(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-4): Story Details says PR #288; the poison finding's prose
        tail says #999. Finish must merge #288. Today last-wins hands it
        #999 — finish merges a PR scraped out of prose.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_project(tmp_path, SESSION_POISONED_WITH_PR)
        fake_fn, seen = _make_stateful_run({REAL_BRANCH: "288"})
        fake = MagicMock(side_effect=fake_fn)

        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-40")

        assert any("288" in argv for argv in seen["merge_argv"]), (
            f"finish never merged the real PR #288 — merge calls were "
            f"{seen['merge_argv']!r} (a poison prose mention chose the target)"
        )
        assert not any("999" in argv for argv in seen["merge_argv"]), (
            "finish merged PR #999 — a number scraped out of a Delivery "
            "Finding's prose became the merge target"
        )
        assert result["success"] is True, result

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_155_33_incident_replay_no_silent_skip(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-4): the exact incident — placeholder PR field, digit-free
        poisons. Finish must resolve the REAL branch from Story Details,
        probe it, and merge PR #165. Today it probes the prose garbage
        'field like the gitflow arm', gets nothing, silently skips the
        merge, and marks done — done-while-PR-open.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_project(tmp_path, SESSION_POISONED_INCIDENT)
        fake_fn, seen = _make_stateful_run({REAL_BRANCH: "165"})
        fake = MagicMock(side_effect=fake_fn)

        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-40")

        assert seen["list_heads"] == [REAL_BRANCH], (
            f"gh pr list --head probed {seen['list_heads']!r} instead of the "
            f"real Story Details branch {REAL_BRANCH!r} — poison prose chose "
            "the probe target"
        )
        assert seen["merge_argv"], (
            "finish never attempted the merge: the poisoned parse silently "
            "skipped Step 2 and marked done while the PR stayed open — the "
            "155-33 incident, replayed"
        )
        assert result["success"] is True, result


# =============================================================================
# AC-6 — rule enforcement (lang-review python #5, CWE-838)
# =============================================================================


class TestEncodingRule:
    def test_parse_session_read_text_has_encoding(self) -> None:
        """RED: ``_parse_session`` reads the session file without
        ``encoding=`` — platform-dependent decoding of the file this whole
        story is about parsing correctly. Scoped to the function this story
        edits (module-wide sweep is 160-12's pattern, not this story).
        """
        source = Path(story_finish_module.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)
        fn = next(
            (
                node
                for node in ast.walk(tree)
                if isinstance(node, ast.FunctionDef) and node.name == "_parse_session"
            ),
            None,
        )
        assert fn is not None, (
            "_parse_session no longer exists in story_finish — update this pin "
            "to the function that reads the session file"
        )
        calls = [
            node
            for node in ast.walk(fn)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "read_text"
        ]
        assert calls, "_parse_session no longer calls read_text — update this pin"
        for call in calls:
            keywords = {kw.arg: kw for kw in call.keywords}
            assert "encoding" in keywords, (
                "_parse_session's read_text() has no encoding= — decoding "
                "varies by platform (lang-review python #5, CWE-838)"
            )
            value = keywords["encoding"].value
            if isinstance(value, ast.Constant):
                assert value.value == "utf-8", (
                    f"read_text encoding is {value.value!r}, expected 'utf-8'"
                )
