"""Tests for gate.file field in resolve_gate — Story 106-3.

Epic: 106 (Gate Files & First Migration)
Story: 106-3 — Workflow YAML gate.file integration

Tests the gate.file field support in resolve_gate():
- Schema extension: gate.file extracted from workflow YAML
- Backward compatibility: gate.type-only workflows unchanged
- TDD workflow migration: all phases now have gate.file fields

Acceptance Criteria:
- [AC1] resolve-gate.py reads gate.file field from workflow YAML phases
- [AC1] gate.file takes precedence over gate.type when both present
- [AC1] Returns gate_file: null when only gate.type exists
- [AC2] Workflows with only gate.type continue to work unchanged
- [AC2] Existing gate type logic remains functional
- [AC2] No breaking changes to resolve-gate API
- [AC3] Green phase in tdd.yaml has file: gates/dev-exit and type: dev_exit
- [AC3] All phases have gate.file fields (full migration complete)
- [AC3] File paths are relative (not absolute)
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
import yaml

from pf.handoff.resolve_gate import resolve_gate

# ---------------------------------------------------------------------------
# Fixtures: Workflow YAML data with gate.file support
# ---------------------------------------------------------------------------

WORKFLOW_WITH_FILE_AND_TYPE = {
    "workflow": {
        "name": "tdd",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
            {
                "name": "green",
                "agent": "dev",
                "gate": {
                    "file": "gates/tests-pass",
                    "type": "tests_pass",
                    "condition": "All tests passing, no skipped tests",
                },
            },
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

WORKFLOW_WITH_FILE_ONLY = {
    "workflow": {
        "name": "file-only",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {
                "name": "green",
                "agent": "dev",
                "gate": {
                    "file": "gates/tests-pass",
                    "condition": "All tests passing",
                },
            },
            {"name": "finish", "agent": "sm"},
        ],
    }
}

WORKFLOW_WITH_TYPE_ONLY = {
    "workflow": {
        "name": "legacy",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {
                "name": "green",
                "agent": "dev",
                "gate": {"type": "tests_pass"},
            },
            {"name": "finish", "agent": "sm"},
        ],
    }
}

SESSION_WITH_ASSESSMENT = textwrap.dedent("""\
    # Story 106-3: Workflow YAML gate.file integration

    **Story ID:** 106-3
    **Workflow:** tdd
    **Phase:** green
    **Phase Started:** 2026-02-15T10:00:00Z

    ## TEA Assessment

    **Tests Written:** 5 tests
    **Status:** RED confirmed

    ## Workflow Tracking

    **Phase:** green
    **Phase Started:** 2026-02-15T10:00:00Z

    ### Phase History
    | Phase | Started | Ended | Duration |
    |-------|---------|-------|----------|
    | green | 2026-02-15T10:00:00Z | - | - |

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
        ("tdd", WORKFLOW_WITH_FILE_AND_TYPE),
        ("file-only", WORKFLOW_WITH_FILE_ONLY),
        ("legacy", WORKFLOW_WITH_TYPE_ONLY),
    ]:
        (workflows_dir / f"{name}.yaml").write_text(
            yaml.dump(data, default_flow_style=False)
        )

    (tmp_path / ".session").mkdir()
    session_file = tmp_path / ".session" / "106-3-session.md"
    session_file.write_text(SESSION_WITH_ASSESSMENT)
    return tmp_path


# ===========================================================================
# AC1: Schema Extension — gate.file extracted from workflow YAML
# ===========================================================================


class TestResolveGateFilePresent:
    """AC1: resolve_gate returns gate_file when gate.file is in workflow YAML."""

    def test_gate_file_populated_when_file_in_yaml(
        self, project: Path
    ) -> None:
        """AC1: gate_file should be 'gates/tests-pass' when file field exists."""
        result = resolve_gate("106-3", "tdd", "green", project_root=project)
        assert result["gate_file"] == "gates/tests-pass"

    def test_gate_type_still_populated_with_file(
        self, project: Path
    ) -> None:
        """AC1: gate_type should still be 'tests_pass' when both file and type exist."""
        result = resolve_gate("106-3", "tdd", "green", project_root=project)
        assert result["gate_type"] == "tests_pass"

    def test_both_fields_present_in_result(
        self, project: Path
    ) -> None:
        """AC1: Both gate_file and gate_type should be non-None when both are in YAML."""
        result = resolve_gate("106-3", "tdd", "green", project_root=project)
        assert result["gate_file"] is not None
        assert result["gate_type"] is not None

    def test_status_still_ready_with_file(
        self, project: Path
    ) -> None:
        """AC1: Status should still be 'ready' when assessment exists and gate.file is present."""
        result = resolve_gate("106-3", "tdd", "green", project_root=project)
        assert result["status"] == "ready"


class TestResolveGateFileOnly:
    """AC1: resolve_gate handles gate with file but no type."""

    def test_gate_file_populated_without_type(
        self, project: Path
    ) -> None:
        """AC1: gate_file should be populated when only file exists (no type)."""
        result = resolve_gate(
            "106-3", "file-only", "green", project_root=project
        )
        assert result["gate_file"] == "gates/tests-pass"

    def test_gate_type_null_when_only_file(
        self, project: Path
    ) -> None:
        """AC1: gate_type should be None when only file is in gate."""
        result = resolve_gate(
            "106-3", "file-only", "green", project_root=project
        )
        assert result["gate_type"] is None

    def test_status_ready_when_no_type_and_file_only(
        self, project: Path
    ) -> None:
        """AC1: gate with file-only and no type → status is 'ready'.

        File-only gates (no type) are resolvable — the gate runner uses
        gate_file to locate and execute the gate. Status is 'ready' when
        an assessment exists.
        """
        result = resolve_gate(
            "106-3", "file-only", "green", project_root=project
        )
        assert result["status"] == "ready"


# ===========================================================================
# AC1: gate_file null when only gate.type exists
# ===========================================================================


class TestResolveGateTypeOnlyReturnsNullFile:
    """AC1: gate_file is None when workflow only has gate.type."""

    def test_gate_file_null_for_type_only(
        self, project: Path
    ) -> None:
        """AC1: gate_file should be None when only gate.type exists."""
        result = resolve_gate(
            "106-3", "legacy", "green", project_root=project
        )
        assert result["gate_file"] is None

    def test_gate_type_populated_for_type_only(
        self, project: Path
    ) -> None:
        """AC1: gate_type should be 'tests_pass' for type-only gate."""
        result = resolve_gate(
            "106-3", "legacy", "green", project_root=project
        )
        assert result["gate_type"] == "tests_pass"


# ===========================================================================
# AC2: Backward Compatibility
# ===========================================================================


class TestResolveGateBackwardCompat:
    """AC2: Workflows with only gate.type continue to work unchanged."""

    def test_legacy_workflow_status_ready(
        self, project: Path
    ) -> None:
        """AC2: Legacy type-only workflow should return 'ready' with assessment."""
        result = resolve_gate(
            "106-3", "legacy", "green", project_root=project
        )
        assert result["status"] == "ready"

    def test_legacy_workflow_next_agent(
        self, project: Path
    ) -> None:
        """AC2: Legacy workflow should still resolve next_agent correctly."""
        result = resolve_gate(
            "106-3", "legacy", "green", project_root=project
        )
        assert result["next_agent"] == "sm"

    def test_legacy_workflow_next_phase(
        self, project: Path
    ) -> None:
        """AC2: Legacy workflow should still resolve next_phase correctly."""
        result = resolve_gate(
            "106-3", "legacy", "green", project_root=project
        )
        assert result["next_phase"] == "finish"

    def test_resolve_result_contract_unchanged(
        self, project: Path
    ) -> None:
        """AC2: RESOLVE_RESULT still has all 7 required fields."""
        result = resolve_gate(
            "106-3", "legacy", "green", project_root=project
        )
        required_fields = [
            "status",
            "gate_type",
            "gate_file",
            "next_agent",
            "next_phase",
            "assessment_found",
            "error",
        ]
        for field in required_fields:
            assert field in result, f"Missing field: {field}"

    def test_red_phase_type_only_unaffected(
        self, project: Path
    ) -> None:
        """AC2: TDD red phase (type-only, no file) still works correctly."""
        result = resolve_gate("106-3", "tdd", "red", project_root=project)
        assert result["gate_type"] == "tests_fail"
        assert result["gate_file"] is None


# ===========================================================================
# AC3: TDD Workflow Migration — verify actual tdd.yaml
# ===========================================================================


class TestTddWorkflowMigration:
    """AC3: TDD workflow phases have gate.file fields after full migration.

    These tests read the ACTUAL tdd.yaml from the project to verify
    the migration has been applied.
    """

    @pytest.fixture
    def tdd_yaml(self) -> dict:
        """Load the actual tdd.yaml from pennyfarthing-dist."""
        tdd_path = (
            Path(__file__).resolve().parents[3]
            / "workflows"
            / "tdd.yaml"
        )
        assert tdd_path.exists(), f"tdd.yaml not found at {tdd_path}"
        return yaml.safe_load(tdd_path.read_text())

    def _get_phase(self, tdd_yaml: dict, name: str) -> dict:
        """Get a phase by name from the workflow."""
        for phase in tdd_yaml["workflow"]["phases"]:
            if phase["name"] == name:
                return phase
        raise ValueError(f"Phase '{name}' not found")

    def test_green_phase_has_gate_file(self, tdd_yaml: dict) -> None:
        """AC3: Green phase should have gate.file = 'gates/dev-exit'."""
        green = self._get_phase(tdd_yaml, "green")
        gate = green.get("gate", {})
        assert gate.get("file") == "gates/dev-exit", (
            f"Expected gate.file='gates/dev-exit', got gate={gate}"
        )

    def test_green_phase_has_dev_exit_type(self, tdd_yaml: dict) -> None:
        """AC3: Green phase should have gate.type = 'dev_exit'."""
        green = self._get_phase(tdd_yaml, "green")
        gate = green.get("gate", {})
        assert gate.get("type") == "dev_exit", (
            f"Expected gate.type='dev_exit', got gate={gate}"
        )

    def test_green_phase_file_is_relative(self, tdd_yaml: dict) -> None:
        """AC3: File path should be relative (gates/dev-exit), not absolute."""
        green = self._get_phase(tdd_yaml, "green")
        gate = green.get("gate", {})
        file_path = gate.get("file", "")
        assert not file_path.startswith("/"), (
            f"gate.file should be relative, got: {file_path}"
        )
        assert file_path == "gates/dev-exit", (
            f"Expected 'gates/dev-exit', got: {file_path}"
        )

    def test_red_phase_has_gate_file(self, tdd_yaml: dict) -> None:
        """AC3: Red phase should have gate.file = 'gates/tests-fail'."""
        red = self._get_phase(tdd_yaml, "red")
        gate = red.get("gate", {})
        assert gate.get("file") == "gates/tests-fail", (
            f"Expected gate.file='gates/tests-fail', got gate={gate}"
        )

    def test_review_phase_has_gate_file(self, tdd_yaml: dict) -> None:
        """AC3: Review phase should have gate.file = 'gates/approval'."""
        review = self._get_phase(tdd_yaml, "review")
        gate = review.get("gate", {})
        assert gate.get("file") == "gates/approval", (
            f"Expected gate.file='gates/approval', got gate={gate}"
        )

    def test_setup_phase_has_gate(self, tdd_yaml: dict) -> None:
        """AC3: Setup phase should have gate.file = 'gates/sm-setup-exit'."""
        setup = self._get_phase(tdd_yaml, "setup")
        gate = setup.get("gate", {})
        assert gate.get("file") == "gates/sm-setup-exit", (
            f"Expected gate.file='gates/sm-setup-exit', got gate={gate}"
        )

    def test_finish_phase_unchanged(self, tdd_yaml: dict) -> None:
        """AC3: Finish phase should remain gateless."""
        finish = self._get_phase(tdd_yaml, "finish")
        assert "gate" not in finish, (
            f"Finish phase should not have a gate, got: {finish}"
        )


# ===========================================================================
# AC3: Integration — resolve_gate against actual tdd.yaml
# ===========================================================================


class TestResolveGateWithRealTddYaml:
    """AC3: resolve_gate returns gate_file when run against actual tdd.yaml.

    These integration tests use the real workflow file (via the project root)
    to verify the end-to-end gate.file field extraction.
    """

    @pytest.fixture
    def real_project(self, tmp_path: Path) -> Path:
        """Create a project that uses the actual tdd.yaml from pennyfarthing-dist."""
        tdd_source = (
            Path(__file__).resolve().parents[3]
            / "workflows"
            / "tdd.yaml"
        )
        assert tdd_source.exists(), f"tdd.yaml not found at {tdd_source}"

        workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
        workflows_dir.mkdir(parents=True)
        (workflows_dir / "tdd.yaml").write_text(tdd_source.read_text())

        (tmp_path / ".session").mkdir()
        session_file = tmp_path / ".session" / "106-3-session.md"
        session_file.write_text(SESSION_WITH_ASSESSMENT)
        return tmp_path

    def test_green_phase_returns_gate_file(
        self, real_project: Path
    ) -> None:
        """AC3: resolve_gate for tdd/green should return gate_file='gates/dev-exit'."""
        result = resolve_gate(
            "106-3", "tdd", "green", project_root=real_project
        )
        assert result["gate_file"] == "gates/dev-exit", (
            f"Expected gate_file='gates/dev-exit', got: {result}"
        )

    def test_green_phase_returns_dev_exit_type(
        self, real_project: Path
    ) -> None:
        """AC3: resolve_gate for tdd/green should return gate_type='dev_exit'."""
        result = resolve_gate(
            "106-3", "tdd", "green", project_root=real_project
        )
        assert result["gate_type"] == "dev_exit", (
            f"Expected gate_type='dev_exit', got: {result}"
        )

    def test_red_phase_gate_file_is_tests_fail(
        self, real_project: Path
    ) -> None:
        """AC3: resolve_gate for tdd/red should have gate_file='gates/tests-fail'."""
        result = resolve_gate(
            "106-3", "tdd", "red", project_root=real_project
        )
        assert result["gate_file"] == "gates/tests-fail"
