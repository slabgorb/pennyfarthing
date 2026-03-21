"""Reviewer-Dev fix round-trip support (Story 143-10).

Epic: 143 (Native Subagent Migration)
Story: 143-10 — Reviewer-Dev fix round-trip support

When Reviewer rejects during the review phase, the workflow should loop
back to Dev (green phase) for fixes, then return to Reviewer for re-review.
This round-trip continues until Reviewer approves.

Acceptance Criteria:
- [AC1] When Reviewer gate fails (NOT APPROVED), resolve_gate returns
        recovery routing back to the green phase (Dev)
- [AC2] complete_phase supports backward transitions (review → green)
        and the session file reflects the loop
- [AC3] Dev receives handoff with reviewer findings context
- [AC4] After Dev fixes, resolve_gate routes back to verify → review
- [AC5] The gate recovery mechanism in TDD workflow's review phase
        supports the round-trip cycle via recovery config
"""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.complete_phase import complete_phase
from pf.handoff.resolve_gate import resolve_gate
from pf.prime.workflow import detect_workflow_state, parse_session_header

# ---------------------------------------------------------------------------
# TDD workflow with review-phase recovery (the target state)
# ---------------------------------------------------------------------------

TDD_WORKFLOW_WITH_RECOVERY = {
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
                "gate": {
                    "type": "approval",
                    "file": "gates/approval",
                    "recovery": {
                        "reviewer-verdict": {
                            "action": "rework",
                            "target_phase": "green",
                            "max_attempts": 3,
                        },
                    },
                },
            },
            {
                "name": "finish",
                "agent": "sm",
            },
        ],
    },
}

# Standard TDD workflow without recovery (current state)
TDD_WORKFLOW_NO_RECOVERY = {
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
            {
                "name": "finish",
                "agent": "sm",
            },
        ],
    },
}


def _make_session(phase: str = "review", round_trip_count: int = 0) -> str:
    """Create a session file template at the given phase."""
    round_trip_section = ""
    if round_trip_count > 0:
        round_trip_section = f"\n        **Round-Trip Count:** {round_trip_count}"

    return textwrap.dedent(f"""\
        ---
        story_id: "143-10"
        jira_key: "PROJ-16368"
        epic: "PROJ-16358"
        workflow: "tdd"
        ---
        # Story 143-10: Reviewer-Dev fix round-trip support

        ## Story Details
        - **ID:** 143-10
        - **Jira Key:** PROJ-16368

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** {phase}
        **Phase Started:** 2026-03-12T23:00:00Z{round_trip_section}

        ### Phase History
        | Phase | Started | Ended | Duration |
        |-------|---------|-------|----------|
        | setup | 2026-03-12T22:00:00Z | 2026-03-12T22:05:00Z | 5m |
        | red | 2026-03-12T22:05:00Z | 2026-03-12T22:15:00Z | 10m |
        | green | 2026-03-12T22:15:00Z | 2026-03-12T22:25:00Z | 10m |
        | verify | 2026-03-12T22:25:00Z | 2026-03-12T22:30:00Z | 5m |
        | {phase} | 2026-03-12T23:00:00Z | - | - |

        ### Handoff History
        | From | To | Gate | Result | Timestamp |
        |------|----|------|--------|-----------|
        | setup (sm) | red (tea) | sm_setup_exit | PASSED | 2026-03-12T22:05:00Z |
        | red (tea) | green (dev) | tests_fail | PASSED | 2026-03-12T22:15:00Z |
        | green (dev) | verify (tea) | dev_exit | PASSED | 2026-03-12T22:25:00Z |
        | verify (tea) | review (reviewer) | quality_pass | PASSED | 2026-03-12T22:30:00Z |

        ## Delivery Findings

        <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

        No upstream findings.

        ## Design Deviations

        <!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

        No deviations yet.

        ## SM Assessment

        Story claimed and session established.

        ## TEA Assessment

        **Tests Required:** Yes
        **Tests Written:** 10 tests
        **Status:** RED (failing)

        ## Dev Assessment

        **Implementation Complete:** Yes
        **Tests:** 10/10 passing (GREEN)

        ## TEA Verify Assessment

        **Phase:** verify
        **Status:** GREEN confirmed

        ## Reviewer Assessment

        **Verdict:** REJECTED
        **Findings:** 2 blocking, 1 minor

        - [EDGE] Missing null check on input parameter
        - [SEC] SQL injection risk in query builder
        - [SIMPLE] No concerns
        - [SILENT] No concerns
        - [TEST] No concerns
        - [DOC] No concerns
        - [TYPE] No concerns
    """)


def _make_approved_session() -> str:
    """Create a session file where Reviewer has approved."""
    return _make_session(phase="review").replace(
        "**Verdict:** REJECTED\n**Findings:** 2 blocking, 1 minor\n\n"
        "- [EDGE] Missing null check on input parameter\n"
        "- [SEC] SQL injection risk in query builder",
        "**Verdict:** APPROVED\n**Findings:** 0 blocking, 0 minor",
    )


def _setup_project(tmp_path: Path, workflow: dict) -> Path:
    """Create a minimal project structure with workflow YAML."""
    project = tmp_path / "project"
    project.mkdir()

    pf_dir = project / ".pennyfarthing"
    pf_dir.mkdir()

    wf_dir = pf_dir / "workflows"
    wf_dir.mkdir()

    (wf_dir / "tdd.yaml").write_text(yaml.dump(workflow, default_flow_style=False))

    session_dir = project / ".session"
    session_dir.mkdir()

    return project


# ===========================================================================
# AC1: resolve_gate returns recovery routing when review gate fails
# ===========================================================================


class TestReviewGateRecoveryRouting:
    """AC1: When Reviewer gate fails, resolve_gate should provide recovery
    routing information that directs the workflow back to the green phase."""

    def test_resolve_gate_review_phase_has_recovery_config(self, tmp_path):
        """The review phase gate in TDD workflow should have a recovery block
        that specifies rework routing back to the green phase."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        result = resolve_gate("143-10", "tdd", "review", project_root=project)

        assert result["status"] == "ready"
        assert result["gate_type"] == "approval"
        # The resolve_gate result should indicate that recovery is available
        # for the review phase — this means the workflow YAML has a recovery block
        assert result.get("recovery_config") is not None, (
            "resolve_gate should return recovery_config when the phase gate has a recovery block"
        )

    def test_resolve_gate_recovery_config_has_rework_action(self, tmp_path):
        """The recovery config should specify 'rework' action targeting 'green' phase."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        result = resolve_gate("143-10", "tdd", "review", project_root=project)

        recovery = result.get("recovery_config", {})
        verdict_recovery = recovery.get("reviewer-verdict", {})
        assert verdict_recovery.get("action") == "rework"
        assert verdict_recovery.get("target_phase") == "green"

    def test_resolve_gate_recovery_has_max_attempts(self, tmp_path):
        """Recovery should limit the number of round-trip attempts."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        result = resolve_gate("143-10", "tdd", "review", project_root=project)

        recovery = result.get("recovery_config", {})
        verdict_recovery = recovery.get("reviewer-verdict", {})
        assert verdict_recovery.get("max_attempts") == 3

    def test_resolve_gate_no_recovery_when_not_configured(self, tmp_path):
        """Without recovery config, resolve_gate should not include recovery_config."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_NO_RECOVERY)
        result = resolve_gate("143-10", "tdd", "review", project_root=project)

        assert result["status"] == "ready"
        assert result.get("recovery_config") is None


# ===========================================================================
# AC2: complete_phase supports backward transitions (review → green)
# ===========================================================================


class TestBackwardPhaseTransition:
    """AC2: complete_phase should handle backward transitions correctly,
    updating session file to reflect the round-trip."""

    def test_complete_phase_review_to_green(self, tmp_path):
        """complete_phase should successfully transition from review back to green."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        result = complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        assert result["status"] == "success"
        content = session.read_text()
        assert "**Phase:** green" in content

    def test_backward_transition_updates_phase_history(self, tmp_path):
        """Phase history should show the review phase ending and green restarting."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        content = session.read_text()
        lines = content.splitlines()

        # Find all green entries in phase history
        green_entries = [line for line in lines if line.strip().startswith("| green")]
        # Should have at least 2 green entries (original + rework)
        assert len(green_entries) >= 2, (
            f"Expected at least 2 green phase entries after round-trip, got {len(green_entries)}"
        )

    def test_backward_transition_updates_handoff_history(self, tmp_path):
        """Handoff history should record the review → green transition with rework gate type."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        content = session.read_text()
        assert "review (reviewer)" in content
        assert "green (dev)" in content
        assert "approval_rework" in content

    def test_round_trip_count_increments(self, tmp_path):
        """Session should track how many round-trips have occurred."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review", round_trip_count=0))

        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        content = session.read_text()
        # After first round-trip, count should be 1
        match = re.search(r"\*\*Round-Trip Count:\*\*\s*(\d+)", content)
        assert match is not None, "Session should contain a Round-Trip Count field"
        assert int(match.group(1)) == 1

    def test_second_round_trip_increments_count(self, tmp_path):
        """Second round-trip should increment the count to 2."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review", round_trip_count=1))

        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        content = session.read_text()
        match = re.search(r"\*\*Round-Trip Count:\*\*\s*(\d+)", content)
        assert match is not None
        assert int(match.group(1)) == 2


# ===========================================================================
# AC3: Dev receives handoff with reviewer findings
# ===========================================================================


class TestDevReceivesReviewerFindings:
    """AC3: When routing back to Dev, the reviewer's findings should be
    available in the session for Dev to address."""

    def test_reviewer_findings_preserved_after_rework(self, tmp_path):
        """After review → green rework transition, the Reviewer Assessment
        (including findings) should still be in the session file."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        content = session.read_text()
        # Reviewer Assessment should NOT be deleted during backward transition
        assert "## Reviewer Assessment" in content
        assert "REJECTED" in content
        assert "[EDGE] Missing null check" in content
        assert "[SEC] SQL injection risk" in content

    def test_phase_owner_is_dev_after_rework(self, tmp_path):
        """After rework transition, the phase should be green (owned by dev)."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        header = parse_session_header(session)
        assert header.get("phase") == "green"

    def test_workflow_state_shows_in_progress_for_dev(self, tmp_path):
        """After rework, workflow state should be IN_PROGRESS with dev as owner."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        status = detect_workflow_state(project)
        assert status.state.value == "IN_PROGRESS_STATE"
        assert status.phase == "green"


# ===========================================================================
# AC4: After Dev fixes, route back to verify → review
# ===========================================================================


class TestDevFixesToReview:
    """AC4: After Dev fixes issues and passes the dev_exit gate,
    the normal workflow resumes: green → verify → review."""

    def test_resolve_gate_green_routes_to_verify(self, tmp_path):
        """From green phase (during rework), resolve_gate should still route to verify."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        result = resolve_gate("143-10", "tdd", "green", project_root=project)

        assert result["status"] == "ready"
        assert result["next_phase"] == "verify"
        assert result["next_agent"] == "tea"

    def test_resolve_gate_verify_routes_to_review(self, tmp_path):
        """From verify phase (during rework), resolve_gate should route to review."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        result = resolve_gate("143-10", "tdd", "verify", project_root=project)

        assert result["status"] == "ready"
        assert result["next_phase"] == "review"
        assert result["next_agent"] == "reviewer"

    def test_full_rework_cycle_transitions(self, tmp_path):
        """Complete rework cycle: review → green → verify → review."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        # Step 1: review → green (rework)
        r1 = complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )
        assert r1["status"] == "success"

        # Add Dev rework assessment
        content = session.read_text()
        content += "\n\n## Dev Rework Assessment\n\n**Fixes Applied:** Yes\n"
        session.write_text(content)

        # Step 2: green → verify
        r2 = complete_phase(
            "143-10", "tdd", "green", "verify", "dev_exit",
            project_root=project,
        )
        assert r2["status"] == "success"

        # Add TEA verify assessment
        content = session.read_text()
        content += "\n\n## TEA Verify Rework Assessment\n\n**Status:** GREEN confirmed\n"
        session.write_text(content)

        # Step 3: verify → review
        r3 = complete_phase(
            "143-10", "tdd", "verify", "review", "quality_pass",
            project_root=project,
        )
        assert r3["status"] == "success"

        # Verify final state
        header = parse_session_header(session)
        assert header.get("phase") == "review"

    def test_full_rework_then_approval(self, tmp_path):
        """After rework cycle completes, Reviewer approves and finishes normally."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        session.write_text(_make_session(phase="review"))

        # Rework: review → green
        complete_phase(
            "143-10", "tdd", "review", "green", "approval_rework",
            project_root=project,
        )

        # Dev fixes, assessments added
        content = session.read_text()
        content += "\n\n## Dev Rework Assessment\n\n**Fixes Applied:** Yes\n"
        session.write_text(content)

        # green → verify
        complete_phase(
            "143-10", "tdd", "green", "verify", "dev_exit",
            project_root=project,
        )

        content = session.read_text()
        content += "\n\n## TEA Verify Rework Assessment\n\n**Status:** GREEN confirmed\n"
        session.write_text(content)

        # verify → review
        complete_phase(
            "143-10", "tdd", "verify", "review", "quality_pass",
            project_root=project,
        )

        # Now Reviewer approves — must include Subagent Results and
        # Reviewer Assessment with all specialist tags for approval gate.
        content = session.read_text()
        content += textwrap.dedent("""\

            ## Subagent Results

            | Subagent | Received | Result |
            |----------|----------|--------|
            | reviewer-preflight | Yes | PASS |
            | reviewer-edge-hunter | Yes | PASS |
            | reviewer-silent-failure-hunter | Yes | PASS |
            | reviewer-test-analyzer | Yes | PASS |
            | reviewer-comment-analyzer | Yes | PASS |
            | reviewer-type-design | Yes | PASS |
            | reviewer-security | Yes | PASS |
            | reviewer-simplifier | Yes | PASS |

            All received: Yes

            ## Reviewer Assessment

            **Verdict:** APPROVED
            **Findings:** 0 blocking, 0 minor

            [EDGE] No edge cases found.
            [SILENT] No silent failures.
            [TEST] Tests adequate.
            [DOC] Docs adequate.
            [TYPE] Types correct.
            [SEC] No security issues.
            [SIMPLE] Code is simple enough.
        """)
        session.write_text(content)

        # review → finish
        r = complete_phase(
            "143-10", "tdd", "review", "finish", "approval",
            project_root=project,
        )
        assert r["status"] == "success"

        header = parse_session_header(session)
        assert header.get("phase") == "finish"

        status = detect_workflow_state(project)
        assert status.state.value == "FINISH_STATE"


# ===========================================================================
# AC5: TDD workflow recovery config supports the round-trip
# ===========================================================================


class TestTDDWorkflowRecoveryConfig:
    """AC5: The TDD workflow YAML should have a recovery block on the review
    phase gate that enables the Reviewer-Dev round-trip."""

    def test_tdd_yaml_review_gate_has_recovery(self, tmp_path):
        """The real tdd.yaml should have a recovery block on the review phase gate."""
        # Read the actual tdd.yaml from pennyfarthing-dist
        tdd_path = Path(__file__).parent.parent.parent.parent / "workflows" / "tdd.yaml"
        if not tdd_path.exists():
            pytest.skip("tdd.yaml not found at expected path")

        data = yaml.safe_load(tdd_path.read_text())
        phases = data["workflow"]["phases"]
        review_phase = next(p for p in phases if p["name"] == "review")
        gate = review_phase.get("gate", {})

        assert "recovery" in gate, (
            "The review phase gate in tdd.yaml must have a recovery block "
            "to support Reviewer-Dev round-trip"
        )

    def test_tdd_yaml_recovery_targets_green(self, tmp_path):
        """Recovery should target the green phase (Dev)."""
        tdd_path = Path(__file__).parent.parent.parent.parent / "workflows" / "tdd.yaml"
        if not tdd_path.exists():
            pytest.skip("tdd.yaml not found at expected path")

        data = yaml.safe_load(tdd_path.read_text())
        phases = data["workflow"]["phases"]
        review_phase = next(p for p in phases if p["name"] == "review")
        recovery = review_phase["gate"]["recovery"]

        # Find the reviewer-verdict recovery entry
        assert "reviewer-verdict" in recovery, (
            "Recovery should have a 'reviewer-verdict' entry for handling rejections"
        )
        verdict_recovery = recovery["reviewer-verdict"]
        assert verdict_recovery["action"] == "rework"
        assert verdict_recovery["target_phase"] == "green"

    def test_tdd_yaml_recovery_has_max_attempts(self, tmp_path):
        """Recovery should have a max_attempts limit to prevent infinite loops."""
        tdd_path = Path(__file__).parent.parent.parent.parent / "workflows" / "tdd.yaml"
        if not tdd_path.exists():
            pytest.skip("tdd.yaml not found at expected path")

        data = yaml.safe_load(tdd_path.read_text())
        phases = data["workflow"]["phases"]
        review_phase = next(p for p in phases if p["name"] == "review")
        recovery = review_phase["gate"]["recovery"]
        verdict_recovery = recovery["reviewer-verdict"]

        assert "max_attempts" in verdict_recovery
        assert isinstance(verdict_recovery["max_attempts"], int)
        assert verdict_recovery["max_attempts"] >= 1


# ===========================================================================
# Additional: resolve_gate recovery_config propagation
# ===========================================================================


class TestResolveGateRecoveryPropagation:
    """Verify resolve_gate propagates recovery config from workflow YAML."""

    def test_resolve_gate_returns_recovery_for_all_phases_with_recovery(self, tmp_path):
        """resolve_gate should return recovery_config for any phase that has it."""
        # Setup phase also has recovery (for context creation)
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        result = resolve_gate("143-10", "tdd", "review", project_root=project)

        assert result["status"] == "ready"
        recovery = result.get("recovery_config")
        assert recovery is not None
        assert "reviewer-verdict" in recovery

    def test_resolve_gate_recovery_config_matches_yaml(self, tmp_path):
        """The recovery_config returned by resolve_gate should match the YAML definition."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        result = resolve_gate("143-10", "tdd", "review", project_root=project)

        recovery = result.get("recovery_config", {})
        expected = TDD_WORKFLOW_WITH_RECOVERY["workflow"]["phases"][4]["gate"]["recovery"]
        assert recovery == expected

    def test_resolve_gate_no_recovery_for_phases_without_it(self, tmp_path):
        """Phases without recovery blocks should not have recovery_config."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)

        for phase in ("red", "green", "verify"):
            result = resolve_gate("143-10", "tdd", phase, project_root=project)
            assert result.get("recovery_config") is None, (
                f"Phase '{phase}' should not have recovery_config"
            )


# ===========================================================================
# Edge cases
# ===========================================================================


class TestRoundTripEdgeCases:
    """Edge cases for the round-trip mechanism."""

    def test_max_attempts_exceeded_blocks_rework(self, tmp_path):
        """When round-trip count exceeds max_attempts, the rework should be blocked."""
        project = _setup_project(tmp_path, TDD_WORKFLOW_WITH_RECOVERY)
        session = project / ".session" / "143-10-session.md"
        # Already at 3 round-trips (max_attempts is 3)
        session.write_text(_make_session(phase="review", round_trip_count=3))

        # Attempting a 4th rework should be blocked
        # The mechanism should prevent infinite loops
        from pf.handoff.gate_recovery import get_rework_recovery

        recovery_config = TDD_WORKFLOW_WITH_RECOVERY["workflow"]["phases"][4]["gate"]["recovery"]
        result = get_rework_recovery(
            recovery_config=recovery_config,
            round_trip_count=3,
        )
        assert result is not None
        assert result["status"] == "blocked"
        assert "max_attempts" in result.get("reason", "").lower() or result["status"] == "blocked"

    def test_rework_recovery_within_limit_returns_target(self, tmp_path):
        """When under max_attempts, rework recovery returns the target phase."""
        from pf.handoff.gate_recovery import get_rework_recovery

        recovery_config = TDD_WORKFLOW_WITH_RECOVERY["workflow"]["phases"][4]["gate"]["recovery"]
        result = get_rework_recovery(
            recovery_config=recovery_config,
            round_trip_count=0,
        )
        assert result is not None
        assert result["status"] == "rework"
        assert result["target_phase"] == "green"

    def test_rework_recovery_at_limit_boundary(self, tmp_path):
        """At exactly max_attempts, rework should be blocked."""
        from pf.handoff.gate_recovery import get_rework_recovery

        recovery_config = TDD_WORKFLOW_WITH_RECOVERY["workflow"]["phases"][4]["gate"]["recovery"]
        # max_attempts is 3, count is 3 → blocked
        result = get_rework_recovery(
            recovery_config=recovery_config,
            round_trip_count=3,
        )
        assert result["status"] == "blocked"

    def test_rework_recovery_one_below_limit(self, tmp_path):
        """One below max_attempts should still allow rework."""
        from pf.handoff.gate_recovery import get_rework_recovery

        recovery_config = TDD_WORKFLOW_WITH_RECOVERY["workflow"]["phases"][4]["gate"]["recovery"]
        # max_attempts is 3, count is 2 → allowed
        result = get_rework_recovery(
            recovery_config=recovery_config,
            round_trip_count=2,
        )
        assert result["status"] == "rework"
        assert result["target_phase"] == "green"

    def test_no_rework_config_returns_none(self, tmp_path):
        """Recovery config without 'rework' action returns None."""
        from pf.handoff.gate_recovery import get_rework_recovery

        # Context-creation style recovery (not rework)
        context_recovery = {
            "epic-context-validated": {
                "action": "create_context",
                "type": "epic",
                "max_attempts": 1,
            },
        }
        result = get_rework_recovery(
            recovery_config=context_recovery,
            round_trip_count=0,
        )
        assert result is None
