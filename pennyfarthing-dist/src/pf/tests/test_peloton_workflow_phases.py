"""Tests for peloton workflow phase plan — full TDD phase wiring.

Story 148-14: Peloton must read the workflow YAML and execute ALL phases,
not a hardcoded subset. These tests verify the phase plan is built from
the workflow YAML with correct ordering, agent mapping, and gate types.

RED state: The function `get_workflow_phases()` does not exist yet.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml


@pytest.fixture
def project_full_tdd(tmp_path: Path) -> Path:
    """Create a project with the FULL 8-phase TDD workflow.

    Mirrors the real tdd.yaml — setup through finish with all gates.
    """
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    wf_dir = pf_dir / "workflows"
    wf_dir.mkdir()

    tdd_workflow = {
        "workflow": {
            "name": "tdd",
            "description": "Test-driven development with code review",
            "version": "1.0.0",
            "phases": [
                {
                    "name": "setup",
                    "agent": "sm",
                    "gate": {"type": "sm_setup_exit"},
                },
                {
                    "name": "red",
                    "agent": "tea",
                    "gate": {"type": "tests_fail"},
                },
                {
                    "name": "green",
                    "agent": "dev",
                    "gate": {"type": "dev_exit"},
                },
                {
                    "name": "spec-check",
                    "agent": "architect",
                    "gate": {"type": "spec_check"},
                },
                {
                    "name": "verify",
                    "agent": "tea",
                    "gate": {"type": "quality_pass"},
                },
                {
                    "name": "review",
                    "agent": "reviewer",
                    "gate": {"type": "approval"},
                },
                {
                    "name": "spec-reconcile",
                    "agent": "architect",
                    "gate": {"type": "spec_reconcile"},
                },
                {
                    "name": "finish",
                    "agent": "sm",
                },
            ],
        }
    }
    (wf_dir / "tdd.yaml").write_text(yaml.dump(tdd_workflow, default_flow_style=False))

    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "99-1-session.md").write_text(
        "**Story:** 99-1\n"
        "**Workflow:** tdd\n"
        "**Phase:** setup\n"
    )

    return tmp_path


@pytest.fixture
def project_minimal(tmp_path: Path) -> Path:
    """Project with a minimal 3-phase workflow (for contrast)."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    wf_dir = pf_dir / "workflows"
    wf_dir.mkdir()

    trivial_workflow = {
        "workflow": {
            "name": "trivial",
            "phases": [
                {"name": "setup", "agent": "sm", "gate": {"type": "sm_setup_exit"}},
                {"name": "implement", "agent": "dev", "gate": {"type": "dev_exit"}},
                {"name": "finish", "agent": "sm"},
            ],
        }
    }
    (wf_dir / "trivial.yaml").write_text(
        yaml.dump(trivial_workflow, default_flow_style=False)
    )

    return tmp_path


class TestGetWorkflowPhases:
    """Test that get_workflow_phases returns ALL phases from workflow YAML."""

    def test_function_exists(self) -> None:
        """get_workflow_phases must be importable from peloton.live."""
        from pf.peloton.live import get_workflow_phases  # noqa: F401

    def test_returns_all_eight_tdd_phases(self, project_full_tdd: Path) -> None:
        """All 8 TDD phases must appear — no skipping."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)

        assert result["success"]
        phases = result["data"]
        phase_names = [p["name"] for p in phases]
        assert phase_names == [
            "setup",
            "red",
            "green",
            "spec-check",
            "verify",
            "review",
            "spec-reconcile",
            "finish",
        ]

    def test_phase_count_matches_yaml(self, project_full_tdd: Path) -> None:
        """Phase count must match the YAML — no extras, no omissions."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)

        assert result["success"]
        assert len(result["data"]) == 8

    def test_phase_order_matches_yaml_exactly(self, project_full_tdd: Path) -> None:
        """Phase order must be identical to the YAML definition order."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = result["data"]

        # Verify sequential ordering — each phase must come after the previous
        expected_order = [
            "setup", "red", "green", "spec-check",
            "verify", "review", "spec-reconcile", "finish",
        ]
        for i, name in enumerate(expected_order):
            assert phases[i]["name"] == name, (
                f"Phase {i} should be '{name}', got '{phases[i]['name']}'"
            )


class TestPhaseAgentMapping:
    """Test that each phase maps to the correct agent from the workflow YAML."""

    def test_setup_maps_to_sm(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["setup"]["agent"] == "sm"

    def test_red_maps_to_tea(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["red"]["agent"] == "tea"

    def test_green_maps_to_dev(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["green"]["agent"] == "dev"

    def test_spec_check_maps_to_architect(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["spec-check"]["agent"] == "architect"

    def test_verify_maps_to_tea(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["verify"]["agent"] == "tea"

    def test_review_maps_to_reviewer(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["review"]["agent"] == "reviewer"

    def test_spec_reconcile_maps_to_architect(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["spec-reconcile"]["agent"] == "architect"

    def test_finish_maps_to_sm(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["finish"]["agent"] == "sm"


class TestPhaseGateTypes:
    """Test that each phase transition uses the correct gate type from YAML."""

    def test_setup_gate_is_sm_setup_exit(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["setup"]["gate_type"] == "sm_setup_exit"

    def test_red_gate_is_tests_fail(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["red"]["gate_type"] == "tests_fail"

    def test_green_gate_is_dev_exit(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["green"]["gate_type"] == "dev_exit"

    def test_spec_check_gate_is_spec_check(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["spec-check"]["gate_type"] == "spec_check"

    def test_verify_gate_is_quality_pass(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["verify"]["gate_type"] == "quality_pass"

    def test_review_gate_is_approval(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["review"]["gate_type"] == "approval"

    def test_spec_reconcile_gate_is_spec_reconcile(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["spec-reconcile"]["gate_type"] == "spec_reconcile"

    def test_finish_has_no_gate(self, project_full_tdd: Path) -> None:
        """Finish phase has no gate — it's the terminal phase."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = {p["name"]: p for p in result["data"]}
        assert phases["finish"].get("gate_type") is None


class TestNoSkippedPhases:
    """Verify that no phases are dropped between setup and finish."""

    def test_spec_check_not_skipped(self, project_full_tdd: Path) -> None:
        """spec-check was previously skipped — it must be present."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phase_names = [p["name"] for p in result["data"]]
        assert "spec-check" in phase_names

    def test_verify_not_skipped(self, project_full_tdd: Path) -> None:
        """verify was previously skipped — it must be present."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phase_names = [p["name"] for p in result["data"]]
        assert "verify" in phase_names

    def test_spec_reconcile_not_skipped(self, project_full_tdd: Path) -> None:
        """spec-reconcile was previously skipped — it must be present."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phase_names = [p["name"] for p in result["data"]]
        assert "spec-reconcile" in phase_names

    def test_consecutive_phases_have_no_gaps(self, project_full_tdd: Path) -> None:
        """Every YAML phase must appear — count matches YAML exactly."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)
        phases = result["data"]

        # Load the workflow YAML directly and compare
        wf_path = project_full_tdd / ".pennyfarthing" / "workflows" / "tdd.yaml"
        with open(wf_path) as f:
            wf_data = yaml.safe_load(f)

        yaml_phases = wf_data["workflow"]["phases"]
        assert len(phases) == len(yaml_phases), (
            f"Phase count mismatch: got {len(phases)}, YAML has {len(yaml_phases)}"
        )


class TestWorkflowDriverPhaseIntegration:
    """Test that WorkflowDriver builds phases from the workflow YAML."""

    def test_driver_builds_phases_from_workflow(self, project_full_tdd: Path) -> None:
        """WorkflowDriver.load_workflow must populate all 8 phases."""
        from pf.peloton.workflow_driver import WorkflowDriver
        from pf.peloton.pane_orchestrator import PaneOrchestrator

        orchestrator = PaneOrchestrator(
            project_root=project_full_tdd,
            session_name="test",
            story_id="99-1",
        )
        driver = WorkflowDriver(
            orchestrator=orchestrator,
            session_file=project_full_tdd / ".session" / "99-1-session.md",
        )

        wf_path = project_full_tdd / ".pennyfarthing" / "workflows" / "tdd.yaml"
        result = driver.load_workflow(wf_path)

        assert result["success"], f"load_workflow failed: {result.get('error')}"
        assert len(driver.phases) == 8

    def test_driver_phases_have_gate_types(self, project_full_tdd: Path) -> None:
        """Each phase config must carry its gate type from the YAML."""
        from pf.peloton.workflow_driver import WorkflowDriver
        from pf.peloton.pane_orchestrator import PaneOrchestrator

        orchestrator = PaneOrchestrator(
            project_root=project_full_tdd,
            session_name="test",
            story_id="99-1",
        )
        driver = WorkflowDriver(
            orchestrator=orchestrator,
            session_file=project_full_tdd / ".session" / "99-1-session.md",
        )

        wf_path = project_full_tdd / ".pennyfarthing" / "workflows" / "tdd.yaml"
        driver.load_workflow(wf_path)

        gate_types = [p.gate_type for p in driver.phases]
        assert "tests_fail" in gate_types
        assert "dev_exit" in gate_types
        assert "spec_check" in gate_types
        assert "quality_pass" in gate_types
        assert "approval" in gate_types
        assert "spec_reconcile" in gate_types

    def test_driver_phase_roles_match_yaml(self, project_full_tdd: Path) -> None:
        """Phase roles must match the YAML agent field exactly."""
        from pf.peloton.workflow_driver import WorkflowDriver
        from pf.peloton.pane_orchestrator import PaneOrchestrator

        orchestrator = PaneOrchestrator(
            project_root=project_full_tdd,
            session_name="test",
            story_id="99-1",
        )
        driver = WorkflowDriver(
            orchestrator=orchestrator,
            session_file=project_full_tdd / ".session" / "99-1-session.md",
        )

        wf_path = project_full_tdd / ".pennyfarthing" / "workflows" / "tdd.yaml"
        driver.load_workflow(wf_path)

        roles = [p.role for p in driver.phases]
        assert roles == [
            "sm", "tea", "dev", "architect", "tea",
            "reviewer", "architect", "sm",
        ]


class TestEdgeCases:
    """Edge cases and error handling."""

    def test_unknown_workflow_returns_error(self, project_full_tdd: Path) -> None:
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("nonexistent", project_full_tdd)

        assert not result["success"]
        assert "not found" in result["error"]

    def test_works_with_different_workflow(self, project_minimal: Path) -> None:
        """Must work for any workflow, not just TDD."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("trivial", project_minimal)

        assert result["success"]
        phase_names = [p["name"] for p in result["data"]]
        assert phase_names == ["setup", "implement", "finish"]

    def test_phase_data_includes_name_agent_gate(self, project_full_tdd: Path) -> None:
        """Each phase dict must have at minimum: name, agent, gate_type."""
        from pf.peloton.live import get_workflow_phases

        result = get_workflow_phases("tdd", project_full_tdd)

        for phase in result["data"]:
            assert "name" in phase, f"Phase missing 'name': {phase}"
            assert "agent" in phase, f"Phase missing 'agent': {phase}"
            # gate_type can be None for terminal phases (finish)
            assert "gate_type" in phase, f"Phase missing 'gate_type': {phase}"
