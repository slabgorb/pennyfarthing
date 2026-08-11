"""
Tests for Story 91-12: Agent definition structural validation.

Covers all 10 Acceptance Criteria:
  AC1: `pf validate agent` validates all agent definition files in pennyfarthing-dist/agents/
  AC2: Main agents checked for required sections: <role>, <critical>, <helpers>, <skills>
  AC3: Subagents checked for YAML frontmatter with required fields: name, description, tools, model
  AC4: Model values validated: haiku/sonnet/opus for main agents, haiku-only for subagents
  AC5: Subagent references in helpers tables cross-checked against actual agent files (warnings)
  AC6: `pf validate` (no args) includes agent validation
  AC7: --strict promotes warnings to errors
  AC8: README.md excluded from validation
  AC9: Zero false positives on current develop branch
  AC10: Tests cover all error and warning cases

Run with: python -m pytest tests/python/test_agent_validator.py -v
"""

from pathlib import Path
from textwrap import dedent

import pytest
from pf.validate import ValidateReport
from pf.validate.adapters.agent import (
    classify_agent_files,
    run,
    validate_main_agent,
    validate_subagent,
)

# =============================================================================
# Test Fixtures — inline markdown strings
# =============================================================================

VALID_MAIN_AGENT = dedent("""\
    # Test Agent - Test Role

    <role>
    Test agent for validation testing
    </role>

    <test-discipline>
    Philosophy text here.
    </test-discipline>

    <critical>
    **No code.** Test-only agent.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground (sequential)

    | Subagent | Purpose |
    |----------|---------|
    | `testing-runner` | Run tests |
    </helpers>

    <parameters>
    ## Subagent Parameters

    ### testing-runner
    ```yaml
    REPOS: "all"
    ```
    </parameters>

    <on-activation>
    1. Read session
    2. Begin work
    </on-activation>

    <skills>
    - `/testing` - Test commands
    </skills>

    <exit>
    Nothing after the marker. EXIT.
    </exit>
""")

VALID_SUBAGENT = dedent("""\
    ---
    name: test-subagent
    description: Test subagent for validation testing
    tools: Bash, Read, Glob, Grep
    model: haiku
    ---

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `TEST_ARG` | Yes | Test argument |
    </arguments>

    <critical>
    Always verify before proceeding.
    </critical>

    <gate>
    - [ ] Check something
    - [ ] Verify result
    </gate>

    <output>
    ## Output Format
    ```
    TEST_RESULT:
      status: success
    ```
    </output>
""")

MAIN_AGENT_NO_ROLE = dedent("""\
    # Test Agent - Missing Role

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_NO_CRITICAL = dedent("""\
    # Test Agent - Missing Critical

    <role>
    Test role description
    </role>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_NO_HELPERS = dedent("""\
    # Test Agent - Missing Helpers

    <role>
    Test role description
    </role>

    <critical>
    Rules here.
    </critical>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_NO_SKILLS = dedent("""\
    # Test Agent - Missing Skills

    <role>
    Test role description
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>
""")

MAIN_AGENT_INVALID_MODEL = dedent("""\
    # Test Agent - Invalid Model

    <role>
    Test role description
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** gpt-4 | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_CASE_INSENSITIVE_MODEL = dedent("""\
    # Test Agent - Case Insensitive Model

    <role>
    Test role description
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** Haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_BAD_SUBAGENT_REF = dedent("""\
    # Test Agent - Bad Subagent Reference

    <role>
    Test role description
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    | `nonexistent-agent` | Does not exist |
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_BUILTIN_REF = dedent("""\
    # Test Agent - Built-in Agent Reference

    <role>
    Test role description
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    | `testing-runner` | Run tests |
    | `Explore` | Search for patterns (Claude Code built-in) |
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>
""")

SUBAGENT_NO_FRONTMATTER = dedent("""\
    # Not a proper subagent — no YAML frontmatter

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `ARG1` | Yes | Test |
    </arguments>

    <output>
    Results here.
    </output>
""")

SUBAGENT_MISSING_NAME = dedent("""\
    ---
    description: Missing name field
    tools: Bash, Read
    model: haiku
    ---

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `ARG1` | Yes | Test |
    </arguments>

    <output>
    Results here.
    </output>
""")

SUBAGENT_MISSING_DESCRIPTION = dedent("""\
    ---
    name: test-sub
    tools: Bash, Read
    model: haiku
    ---

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `ARG1` | Yes | Test |
    </arguments>

    <output>
    Results here.
    </output>
""")

SUBAGENT_MISSING_TOOLS = dedent("""\
    ---
    name: test-sub
    description: Test subagent
    model: haiku
    ---

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `ARG1` | Yes | Test |
    </arguments>

    <output>
    Results here.
    </output>
""")

SUBAGENT_MISSING_MODEL = dedent("""\
    ---
    name: test-sub
    description: Test subagent
    tools: Bash, Read
    ---

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `ARG1` | Yes | Test |
    </arguments>

    <output>
    Results here.
    </output>
""")

SUBAGENT_WRONG_MODEL = dedent("""\
    ---
    name: test-sub
    description: Test subagent
    tools: Bash, Read
    model: opus
    ---

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `ARG1` | Yes | Test |
    </arguments>

    <output>
    Results here.
    </output>
""")

SUBAGENT_NO_OUTPUT = dedent("""\
    ---
    name: test-sub
    description: Test subagent
    tools: Bash, Read
    model: haiku
    ---

    <arguments>
    | Argument | Required | Description |
    |----------|----------|-------------|
    | `ARG1` | Yes | Test |
    </arguments>

    <critical>
    Do the thing.
    </critical>
""")

MAIN_AGENT_NO_ON_ACTIVATION = dedent("""\
    # Test Agent - No On-Activation

    <role>
    Test role
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_NO_EXIT = dedent("""\
    # Test Agent - No Exit

    <role>
    Test role
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>

    <on-activation>
    1. Do stuff
    </on-activation>

    <skills>
    - `/test` - Testing
    </skills>
""")

MAIN_AGENT_EXIT_SEQUENCE_VARIANT = dedent("""\
    # Test Agent - Exit Sequence Variant

    <role>
    Test role
    </role>

    <critical>
    Rules here.
    </critical>

    <helpers>
    **Model:** haiku | **Execution:** foreground

    | Subagent | Purpose |
    |----------|---------|
    </helpers>

    <skills>
    - `/test` - Testing
    </skills>

    <exit-sequence>
    1. Write assessment
    2. Spawn handoff
    </exit-sequence>
""")


# =============================================================================
# Helper: write fixture files into a tmp agents/ directory
# =============================================================================


@pytest.fixture
def agents_dir(tmp_path: Path) -> Path:
    """Create a temporary agents directory."""
    d = tmp_path / "pennyfarthing-dist" / "agents"
    d.mkdir(parents=True)
    return d


def _write_agent(agents_dir: Path, name: str, content: str) -> Path:
    """Write an agent fixture file."""
    p = agents_dir / name
    p.write_text(content)
    return p


# =============================================================================
# AC1: pf validate agent validates all agent definition files
# =============================================================================


class TestDiscoveryAndClassification:
    """AC1: Validator discovers and classifies agent files correctly."""

    def test_discovers_all_md_files(self, agents_dir: Path) -> None:
        """Should find all .md files in agents directory."""
        _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)
        _write_agent(agents_dir, "testing-runner.md", VALID_SUBAGENT)
        _write_agent(agents_dir, "README.md", "# Documentation")

        main, sub, skipped = classify_agent_files(agents_dir)

        # Should find 2 agent files total (README skipped)
        assert len(main) + len(sub) == 2

    def test_classifies_main_vs_subagent(self, agents_dir: Path) -> None:
        """Should classify files with YAML frontmatter as subagents."""
        _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)
        _write_agent(agents_dir, "testing-runner.md", VALID_SUBAGENT)

        main, sub, skipped = classify_agent_files(agents_dir)

        assert len(main) == 1
        assert len(sub) == 1
        assert main[0].stem == "dev"
        assert sub[0].stem == "testing-runner"

    def test_run_returns_validate_report(self, agents_dir: Path) -> None:
        """run() should return a ValidateReport with validator='agent'."""
        _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        assert isinstance(report, ValidateReport)
        assert report.validator == "agent"

    def test_run_counts_passed_files(self, agents_dir: Path) -> None:
        """Valid files should increment passed count."""
        _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)
        _write_agent(agents_dir, "testing-runner.md", VALID_SUBAGENT)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        assert report.passed == 2
        assert report.errors == 0


# =============================================================================
# AC2: Main agents checked for required sections
# =============================================================================


class TestMainAgentRequiredSections:
    """AC2: Main agents must have <role>, <critical>, <helpers>, <skills>."""

    def test_valid_main_agent_passes(self, agents_dir: Path) -> None:
        """Main agent with all required sections should pass."""
        path = _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert len(errors) == 0

    def test_missing_role_is_error(self, agents_dir: Path) -> None:
        """Main agent without <role> should produce an error."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_ROLE)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert any("role" in e.lower() for e in errors)

    def test_missing_critical_is_error(self, agents_dir: Path) -> None:
        """Main agent without <critical> should produce an error."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_CRITICAL)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert any("critical" in e.lower() for e in errors)

    def test_missing_helpers_is_error(self, agents_dir: Path) -> None:
        """Main agent without <helpers> should produce an error."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_HELPERS)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert any("helpers" in e.lower() for e in errors)

    def test_missing_skills_is_error(self, agents_dir: Path) -> None:
        """Main agent without <skills> should produce an error."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_SKILLS)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert any("skills" in e.lower() for e in errors)

    def test_multiple_missing_sections_all_reported(self, agents_dir: Path) -> None:
        """Agent missing multiple sections should report all of them."""
        # This agent has no role, no helpers, no skills — only <critical>
        content = dedent("""\
            # Bare Agent

            <critical>
            The only section.
            </critical>
        """)
        path = _write_agent(agents_dir, "bare.md", content)

        errors, warnings = validate_main_agent(path, agents_dir)

        # Should report at least role, helpers, and skills as missing
        assert len(errors) >= 3


# =============================================================================
# AC3: Subagents checked for YAML frontmatter with required fields
# =============================================================================


class TestSubagentFrontmatter:
    """AC3: Subagents must have YAML frontmatter with name, description, tools, model."""

    def test_valid_subagent_passes(self, agents_dir: Path) -> None:
        """Subagent with all required frontmatter fields should pass."""
        path = _write_agent(agents_dir, "test-sub.md", VALID_SUBAGENT)

        errors, warnings = validate_subagent(path)

        assert len(errors) == 0

    def test_missing_name_is_error(self, agents_dir: Path) -> None:
        """Subagent without name field should produce an error."""
        path = _write_agent(agents_dir, "test-sub.md", SUBAGENT_MISSING_NAME)

        errors, warnings = validate_subagent(path)

        assert any("name" in e.lower() for e in errors)

    def test_missing_description_is_error(self, agents_dir: Path) -> None:
        """Subagent without description field should produce an error."""
        path = _write_agent(agents_dir, "test-sub.md", SUBAGENT_MISSING_DESCRIPTION)

        errors, warnings = validate_subagent(path)

        assert any("description" in e.lower() for e in errors)

    def test_missing_tools_is_error(self, agents_dir: Path) -> None:
        """Subagent without tools field should produce an error."""
        path = _write_agent(agents_dir, "test-sub.md", SUBAGENT_MISSING_TOOLS)

        errors, warnings = validate_subagent(path)

        assert any("tools" in e.lower() for e in errors)

    def test_missing_model_is_error(self, agents_dir: Path) -> None:
        """Subagent without model field should produce an error."""
        path = _write_agent(agents_dir, "test-sub.md", SUBAGENT_MISSING_MODEL)

        errors, warnings = validate_subagent(path)

        assert any("model" in e.lower() for e in errors)

    def test_missing_output_is_error(self, agents_dir: Path) -> None:
        """Subagent without <output> section should produce an error."""
        path = _write_agent(agents_dir, "test-sub.md", SUBAGENT_NO_OUTPUT)

        errors, warnings = validate_subagent(path)

        assert any("output" in e.lower() for e in errors)


# =============================================================================
# AC4: Model values validated
# =============================================================================


class TestModelValidation:
    """AC4: Model values validated — haiku/sonnet/opus for main, haiku-only for subagents."""

    def test_main_agent_valid_models(self, agents_dir: Path) -> None:
        """Main agent with haiku model should pass."""
        path = _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)

        errors, warnings = validate_main_agent(path, agents_dir)

        model_errors = [e for e in errors if "model" in e.lower()]
        assert len(model_errors) == 0

    def test_main_agent_invalid_model_is_error(self, agents_dir: Path) -> None:
        """Main agent with invalid model (gpt-4) should produce an error."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_INVALID_MODEL)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert any("model" in e.lower() for e in errors)
        assert any("gpt-4" in e.lower() for e in errors)

    def test_main_agent_model_case_insensitive(self, agents_dir: Path) -> None:
        """Main agent with 'Haiku' (capitalized) should pass — case insensitive."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_CASE_INSENSITIVE_MODEL)

        errors, warnings = validate_main_agent(path, agents_dir)

        model_errors = [e for e in errors if "model" in e.lower()]
        assert len(model_errors) == 0

    def test_subagent_haiku_model_passes(self, agents_dir: Path) -> None:
        """Subagent with model: haiku should pass."""
        path = _write_agent(agents_dir, "test-sub.md", VALID_SUBAGENT)

        errors, warnings = validate_subagent(path)

        model_errors = [e for e in errors if "model" in e.lower()]
        assert len(model_errors) == 0

    def test_subagent_non_haiku_model_is_error(self, agents_dir: Path) -> None:
        """Subagent with model: opus should produce an error."""
        path = _write_agent(agents_dir, "test-sub.md", SUBAGENT_WRONG_MODEL)

        errors, warnings = validate_subagent(path)

        assert any("model" in e.lower() for e in errors)
        assert any("haiku" in e.lower() for e in errors)


# =============================================================================
# AC5: Subagent references cross-checked
# =============================================================================


class TestSubagentReferences:
    """AC5: Subagent names in helpers table cross-checked against actual files."""

    def test_valid_reference_no_warning(self, agents_dir: Path) -> None:
        """Reference to existing subagent file should produce no warning."""
        _write_agent(agents_dir, "testing-runner.md", VALID_SUBAGENT)
        path = _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)

        errors, warnings = validate_main_agent(path, agents_dir)

        ref_warnings = [w for w in warnings if "reference" in w.lower() or "not found" in w.lower()]
        assert len(ref_warnings) == 0

    def test_invalid_reference_produces_warning(self, agents_dir: Path) -> None:
        """Reference to non-existent subagent should produce a warning."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_BAD_SUBAGENT_REF)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert any("nonexistent-agent" in w.lower() for w in warnings)

    def test_builtin_agent_reference_no_warning(self, agents_dir: Path) -> None:
        """Reference to built-in agent (Explore) should not produce a warning."""
        _write_agent(agents_dir, "testing-runner.md", VALID_SUBAGENT)
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_BUILTIN_REF)

        errors, warnings = validate_main_agent(path, agents_dir)

        explore_warnings = [w for w in warnings if "explore" in w.lower()]
        assert len(explore_warnings) == 0


# =============================================================================
# AC6: pf validate (no args) includes agent validation
# =============================================================================


class TestCLIRegistration:
    """AC6: Agent validator is registered in the VALIDATORS dict."""

    def test_agent_in_validators_registry(self) -> None:
        """'agent' key should exist in the VALIDATORS dict."""
        from pf.validate.cli import VALIDATORS

        assert "agent" in VALIDATORS

    def test_agent_validator_module_path(self) -> None:
        """Agent validator should point to the correct module path."""
        from pf.validate.cli import VALIDATORS

        assert VALIDATORS["agent"] == "pf.validate.adapters.agent"


# =============================================================================
# AC7: --strict promotes warnings to errors
# =============================================================================


class TestStrictMode:
    """AC7: --strict flag promotes warnings to errors."""

    def test_warning_not_error_in_normal_mode(self, agents_dir: Path) -> None:
        """Missing <on-activation> should be a warning in normal mode."""
        _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_ON_ACTIVATION)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        assert report.warnings > 0
        assert report.errors == 0

    def test_warning_becomes_error_in_strict_mode(self, agents_dir: Path) -> None:
        """Missing <on-activation> should be an error in strict mode."""
        _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_ON_ACTIVATION)

        report = run(agents_dir.parent.parent, fix=False, strict=True)

        assert report.errors > 0


# =============================================================================
# AC8: README.md excluded from validation
# =============================================================================


class TestReadmeExclusion:
    """AC8: README.md is excluded from validation."""

    def test_readme_skipped(self, agents_dir: Path) -> None:
        """README.md should not be validated."""
        _write_agent(agents_dir, "README.md", "# Agents\n\nDocumentation only.")
        _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)

        main, sub, skipped = classify_agent_files(agents_dir)

        assert "README.md" not in [f.name for f in main]
        assert "README.md" not in [f.name for f in sub]
        assert "README.md" in [f.name for f in skipped]

    def test_readme_does_not_affect_report(self, agents_dir: Path) -> None:
        """README.md should not increment any counters in the report."""
        _write_agent(agents_dir, "README.md", "# Bad content with no role or anything")
        _write_agent(agents_dir, "dev.md", VALID_MAIN_AGENT)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        # Only dev.md should count
        assert report.passed == 1
        assert report.errors == 0


# =============================================================================
# AC9: Zero false positives on current develop branch
# =============================================================================


class TestRealAgentFiles:
    """AC9: Zero false positives on actual agent files in develop."""

    def test_all_real_agents_pass_validation(self) -> None:
        """Running the validator against real agent files should produce zero errors."""
        # Use actual project root to test real files
        project_root = Path(__file__).parent.parent.parent
        agent_dir = project_root / "pennyfarthing-dist" / "agents"

        if not agent_dir.is_dir():
            pytest.skip("pennyfarthing-dist/agents/ not found — skipping integration test")

        report = run(project_root, fix=False, strict=False)

        assert report.errors == 0, (
            f"Expected zero errors on real agent files, got {report.errors}:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )

    def test_all_real_agents_counted(self) -> None:
        """Should validate all real agent files (17 agents, excluding README)."""
        project_root = Path(__file__).parent.parent.parent
        agent_dir = project_root / "pennyfarthing-dist" / "agents"

        if not agent_dir.is_dir():
            pytest.skip("pennyfarthing-dist/agents/ not found — skipping integration test")

        report = run(project_root, fix=False, strict=False)

        # 10 main + 7 subagents = 17 agent files
        assert report.passed >= 17, (
            f"Expected at least 17 passed files, got {report.passed}"
        )


# =============================================================================
# AC10: Additional edge cases and warning tests
# =============================================================================


class TestWarnings:
    """AC10: Warning cases for best-practice recommendations."""

    def test_missing_on_activation_is_warning(self, agents_dir: Path) -> None:
        """Main agent without <on-activation> should produce a warning, not error."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_ON_ACTIVATION)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert len(errors) == 0
        assert any("on-activation" in w.lower() for w in warnings)

    def test_missing_exit_is_warning(self, agents_dir: Path) -> None:
        """Main agent without <exit> should produce a warning, not error."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_EXIT)

        errors, warnings = validate_main_agent(path, agents_dir)

        assert len(errors) == 0
        assert any("exit" in w.lower() for w in warnings)

    def test_exit_sequence_variant_accepted(self, agents_dir: Path) -> None:
        """Main agent with <exit-sequence> (instead of <exit>) should not warn."""
        path = _write_agent(agents_dir, "dev.md", MAIN_AGENT_EXIT_SEQUENCE_VARIANT)

        errors, warnings = validate_main_agent(path, agents_dir)

        exit_warnings = [w for w in warnings if "exit" in w.lower()]
        assert len(exit_warnings) == 0

    def test_subagent_missing_arguments_is_warning(self, agents_dir: Path) -> None:
        """Subagent without <arguments> should produce a warning, not error."""
        content = dedent("""\
            ---
            name: test-sub
            description: Test subagent
            tools: Bash, Read
            model: haiku
            ---

            <critical>
            Do the thing.
            </critical>

            <output>
            Results here.
            </output>
        """)
        path = _write_agent(agents_dir, "test-sub.md", content)

        errors, warnings = validate_subagent(path)

        assert len(errors) == 0
        assert any("arguments" in w.lower() for w in warnings)


class TestReportDetails:
    """Verify report details follow the [ERROR]/[WARN] format convention."""

    def test_errors_prefixed_correctly(self, agents_dir: Path) -> None:
        """Error details should contain [ERROR] prefix."""
        _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_ROLE)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        error_details = [d for d in report.details if "[ERROR]" in d]
        assert len(error_details) > 0

    def test_warnings_prefixed_correctly(self, agents_dir: Path) -> None:
        """Warning details should contain [WARN] prefix."""
        _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_ON_ACTIVATION)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        warn_details = [d for d in report.details if "[WARN]" in d]
        assert len(warn_details) > 0

    def test_details_include_filename(self, agents_dir: Path) -> None:
        """Report details should include the agent filename."""
        _write_agent(agents_dir, "dev.md", MAIN_AGENT_NO_ROLE)

        report = run(agents_dir.parent.parent, fix=False, strict=False)

        assert any("dev.md" in d for d in report.details)
