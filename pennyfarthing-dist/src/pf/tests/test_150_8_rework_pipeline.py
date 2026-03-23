"""Test rework cycle freshness gate in complete_phase (Story 150-8).

Validates that the approval gate detects stale subagent results from
previous rework cycles and blocks approval until the reviewer re-runs
all enabled subagents against the current cycle.
"""

from __future__ import annotations

from unittest.mock import patch

from pf.handoff.complete_phase import (
    _check_rework_freshness,
    _parse_rework_cycle,
)


# --- Fixtures ---

SESSION_NO_REWORK = """---
story_id: "150-8"
---
# Story 150-8

## Workflow Tracking
**Workflow:** tdd
**Phase:** review
**Phase Started:** 2026-03-20T22:00:00Z

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |

**All received:** Yes
"""

SESSION_REWORK_CYCLE_2 = """---
story_id: "150-8"
---
# Story 150-8

## Workflow Tracking
**Workflow:** tdd
**Phase:** review
**Phase Started:** 2026-03-20T23:00:00Z
**Rework Cycle:** 2

## Subagent Results

**Cycle: 2**

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |

**All received:** Yes
"""

SESSION_REWORK_CYCLE_2_STALE = """---
story_id: "150-8"
---
# Story 150-8

## Workflow Tracking
**Workflow:** tdd
**Phase:** review
**Phase Started:** 2026-03-20T23:00:00Z
**Rework Cycle:** 2

## Subagent Results

**Cycle: 1**

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |

**All received:** Yes
"""

SESSION_REWORK_CYCLE_3_NO_CYCLE_TAG = """---
story_id: "150-8"
---
# Story 150-8

## Workflow Tracking
**Workflow:** tdd
**Phase:** review
**Phase Started:** 2026-03-20T23:00:00Z
**Rework Cycle:** 3

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |

**All received:** Yes
"""


class TestParseReworkCycle:
    """Test _parse_rework_cycle extracts cycle number from session content."""

    def test_no_rework_field_returns_zero(self) -> None:
        assert _parse_rework_cycle(SESSION_NO_REWORK) == 0

    def test_rework_cycle_2(self) -> None:
        assert _parse_rework_cycle(SESSION_REWORK_CYCLE_2) == 2

    def test_rework_cycle_3(self) -> None:
        assert _parse_rework_cycle(SESSION_REWORK_CYCLE_3_NO_CYCLE_TAG) == 3

    def test_malformed_value_returns_zero(self) -> None:
        content = "**Rework Cycle:** banana"
        assert _parse_rework_cycle(content) == 0

    def test_empty_content_returns_zero(self) -> None:
        assert _parse_rework_cycle("") == 0


class TestCheckReworkFreshness:
    """Test _check_rework_freshness validates subagent results match current cycle."""

    def test_cycle_zero_always_passes(self) -> None:
        result = _check_rework_freshness(SESSION_NO_REWORK)
        assert result["pass"] is True
        assert result["current_cycle"] == 0

    def test_matching_cycle_passes(self) -> None:
        result = _check_rework_freshness(SESSION_REWORK_CYCLE_2)
        assert result["pass"] is True
        assert result["current_cycle"] == 2

    def test_stale_cycle_fails(self) -> None:
        result = _check_rework_freshness(SESSION_REWORK_CYCLE_2_STALE)
        assert result["pass"] is False
        assert result["current_cycle"] == 2
        assert "stale" in result["message"].lower() or "cycle" in result["message"].lower()

    def test_missing_cycle_tag_in_results_fails(self) -> None:
        """Rework cycle 3 but subagent results have no Cycle tag -> stale."""
        result = _check_rework_freshness(SESSION_REWORK_CYCLE_3_NO_CYCLE_TAG)
        assert result["pass"] is False
        assert result["current_cycle"] == 3


class TestApprovalGateIntegration:
    """Test that freshness check is integrated into the approval gate flow."""

    @patch("pf.handoff.complete_phase._get_enabled_subagents")
    @patch("pf.handoff.complete_phase._find_project_root")
    @patch("pf.handoff.complete_phase._get_phase_agent", return_value="reviewer")
    @patch("pf.handoff.complete_phase._validate_phase_names", side_effect=lambda _r, _w, f, t: (f, t))
    @patch("pf.handoff.complete_phase._get_phase_tandem", return_value=None)
    def test_approval_gate_blocks_stale_rework(
        self,
        _mock_tandem,
        _mock_validate,
        _mock_agent,
        mock_root,
        mock_subagents,
        tmp_path,
    ) -> None:
        """Approval gate returns error when subagent results are from a prior cycle."""
        from pf.handoff.complete_phase import complete_phase

        mock_root.return_value = tmp_path
        mock_subagents.return_value = ({"reviewer-preflight"}, set())

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        session_file = session_dir / "150-8-session.md"
        # Session with rework cycle 2 but results from cycle 1
        session_content = """---
story_id: "150-8"
---
# Story 150-8

## Workflow Tracking
**Workflow:** tdd
**Phase:** review
**Phase Started:** 2026-03-20T23:00:00Z
**Rework Cycle:** 2

## Subagent Results

**Cycle: 1**

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |

**All received:** Yes

## Reviewer Assessment

**Verdict:** APPROVED

- [EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE]

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| review | 2026-03-20T23:00:00Z | - | - |
"""
        session_file.write_text(session_content)

        result = complete_phase(
            story_id="150-8",
            workflow="tdd",
            from_phase="review",
            to_phase="done",
            gate_type="approval",
            project_root=tmp_path,
        )

        assert result["status"] == "error"
        assert "rework" in result["error"].lower() or "cycle" in result["error"].lower() or "stale" in result["error"].lower()
