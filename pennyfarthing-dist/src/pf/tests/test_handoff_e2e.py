"""End-to-end handoff smoke tests (Story 105-3).

Epic: 105 (Script-First Handoff)
Story: 105-3 — End-to-end handoff smoke test

Unlike the unit tests in test_handoff_cli.py (story 105-1), these tests chain
operations together to verify the full handoff flow works end-to-end:
  resolve-gate → (gate evaluation contract) → complete-phase → handoff-marker

Acceptance Criteria:
- [AC1] resolve-gate returns status:ready for green phase with assessment written
- [AC2] Gate subagent evaluates tests_pass using inline fallback
- [AC3] complete-phase updates session file phase correctly
- [AC4] handoff-marker emits correct CYCLIST marker
- [AC5] Trivial workflow skips gate (status:skip) with no LLM spawn
"""

from __future__ import annotations

import re
import subprocess
import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.complete_phase import complete_phase
from pf.handoff.resolve_gate import resolve_gate

# ---------------------------------------------------------------------------
# Workflow definitions (matching real workflow YAMLs)
# ---------------------------------------------------------------------------

TDD_WORKFLOW = {
    "workflow": {
        "name": "tdd",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
            {"name": "green", "agent": "dev", "gate": {"type": "tests_pass"}},
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

TRIVIAL_WORKFLOW = {
    "workflow": {
        "name": "trivial",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "implement", "agent": "dev", "gate": {"type": "tests_pass"}},
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

# ---------------------------------------------------------------------------
# Session file templates
# ---------------------------------------------------------------------------

SESSION_TDD_GREEN_WITH_ASSESSMENT = textwrap.dedent("""\
    # Story e2e-1: Smoke test story

    **Story ID:** e2e-1
    **Workflow:** tdd
    **Phase:** green
    **Phase Started:** 2026-02-15T10:00:00Z

    ## TEA Assessment

    **Tests Written:** 3 tests covering all ACs
    **Status:** RED confirmed — all 3 failing as expected

    ## Workflow Tracking

    **Phase:** green
    **Phase Started:** 2026-02-15T10:00:00Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | setup | 2026-02-15T09:50:00Z | 2026-02-15T09:55:00Z | 5m |
    | red | 2026-02-15T09:55:00Z | 2026-02-15T10:00:00Z | 5m |
    | green | 2026-02-15T10:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|
    | setup (sm) | red (tea) | - | PASSED | 2026-02-15T09:55:00Z |
    | red (tea) | green (dev) | tests_fail | PASSED | 2026-02-15T10:00:00Z |
""")

SESSION_TRIVIAL_SETUP = textwrap.dedent("""\
    # Story e2e-2: Trivial smoke test

    **Story ID:** e2e-2
    **Workflow:** trivial
    **Phase:** setup
    **Phase Started:** 2026-02-15T10:00:00Z

    ## Workflow Tracking

    **Phase:** setup
    **Phase Started:** 2026-02-15T10:00:00Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | setup | 2026-02-15T10:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|
""")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create minimal project structure with workflow YAMLs."""
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)

    for name, data in [("tdd", TDD_WORKFLOW), ("trivial", TRIVIAL_WORKFLOW)]:
        (workflows_dir / f"{name}.yaml").write_text(
            yaml.dump(data, default_flow_style=False)
        )

    (tmp_path / ".session").mkdir()
    return tmp_path


@pytest.fixture
def tdd_session(project: Path) -> Path:
    """Session in TDD green phase with assessment."""
    session_file = project / ".session" / "e2e-1-session.md"
    session_file.write_text(SESSION_TDD_GREEN_WITH_ASSESSMENT)
    return session_file


@pytest.fixture
def trivial_session(project: Path) -> Path:
    """Session in trivial setup phase (no assessment needed)."""
    session_file = project / ".session" / "e2e-2-session.md"
    session_file.write_text(SESSION_TRIVIAL_SETUP)
    return session_file


# ===========================================================================
# AC1: resolve-gate returns status:ready for green phase with assessment
# ===========================================================================


class TestResolveGateReadyForGreen:
    """AC1: TDD green phase with assessment → status:ready."""

    def test_status_is_ready(self, project: Path, tdd_session: Path) -> None:
        result = resolve_gate("e2e-1", "tdd", "green", project_root=project)
        assert result["status"] == "ready"

    def test_next_phase_is_review(self, project: Path, tdd_session: Path) -> None:
        result = resolve_gate("e2e-1", "tdd", "green", project_root=project)
        assert result["next_phase"] == "review"
        assert result["next_agent"] == "reviewer"

    def test_assessment_found_is_true(self, project: Path, tdd_session: Path) -> None:
        result = resolve_gate("e2e-1", "tdd", "green", project_root=project)
        assert result["assessment_found"] is True

    def test_error_is_null(self, project: Path, tdd_session: Path) -> None:
        result = resolve_gate("e2e-1", "tdd", "green", project_root=project)
        assert result["error"] is None


# ===========================================================================
# AC2: Gate subagent evaluates tests_pass using inline fallback
# ===========================================================================


class TestInlineGateFallbackContract:
    """AC2: When gate_file is None, gate_type provides inline evaluation info.

    The "inline fallback" means the agent uses gate_type directly (e.g.,
    "tests_pass") without loading criteria from a gate file. This test
    verifies resolve-gate returns the correct contract for inline evaluation.
    """

    def test_gate_type_is_tests_pass(self, project: Path, tdd_session: Path) -> None:
        """Gate type should be tests_pass for TDD green phase."""
        result = resolve_gate("e2e-1", "tdd", "green", project_root=project)
        assert result["gate_type"] == "tests_pass"

    def test_gate_file_is_none(self, project: Path, tdd_session: Path) -> None:
        """No gate file means agent uses inline type fallback."""
        result = resolve_gate("e2e-1", "tdd", "green", project_root=project)
        assert result["gate_file"] is None

    def test_inline_fallback_provides_sufficient_info(
        self, project: Path, tdd_session: Path
    ) -> None:
        """Inline fallback needs: status=ready + gate_type + no gate_file."""
        result = resolve_gate("e2e-1", "tdd", "green", project_root=project)
        assert result["status"] == "ready"
        assert result["gate_type"] is not None
        assert result["gate_file"] is None


# ===========================================================================
# AC3: complete-phase updates session file phase correctly
# ===========================================================================


class TestCompletePhaseUpdatesSession:
    """AC3: complete-phase atomically updates session with phase transition."""

    def test_phase_field_updated(self, project: Path, tdd_session: Path) -> None:
        """Phase field changes from 'green' to 'review'."""
        complete_phase("e2e-1", "tdd", "green", "review", "tests_pass", project)
        content = tdd_session.read_text()
        assert "**Phase:** review" in content
        assert "**Phase:** green" not in content

    def test_phase_started_timestamp_updated(
        self, project: Path, tdd_session: Path
    ) -> None:
        """Phase Started timestamp updated to current time."""
        complete_phase("e2e-1", "tdd", "green", "review", "tests_pass", project)
        content = tdd_session.read_text()
        # Original timestamp should be replaced
        assert "2026-02-15T10:00:00Z" not in re.findall(
            r"\*\*Phase Started:\*\* (\S+)", content
        )

    def test_phase_history_green_row_filled(
        self, project: Path, tdd_session: Path
    ) -> None:
        """Green phase row gets Ended timestamp and Duration filled."""
        complete_phase("e2e-1", "tdd", "green", "review", "tests_pass", project)
        content = tdd_session.read_text()
        # Match Phase History rows only (format: "| green | timestamp | ..."),
        # not Handoff History rows (format: "| green (dev) | ...")
        green_rows = [
            line
            for line in content.splitlines()
            if line.strip().startswith("| green |")
        ]
        assert len(green_rows) == 1
        cols = [c.strip() for c in green_rows[0].split("|") if c.strip()]
        assert cols[2] != "-", "Ended column should be filled"
        assert cols[3] != "-", "Duration column should be filled"

    def test_phase_history_review_row_added(
        self, project: Path, tdd_session: Path
    ) -> None:
        """New review phase row added to Phase History."""
        complete_phase("e2e-1", "tdd", "green", "review", "tests_pass", project)
        content = tdd_session.read_text()
        review_rows = [
            line for line in content.splitlines() if line.strip().startswith("| review")
        ]
        assert len(review_rows) == 1

    def test_handoff_history_row_added(
        self, project: Path, tdd_session: Path
    ) -> None:
        """Handoff History gets new row for green→review transition."""
        complete_phase("e2e-1", "tdd", "green", "review", "tests_pass", project)
        content = tdd_session.read_text()
        handoff_rows = [
            line
            for line in content.splitlines()
            if "green (dev)" in line and "review (reviewer)" in line
        ]
        assert len(handoff_rows) == 1
        assert "tests_pass" in handoff_rows[0]
        assert "PASSED" in handoff_rows[0]

    def test_returns_success(self, project: Path, tdd_session: Path) -> None:
        result = complete_phase("e2e-1", "tdd", "green", "review", "tests_pass", project)
        assert result["status"] == "success"
        assert result["error"] is None


# ===========================================================================
# AC1+AC2+AC3: Full chain — resolve-gate → complete-phase
# ===========================================================================


class TestFullChainE2E:
    """Chain resolve-gate output into complete-phase to verify end-to-end."""

    def test_resolve_then_complete_chain(
        self, project: Path, tdd_session: Path
    ) -> None:
        """Full chain: resolve-gate → use output → complete-phase."""
        # Step 1: Resolve gate
        resolve_result = resolve_gate(
            "e2e-1", "tdd", "green", project_root=project
        )
        assert resolve_result["status"] == "ready"

        # Step 2: Use resolve output to drive complete-phase
        complete_result = complete_phase(
            "e2e-1",
            "tdd",
            "green",
            resolve_result["next_phase"],
            resolve_result["gate_type"],
            project,
        )
        assert complete_result["status"] == "success"

        # Step 3: Verify session reflects the transition
        content = tdd_session.read_text()
        assert "**Phase:** review" in content
        assert "green (dev)" in content and "review (reviewer)" in content

    def test_chain_preserves_prior_history(
        self, project: Path, tdd_session: Path
    ) -> None:
        """Chain should preserve existing Phase History and Handoff History."""
        resolve_result = resolve_gate(
            "e2e-1", "tdd", "green", project_root=project
        )
        complete_phase(
            "e2e-1",
            "tdd",
            "green",
            resolve_result["next_phase"],
            resolve_result["gate_type"],
            project,
        )
        content = tdd_session.read_text()
        # Prior rows should still exist
        assert "setup (sm)" in content
        assert "red (tea)" in content


# ===========================================================================
# AC4: handoff-marker emits correct CYCLIST marker
# ===========================================================================


class TestHandoffMarkerOutput:
    """AC4: pf handoff marker emits correct AGENT_COMMAND block."""

    def test_marker_contains_agent_command(self) -> None:
        """Output contains AGENT_COMMAND YAML block."""
        result = subprocess.run(
            ["pf", "handoff", "marker", "reviewer"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "AGENT_COMMAND:" in result.stdout

    def test_marker_references_correct_agent(self) -> None:
        """Marker fallback references the correct next agent."""
        result = subprocess.run(
            ["pf", "handoff", "marker", "reviewer"],
            capture_output=True,
            text=True,
        )
        assert "/pf-reviewer" in result.stdout

    def test_marker_for_dev_agent(self) -> None:
        """Marker works for dev agent too."""
        result = subprocess.run(
            ["pf", "handoff", "marker", "dev"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "/pf-dev" in result.stdout

    def test_marker_error_mode(self) -> None:
        """Error flag produces error block."""
        result = subprocess.run(
            ["pf", "handoff", "marker", "--error", "Tests failing"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "error: true" in result.stdout
        assert "Tests failing" in result.stdout


# ===========================================================================
# AC5: Trivial workflow skips gate (status:skip) with no LLM spawn
# ===========================================================================


class TestTrivialSkipsGate:
    """AC5: Trivial workflow setup phase skips gate evaluation entirely."""

    def test_trivial_setup_returns_skip(
        self, project: Path, trivial_session: Path
    ) -> None:
        """Setup phase has no gate → status:skip."""
        result = resolve_gate("e2e-2", "trivial", "setup", project_root=project)
        assert result["status"] == "skip"

    def test_skip_has_no_gate_type(
        self, project: Path, trivial_session: Path
    ) -> None:
        """Skip result has no gate_type — no LLM evaluation needed."""
        result = resolve_gate("e2e-2", "trivial", "setup", project_root=project)
        assert result["gate_type"] is None

    def test_skip_has_no_gate_file(
        self, project: Path, trivial_session: Path
    ) -> None:
        """Skip result has no gate_file — nothing to evaluate."""
        result = resolve_gate("e2e-2", "trivial", "setup", project_root=project)
        assert result["gate_file"] is None

    def test_skip_routes_to_implement(
        self, project: Path, trivial_session: Path
    ) -> None:
        """Even when skipping, next_phase/next_agent are populated."""
        result = resolve_gate("e2e-2", "trivial", "setup", project_root=project)
        assert result["next_phase"] == "implement"
        assert result["next_agent"] == "dev"

    def test_skip_to_complete_phase_chain(
        self, project: Path, trivial_session: Path
    ) -> None:
        """AC5: Skip → complete-phase works without gate evaluation step."""
        resolve_result = resolve_gate(
            "e2e-2", "trivial", "setup", project_root=project
        )
        assert resolve_result["status"] == "skip"

        # Skip gate evaluation entirely, go straight to complete-phase
        complete_result = complete_phase(
            "e2e-2",
            "trivial",
            "setup",
            resolve_result["next_phase"],
            "skip",  # No gate was evaluated
            project,
        )
        assert complete_result["status"] == "success"

        # Verify session updated correctly
        content = trivial_session.read_text()
        assert "**Phase:** implement" in content
