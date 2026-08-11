"""Tests for story 164-13: consolidate session-field parsing onto the anchored
story_finish parser by extracting it into pf.sprint.session_parse.

Consolidation targets
---------------------
- demo/collector.py: ``parse_session_fields`` — unanchored, no fence-skip, last-wins.
- findings/aggregate.py: ``_parse_session_fields`` — unanchored, no fence-skip, last-wins,
  first-30-line window.
- tui/story_detail_data.py: ``_parse_session_file`` — unanchored ``re.finditer``, last-wins,
  key-mapping transformations. IN-SCOPE for this story.
- bmad/sync.py: ``_parse_session_for_record`` — custom section parser for Dev Assessment and
  Delivery Findings structured sections. OUT-OF-SCOPE (deferred); documented here.

Shared module target
--------------------
``pf.sprint.session_parse`` exposes a public ``parse_session(session_path: Path) -> dict[str, str]``
that is the anchored, fence-aware, Story-Details-authoritative parser extracted
from story_finish.py (``_parse_session``, hardened in 164-11 and 164-12).

RED on HEAD (all fail before implementation):
- TestSharedModuleExists::test_parse_session_module_is_importable_and_callable
  → ModuleNotFoundError: pf.sprint.session_parse does not exist.
- TestCollectorParity (3 tests): collector's unanchored/last-wins parser diverges
  from canonical on fenced-block, mid-prose, and Story Details authority cases.
- TestAggregateParity (2 tests): aggregate's unanchored/last-wins parser diverges
  from canonical on mid-prose jira key and fenced-block cases.
- TestStoryFinishRegression::test_story_finish_imports_from_shared_session_parse_module
  → AssertionError: story_finish has no import from pf.sprint.session_parse.
- TestTuiParity (2 tests): tui's unanchored/last-wins parser diverges from canonical
  on fenced-block and Story Details authority cases.

Green guard (passes on HEAD):
- TestBmadSyncDeferred::test_bmad_sync_parsing_is_out_of_scope_and_function_present
  Documents the deferred decision; no consolidation assertion.
"""

import ast
from pathlib import Path

import pytest

from pf.sprint.story_finish import (
    _extract_branch,
    _extract_pr_number,
    _parse_session,
)

# =============================================================================
# Session fixture text
# =============================================================================

REAL_BRANCH = "feat/164-13-real-branch"
WRONG_BRANCH = "feat/164-13-wrong-section"
POISON_BRANCH = "feat/164-13-fenced-poison"

FRONTMATTER = """\
---
story_id: "164-13"
jira_key: ""
epic: "164"
workflow: "tdd"
---

# Story 164-13: Consolidate session-field parsing
"""


def _write(tmp_path: Path, name: str, text: str) -> Path:
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return p


# =============================================================================
# AC-1: shared public surface exists
# =============================================================================


class TestSharedModuleExists:
    def test_parse_session_module_is_importable_and_callable(self) -> None:
        """RED (AC-1): pf.sprint.session_parse does not exist yet.

        After Dev creates the module and extracts the anchored parser into
        ``parse_session``, this import succeeds and the callable check passes.

        Expected to FAIL on HEAD with:
            ModuleNotFoundError: No module named 'pf.sprint.session_parse'
        """
        from pf.sprint.session_parse import parse_session  # noqa: F401  # type: ignore[import]

        assert callable(parse_session), (
            "parse_session is not callable — the shared module exists but "
            "the public function is missing or mis-named"
        )


# =============================================================================
# AC-2: demo/collector.py parity with the anchored canonical parser
# =============================================================================


class TestCollectorParity:
    """Compare demo/collector.parse_session_fields against the canonical
    _parse_session on poison inputs.

    All three tests FAIL on HEAD because collector uses an unanchored regex
    with last-wins semantics and no fence-skip.  After consolidation
    (collector delegates to session_parse.parse_session), they all pass.
    """

    def test_collector_fenced_block_matches_canonical_parser(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-2): a field line inside a fenced code block that appears
        AFTER the real field line within Story Details must not override the
        real value.

        Failure mechanism (HEAD): collector has no fence-state tracking.
        The fenced ``**Branch:** {POISON_BRANCH}`` line is processed like any
        other field; last-wins semantics hand the poison value as the result.

        Canonical (_parse_session): toggles in_fence on ``` markers and skips
        all content inside fences — real branch survives.

        Expected to FAIL on HEAD: collector returns the fenced poison branch
        instead of the real Story Details branch.
        """
        from pf.demo.collector import parse_session_fields

        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-13
- **Branch:** {REAL_BRANCH}
- **PR:** #300 - real PR

```python
# Example showing session field syntax:
- **Branch:** {POISON_BRANCH}
- **PR:** #999 - fenced poison PR
```
"""
        )
        path = _write(tmp_path, "164-13-session.md", body)

        canonical_fields = _parse_session(path)
        collector_fields = parse_session_fields(path)

        assert collector_fields.get("branch") == canonical_fields.get("branch"), (
            f"collector returned fenced-poison branch "
            f"{collector_fields.get('branch')!r} instead of canonical "
            f"{canonical_fields.get('branch')!r} — collector is not skipping "
            "lines inside fenced code blocks"
        )
        assert collector_fields.get("pr") == canonical_fields.get("pr"), (
            f"collector returned fenced-poison PR "
            f"{collector_fields.get('pr')!r} instead of canonical "
            f"{canonical_fields.get('pr')!r}"
        )

    def test_collector_mid_prose_matches_canonical_parser(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-2): a mid-prose mention of ``**Branch:**`` in a later
        section must not override the real Story Details branch field.

        Failure mechanism (HEAD): collector's regex ``r\"\\*\\*...(\\w[\\w\\s]*):\\*\\*\"``
        has no start anchor — ``SESSION_FIELD_RE.search(line)`` matches the
        token anywhere on the line; last-wins then serves the prose fragment
        as the branch.

        Canonical: anchored regex ``r\"^\\s*(?:[-*]\\s+)?\\*\\*...\"`` — the prose
        line's token is mid-sentence, so the anchored pattern does not match.

        Expected to FAIL on HEAD: collector captures the prose-mention value.
        """
        from pf.demo.collector import parse_session_fields

        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-13
- **Branch:** {REAL_BRANCH}

## Design Deviations

- Stacked-arm note: the implementation also updates the **Branch:** field
  like the gitflow arm — this prose mention must not become the branch.
"""
        )
        path = _write(tmp_path, "164-13-session.md", body)

        canonical_fields = _parse_session(path)
        collector_fields = parse_session_fields(path)

        assert collector_fields.get("branch") == canonical_fields.get("branch"), (
            f"collector captured a mid-prose **Branch:** mention as the branch "
            f"value — got {collector_fields.get('branch')!r}, canonical gives "
            f"{canonical_fields.get('branch')!r}. Collector's unanchored regex "
            "matched a token that appears mid-sentence."
        )

    def test_collector_story_details_authority_matches_canonical_parser(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-2): when Story Details carries the real branch, a line-start
        field in a LATER section (Dev Assessment) must not override it.

        Failure mechanism (HEAD): collector uses last-wins — it accumulates
        every matching line with ``fields[key] = value``; the Dev Assessment
        line comes later, so its value is what the function returns.

        Canonical: first-wins via ``setdefault`` + Story Details authority
        overlay guarantee the Story Details value survives.

        Expected to FAIL on HEAD: collector returns the wrong-section branch.
        """
        from pf.demo.collector import parse_session_fields

        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-13
- **Branch:** {REAL_BRANCH}
- **PR:** #300 - real PR

## Dev Assessment

**Branch:** {WRONG_BRANCH} (pushed, commits abc1234)
**PR:** #999 - wrong section hand-written note
"""
        )
        path = _write(tmp_path, "164-13-session.md", body)

        canonical_fields = _parse_session(path)
        collector_fields = parse_session_fields(path)

        assert collector_fields.get("branch") == canonical_fields.get("branch"), (
            f"collector's last-wins semantics let a Dev Assessment line-start "
            f"field override Story Details — got {collector_fields.get('branch')!r}, "
            f"canonical gives {canonical_fields.get('branch')!r}"
        )
        assert collector_fields.get("pr") == canonical_fields.get("pr"), (
            f"collector's last-wins semantics let a later section override "
            f"Story Details PR — got {collector_fields.get('pr')!r}, "
            f"canonical gives {canonical_fields.get('pr')!r}"
        )


# =============================================================================
# AC-3: findings/aggregate.py parity with the anchored canonical parser
# =============================================================================


class TestAggregateParity:
    """Compare findings/aggregate._parse_session_fields against _parse_session
    on poison inputs that fall within the first-30-line window.

    Both tests FAIL on HEAD because aggregate uses an unanchored regex with
    last-wins semantics and no fence-skip.  After consolidation, they pass.

    Note: aggregate currently accepts ``content: str`` (not a Path).  The
    parity tests pass the same text to both parsers; any 30-line window
    behavior is irrelevant here because all poison inputs are well within
    30 lines.
    """

    def test_aggregate_jira_key_mid_prose_matches_canonical_parser(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-3): a mid-prose ``**Jira Key:**`` mention within the first
        30 lines must not override the real Story Details jira key.

        Failure mechanism (HEAD): aggregate's ``_SESSION_FIELD_RE`` is
        unanchored; last-wins semantics pick up the prose mention that
        appears after the real field line.

        Expected to FAIL on HEAD: aggregate returns the prose-captured value,
        not the real PROJ-123.
        """
        from pf.findings.aggregate import _parse_session_fields as aggregate_parse

        body = (
            FRONTMATTER
            + """
## Story Details
- **ID:** 164-13
- **Jira Key:** PROJ-123
- **Branch:** feat/164-13-real

Note: see the **Jira Key:** PROJ-POISON issue for related context and history.
"""
        )
        path = _write(tmp_path, "164-13-session.md", body)

        # aggregate takes content:str — read with same encoding
        content = path.read_text(encoding="utf-8")
        canonical_fields = _parse_session(path)
        aggregate_fields = aggregate_parse(content)

        # normalize key: aggregate uses "jira key", canonical may use same
        agg_jira = aggregate_fields.get("jira key") or aggregate_fields.get("jira")
        can_jira = canonical_fields.get("jira key") or canonical_fields.get("jira")

        assert agg_jira == can_jira, (
            f"aggregate captured a mid-prose **Jira Key:** mention as the "
            f"jira key — got {agg_jira!r}, canonical gives {can_jira!r}. "
            "Aggregate's unanchored regex matched a token that appears "
            "mid-sentence in the first 30 lines."
        )

    def test_aggregate_fenced_block_matches_canonical_parser(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-3): a ``**Jira Key:**`` line inside a fenced code block
        that follows the real field line must not override the real value.

        Failure mechanism (HEAD): aggregate has no fence-state tracking;
        the fenced line is processed with ``fields[key] = value`` (last-wins)
        — poison overwrites the real key.

        Expected to FAIL on HEAD: aggregate returns the fenced-poison jira key.
        """
        from pf.findings.aggregate import _parse_session_fields as aggregate_parse

        body = (
            FRONTMATTER
            + """
## Story Details
- **ID:** 164-13
- **Jira Key:** PROJ-123
- **Branch:** feat/164-13-real

```bash
# Example showing field format — these are NOT real fields:
- **Jira Key:** PROJ-POISON
```
"""
        )
        path = _write(tmp_path, "164-13-session.md", body)

        content = path.read_text(encoding="utf-8")
        canonical_fields = _parse_session(path)
        aggregate_fields = aggregate_parse(content)

        agg_jira = aggregate_fields.get("jira key") or aggregate_fields.get("jira")
        can_jira = canonical_fields.get("jira key") or canonical_fields.get("jira")

        assert agg_jira == can_jira, (
            f"aggregate returned fenced-poison jira key {agg_jira!r} instead "
            f"of canonical {can_jira!r} — aggregate is not skipping lines "
            "inside fenced code blocks"
        )


# =============================================================================
# AC-4: story_finish regression — uses shared module (AST import check)
# =============================================================================


class TestStoryFinishRegression:
    def test_story_finish_imports_from_shared_session_parse_module(self) -> None:
        """RED (AC-4): story_finish must import ``parse_session`` (or equivalent)
        from ``pf.sprint.session_parse`` after the shared module is extracted.

        This pins the requirement that story_finish.py is updated to delegate
        to (or fully replace ``_parse_session`` with) the shared function —
        not just that the module is created separately.

        Checked via AST so this is a static guarantee, not a runtime duck-type
        that passes even if the old private copy is still used.

        Expected to FAIL on HEAD: story_finish.py has no import from
        pf.sprint.session_parse.
        """
        import pf.sprint.story_finish as story_finish_module

        source = Path(story_finish_module.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)

        has_import = any(
            isinstance(node, ast.ImportFrom)
            and node.module == "pf.sprint.session_parse"
            for node in ast.walk(tree)
        )

        assert has_import, (
            "story_finish.py has no 'from pf.sprint.session_parse import ...' — "
            "the shared module has not been wired up as the single source of truth "
            "for session-field parsing in story_finish. Dev must update the import."
        )


# =============================================================================
# AC-5: tui/story_detail_data.py parity — IN-SCOPE for consolidation
# =============================================================================


class TestTuiParity:
    """Compare tui/story_detail_data._parse_session_file against _parse_session
    on poison inputs.  tui is IN-SCOPE per session analysis (it reads session
    metadata with an unanchored ``re.finditer`` + last-wins + no fence-skip).

    Both tests FAIL on HEAD because tui uses its own unanchored parser.
    After consolidation (tui routes through session_parse.parse_session and
    applies its key-mapping), they pass.

    Note: tui's function takes ``session_path: str`` (not Path) and returns a
    dict with remapped keys (``branch`` → ``git_branch``).  Parity is asserted
    on the source field value, not the output key name.
    """

    def test_tui_fenced_branch_field_matches_canonical_parser(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-5/tui): a ``**Branch:**`` line inside a fenced code block
        that appears AFTER the real branch field must not produce a different
        git_branch than the canonical branch value.

        Failure mechanism (HEAD): tui uses ``re.finditer`` over the full content
        string with no fence tracking; the last ``**Branch:**`` match wins —
        the fenced poison line overwrites the real value.

        Expected to FAIL on HEAD: tui["git_branch"] returns the fenced-poison
        branch instead of the real Story Details branch.
        """
        from pf.tui.story_detail_data import _parse_session_file as tui_parse

        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-13
- **Branch:** {REAL_BRANCH}
- **PR:** #300 - real PR

```example
# Illustration of the field format (not a real field):
**Branch:** {POISON_BRANCH}
```
"""
        )
        path = _write(tmp_path, "164-13-session.md", body)

        canonical_fields = _parse_session(path)
        tui_result = tui_parse(str(path))

        # tui maps "branch" → "git_branch"; canonical stores it as "branch"
        assert tui_result.get("git_branch") == canonical_fields.get("branch"), (
            f"tui returned fenced-poison git_branch "
            f"{tui_result.get('git_branch')!r} — canonical gives "
            f"{canonical_fields.get('branch')!r}. tui's re.finditer is not "
            "skipping lines inside fenced code blocks."
        )

    def test_tui_story_details_authority_matches_canonical_parser(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-5/tui): when Story Details carries the branch, a line-start
        field in a later section must not override tui's git_branch.

        Failure mechanism (HEAD): tui uses ``re.finditer`` over the full
        content and assigns ``result["git_branch"] = value`` (last-wins) —
        no Story Details section awareness.

        Canonical: first-wins + Story Details authority overlay guarantee
        the Story Details value survives.

        Expected to FAIL on HEAD: tui returns the wrong-section branch.
        """
        from pf.tui.story_detail_data import _parse_session_file as tui_parse

        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-13
- **Branch:** {REAL_BRANCH}
- **PR:** #300 - real PR

## Workflow Tracking
**Workflow:** tdd
**Phase:** green

## Dev Assessment

**Branch:** {WRONG_BRANCH} (pushed, commits abc1234)
"""
        )
        path = _write(tmp_path, "164-13-session.md", body)

        canonical_fields = _parse_session(path)
        tui_result = tui_parse(str(path))

        assert tui_result.get("git_branch") == canonical_fields.get("branch"), (
            f"tui's last-wins semantics let a Dev Assessment line-start field "
            f"override Story Details — got {tui_result.get('git_branch')!r}, "
            f"canonical gives {canonical_fields.get('branch')!r}. tui has no "
            "Story Details section authority."
        )


# =============================================================================
# AC-5: bmad/sync.py — OUT-OF-SCOPE (deferred); green guard documenting decision
# =============================================================================


class TestBmadSyncDeferred:
    def test_bmad_sync_parsing_is_out_of_scope_and_function_present(self) -> None:
        """Green guard (AC-5/bmad): bmad/sync.py ``_parse_session_for_record``
        is intentionally OUT-OF-SCOPE for this consolidation.

        Rationale (from session Technical Context):
          bmad/sync.py does NOT use a generic bold-field scan.  It parses
          domain-specific sections (``## Dev Assessment``, ``## Delivery
          Findings``) using targeted regexes for structured sub-fields
          (Files Changed, Dev Assessment body, Delivery Findings).  Reusing
          the generic ``parse_session`` would require restructuring the
          extraction logic and is a separate concern.

        This test verifies the function still exists (i.e. was not accidentally
        removed during consolidation) and makes no assertion about routing
        through the shared session parser.

        Must PASS on HEAD and remain passing after consolidation.
        """
        from pf.bmad import sync as bmad_sync

        assert hasattr(bmad_sync, "_parse_session_for_record"), (
            "_parse_session_for_record was unexpectedly removed from bmad/sync.py — "
            "this out-of-scope function should remain in place; if bmad was "
            "consolidated as part of 164-13, remove this test and add parity tests."
        )
        assert callable(bmad_sync._parse_session_for_record), (
            "_parse_session_for_record exists but is not callable"
        )
