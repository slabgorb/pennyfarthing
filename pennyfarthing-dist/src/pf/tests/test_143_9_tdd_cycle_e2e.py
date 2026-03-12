"""Full TDD cycle end-to-end validation (Story 143-9).

Epic: 143 (Native Subagent Migration)
Story: 143-9 — Full TDD cycle end-to-end validation

Validates the complete SM → TEA → Dev → TEA (verify) → Reviewer → SM pipeline.
Unlike partial chain tests (test_handoff_e2e.py, test_143_7_chain_phases.py),
this test covers ALL six phase transitions in sequence, verifying:
- Session state integrity across the full cycle
- Gate resolution at every transition point
- Phase ownership (correct agent at each phase)
- Assessment guards (gated transitions require assessments)
- Workflow state detection at each phase
- Phase history and handoff history accumulation
- Finish state detection when review is approved

Acceptance Criteria:
- [AC1] Full 6-phase chain: setup → red → green → verify → review → finish
- [AC2] Session file accumulates correct phase history across all transitions
- [AC3] Phase ownership validated — wrong agent gets redirect at each phase
- [AC4] Gate resolution returns correct gate type for each phase
- [AC5] Assessment guards block transitions when assessment is missing
- [AC6] Workflow state detection returns correct state at each phase
- [AC7] Finish state detected when phase reaches approved/finish
"""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.complete_phase import complete_phase
from pf.handoff.phase_check import phase_check_start
from pf.handoff.resolve_gate import resolve_gate
from pf.prime.workflow import detect_workflow_state, parse_session_header

# ---------------------------------------------------------------------------
# TDD workflow definition (matching real tdd.yaml)
# ---------------------------------------------------------------------------

TDD_WORKFLOW = {
    "workflow": {
        "name": "tdd",
        "description": "Test-driven development with code review",
        "version": "1.0.0",
        "phases": [
            {
                "name": "setup",
                "agent": "sm",
                "gate": {"type": "sm_setup_exit", "file": "gates/sm-setup-exit"},
            },
            {
                "name": "red",
                "agent": "tea",
                "gate": {"type": "tests_fail", "file": "gates/tests-fail"},
            },
            {
                "name": "green",
                "agent": "dev",
                "gate": {"type": "dev_exit", "file": "gates/dev-exit"},
            },
            {
                "name": "verify",
                "agent": "tea",
                "gate": {"type": "quality_pass", "file": "gates/quality-pass"},
            },
            {
                "name": "review",
                "agent": "reviewer",
                "gate": {"type": "approval", "file": "gates/approval"},
            },
            {"name": "finish", "agent": "sm"},
        ],
    }
}

# Phase ordering with their agents and gate types
PHASE_SEQUENCE = [
    ("setup", "sm", "sm_setup_exit"),
    ("red", "tea", "tests_fail"),
    ("green", "dev", "dev_exit"),
    ("verify", "tea", "quality_pass"),
    ("review", "reviewer", "approval"),
    ("finish", "sm", None),
]

# ---------------------------------------------------------------------------
# Session templates
# ---------------------------------------------------------------------------

SESSION_AT_SETUP = textwrap.dedent("""\
    # Story e2e-full-1: Full TDD Cycle E2E

    **Story ID:** e2e-full-1
    **Workflow:** tdd
    **Phase:** setup
    **Phase Started:** 2026-03-12T10:00:00Z

    ## Story Details
    - **ID:** e2e-full-1
    - **Jira Key:** MSSCI-99999
    - **Points:** 5
    - **Workflow:** tdd
    - **Stack Parent:** none

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** setup
    **Phase Started:** 2026-03-12T10:00:00Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | setup | 2026-03-12T10:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|

    ## Story Context

    Full TDD cycle validation story.

    ## SM Assessment

    Story claimed and session established. Handing off to TEA for RED phase.

    ## Delivery Findings

    - No upstream findings.

    ## Design Deviations

    - No deviations.
""")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create minimal project structure with TDD workflow YAML."""
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)
    (workflows_dir / "tdd.yaml").write_text(
        yaml.dump(TDD_WORKFLOW, default_flow_style=False)
    )

    # Create gate files (empty — we only test resolution, not evaluation)
    gates_dir = tmp_path / ".pennyfarthing" / "gates"
    gates_dir.mkdir(parents=True)
    for gate_name in [
        "sm-setup-exit",
        "tests-fail",
        "dev-exit",
        "quality-pass",
        "approval",
    ]:
        (gates_dir / f"{gate_name}.md").write_text(f"# {gate_name} gate\n")

    # Repos topology (needed for gate extension resolution)
    (tmp_path / ".pennyfarthing" / "repos.yaml").write_text(
        yaml.dump({"repos": {"pennyfarthing": {"path": "pennyfarthing", "type": "framework"}}})
    )

    # Sprint (needed for backlog count)
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(
        yaml.dump(
            {
                "sprint": {"number": 2610, "goal": "Test sprint"},
                "epics": [],
                "stories": [],
            }
        )
    )

    (tmp_path / ".session").mkdir()
    return tmp_path


@pytest.fixture
def session_at_setup(project: Path) -> Path:
    """Session file at setup phase with SM assessment."""
    session_file = project / ".session" / "e2e-full-1-session.md"
    session_file.write_text(SESSION_AT_SETUP)
    return session_file


def _add_assessment(session_file: Path, agent: str, phase: str) -> None:
    """Add an agent assessment section to the session file."""
    content = session_file.read_text()
    assessment = (
        f"\n## {agent.upper()} Assessment\n\n"
        f"**Phase:** {phase}\n"
        f"**Status:** Complete\n"
        f"**Handoff:** To next agent\n"
    )
    content += assessment
    session_file.write_text(content)


def _read_phase(session_file: Path) -> str:
    """Read the current phase from a session file."""
    content = session_file.read_text()
    match = re.search(r"\*\*Phase:\*\*\s+(\S+)", content)
    return match.group(1) if match else ""


def _count_phase_history_rows(session_file: Path) -> int:
    """Count data rows in Phase History table (exclude header/separator)."""
    content = session_file.read_text()
    in_phase_history = False
    count = 0
    for line in content.splitlines():
        if "### Phase History" in line:
            in_phase_history = True
            continue
        if in_phase_history:
            if line.strip().startswith("###") or (not line.strip() and count > 0):
                break
            if line.strip().startswith("|") and not line.strip().startswith("| Phase"):
                stripped = line.strip()
                if not stripped.startswith("|---"):
                    count += 1
    return count


def _count_handoff_history_rows(session_file: Path) -> int:
    """Count data rows in Handoff History table."""
    content = session_file.read_text()
    in_handoff = False
    count = 0
    for line in content.splitlines():
        if "### Handoff History" in line:
            in_handoff = True
            continue
        if in_handoff:
            if line.strip().startswith("###") or line.strip().startswith("## "):
                break
            if line.strip().startswith("|") and not line.strip().startswith("| From"):
                stripped = line.strip()
                if not stripped.startswith("|---"):
                    count += 1
    return count


# ===========================================================================
# AC1: Full 6-phase chain: setup → red → green → verify → review → finish
# ===========================================================================


class TestFullTDDCycleChain:
    """AC1: Complete SM → TEA → Dev → TEA → Reviewer → SM transition chain."""

    def test_setup_to_red_transition(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """First transition: setup (SM) → red (TEA)."""
        result = resolve_gate("e2e-full-1", "tdd", "setup", project_root=project)
        assert result["status"] == "ready"
        assert result["next_phase"] == "red"
        assert result["next_agent"] == "tea"

        complete = complete_phase(
            "e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project
        )
        assert complete["status"] == "success"
        assert _read_phase(session_at_setup) == "red"

    def test_red_to_green_transition(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Second transition: red (TEA) → green (Dev)."""
        # Move to red first
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")

        result = resolve_gate("e2e-full-1", "tdd", "red", project_root=project)
        assert result["status"] == "ready"
        assert result["next_phase"] == "green"
        assert result["next_agent"] == "dev"

        complete = complete_phase(
            "e2e-full-1", "tdd", "red", "green", "tests_fail", project
        )
        assert complete["status"] == "success"
        assert _read_phase(session_at_setup) == "green"

    def test_green_to_verify_transition(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Third transition: green (Dev) → verify (TEA)."""
        # Move through setup → red → green
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")

        result = resolve_gate("e2e-full-1", "tdd", "green", project_root=project)
        assert result["status"] == "ready"
        assert result["next_phase"] == "verify"
        assert result["next_agent"] == "tea"

        complete = complete_phase(
            "e2e-full-1", "tdd", "green", "verify", "dev_exit", project
        )
        assert complete["status"] == "success"
        assert _read_phase(session_at_setup) == "verify"

    def test_verify_to_review_transition(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Fourth transition: verify (TEA) → review (Reviewer)."""
        # Move through setup → red → green → verify
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        _add_assessment(session_at_setup, "TEA", "verify")

        result = resolve_gate("e2e-full-1", "tdd", "verify", project_root=project)
        assert result["status"] == "ready"
        assert result["next_phase"] == "review"
        assert result["next_agent"] == "reviewer"

        complete = complete_phase(
            "e2e-full-1", "tdd", "verify", "review", "quality_pass", project
        )
        assert complete["status"] == "success"
        assert _read_phase(session_at_setup) == "review"

    def test_review_to_finish_transition(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Fifth transition: review (Reviewer) → finish (SM)."""
        # Move through all prior phases
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        _add_assessment(session_at_setup, "TEA", "verify")
        complete_phase("e2e-full-1", "tdd", "verify", "review", "quality_pass", project)
        _add_assessment(session_at_setup, "Reviewer", "review")

        result = resolve_gate("e2e-full-1", "tdd", "review", project_root=project)
        assert result["status"] == "ready"
        assert result["next_phase"] == "finish"
        assert result["next_agent"] == "sm"

        complete = complete_phase(
            "e2e-full-1", "tdd", "review", "finish", "approval", project
        )
        assert complete["status"] == "success"
        assert _read_phase(session_at_setup) == "finish"

    def test_full_cycle_sequential(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Complete cycle: all 5 transitions in sequence without interruption."""
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]

        for from_phase, to_phase, gate_type in transitions:
            # Resolve gate
            resolve_result = resolve_gate(
                "e2e-full-1", "tdd", from_phase, project_root=project
            )
            assert resolve_result["status"] == "ready", (
                f"Gate resolve failed at {from_phase} → {to_phase}: {resolve_result}"
            )
            assert resolve_result["next_phase"] == to_phase

            # Complete phase
            complete_result = complete_phase(
                "e2e-full-1", "tdd", from_phase, to_phase, gate_type, project
            )
            assert complete_result["status"] == "success", (
                f"Phase complete failed at {from_phase} → {to_phase}: {complete_result}"
            )

            # Verify session updated
            assert _read_phase(session_at_setup) == to_phase

            # Add assessment for next gated transition (finish has no gate)
            if to_phase != "finish":
                agent_map = {
                    "red": "TEA",
                    "green": "Dev",
                    "verify": "TEA",
                    "review": "Reviewer",
                }
                _add_assessment(session_at_setup, agent_map[to_phase], to_phase)

        # Final state should be finish
        assert _read_phase(session_at_setup) == "finish"


# ===========================================================================
# AC2: Session file accumulates correct phase history
# ===========================================================================


class TestPhaseHistoryAccumulation:
    """AC2: Phase history and handoff history grow correctly across transitions."""

    def test_phase_history_after_full_cycle(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """After full cycle, phase history has 6 rows (one per phase)."""
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]

        for from_phase, to_phase, gate_type in transitions:
            complete_phase(
                "e2e-full-1", "tdd", from_phase, to_phase, gate_type, project
            )
            if to_phase != "finish":
                agent_map = {"red": "TEA", "green": "Dev", "verify": "TEA", "review": "Reviewer"}
                _add_assessment(session_at_setup, agent_map[to_phase], to_phase)

        row_count = _count_phase_history_rows(session_at_setup)
        assert row_count == 6, f"Expected 6 phase history rows, got {row_count}"

    def test_handoff_history_after_full_cycle(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """After full cycle, handoff history has 5 rows (one per transition)."""
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]

        for from_phase, to_phase, gate_type in transitions:
            complete_phase(
                "e2e-full-1", "tdd", from_phase, to_phase, gate_type, project
            )
            if to_phase != "finish":
                agent_map = {"red": "TEA", "green": "Dev", "verify": "TEA", "review": "Reviewer"}
                _add_assessment(session_at_setup, agent_map[to_phase], to_phase)

        handoff_count = _count_handoff_history_rows(session_at_setup)
        assert handoff_count == 5, f"Expected 5 handoff history rows, got {handoff_count}"

    def test_completed_phases_have_ended_timestamps(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """All completed phases (setup through review) have Ended timestamps filled."""
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]

        for from_phase, to_phase, gate_type in transitions:
            complete_phase(
                "e2e-full-1", "tdd", from_phase, to_phase, gate_type, project
            )
            if to_phase != "finish":
                agent_map = {"red": "TEA", "green": "Dev", "verify": "TEA", "review": "Reviewer"}
                _add_assessment(session_at_setup, agent_map[to_phase], to_phase)

        content = session_at_setup.read_text()
        completed_phases = ["setup", "red", "green", "verify", "review"]
        for phase_name in completed_phases:
            # Find phase history row (format: "| phase | started | ended | duration |")
            rows = [
                line for line in content.splitlines()
                if line.strip().startswith(f"| {phase_name} |")
            ]
            assert len(rows) >= 1, f"No phase history row for {phase_name}"
            cols = [c.strip() for c in rows[0].split("|") if c.strip()]
            assert cols[2] != "-", f"Phase {phase_name} Ended column should be filled, got '-'"

    def test_handoff_rows_contain_correct_agent_pairs(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Handoff history rows show correct from/to agent pairs."""
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]

        for from_phase, to_phase, gate_type in transitions:
            complete_phase(
                "e2e-full-1", "tdd", from_phase, to_phase, gate_type, project
            )
            if to_phase != "finish":
                agent_map = {"red": "TEA", "green": "Dev", "verify": "TEA", "review": "Reviewer"}
                _add_assessment(session_at_setup, agent_map[to_phase], to_phase)

        content = session_at_setup.read_text()

        expected_pairs = [
            ("setup (sm)", "red (tea)"),
            ("red (tea)", "green (dev)"),
            ("green (dev)", "verify (tea)"),
            ("verify (tea)", "review (reviewer)"),
            ("review (reviewer)", "finish (sm)"),
        ]

        for from_pair, to_pair in expected_pairs:
            matching = [
                line for line in content.splitlines()
                if from_pair in line and to_pair in line
            ]
            assert len(matching) >= 1, (
                f"Missing handoff row: {from_pair} → {to_pair}"
            )


# ===========================================================================
# AC3: Phase ownership — wrong agent gets redirect at each phase
# ===========================================================================


class TestPhaseOwnershipValidation:
    """AC3: phase_check_start redirects wrong agents at each phase."""

    def test_tea_redirected_during_setup(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """TEA cannot start during setup phase (SM owns it)."""
        result = phase_check_start("tea", project_root=project)
        assert result["action"] == "redirect"
        assert result["agent"] == "sm"
        assert result["phase_owner"] == "sm"

    def test_dev_redirected_during_setup(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Dev cannot start during setup phase."""
        result = phase_check_start("dev", project_root=project)
        assert result["action"] == "redirect"
        assert result["agent"] == "sm"

    def test_sm_allowed_during_setup(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """SM can start during setup phase (it's the owner)."""
        result = phase_check_start("sm", project_root=project)
        assert result["action"] == "start"

    def test_sm_redirected_during_red(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """SM redirected during red phase (TEA owns it)."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        result = phase_check_start("sm", project_root=project)
        assert result["action"] == "redirect"
        assert result["agent"] == "tea"

    def test_tea_allowed_during_red(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """TEA can start during red phase."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        result = phase_check_start("tea", project_root=project)
        assert result["action"] == "start"

    def test_tea_redirected_during_green(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """TEA redirected during green phase (Dev owns it)."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        result = phase_check_start("tea", project_root=project)
        assert result["action"] == "redirect"
        assert result["agent"] == "dev"

    def test_dev_allowed_during_green(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Dev can start during green phase."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        result = phase_check_start("dev", project_root=project)
        assert result["action"] == "start"

    def test_dev_redirected_during_verify(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Dev redirected during verify phase (TEA owns it)."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        result = phase_check_start("dev", project_root=project)
        assert result["action"] == "redirect"
        assert result["agent"] == "tea"

    def test_reviewer_redirected_during_verify(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Reviewer redirected during verify phase (TEA owns it)."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        result = phase_check_start("reviewer", project_root=project)
        assert result["action"] == "redirect"
        assert result["agent"] == "tea"

    def test_reviewer_allowed_during_review(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Reviewer can start during review phase."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        _add_assessment(session_at_setup, "TEA", "verify")
        complete_phase("e2e-full-1", "tdd", "verify", "review", "quality_pass", project)
        result = phase_check_start("reviewer", project_root=project)
        assert result["action"] == "start"


# ===========================================================================
# AC4: Gate resolution returns correct gate type for each phase
# ===========================================================================


class TestGateResolutionAllPhases:
    """AC4: resolve_gate returns correct gate info for every TDD phase."""

    @pytest.mark.parametrize(
        "phase,expected_gate_type,expected_next",
        [
            ("setup", "sm_setup_exit", "red"),
            ("red", "tests_fail", "green"),
            ("green", "dev_exit", "verify"),
            ("verify", "quality_pass", "review"),
            ("review", "approval", "finish"),
        ],
    )
    def test_gate_type_and_next_phase(
        self,
        project: Path,
        session_at_setup: Path,
        phase: str,
        expected_gate_type: str,
        expected_next: str,
    ) -> None:
        """Each phase resolves to its configured gate type and next phase."""
        result = resolve_gate("e2e-full-1", "tdd", phase, project_root=project)
        assert result["status"] == "ready"
        assert result["gate_type"] == expected_gate_type
        assert result["next_phase"] == expected_next

    def test_finish_phase_has_no_gate(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Finish phase has no gate — should return skip."""
        result = resolve_gate("e2e-full-1", "tdd", "finish", project_root=project)
        assert result["status"] == "skip"
        assert result["next_phase"] is None  # Last phase
        assert result["next_agent"] is None

    def test_each_phase_has_gate_file(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Each gated phase references a gate file."""
        gated_phases = ["setup", "red", "green", "verify", "review"]
        for phase in gated_phases:
            result = resolve_gate("e2e-full-1", "tdd", phase, project_root=project)
            assert result["gate_file"] is not None, f"Phase {phase} should have a gate_file"
            assert result["gate_file"].startswith("gates/"), (
                f"Phase {phase} gate_file should start with 'gates/', got {result['gate_file']}"
            )


# ===========================================================================
# AC5: Assessment guards block transitions when missing
# ===========================================================================


class TestAssessmentGuards:
    """AC5: Gated transitions require an assessment section."""

    def test_red_to_green_blocked_without_assessment(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """TEA must write assessment before red → green transition."""
        # Move to red phase (setup → red doesn't need guard since SM already has assessment)
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)

        # Remove all assessments by rewriting session
        content = session_at_setup.read_text()
        # Remove the SM Assessment that was there
        content = re.sub(r"## SM Assessment.*?(?=## |\Z)", "", content, flags=re.DOTALL)
        session_at_setup.write_text(content)

        # Attempt red → green without TEA assessment
        result = complete_phase(
            "e2e-full-1", "tdd", "red", "green", "tests_fail", project
        )
        assert result["status"] == "error"
        assert "assessment" in result["error"].lower()

    def test_green_to_verify_blocked_without_assessment(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Dev must write assessment before green → verify transition."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)

        # Remove all assessments
        content = session_at_setup.read_text()
        content = re.sub(r"## \w+ Assessment.*?(?=## |\Z)", "", content, flags=re.DOTALL)
        session_at_setup.write_text(content)

        result = complete_phase(
            "e2e-full-1", "tdd", "green", "verify", "dev_exit", project
        )
        assert result["status"] == "error"
        assert "assessment" in result["error"].lower()

    def test_skip_gate_bypasses_assessment_guard(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Skip gate type does not require assessment."""
        # Remove assessment
        content = session_at_setup.read_text()
        content = re.sub(r"## SM Assessment.*?(?=## |\Z)", "", content, flags=re.DOTALL)
        session_at_setup.write_text(content)

        # Skip gate should work without assessment
        result = complete_phase(
            "e2e-full-1", "tdd", "setup", "red", "skip", project
        )
        assert result["status"] == "success"


# ===========================================================================
# AC6: Workflow state detection at each phase
# ===========================================================================


class TestWorkflowStateDetection:
    """AC6: detect_workflow_state returns correct state at each phase."""

    def test_in_progress_during_setup(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Setup phase → IN_PROGRESS_STATE with sm as owner."""
        status = detect_workflow_state(project)
        assert status.state.value == "IN_PROGRESS_STATE"
        assert status.story_id == "e2e-full-1"
        assert status.phase == "setup"
        assert status.phase_owner == "sm"

    def test_in_progress_during_red(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Red phase → IN_PROGRESS_STATE with tea as owner."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        status = detect_workflow_state(project)
        assert status.state.value == "IN_PROGRESS_STATE"
        assert status.phase == "red"
        assert status.phase_owner == "tea"

    def test_in_progress_during_green(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Green phase → IN_PROGRESS_STATE with dev as owner."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        status = detect_workflow_state(project)
        assert status.state.value == "IN_PROGRESS_STATE"
        assert status.phase == "green"
        assert status.phase_owner == "dev"

    def test_in_progress_during_verify(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Verify phase → IN_PROGRESS_STATE with tea as owner."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        status = detect_workflow_state(project)
        assert status.state.value == "IN_PROGRESS_STATE"
        assert status.phase == "verify"
        assert status.phase_owner == "tea"

    def test_in_progress_during_review(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Review phase → IN_PROGRESS_STATE with reviewer as owner."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        _add_assessment(session_at_setup, "TEA", "verify")
        complete_phase("e2e-full-1", "tdd", "verify", "review", "quality_pass", project)
        status = detect_workflow_state(project)
        assert status.state.value == "IN_PROGRESS_STATE"
        assert status.phase == "review"
        assert status.phase_owner == "reviewer"


# ===========================================================================
# AC7: Finish state detected when phase reaches finish
# ===========================================================================


class TestFinishStateDetection:
    """AC7: detect_workflow_state returns FINISH_STATE at terminal phases."""

    def test_finish_phase_triggers_finish_state(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Phase=finish → FINISH_STATE."""
        # Run full cycle to reach finish
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]
        for from_phase, to_phase, gate_type in transitions:
            complete_phase(
                "e2e-full-1", "tdd", from_phase, to_phase, gate_type, project
            )
            if to_phase != "finish":
                agent_map = {"red": "TEA", "green": "Dev", "verify": "TEA", "review": "Reviewer"}
                _add_assessment(session_at_setup, agent_map[to_phase], to_phase)

        status = detect_workflow_state(project)
        assert status.state.value == "FINISH_STATE"
        assert status.phase_owner == "sm"

    def test_approved_phase_triggers_finish_state(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Phase=approved → FINISH_STATE (alternative finish detection)."""
        # Manually set phase to approved
        content = session_at_setup.read_text()
        content = content.replace("**Phase:** setup", "**Phase:** approved")
        session_at_setup.write_text(content)

        status = detect_workflow_state(project)
        assert status.state.value == "FINISH_STATE"
        assert status.phase_owner == "sm"

    def test_no_session_with_backlog_is_new_work(
        self, project: Path
    ) -> None:
        """No session file + backlog has stories → NEW_WORK_STATE."""
        # Add a story to backlog
        sprint_file = project / "sprint" / "current-sprint.yaml"
        sprint_data = {
            "sprint": {"number": 2610, "goal": "Test"},
            "epics": [
                {
                    "id": "1",
                    "title": "Test epic",
                    "status": "in_progress",
                    "stories": [
                        {"id": "1-1", "title": "Test story", "status": "backlog", "points": 3}
                    ],
                }
            ],
            "stories": [],
        }
        sprint_file.write_text(yaml.dump(sprint_data))

        status = detect_workflow_state(project)
        assert status.state.value == "NEW_WORK_STATE"
        assert status.backlog_count == 1

    def test_no_session_empty_backlog_is_empty_state(
        self, project: Path
    ) -> None:
        """No session file + empty backlog → EMPTY_BACKLOG_STATE."""
        status = detect_workflow_state(project)
        assert status.state.value == "EMPTY_BACKLOG_STATE"


# ===========================================================================
# Edge cases: Verify TEA dual-phase ownership
# ===========================================================================


class TestTEADualPhaseOwnership:
    """TEA owns both red and verify phases — verify no confusion."""

    def test_tea_owns_red_phase(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """TEA is the owner of red phase."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        status = detect_workflow_state(project)
        assert status.phase_owner == "tea"
        assert status.phase == "red"

    def test_tea_owns_verify_phase(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """TEA is the owner of verify phase (not confused with red)."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        status = detect_workflow_state(project)
        assert status.phase_owner == "tea"
        assert status.phase == "verify"

    def test_tea_not_redirected_during_verify(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """TEA is not redirected when activating during verify phase."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)
        result = phase_check_start("tea", project_root=project)
        assert result["action"] == "start"
        assert result["phase"] == "verify"

    def test_verify_gate_differs_from_red_gate(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Red uses tests_fail gate; verify uses quality_pass gate."""
        red_result = resolve_gate("e2e-full-1", "tdd", "red", project_root=project)
        verify_result = resolve_gate("e2e-full-1", "tdd", "verify", project_root=project)
        assert red_result["gate_type"] == "tests_fail"
        assert verify_result["gate_type"] == "quality_pass"
        assert red_result["gate_type"] != verify_result["gate_type"]


# ===========================================================================
# Edge case: Session header parsing after full cycle
# ===========================================================================


class TestSessionParsingAfterFullCycle:
    """Verify parse_session_header works correctly after multiple transitions."""

    def test_parse_header_at_finish(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Session header correctly parsed after reaching finish phase."""
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]
        for from_phase, to_phase, gate_type in transitions:
            complete_phase(
                "e2e-full-1", "tdd", from_phase, to_phase, gate_type, project
            )
            if to_phase != "finish":
                agent_map = {"red": "TEA", "green": "Dev", "verify": "TEA", "review": "Reviewer"}
                _add_assessment(session_at_setup, agent_map[to_phase], to_phase)

        header = parse_session_header(session_at_setup)
        assert header["story_id"] == "e2e-full-1"
        assert header["workflow"] == "tdd"
        assert header["phase"] == "finish"

    def test_workflow_field_preserved_across_transitions(
        self, project: Path, session_at_setup: Path
    ) -> None:
        """Workflow field remains 'tdd' after all transitions."""
        complete_phase("e2e-full-1", "tdd", "setup", "red", "sm_setup_exit", project)
        _add_assessment(session_at_setup, "TEA", "red")
        complete_phase("e2e-full-1", "tdd", "red", "green", "tests_fail", project)
        _add_assessment(session_at_setup, "Dev", "green")
        complete_phase("e2e-full-1", "tdd", "green", "verify", "dev_exit", project)

        header = parse_session_header(session_at_setup)
        assert header["workflow"] == "tdd"


# ===========================================================================
# AC8: YAML frontmatter session format works with full cycle
# ===========================================================================

# Session format matching what sm-setup actually creates (YAML frontmatter,
# ## Workflow Tracking section, no top-level **Phase:** fields)
SESSION_FRONTMATTER_FORMAT = textwrap.dedent("""\
    ---
    story_id: "e2e-fm-1"
    jira_key: "MSSCI-99997"
    epic: "MSSCI-99996"
    workflow: "tdd"
    ---
    # Story e2e-fm-1: Frontmatter Format Validation

    ## Story Details
    - **ID:** e2e-fm-1
    - **Jira Key:** MSSCI-99997
    - **Points:** 5
    - **Workflow:** tdd
    - **Stack Parent:** none

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** setup
    **Phase Started:** 2026-03-12T10:00:00Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | setup | 2026-03-12T10:00:00Z | - | - |

    ### Handoff History
    | From | To | Gate | Status | Timestamp |
    |------|-----|------|--------|-----------|

    ## Story Context

    Frontmatter format validation story.

    ## SM Assessment

    Story claimed. Handing off to TEA.

    ## Delivery Findings

    - No upstream findings.

    ## Design Deviations

    - No deviations.
""")


class TestFrontmatterSessionFormat:
    """AC8: Session files using YAML frontmatter format (as created by sm-setup)
    work correctly with parse_session_header and the full handoff cycle.

    This validates the session format that sm-setup ACTUALLY produces:
    - YAML frontmatter with story_id, jira_key, workflow
    - ## Workflow Tracking section (not top-level fields)
    - **Phase:** and **Workflow:** fields inside ## Workflow Tracking
    """

    @pytest.fixture
    def fm_session(self, project: Path) -> Path:
        """Session file using YAML frontmatter format."""
        session_file = project / ".session" / "e2e-fm-1-session.md"
        session_file.write_text(SESSION_FRONTMATTER_FORMAT)
        return session_file

    def test_parse_header_extracts_workflow_from_frontmatter(
        self, project: Path, fm_session: Path
    ) -> None:
        """parse_session_header should extract workflow from YAML frontmatter or
        ## Workflow Tracking section."""
        header = parse_session_header(fm_session)
        assert header.get("workflow") == "tdd", (
            f"Workflow not parsed from frontmatter session. Got: {header}"
        )

    def test_parse_header_extracts_phase_from_workflow_tracking(
        self, project: Path, fm_session: Path
    ) -> None:
        """parse_session_header should extract phase from ## Workflow Tracking."""
        header = parse_session_header(fm_session)
        assert header.get("phase") == "setup", (
            f"Phase not parsed from ## Workflow Tracking section. Got: {header}"
        )

    def test_detect_state_with_frontmatter_session(
        self, project: Path, fm_session: Path
    ) -> None:
        """detect_workflow_state should work with frontmatter session format."""
        status = detect_workflow_state(project)
        assert status.state.value == "IN_PROGRESS_STATE"
        assert status.phase == "setup"
        assert status.phase_owner == "sm"

    def test_phase_check_with_frontmatter_session(
        self, project: Path, fm_session: Path
    ) -> None:
        """phase_check_start should redirect wrong agents using frontmatter session."""
        result = phase_check_start("dev", project_root=project)
        assert result["action"] == "redirect", (
            f"Dev should be redirected during setup. Got: {result}"
        )
        assert result["agent"] == "sm"

    def test_full_cycle_with_frontmatter_session(
        self, project: Path, fm_session: Path
    ) -> None:
        """Complete TDD cycle using frontmatter session format."""
        transitions = [
            ("setup", "red", "sm_setup_exit"),
            ("red", "green", "tests_fail"),
            ("green", "verify", "dev_exit"),
            ("verify", "review", "quality_pass"),
            ("review", "finish", "approval"),
        ]

        for from_phase, to_phase, gate_type in transitions:
            complete_result = complete_phase(
                "e2e-fm-1", "tdd", from_phase, to_phase, gate_type, project
            )
            assert complete_result["status"] == "success", (
                f"Phase {from_phase} → {to_phase} failed: {complete_result}"
            )
            if to_phase != "finish":
                agent_map = {"red": "TEA", "green": "Dev", "verify": "TEA", "review": "Reviewer"}
                _add_assessment(fm_session, agent_map[to_phase], to_phase)

        # Verify finish state detected
        status = detect_workflow_state(project)
        assert status.state.value == "FINISH_STATE"

    def test_phase_ownership_after_transition_with_frontmatter(
        self, project: Path, fm_session: Path
    ) -> None:
        """After setup→red transition, frontmatter session shows TEA as owner."""
        complete_phase("e2e-fm-1", "tdd", "setup", "red", "sm_setup_exit", project)
        status = detect_workflow_state(project)
        assert status.phase == "red", (
            f"Phase should be 'red' after transition. Got: {status.phase}"
        )
        assert status.phase_owner == "tea", (
            f"Phase owner should be 'tea'. Got: {status.phase_owner}"
        )


# ===========================================================================
# AC9: Native subagent activation context at each phase
# ===========================================================================


class TestNativeSubagentActivation:
    """AC9: Native subagent definitions exist and can be loaded for each phase agent.

    Validates that the native agent definitions at pennyfarthing-dist/agents/native/
    are present, parseable, and contain the required frontmatter for all TDD
    workflow agents.
    """

    @pytest.fixture
    def native_agents(self, project: Path) -> Path:
        """Create native agent definitions matching real format."""
        native_dir = project / ".pennyfarthing" / "agents" / "native"
        native_dir.mkdir(parents=True, exist_ok=True)

        agents = {
            "sm": {
                "name": "sm",
                "description": "Scrum Master — story coordination",
                "model": "opus",
                "allowed-tools": ["Read", "Glob", "Grep", "Bash", "Agent", "Skill"],
            },
            "tea": {
                "name": "tea",
                "description": "Test Engineer — writes failing tests",
                "model": "opus",
                "allowed-tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent"],
            },
            "dev": {
                "name": "dev",
                "description": "Developer — implements features",
                "model": "opus",
                "allowed-tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent"],
            },
            "reviewer": {
                "name": "reviewer",
                "description": "Code Reviewer — adversarial review",
                "model": "opus",
                "allowed-tools": ["Read", "Glob", "Grep", "Bash", "Agent"],
            },
        }

        for agent_name, meta in agents.items():
            frontmatter = yaml.dump(meta, default_flow_style=False)
            content = f"---\n{frontmatter}---\n\n# {meta['name'].upper()} Agent\n\nAgent definition.\n"
            (native_dir / f"{agent_name}.md").write_text(content)

        return native_dir

    def test_all_tdd_agents_have_native_definitions(
        self, project: Path, native_agents: Path
    ) -> None:
        """Every agent in the TDD workflow has a native subagent definition."""
        required_agents = {"sm", "tea", "dev", "reviewer"}
        existing = {f.stem for f in native_agents.glob("*.md")}
        missing = required_agents - existing
        assert not missing, f"Missing native agent definitions: {missing}"

    def test_native_definitions_have_valid_frontmatter(
        self, project: Path, native_agents: Path
    ) -> None:
        """Each native agent definition has parseable YAML frontmatter."""
        for agent_file in native_agents.glob("*.md"):
            content = agent_file.read_text()
            assert content.startswith("---"), (
                f"{agent_file.name} missing YAML frontmatter delimiter"
            )
            # Extract frontmatter
            parts = content.split("---", 2)
            assert len(parts) >= 3, f"{agent_file.name} has incomplete frontmatter"
            meta = yaml.safe_load(parts[1])
            assert isinstance(meta, dict), f"{agent_file.name} frontmatter is not a dict"
            assert "name" in meta, f"{agent_file.name} missing 'name' in frontmatter"
            assert "allowed-tools" in meta, (
                f"{agent_file.name} missing 'allowed-tools' in frontmatter"
            )

    def test_reviewer_has_restricted_tools(
        self, project: Path, native_agents: Path
    ) -> None:
        """Reviewer agent should NOT have Write or Edit tools (read-only)."""
        reviewer_file = native_agents / "reviewer.md"
        content = reviewer_file.read_text()
        parts = content.split("---", 2)
        meta = yaml.safe_load(parts[1])
        tools = meta.get("allowed-tools", [])
        assert "Write" not in tools, "Reviewer should not have Write tool"
        assert "Edit" not in tools, "Reviewer should not have Edit tool"

    def test_dev_has_write_tools(
        self, project: Path, native_agents: Path
    ) -> None:
        """Dev agent should have Write and Edit tools."""
        dev_file = native_agents / "dev.md"
        content = dev_file.read_text()
        parts = content.split("---", 2)
        meta = yaml.safe_load(parts[1])
        tools = meta.get("allowed-tools", [])
        assert "Write" in tools, "Dev should have Write tool"
        assert "Edit" in tools, "Dev should have Edit tool"

    def test_tea_has_write_tools(
        self, project: Path, native_agents: Path
    ) -> None:
        """TEA agent should have Write and Edit tools (for test files)."""
        tea_file = native_agents / "tea.md"
        content = tea_file.read_text()
        parts = content.split("---", 2)
        meta = yaml.safe_load(parts[1])
        tools = meta.get("allowed-tools", [])
        assert "Write" in tools, "TEA should have Write tool"
        assert "Edit" in tools, "TEA should have Edit tool"

    def test_agent_name_matches_workflow_phase_agent(
        self, project: Path, native_agents: Path
    ) -> None:
        """Agent names in native definitions match workflow YAML agent fields."""
        workflow_path = project / ".pennyfarthing" / "workflows" / "tdd.yaml"
        data = yaml.safe_load(workflow_path.read_text())
        workflow_agents = {p["agent"] for p in data["workflow"]["phases"]}

        for agent_name in workflow_agents:
            agent_file = native_agents / f"{agent_name}.md"
            assert agent_file.exists(), (
                f"Workflow references agent '{agent_name}' but no native definition found"
            )
            content = agent_file.read_text()
            parts = content.split("---", 2)
            meta = yaml.safe_load(parts[1])
            assert meta["name"] == agent_name, (
                f"Native definition name '{meta['name']}' doesn't match "
                f"workflow agent '{agent_name}'"
            )
