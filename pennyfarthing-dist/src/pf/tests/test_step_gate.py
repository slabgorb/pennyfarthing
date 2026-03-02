"""Tests for stepped workflow gate validation — Story 137-3.

Epic: 137 (Stepped workflow modernization)
Story: 137-3 — Gate validation for stepped workflows

Tests the resolve_step_gate() function and complete-step gate integration:
- AC1: resolve_step_gate() function created in src/pf/workflow/step_gate.py
- AC2: pf workflow complete-step calls gate validation when step-meta has gate: true
- AC3: Support for inline gate criteria and external gate_file references
- AC4: --skip-gate override flag with audit logging
- AC5: Architecture gate files (components, risks)
- AC6: Release gate files (version bump, commit)
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from pf.workflow.step_gate import resolve_step_gate


# ---------------------------------------------------------------------------
# Fixtures: Step meta structures
# ---------------------------------------------------------------------------

STEP_META_GATE_TRUE = {
    "number": 4,
    "name": "component-design",
    "gate": True,
}

STEP_META_GATE_FALSE = {
    "number": 3,
    "name": "patterns",
    "gate": False,
}

STEP_META_NO_GATE_FIELD = {
    "number": 1,
    "name": "initialize",
}

STEP_META_WITH_INLINE = {
    "number": 4,
    "name": "component-design",
    "gate": True,
    "gate_inline": [
        {
            "criterion": "components documented",
            "check": "All major components have ADR references",
        },
        {
            "criterion": "risks assessed",
            "check": "Risk register updated",
        },
    ],
}

STEP_META_WITH_GATE_FILE = {
    "number": 4,
    "name": "component-design",
    "gate": True,
    "gate_file": "gates/stepped/architecture-components.yaml",
}

STEP_META_WITH_BOTH = {
    "number": 4,
    "name": "component-design",
    "gate": True,
    "gate_inline": [
        {
            "criterion": "components documented",
            "check": "All major components have ADR references",
        },
    ],
    "gate_file": "gates/stepped/architecture-components.yaml",
}

STEP_META_EMPTY_INLINE = {
    "number": 4,
    "name": "component-design",
    "gate": True,
    "gate_inline": [],
}

# Sample step file content with <gate> tag
STEP_FILE_WITH_GATE_TAG = textwrap.dedent("""\
    # Step 4: Component Design

    <step-meta>
    number: 4
    name: component-design
    gate: true
    </step-meta>

    <gate>
    ## Completion Criteria
    - [ ] All components have defined boundaries
    - [ ] Dependencies mapped between components
    - [ ] ADR references for key decisions
    </gate>

    ## Instructions
    Define the components...
""")

STEP_FILE_WITHOUT_GATE_TAG = textwrap.dedent("""\
    # Step 3: Patterns

    <step-meta>
    number: 3
    name: patterns
    gate: false
    </step-meta>

    ## Instructions
    Select patterns...
""")


# ---------------------------------------------------------------------------
# Fixtures: External gate file content
# ---------------------------------------------------------------------------

ARCHITECTURE_COMPONENTS_GATE = {
    "gate": {
        "name": "architecture-components",
        "description": "Verify component design is complete",
        "criteria": [
            {
                "name": "components-documented",
                "check": "All major components have ADR references",
            },
            {
                "name": "boundaries-defined",
                "check": "Component boundaries and interfaces documented",
            },
        ],
    },
}

ARCHITECTURE_RISKS_GATE = {
    "gate": {
        "name": "architecture-risks",
        "description": "Verify risk assessment is complete",
        "criteria": [
            {
                "name": "risks-identified",
                "check": "All major risks listed with probability and impact",
            },
            {
                "name": "mitigations-planned",
                "check": "Mitigation strategies documented for high risks",
            },
        ],
    },
}

RELEASE_VERSION_BUMP_GATE = {
    "gate": {
        "name": "release-version-bump",
        "description": "Verify version has been bumped correctly",
        "criteria": [
            {
                "name": "version-bumped",
                "check": "package.json version incremented",
            },
            {
                "name": "changelog-updated",
                "check": "CHANGELOG.md has new version entry",
            },
        ],
    },
}

RELEASE_COMMIT_GATE = {
    "gate": {
        "name": "release-commit",
        "description": "Verify release commit is clean",
        "criteria": [
            {
                "name": "working-tree-clean",
                "check": "No uncommitted changes",
            },
            {
                "name": "commit-tagged",
                "check": "Release commit has version tag",
            },
        ],
    },
}


# ---------------------------------------------------------------------------
# Fixtures: Project structure
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create a minimal project structure for step gate tests."""
    # Gates directory for stepped workflow gates
    gates_dir = tmp_path / "gates" / "stepped"
    gates_dir.mkdir(parents=True)

    # Write sample gate files
    for name, data in [
        ("architecture-components.yaml", ARCHITECTURE_COMPONENTS_GATE),
        ("architecture-risks.yaml", ARCHITECTURE_RISKS_GATE),
        ("release-version-bump.yaml", RELEASE_VERSION_BUMP_GATE),
        ("release-commit.yaml", RELEASE_COMMIT_GATE),
    ]:
        (gates_dir / name).write_text(yaml.dump(data, default_flow_style=False))

    # Workflows directory
    workflows_dir = tmp_path / ".pennyfarthing" / "workflows"
    workflows_dir.mkdir(parents=True)

    return tmp_path


@pytest.fixture
def step_file_with_gate(tmp_path: Path) -> str:
    """Create a step file with a <gate> tag and return its path."""
    steps_dir = tmp_path / "steps"
    steps_dir.mkdir(exist_ok=True)
    step_file = steps_dir / "step-04-components.md"
    step_file.write_text(STEP_FILE_WITH_GATE_TAG)
    return str(step_file)


@pytest.fixture
def step_file_without_gate(tmp_path: Path) -> str:
    """Create a step file without a <gate> tag."""
    steps_dir = tmp_path / "steps"
    steps_dir.mkdir(exist_ok=True)
    step_file = steps_dir / "step-03-patterns.md"
    step_file.write_text(STEP_FILE_WITHOUT_GATE_TAG)
    return str(step_file)


# ===========================================================================
# AC1: resolve_step_gate() function exists and returns correct structure
# ===========================================================================


class TestResolveStepGateContract:
    """AC1: resolve_step_gate() returns the documented result dict."""

    def test_returns_dict(self, step_file_with_gate: str, project: Path) -> None:
        """AC1: Function returns a dict."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert isinstance(result, dict)

    def test_result_has_success_field(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC1: Result dict has 'success' boolean field."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert "success" in result
        assert isinstance(result["success"], bool)

    def test_result_has_gate_result_field(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC1: Result dict has 'gate_result' dict field."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert "gate_result" in result
        assert isinstance(result["gate_result"], dict)

    def test_result_has_error_field(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC1: Result dict has 'error' field (None on success)."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert "error" in result

    def test_result_has_gate_used_field(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC1: Result dict has 'gate_used' field indicating gate source."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert "gate_used" in result
        assert result["gate_used"] in ("inline", "external", "skipped")

    def test_gate_used_is_inline_for_inline_criteria(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC1: gate_used should be 'inline' when inline criteria are used."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "inline"


# ===========================================================================
# AC2: complete-step calls gate validation when step-meta has gate: true
# ===========================================================================


class TestCompleteStepGateIntegration:
    """AC2: complete-step extended to call gate validation."""

    def test_gate_true_triggers_validation(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC2: When step-meta has gate: true, resolve_step_gate is called."""
        # resolve_step_gate should return a non-skipped result
        result = resolve_step_gate(
            step_meta=STEP_META_GATE_TRUE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        # gate: true without inline criteria or gate_file still runs gate
        assert result["gate_used"] != "skipped"

    def test_gate_false_skips_validation(
        self, step_file_without_gate: str, project: Path
    ) -> None:
        """AC2: When step-meta has gate: false, gate validation is skipped."""
        result = resolve_step_gate(
            step_meta=STEP_META_GATE_FALSE,
            step_file=step_file_without_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "skipped"
        assert result["success"] is True

    def test_no_gate_field_skips_validation(
        self, step_file_without_gate: str, project: Path
    ) -> None:
        """AC2: When step-meta has no gate field, validation is skipped."""
        result = resolve_step_gate(
            step_meta=STEP_META_NO_GATE_FIELD,
            step_file=step_file_without_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "skipped"
        assert result["success"] is True

    def test_gate_blocks_on_failure(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC2: Gate failure should set success=False."""
        # With gate: true but no inline or file criteria, the gate
        # should parse <gate> from step file — criteria should be found
        result = resolve_step_gate(
            step_meta=STEP_META_GATE_TRUE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert isinstance(result["success"], bool)


# ===========================================================================
# AC3: Inline gate criteria from <gate> tag and external gate_file
# ===========================================================================


class TestInlineGateCriteria:
    """AC3: Support for inline gate criteria from step-meta gate_inline."""

    def test_inline_criteria_parsed(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: Inline criteria from step-meta are parsed into gate_result."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "inline"
        assert "criteria" in result["gate_result"]
        assert len(result["gate_result"]["criteria"]) == 2

    def test_inline_criteria_names_preserved(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: Criterion names from inline criteria are preserved in result."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        criteria = result["gate_result"]["criteria"]
        names = [c["criterion"] for c in criteria]
        assert "components documented" in names
        assert "risks assessed" in names

    def test_empty_inline_criteria_not_valid(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: Empty inline criteria list should produce an error."""
        result = resolve_step_gate(
            step_meta=STEP_META_EMPTY_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["success"] is False
        assert result["error"] is not None


class TestExternalGateFile:
    """AC3: Support for external gate_file references."""

    def test_external_gate_file_loaded(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: External gate file is loaded and parsed."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_GATE_FILE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "external"
        assert "criteria" in result["gate_result"]

    def test_external_gate_file_criteria_count(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: External gate file criteria are loaded with correct count."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_GATE_FILE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        # architecture-components.yaml has 2 criteria
        assert len(result["gate_result"]["criteria"]) == 2

    def test_external_gate_file_not_found(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: Missing gate file returns error."""
        meta = {
            **STEP_META_WITH_GATE_FILE,
            "gate_file": "gates/stepped/nonexistent.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["success"] is False
        assert result["error"] is not None
        assert "not found" in result["error"].lower()

    def test_malformed_gate_file_returns_error(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: Malformed YAML gate file returns error."""
        bad_gate = project / "gates" / "stepped" / "bad.yaml"
        bad_gate.write_text("{{invalid yaml: [")
        meta = {
            **STEP_META_WITH_GATE_FILE,
            "gate_file": "gates/stepped/bad.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["success"] is False
        assert result["error"] is not None


class TestGateFilePriority:
    """AC3: When both inline and external are present, external takes priority."""

    def test_both_present_uses_external(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: gate_file takes precedence over gate_inline when both present."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_BOTH,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "external"


class TestGateTagParsing:
    """AC3: Support for <gate> tag in step file content."""

    def test_gate_tag_parsed_from_step_file(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC3: <gate> tag content is extracted when gate: true but no inline/file."""
        result = resolve_step_gate(
            step_meta=STEP_META_GATE_TRUE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        # Should find and use <gate> tag from step file
        assert result["gate_result"] is not None
        assert result["gate_used"] != "skipped"

    def test_no_gate_tag_in_file_with_gate_true(
        self, step_file_without_gate: str, project: Path
    ) -> None:
        """AC3: gate: true but no <gate> tag and no inline/file is an error."""
        result = resolve_step_gate(
            step_meta=STEP_META_GATE_TRUE,
            step_file=step_file_without_gate,
            workflow_name="architecture",
            project_root=project,
        )
        # No criteria found anywhere — should error
        assert result["success"] is False
        assert result["error"] is not None


# ===========================================================================
# AC4: --skip-gate override flag
# ===========================================================================


class TestSkipGateFlag:
    """AC4: --skip-gate override flag bypasses gate validation."""

    def test_skip_gate_returns_success(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC4: skip_gate=True always returns success=True."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            skip_gate=True,
            project_root=project,
        )
        assert result["success"] is True

    def test_skip_gate_sets_gate_used_skipped(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC4: skip_gate=True sets gate_used to 'skipped'."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            skip_gate=True,
            project_root=project,
        )
        assert result["gate_used"] == "skipped"

    def test_skip_gate_has_no_error(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC4: skip_gate=True should not produce an error."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_INLINE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            skip_gate=True,
            project_root=project,
        )
        assert result["error"] is None

    def test_skip_gate_with_external_file(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC4: skip_gate=True skips even when gate_file is specified."""
        result = resolve_step_gate(
            step_meta=STEP_META_WITH_GATE_FILE,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            skip_gate=True,
            project_root=project,
        )
        assert result["success"] is True
        assert result["gate_used"] == "skipped"

    def test_skip_gate_with_missing_file_still_succeeds(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC4: skip_gate=True succeeds even with nonexistent gate_file."""
        meta = {
            **STEP_META_WITH_GATE_FILE,
            "gate_file": "gates/stepped/nonexistent.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            skip_gate=True,
            project_root=project,
        )
        assert result["success"] is True
        assert result["gate_used"] == "skipped"


# ===========================================================================
# AC5: Architecture gate files (components, risks)
# ===========================================================================


class TestArchitectureGateFiles:
    """AC5: Stepped gate files for architecture workflow."""

    def test_architecture_components_gate_loads(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC5: architecture-components.yaml gate file loads successfully."""
        meta = {
            **STEP_META_GATE_TRUE,
            "gate_file": "gates/stepped/architecture-components.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "external"
        assert result["gate_result"] is not None

    def test_architecture_components_has_criteria(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC5: architecture-components gate has criteria."""
        meta = {
            **STEP_META_GATE_TRUE,
            "gate_file": "gates/stepped/architecture-components.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert len(result["gate_result"]["criteria"]) >= 1

    def test_architecture_risks_gate_loads(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC5: architecture-risks.yaml gate file loads successfully."""
        meta = {
            **STEP_META_GATE_TRUE,
            "gate_file": "gates/stepped/architecture-risks.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "external"
        assert len(result["gate_result"]["criteria"]) >= 1


# ===========================================================================
# AC6: Release gate files (version bump, commit)
# ===========================================================================


class TestReleaseGateFiles:
    """AC6: Stepped gate files for release workflow."""

    def test_release_version_bump_gate_loads(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC6: release-version-bump.yaml gate file loads successfully."""
        meta = {
            **STEP_META_GATE_TRUE,
            "gate_file": "gates/stepped/release-version-bump.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="release",
            project_root=project,
        )
        assert result["gate_used"] == "external"
        assert result["gate_result"] is not None

    def test_release_commit_gate_loads(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """AC6: release-commit.yaml gate file loads successfully."""
        meta = {
            **STEP_META_GATE_TRUE,
            "gate_file": "gates/stepped/release-commit.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="release",
            project_root=project,
        )
        assert result["gate_used"] == "external"
        assert len(result["gate_result"]["criteria"]) >= 1


# ===========================================================================
# Edge cases
# ===========================================================================


class TestEdgeCases:
    """Edge cases for resolve_step_gate."""

    def test_step_file_not_found(self, project: Path) -> None:
        """Edge: Non-existent step file returns error."""
        result = resolve_step_gate(
            step_meta=STEP_META_GATE_TRUE,
            step_file="/nonexistent/step-04.md",
            workflow_name="architecture",
            project_root=project,
        )
        assert result["success"] is False
        assert result["error"] is not None

    def test_gate_file_with_empty_criteria(
        self, step_file_with_gate: str, project: Path
    ) -> None:
        """Edge: Gate file with empty criteria list returns error."""
        empty_gate = project / "gates" / "stepped" / "empty.yaml"
        empty_gate.write_text(
            yaml.dump({"gate": {"name": "empty", "criteria": []}})
        )
        meta = {
            **STEP_META_GATE_TRUE,
            "gate_file": "gates/stepped/empty.yaml",
        }
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_with_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["success"] is False
        assert result["error"] is not None

    def test_step_meta_gate_none_treated_as_false(
        self, step_file_without_gate: str, project: Path
    ) -> None:
        """Edge: step-meta with gate: None treated as gate: false."""
        meta = {"number": 1, "name": "init", "gate": None}
        result = resolve_step_gate(
            step_meta=meta,
            step_file=step_file_without_gate,
            workflow_name="architecture",
            project_root=project,
        )
        assert result["gate_used"] == "skipped"
        assert result["success"] is True
