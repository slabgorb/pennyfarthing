"""Tests for pf handoff — Script-First Handoff (Story 105-1).

Epic: 105 (Script-First Handoff)
Story: 105-1 — Create handoff CLI with resolve-gate and complete-phase

Tests the two subcommands:
- resolve-gate: reads workflow YAML, resolves gate, returns RESOLVE_RESULT
- complete-phase: atomically updates session file with phase transition

Acceptance Criteria:
- [AC1] resolve-gate reads workflow YAML, finds current phase gate,
        checks assessment, returns structured RESOLVE_RESULT
- [AC2] complete-phase atomically updates session file (temp+mv) with
        phase transition, timestamps, and history tables
- [AC3] Python module in pf.handoff
- [AC4] stdout is the only communication channel — no side-channel files
- [AC5] Exit codes: 0 = ready/skip, 1 = blocked
- [AC6] YAML parsing via PyYAML
- [AC7] Session parsing via Python string/regex
"""

from __future__ import annotations

import re
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from click.testing import CliRunner

from pf.cli import cli
from pf.handoff.complete_phase import complete_phase
from pf.handoff.resolve_gate import resolve_gate

# ---------------------------------------------------------------------------
# Fixtures: Workflow YAML data
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

PATCH_WORKFLOW = {
    "workflow": {
        "name": "patch",
        "phases": [
            {"name": "fix", "agent": "dev", "gate": {"type": "manual"}},
        ],
    }
}

BDD_WORKFLOW = {
    "workflow": {
        "name": "bdd",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "design", "agent": "ux-designer", "gate": {"type": "design_review"}},
            {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
            {"name": "green", "agent": "dev", "gate": {"type": "tests_pass"}},
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}


# ---------------------------------------------------------------------------
# Fixtures: Session file content
# ---------------------------------------------------------------------------

SESSION_WITH_ASSESSMENT = textwrap.dedent("""\
    # Story 105-1: Create handoff-cli with resolve-gate and complete-phase

    **Story ID:** 105-1
    **Workflow:** tdd
    **Phase:** green
    **Phase Started:** 2026-02-15T07:53:07Z

    ## TEA Assessment

    **Tests Written:** 5 tests
    **Status:** RED confirmed

    ## Workflow Tracking

    **Phase:** green
    **Phase Started:** 2026-02-15T07:53:07Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | setup | 2026-02-15T07:50:00Z | 2026-02-15T07:52:00Z | 2m |
    | red | 2026-02-15T07:52:00Z | 2026-02-15T07:53:07Z | 1m |
    | green | 2026-02-15T07:53:07Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|
    | setup (sm) | red (tea) | - | PASSED | 2026-02-15T07:52:00Z |
    | red (tea) | green (dev) | tests_fail | PASSED | 2026-02-15T07:53:07Z |
""")

SESSION_WITHOUT_ASSESSMENT = textwrap.dedent("""\
    # Story 105-1: Create handoff-cli with resolve-gate and complete-phase

    **Story ID:** 105-1
    **Workflow:** tdd
    **Phase:** green
    **Phase Started:** 2026-02-15T07:53:07Z

    ## Workflow Tracking

    **Phase:** green
    **Phase Started:** 2026-02-15T07:53:07Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | green | 2026-02-15T07:53:07Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|
""")


# ---------------------------------------------------------------------------
# Fixtures: Project structure
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create a minimal project structure with workflow YAMLs."""
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)

    for name, data in [
        ("tdd", TDD_WORKFLOW),
        ("trivial", TRIVIAL_WORKFLOW),
        ("patch", PATCH_WORKFLOW),
        ("bdd", BDD_WORKFLOW),
    ]:
        (workflows_dir / f"{name}.yaml").write_text(yaml.dump(data, default_flow_style=False))

    (tmp_path / ".session").mkdir()
    return tmp_path


@pytest.fixture
def session_with_assessment(project: Path) -> Path:
    """Create a session file that has an assessment section."""
    session_file = project / ".session" / "105-1-session.md"
    session_file.write_text(SESSION_WITH_ASSESSMENT)
    return session_file


@pytest.fixture
def session_without_assessment(project: Path) -> Path:
    """Create a session file without an assessment section."""
    session_file = project / ".session" / "105-1-session.md"
    session_file.write_text(SESSION_WITHOUT_ASSESSMENT)
    return session_file


@pytest.fixture
def runner() -> CliRunner:
    """Create a CLI test runner."""
    return CliRunner()


# ===========================================================================
# AC1: resolve-gate returns structured RESOLVE_RESULT
# ===========================================================================


class TestResolveGateReady:
    """AC1 + AC5: resolve-gate returns 'ready' with correct fields."""

    def test_tdd_green_phase_returns_ready(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: TDD green phase (gate=tests_pass) → status: ready."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["status"] == "ready"

    def test_tdd_green_gate_type_is_tests_pass(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: TDD green phase gate type should be tests_pass."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["gate_type"] == "tests_pass"

    def test_tdd_green_next_agent_is_reviewer(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: After TDD green, next agent should be reviewer."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["next_agent"] == "reviewer"

    def test_tdd_green_next_phase_is_review(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: After TDD green, next phase should be review."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["next_phase"] == "review"

    def test_tdd_red_phase_returns_ready(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: TDD red phase (gate=tests_fail) → status: ready."""
        # Rewrite session to be in red phase with assessment
        session_file = project / ".session" / "105-1-session.md"
        content = session_file.read_text().replace("**Phase:** green", "**Phase:** red")
        session_file.write_text(content)
        result = resolve_gate("105-1", "tdd", "red", project_root=project)
        assert result["status"] == "ready"
        assert result["gate_type"] == "tests_fail"
        assert result["next_agent"] == "dev"
        assert result["next_phase"] == "green"

    def test_trivial_implement_returns_ready(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: Trivial implement (gate=tests_pass) → status: ready."""
        result = resolve_gate("105-1", "trivial", "implement", project_root=project)
        assert result["status"] == "ready"
        assert result["gate_type"] == "tests_pass"
        assert result["next_agent"] == "reviewer"

    def test_bdd_design_returns_ready(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: BDD design phase (gate=design_review) → ready."""
        result = resolve_gate("105-1", "bdd", "design", project_root=project)
        assert result["status"] == "ready"
        assert result["gate_type"] == "design_review"
        assert result["next_agent"] == "tea"
        assert result["next_phase"] == "red"

    def test_assessment_found_is_true(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: assessment_found should be True when assessment exists."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["assessment_found"] is True

    def test_exit_code_zero_when_ready(
        self, project: Path, session_with_assessment: Path, runner: CliRunner
    ) -> None:
        """AC5: Exit code 0 when gate resolves to ready."""
        with patch(
            "pf.handoff.resolve_gate.resolve_gate",
            return_value={
                "status": "ready",
                "gate_type": "tests_pass",
                "gate_file": None,
                "next_agent": "reviewer",
                "next_phase": "review",
                "assessment_found": True,
                "error": None,
            },
        ):
            result = runner.invoke(cli, ["handoff", "resolve-gate", "105-1", "tdd", "green"])
            assert result.exit_code == 0


class TestResolveGateBlocked:
    """AC1 + AC5: resolve-gate no longer blocks on missing assessment.

    Assessment guard moved to complete_phase to prevent race conditions
    where agents call resolve-gate before writing their assessment.
    """

    def test_missing_assessment_resolve_gate_still_ready(
        self, project: Path, session_without_assessment: Path
    ) -> None:
        """resolve-gate returns ready regardless of assessment (guard moved to complete-phase)."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["status"] == "ready"

    def test_missing_assessment_complete_phase_blocks(
        self, project: Path, session_without_assessment: Path
    ) -> None:
        """complete-phase blocks when no assessment found in session file."""
        result = complete_phase("105-1", "tdd", "green", "review", "tests_pass", project)
        assert result["status"] == "error"
        assert "assessment" in result["error"].lower()

    def test_blocked_exit_code_one(self, runner: CliRunner) -> None:
        """AC5: Exit code 1 when gate resolves to blocked."""
        with patch(
            "pf.handoff.resolve_gate.resolve_gate",
            return_value={
                "status": "blocked",
                "gate_type": "tests_pass",
                "gate_file": None,
                "next_agent": "reviewer",
                "next_phase": "review",
                "assessment_found": False,
                "error": None,
            },
        ):
            result = runner.invoke(cli, ["handoff", "resolve-gate", "105-1", "tdd", "green"])
            assert result.exit_code == 1


class TestResolveGateSkip:
    """AC1: resolve-gate returns 'skip' for manual gates."""

    def test_manual_gate_returns_skip(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: Patch fix phase (gate=manual) → status: skip."""
        result = resolve_gate("105-1", "patch", "fix", project_root=project)
        assert result["status"] == "skip"

    def test_manual_gate_type_is_manual(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: Skip result should have gate_type: manual."""
        result = resolve_gate("105-1", "patch", "fix", project_root=project)
        assert result["gate_type"] == "manual"

    def test_skip_exit_code_zero(self, runner: CliRunner) -> None:
        """AC5: Exit code 0 for skip status."""
        with patch(
            "pf.handoff.resolve_gate.resolve_gate",
            return_value={
                "status": "skip",
                "gate_type": "manual",
                "gate_file": None,
                "next_agent": None,
                "next_phase": None,
                "assessment_found": True,
                "error": None,
            },
        ):
            result = runner.invoke(cli, ["handoff", "resolve-gate", "105-1", "patch", "fix"])
            assert result.exit_code == 0


class TestResolveGateErrors:
    """AC1: resolve-gate returns error for invalid inputs."""

    def test_invalid_workflow_returns_error(self, project: Path) -> None:
        """AC1: Unknown workflow → error result."""
        result = resolve_gate("105-1", "nonexistent", "green", project_root=project)
        assert result["status"] == "error" or result.get("error") is not None

    def test_invalid_phase_returns_error(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: Unknown phase → error result."""
        result = resolve_gate("105-1", "tdd", "nonexistent", project_root=project)
        assert result["status"] == "error" or result.get("error") is not None

    def test_missing_session_file_resolve_gate_ready(self, project: Path) -> None:
        """resolve-gate returns ready even without session file (guard moved to complete-phase)."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["status"] == "ready"


class TestResolveGateOutputContract:
    """AC1: RESOLVE_RESULT must contain all specified fields."""

    REQUIRED_FIELDS = [
        "status",
        "gate_type",
        "gate_file",
        "next_agent",
        "next_phase",
        "assessment_found",
        "error",
    ]

    def test_ready_result_has_all_fields(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC1: Ready result must contain all RESOLVE_RESULT fields."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        for field in self.REQUIRED_FIELDS:
            assert field in result, f"Missing field: {field}"

    def test_blocked_result_has_all_fields(
        self, project: Path, session_without_assessment: Path
    ) -> None:
        """AC1: Blocked result must contain all RESOLVE_RESULT fields."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        for field in self.REQUIRED_FIELDS:
            assert field in result, f"Missing field: {field}"

    def test_skip_result_has_all_fields(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: Skip result must contain all RESOLVE_RESULT fields."""
        result = resolve_gate("105-1", "patch", "fix", project_root=project)
        for field in self.REQUIRED_FIELDS:
            assert field in result, f"Missing field: {field}"

    def test_gate_file_is_null_for_mvp(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: gate_file should be None for MVP (populated in epic 106)."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["gate_file"] is None

    def test_error_is_null_on_success(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: error should be None when resolve succeeds."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["error"] is None

    def test_status_is_valid_value(self, project: Path, session_with_assessment: Path) -> None:
        """AC1: status must be one of: ready, blocked, skip."""
        result = resolve_gate("105-1", "tdd", "green", project_root=project)
        assert result["status"] in ("ready", "blocked", "skip")


class TestResolveGateCLIOutput:
    """AC4 + AC6: CLI outputs valid YAML to stdout."""

    def test_cli_output_is_valid_yaml(self, runner: CliRunner) -> None:
        """AC6: CLI output should be parseable YAML."""
        with patch(
            "pf.handoff.resolve_gate.resolve_gate",
            return_value={
                "status": "ready",
                "gate_type": "tests_pass",
                "gate_file": None,
                "next_agent": "reviewer",
                "next_phase": "review",
                "assessment_found": True,
                "error": None,
            },
        ):
            result = runner.invoke(cli, ["handoff", "resolve-gate", "105-1", "tdd", "green"])
            parsed = yaml.safe_load(result.output)
            assert "RESOLVE_RESULT" in parsed

    def test_cli_output_wraps_in_resolve_result_key(self, runner: CliRunner) -> None:
        """AC4: Output should be wrapped in RESOLVE_RESULT key."""
        with patch(
            "pf.handoff.resolve_gate.resolve_gate",
            return_value={
                "status": "ready",
                "gate_type": "tests_pass",
                "gate_file": None,
                "next_agent": "reviewer",
                "next_phase": "review",
                "assessment_found": True,
                "error": None,
            },
        ):
            result = runner.invoke(cli, ["handoff", "resolve-gate", "105-1", "tdd", "green"])
            parsed = yaml.safe_load(result.output)
            assert parsed["RESOLVE_RESULT"]["status"] == "ready"


# ===========================================================================
# AC2: complete-phase atomically updates session file
# ===========================================================================


class TestCompletePhaseUpdatesSession:
    """AC2: complete-phase updates session with phase transition."""

    def test_updates_phase_line(self, project: Path, session_with_assessment: Path) -> None:
        """AC2: **Phase:** line should change to the new phase."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        # The Phase line in the Workflow Tracking section should be "review"
        assert "**Phase:** review" in content

    def test_phase_line_no_longer_has_old_value(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: Old phase value should not appear in **Phase:** line."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        # Should not have the old phase value on a Phase line
        phase_lines = [line for line in content.splitlines() if line.startswith("**Phase:**")]
        for line in phase_lines:
            assert "green" not in line

    def test_updates_phase_started_timestamp(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: **Phase Started:** should have a new ISO timestamp."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        # Find Phase Started lines — at least one should NOT be the old timestamp
        started_lines = [
            line for line in content.splitlines() if line.startswith("**Phase Started:**")
        ]
        assert len(started_lines) > 0
        # At least one should have a different timestamp than the original
        assert any("2026-02-15T07:53:07Z" not in line for line in started_lines)

    def test_fills_ended_in_phase_history(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: Current phase row in Phase History should get Ended timestamp."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        # The green phase row should now have an Ended value (not just "- |")
        # Find the row that starts with "| green"
        green_rows = [line for line in content.splitlines() if line.strip().startswith("| green")]
        assert len(green_rows) > 0
        # The Ended column (3rd) should not be "-"
        green_row = green_rows[0]
        cols = [c.strip() for c in green_row.split("|") if c.strip()]
        assert len(cols) >= 4, f"Expected 4+ columns, got: {cols}"
        ended = cols[2]  # Phase | Started | Ended | Duration
        assert ended != "-", f"Ended should be filled, got: {ended}"

    def test_fills_duration_in_phase_history(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: Current phase row should get Duration calculated."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        green_rows = [line for line in content.splitlines() if line.strip().startswith("| green")]
        assert len(green_rows) > 0
        green_row = green_rows[0]
        cols = [c.strip() for c in green_row.split("|") if c.strip()]
        duration = cols[3]  # Phase | Started | Ended | Duration
        assert duration != "-", f"Duration should be filled, got: {duration}"

    def test_adds_new_phase_row(self, project: Path, session_with_assessment: Path) -> None:
        """AC2: A new row for the next phase should appear in Phase History."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        review_rows = [line for line in content.splitlines() if line.strip().startswith("| review")]
        assert len(review_rows) > 0, "New 'review' phase row not found in Phase History"

    def test_adds_handoff_history_row(self, project: Path, session_with_assessment: Path) -> None:
        """AC2: A new row should be added to Handoff History table."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        # Should have a row mentioning green → review with tests_pass
        handoff_rows = [
            line
            for line in content.splitlines()
            if "green" in line and "review" in line and "tests_pass" in line
        ]
        assert len(handoff_rows) > 0, "Handoff History row for green→review not found"

    def test_handoff_history_includes_passed_status(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: Handoff History row should include PASSED status."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        # Find the new handoff row (should be the last one with "review")
        lines = content.splitlines()
        handoff_section = False
        handoff_rows = []
        for line in lines:
            if "### Handoff History" in line:
                handoff_section = True
                continue
            if handoff_section and line.strip().startswith("|") and "---" not in line:
                if "From" not in line:  # Skip header
                    handoff_rows.append(line)
        # Last row should have PASSED
        assert len(handoff_rows) > 0
        last_row = handoff_rows[-1]
        assert "PASSED" in last_row

    def test_handoff_history_includes_timestamp(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: Handoff History row should include an ISO timestamp."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        lines = content.splitlines()
        handoff_section = False
        handoff_rows = []
        for line in lines:
            if "### Handoff History" in line:
                handoff_section = True
                continue
            if handoff_section and line.strip().startswith("|") and "---" not in line:
                if "From" not in line:
                    handoff_rows.append(line)
        assert len(handoff_rows) > 0
        last_row = handoff_rows[-1]
        # Should contain ISO timestamp pattern
        assert re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", last_row)


class TestCompletePhaseAtomicity:
    """AC2: Session update must be atomic (temp + mv)."""

    def test_session_file_exists_after_update(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: Session file should still exist after update."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        assert session_with_assessment.exists()

    def test_no_temp_files_left_behind(self, project: Path, session_with_assessment: Path) -> None:
        """AC2: No .tmp or temporary files should remain in .session/."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        session_dir = project / ".session"
        temp_files = list(session_dir.glob("*.tmp")) + list(session_dir.glob("*.bak"))
        assert len(temp_files) == 0, f"Temp files left behind: {temp_files}"

    def test_session_content_is_valid_after_update(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: Session file should still be valid markdown after update."""
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        content = session_with_assessment.read_text()
        # Should still have required sections
        assert "# Story 105-1" in content
        assert "## Workflow Tracking" in content
        assert "### Phase History" in content
        assert "### Handoff History" in content


class TestCompletePhaseOutputContract:
    """AC2: COMPLETE_RESULT must contain all specified fields."""

    def test_returns_success_status(self, project: Path, session_with_assessment: Path) -> None:
        """AC2: Successful update should return status: success."""
        result = complete_phase(
            "105-1", "tdd", "green", "review", "tests_pass", project_root=project
        )
        assert result["status"] == "success"

    def test_returns_session_file_path(self, project: Path, session_with_assessment: Path) -> None:
        """AC2: Result should include the session file path."""
        result = complete_phase(
            "105-1", "tdd", "green", "review", "tests_pass", project_root=project
        )
        assert "session_file" in result
        assert "105-1-session.md" in result["session_file"]

    def test_returns_null_error_on_success(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC2: error should be None on success."""
        result = complete_phase(
            "105-1", "tdd", "green", "review", "tests_pass", project_root=project
        )
        assert result["error"] is None

    def test_cli_output_is_valid_yaml(self, runner: CliRunner) -> None:
        """AC6: CLI output should be parseable YAML."""
        with patch(
            "pf.handoff.complete_phase.complete_phase",
            return_value={
                "status": "success",
                "session_file": ".session/105-1-session.md",
                "error": None,
            },
        ):
            result = runner.invoke(
                cli,
                [
                    "handoff",
                    "complete-phase",
                    "105-1",
                    "tdd",
                    "green",
                    "review",
                    "tests_pass",
                ],
            )
            assert result.exit_code == 0
            parsed = yaml.safe_load(result.output)
            assert "COMPLETE_RESULT" in parsed

    def test_cli_exit_code_zero_on_success(self, runner: CliRunner) -> None:
        """AC5: Exit code 0 on successful phase completion."""
        with patch(
            "pf.handoff.complete_phase.complete_phase",
            return_value={
                "status": "success",
                "session_file": ".session/105-1-session.md",
                "error": None,
            },
        ):
            result = runner.invoke(
                cli,
                [
                    "handoff",
                    "complete-phase",
                    "105-1",
                    "tdd",
                    "green",
                    "review",
                    "tests_pass",
                ],
            )
            assert result.exit_code == 0


class TestCompletePhaseErrors:
    """AC2: Error handling for complete-phase."""

    def test_missing_session_file_returns_error(self, project: Path) -> None:
        """AC2: No session file → error result."""
        result = complete_phase(
            "105-1", "tdd", "green", "review", "tests_pass", project_root=project
        )
        assert result["status"] == "error"
        assert result["error"] is not None

    def test_error_exit_code_one(self, runner: CliRunner) -> None:
        """AC5: Exit code 1 on error."""
        with patch(
            "pf.handoff.complete_phase.complete_phase",
            return_value={
                "status": "error",
                "session_file": None,
                "error": "Session file not found",
            },
        ):
            result = runner.invoke(
                cli,
                [
                    "handoff",
                    "complete-phase",
                    "105-1",
                    "tdd",
                    "green",
                    "review",
                    "tests_pass",
                ],
            )
            assert result.exit_code == 1


# ===========================================================================
# AC4: stdout is the only communication channel
# ===========================================================================


class TestStdoutOnlyCommunication:
    """AC4: No side-channel files created during execution."""

    def test_resolve_gate_no_side_files(self, project: Path, session_with_assessment: Path) -> None:
        """AC4: resolve-gate should not create any files."""
        files_before = set(project.rglob("*"))
        resolve_gate("105-1", "tdd", "green", project_root=project)
        files_after = set(project.rglob("*"))
        new_files = files_after - files_before
        assert len(new_files) == 0, f"Unexpected files created: {new_files}"

    def test_complete_phase_only_modifies_session(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """AC4: complete-phase should only modify the session file."""
        # Record all files and their mtimes
        files_before = {p: p.stat().st_mtime for p in project.rglob("*") if p.is_file()}
        complete_phase("105-1", "tdd", "green", "review", "tests_pass", project_root=project)
        files_after = {p: p.stat().st_mtime for p in project.rglob("*") if p.is_file()}
        # Only the session file should be modified
        changed = {p for p, mtime in files_after.items() if files_before.get(p) != mtime}
        new = set(files_after) - set(files_before)
        all_changes = changed | new
        allowed = {session_with_assessment}
        unexpected = all_changes - allowed
        assert len(unexpected) == 0, f"Unexpected file changes: {unexpected}"


# ===========================================================================
# AC3: CLI command group exists and is invokable
# ===========================================================================


class TestHandoffCommandExists:
    """AC3: pf handoff command group with subcommands."""

    def test_handoff_help(self, runner: CliRunner) -> None:
        """AC3: pf handoff --help should work."""
        result = runner.invoke(cli, ["handoff", "--help"])
        assert result.exit_code == 0
        assert "resolve-gate" in result.output
        assert "complete-phase" in result.output

    def test_resolve_gate_help(self, runner: CliRunner) -> None:
        """AC3: pf handoff resolve-gate --help should work."""
        result = runner.invoke(cli, ["handoff", "resolve-gate", "--help"])
        assert result.exit_code == 0
        assert "STORY_ID" in result.output

    def test_complete_phase_help(self, runner: CliRunner) -> None:
        """AC3: pf handoff complete-phase --help should work."""
        result = runner.invoke(cli, ["handoff", "complete-phase", "--help"])
        assert result.exit_code == 0
        assert "STORY_ID" in result.output


# ===========================================================================
# Cross-workflow: resolve-gate works with multiple workflow types
# ===========================================================================


class TestResolveGateMultipleWorkflows:
    """Verify resolve-gate handles the gate types across all workflows."""

    def test_tdd_review_gate_is_approval(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """TDD review phase gate should be 'approval'."""
        result = resolve_gate("105-1", "tdd", "review", project_root=project)
        assert result["gate_type"] == "approval"
        assert result["next_agent"] == "sm"
        assert result["next_phase"] == "finish"

    def test_trivial_review_gate_is_approval(
        self, project: Path, session_with_assessment: Path
    ) -> None:
        """Trivial review phase gate should be 'approval'."""
        result = resolve_gate("105-1", "trivial", "review", project_root=project)
        assert result["gate_type"] == "approval"
        assert result["next_agent"] == "sm"
        assert result["next_phase"] == "finish"

    def test_last_phase_has_no_next(self, project: Path, session_with_assessment: Path) -> None:
        """Finish phase (last) should indicate no next phase/agent."""
        result = resolve_gate("105-1", "tdd", "finish", project_root=project)
        # Last phase has no gate and no next — should handle gracefully
        assert result["next_phase"] is None or result.get("error") is not None
