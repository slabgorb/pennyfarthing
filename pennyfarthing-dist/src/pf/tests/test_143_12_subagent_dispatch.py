"""Test subagent-dispatch subgate in complete_phase (Story 143-12).

Validates that the approval gate programmatically enforces the presence
of all 7 specialist subagent tags in the Reviewer Assessment.
"""

from __future__ import annotations

import pytest

from pf.handoff.complete_phase import SUBAGENT_DISPATCH_TAGS, _check_subagent_dispatch


ALL_TAGS = "[EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE]"

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
