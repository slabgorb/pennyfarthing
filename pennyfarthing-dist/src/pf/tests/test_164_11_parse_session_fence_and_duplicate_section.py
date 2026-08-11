"""Tests for story 164-11: harden ``_parse_session`` — fenced-block skipping
and duplicate-Story-Details guard.

Defect 1 — fenced code blocks not skipped
------------------------------------------
``_parse_session`` has no fence-state tracking: lines inside ``` ``` ``` fences
are processed identically to outside content. Two failure modes:

**1a (field inside fence):** A line like ``- **Branch:** ...`` inside a fenced
block, when it appears BEFORE the real field line within the same Story Details
section, is captured first by ``detail_fields.setdefault``. The real field line
then loses the first-wins race. The authority overlay surfaces the poison.

**1b (heading inside fence):** A ``## Story Details`` line inside a fenced block
triggers ``line.startswith("## ")`` and resets ``section`` to "story details".
Subsequent fenced lines then land in ``detail_fields``. When the real
``## Story Details`` heading appears later, its fields lose the first-wins race
to the fenced-captured poison values.

Defect 2 — multiple "Story Details" headings
----------------------------------------------
When a session has two ``## Story Details`` headings, the second occurrence
resets ``section`` to "story details" and ``detail_fields.setdefault`` adds any
keys NOT already present. The authority overlay (``fields[key] = detail_fields[key]``)
then overwrites the fallback-path values from other sections. Specifically:

- First Story Details: Branch only, no PR field.
- Dev Assessment: real PR as a line-start fallback field → ``fields["pr"]`` = real.
- Second Story Details: PR = poison → ``detail_fields.setdefault("pr", poison)`` ADDS it
  (key not yet in ``detail_fields``).
- Authority overlay: ``fields["pr"] = detail_fields["pr"]`` → overwrites fallback with poison.

The fix must prevent the second Story Details from contributing to
``detail_fields`` at all.

RED state (fails on HEAD):
- ``TestFencedCodeBlocks::test_field_inside_fence_within_story_details_not_parsed``
  — fenced poison branch/PR win first-wins over real values.
- ``TestFencedCodeBlocks::test_story_details_heading_inside_fence_not_treated_as_section``
  — fenced heading activates section, fenced fields land in detail_fields.
- ``TestMultipleStoryDetails::test_second_story_details_authority_does_not_poison_fallback_pr``
  — second Story Details adds missing PR key to detail_fields, clobbering fallback.

Green guard (passes on HEAD and after fix):
- ``TestSingleStoryDetailsRegression::test_normal_single_story_details_parse_unchanged``
  — standard single-Story-Details session, verifies no regression.
"""

from pathlib import Path

from pf.sprint.story_finish import (
    _extract_branch,
    _extract_pr_number,
    _parse_session,
)

REAL_BRANCH = "feat/164-11-real-branch"
REAL_PR_NUM = "300"
REAL_PR_FIELD = f"#{REAL_PR_NUM} - real PR"

POISON_BRANCH = "feat/164-11-poison-branch"
POISON_PR_NUM = "999"
POISON_PR_FIELD = f"#{POISON_PR_NUM} - poison PR"

FRONTMATTER = """\
---
story_id: "164-11"
jira_key: ""
epic: "164"
workflow: "tdd"
---

# Story 164-11: Harden _parse_session section tracker
"""


def _parse_text(tmp_path: Path, text: str) -> dict[str, str]:
    p = tmp_path / "164-11-session.md"
    p.write_text(text, encoding="utf-8")
    return _parse_session(p)


# =============================================================================
# Defect 1 — fenced code block content must not be parsed as fields/sections
# =============================================================================


class TestFencedCodeBlocks:
    def test_field_inside_fence_within_story_details_not_parsed(
        self, tmp_path: Path
    ) -> None:
        """RED (Defect 1a): `` **Branch:** `` and `` **PR:** `` lines inside a
        fenced code block within the Story Details section must NOT be captured
        as real fields.

        The fenced poison lines appear BEFORE the real field lines within the
        same Story Details section. Current code has no fence-state tracking,
        so ``detail_fields.setdefault`` captures the poison values first — the
        real values lose the first-wins race and the authority overlay surfaces
        the poison branch/PR.

        Expected to FAIL on HEAD: ``_extract_branch`` returns the poison branch,
        not ``REAL_BRANCH``.
        """
        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-11

```python
# Example showing field syntax — these are NOT real fields:
- **Branch:** {POISON_BRANCH}
- **PR:** {POISON_PR_FIELD}
```

- **Branch:** {REAL_BRANCH}
- **PR:** {REAL_PR_FIELD}
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            f"fenced poison branch overrode real Story Details branch — "
            f"got {_extract_branch(fields)!r}, expected {REAL_BRANCH!r}. "
            "The parser is not skipping lines inside fenced code blocks."
        )
        assert _extract_pr_number(fields) == REAL_PR_NUM, (
            f"fenced poison PR overrode real Story Details PR — "
            f"got {_extract_pr_number(fields)!r}, expected {REAL_PR_NUM!r}. "
            "The parser is not skipping lines inside fenced code blocks."
        )

    def test_story_details_heading_inside_fence_not_treated_as_section(
        self, tmp_path: Path
    ) -> None:
        """RED (Defect 1b): a ``## Story Details`` heading inside a fenced code
        block must NOT be treated as a real section boundary.

        On HEAD: ``line.startswith("## ")`` matches the fenced heading and resets
        ``section`` to "story details". The subsequent fenced field lines then
        land in ``detail_fields``. When the real ``## Story Details`` heading
        appears later, its fields lose the first-wins race to the
        fenced-captured values.

        Expected to FAIL on HEAD: authority overlay surfaces poison branch/PR
        instead of the real values from the genuine Story Details section.
        """
        body = (
            FRONTMATTER
            + f"""
## Implementation Notes

```markdown
## Story Details
- **Branch:** {POISON_BRANCH}
- **PR:** {POISON_PR_FIELD}
```

## Story Details
- **Branch:** {REAL_BRANCH}
- **PR:** {REAL_PR_FIELD}
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            f"fenced ``## Story Details`` heading activated the Story Details "
            f"section context and fenced lines poisoned branch — "
            f"got {_extract_branch(fields)!r}, expected {REAL_BRANCH!r}."
        )
        assert _extract_pr_number(fields) == REAL_PR_NUM, (
            f"fenced ``## Story Details`` heading activated the Story Details "
            f"section context and fenced lines poisoned PR — "
            f"got {_extract_pr_number(fields)!r}, expected {REAL_PR_NUM!r}."
        )


# =============================================================================
# Defect 2 — only the FIRST "Story Details" section populates the overlay
# =============================================================================


class TestMultipleStoryDetails:
    def test_second_story_details_authority_does_not_poison_fallback_pr(
        self, tmp_path: Path
    ) -> None:
        """RED (Defect 2): when a session has two ``## Story Details`` sections,
        only the first must contribute to the authority overlay.

        Failure mechanism on HEAD:
        - First Story Details sets ``detail_fields["branch"]`` = real; no PR field.
        - Dev Assessment provides the real PR as a line-start fallback —
          ``fields["pr"]`` = real PR via ``setdefault``.
        - Second ``## Story Details`` resets ``section`` to "story details" and
          ``detail_fields.setdefault("pr", poison)`` ADDS the poison value (key
          was not yet in ``detail_fields``).
        - Authority overlay: ``fields["pr"] = detail_fields["pr"]`` OVERWRITES
          the Dev Assessment fallback with the poison PR.

        After fix: second Story Details is ignored; ``detail_fields`` has no "pr"
        key; authority overlay leaves ``fields["pr"]`` = Dev Assessment fallback
        intact.

        Expected to FAIL on HEAD: ``_extract_pr_number`` returns the poison PR
        number instead of the real fallback value.
        """
        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-11
- **Branch:** {REAL_BRANCH}

## Workflow Tracking
**Workflow:** tdd
**Phase:** red

## Dev Assessment
**PR:** {REAL_PR_FIELD}

## Story Details
- **ID:** 164-11-duplicate-section
- **Branch:** {POISON_BRANCH}
- **PR:** {POISON_PR_FIELD}
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            f"second Story Details clobbered first Story Details branch — "
            f"got {_extract_branch(fields)!r}, expected {REAL_BRANCH!r}. "
            "The parser must ignore any Story Details section after the first."
        )
        assert _extract_pr_number(fields) == REAL_PR_NUM, (
            f"second Story Details authority overlay clobbered the Dev "
            f"Assessment fallback PR — got {_extract_pr_number(fields)!r}, "
            f"expected {REAL_PR_NUM!r} (from Dev Assessment). "
            "The second Story Details section must not contribute to the overlay."
        )


# =============================================================================
# Regression — single Story Details session parses exactly as before (AC-3)
# =============================================================================


class TestSingleStoryDetailsRegression:
    def test_normal_single_story_details_parse_unchanged(
        self, tmp_path: Path
    ) -> None:
        """Green guard (AC-3 regression): a standard single-Story-Details
        session with the 155-33 template shape must parse branch and PR
        exactly as before. Must pass on HEAD and remain passing after the fix.
        """
        body = (
            FRONTMATTER
            + f"""
## Story Details
- **ID:** 164-11
- **Jira Key:** (none)
- **Workflow:** tdd
- **Stack Parent:** none
- **Branch:** {REAL_BRANCH}
- **PR:** {REAL_PR_FIELD}

## Workflow Tracking
**Workflow:** tdd
**Phase:** green

## Dev Assessment
Implementation complete. No surprises.
"""
        )
        fields = _parse_text(tmp_path, body)
        assert _extract_branch(fields) == REAL_BRANCH, (
            f"regression: normal single-Story-Details branch parse broke — "
            f"got {_extract_branch(fields)!r}, expected {REAL_BRANCH!r}"
        )
        assert _extract_pr_number(fields) == REAL_PR_NUM, (
            f"regression: normal single-Story-Details PR parse broke — "
            f"got {_extract_pr_number(fields)!r}, expected {REAL_PR_NUM!r}"
        )
