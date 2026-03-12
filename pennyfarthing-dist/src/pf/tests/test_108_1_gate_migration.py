"""Tests for gate file migration — Story 108-1.

Epic: 108 (Full Migration & Cleanup)
Story: 108-1 — Migrate tests-fail and approval gates to files

Tests the creation of tests-fail.md and approval.md gate files,
and the addition of gate.file entries to workflow YAMLs.

Acceptance Criteria:
- [AC1] Gate files tests-fail.md and approval.md exist with correct structure
- [AC2] Workflow YAMLs have gate.file entries for tests_fail and approval phases
- [AC3] Gate files resolve via resolve_gate_file() and validate correctly
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from pf.handoff.gate_file import resolve_gate_file
from pf.handoff.resolve_gate import resolve_gate

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# src/pf/tests -> src/pf -> src -> pennyfarthing-dist
DIST_DIR = Path(__file__).resolve().parents[3]
GATES_DIR = DIST_DIR / "gates"
WORKFLOWS_DIR = DIST_DIR / "workflows"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_gate(name: str) -> str:
    """Read a gate file by name from pennyfarthing-dist/gates/."""
    path = GATES_DIR / f"{name}.md"
    assert path.exists(), f"Gate file not found: {path}"
    return path.read_text()


def _load_workflow(name: str) -> dict:
    """Load a workflow YAML from pennyfarthing-dist/workflows/."""
    path = WORKFLOWS_DIR / f"{name}.yaml"
    assert path.exists(), f"Workflow not found: {path}"
    return yaml.safe_load(path.read_text())


def _get_phase(workflow_data: dict, phase_name: str) -> dict:
    """Extract a phase dict from workflow data by name."""
    for phase in workflow_data["workflow"]["phases"]:
        if phase["name"] == phase_name:
            return phase
    raise ValueError(
        f"Phase '{phase_name}' not found in workflow '{workflow_data['workflow']['name']}'"
    )


def _get_gate_file(workflow_data: dict, phase_name: str) -> str | None:
    """Get the gate.file value for a phase, or None."""
    phase = _get_phase(workflow_data, phase_name)
    gate = phase.get("gate") or {}
    return gate.get("file")


def _get_gate_type(workflow_data: dict, phase_name: str) -> str | None:
    """Get the gate.type value for a phase, or None."""
    phase = _get_phase(workflow_data, phase_name)
    gate = phase.get("gate") or {}
    return gate.get("type")


# ===========================================================================
# AC1: Gate files exist with correct structure
# ===========================================================================


class TestTestsFailGateFile:
    """AC1: tests-fail.md gate file exists and has correct structure."""

    def test_file_exists(self) -> None:
        """AC1: tests-fail.md must exist in pennyfarthing-dist/gates/."""
        assert (GATES_DIR / "tests-fail.md").exists()

    def test_has_gate_root_element(self) -> None:
        """AC1: File must have <gate> root element."""
        content = _read_gate("tests-fail")
        assert "<gate " in content, "Missing <gate> root element"
        assert "</gate>" in content, "Missing closing </gate> tag"

    def test_gate_name_attribute(self) -> None:
        """AC1: Gate name must be 'tests-fail'."""
        content = _read_gate("tests-fail")
        assert 'name="tests-fail"' in content

    def test_gate_model_attribute(self) -> None:
        """AC1: Gate model must be 'haiku'."""
        content = _read_gate("tests-fail")
        assert 'model="haiku"' in content

    def test_has_purpose_section(self) -> None:
        """AC1: Must have <purpose> section."""
        content = _read_gate("tests-fail")
        assert "<purpose>" in content
        assert "</purpose>" in content

    def test_has_pass_section(self) -> None:
        """AC1: Must have <pass> section."""
        content = _read_gate("tests-fail")
        assert "<pass>" in content
        assert "</pass>" in content

    def test_has_fail_section(self) -> None:
        """AC1: Must have <fail> section."""
        content = _read_gate("tests-fail")
        assert "<fail>" in content
        assert "</fail>" in content

    def test_purpose_mentions_failing_tests(self) -> None:
        """AC1: Purpose should describe checking for failing/RED tests."""
        content = _read_gate("tests-fail")
        purpose = re.search(r"<purpose>(.*?)</purpose>", content, re.DOTALL)
        assert purpose is not None
        purpose_text = purpose.group(1).lower()
        assert "fail" in purpose_text or "red" in purpose_text

    def test_pass_section_mentions_test_coverage(self) -> None:
        """AC1: Pass section should reference test coverage of acceptance criteria."""
        content = _read_gate("tests-fail")
        pass_section = re.search(r"<pass>(.*?)</pass>", content, re.DOTALL)
        assert pass_section is not None
        pass_text = pass_section.group(1).lower()
        assert "test" in pass_text
        assert "acceptance" in pass_text or "criteria" in pass_text or "committed" in pass_text

    def test_pass_section_mentions_gate_result(self) -> None:
        """AC1: Pass section should return GATE_RESULT."""
        content = _read_gate("tests-fail")
        pass_section = re.search(r"<pass>(.*?)</pass>", content, re.DOTALL)
        assert pass_section is not None
        assert "GATE_RESULT" in pass_section.group(1)

    def test_fail_section_mentions_gate_result(self) -> None:
        """AC1: Fail section should return GATE_RESULT."""
        content = _read_gate("tests-fail")
        fail_section = re.search(r"<fail>(.*?)</fail>", content, re.DOTALL)
        assert fail_section is not None
        assert "GATE_RESULT" in fail_section.group(1)


class TestApprovalGateFile:
    """AC1: approval.md gate file exists and has correct structure."""

    def test_file_exists(self) -> None:
        """AC1: approval.md must exist in pennyfarthing-dist/gates/."""
        assert (GATES_DIR / "approval.md").exists()

    def test_has_gate_root_element(self) -> None:
        """AC1: File must have <gate> root element."""
        content = _read_gate("approval")
        assert "<gate " in content, "Missing <gate> root element"
        assert "</gate>" in content, "Missing closing </gate> tag"

    def test_gate_name_attribute(self) -> None:
        """AC1: Gate name must be 'approval'."""
        content = _read_gate("approval")
        assert 'name="approval"' in content

    def test_gate_model_attribute(self) -> None:
        """AC1: Gate model must be 'haiku'."""
        content = _read_gate("approval")
        assert 'model="haiku"' in content

    def test_has_purpose_section(self) -> None:
        """AC1: Must have <purpose> section."""
        content = _read_gate("approval")
        assert "<purpose>" in content
        assert "</purpose>" in content

    def test_has_pass_section(self) -> None:
        """AC1: Must have <pass> section."""
        content = _read_gate("approval")
        assert "<pass>" in content
        assert "</pass>" in content

    def test_has_fail_section(self) -> None:
        """AC1: Must have <fail> section."""
        content = _read_gate("approval")
        assert "<fail>" in content
        assert "</fail>" in content

    def test_purpose_mentions_reviewer(self) -> None:
        """AC1: Purpose should describe checking reviewer verdict."""
        content = _read_gate("approval")
        purpose = re.search(r"<purpose>(.*?)</purpose>", content, re.DOTALL)
        assert purpose is not None
        purpose_text = purpose.group(1).lower()
        assert "review" in purpose_text or "verdict" in purpose_text

    def test_pass_section_mentions_approved(self) -> None:
        """AC1: Pass section should reference APPROVED verdict."""
        content = _read_gate("approval")
        pass_section = re.search(r"<pass>(.*?)</pass>", content, re.DOTALL)
        assert pass_section is not None
        assert "APPROVED" in pass_section.group(1) or "approved" in pass_section.group(1).lower()

    def test_fail_section_handles_rejected(self) -> None:
        """AC1: Fail section should handle REJECTED verdict."""
        content = _read_gate("approval")
        fail_section = re.search(r"<fail>(.*?)</fail>", content, re.DOTALL)
        assert fail_section is not None
        fail_text = fail_section.group(1)
        assert "REJECTED" in fail_text or "rejected" in fail_text.lower()

    def test_pass_section_mentions_gate_result(self) -> None:
        """AC1: Pass section should return GATE_RESULT."""
        content = _read_gate("approval")
        pass_section = re.search(r"<pass>(.*?)</pass>", content, re.DOTALL)
        assert pass_section is not None
        assert "GATE_RESULT" in pass_section.group(1)

    def test_fail_section_mentions_gate_result(self) -> None:
        """AC1: Fail section should return GATE_RESULT."""
        content = _read_gate("approval")
        fail_section = re.search(r"<fail>(.*?)</fail>", content, re.DOTALL)
        assert fail_section is not None
        assert "GATE_RESULT" in fail_section.group(1)


# ===========================================================================
# AC2: Workflow YAMLs have gate.file entries
# ===========================================================================


class TestTddWorkflowGateFiles:
    """AC2: tdd.yaml has gate.file for red (tests_fail) and review (approval)."""

    @pytest.fixture
    def tdd(self) -> dict:
        return _load_workflow("tdd")

    def test_red_phase_has_gate_file(self, tdd: dict) -> None:
        """AC2: tdd red phase must have gate.file = 'gates/tests-fail'."""
        assert _get_gate_file(tdd, "red") == "gates/tests-fail"

    def test_red_phase_keeps_gate_type(self, tdd: dict) -> None:
        """AC2: tdd red phase must retain gate.type = 'tests_fail' during transition."""
        assert _get_gate_type(tdd, "red") == "tests_fail"

    def test_review_phase_has_gate_file(self, tdd: dict) -> None:
        """AC2: tdd review phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(tdd, "review") == "gates/approval"

    def test_review_phase_keeps_gate_type(self, tdd: dict) -> None:
        """AC2: tdd review phase must retain gate.type = 'approval' during transition."""
        assert _get_gate_type(tdd, "review") == "approval"

    def test_green_phase_unchanged(self, tdd: dict) -> None:
        """AC2: tdd green phase gate.file should be gates/dev-exit."""
        assert _get_gate_file(tdd, "green") == "gates/dev-exit"


class TestTrivialWorkflowGateFiles:
    """AC2: trivial.yaml has gate.file for review (approval)."""

    @pytest.fixture
    def trivial(self) -> dict:
        return _load_workflow("trivial")

    def test_review_phase_has_gate_file(self, trivial: dict) -> None:
        """AC2: trivial review phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(trivial, "review") == "gates/approval"

    def test_review_phase_keeps_gate_type(self, trivial: dict) -> None:
        """AC2: trivial review phase must retain gate.type = 'approval'."""
        assert _get_gate_type(trivial, "review") == "approval"


class TestBddWorkflowGateFiles:
    """AC2: bdd.yaml has gate.file for red (tests_fail) and review (approval)."""

    @pytest.fixture
    def bdd(self) -> dict:
        return _load_workflow("bdd")

    def test_red_phase_has_gate_file(self, bdd: dict) -> None:
        """AC2: bdd red phase must have gate.file = 'gates/tests-fail'."""
        assert _get_gate_file(bdd, "red") == "gates/tests-fail"

    def test_red_phase_keeps_gate_type(self, bdd: dict) -> None:
        """AC2: bdd red phase must retain gate.type = 'tests_fail'."""
        assert _get_gate_type(bdd, "red") == "tests_fail"

    def test_review_phase_has_gate_file(self, bdd: dict) -> None:
        """AC2: bdd review phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(bdd, "review") == "gates/approval"

    def test_review_phase_keeps_gate_type(self, bdd: dict) -> None:
        """AC2: bdd review phase must retain gate.type = 'approval'."""
        assert _get_gate_type(bdd, "review") == "approval"


class TestTddTandemWorkflowGateFiles:
    """AC2: tdd-tandem.yaml has gate.file for red and review."""

    @pytest.fixture
    def tdd_tandem(self) -> dict:
        return _load_workflow("tdd-tandem")

    def test_red_phase_has_gate_file(self, tdd_tandem: dict) -> None:
        """AC2: tdd-tandem red phase must have gate.file = 'gates/tests-fail'."""
        assert _get_gate_file(tdd_tandem, "red") == "gates/tests-fail"

    def test_review_phase_has_gate_file(self, tdd_tandem: dict) -> None:
        """AC2: tdd-tandem review phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(tdd_tandem, "review") == "gates/approval"


class TestBddTandemWorkflowGateFiles:
    """AC2: bdd-tandem.yaml has gate.file for red and review."""

    @pytest.fixture
    def bdd_tandem(self) -> dict:
        return _load_workflow("bdd-tandem")

    def test_red_phase_has_gate_file(self, bdd_tandem: dict) -> None:
        """AC2: bdd-tandem red phase must have gate.file = 'gates/tests-fail'."""
        assert _get_gate_file(bdd_tandem, "red") == "gates/tests-fail"

    def test_review_phase_has_gate_file(self, bdd_tandem: dict) -> None:
        """AC2: bdd-tandem review phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(bdd_tandem, "review") == "gates/approval"


class TestTwoPartyTddWorkflowGateFiles:
    """AC2: 2party-tdd.yaml has gate.file for all tests_fail and approval phases."""

    @pytest.fixture
    def two_party(self) -> dict:
        return _load_workflow("2party-tdd")

    # tests_fail phases
    def test_red_phase_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd red phase must have gate.file = 'gates/tests-fail'."""
        assert _get_gate_file(two_party, "red") == "gates/tests-fail"

    def test_review_fix_tea_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd review-fix-tea phase must have gate.file = 'gates/tests-fail'."""
        assert _get_gate_file(two_party, "review-fix-tea") == "gates/tests-fail"

    # approval phases
    def test_refine_dev_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd refine-dev phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(two_party, "refine-dev") == "gates/approval"

    def test_refine_tea_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd refine-tea phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(two_party, "refine-tea") == "gates/approval"

    def test_quality_pass_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd quality-pass phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(two_party, "quality-pass") == "gates/approval"

    def test_review_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd review phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(two_party, "review") == "gates/approval"

    def test_pr_prepare_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd pr-prepare phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(two_party, "pr-prepare") == "gates/approval"

    def test_pr_review_party_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd pr-review-party phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(two_party, "pr-review-party") == "gates/approval"

    def test_pr_review_respond_has_gate_file(self, two_party: dict) -> None:
        """AC2: 2party-tdd pr-review-respond phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(two_party, "pr-review-respond") == "gates/approval"


class TestAgentDocsWorkflowGateFiles:
    """AC2: agent-docs.yaml has gate.file for review (approval)."""

    @pytest.fixture
    def agent_docs(self) -> dict:
        return _load_workflow("agent-docs")

    def test_review_phase_has_gate_file(self, agent_docs: dict) -> None:
        """AC2: agent-docs review phase must have gate.file = 'gates/approval'."""
        assert _get_gate_file(agent_docs, "review") == "gates/approval"

    def test_review_phase_keeps_gate_type(self, agent_docs: dict) -> None:
        """AC2: agent-docs review phase must retain gate.type = 'approval'."""
        assert _get_gate_type(agent_docs, "review") == "approval"


# ===========================================================================
# AC2: gate.type retained during transition
# ===========================================================================


class TestGateTypeRetainedDuringTransition:
    """AC2: All phases that get gate.file must also keep gate.type."""

    @pytest.mark.parametrize(
        "workflow_name,phase_name,expected_type",
        [
            ("tdd", "red", "tests_fail"),
            ("tdd", "review", "approval"),
            ("trivial", "review", "approval"),
            ("bdd", "red", "tests_fail"),
            ("bdd", "review", "approval"),
            ("tdd-tandem", "red", "tests_fail"),
            ("tdd-tandem", "review", "approval"),
            ("bdd-tandem", "red", "tests_fail"),
            ("bdd-tandem", "review", "approval"),
            ("2party-tdd", "red", "tests_fail"),
            ("2party-tdd", "review", "approval"),
            ("2party-tdd", "review-fix-tea", "tests_fail"),
            ("agent-docs", "review", "approval"),
        ],
    )
    def test_gate_type_retained(
        self, workflow_name: str, phase_name: str, expected_type: str
    ) -> None:
        """AC2: gate.type must be retained alongside gate.file during transition."""
        wf = _load_workflow(workflow_name)
        assert _get_gate_type(wf, phase_name) == expected_type


# ===========================================================================
# AC3: Gate file resolution
# ===========================================================================


class TestGateFileResolution:
    """AC3: New gate files resolve via resolve_gate_file()."""

    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        """Create project structure with symlink to real gates."""
        (tmp_path / ".pennyfarthing" / "gates").mkdir(parents=True)
        (tmp_path / "pennyfarthing-dist" / "gates").mkdir(parents=True)

        # Copy the actual gate files (they should exist after implementation)
        for name in ("tests-fail", "approval"):
            src = GATES_DIR / f"{name}.md"
            if src.exists():
                dst = tmp_path / "pennyfarthing-dist" / "gates" / f"{name}.md"
                dst.write_text(src.read_text())
        return tmp_path

    def test_tests_fail_resolves(self, project: Path) -> None:
        """AC3: resolve_gate_file('tests-fail') should return 'found'."""
        result = resolve_gate_file("tests-fail", project_root=project)
        assert result["status"] == "found", f"Expected 'found', got: {result}"

    def test_approval_resolves(self, project: Path) -> None:
        """AC3: resolve_gate_file('approval') should return 'found'."""
        result = resolve_gate_file("approval", project_root=project)
        assert result["status"] == "found", f"Expected 'found', got: {result}"

    def test_tests_fail_with_prefix_resolves(self, project: Path) -> None:
        """AC3: resolve_gate_file('gates/tests-fail') should resolve same path."""
        result = resolve_gate_file("gates/tests-fail", project_root=project)
        assert result["status"] == "found"

    def test_approval_with_prefix_resolves(self, project: Path) -> None:
        """AC3: resolve_gate_file('gates/approval') should resolve same path."""
        result = resolve_gate_file("gates/approval", project_root=project)
        assert result["status"] == "found"


class TestResolveGateIntegration:
    """AC3: resolve_gate returns gate_file for migrated phases."""

    @pytest.fixture
    def project(self, tmp_path: Path) -> Path:
        """Create project with real workflow YAMLs and a session file."""
        workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
        workflows_dir.mkdir(parents=True)

        # Copy real workflow YAMLs
        for name in ("tdd", "trivial", "bdd"):
            src = WORKFLOWS_DIR / f"{name}.yaml"
            if src.exists():
                (workflows_dir / f"{name}.yaml").write_text(src.read_text())

        # Create session with assessment
        (tmp_path / ".session").mkdir()
        session = tmp_path / ".session" / "108-1-session.md"
        session.write_text(
            "# Story 108-1\n\n"
            "**Workflow:** tdd\n"
            "**Phase:** red\n\n"
            "## TEA Assessment\n\n"
            "**Tests Written:** 5\n"
            "**Status:** RED confirmed\n"
        )
        return tmp_path

    def test_tdd_red_returns_gate_file(self, project: Path) -> None:
        """AC3: resolve_gate for tdd/red should return gate_file='gates/tests-fail'."""
        result = resolve_gate("108-1", "tdd", "red", project_root=project)
        assert result["gate_file"] == "gates/tests-fail", (
            f"Expected gate_file='gates/tests-fail', got: {result}"
        )

    def test_tdd_review_returns_gate_file(self, project: Path) -> None:
        """AC3: resolve_gate for tdd/review should return gate_file='gates/approval'."""
        result = resolve_gate("108-1", "tdd", "review", project_root=project)
        assert result["gate_file"] == "gates/approval", (
            f"Expected gate_file='gates/approval', got: {result}"
        )

    def test_trivial_review_returns_gate_file(self, project: Path) -> None:
        """AC3: resolve_gate for trivial/review should return gate_file='gates/approval'."""
        result = resolve_gate("108-1", "trivial", "review", project_root=project)
        assert result["gate_file"] == "gates/approval", (
            f"Expected gate_file='gates/approval', got: {result}"
        )

    def test_bdd_red_returns_gate_file(self, project: Path) -> None:
        """AC3: resolve_gate for bdd/red should return gate_file='gates/tests-fail'."""
        result = resolve_gate("108-1", "bdd", "red", project_root=project)
        assert result["gate_file"] == "gates/tests-fail", (
            f"Expected gate_file='gates/tests-fail', got: {result}"
        )
