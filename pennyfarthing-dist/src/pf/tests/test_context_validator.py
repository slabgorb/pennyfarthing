"""Tests for context validator module.

Story: PROJ-15683 (129-3) — Build Context Validator Python Module and CLI

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. Python module validates context YAML against schema
2. CLI command `pf context validate <file>` available
3. Validates all context fields against PROJ-15682 schema
4. Reports validation errors with helpful messages
5. Integrated into pre-commit hooks (pf validate context)
6. Full test coverage with pytest
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from click.testing import CliRunner

from pf.context import ContextValidationResult, ValidationError
from pf.context.cli import context
from pf.context.validator import (
    load_schema,
    validate_component,
    validate_context_file,
    validate_context_sources,
    validate_tier_components,
)
from pf.validate import ValidateReport

# =============================================================================
# Test Data — Sample Context Documents
# =============================================================================

# The real schema lives at pennyfarthing-dist/schemas/context-schema.yaml.
# Tests use the real schema file when possible, fixtures for isolation.

VALID_WORKFLOW_STATE = {
    "state": "IN_PROGRESS_STATE",
    "story_id": "129-3",
    "phase": "red",
    "phase_owner": "tea",
    "workflow": "tdd",
    "backlog_count": 9,
}

INVALID_WORKFLOW_STATE_BAD_ENUM = {
    "state": "INVALID_STATE",
    "story_id": "129-3",
    "phase": "red",
    "phase_owner": "tea",
}

INVALID_WORKFLOW_STATE_MISSING_REQUIRED = {
    "story_id": "129-3",
    "phase": "red",
}

INVALID_WORKFLOW_STATE_BAD_OWNER = {
    "state": "IN_PROGRESS_STATE",
    "phase_owner": "invalid_agent",
}

VALID_AGENT_DEFINITION = """\
# SM Agent - Scrum Master
<role>
Story coordination, session management, workflow entry/exit
</role>

<critical>
No code. Coordinates workflow and stories.
</critical>

<helpers>
**Model:** haiku | **Execution:** foreground (sequential)

| Subagent | Purpose |
|----------|---------|
| `sm-setup` | Story setup |
</helpers>

<workflow>
## Primary Workflow
1. Read story from session file
2. Run exit protocol
</workflow>

<exit>
1. Write assessment to session
2. Run handoff
</exit>
"""

SHORT_AGENT_DEFINITION = "# Agent\n<role>Short</role>\n"

AGENT_DEFINITION_MISSING_ROLE = """\
# SM Agent
<critical>
Some critical stuff here that is long enough to pass min_length.
More content to pad out the length requirement for validation.
More content to pad out the length requirement for validation.
More content to pad out the length requirement for validation.
</critical>
"""

VALID_BEHAVIOR_GUIDE = """\
# Agent Behavior Guide

<critical>
Session file: `.session/{story-id}-session.md`
Tests: Use `testing-runner` subagent, never run directly.
Handoff: Run `pf handoff resolve-gate` then `pf handoff complete-phase`.
</critical>

More content for the behavior guide that makes it long enough to pass
the minimum length requirement of 500 characters. This guide contains
essential protocol information for all agents in the system. Each agent
must follow these guidelines strictly.

Additional content to reach the minimum length threshold. The behavior
guide is shared across all agents and defines common protocols for
handoff, testing, and session management.

<agent-exit-protocol>
## Exit Protocol
1. Write assessment to session
2. Run resolve-gate
3. Run complete-phase
4. Run marker
</agent-exit-protocol>
"""

BEHAVIOR_GUIDE_MISSING_SECTION = """\
# Agent Behavior Guide

<critical>
Session file management and testing protocols.
More content to pad out the length requirement for validation.
More content to pad out the length requirement for validation.
More content to pad out the length requirement for validation.
More content to pad out the length requirement for validation.
More content to pad out the length requirement for validation.
More content to pad out the length requirement for validation.
</critical>
"""

VALID_SPRINT_CONTEXT = "Sprint 2608: Installation, agents and workflows\nProgress: 15/59 points"

INVALID_SPRINT_CONTEXT = "Current work: doing stuff"

VALID_SESSION_ASSESSMENT = """\
## TEA Assessment

**Tests Required:** Yes
**Test Files:** tests/test_context.py
**Tests Written:** 5 tests covering 3 ACs
**Status:** RED (failing - ready for Dev)
"""

INVALID_SESSION_ASSESSMENT = "Some notes about what happened"

VALID_CONTEXT_DOCUMENT = """\
tier: FULL
agent: sm
components:
  workflow_state:
    state: IN_PROGRESS_STATE
    story_id: "129-3"
    phase: red
    phase_owner: tea
    workflow: tdd
  agent_definition: |
    # SM Agent - Scrum Master
    <role>
    Story coordination, session management, workflow entry/exit
    </role>
    <critical>
    No code. Coordinates workflow and stories. Handoff to Dev for implementation.
    SM reads sprint YAML, creates sessions, routes to the correct agent.
    </critical>
    <helpers>
    **Model:** haiku
    </helpers>
    <workflow>
    Read story, check phase, handoff to the next agent in the workflow.
    </workflow>
    <exit>
    Write assessment, run resolve-gate, complete-phase, marker.
    </exit>
  behavior_guide: |
    # Agent Behavior Guide
    <critical>
    Session file: .session/{story-id}-session.md - read Phase, Workflow, Repos.
    Tests: Use testing-runner subagent, never run directly.
    Handoff: Run pf handoff resolve-gate then pf handoff complete-phase then
    pf handoff marker. Scripts: Pennyfarthing scripts are Python-based (pf/),
    not shell. Check before assuming .sh extension.
    </critical>
    This is the shared agent behavior guide. It defines common protocols for
    all agents in the Pennyfarthing system. Every agent must follow these
    guidelines for handoff, testing, and session management. The guide is
    loaded as part of the FULL context tier on new sessions. Additional text
    to reach the minimum 500 character length requirement for the behavior
    guide validation rule. More padding content here to ensure the validator
    accepts this as a properly formed guide document. The behavior guide is
    critical infrastructure shared across all agents.
    <agent-exit-protocol>
    1. Write assessment to session
    2. pf handoff resolve-gate
    3. pf handoff complete-phase
    4. pf handoff marker
    </agent-exit-protocol>
  sprint_context: "Sprint 2608: Installation, agents and workflows"
  repos_topology: |
    ## orchestrator
    Path: .
    Type: orchestrator
  session_header: |
    **Story:** 129-3
    **Workflow:** tdd
    **Phase:** red
  session_assessment: |
    ## TEA Assessment
    **Tests Required:** Yes
    **Test Files:** tests/test_context.py
  sidecars:
    patterns.md: '<pattern name="test">Test pattern content</pattern>'
"""

CONTEXT_DOCUMENT_MISSING_REQUIRED = """\
tier: FULL
agent: sm
components:
  sprint_context: "Sprint 2608: stuff"
"""


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def schema_path() -> Path:
    """Return path to the real context schema file."""
    return Path(__file__).resolve().parents[3] / "schemas" / "context-schema.yaml"


@pytest.fixture
def schema(schema_path: Path) -> dict:
    """Load the real context schema."""
    return yaml.safe_load(schema_path.read_text())


@pytest.fixture
def valid_context_file(tmp_path: Path) -> Path:
    """Create a valid context YAML file."""
    p = tmp_path / "context.yaml"
    p.write_text(VALID_CONTEXT_DOCUMENT)
    return p


@pytest.fixture
def invalid_context_file(tmp_path: Path) -> Path:
    """Create a context file missing required components."""
    p = tmp_path / "context-bad.yaml"
    p.write_text(CONTEXT_DOCUMENT_MISSING_REQUIRED)
    return p


@pytest.fixture
def runner() -> CliRunner:
    """Create a Click test runner."""
    return CliRunner()


# =============================================================================
# AC1: Python module validates context YAML against schema
# =============================================================================


class TestSchemaLoading:
    """load_schema must load and parse the context schema."""

    def test_load_schema_returns_dict(self, schema_path: Path) -> None:
        """Schema file should load as a non-empty dict."""
        result = load_schema(schema_path)

        assert isinstance(result, dict)
        assert len(result) > 0

    def test_schema_has_tiers(self, schema_path: Path) -> None:
        """Loaded schema should contain tier definitions."""
        result = load_schema(schema_path)

        assert "tiers" in result
        assert "FULL" in result["tiers"]
        assert "REFRESH" in result["tiers"]
        assert "HANDOFF" in result["tiers"]
        assert "MINIMAL" in result["tiers"]

    def test_schema_has_components(self, schema_path: Path) -> None:
        """Loaded schema should contain component definitions."""
        result = load_schema(schema_path)

        assert "components" in result
        assert "workflow_state" in result["components"]
        assert "agent_definition" in result["components"]
        assert "behavior_guide" in result["components"]

    def test_schema_has_assembly_order(self, schema_path: Path) -> None:
        """Loaded schema should contain assembly order."""
        result = load_schema(schema_path)

        assert "assembly_order" in result
        assert isinstance(result["assembly_order"], list)
        assert len(result["assembly_order"]) > 0

    def test_load_nonexistent_schema_raises(self, tmp_path: Path) -> None:
        """Loading a nonexistent schema should raise FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            load_schema(tmp_path / "nonexistent.yaml")

    def test_load_invalid_yaml_raises(self, tmp_path: Path) -> None:
        """Loading invalid YAML should raise an appropriate error."""
        bad = tmp_path / "bad-schema.yaml"
        bad.write_text("{{invalid yaml content: [unclosed")

        with pytest.raises((yaml.YAMLError, ValueError)):
            load_schema(bad)


# =============================================================================
# AC3: Validates all context fields against PROJ-15682 schema
# =============================================================================


class TestWorkflowStateValidation:
    """validate_component must validate workflow_state enum values."""

    def test_valid_workflow_state(self, schema: dict) -> None:
        """Valid workflow_state should produce no errors."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component("workflow_state", VALID_WORKFLOW_STATE, rules)

        assert len(errors) == 0

    def test_invalid_state_enum(self, schema: dict) -> None:
        """Invalid state enum value should produce an error."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component("workflow_state", INVALID_WORKFLOW_STATE_BAD_ENUM, rules)

        assert len(errors) > 0
        assert any("state" in e.field_path or "state" in e.message.lower() for e in errors)

    def test_missing_required_state_field(self, schema: dict) -> None:
        """Missing required 'state' field should produce an error."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component(
            "workflow_state", INVALID_WORKFLOW_STATE_MISSING_REQUIRED, rules
        )

        assert len(errors) > 0
        assert any("state" in e.message.lower() or "required" in e.message.lower() for e in errors)

    def test_invalid_phase_owner_enum(self, schema: dict) -> None:
        """Invalid phase_owner value should produce an error."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component("workflow_state", INVALID_WORKFLOW_STATE_BAD_OWNER, rules)

        assert len(errors) > 0
        assert any(
            "phase_owner" in e.field_path or "phase_owner" in e.message.lower() for e in errors
        )

    def test_all_valid_state_enums_accepted(self, schema: dict) -> None:
        """All defined state enum values should be accepted."""
        rules = schema["components"]["workflow_state"]
        valid_states = [
            "NEW_WORK_STATE",
            "IN_PROGRESS_STATE",
            "FINISH_STATE",
            "EMPTY_BACKLOG_STATE",
        ]

        for state in valid_states:
            data = {"state": state}
            errors = validate_component("workflow_state", data, rules)
            enum_errors = [
                e for e in errors if "state" in e.field_path and "enum" in e.message.lower()
            ]
            assert len(enum_errors) == 0, f"Valid state '{state}' was rejected"


class TestAgentDefinitionValidation:
    """validate_component must validate agent_definition content."""

    def test_valid_agent_definition(self, schema: dict) -> None:
        """Valid agent definition should produce no errors."""
        rules = schema["components"]["agent_definition"]
        errors = validate_component("agent_definition", VALID_AGENT_DEFINITION, rules)

        assert len(errors) == 0

    def test_too_short_agent_definition(self, schema: dict) -> None:
        """Agent definition below min_length should produce an error."""
        rules = schema["components"]["agent_definition"]
        errors = validate_component("agent_definition", SHORT_AGENT_DEFINITION, rules)

        assert len(errors) > 0
        assert any("length" in e.message.lower() or "min" in e.message.lower() for e in errors)

    def test_missing_role_section(self, schema: dict) -> None:
        """Agent definition missing <role> section should produce an error."""
        rules = schema["components"]["agent_definition"]
        errors = validate_component("agent_definition", AGENT_DEFINITION_MISSING_ROLE, rules)

        assert len(errors) > 0
        assert any("role" in e.message.lower() for e in errors)


class TestBehaviorGuideValidation:
    """validate_component must validate behavior_guide content."""

    def test_valid_behavior_guide(self, schema: dict) -> None:
        """Valid behavior guide should produce no errors."""
        rules = schema["components"]["behavior_guide"]
        errors = validate_component("behavior_guide", VALID_BEHAVIOR_GUIDE, rules)

        assert len(errors) == 0

    def test_short_behavior_guide(self, schema: dict) -> None:
        """Behavior guide below min_length (500) should produce an error."""
        rules = schema["components"]["behavior_guide"]
        errors = validate_component("behavior_guide", "Short guide.", rules)

        assert len(errors) > 0
        assert any("length" in e.message.lower() or "min" in e.message.lower() for e in errors)

    def test_missing_critical_section(self, schema: dict) -> None:
        """Behavior guide missing <critical> should produce an error."""
        rules = schema["components"]["behavior_guide"]
        # Long enough but missing <critical>
        content = "x" * 600 + "\n<agent-exit-protocol>\nExit steps\n</agent-exit-protocol>"
        errors = validate_component("behavior_guide", content, rules)

        assert len(errors) > 0
        assert any("critical" in e.message.lower() for e in errors)

    def test_missing_exit_protocol_section(self, schema: dict) -> None:
        """Behavior guide missing <agent-exit-protocol> should produce an error."""
        rules = schema["components"]["behavior_guide"]
        content = BEHAVIOR_GUIDE_MISSING_SECTION
        errors = validate_component("behavior_guide", content, rules)

        assert len(errors) > 0
        assert any("exit" in e.message.lower() or "protocol" in e.message.lower() for e in errors)


class TestSprintContextValidation:
    """validate_component must validate sprint_context pattern."""

    def test_valid_sprint_context(self, schema: dict) -> None:
        """Valid sprint context matching pattern should produce no errors."""
        rules = schema["components"]["sprint_context"]
        errors = validate_component("sprint_context", VALID_SPRINT_CONTEXT, rules)

        assert len(errors) == 0

    def test_invalid_sprint_context_pattern(self, schema: dict) -> None:
        """Sprint context not matching 'Sprint N:' pattern should produce an error."""
        rules = schema["components"]["sprint_context"]
        errors = validate_component("sprint_context", INVALID_SPRINT_CONTEXT, rules)

        assert len(errors) > 0
        assert any("pattern" in e.message.lower() or "sprint" in e.message.lower() for e in errors)


class TestReposTopologyValidation:
    """validate_component must validate repos_topology required_fields."""

    def test_valid_repos_topology(self, schema: dict) -> None:
        """Repos topology with required fields should produce no errors."""
        rules = schema["components"]["repos_topology"]
        content = "## orchestrator\nPath: .\nType: orchestrator\n"
        errors = validate_component("repos_topology", content, rules)

        # Should have no errors for required fields
        error_msgs = [e for e in errors if e.severity == "error"]
        assert len(error_msgs) == 0

    def test_missing_path_field(self, schema: dict) -> None:
        """Repos topology missing 'path' field should produce an error."""
        rules = schema["components"]["repos_topology"]
        content = "## orchestrator\nType: orchestrator\n"
        errors = validate_component("repos_topology", content, rules)

        assert len(errors) > 0
        assert any("path" in e.message.lower() for e in errors)

    def test_missing_type_field(self, schema: dict) -> None:
        """Repos topology missing 'type' field should produce an error."""
        rules = schema["components"]["repos_topology"]
        content = "## orchestrator\nPath: .\n"
        errors = validate_component("repos_topology", content, rules)

        assert len(errors) > 0
        assert any("type" in e.message.lower() for e in errors)


class TestSessionAssessmentValidation:
    """validate_component must validate session_assessment pattern."""

    def test_valid_session_assessment(self, schema: dict) -> None:
        """Valid assessment matching pattern should produce no errors."""
        rules = schema["components"]["session_assessment"]
        errors = validate_component("session_assessment", VALID_SESSION_ASSESSMENT, rules)

        assert len(errors) == 0

    def test_invalid_assessment_pattern(self, schema: dict) -> None:
        """Assessment not matching '## X Assessment' should produce an error."""
        rules = schema["components"]["session_assessment"]
        errors = validate_component("session_assessment", INVALID_SESSION_ASSESSMENT, rules)

        assert len(errors) > 0
        assert any(
            "pattern" in e.message.lower() or "assessment" in e.message.lower() for e in errors
        )


class TestSidecarValidation:
    """validate_component must validate sidecar collection items."""

    def test_valid_sidecar_patterns(self, schema: dict) -> None:
        """Sidecar with valid <pattern> tags should produce no errors."""
        rules = schema["components"]["sidecars"]
        content = {
            "patterns.md": '<pattern name="test">Test pattern</pattern>',
        }
        errors = validate_component("sidecars", content, rules)

        error_msgs = [e for e in errors if e.severity == "error"]
        assert len(error_msgs) == 0

    def test_sidecar_missing_recommended_tags(self, schema: dict) -> None:
        """Sidecar without recommended tags should produce warnings."""
        rules = schema["components"]["sidecars"]
        content = {
            "patterns.md": "Just some text without pattern tags.",
        }
        errors = validate_component("sidecars", content, rules)

        warnings = [e for e in errors if e.severity == "warning"]
        assert len(warnings) > 0


# =============================================================================
# AC3 (continued): Tier-based validation
# =============================================================================


class TestTierValidation:
    """validate_tier_components must validate tier requirements."""

    def test_full_tier_requires_all_components(self, schema: dict) -> None:
        """FULL tier should require workflow_state, agent_definition, behavior_guide."""
        components: dict[str, str | dict] = {
            "workflow_state": VALID_WORKFLOW_STATE,
        }
        result = validate_tier_components(components, schema, "FULL")

        assert not result.valid
        assert result.tier == "FULL"
        # Should report missing required components
        missing_names = [e.component for e in result.errors]
        assert "agent_definition" in missing_names or any(
            "agent_definition" in e.message for e in result.errors
        )

    def test_minimal_tier_only_requires_workflow_state(self, schema: dict) -> None:
        """MINIMAL tier should only require workflow_state."""
        components: dict[str, str | dict] = {
            "workflow_state": VALID_WORKFLOW_STATE,
        }
        result = validate_tier_components(components, schema, "MINIMAL")

        assert result.valid
        assert result.components_checked >= 1

    def test_refresh_tier_components(self, schema: dict) -> None:
        """REFRESH tier should require workflow_state, sprint_context, repos_topology, session_header."""
        # Only provide workflow_state — missing others
        components: dict[str, str | dict] = {
            "workflow_state": VALID_WORKFLOW_STATE,
        }
        result = validate_tier_components(components, schema, "REFRESH")

        # sprint_context, repos_topology, session_header are in REFRESH
        # but they're not marked required=true in schema (only workflow_state and
        # agent_definition are required), so this depends on implementation.
        # At minimum, components_checked should reflect what was validated.
        assert result.components_checked >= 1

    def test_invalid_tier_name(self, schema: dict) -> None:
        """Invalid tier name should raise ValueError."""
        with pytest.raises(ValueError):
            validate_tier_components({}, schema, "NONEXISTENT_TIER")

    def test_valid_full_tier(self, schema: dict) -> None:
        """Full tier with all valid components should pass."""
        components: dict[str, str | dict] = {
            "workflow_state": VALID_WORKFLOW_STATE,
            "agent_definition": VALID_AGENT_DEFINITION,
            "persona": "Character: Leeloo\nStyle: Supreme being\nRole: TEA\n",
            "behavior_guide": VALID_BEHAVIOR_GUIDE,
            "sprint_context": VALID_SPRINT_CONTEXT,
            "repos_topology": "## orchestrator\nPath: .\nType: orchestrator\n",
            "session_header": "**Story:** 129-3\n**Workflow:** tdd\n**Phase:** red\n",
            "session_assessment": VALID_SESSION_ASSESSMENT,
            "sidecars": {"patterns.md": '<pattern name="test">x</pattern>'},
        }
        result = validate_tier_components(components, schema, "FULL")

        assert result.valid
        assert result.components_checked == 9


# =============================================================================
# AC1: File-level validation
# =============================================================================


class TestContextFileValidation:
    """validate_context_file must validate YAML context files."""

    def test_valid_file_passes(self, valid_context_file: Path, schema_path: Path) -> None:
        """Valid context file should pass validation."""
        result = validate_context_file(valid_context_file, schema_path)

        assert result.valid
        assert len(result.errors) == 0

    def test_invalid_file_fails(self, invalid_context_file: Path, schema_path: Path) -> None:
        """Context file missing required components should fail."""
        result = validate_context_file(invalid_context_file, schema_path)

        assert not result.valid
        assert len(result.errors) > 0

    def test_nonexistent_file(self, tmp_path: Path) -> None:
        """Nonexistent file should raise FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            validate_context_file(tmp_path / "nonexistent.yaml")

    def test_invalid_yaml_file(self, tmp_path: Path) -> None:
        """Invalid YAML should produce errors."""
        bad = tmp_path / "bad.yaml"
        bad.write_text("{{invalid: [yaml content")

        result = validate_context_file(bad)

        assert not result.valid
        assert len(result.errors) > 0

    def test_empty_file(self, tmp_path: Path) -> None:
        """Empty file should produce errors."""
        empty = tmp_path / "empty.yaml"
        empty.write_text("")

        result = validate_context_file(empty)

        assert not result.valid

    def test_result_includes_tier(self, valid_context_file: Path, schema_path: Path) -> None:
        """Result should include the tier from the document."""
        result = validate_context_file(valid_context_file, schema_path)

        assert result.tier == "FULL"

    def test_result_includes_component_count(
        self, valid_context_file: Path, schema_path: Path
    ) -> None:
        """Result should count how many components were checked."""
        result = validate_context_file(valid_context_file, schema_path)

        assert result.components_checked > 0


# =============================================================================
# AC1: Source validation (no file argument)
# =============================================================================


class TestContextSourceValidation:
    """validate_context_sources must check all schema-referenced sources."""

    def test_valid_project_sources(self, schema_path: Path) -> None:
        """Project with valid context sources should pass."""
        # Use the real project root
        root = Path(__file__).resolve().parents[4]  # pennyfarthing-orchestrator
        result = validate_context_sources(root, schema_path)

        # At minimum, should check components and report
        assert result.components_checked > 0

    def test_missing_sources_reported(self, tmp_path: Path, schema_path: Path) -> None:
        """Project with missing sources should report errors."""
        # Empty directory — no context sources exist
        result = validate_context_sources(tmp_path, schema_path)

        assert not result.valid
        assert len(result.errors) > 0


# =============================================================================
# AC4: Reports validation errors with helpful messages
# =============================================================================


class TestErrorMessages:
    """Validation errors must include component name and helpful messages."""

    def test_error_includes_component_name(self, schema: dict) -> None:
        """Error should identify which component failed."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component("workflow_state", INVALID_WORKFLOW_STATE_BAD_ENUM, rules)

        assert len(errors) > 0
        assert all(e.component == "workflow_state" for e in errors)

    def test_error_includes_field_path(self, schema: dict) -> None:
        """Error should include the field path for targeted fixes."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component("workflow_state", INVALID_WORKFLOW_STATE_BAD_ENUM, rules)

        assert len(errors) > 0
        # At least one error should have a field_path
        assert any(e.field_path != "" for e in errors)

    def test_error_message_is_descriptive(self, schema: dict) -> None:
        """Error messages should describe what's wrong, not just 'invalid'."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component("workflow_state", INVALID_WORKFLOW_STATE_BAD_ENUM, rules)

        assert len(errors) > 0
        for error in errors:
            # Message should be more than just "invalid"
            assert len(error.message) > 10
            # Message should mention what was expected or what went wrong
            assert any(
                word in error.message.lower()
                for word in ["expected", "must", "invalid", "allowed", "valid"]
            )

    def test_error_is_validation_error_type(self, schema: dict) -> None:
        """Errors should be ValidationError instances."""
        rules = schema["components"]["workflow_state"]
        errors = validate_component("workflow_state", INVALID_WORKFLOW_STATE_BAD_ENUM, rules)

        assert len(errors) > 0
        assert all(isinstance(e, ValidationError) for e in errors)

    def test_warnings_have_warning_severity(self, schema: dict) -> None:
        """Warnings (e.g., missing recommended sections) should have severity='warning'."""
        rules = schema["components"]["agent_definition"]
        # Valid but missing recommended sections (helpers, workflow, exit)
        content = VALID_AGENT_DEFINITION.replace("<helpers>", "<x-helpers>").replace(
            "</helpers>", "</x-helpers>"
        )
        errors = validate_component("agent_definition", content, rules)

        warnings = [e for e in errors if e.severity == "warning"]
        # Should have at least one warning for missing recommended section
        assert len(warnings) > 0


# =============================================================================
# AC2: CLI command `pf context validate <file>` available
# =============================================================================


class TestCLICommand:
    """CLI commands must exist and be invocable."""

    def test_context_group_exists(self) -> None:
        """context should be a Click group."""
        import click

        assert isinstance(context, click.Group)

    def test_validate_subcommand_exists(self) -> None:
        """validate should be a subcommand of context."""
        import click

        cmd = context.get_command(click.Context(context), "validate")
        assert cmd is not None

    def test_validate_with_valid_file(self, runner: CliRunner, valid_context_file: Path) -> None:
        """Validating a valid file should exit 0."""
        result = runner.invoke(context, ["validate", str(valid_context_file)])

        assert result.exit_code == 0

    def test_validate_with_invalid_file(
        self, runner: CliRunner, invalid_context_file: Path
    ) -> None:
        """Validating an invalid file should exit non-zero."""
        result = runner.invoke(context, ["validate", str(invalid_context_file)])

        assert result.exit_code != 0

    def test_validate_nonexistent_file(self, runner: CliRunner) -> None:
        """Validating a nonexistent file should exit non-zero."""
        result = runner.invoke(context, ["validate", "/nonexistent/file.yaml"])

        assert result.exit_code != 0

    def test_validate_no_args_runs_source_check(self, runner: CliRunner) -> None:
        """Running validate with no file should check all sources."""
        result = runner.invoke(context, ["validate"])

        # Should not crash — should run source validation
        # (may fail if not in a proper project, but shouldn't error on "no such option")
        assert "no such option" not in (result.output or "").lower()

    def test_tier_option_accepted(self, runner: CliRunner, valid_context_file: Path) -> None:
        """--tier option should be accepted."""
        result = runner.invoke(context, ["validate", str(valid_context_file), "--tier", "FULL"])

        assert "no such option" not in (result.output or "").lower()

    def test_strict_option_accepted(self, runner: CliRunner, valid_context_file: Path) -> None:
        """--strict option should be accepted."""
        result = runner.invoke(context, ["validate", str(valid_context_file), "--strict"])

        assert "no such option" not in (result.output or "").lower()

    def test_output_includes_component_details(
        self, runner: CliRunner, invalid_context_file: Path
    ) -> None:
        """Output for invalid file should include component-level details."""
        result = runner.invoke(context, ["validate", str(invalid_context_file)])

        # Output should mention which components failed
        output = result.output.lower()
        assert any(
            word in output for word in ["component", "error", "missing", "required", "invalid"]
        )


# =============================================================================
# AC5: Integrated into pre-commit hooks (pf validate context)
# =============================================================================


class TestValidatorAdapterIntegration:
    """Context validator should integrate with pf validate system."""

    def test_adapter_module_importable(self) -> None:
        """Validator adapter module should be importable."""
        from pf.validate.adapters import context as context_adapter  # noqa: F811

        assert hasattr(context_adapter, "run")

    def test_adapter_returns_validate_report(self) -> None:
        """Adapter run() should return a ValidateReport."""
        from pf.validate.adapters import context as context_adapter  # noqa: F811

        root = Path(__file__).resolve().parents[4]
        report = context_adapter.run(root, fix=False, strict=False)

        assert isinstance(report, ValidateReport)

    def test_adapter_report_has_validator_name(self) -> None:
        """Adapter report should identify as 'context' validator."""
        from pf.validate.adapters import context as context_adapter  # noqa: F811

        root = Path(__file__).resolve().parents[4]
        report = context_adapter.run(root, fix=False, strict=False)

        assert report.validator == "context"

    def test_adapter_strict_mode(self) -> None:
        """Strict mode should treat warnings as errors."""
        from pf.validate.adapters import context as context_adapter  # noqa: F811

        root = Path(__file__).resolve().parents[4]
        report_normal = context_adapter.run(root, fix=False, strict=False)
        report_strict = context_adapter.run(root, fix=False, strict=True)

        # Strict should have >= errors than normal (warnings promoted)
        assert len(report_strict.errors) >= len(report_normal.errors)

    def test_context_registered_in_validators(self) -> None:
        """'context' should be registered in the VALIDATORS dict."""
        from pf.validate.cli import VALIDATORS

        assert "context" in VALIDATORS

    def test_cli_validate_context_subcommand(self, runner: CliRunner) -> None:
        """'pf validate context' subcommand should exist."""
        from pf.validate.cli import validate

        result = runner.invoke(validate, ["context"])

        # Should not fail with "No such command"
        assert "no such command" not in (result.output or "").lower()


# =============================================================================
# AC2 (continued): CLI registered in main pf group
# =============================================================================


class TestCLIRegistration:
    """context command should be registered in the main CLI."""

    def test_context_in_lazy_commands(self) -> None:
        """'context' should be in the main CLI lazy commands registry."""
        from pf.cli import _LAZY_COMMANDS

        assert "context" in _LAZY_COMMANDS
        module_path, attr_name = _LAZY_COMMANDS["context"]
        assert module_path == "pf.context.cli"
        assert attr_name == "context"


# =============================================================================
# Edge cases and robustness
# =============================================================================


class TestEdgeCases:
    """Edge cases for robust validation."""

    def test_empty_component_content(self, schema: dict) -> None:
        """Empty string content should produce errors for required components."""
        rules = schema["components"]["agent_definition"]
        errors = validate_component("agent_definition", "", rules)

        assert len(errors) > 0

    def test_none_component_content(self, schema: dict) -> None:
        """None content should produce errors."""
        rules = schema["components"]["agent_definition"]
        errors = validate_component("agent_definition", None, rules)

        assert len(errors) > 0

    def test_unknown_component_name(self, schema: dict) -> None:
        """Unknown component with empty rules should not crash."""
        errors = validate_component("unknown_component", "content", {})

        # Should return empty list (no rules to validate against)
        assert isinstance(errors, list)

    def test_workflow_state_optional_fields_accepted(self, schema: dict) -> None:
        """Workflow state with only required 'state' field should not error on optional fields."""
        rules = schema["components"]["workflow_state"]
        minimal = {"state": "NEW_WORK_STATE"}
        errors = validate_component("workflow_state", minimal, rules)

        # Only 'state' is required — no errors for missing optional fields
        assert len(errors) == 0

    def test_result_dataclass_defaults(self) -> None:
        """ContextValidationResult should have sensible defaults."""
        result = ContextValidationResult()

        assert result.valid is True
        assert result.errors == []
        assert result.warnings == []
        assert result.components_checked == 0
        assert result.tier == ""

    def test_validation_error_dataclass(self) -> None:
        """ValidationError should store all fields correctly."""
        err = ValidationError(
            component="workflow_state",
            message="Invalid enum value",
            field_path="state",
            severity="error",
        )

        assert err.component == "workflow_state"
        assert err.message == "Invalid enum value"
        assert err.field_path == "state"
        assert err.severity == "error"
