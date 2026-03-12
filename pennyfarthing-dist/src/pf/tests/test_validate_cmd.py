"""Tests for sprint/validate_cmd.py module.

Story: MSSCI-14255 - Sprint validate command with --fix flag

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. Detects YAML syntax errors with line numbers
2. Detects schema violations (missing required fields)
3. Detects format drift (wrong indentation, key order)
4. --fix repairs all format errors automatically
5. Exit code 0 = valid, non-zero = invalid
"""

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.validate_cmd import (
    check_format_drift,
    validate_command,
    validate_sprint_yaml,
)

# =============================================================================
# Test Fixtures
# =============================================================================


VALID_CANONICAL_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-63
    type: epic
    title: "Epic: Test Epic"
    description: |
      This is a test epic.
    priority: P1
    status: in_progress
    repos: pennyfarthing
    jira: MSSCI-12000
    stories:
      - id: 63-1
        jira: MSSCI-12001
        title: First Story
        points: 3
        priority: P0
        status: backlog
        repos: pennyfarthing
        workflow: tdd
        acceptance_criteria:
          - First criterion
          - Second criterion
"""

MALFORMED_YAML = """\
sprint:
  name: "TO Sprint 2604"
  status: active
  goal: [unclosed bracket
  start_date: 2026-01-20
"""

YAML_BAD_COLON = """\
sprint:
  name: "TO Sprint 2604"
  status: active
  goal: something: with: extra: colons
"""

YAML_MISSING_SPRINT_SECTION = """\
epics: []
"""

YAML_MISSING_REQUIRED_FIELDS = """\
sprint:
  name: "TO Sprint 2604"
  status: active
epics: []
"""

YAML_INVALID_STATUS = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Test
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: bogus
epics: []
"""

YAML_MISSING_STORY_FIELDS = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Test
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
epics:
  - id: epic-63
    title: "Epic: Test"
    stories:
      - id: 63-1
        title: Missing Points and Status
"""

YAML_SCRAMBLED_KEYS = """\
sprint:
  status: active
  name: "TO Sprint 2604"
  end_date: 2026-02-02
  goal: Complete the sprint
  jira_sprint_id: 276
  start_date: 2026-01-20
  jira_sprint_name: "TO Sprint 2604"
epics:
  - stories: []
    id: epic-63
    status: in_progress
    title: "Epic: Test"
    priority: P1
"""

YAML_WRONG_STRING_STYLE = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
epics:
  - id: epic-63
    type: epic
    title: "Epic: Test"
    description: "This is a multiline\\ndescription that\\nshould use block scalar"
    priority: P1
    status: in_progress
    stories: []
"""


@pytest.fixture
def valid_yaml_file(tmp_path: Path) -> Path:
    """Create a valid, canonically-formatted sprint YAML file."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(VALID_CANONICAL_YAML)
    return p


@pytest.fixture
def malformed_yaml_file(tmp_path: Path) -> Path:
    """Create a YAML file with syntax errors."""
    p = tmp_path / "malformed.yaml"
    p.write_text(MALFORMED_YAML)
    return p


@pytest.fixture
def missing_fields_file(tmp_path: Path) -> Path:
    """Create a YAML file with missing required fields."""
    p = tmp_path / "missing-fields.yaml"
    p.write_text(YAML_MISSING_REQUIRED_FIELDS)
    return p


@pytest.fixture
def scrambled_keys_file(tmp_path: Path) -> Path:
    """Create a YAML file with keys in wrong order."""
    p = tmp_path / "scrambled.yaml"
    p.write_text(YAML_SCRAMBLED_KEYS)
    return p


@pytest.fixture
def wrong_string_style_file(tmp_path: Path) -> Path:
    """Create a YAML file with wrong string styles."""
    p = tmp_path / "wrong-style.yaml"
    p.write_text(YAML_WRONG_STRING_STYLE)
    return p


@pytest.fixture
def runner() -> CliRunner:
    """Create a Click test runner."""
    return CliRunner()


# =============================================================================
# AC1: Detects YAML syntax errors with line numbers
# =============================================================================


class TestYamlSyntaxErrors:
    """validate_sprint_yaml must detect YAML syntax errors with line numbers."""

    def test_malformed_yaml_detected(self, malformed_yaml_file: Path) -> None:
        """Malformed YAML (unclosed bracket) should be detected as syntax error."""
        result = validate_sprint_yaml(malformed_yaml_file)

        assert not result.valid
        assert any(e.category == "syntax" for e in result.errors)

    def test_syntax_error_includes_line_number(self, malformed_yaml_file: Path) -> None:
        """Syntax error should include the line number where it occurs."""
        result = validate_sprint_yaml(malformed_yaml_file)

        assert not result.valid
        syntax_errors = [e for e in result.errors if e.category == "syntax"]
        assert len(syntax_errors) > 0
        # Line number should be present and positive
        assert syntax_errors[0].line is not None
        assert syntax_errors[0].line > 0

    def test_empty_file_detected(self, tmp_path: Path) -> None:
        """Empty YAML file should be detected as a syntax/parse error."""
        empty = tmp_path / "empty.yaml"
        empty.write_text("")

        result = validate_sprint_yaml(empty)

        assert not result.valid
        assert len(result.errors) > 0


# =============================================================================
# AC2: Detects schema violations (missing required fields)
# =============================================================================


class TestSchemaViolations:
    """validate_sprint_yaml must detect schema violations."""

    def test_missing_sprint_section(self, tmp_path: Path) -> None:
        """Missing 'sprint' section should be a schema error."""
        p = tmp_path / "no-sprint.yaml"
        p.write_text(YAML_MISSING_SPRINT_SECTION)

        result = validate_sprint_yaml(p)

        assert not result.valid
        assert any(e.category == "schema" for e in result.errors)
        assert any("sprint" in e.message.lower() for e in result.errors)

    def test_missing_required_sprint_fields(self, missing_fields_file: Path) -> None:
        """Missing required sprint fields should report each missing field."""
        result = validate_sprint_yaml(missing_fields_file)

        assert not result.valid
        schema_errors = [e for e in result.errors if e.category == "schema"]
        assert len(schema_errors) > 0
        # Should report specific missing fields
        error_text = " ".join(e.message for e in schema_errors)
        # At minimum, jira_sprint_id, goal, start_date, end_date should be reported
        assert "jira_sprint_id" in error_text or "goal" in error_text

    def test_invalid_sprint_status_is_schema_error(self, tmp_path: Path) -> None:
        """Invalid sprint status value should be a schema violation."""
        p = tmp_path / "bad-status.yaml"
        p.write_text(YAML_INVALID_STATUS)

        result = validate_sprint_yaml(p)

        assert not result.valid
        assert any(e.category == "schema" for e in result.errors)
        assert any("status" in e.message.lower() for e in result.errors)

    def test_missing_story_fields_detected(self, tmp_path: Path) -> None:
        """Missing required story fields should be detected with field paths."""
        p = tmp_path / "missing-story.yaml"
        p.write_text(YAML_MISSING_STORY_FIELDS)

        result = validate_sprint_yaml(p)

        assert not result.valid
        schema_errors = [e for e in result.errors if e.category == "schema"]
        assert len(schema_errors) > 0
        # Error path should reference the story location
        assert any("stories" in e.path or "63-1" in e.path for e in schema_errors)

    def test_valid_file_has_no_schema_errors(self, valid_yaml_file: Path) -> None:
        """A valid sprint file should have zero schema errors."""
        result = validate_sprint_yaml(valid_yaml_file)

        schema_errors = [e for e in result.errors if e.category == "schema"]
        assert len(schema_errors) == 0


# =============================================================================
# AC3: Detects format drift (wrong indentation, key order)
# =============================================================================


class TestFormatDrift:
    """check_format_drift must detect formatting issues."""

    def test_scrambled_keys_detected(self, scrambled_keys_file: Path) -> None:
        """Keys in wrong order should be flagged as format drift."""
        issues = check_format_drift(scrambled_keys_file)

        assert len(issues) > 0
        assert any("order" in i.message.lower() or "key" in i.message.lower() for i in issues)

    def test_wrong_string_style_detected(self, wrong_string_style_file: Path) -> None:
        """Multiline strings not using block scalar should be flagged."""
        issues = check_format_drift(wrong_string_style_file)

        assert len(issues) > 0
        assert any(
            "string" in i.message.lower()
            or "scalar" in i.message.lower()
            or "style" in i.message.lower()
            for i in issues
        )

    def test_multiple_format_issues_all_reported(self, tmp_path: Path) -> None:
        """Multiple format issues in one file should all be reported."""
        # Scrambled keys AND wrong string style
        content = """\
sprint:
  status: active
  name: "TO Sprint 2604"
  end_date: 2026-02-02
  goal: Complete the sprint
  jira_sprint_id: 276
  start_date: 2026-01-20
  jira_sprint_name: "TO Sprint 2604"
epics:
  - stories: []
    id: epic-63
    status: in_progress
    title: "Epic: Test"
    description: "Multi\\nline\\ntext"
    priority: P1
"""
        p = tmp_path / "multi-issues.yaml"
        p.write_text(content)

        issues = check_format_drift(p)

        # Should have at least key order + string style issues
        assert len(issues) >= 2

    def test_canonical_format_has_no_drift(self, valid_yaml_file: Path) -> None:
        """A file in canonical format should have zero format issues."""
        issues = check_format_drift(valid_yaml_file)

        assert len(issues) == 0


# =============================================================================
# AC4: --fix repairs all format errors automatically
# =============================================================================


class TestFixFlag:
    """--fix flag must repair format errors automatically."""

    def test_fix_reorders_scrambled_keys(self, scrambled_keys_file: Path) -> None:
        """--fix should reorder keys to canonical order."""
        # Verify drift exists before fix
        issues_before = check_format_drift(scrambled_keys_file)
        assert len(issues_before) > 0

        # Run validate with --fix
        validate_sprint_yaml(scrambled_keys_file, fix=True)

        # After fix, re-check should show no drift
        issues_after = check_format_drift(scrambled_keys_file)
        assert len(issues_after) == 0

    def test_fix_converts_to_block_scalars(self, wrong_string_style_file: Path) -> None:
        """--fix should convert multiline strings to block scalar style."""
        validate_sprint_yaml(wrong_string_style_file, fix=True)

        # Read back and check for block scalar
        content = wrong_string_style_file.read_text()
        assert "description: |" in content

    def test_fix_is_idempotent(self, valid_yaml_file: Path) -> None:
        """Fixing an already-canonical file should produce identical output."""
        original_content = valid_yaml_file.read_text()

        validate_sprint_yaml(valid_yaml_file, fix=True)

        fixed_content = valid_yaml_file.read_text()
        assert fixed_content == original_content

    def test_fix_does_not_fix_schema_errors(self, missing_fields_file: Path) -> None:
        """--fix should NOT attempt to fix schema errors (missing fields)."""
        result = validate_sprint_yaml(missing_fields_file, fix=True)

        # Schema errors should still be present after fix
        schema_errors = [e for e in result.errors if e.category == "schema"]
        assert len(schema_errors) > 0


# =============================================================================
# AC5: Exit code 0 = valid, non-zero = invalid
# =============================================================================


class TestExitCodes:
    """validate_command CLI should return proper exit codes."""

    def test_valid_file_exit_code_zero(self, runner: CliRunner, valid_yaml_file: Path) -> None:
        """Valid file should produce exit code 0."""
        result = runner.invoke(validate_command, [str(valid_yaml_file)])

        assert result.exit_code == 0

    def test_schema_errors_exit_code_nonzero(
        self, runner: CliRunner, missing_fields_file: Path
    ) -> None:
        """Schema errors should produce non-zero exit code."""
        result = runner.invoke(validate_command, [str(missing_fields_file)])

        assert result.exit_code != 0

    def test_syntax_errors_exit_code_nonzero(
        self, runner: CliRunner, malformed_yaml_file: Path
    ) -> None:
        """Syntax errors should produce non-zero exit code."""
        result = runner.invoke(validate_command, [str(malformed_yaml_file)])

        assert result.exit_code != 0

    def test_file_not_found_exit_code_nonzero(self, runner: CliRunner) -> None:
        """Missing file should produce non-zero exit code."""
        result = runner.invoke(validate_command, ["/nonexistent/file.yaml"])

        assert result.exit_code != 0


# =============================================================================
# CLI Integration
# =============================================================================


class TestCLIIntegration:
    """Integration tests for the validate Click command."""

    def test_validate_command_exists(self) -> None:
        """validate_command should be a Click command."""
        import click

        assert isinstance(validate_command, click.BaseCommand)

    def test_fix_flag_accepted(self, runner: CliRunner, valid_yaml_file: Path) -> None:
        """--fix flag should be accepted without error."""
        result = runner.invoke(validate_command, [str(valid_yaml_file), "--fix"])

        # Should not crash with "no such option" error
        assert "no such option" not in (result.output or "").lower()

    def test_output_includes_error_paths(
        self, runner: CliRunner, missing_fields_file: Path
    ) -> None:
        """Output should include field paths for errors (e.g., sprint.goal)."""
        result = runner.invoke(validate_command, [str(missing_fields_file)])

        # Output should contain path-like references
        assert "sprint." in result.output or "epics[" in result.output

    def test_output_human_readable(self, runner: CliRunner, missing_fields_file: Path) -> None:
        """Output should be human-readable with clear error descriptions."""
        result = runner.invoke(validate_command, [str(missing_fields_file)])

        # Should not be empty
        assert len(result.output.strip()) > 0
        # Should contain error indication
        assert "error" in result.output.lower() or "invalid" in result.output.lower()

    def test_valid_file_shows_success(self, runner: CliRunner, valid_yaml_file: Path) -> None:
        """Valid file should show a success message."""
        result = runner.invoke(validate_command, [str(valid_yaml_file)])

        assert result.exit_code == 0
        assert "valid" in result.output.lower() or "ok" in result.output.lower()
