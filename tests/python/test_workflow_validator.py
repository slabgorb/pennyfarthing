"""
Tests for Story 91-11: Workflow YAML schema validation.

Covers all 9 Acceptance Criteria:
  AC1: `pf validate workflow` discovers all workflow YAML files
       (root-level *.yaml + subdirectory workflow.yaml in pennyfarthing-dist/workflows/)
  AC2: Common fields validated: workflow.name required, workflow.type enum
  AC3: Phased workflows: phases required, each phase needs name + agent
  AC4: Stepped workflows: steps required (path + pattern), agent required
  AC5: Procedural workflows: agent required, instructions/checklist recommended
  AC6: Agent references cross-checked against agents/*.md file stems
  AC7: --strict promotes warnings to errors; pf validate includes workflow
  AC8: Zero false positives on current develop branch
  AC9: Gate type validation for phased workflows

Run with: python -m pytest tests/python/test_workflow_validator.py -v
"""

from pathlib import Path
from textwrap import dedent

import pytest
import yaml

from pf.validate.adapters.workflow import (
    VALID_GATE_TYPES,
    VALID_TYPES,
    discover_workflow_files,
    run,
    validate_common,
    validate_phased,
    validate_procedural,
    validate_stepped,
)

# =============================================================================
# Test Fixtures — inline YAML strings
# =============================================================================

VALID_PHASED_WORKFLOW = dedent("""\
    workflow:
      name: test-phased
      description: A test phased workflow
      version: "1.0.0"

      phases:
        - name: setup
          agent: sm
          output: [session_file]

        - name: implement
          agent: dev
          input: [session_file]
          output: [implementation]
          gate:
            type: tests_pass
            condition: All tests passing

        - name: review
          agent: reviewer
          input: [implementation]
          gate:
            type: approval

      triggers:
        types: [feature]
        default: true
""")

VALID_STEPPED_WORKFLOW = dedent("""\
    workflow:
      name: test-stepped
      description: A test stepped workflow
      version: "1.0.0"
      type: stepped

      steps:
        path: ./steps/
        pattern: step-{nn}-*.md

      agent: architect

      variables:
        project_root: .
        output_file: artifacts/output.md

      gates:
        after_steps: [2, 4]

      triggers:
        types: [design]
""")

VALID_PROCEDURAL_WORKFLOW = dedent("""\
    workflow:
      name: test-procedural
      description: A test procedural workflow
      version: "1.0.0"
      type: procedural

      agent: pm

      instructions: ./instructions.md
      checklist: ./checklist.md

      variables:
        project_root: .

      triggers:
        types: [brainstorm]
""")


# =============================================================================
# Helpers
# =============================================================================


def _write_workflow(tmp_path: Path, filename: str, content: str) -> Path:
    """Write a workflow YAML file and return its path."""
    workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)

    path = workflows_dir / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def _write_subdirectory_workflow(tmp_path: Path, subdir: str, content: str) -> Path:
    """Write a subdirectory workflow.yaml file and return its path."""
    workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows" / subdir
    workflows_dir.mkdir(parents=True, exist_ok=True)
    path = workflows_dir / "workflow.yaml"
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
# AC1: Discovery — finds root-level *.yaml + subdirectory workflow.yaml
# =============================================================================


class TestAC1Discovery:
    """pf validate workflow discovers all workflow YAML files."""

    def test_discovers_root_level_yaml(self, tmp_path: Path):
        """Root-level .yaml files in workflows/ are discovered."""
        _write_workflow(tmp_path, "tdd.yaml", VALID_PHASED_WORKFLOW)
        _write_workflow(tmp_path, "trivial.yaml", VALID_PHASED_WORKFLOW)
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"

        files = discover_workflow_files(workflows_dir)
        names = {f.name for f in files}

        assert "tdd.yaml" in names
        assert "trivial.yaml" in names

    def test_discovers_subdirectory_workflow_yaml(self, tmp_path: Path):
        """Subdirectory workflow.yaml files are discovered."""
        _write_subdirectory_workflow(tmp_path, "architecture", VALID_STEPPED_WORKFLOW)
        _write_subdirectory_workflow(tmp_path, "brainstorming", VALID_PROCEDURAL_WORKFLOW)
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"

        files = discover_workflow_files(workflows_dir)
        # Should find both subdirectory workflow.yaml files
        assert len(files) >= 2
        parents = {f.parent.name for f in files}
        assert "architecture" in parents
        assert "brainstorming" in parents

    def test_excludes_non_workflow_yaml(self, tmp_path: Path):
        """Non-workflow YAML files (e.g., templates) are excluded."""
        _write_workflow(tmp_path, "tdd.yaml", VALID_PHASED_WORKFLOW)
        # Write a template file that should NOT be discovered
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        subdir = workflows_dir / "sprint-planning"
        subdir.mkdir(parents=True, exist_ok=True)
        (subdir / "sprint-status-template.yaml").write_text("template: true\n")

        files = discover_workflow_files(workflows_dir)
        names = {f.name for f in files}

        assert "sprint-status-template.yaml" not in names

    def test_empty_directory_returns_empty(self, tmp_path: Path):
        """Empty workflows directory returns empty list."""
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True, exist_ok=True)

        files = discover_workflow_files(workflows_dir)

        assert files == []

    def test_run_returns_error_when_no_workflows_dir(self, tmp_path: Path):
        """run() reports error when workflows/ directory is missing."""
        report = run(tmp_path, fix=False, strict=False)

        assert report.errors >= 1
        assert any("not found" in d.lower() or "directory" in d.lower() for d in report.details)


# =============================================================================
# AC2: Common fields — name required, type enum
# =============================================================================


class TestAC2CommonFields:
    """Common fields validated: workflow.name required, workflow.type enum."""

    def test_missing_name_is_error(self, tmp_path: Path):
        """Workflow without name field produces an error."""
        content = dedent("""\
            workflow:
              description: No name field
              phases:
                - name: setup
                  agent: sm
        """)
        path = _write_workflow(tmp_path, "bad.yaml", content)
        data = _parse_workflow(content)

        errors, _ = validate_common(data, path)

        assert any("name" in e.lower() for e in errors)

    def test_valid_name_passes(self, tmp_path: Path):
        """Workflow with valid name produces no name-related errors."""
        path = _write_workflow(tmp_path, "good.yaml", VALID_PHASED_WORKFLOW)
        data = _parse_workflow(VALID_PHASED_WORKFLOW)

        errors, _ = validate_common(data, path)

        assert not any("name" in e.lower() for e in errors)

    def test_invalid_type_is_error(self, tmp_path: Path):
        """Workflow with invalid type produces an error."""
        content = dedent("""\
            workflow:
              name: bad-type
              type: invalid_type
              phases:
                - name: setup
                  agent: sm
        """)
        path = _write_workflow(tmp_path, "bad-type.yaml", content)
        data = _parse_workflow(content)

        errors, _ = validate_common(data, path)

        assert any("type" in e.lower() for e in errors)

    def test_valid_types_accepted(self, tmp_path: Path):
        """All three valid types (phased, stepped, procedural) are accepted."""
        for wtype in VALID_TYPES:
            content = dedent(f"""\
                workflow:
                  name: test-{wtype}
                  type: {wtype}
            """)
            path = _write_workflow(tmp_path, f"test-{wtype}.yaml", content)
            data = _parse_workflow(content)

            errors, _ = validate_common(data, path)

            assert not any("type" in e.lower() for e in errors), f"type={wtype} should be valid"

    def test_missing_type_defaults_to_phased(self, tmp_path: Path):
        """Workflow without explicit type is treated as phased (no type error)."""
        path = _write_workflow(tmp_path, "default.yaml", VALID_PHASED_WORKFLOW)
        data = _parse_workflow(VALID_PHASED_WORKFLOW)

        errors, _ = validate_common(data, path)

        assert not any("type" in e.lower() for e in errors)

    def test_missing_description_is_warning(self, tmp_path: Path):
        """Workflow without description produces a warning."""
        content = dedent("""\
            workflow:
              name: no-desc
              phases:
                - name: setup
                  agent: sm
        """)
        path = _write_workflow(tmp_path, "no-desc.yaml", content)
        data = _parse_workflow(content)

        _, warnings = validate_common(data, path)

        assert any("description" in w.lower() for w in warnings)

    def test_invalid_yaml_structure_is_error(self, tmp_path: Path):
        """YAML without workflow top-level key produces error via run()."""
        content = "name: not-a-workflow\n"
        _write_workflow(tmp_path, "bad-structure.yaml", content)
        _create_agents(tmp_path, ["sm"])

        report = run(tmp_path, fix=False, strict=False)

        assert report.errors >= 1
        assert any("workflow" in d.lower() for d in report.details)


# =============================================================================
# AC3: Phased workflows — phases required, each needs name + agent
# =============================================================================


class TestAC3Phased:
    """Phased workflows: phases required, each phase needs name + agent."""

    def test_valid_phased_passes(self, tmp_path: Path):
        """Valid phased workflow produces no errors."""
        path = _write_workflow(tmp_path, "tdd.yaml", VALID_PHASED_WORKFLOW)
        data = _parse_workflow(VALID_PHASED_WORKFLOW)
        agents_dir = _create_agents(tmp_path, ["sm", "dev", "reviewer"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert errors == []

    def test_missing_phases_is_error(self, tmp_path: Path):
        """Phased workflow without phases array produces an error."""
        content = dedent("""\
            workflow:
              name: no-phases
              description: Missing phases
        """)
        path = _write_workflow(tmp_path, "no-phases.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, [])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any("phases" in e.lower() for e in errors)

    def test_empty_phases_is_error(self, tmp_path: Path):
        """Phased workflow with empty phases array produces an error."""
        content = dedent("""\
            workflow:
              name: empty-phases
              phases: []
        """)
        path = _write_workflow(tmp_path, "empty-phases.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, [])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any("phases" in e.lower() for e in errors)

    def test_phase_missing_name_is_error(self, tmp_path: Path):
        """Phase without name field produces an error."""
        content = dedent("""\
            workflow:
              name: bad-phase
              phases:
                - agent: sm
        """)
        path = _write_workflow(tmp_path, "bad-phase.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["sm"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any("name" in e.lower() for e in errors)

    def test_phase_missing_agent_is_error(self, tmp_path: Path):
        """Phase without agent field produces an error."""
        content = dedent("""\
            workflow:
              name: bad-phase
              phases:
                - name: setup
        """)
        path = _write_workflow(tmp_path, "bad-phase.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, [])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any("agent" in e.lower() for e in errors)

    def test_phases_not_a_list_is_error(self, tmp_path: Path):
        """Phases field that is not a list produces an error."""
        content = dedent("""\
            workflow:
              name: bad-phases-type
              phases:
                setup:
                  agent: sm
        """)
        path = _write_workflow(tmp_path, "bad-phases-type.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, [])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any("phases" in e.lower() for e in errors)


# =============================================================================
# AC4: Stepped workflows — steps required (path + pattern), agent required
# =============================================================================


class TestAC4Stepped:
    """Stepped workflows: steps required (path + pattern), agent required."""

    def test_valid_stepped_passes(self, tmp_path: Path):
        """Valid stepped workflow produces no errors."""
        path = _write_workflow(tmp_path, "arch.yaml", VALID_STEPPED_WORKFLOW)
        data = _parse_workflow(VALID_STEPPED_WORKFLOW)
        agents_dir = _create_agents(tmp_path, ["architect"])

        errors, _ = validate_stepped(data, path, agents_dir)

        assert errors == []

    def test_missing_steps_is_error(self, tmp_path: Path):
        """Stepped workflow without steps section produces an error."""
        content = dedent("""\
            workflow:
              name: no-steps
              type: stepped
              agent: architect
        """)
        path = _write_workflow(tmp_path, "no-steps.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["architect"])

        errors, _ = validate_stepped(data, path, agents_dir)

        assert any("steps" in e.lower() for e in errors)

    def test_missing_steps_path_is_error(self, tmp_path: Path):
        """Stepped workflow steps without path produces an error."""
        content = dedent("""\
            workflow:
              name: no-path
              type: stepped
              agent: architect
              steps:
                pattern: step-*.md
        """)
        path = _write_workflow(tmp_path, "no-path.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["architect"])

        errors, _ = validate_stepped(data, path, agents_dir)

        assert any("path" in e.lower() for e in errors)

    def test_missing_steps_pattern_is_error(self, tmp_path: Path):
        """Stepped workflow steps without pattern produces an error."""
        content = dedent("""\
            workflow:
              name: no-pattern
              type: stepped
              agent: architect
              steps:
                path: ./steps/
        """)
        path = _write_workflow(tmp_path, "no-pattern.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["architect"])

        errors, _ = validate_stepped(data, path, agents_dir)

        assert any("pattern" in e.lower() for e in errors)

    def test_missing_agent_is_error(self, tmp_path: Path):
        """Stepped workflow without top-level agent produces an error."""
        content = dedent("""\
            workflow:
              name: no-agent
              type: stepped
              steps:
                path: ./steps/
                pattern: step-*.md
        """)
        path = _write_workflow(tmp_path, "no-agent.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, [])

        errors, _ = validate_stepped(data, path, agents_dir)

        assert any("agent" in e.lower() for e in errors)


# =============================================================================
# AC5: Procedural workflows — agent required, instructions/checklist recommended
# =============================================================================


class TestAC5Procedural:
    """Procedural workflows: agent required, instructions/checklist recommended."""

    def test_valid_procedural_passes(self, tmp_path: Path):
        """Valid procedural workflow produces no errors."""
        path = _write_workflow(tmp_path, "brainstorm.yaml", VALID_PROCEDURAL_WORKFLOW)
        data = _parse_workflow(VALID_PROCEDURAL_WORKFLOW)
        agents_dir = _create_agents(tmp_path, ["pm"])

        errors, _ = validate_procedural(data, path, agents_dir)

        assert errors == []

    def test_missing_agent_is_error(self, tmp_path: Path):
        """Procedural workflow without agent produces an error."""
        content = dedent("""\
            workflow:
              name: no-agent
              type: procedural
              instructions: ./instructions.md
        """)
        path = _write_workflow(tmp_path, "no-agent.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, [])

        errors, _ = validate_procedural(data, path, agents_dir)

        assert any("agent" in e.lower() for e in errors)

    def test_missing_instructions_and_checklist_is_warning(self, tmp_path: Path):
        """Procedural workflow without instructions or checklist produces a warning."""
        content = dedent("""\
            workflow:
              name: bare-procedural
              type: procedural
              agent: pm
        """)
        path = _write_workflow(tmp_path, "bare.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["pm"])

        _, warnings = validate_procedural(data, path, agents_dir)

        assert any("instructions" in w.lower() or "checklist" in w.lower() for w in warnings)

    def test_has_instructions_no_warning(self, tmp_path: Path):
        """Procedural workflow with instructions but no checklist produces no warning."""
        content = dedent("""\
            workflow:
              name: with-instructions
              type: procedural
              agent: pm
              instructions: ./instructions.md
        """)
        path = _write_workflow(tmp_path, "with-inst.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["pm"])

        _, warnings = validate_procedural(data, path, agents_dir)

        assert not any("instructions" in w.lower() and "checklist" in w.lower() for w in warnings)


# =============================================================================
# AC6: Agent cross-references — agent values verified against agents/*.md
# =============================================================================


class TestAC6AgentCrossRef:
    """Agent references cross-checked against agents/*.md file stems."""

    def test_valid_agent_ref_passes(self, tmp_path: Path):
        """Phase referencing an existing agent file produces no errors."""
        path = _write_workflow(tmp_path, "good-ref.yaml", VALID_PHASED_WORKFLOW)
        data = _parse_workflow(VALID_PHASED_WORKFLOW)
        agents_dir = _create_agents(tmp_path, ["sm", "dev", "reviewer"])

        errors, warnings = validate_phased(data, path, agents_dir)

        assert not any("agent" in e.lower() and "not found" in e.lower() for e in errors)
        assert not any("agent" in w.lower() and "not found" in w.lower() for w in warnings)

    def test_unknown_agent_in_phase_is_warning(self, tmp_path: Path):
        """Phase referencing a non-existent agent file produces a warning."""
        content = dedent("""\
            workflow:
              name: bad-agent-ref
              phases:
                - name: setup
                  agent: nonexistent_agent
        """)
        path = _write_workflow(tmp_path, "bad-ref.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["sm", "dev"])

        _, warnings = validate_phased(data, path, agents_dir)

        assert any("nonexistent_agent" in w for w in warnings)

    def test_unknown_agent_in_stepped_is_warning(self, tmp_path: Path):
        """Stepped workflow referencing a non-existent agent produces a warning."""
        content = dedent("""\
            workflow:
              name: bad-stepped-agent
              type: stepped
              agent: ghost_agent
              steps:
                path: ./steps/
                pattern: step-*.md
        """)
        path = _write_workflow(tmp_path, "bad-stepped.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["sm", "dev"])

        _, warnings = validate_stepped(data, path, agents_dir)

        assert any("ghost_agent" in w for w in warnings)

    def test_unknown_agent_in_procedural_is_warning(self, tmp_path: Path):
        """Procedural workflow referencing a non-existent agent produces a warning."""
        content = dedent("""\
            workflow:
              name: bad-proc-agent
              type: procedural
              agent: phantom_agent
              instructions: ./instructions.md
        """)
        path = _write_workflow(tmp_path, "bad-proc.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["sm", "dev"])

        _, warnings = validate_procedural(data, path, agents_dir)

        assert any("phantom_agent" in w for w in warnings)


# =============================================================================
# AC7: --strict and CLI registration
# =============================================================================


class TestAC7StrictAndCLI:
    """--strict promotes warnings to errors; pf validate includes workflow."""

    def test_strict_promotes_warnings_to_errors(self, tmp_path: Path):
        """With strict=True, warnings become errors."""
        # Create a procedural workflow missing instructions (normally a warning)
        content = dedent("""\
            workflow:
              name: bare-procedural
              type: procedural
              agent: pm
        """)
        _write_subdirectory_workflow(tmp_path, "bare", content)
        _create_agents(tmp_path, ["pm"])

        report = run(tmp_path, fix=False, strict=True)

        # In strict mode, warnings should be promoted to errors
        assert report.errors >= 1
        assert any("[ERROR]" in d for d in report.details)

    def test_non_strict_keeps_warnings(self, tmp_path: Path):
        """Without strict, warnings remain as warnings."""
        content = dedent("""\
            workflow:
              name: bare-procedural
              type: procedural
              agent: pm
        """)
        _write_subdirectory_workflow(tmp_path, "bare", content)
        _create_agents(tmp_path, ["pm"])

        report = run(tmp_path, fix=False, strict=False)

        assert report.warnings >= 1
        assert any("[WARN]" in d for d in report.details)

    def test_cli_registration(self):
        """workflow is registered in VALIDATORS dict."""
        from pf.validate.cli import VALIDATORS

        assert "workflow" in VALIDATORS

    def test_run_includes_all_variants(self, tmp_path: Path):
        """run() validates phased, stepped, and procedural workflows."""
        _write_workflow(tmp_path, "tdd.yaml", VALID_PHASED_WORKFLOW)
        _write_subdirectory_workflow(tmp_path, "arch", VALID_STEPPED_WORKFLOW)
        _write_subdirectory_workflow(tmp_path, "brainstorm", VALID_PROCEDURAL_WORKFLOW)
        _create_agents(tmp_path, ["sm", "dev", "reviewer", "architect", "pm"])

        report = run(tmp_path, fix=False, strict=False)

        # All 3 valid workflows should pass
        assert report.passed >= 3
        assert report.errors == 0


# =============================================================================
# AC8: Zero false positives on real workflow files
# =============================================================================


class TestAC8RealWorkflows:
    """Zero false positives on current develop branch workflow files."""

    def test_all_real_workflows_pass(self):
        """All workflow files in pennyfarthing-dist/workflows/ pass validation."""
        # Use actual project root
        root = Path(__file__).resolve().parents[2]
        workflows_dir = root / "pennyfarthing-dist" / "workflows"

        if not workflows_dir.is_dir():
            pytest.skip("pennyfarthing-dist/workflows/ not found (not in repo)")

        report = run(root, fix=False, strict=False)

        assert report.errors == 0, (
            f"Real workflow files have {report.errors} errors:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )

    def test_real_workflow_count(self):
        """Expected number of workflow files are discovered."""
        root = Path(__file__).resolve().parents[2]
        workflows_dir = root / "pennyfarthing-dist" / "workflows"

        if not workflows_dir.is_dir():
            pytest.skip("pennyfarthing-dist/workflows/ not found (not in repo)")

        files = discover_workflow_files(workflows_dir)

        # Should find at least 20 workflow files (currently 25)
        assert len(files) >= 20, f"Expected >= 20 workflow files, found {len(files)}"


# =============================================================================
# AC9: Gate type validation for phased workflows
# =============================================================================


class TestAC9GateTypes:
    """Gate type validation for phased workflows."""

    def test_valid_gate_type_passes(self, tmp_path: Path):
        """Known gate types produce no errors."""
        path = _write_workflow(tmp_path, "good-gate.yaml", VALID_PHASED_WORKFLOW)
        data = _parse_workflow(VALID_PHASED_WORKFLOW)
        agents_dir = _create_agents(tmp_path, ["sm", "dev", "reviewer"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert not any("gate" in e.lower() and "type" in e.lower() for e in errors)

    def test_invalid_gate_type_is_warning(self, tmp_path: Path):
        """Unknown gate type produces a warning."""
        content = dedent("""\
            workflow:
              name: bad-gate
              phases:
                - name: setup
                  agent: sm
                  gate:
                    type: nonexistent_gate_type
        """)
        path = _write_workflow(tmp_path, "bad-gate.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["sm"])

        _, warnings = validate_phased(data, path, agents_dir)

        assert any("nonexistent_gate_type" in w for w in warnings)

    def test_gate_without_type_is_error(self, tmp_path: Path):
        """Gate section without type field produces an error."""
        content = dedent("""\
            workflow:
              name: no-gate-type
              phases:
                - name: setup
                  agent: sm
                  gate:
                    condition: Something
        """)
        path = _write_workflow(tmp_path, "no-gate-type.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["sm"])

        errors, _ = validate_phased(data, path, agents_dir)

        assert any("gate" in e.lower() and "type" in e.lower() for e in errors)

    def test_all_valid_gate_types_accepted(self, tmp_path: Path):
        """Every gate type in VALID_GATE_TYPES is accepted without warnings."""
        agents_dir = _create_agents(tmp_path, ["sm"])

        for gate_type in VALID_GATE_TYPES:
            content = dedent(f"""\
                workflow:
                  name: gate-{gate_type}
                  phases:
                    - name: setup
                      agent: sm
                      gate:
                        type: {gate_type}
            """)
            path = _write_workflow(tmp_path, f"gate-{gate_type}.yaml", content)
            data = _parse_workflow(content)

            errors, warnings = validate_phased(data, path, agents_dir)

            assert not any(gate_type in w for w in warnings), (
                f"gate type '{gate_type}' should be valid"
            )
            assert not any("gate" in e.lower() and "type" in e.lower() for e in errors), (
                f"gate type '{gate_type}' should not produce errors"
            )


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_yaml_parse_error_is_error(self, tmp_path: Path):
        """Malformed YAML produces an error, not a crash."""
        content = "workflow:\n  name: bad\n  phases:\n    - [invalid yaml structure"
        _write_workflow(tmp_path, "malformed.yaml", content)
        _create_agents(tmp_path, [])

        report = run(tmp_path, fix=False, strict=False)

        # Should handle gracefully — report error, not crash
        assert report.errors >= 1

    def test_workflow_key_is_not_dict(self, tmp_path: Path):
        """workflow key that isn't a dict produces an error."""
        content = "workflow: just-a-string\n"
        _write_workflow(tmp_path, "string.yaml", content)
        _create_agents(tmp_path, [])

        report = run(tmp_path, fix=False, strict=False)

        assert report.errors >= 1

    def test_mixed_valid_and_invalid(self, tmp_path: Path):
        """Report correctly tallies mixed valid and invalid workflows."""
        _write_workflow(tmp_path, "good.yaml", VALID_PHASED_WORKFLOW)
        bad_content = dedent("""\
            workflow:
              description: Missing name
              phases:
                - name: setup
                  agent: sm
        """)
        _write_workflow(tmp_path, "bad.yaml", bad_content)
        _create_agents(tmp_path, ["sm", "dev", "reviewer"])

        report = run(tmp_path, fix=False, strict=False)

        assert report.passed >= 1
        assert report.errors >= 1

    def test_report_format_uses_error_prefix(self, tmp_path: Path):
        """Error details use [ERROR] prefix format."""
        content = dedent("""\
            workflow:
              description: No name
        """)
        _write_workflow(tmp_path, "bad.yaml", content)
        _create_agents(tmp_path, [])

        report = run(tmp_path, fix=False, strict=False)

        error_details = [d for d in report.details if "[ERROR]" in d]
        assert len(error_details) >= 1

    def test_report_format_uses_warn_prefix(self, tmp_path: Path):
        """Warning details use [WARN] prefix format."""
        content = dedent("""\
            workflow:
              name: no-desc
              type: procedural
              agent: pm
        """)
        _write_subdirectory_workflow(tmp_path, "test", content)
        _create_agents(tmp_path, ["pm"])

        report = run(tmp_path, fix=False, strict=False)

        warn_details = [d for d in report.details if "[WARN]" in d]
        assert len(warn_details) >= 1

    def test_duplicate_phase_names_is_warning(self, tmp_path: Path):
        """Phased workflow with duplicate phase names produces a warning."""
        content = dedent("""\
            workflow:
              name: dup-phases
              phases:
                - name: setup
                  agent: sm
                - name: setup
                  agent: dev
        """)
        path = _write_workflow(tmp_path, "dup.yaml", content)
        data = _parse_workflow(content)
        agents_dir = _create_agents(tmp_path, ["sm", "dev"])

        _, warnings = validate_phased(data, path, agents_dir)

        assert any("duplicate" in w.lower() for w in warnings)
