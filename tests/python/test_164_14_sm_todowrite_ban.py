"""
Tests for Story 164-14: SM agent — reconsider TodoWrite ban (or document the reasoning).

Validates that sm.md has a NARROWED and DOCUMENTED rule replacing the bare
"CANNOT: TodoWrite" ban. The new rule must:
  - Remove "TodoWrite" from the bare CANNOT list item.
  - Document WHY the ban exists (implementation task-decomposition violates
    coordination-discipline / "route, don't solve").
  - Distinguish forbidden usage (implementation task-planning, code-level subtasks)
    from permitted usage (coordination-level / story-level progress tracking).
  - Not remove the <coordination-discipline> block or contradict it.

Covers all 3 Acceptance Criteria:
  AC1: Documented reasoning — sm.md explains the ban ties to coordination-discipline
       and implementation task-decomposition being out of SM's lane.
  AC2: Narrowed rule — no bare "TodoWrite" in CANNOT line; forbidden scope
       (implementation task-decomposition) and permitted scope (coordination/story-level
       tracking) are both explicitly stated.
  AC3: Consistency — <coordination-discipline> block still present; no contradiction.

Run with: python -m pytest tests/python/test_164_14_sm_todowrite_ban.py -v
"""

import re
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AGENTS_DIR = Path(__file__).parent.parent.parent / "pennyfarthing-dist" / "agents"
SM_PATH = AGENTS_DIR / "sm.md"


def _read_sm() -> str:
    """Read sm.md, skip test if file is missing."""
    if not SM_PATH.is_file():
        pytest.skip(f"sm.md not found at {SM_PATH}")
    return SM_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# AC1: Documented reasoning
# ---------------------------------------------------------------------------


class TestDocumentedReasoning:
    """AC1: sm.md documents WHY the TodoWrite restriction exists.

    These tests assert new prose/rule text that must be ADDED to sm.md —
    none of the matching phrases exist in the current bare-ban wording.
    """

    def test_implementation_task_decomposition_phrase_present(self) -> None:
        """sm.md must use "implementation task-decomposition" or "code-level subtask" to
        name the forbidden operation.

        Current state has "plan implementation details" (vague) and "create implementation
        tasks" (in a different context, session-new-flow). The scoped rule requires naming
        the exact forbidden operation — implementation task-decomposition.
        """
        content = _read_sm()
        has_scoped_phrase = (
            "implementation task-decomposition" in content.lower()
            or "task-decomposition" in content.lower()
            or "code-level subtask" in content.lower()
            or "code-level task" in content.lower()
        )
        assert has_scoped_phrase, (
            "sm.md missing 'implementation task-decomposition' or 'code-level subtask' "
            "— the narrowed rule must name the specific forbidden operation, not just "
            "list 'TodoWrite' in the CANNOT line"
        )

    def test_todowrite_restriction_has_prose_rationale(self) -> None:
        """The TodoWrite restriction must have a prose rationale, not just a bare list entry.

        Currently 'TodoWrite' appears only on the bare CANNOT list line, with no
        explanatory words like 'because', 'prevents', 'reason', or 'rationale' nearby.
        A documented rule must include WHY the restriction exists.

        Verified that none of these rationale words appear within 200 chars of
        'TodoWrite' in the current sm.md (bare CANNOT list has no prose explanation).
        """
        content = _read_sm()
        has_rationale_near_todowrite = bool(re.search(
            r"(because|prevents|rationale|reason|purpose).{0,200}(todowrite|todo.task tool)"
            r"|(todowrite|todo.task tool).{0,200}(because|prevents|rationale|reason|purpose)",
            content,
            re.IGNORECASE | re.DOTALL,
        ))
        assert has_rationale_near_todowrite, (
            "sm.md has no prose rationale near 'TodoWrite'. The scoped rule must explain "
            "WHY the restriction exists (e.g. 'because implementation task-decomposition "
            "violates coordination-discipline') — not just list it in the CANNOT line."
        )

    def test_reasoning_in_same_block_as_todowrite_restriction(self) -> None:
        """The documented reasoning must appear in proximity to the TodoWrite rule,
        not only in a distant section.

        Currently the coordination-discipline block (lines ~12-24) and the CANNOT
        line (line ~30) are in different XML blocks. After the fix, the scoped rule
        should have its rationale co-located — either inline or immediately adjacent.

        Proxy check: 'implementation' and 'TodoWrite' must appear within 300 characters
        of each other AND be part of a rule (not just a comma-list).
        """
        content = _read_sm()
        # Bare CANNOT list does have "TodoWrite" and "implementation" on the same line,
        # but the rule below requires them to co-appear in a SCOPED context —
        # specifically, 'implementation' must appear BEFORE 'TodoWrite' within 300 chars
        # with explanatory language (not just as comma-separated list items).
        scoped = re.search(
            r"implementation.{0,300}(CANNOT use|must not use|not.*use).{0,300}TodoWrite"
            r"|TodoWrite.{0,300}implementation task",
            content,
            re.IGNORECASE | re.DOTALL,
        )
        assert scoped is not None, (
            "sm.md does not have a scoped rule tying 'implementation' to 'TodoWrite' "
            "with a prohibition phrase (e.g. 'must not use TodoWrite for implementation "
            "task-decomposition'). The bare CANNOT list does not count."
        )


# ---------------------------------------------------------------------------
# AC2: Narrowed rule — forbidden and permitted scopes explicit
# ---------------------------------------------------------------------------


class TestNarrowedRule:
    """AC2: The CANNOT rule is scoped, not a bare blanket ban."""

    def test_todowrite_not_in_bare_cannot_list(self) -> None:
        """'TodoWrite' must be removed from the unqualified CANNOT list line.

        Current sm.md line: '- **CANNOT:** Write/edit code, TodoWrite, plan implementation details'
        After fix: TodoWrite is removed from this comma-separated list and replaced by
        a scoped rule section.
        """
        content = _read_sm()
        bare_cannot = re.search(
            r"\*\*CANNOT:\*\*[^\n]*\bTodoWrite\b",
            content,
        )
        assert bare_cannot is None, (
            f"sm.md still has 'TodoWrite' in the bare **CANNOT:** list: "
            f"{bare_cannot.group() if bare_cannot else ''!r}. "
            "Remove it and replace with a scoped rule."
        )

    def test_permitted_scope_uses_coordination_level_compound(self) -> None:
        """The permitted-scope clause must use 'coordination-level' or 'story-level'
        as a compound descriptor — these specific phrases do not yet exist in sm.md.

        Currently sm.md has 'coordination' (in the discipline block) and 'progress'
        (in stepped-cleanup), but no compound like 'coordination-level tracking' or
        'story-level progress'. The narrowed rule requires explicit permission language.
        """
        content = _read_sm()
        lower = content.lower()
        has_permitted_compound = (
            "coordination-level" in lower
            or "story-level" in lower
            or "multi-story orchestration" in lower
            or "coordination tracking" in lower
            or "progress tracking" in lower and "coordination" in lower
        )
        assert has_permitted_compound, (
            "sm.md missing a permitted-scope compound like 'coordination-level', "
            "'story-level', or 'multi-story orchestration'. The narrowed rule must "
            "EXPLICITLY permit coordination-level tracking — the existing 'allowed' "
            "on the merge-gate line (PRs allowed) does NOT count."
        )

    def test_permitted_todowrite_usage_stated_near_restriction(self) -> None:
        """The permitted scope for TodoWrite must appear near the restriction itself.

        'allowed' currently appears only in the merge-gate section (PRs allowed).
        This test requires a permission clause near 'TodoWrite' or 'todo/task tools'.
        """
        content = _read_sm()
        # Check for permission language near todo/task tool references
        has_near_permission = bool(re.search(
            r"(may use|permitted|can use|allowed).{0,300}(todowrite|todo.task tool|task tool)"
            r"|(todowrite|todo.task tool|task tool).{0,300}(may use|permitted|can use|allowed for)",
            content,
            re.IGNORECASE | re.DOTALL,
        ))
        assert has_near_permission, (
            "sm.md does not contain a permission clause ('may use', 'permitted', 'can use') "
            "near 'TodoWrite' or 'todo/task tools'. The narrowed rule must EXPLICITLY "
            "state that coordination-level tracking is permitted."
        )

    def test_forbidden_scope_uses_must_not_use_phraseology(self) -> None:
        """The forbidden scope must use 'must not use' or 'must not' phrasing near
        'TodoWrite' — the bare CANNOT list heading does not qualify.

        Currently 'must not use' does not appear near 'TodoWrite' in sm.md.
        The 'YOU MUST NOT:' sentence (line ~165) is about reading files, not TodoWrite,
        and is 3700+ chars away from 'TodoWrite' — won't match the proximity check.
        """
        content = _read_sm()
        has_must_not = bool(re.search(
            r"must not.{0,100}(use|apply).{0,100}(todowrite|todo.task tool)"
            r"|(todowrite|todo.task tool).{0,100}must not",
            content,
            re.IGNORECASE | re.DOTALL,
        ))
        assert has_must_not, (
            "sm.md does not have 'must not use TodoWrite' (or equivalent) phrasing near "
            "the TodoWrite restriction. The bare CANNOT list heading is not sufficient — "
            "the scoped rule should use direct prohibition language like "
            "'SM must not use TodoWrite for implementation task-decomposition'."
        )


# ---------------------------------------------------------------------------
# AC3: Consistency — coordination-discipline block intact, no contradiction
# ---------------------------------------------------------------------------


class TestConsistency:
    """AC3: <coordination-discipline> block survives the edit without contradiction.

    These tests assert INVARIANTS — they should pass before and after the fix.
    They guard against accidentally removing or breaking the coordination-discipline block.
    """

    def test_coordination_discipline_block_present(self) -> None:
        """The <coordination-discipline> XML block must still exist in sm.md."""
        content = _read_sm()
        assert "<coordination-discipline>" in content, (
            "sm.md is missing the <coordination-discipline> block — it must not be removed"
        )

    def test_coordination_discipline_route_principle_intact(self) -> None:
        """The 'route' and 'solve' language must still appear in coordination-discipline.

        This verifies the core 'route, don't solve' / 'not here to solve problems'
        principle has not been accidentally altered during the rule update.
        """
        content = _read_sm()
        lower = content.lower()
        assert "route" in lower, (
            "sm.md's coordination-discipline block lost 'route' language"
        )
        assert "solve" in lower, (
            "sm.md's coordination-discipline block lost 'solve' language"
        )

    def test_narrowed_rule_still_has_critical_block(self) -> None:
        """The <critical> block containing the CAN/CANNOT rules must still exist."""
        content = _read_sm()
        assert "<critical>" in content, (
            "sm.md is missing its <critical> block — it must not be removed during the update"
        )
