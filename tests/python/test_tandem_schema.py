"""
Tests for Story 86-1: Workflow schema — tandem: block.

Extends BikeLane workflow YAML schema to support `tandem:` configuration
blocks on phases, per ADR-0012.

Covers all 5 Acceptance Criteria:
  AC1: `tandem:` block parsed from workflow YAML phases
  AC2: Properties: partner, mode, model, token_budget, triggers
  AC3: Schema validation: unknown modes rejected, `consultation` accepted
  AC4: Backward compatible: existing workflows without `tandem:` unchanged
  AC5: `workflow-status-check` subagent reports tandem configuration

Run with: python -m pytest tests/python/test_tandem_schema.py -v
"""

from pathlib import Path
from textwrap import dedent

import pytest
import yaml
from pf.prime.workflow import get_phase_tandem_config
from pf.validate.adapters.workflow import (
    VALID_TANDEM_MODELS,
    VALID_TANDEM_MODES,
    run,
    validate_phased,
)

# =============================================================================
# Test Fixtures — inline YAML strings
# =============================================================================

WORKFLOW_WITH_TANDEM = dedent("""\
    workflow:
      name: tdd-with-tandem
      description: TDD workflow with tandem consultation
      version: "1.0.0"

      phases:
        - name: setup
          agent: sm
          output: [session_file]

        - name: red
          agent: tea
          input: [session_file]
          output: [failing_tests]
          gate:
            type: tests_fail
            condition: All ACs have test coverage
          tandem:
            partner: architect
            mode: consultation
            model: sonnet
            token_budget: 1000
            triggers:
              - request: true
              - complexity: high

        - name: green
          agent: dev
          input: [failing_tests]
          output: [implementation]
          gate:
            type: tests_pass

        - name: finish
          agent: sm
""")

WORKFLOW_WITHOUT_TANDEM = dedent("""\
    workflow:
      name: plain-tdd
      description: Standard TDD without tandem
      version: "1.0.0"

      phases:
        - name: setup
          agent: sm

        - name: red
          agent: tea
          gate:
            type: tests_fail

        - name: green
          agent: dev
          gate:
            type: tests_pass

        - name: finish
          agent: sm
""")

WORKFLOW_WITH_LEGACY_TANDEM = dedent("""\
    workflow:
      name: legacy-tandem
      description: Existing tandem with partner+scope only
      version: "1.0.0"

      phases:
        - name: setup
          agent: sm

        - name: green
          agent: dev
          gate:
            type: tests_pass
          tandem:
            partner: architect
            scope: file-watch

        - name: finish
          agent: sm
""")


# =============================================================================
# Helpers
# =============================================================================


def _write_workflow(tmp_path: Path, filename: str, content: str) -> Path:
    """Write a workflow YAML file and return its path."""
    workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)
    path = workflows_dir / filename
    path.write_text(content)
    return path


def _create_agents(tmp_path: Path, names: list[str]) -> Path:
    """Create mock agent files and return agents directory."""
    agents_dir = tmp_path / "pennyfarthing-dist" / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        (agents_dir / f"{name}.md").write_text(f"# {name} agent\n")
    return agents_dir


def _parse_workflow(content: str) -> dict:
    """Parse YAML content and return the workflow dict."""
    data = yaml.safe_load(content)
    return data.get("workflow", {})


# =============================================================================
# AC1: `tandem:` block parsed from workflow YAML phases
# =============================================================================


class TestAC1TandemParsing:
    """`tandem:` block parsed from workflow YAML phases."""

    def test_phase_with_valid_tandem_no_errors(self, tmp_path: Path):
        """Phase with a complete, valid tandem block produces no tandem-related errors."""
        path = _write_workflow(tmp_path, "tandem.yaml", WORKFLOW_WITH_TANDEM)
        data = _parse_workflow(WORKFLOW_WITH_TANDEM)
        agents_dir = _create_agents(
            tmp_path, ["sm", "tea", "dev", "architect"]
        )

        errors, warnings = validate_phased(data, path, agents_dir)

        # No tandem-related errors
        tandem_errors = [e for e in errors if "tandem" in e.lower()]
        assert tandem_errors == [], f"Unexpected tandem errors: {tandem_errors}"

    def test_tandem_block_is_optional(self, tmp_path: Path):
        """Phases without tandem block produce no tandem-related errors or warnings."""
        path = _write_workflow(tmp_path, "plain.yaml", WORKFLOW_WITHOUT_TANDEM)
        data = _parse_workflow(WORKFLOW_WITHOUT_TANDEM)
        agents_dir = _create_agents(tmp_path, ["sm", "tea", "dev"])

        errors, warnings = validate_phased(data, path, agents_dir)

        assert errors == []
        tandem_warnings = [w for w in warnings if "tandem" in w.lower()]
        assert tandem_warnings == []

    def test_tandem_block_not_dict_is_error(self, tmp_path: Path):
        """Phase with tandem: as a string (not dict) produces an error."""
        content = dedent("""\
            workflow:
              name: bad-tandem-type
              phases:
                - name: green
                  agent: dev
                  tandem: "not-a-dict"
        """)
        path = _write_workflow(tmp_path, "bad-tandem.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "tandem" in e.lower() for e in errors
        ), f"Expected tandem type error, got: {errors}"


# =============================================================================
# AC2: Properties: partner, mode, model, token_budget, triggers
# =============================================================================


class TestAC2TandemProperties:
    """Tandem block properties validated: partner, mode, model, token_budget, triggers."""

    def test_partner_required_when_tandem_present(self, tmp_path: Path):
        """Tandem block without partner field produces an error."""
        content = dedent("""\
            workflow:
              name: no-partner
              phases:
                - name: green
                  agent: dev
                  tandem:
                    mode: consultation
                    model: sonnet
        """)
        path = _write_workflow(tmp_path, "no-partner.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "partner" in e.lower() for e in errors
        ), f"Expected missing partner error, got: {errors}"

    def test_all_valid_properties_accepted(self, tmp_path: Path):
        """Tandem block with all valid properties produces no errors."""
        path = _write_workflow(tmp_path, "full.yaml", WORKFLOW_WITH_TANDEM)
        data = _parse_workflow(WORKFLOW_WITH_TANDEM)
        agents_dir = _create_agents(
            tmp_path, ["sm", "tea", "dev", "architect"]
        )

        errors, _ = validate_phased(data, path, agents_dir)

        tandem_errors = [e for e in errors if "tandem" in e.lower()]
        assert tandem_errors == [], f"Unexpected tandem errors: {tandem_errors}"

    def test_partner_cross_referenced_against_agents(self, tmp_path: Path):
        """Tandem partner referencing unknown agent produces a warning."""
        content = dedent("""\
            workflow:
              name: bad-partner-ref
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: nonexistent_agent
                    mode: consultation
        """)
        path = _write_workflow(tmp_path, "bad-partner.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev"])

        _, warnings = validate_phased(data, path, agents_dir)

        assert any(
            "nonexistent_agent" in w for w in warnings
        ), f"Expected partner cross-ref warning, got warnings: {warnings}"

    def test_invalid_model_produces_warning(self, tmp_path: Path):
        """Tandem block with invalid model value produces a warning."""
        content = dedent("""\
            workflow:
              name: bad-model
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: architect
                    mode: consultation
                    model: gpt-4
        """)
        path = _write_workflow(tmp_path, "bad-model.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        _, warnings = validate_phased(data, path, agents_dir)

        assert any(
            "model" in w.lower() for w in warnings
        ), f"Expected model warning, got warnings: {warnings}"

    def test_valid_models_accepted(self, tmp_path: Path):
        """All valid tandem model values are accepted without warnings."""
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        for model in VALID_TANDEM_MODELS:
            content = dedent(f"""\
                workflow:
                  name: model-{model}
                  phases:
                    - name: green
                      agent: dev
                      tandem:
                        partner: architect
                        mode: consultation
                        model: {model}
            """)
            path = _write_workflow(tmp_path, f"model-{model}.yaml", content)
            data = _parse_workflow(content)

            _, warnings = validate_phased(data, path, agents_dir)

            model_warnings = [w for w in warnings if "model" in w.lower()]
            assert model_warnings == [], (
                f"model '{model}' should be valid, got warnings: {model_warnings}"
            )

    def test_token_budget_must_be_positive_integer(self, tmp_path: Path):
        """Tandem block with negative token_budget produces an error."""
        content = dedent("""\
            workflow:
              name: bad-budget
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: architect
                    mode: consultation
                    token_budget: -100
        """)
        path = _write_workflow(tmp_path, "bad-budget.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "token_budget" in e.lower() or "budget" in e.lower() for e in errors
        ), f"Expected token_budget error, got: {errors}"

    def test_token_budget_non_integer_is_error(self, tmp_path: Path):
        """Tandem block with non-integer token_budget produces an error."""
        content = dedent("""\
            workflow:
              name: string-budget
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: architect
                    mode: consultation
                    token_budget: "lots"
        """)
        path = _write_workflow(tmp_path, "string-budget.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "token_budget" in e.lower() or "budget" in e.lower() for e in errors
        ), f"Expected token_budget type error, got: {errors}"

    def test_triggers_must_be_list(self, tmp_path: Path):
        """Tandem block with triggers as string produces an error."""
        content = dedent("""\
            workflow:
              name: bad-triggers
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: architect
                    mode: consultation
                    triggers: "always"
        """)
        path = _write_workflow(tmp_path, "bad-triggers.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "triggers" in e.lower() for e in errors
        ), f"Expected triggers type error, got: {errors}"


# =============================================================================
# AC3: Schema validation — unknown modes rejected, consultation accepted
# =============================================================================


class TestAC3TandemModeValidation:
    """Schema validation: unknown modes rejected, `consultation` accepted."""

    def test_consultation_mode_accepted(self, tmp_path: Path):
        """Tandem mode 'consultation' produces no mode-related errors."""
        content = dedent("""\
            workflow:
              name: consultation-mode
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: architect
                    mode: consultation
        """)
        path = _write_workflow(tmp_path, "consultation.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        errors, warnings = validate_phased(data, path, agents_dir)

        mode_errors = [e for e in errors if "mode" in e.lower()]
        assert mode_errors == [], f"consultation should be valid, got: {mode_errors}"
        mode_warnings = [w for w in warnings if "mode" in w.lower()]
        assert mode_warnings == [], f"consultation should have no warnings: {mode_warnings}"

    def test_unknown_mode_rejected(self, tmp_path: Path):
        """Tandem mode 'pair_programming' (unknown) produces an error."""
        content = dedent("""\
            workflow:
              name: bad-mode
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: architect
                    mode: pair_programming
        """)
        path = _write_workflow(tmp_path, "bad-mode.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "mode" in e.lower() and "pair_programming" in e.lower() for e in errors
        ), f"Expected unknown mode error, got: {errors}"

    def test_all_valid_modes_accepted(self, tmp_path: Path):
        """Every mode in VALID_TANDEM_MODES is accepted without errors."""
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        for mode in VALID_TANDEM_MODES:
            content = dedent(f"""\
                workflow:
                  name: mode-{mode}
                  phases:
                    - name: green
                      agent: dev
                      tandem:
                        partner: architect
                        mode: {mode}
            """)
            path = _write_workflow(tmp_path, f"mode-{mode}.yaml", content)
            data = _parse_workflow(content)

            errors, _ = validate_phased(data, path, agents_dir)

            mode_errors = [e for e in errors if "mode" in e.lower()]
            assert mode_errors == [], (
                f"mode '{mode}' should be valid, got: {mode_errors}"
            )

    def test_mode_is_optional_for_backward_compat(self, tmp_path: Path):
        """Tandem block without mode field (just partner+scope) is accepted."""
        path = _write_workflow(
            tmp_path, "legacy.yaml", WORKFLOW_WITH_LEGACY_TANDEM
        )
        data = _parse_workflow(WORKFLOW_WITH_LEGACY_TANDEM)
        agents_dir = _create_agents(tmp_path, ["sm", "dev", "architect"])

        errors, _ = validate_phased(data, path, agents_dir)

        mode_errors = [e for e in errors if "mode" in e.lower()]
        assert mode_errors == [], (
            f"Missing mode should be OK for backward compat, got: {mode_errors}"
        )


# =============================================================================
# AC4: Backward compatible — existing workflows without tandem unchanged
# =============================================================================


class TestAC4BackwardCompatibility:
    """Backward compatible: existing workflows without `tandem:` unchanged."""

    def test_workflow_without_tandem_still_passes(self, tmp_path: Path):
        """Standard workflow without any tandem blocks passes validation."""
        path = _write_workflow(
            tmp_path, "plain.yaml", WORKFLOW_WITHOUT_TANDEM
        )
        data = _parse_workflow(WORKFLOW_WITHOUT_TANDEM)
        agents_dir = _create_agents(tmp_path, ["sm", "tea", "dev"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert errors == [], f"Plain workflow should pass, got: {errors}"

    def test_existing_tandem_with_partner_scope_passes(self, tmp_path: Path):
        """Existing tandem blocks with only partner+scope continue to pass."""
        path = _write_workflow(
            tmp_path, "legacy.yaml", WORKFLOW_WITH_LEGACY_TANDEM
        )
        data = _parse_workflow(WORKFLOW_WITH_LEGACY_TANDEM)
        agents_dir = _create_agents(tmp_path, ["sm", "dev", "architect"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert errors == [], (
            f"Legacy tandem (partner+scope) should pass, got: {errors}"
        )

    def test_zero_false_positives_with_tandem_validation(self):
        """All real workflow files still pass with tandem validation active."""
        root = Path(__file__).resolve().parents[2]
        workflows_dir = root / "pennyfarthing-dist" / "workflows"

        if not workflows_dir.is_dir():
            pytest.skip("pennyfarthing-dist/workflows/ not found")

        report = run(root, fix=False, strict=False)

        # ValidateReport.errors is a list of messages, not a count.
        assert report.errors == [], (
            f"Real workflows have {len(report.errors)} errors after tandem validation:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )


# =============================================================================
# AC5: workflow-status-check subagent reports tandem configuration
# =============================================================================


class TestAC5TandemConfigExtraction:
    """`workflow-status-check` subagent reports tandem configuration."""

    def test_extracts_tandem_config_from_phase(self, tmp_path: Path):
        """get_phase_tandem_config returns tandem dict for tandem-configured phase."""
        # Write a workflow file for the function to discover
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True, exist_ok=True)
        (workflows_dir / "tdd-with-tandem.yaml").write_text(WORKFLOW_WITH_TANDEM)

        result = get_phase_tandem_config(
            "tdd-with-tandem", "red", project_root=tmp_path
        )

        assert result is not None, "Expected tandem config, got None"
        assert result["partner"] == "architect"

    def test_returns_none_for_phase_without_tandem(self, tmp_path: Path):
        """get_phase_tandem_config returns None for phase with no tandem block."""
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True, exist_ok=True)
        (workflows_dir / "plain-tdd.yaml").write_text(WORKFLOW_WITHOUT_TANDEM)

        result = get_phase_tandem_config(
            "plain-tdd", "red", project_root=tmp_path
        )

        assert result is None, f"Expected None for non-tandem phase, got: {result}"

    def test_includes_all_tandem_properties(self, tmp_path: Path):
        """Extracted tandem config includes partner, mode, model, token_budget, triggers."""
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True, exist_ok=True)
        (workflows_dir / "tdd-with-tandem.yaml").write_text(WORKFLOW_WITH_TANDEM)

        result = get_phase_tandem_config(
            "tdd-with-tandem", "red", project_root=tmp_path
        )

        assert result is not None, "Expected tandem config, got None"
        assert "partner" in result, "Missing 'partner' in tandem config"
        assert "mode" in result, "Missing 'mode' in tandem config"
        assert "model" in result, "Missing 'model' in tandem config"
        assert "token_budget" in result, "Missing 'token_budget' in tandem config"
        assert "triggers" in result, "Missing 'triggers' in tandem config"

    def test_returns_none_for_nonexistent_workflow(self, tmp_path: Path):
        """get_phase_tandem_config returns None for nonexistent workflow file."""
        result = get_phase_tandem_config(
            "nonexistent-workflow", "red", project_root=tmp_path
        )

        assert result is None

    def test_returns_none_for_nonexistent_phase(self, tmp_path: Path):
        """get_phase_tandem_config returns None for nonexistent phase name."""
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True, exist_ok=True)
        (workflows_dir / "tdd-with-tandem.yaml").write_text(WORKFLOW_WITH_TANDEM)

        result = get_phase_tandem_config(
            "tdd-with-tandem", "nonexistent-phase", project_root=tmp_path
        )

        assert result is None


# =============================================================================
# Edge Cases
# =============================================================================


class TestTandemEdgeCases:
    """Edge cases and boundary conditions for tandem schema."""

    def test_multiple_phases_with_tandem(self, tmp_path: Path):
        """Workflow with tandem on multiple phases validates each independently."""
        content = dedent("""\
            workflow:
              name: multi-tandem
              phases:
                - name: red
                  agent: tea
                  tandem:
                    partner: architect
                    mode: consultation

                - name: green
                  agent: dev
                  tandem:
                    partner: tea
                    mode: consultation

                - name: review
                  agent: reviewer
                  tandem:
                    partner: pm
                    mode: consultation
        """)
        path = _write_workflow(tmp_path, "multi.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(
            tmp_path, ["tea", "dev", "reviewer", "architect", "pm"]
        )

        errors, _ = validate_phased(data, path, agents_dir)

        tandem_errors = [e for e in errors if "tandem" in e.lower()]
        assert tandem_errors == [], (
            f"Multiple valid tandem blocks should pass, got: {tandem_errors}"
        )

    def test_tandem_empty_dict_is_error(self, tmp_path: Path):
        """Phase with empty tandem: {} produces an error (missing partner)."""
        content = dedent("""\
            workflow:
              name: empty-tandem
              phases:
                - name: green
                  agent: dev
                  tandem: {}
        """)
        path = _write_workflow(tmp_path, "empty-tandem.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "partner" in e.lower() for e in errors
        ), f"Empty tandem should error on missing partner, got: {errors}"

    def test_tandem_with_zero_token_budget_is_error(self, tmp_path: Path):
        """token_budget of 0 is invalid (must be positive)."""
        content = dedent("""\
            workflow:
              name: zero-budget
              phases:
                - name: green
                  agent: dev
                  tandem:
                    partner: architect
                    mode: consultation
                    token_budget: 0
        """)
        path = _write_workflow(tmp_path, "zero-budget.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["dev", "architect"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any(
            "token_budget" in e.lower() or "budget" in e.lower() for e in errors
        ), f"Zero token_budget should be error, got: {errors}"
