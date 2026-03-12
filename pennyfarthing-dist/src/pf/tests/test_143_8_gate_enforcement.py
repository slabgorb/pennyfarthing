"""Tests for 143-8: SM enforces gates between phases.

Tests the gate enforcement layer in the native subagent chain:
- Exit gate resolution and evaluation for completed phases
- Entry gate resolution and evaluation for next phases
- Gate-aware phase chaining (chain_next_phase_with_gates)
- Handoff document content validation against expected structure
- Result object pattern (never throws)

Story: 143-8
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """Create a minimal project with workflow and gate definitions."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Workflow definition (TDD)
    workflows_dir = pf_dir / "workflows"
    workflows_dir.mkdir()
    (workflows_dir / "tdd.yaml").write_text(
        yaml.dump(
            {
                "workflow": {
                    "name": "tdd",
                    "phases": [
                        {
                            "name": "setup",
                            "agent": "sm",
                            "gate": {
                                "file": "gates/sm-setup-exit",
                                "type": "sm_setup_exit",
                            },
                        },
                        {
                            "name": "red",
                            "agent": "tea",
                            "entry_gate": {
                                "file": "gates/tea-context",
                                "type": "tea_context",
                            },
                            "gate": {
                                "file": "gates/tests-fail",
                                "type": "tests_fail",
                            },
                        },
                        {
                            "name": "green",
                            "agent": "dev",
                            "gate": {
                                "file": "gates/dev-exit",
                                "type": "dev_exit",
                            },
                        },
                        {
                            "name": "verify",
                            "agent": "tea",
                            "gate": {
                                "file": "gates/quality-pass",
                                "type": "quality_pass",
                            },
                        },
                        {
                            "name": "review",
                            "agent": "reviewer",
                            "entry_gate": {
                                "file": "gates/status-sync",
                                "type": "status_sync",
                            },
                            "gate": {
                                "file": "gates/approval",
                                "type": "approval",
                            },
                        },
                        {"name": "finish", "agent": "sm"},
                    ],
                }
            }
        )
    )

    # Workflow without gates (trivial-like)
    (workflows_dir / "no-gates.yaml").write_text(
        yaml.dump(
            {
                "workflow": {
                    "name": "no-gates",
                    "phases": [
                        {"name": "setup", "agent": "sm"},
                        {"name": "implement", "agent": "dev"},
                        {"name": "finish", "agent": "sm"},
                    ],
                }
            }
        )
    )

    # Workflow with manual gate
    (workflows_dir / "manual-gate.yaml").write_text(
        yaml.dump(
            {
                "workflow": {
                    "name": "manual-gate",
                    "phases": [
                        {"name": "setup", "agent": "sm"},
                        {
                            "name": "work",
                            "agent": "dev",
                            "gate": {
                                "file": "gates/approval",
                                "type": "manual",
                            },
                        },
                        {"name": "finish", "agent": "sm"},
                    ],
                }
            }
        )
    )

    # Gate files
    gates_dir = pf_dir / "gates"
    gates_dir.mkdir()
    (gates_dir / "tests-fail.md").write_text(
        '<gate name="tests-fail" model="haiku">\n'
        "<purpose>Verify tests are RED</purpose>\n"
        "<pass>All tests fail as expected</pass>\n"
        "<fail>Tests are not in RED state</fail>\n"
        "</gate>\n"
    )
    (gates_dir / "dev-exit.md").write_text(
        '<gate name="dev-exit" model="haiku">\n'
        "<purpose>Verify implementation complete</purpose>\n"
        "<pass>Tests green, tree clean</pass>\n"
        "<fail>Tests failing or tree dirty</fail>\n"
        "</gate>\n"
    )
    (gates_dir / "tea-context.md").write_text(
        '<gate name="tea-context" model="haiku">\n'
        "<purpose>Verify story context exists</purpose>\n"
        "<pass>Context validated</pass>\n"
        "<fail>Context missing or invalid</fail>\n"
        "</gate>\n"
    )
    (gates_dir / "quality-pass.md").write_text(
        '<gate name="quality-pass" model="haiku">\n'
        "<purpose>Verify quality checks pass</purpose>\n"
        "<pass>Lint, typecheck, tests pass</pass>\n"
        "<fail>Quality checks failing</fail>\n"
        "</gate>\n"
    )
    (gates_dir / "sm-setup-exit.md").write_text(
        '<gate name="sm-setup-exit" model="haiku">\n'
        "<purpose>Session file and context created</purpose>\n"
        "<pass>Setup complete</pass>\n"
        "<fail>Session or context missing</fail>\n"
        "</gate>\n"
    )
    (gates_dir / "status-sync.md").write_text(
        '<gate name="status-sync" model="haiku">\n'
        "<purpose>Story status matches</purpose>\n"
        "<pass>YAML and Jira in sync</pass>\n"
        "<fail>Status mismatch</fail>\n"
        "</gate>\n"
    )
    (gates_dir / "approval.md").write_text(
        '<gate name="approval" model="haiku">\n'
        "<purpose>Code review approved</purpose>\n"
        "<pass>Reviewer approved</pass>\n"
        "<fail>Not yet approved</fail>\n"
        "</gate>\n"
    )

    # repos.yaml (for gate extensions)
    (pf_dir / "repos.yaml").write_text(
        yaml.dump(
            {
                "repos": {
                    "orchestrator": {
                        "path": ".",
                        "type": "orchestrator",
                    }
                }
            }
        )
    )

    # Native agents
    agents_dir = pf_dir / "agents"
    agents_dir.mkdir()
    native_dir = agents_dir / "native"
    native_dir.mkdir()
    for agent_name in ["dev", "tea", "reviewer", "sm"]:
        (native_dir / f"{agent_name}.md").write_text(
            f"---\nname: {agent_name}\nmodel: opus\n"
            f"allowed-tools:\n  - Read\n  - Bash\n---\n"
            f"# {agent_name.upper()} Agent\n"
        )

    # Session
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "143-8-session.md").write_text(
        "# Session: 143-8\n\n"
        "**Story:** 143-8\n"
        "**Workflow:** tdd\n"
        "**Phase:** red\n"
        "**Repos:** orchestrator\n"
    )

    # Sprint
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(
        yaml.dump(
            {
                "sprint": {"number": 2610, "goal": "Test"},
                "epics": [],
                "stories": [],
            }
        )
    )

    return tmp_path


@pytest.fixture
def valid_handoff_doc(project_root: Path) -> Path:
    """Create a valid handoff document with required sections."""
    handoff = project_root / ".session" / "143-8-handoff-red.md"
    handoff.write_text(
        "# Handoff: red -> green\n"
        "**Story:** 143-8  |  **Agent:** tea  |  "
        "**Timestamp:** 2026-03-12T10:00:00Z\n"
        "**Workflow:** tdd\n"
        "\n"
        "## Summary\n"
        "Wrote 8 failing tests for gate enforcement.\n"
        "\n"
        "## Deliverables\n"
        "- `tests/test_143_8_gate_enforcement.py`: 8 failing tests\n"
        "\n"
        "## Test Status\n"
        "- Passing: 0\n"
        "- Failing: 8\n"
    )
    return handoff


@pytest.fixture
def empty_handoff_doc(project_root: Path) -> Path:
    """Create an empty handoff document."""
    handoff = project_root / ".session" / "143-8-handoff-empty.md"
    handoff.write_text("")
    return handoff


@pytest.fixture
def minimal_handoff_doc(project_root: Path) -> Path:
    """Create a handoff doc missing required sections."""
    handoff = project_root / ".session" / "143-8-handoff-minimal.md"
    handoff.write_text(
        "# Handoff: red -> green\n"
        "Some text but no Summary or Deliverables section.\n"
    )
    return handoff


@pytest.fixture
def gate_pass_result() -> dict:
    """A GATE_RESULT indicating pass."""
    return {
        "status": "pass",
        "message": "All checks passed",
        "checks": [
            {
                "name": "tests-failing",
                "status": "pass",
                "detail": "5 tests failing as expected",
            }
        ],
    }


@pytest.fixture
def gate_fail_result() -> dict:
    """A GATE_RESULT indicating failure."""
    return {
        "status": "fail",
        "message": "Tests are not in RED state",
        "checks": [
            {
                "name": "tests-failing",
                "status": "fail",
                "detail": "All tests passing — no RED state",
            }
        ],
    }


@pytest.fixture
def gate_fail_with_recovery() -> dict:
    """A GATE_RESULT indicating failure with recovery actions."""
    return {
        "status": "fail",
        "message": "Context not found",
        "checks": [
            {
                "name": "story-context",
                "status": "fail",
                "detail": "Story context file not found",
            }
        ],
        "recovery": ["Create story context via pf context create"],
    }


# =============================================================================
# AC1: SM resolves exit gate configuration for completed phase
# =============================================================================


class TestResolveExitGate:
    """Test exit gate resolution from workflow YAML for subagent chain."""

    def test_phase_with_exit_gate_returns_config(
        self, project_root: Path
    ) -> None:
        """Phase with exit gate returns gate file, type, and model."""
        from pf.subagent.gate import resolve_exit_gate

        result = resolve_exit_gate(
            workflow="tdd",
            phase="red",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["gate_file"] == "gates/tests-fail"
        assert result["data"]["gate_type"] == "tests_fail"
        assert result["data"]["model"] == "haiku"
        assert result["data"]["content"] is not None

    def test_phase_without_exit_gate_returns_skip(
        self, project_root: Path
    ) -> None:
        """Phase without exit gate returns skip (no enforcement needed)."""
        from pf.subagent.gate import resolve_exit_gate

        result = resolve_exit_gate(
            workflow="tdd",
            phase="finish",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["skip"] is True

    def test_workflow_without_gates_returns_skip(
        self, project_root: Path
    ) -> None:
        """All phases in gateless workflow return skip."""
        from pf.subagent.gate import resolve_exit_gate

        result = resolve_exit_gate(
            workflow="no-gates",
            phase="implement",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["skip"] is True

    def test_manual_gate_returns_skip(self, project_root: Path) -> None:
        """Manual gates are skipped (not enforced programmatically)."""
        from pf.subagent.gate import resolve_exit_gate

        result = resolve_exit_gate(
            workflow="manual-gate",
            phase="work",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["skip"] is True

    def test_unknown_phase_returns_error(self, project_root: Path) -> None:
        """Unknown phase name returns error result, not exception."""
        from pf.subagent.gate import resolve_exit_gate

        result = resolve_exit_gate(
            workflow="tdd",
            phase="nonexistent",
            project_root=project_root,
        )

        assert result["success"] is False
        assert "nonexistent" in result["error"]

    def test_unknown_workflow_returns_error(self, project_root: Path) -> None:
        """Unknown workflow returns error result, not exception."""
        from pf.subagent.gate import resolve_exit_gate

        result = resolve_exit_gate(
            workflow="nonexistent",
            phase="red",
            project_root=project_root,
        )

        assert result["success"] is False
        assert "nonexistent" in result["error"]

    def test_missing_gate_file_returns_error(
        self, project_root: Path
    ) -> None:
        """Gate referenced in workflow but file missing → error."""
        # Remove the gate file
        gate_path = project_root / ".pennyfarthing" / "gates" / "tests-fail.md"
        gate_path.unlink()

        from pf.subagent.gate import resolve_exit_gate

        result = resolve_exit_gate(
            workflow="tdd",
            phase="red",
            project_root=project_root,
        )

        assert result["success"] is False
        assert "not found" in result["error"].lower() or "missing" in result["error"].lower()


# =============================================================================
# AC2: SM resolves entry gate for next phase
# =============================================================================


class TestResolveEntryGate:
    """Test entry gate resolution for the target phase."""

    def test_phase_with_entry_gate_returns_config(
        self, project_root: Path
    ) -> None:
        """Phase with entry_gate returns gate config."""
        from pf.subagent.gate import resolve_entry_gate

        result = resolve_entry_gate(
            workflow="tdd",
            phase="red",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["gate_file"] == "gates/tea-context"
        assert result["data"]["gate_type"] == "tea_context"

    def test_phase_without_entry_gate_returns_skip(
        self, project_root: Path
    ) -> None:
        """Phase without entry_gate returns skip."""
        from pf.subagent.gate import resolve_entry_gate

        result = resolve_entry_gate(
            workflow="tdd",
            phase="green",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["skip"] is True

    def test_unknown_phase_returns_error(self, project_root: Path) -> None:
        """Unknown phase returns error."""
        from pf.subagent.gate import resolve_entry_gate

        result = resolve_entry_gate(
            workflow="tdd",
            phase="nonexistent",
            project_root=project_root,
        )

        assert result["success"] is False


# =============================================================================
# AC3: Gate evaluation interprets GATE_RESULT correctly
# =============================================================================


class TestInterpretGateResult:
    """Test interpretation of gate subagent results."""

    def test_pass_result_returns_success(
        self, gate_pass_result: dict
    ) -> None:
        """GATE_RESULT with status=pass → success."""
        from pf.subagent.gate import interpret_gate_result

        result = interpret_gate_result(gate_pass_result)

        assert result["success"] is True
        assert result["data"]["passed"] is True

    def test_fail_result_returns_failure(
        self, gate_fail_result: dict
    ) -> None:
        """GATE_RESULT with status=fail → failure with message."""
        from pf.subagent.gate import interpret_gate_result

        result = interpret_gate_result(gate_fail_result)

        assert result["success"] is True  # Interpretation succeeded
        assert result["data"]["passed"] is False
        assert "RED" in result["data"]["message"] or "not" in result["data"]["message"].lower()

    def test_fail_with_recovery_includes_actions(
        self, gate_fail_with_recovery: dict
    ) -> None:
        """Failed gate with recovery actions includes them in result."""
        from pf.subagent.gate import interpret_gate_result

        result = interpret_gate_result(gate_fail_with_recovery)

        assert result["success"] is True
        assert result["data"]["passed"] is False
        assert result["data"]["recovery"] is not None
        assert len(result["data"]["recovery"]) > 0

    def test_empty_result_returns_fail(self) -> None:
        """Empty/None gate result → default-deny (fail)."""
        from pf.subagent.gate import interpret_gate_result

        result = interpret_gate_result({})

        assert result["success"] is True
        assert result["data"]["passed"] is False

    def test_malformed_result_returns_fail(self) -> None:
        """Malformed gate result (no status field) → fail."""
        from pf.subagent.gate import interpret_gate_result

        result = interpret_gate_result({"message": "oops", "checks": []})

        assert result["success"] is True
        assert result["data"]["passed"] is False

    def test_checks_are_preserved(self, gate_pass_result: dict) -> None:
        """Individual check details are preserved in result."""
        from pf.subagent.gate import interpret_gate_result

        result = interpret_gate_result(gate_pass_result)

        assert len(result["data"]["checks"]) == 1
        assert result["data"]["checks"][0]["name"] == "tests-failing"


# =============================================================================
# AC4: Gate enforcement blocks chain on failure
# =============================================================================


class TestEnforceGate:
    """Test that enforce_gate composes resolution + evaluation."""

    def test_enforce_gate_with_pass_returns_success(
        self, project_root: Path, gate_pass_result: dict
    ) -> None:
        """Exit gate passes → enforce_gate returns success."""
        from pf.subagent.gate import enforce_gate

        result = enforce_gate(
            workflow="tdd",
            phase="red",
            gate_result=gate_pass_result,
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["passed"] is True
        assert result["data"]["gate_type"] == "tests_fail"

    def test_enforce_gate_with_fail_returns_blocked(
        self, project_root: Path, gate_fail_result: dict
    ) -> None:
        """Exit gate fails → enforce_gate returns blocked."""
        from pf.subagent.gate import enforce_gate

        result = enforce_gate(
            workflow="tdd",
            phase="red",
            gate_result=gate_fail_result,
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["passed"] is False
        assert result["data"]["gate_type"] == "tests_fail"

    def test_enforce_gate_skip_returns_pass(
        self, project_root: Path
    ) -> None:
        """Phase with no gate → enforce_gate auto-passes (no gate_result needed)."""
        from pf.subagent.gate import enforce_gate

        result = enforce_gate(
            workflow="tdd",
            phase="finish",
            gate_result=None,
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["passed"] is True
        assert result["data"]["skipped"] is True

    def test_enforce_gate_resolution_error_propagates(
        self, project_root: Path
    ) -> None:
        """Gate resolution error (bad workflow) propagates as error result."""
        from pf.subagent.gate import enforce_gate

        result = enforce_gate(
            workflow="nonexistent",
            phase="red",
            gate_result=None,
            project_root=project_root,
        )

        assert result["success"] is False


# =============================================================================
# AC5: Handoff document content validation
# =============================================================================


class TestValidateHandoffContent:
    """Test handoff document structure validation (beyond existence check)."""

    def test_valid_handoff_has_required_sections(
        self, valid_handoff_doc: Path
    ) -> None:
        """Valid handoff doc with Summary and Deliverables passes."""
        from pf.subagent.gate import validate_handoff_content

        result = validate_handoff_content(valid_handoff_doc)

        assert result["success"] is True

    def test_empty_handoff_fails(self, empty_handoff_doc: Path) -> None:
        """Empty handoff document fails validation."""
        from pf.subagent.gate import validate_handoff_content

        result = validate_handoff_content(empty_handoff_doc)

        assert result["success"] is False
        assert "empty" in result["error"].lower()

    def test_missing_summary_section_fails(
        self, minimal_handoff_doc: Path
    ) -> None:
        """Handoff doc without Summary section fails."""
        from pf.subagent.gate import validate_handoff_content

        result = validate_handoff_content(minimal_handoff_doc)

        assert result["success"] is False
        assert "summary" in result["error"].lower()

    def test_nonexistent_file_fails(self, project_root: Path) -> None:
        """Nonexistent handoff file fails validation."""
        from pf.subagent.gate import validate_handoff_content

        result = validate_handoff_content(
            project_root / ".session" / "nonexistent.md"
        )

        assert result["success"] is False

    def test_valid_handoff_returns_parsed_metadata(
        self, valid_handoff_doc: Path
    ) -> None:
        """Valid handoff returns parsed metadata (story, agent, workflow)."""
        from pf.subagent.gate import validate_handoff_content

        result = validate_handoff_content(valid_handoff_doc)

        assert result["success"] is True
        assert result["data"]["agent"] == "tea"
        assert result["data"]["story"] == "143-8"
        assert result["data"]["workflow"] == "tdd"


# =============================================================================
# AC6: Gate-aware chain composes gates into phase transition
# =============================================================================


class TestChainWithGates:
    """Test chain_next_phase_with_gates — the gate-aware chain function."""

    def test_chain_with_gate_pass_returns_spawn_config(
        self,
        project_root: Path,
        valid_handoff_doc: Path,
        gate_pass_result: dict,
    ) -> None:
        """Gate passes → chain returns spawn config for next agent."""
        from pf.subagent.gate import chain_next_phase_with_gates

        subagent_result = {
            "status": "success",
            "handoff_path": str(
                valid_handoff_doc.relative_to(project_root)
            ),
        }

        result = chain_next_phase_with_gates(
            subagent_result=subagent_result,
            story_id="143-8",
            workflow="tdd",
            current_phase="red",
            task_description="Make the tests pass",
            project_root=project_root,
            exit_gate_result=gate_pass_result,
        )

        assert result["success"] is True
        assert result["data"]["next_phase"] == "green"
        assert result["data"]["next_agent"] == "dev"
        assert result["data"]["spawn_config"] is not None
        assert result["data"]["workflow_complete"] is False

    def test_chain_with_gate_fail_blocks_transition(
        self,
        project_root: Path,
        valid_handoff_doc: Path,
        gate_fail_result: dict,
    ) -> None:
        """Gate fails → chain returns error, no spawn config."""
        from pf.subagent.gate import chain_next_phase_with_gates

        subagent_result = {
            "status": "success",
            "handoff_path": str(
                valid_handoff_doc.relative_to(project_root)
            ),
        }

        result = chain_next_phase_with_gates(
            subagent_result=subagent_result,
            story_id="143-8",
            workflow="tdd",
            current_phase="red",
            task_description="Make the tests pass",
            project_root=project_root,
            exit_gate_result=gate_fail_result,
        )

        assert result["success"] is False
        assert "gate" in result["error"].lower() or "fail" in result["error"].lower()

    def test_chain_without_gate_proceeds(
        self, project_root: Path, valid_handoff_doc: Path
    ) -> None:
        """Phase with no gate → chain proceeds without gate_result."""
        from pf.subagent.gate import chain_next_phase_with_gates

        subagent_result = {
            "status": "success",
            "handoff_path": str(
                valid_handoff_doc.relative_to(project_root)
            ),
        }

        result = chain_next_phase_with_gates(
            subagent_result=subagent_result,
            story_id="143-8",
            workflow="no-gates",
            current_phase="implement",
            task_description="Finish up",
            project_root=project_root,
            exit_gate_result=None,
        )

        assert result["success"] is True
        assert result["data"]["next_phase"] == "finish"

    def test_chain_with_invalid_handoff_content_fails(
        self,
        project_root: Path,
        minimal_handoff_doc: Path,
        gate_pass_result: dict,
    ) -> None:
        """Handoff doc with missing sections → chain fails before gate."""
        from pf.subagent.gate import chain_next_phase_with_gates

        subagent_result = {
            "status": "success",
            "handoff_path": str(
                minimal_handoff_doc.relative_to(project_root)
            ),
        }

        result = chain_next_phase_with_gates(
            subagent_result=subagent_result,
            story_id="143-8",
            workflow="tdd",
            current_phase="red",
            task_description="Make the tests pass",
            project_root=project_root,
            exit_gate_result=gate_pass_result,
        )

        assert result["success"] is False
        assert "summary" in result["error"].lower() or "handoff" in result["error"].lower()

    def test_chain_last_phase_returns_workflow_complete(
        self,
        project_root: Path,
        valid_handoff_doc: Path,
    ) -> None:
        """Last phase → workflow_complete=True, no spawn config."""
        from pf.subagent.gate import chain_next_phase_with_gates

        subagent_result = {
            "status": "success",
            "handoff_path": str(
                valid_handoff_doc.relative_to(project_root)
            ),
        }

        result = chain_next_phase_with_gates(
            subagent_result=subagent_result,
            story_id="143-8",
            workflow="no-gates",
            current_phase="finish",
            task_description="Done",
            project_root=project_root,
            exit_gate_result=None,
        )

        assert result["success"] is True
        assert result["data"]["workflow_complete"] is True
        assert result["data"]["spawn_config"] is None


# =============================================================================
# AC7: Build gate evaluation config for subagent spawning
# =============================================================================


class TestBuildGateEvalConfig:
    """Test building a gate evaluation config for SM to spawn a gate subagent."""

    def test_build_config_includes_gate_content(
        self, project_root: Path
    ) -> None:
        """Gate eval config includes full gate file content as prompt."""
        from pf.subagent.gate import build_gate_eval_config

        result = build_gate_eval_config(
            workflow="tdd",
            phase="red",
            story_id="143-8",
            project_root=project_root,
        )

        assert result["success"] is True
        assert "tests-fail" in result["data"]["prompt"].lower() or "RED" in result["data"]["prompt"]
        assert result["data"]["model"] == "haiku"

    def test_build_config_for_phase_without_gate_returns_skip(
        self, project_root: Path
    ) -> None:
        """Phase without gate → skip (no eval needed)."""
        from pf.subagent.gate import build_gate_eval_config

        result = build_gate_eval_config(
            workflow="tdd",
            phase="finish",
            story_id="143-8",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["skip"] is True

    def test_build_config_includes_story_context(
        self, project_root: Path
    ) -> None:
        """Gate eval prompt includes story ID for context."""
        from pf.subagent.gate import build_gate_eval_config

        result = build_gate_eval_config(
            workflow="tdd",
            phase="green",
            story_id="143-8",
            project_root=project_root,
        )

        assert result["success"] is True
        assert "143-8" in result["data"]["prompt"]

    def test_build_entry_gate_config(self, project_root: Path) -> None:
        """Can build eval config for an entry gate."""
        from pf.subagent.gate import build_gate_eval_config

        result = build_gate_eval_config(
            workflow="tdd",
            phase="red",
            story_id="143-8",
            project_root=project_root,
            gate_position="entry",
        )

        assert result["success"] is True
        assert "tea-context" in result["data"]["prompt"].lower() or "context" in result["data"]["prompt"].lower()


# =============================================================================
# Integration: Full gate-aware chain flow
# =============================================================================


class TestGateChainIntegration:
    """Integration tests for the full gate-aware phase chain."""

    def test_full_red_to_green_with_gate_pass(
        self,
        project_root: Path,
        valid_handoff_doc: Path,
        gate_pass_result: dict,
    ) -> None:
        """Full flow: TEA completes red → gate passes → Dev spawned for green."""
        from pf.subagent.gate import chain_next_phase_with_gates

        result = chain_next_phase_with_gates(
            subagent_result={
                "status": "success",
                "handoff_path": str(
                    valid_handoff_doc.relative_to(project_root)
                ),
            },
            story_id="143-8",
            workflow="tdd",
            current_phase="red",
            task_description="Implement gate enforcement",
            project_root=project_root,
            exit_gate_result=gate_pass_result,
        )

        assert result["success"] is True
        data = result["data"]
        assert data["next_phase"] == "green"
        assert data["next_agent"] == "dev"
        assert data["spawn_config"]["agent_name"] == "dev"
        assert data["spawn_config"]["model"] == "opus"
        assert "prompt" in data["spawn_config"]
        assert len(data["spawn_config"]["prompt"]) > 0

    def test_gate_fail_preserves_context_for_retry(
        self,
        project_root: Path,
        valid_handoff_doc: Path,
        gate_fail_result: dict,
    ) -> None:
        """Gate failure preserves phase/agent info for SM to handle retry."""
        from pf.subagent.gate import chain_next_phase_with_gates

        result = chain_next_phase_with_gates(
            subagent_result={
                "status": "success",
                "handoff_path": str(
                    valid_handoff_doc.relative_to(project_root)
                ),
            },
            story_id="143-8",
            workflow="tdd",
            current_phase="red",
            task_description="Implement gate enforcement",
            project_root=project_root,
            exit_gate_result=gate_fail_result,
        )

        assert result["success"] is False
        # Error should include enough context for SM to know what failed
        assert "gate" in result["error"].lower() or "tests" in result["error"].lower()

    def test_never_throws_on_any_input(self, project_root: Path) -> None:
        """chain_next_phase_with_gates never raises, always returns result."""
        from pf.subagent.gate import chain_next_phase_with_gates

        # Completely bogus input — should still return result, not throw
        result = chain_next_phase_with_gates(
            subagent_result=None,  # type: ignore[arg-type]
            story_id="",
            workflow="",
            current_phase="",
            task_description="",
            project_root=project_root,
            exit_gate_result=None,
        )

        assert isinstance(result, dict)
        assert "success" in result
