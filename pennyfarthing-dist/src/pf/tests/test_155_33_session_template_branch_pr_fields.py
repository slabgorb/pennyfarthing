"""Tests for story 155-33: the sm-setup session template omits the
``**Branch:**`` and ``**PR:**`` fields, so ``finish_story`` silently skips
the merge and marks the story done (hit live on 155-32).

The live incident (ground truth: orchestrator commit e0f2747)
-------------------------------------------------------------
``agents/sm-setup.md`` Step 4 writes a Story Details block with no
``- **Branch:**`` and no ``- **PR:**`` line. ``story_finish``'s
``_extract_branch``/``_extract_pr_number`` read exactly those two session
fields, and the ``gh pr list --head`` fallback is gated on ``branch`` being
truthy — so neither resolved, Step 2 recorded ``skipped``, and 155-1's
load-bearing merge verification (resolved-PR path only) was bypassed:
PR #162 stayed OPEN while the story went ``done``. A second live failure
mode hides in the same session: Dev hand-wrote ``**Branch:**
`feat/155-32-...` (pushed)`` — markdown backticks that ``_extract_branch``
does not strip, so even that field could never have resolved a PR.

Every pre-existing finish fixture hand-writes both fields, so no test
exercised the real template. This suite closes that pipeline gap (SOUL #1)
by deriving its sessions from the template fence in ``agents/sm-setup.md``.

Acceptance criteria (defined by TEA per context-story-155-33.md)
----------------------------------------------------------------
- AC-1: the Step 4 session template's Story Details block contains a
  ``- **Branch:**`` line and a ``- **PR:**`` line, and the document
  instructs (outside the template fence) how the real branch is recorded
  into the ``**Branch:**`` field.
- AC-2: a session instantiated from the template round-trips through
  ``_parse_session``: the Branch value resolves to the real branch (or a
  safe None placeholder — never garbage: no ``{...}`` residue, no
  backticks), and the PR placeholder yields NO phantom number.
- AC-3: ``_extract_branch`` tolerates the value shapes agents actually
  write: markdown backticks (the live 155-32 shape) are stripped, and
  none-sentinels (``none``/``N/A``/``-``/``—``, any case) resolve to None
  so finish never probes ``gh pr list --head none`` (lang-review #1/#11 —
  a garbage probe silently returns nothing, which IS the silent skip).
- AC-4: end-to-end, a session shaped exactly like the template (with the
  Branch field recorded as Step 5 instructs) leads ``finish_story`` to
  resolve the PR from the branch and INVOKE the merge — the 155-32 silent
  skip is dead.
- AC-5 (guards): plain hand-written fields and trailing-annotation
  stripping keep working; ``_extract_pr_number`` keeps parsing
  ``#N - title`` shapes.

Designed interface (for Dev — tests bind only to the essentials)
----------------------------------------------------------------
Template (``agents/sm-setup.md`` Step 4 Story Details block)::

    - **Branch:** (created in Step 5)
    - **PR:** (none yet — recorded when the PR is created)

plus a Step 5 instruction to replace the ``**Branch:**`` value with the
real branch name, UNWRAPPED (no backticks); the trunk-based arm keeps a
parenthesized note (parenthesized values already extract to None). Any
placeholder style works — these tests instantiate ``{STORY_ID}``/``{SLUG}``
/``{BRANCH}``-style placeholders and also simulate the Step 5 field update.

``story_finish._extract_branch`` hardening: strip surrounding backticks
(before/after the existing annotation strip) and map a case-insensitive
sentinel set {none, n/a, na, null, -, —} to None.

Scope boundary: what finish does when NO branch/PR resolves at all
(unmerged-commits abort) is sibling story 155-34 — deliberately not pinned
here. The none-sentinel test only asserts the garbage probe disappears.

RED on HEAD (fail on assertions, right reasons):
  - TestTemplateFields (3): Branch line, PR line, outside-fence instruction.
  - TestTemplateRoundTrip::test_branch_field_fillable_and_resolves.
  - TestExtractBranchHardening: backtick and sentinel cases.
  - TestFinishFromTemplateSession (3): template session merge, backticked
    field merge, none-sentinel probe guard.
Green-on-arrival guards (documented as intentional in the session file):
  - round-trip garbage-free + phantom-PR-free, plain/annotation extraction,
    ``_extract_pr_number`` shapes.
"""

import json
import re
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import (
    _extract_branch,
    _extract_pr_number,
    _parse_session,
    finish_story,
)

DIST_DIR = Path(__file__).resolve().parents[3]
TEMPLATE = DIST_DIR / "agents" / "sm-setup.md"

#: Canonical fixture values. BRANCH is deliberately the composition of
#: ``feat/{STORY_ID}-{SLUG}`` so a template placeholder written either as
#: ``{BRANCH}`` or as ``feat/{STORY_ID}-{SLUG}`` instantiates to the same
#: string and the assertions stay fix-agnostic.
STORY_ID = "155-33"
SLUG = "tpl-slug"
BRANCH = f"feat/{STORY_ID}-{SLUG}"

_SUBS = {
    "STORY_ID": STORY_ID,
    "JIRA_KEY": "",
    "EPIC_JIRA_KEY": "155",
    "WORKFLOW": "tdd",
    "TITLE": "template round-trip fixture",
    "NOW": "2026-08-01T00:00:00Z",
    "SLUG": SLUG,
    "BRANCH": BRANCH,
    "DEPENDS_ON": "none",
}


# =============================================================================
# Template helpers
# =============================================================================


def _template_text() -> str:
    return TEMPLATE.read_text(encoding="utf-8")


def _step4_fence() -> str:
    """The session-file markdown fence inside Step 4 of sm-setup.md."""
    text = _template_text()
    section = re.search(
        r"## Step 4: Write Session File(.*?)## Step 4b:", text, re.DOTALL
    )
    assert section, "sm-setup.md: Step 4 section not found — template restructured?"
    fence = re.search(r"```markdown\n(.*?)```", section.group(1), re.DOTALL)
    assert fence, "sm-setup.md: Step 4 session-file fence not found"
    return fence.group(1)


def _story_details_block(fence: str) -> str:
    m = re.search(r"## Story Details\n(.*?)(?=\n## )", fence, re.DOTALL)
    assert m, "session template has no '## Story Details' block"
    return m.group(0)


def _instantiate(fence: str) -> str:
    """Fill the template's ``{PLACEHOLDER}`` slots with realistic values.

    Known placeholders substitute by name (``{DEPENDS_ON or "none"}`` keys on
    its leading token). An UNKNOWN placeholder on the ``**Branch:**`` line
    substitutes to the canonical branch (whatever name Dev picks for it must
    hold the branch); unknown placeholders elsewhere become ``x``.
    """
    out_lines = []
    for line in fence.splitlines():
        on_branch_line = bool(re.match(r"\s*(?:-\s*)?\*\*Branch:\*\*", line))

        def _sub(m: re.Match[str], _branch_line: bool = on_branch_line) -> str:
            token = m.group(1).strip().split()[0].strip('"') if m.group(1).strip() else ""
            if token in _SUBS:
                return _SUBS[token]
            return BRANCH if _branch_line else "x"

        out_lines.append(re.sub(r"\{([^}]*)\}", _sub, line))
    return "\n".join(out_lines) + "\n"


def _fill_branch_field(session_text: str, branch: str) -> str:
    """Simulate the Step 5 instruction: record the real branch in the
    ``**Branch:**`` field. Deliberately a NO-OP when the template offers no
    such field — that absence is exactly today's bug, so the downstream
    asserts go red instead of the fixture inventing the field (the
    hand-written-fixture gap this suite exists to close).
    """
    return re.sub(
        r"(?m)^(\s*(?:-\s*)?\*\*Branch:\*\*).*$", rf"\1 {branch}", session_text
    )


def _parse_text(tmp_path: Path, text: str) -> dict[str, str]:
    p = tmp_path / "roundtrip-session.md"
    p.write_text(text, encoding="utf-8")
    return _parse_session(p)


# =============================================================================
# AC-1 — template structure (RED: neither field line exists today)
# =============================================================================


class TestTemplateFields:
    def test_story_details_has_branch_field(self) -> None:
        block = _story_details_block(_step4_fence())
        assert re.search(r"(?m)^\s*-\s*\*\*Branch:\*\*", block), (
            "sm-setup.md Step 4 Story Details block has no '- **Branch:**' "
            "line — finish_story._extract_branch reads exactly this field; "
            "without it the gh pr list --head fallback never fires (155-32)"
        )

    def test_story_details_has_pr_field(self) -> None:
        block = _story_details_block(_step4_fence())
        assert re.search(r"(?m)^\s*-\s*\*\*PR:\*\*", block), (
            "sm-setup.md Step 4 Story Details block has no '- **PR:**' line — "
            "finish_story._extract_pr_number reads exactly this field; without "
            "it the resolved-PR merge path (155-1 guarantee) is unreachable"
        )

    def test_branch_field_instruction_outside_template(self) -> None:
        """Some instruction outside the Step 4 fence must reference the
        ``**Branch:**`` field (e.g. Step 5's gitflow arm updating it to the
        real branch) — otherwise the field stays a placeholder forever and
        extraction still yields nothing at finish time.
        """
        text = _template_text()
        outside = text.replace(_step4_fence(), "")
        assert re.search(r"\*\*Branch:\*\*", outside), (
            "sm-setup.md never mentions the '**Branch:**' field outside the "
            "session template fence — nothing instructs the subagent to "
            "record the real branch into it ('**Branch Strategy:**' prose "
            "does not parse as the 'branch' session field)"
        )


# =============================================================================
# AC-2 — template → _parse_session round trip
# =============================================================================


class TestTemplateRoundTrip:
    def test_branch_field_fillable_and_resolves(self, tmp_path: Path) -> None:
        """RED: after simulating the Step 5 field update on an instantiated
        template, the branch must extract exactly. Today the template has no
        Branch line, the fill is a no-op, and extraction yields None.
        """
        filled = _fill_branch_field(_instantiate(_step4_fence()), BRANCH)
        fields = _parse_text(tmp_path, filled)
        assert _extract_branch(fields) == BRANCH, (
            "a session written from the sm-setup template cannot carry the "
            "work branch — finish_story has nothing to resolve the PR from"
        )

    def test_instantiated_branch_value_never_garbage(self, tmp_path: Path) -> None:
        """Green guard: fresh from the template (before Step 5 fills it), the
        Branch value must be either the branch or a safe None placeholder —
        never placeholder residue or backticks that would send garbage to
        ``gh pr list --head``.
        """
        fields = _parse_text(tmp_path, _instantiate(_step4_fence()))
        extracted = _extract_branch(fields)
        assert extracted in (None, BRANCH), (
            f"template Branch value extracts to garbage: {extracted!r}"
        )
        if extracted is not None:
            assert "{" not in extracted and "`" not in extracted

    def test_pr_placeholder_yields_no_phantom_number(self, tmp_path: Path) -> None:
        """Green guard: the template's PR placeholder must not parse as a PR
        number (a literal example like ``#123`` would make finish merge PR
        #123). At setup time the PR does not exist yet — None is the only
        truthful extraction.
        """
        fields = _parse_text(tmp_path, _instantiate(_step4_fence()))
        assert _extract_pr_number(fields) is None, (
            f"template PR placeholder parses as PR "
            f"#{_extract_pr_number(fields)} — finish would act on a phantom PR"
        )


# =============================================================================
# AC-3 — _extract_branch hardening for agent-written value shapes
# =============================================================================


class TestExtractBranchHardening:
    @pytest.mark.parametrize(
        "raw",
        [
            "`feat/155-33-x`",
            "`feat/155-33-x` (pushed)",
        ],
    )
    def test_backticked_value_strips_to_branch(self, raw: str) -> None:
        """RED: markdown backticks are how agents idiomatically write code
        values — the archived 155-32 session's Dev assessment wrote exactly
        ``**Branch:** `feat/155-32-...` (pushed)``. Backticks must strip, or
        the gh pr list --head probe queries a branch name that cannot exist.
        """
        assert _extract_branch({"branch": raw}) == "feat/155-33-x", (
            f"backticks not stripped from session branch value {raw!r} — "
            "the live 155-32 field shape can never resolve a PR"
        )

    @pytest.mark.parametrize(
        "raw", ["none", "None", "NONE", "n/a", "N/A", "na", "null", "-", "—"]
    )
    def test_none_sentinels_resolve_to_none(self, raw: str) -> None:
        """RED: agents write 'none' family sentinels for no-branch worlds
        (the template itself uses ``{DEPENDS_ON or "none"}``). A truthy
        sentinel reaches ``gh pr list --head none`` — a garbage probe whose
        empty answer silently skips the merge (lang-review #1/#11).
        """
        assert _extract_branch({"branch": raw}) is None, (
            f"sentinel branch value {raw!r} extracted as a real branch name"
        )

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("feat/155-33-x", "feat/155-33-x"),
            ("feat/155-33-x (pushed)", "feat/155-33-x"),
            ("", None),
            ("(created in Step 5)", None),
            ("(trunk-based — work happens on the default branch)", None),
        ],
    )
    def test_existing_shapes_preserved(self, raw: str, expected: str | None) -> None:
        """Green guards: plain values, trailing-annotation strip, and fully
        parenthesized placeholders (the designed trunk-based/pre-Step-5
        interface) must keep their current behavior.
        """
        assert _extract_branch({"branch": raw}) == expected


class TestExtractPrNumberGuards:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("#999 - short title", "999"),
            ("`#999`", "999"),
            ("(none yet — recorded when the PR is created)", None),
            ("", None),
        ],
    )
    def test_pr_number_shapes(self, raw: str, expected: str | None) -> None:
        """Green guards (AC-5): the PR extractor already handles backticks
        and safely ignores parenthesized placeholders — pin it so the
        template's designed PR placeholder stays safe.
        """
        assert _extract_pr_number({"pr": raw}) == expected


# =============================================================================
# AC-4 — end-to-end: template-shaped session must reach the merge
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test15533"
  jira_sprint_id: 999
  jira_sprint_name: "Test15533"
  goal: Session template must carry Branch/PR fields into finish
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
  - id: 155-33
    title: sm-setup session template omits Branch/PR fields
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

_FRONTMATTER = """\
---
story_id: "155-33"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-33: hand-written session fixtures
"""

#: The live 155-32 failure shape #2: the only Branch field in the session is
#: Dev's hand-written, backtick-wrapped one.
SESSION_BACKTICKED_BRANCH = (
    _FRONTMATTER
    + f"""
## Story Details
- **ID:** 155-33
- **Workflow:** tdd

## Dev Assessment
**Branch:** `{BRANCH}` (pushed)
"""
)

SESSION_SENTINEL_BRANCH = (
    _FRONTMATTER
    + """
## Story Details
- **ID:** 155-33
- **Workflow:** tdd
- **Branch:** none
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
    (session_dir / "155-33-session.md").write_text(session_body, encoding="utf-8")
    return tmp_path


def _make_branch_resolving_run(branch_to_pr: dict[str, str]):
    """Stateful gh fake (155-29 shape) + a recorder of every ``--head`` value.

    - ``gh pr list --head X`` answers from ``branch_to_pr`` — ONLY an exact,
      clean branch name resolves a PR (backticked/garbage heads get "").
    - ``gh pr view`` reports OPEN/MERGEABLE/CLEAN until a successful merge.
    - ``gh pr merge`` rc=0 flips the state to MERGED.
    """
    state = {"merged": False}
    seen: dict[str, list[str]] = {"list_heads": []}

    def _fake_run(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            state["merged"] = True
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
            return MagicMock(
                returncode=0, stdout=branch_to_pr.get(head, ""), stderr=""
            )
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run, seen


def _merge_invoked(fake: MagicMock) -> bool:
    for call in fake.call_args_list:
        argv = [str(x) for x in call.args[0]]
        if "merge" in argv:
            return True
    return False


class TestFinishFromTemplateSession:
    """The pipeline-gap killers: sessions derived from the REAL template (or
    the real hand-written shapes), never from hand-crafted fields the
    template does not actually produce.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_template_session_resolves_branch_and_merges(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-4): instantiate the CURRENT template, apply the Step 5
        field update it documents, and finish must resolve PR #777 from the
        branch and merge it. Today the template offers no Branch field, the
        fill no-ops, and finish records Step 2 skipped — exactly the 155-32
        incident.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        session = _fill_branch_field(_instantiate(_step4_fence()), BRANCH)
        project = _make_project(tmp_path, session)
        fake_fn, seen = _make_branch_resolving_run({BRANCH: "777"})
        fake = MagicMock(side_effect=fake_fn)

        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-33")

        assert _merge_invoked(fake), (
            "finish never attempted the merge: the template-derived session "
            "carried no resolvable Branch/PR field, so Step 2 silently "
            "skipped — the 155-32 done-while-PR-open incident"
        )
        assert seen["list_heads"] == [BRANCH], (
            f"gh pr list --head was probed with {seen['list_heads']!r} "
            f"instead of the clean branch name {BRANCH!r}"
        )
        assert result["success"] is True
        step2 = [
            s
            for s in result.get("steps", [])
            if s.get("step") == 2 and s.get("action") == "merge_pr"
        ]
        assert step2 and step2[0].get("merged") is True, (
            f"step 2 record is not a truthful merge: {step2!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_backticked_branch_field_resolves_and_merges(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-3 end-to-end): a session whose only Branch field is the
        hand-written, backtick-wrapped Dev shape (verbatim from the archived
        155-32 session) must still resolve and merge the PR.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_project(tmp_path, SESSION_BACKTICKED_BRANCH)
        fake_fn, seen = _make_branch_resolving_run({BRANCH: "888"})
        fake = MagicMock(side_effect=fake_fn)

        with patch("pf.sprint.story_finish._run", fake):
            finish_story(project, "155-33")

        assert seen["list_heads"] == [BRANCH], (
            f"gh pr list --head probed {seen['list_heads']!r} — the "
            "backticked Branch value did not normalize to the clean branch "
            f"name {BRANCH!r} (the live 155-32 hand-written field shape)"
        )
        assert _merge_invoked(fake), (
            "finish skipped the merge despite a resolvable (backticked) "
            "Branch field in the session"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_sentinel_branch_never_probes_gh(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """RED (AC-3): ``**Branch:** none`` must not become
        ``gh pr list --head none``. What finish does INSTEAD in a genuinely
        branchless world is sibling story 155-34's scope — this test only
        pins that the garbage probe disappears.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        project = _make_project(tmp_path, SESSION_SENTINEL_BRANCH)
        fake_fn, seen = _make_branch_resolving_run({})
        fake = MagicMock(side_effect=fake_fn)

        with patch("pf.sprint.story_finish._run", fake):
            finish_story(project, "155-33")

        assert "none" not in seen["list_heads"], (
            "finish probed gh pr list --head none — a sentinel branch value "
            "reached GitHub as a literal branch name; its empty answer is "
            "what silently skips the merge"
        )
