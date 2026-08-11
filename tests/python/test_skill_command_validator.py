"""
Tests for Story 91-13: Skill registry and command schema validation.

Covers all 7 Acceptance Criteria:
  AC1: Enforce existing `skill-registry.schema.json` validation on
       `pennyfarthing-dist/skills/skill-registry.yaml`
  AC2: Command file structural validation for command files in
       `pennyfarthing-dist/commands/*.md`
  AC3: Integration into validation pipeline (`pf validate skill-command`)
  AC4: Zero false positives against current codebase
  AC5: --strict promotes warnings to errors
  AC6: CLI registration in VALIDATORS dict
  AC7: Discovery — finds all skill and command files

Run with: python -m pytest tests/python/test_skill_command_validator.py -v
"""

from pathlib import Path
from textwrap import dedent

import pytest
from pf.validate.adapters.skill_command import (
    discover_command_files,
    discover_skill_registry,
    run,
    validate_command_file,
    validate_skill_registry,
)

# =============================================================================
# Test Fixtures — inline YAML/markdown strings
# =============================================================================

VALID_SKILL_REGISTRY = dedent("""\
    version: "1.0.0"

    skills:
      test-skill:
        name: test-skill
        description: A test skill for validation
        category: development
        tags: [testing, validation]
        version: "1.0.0"
        examples:
          - context: Running tests
            invocation: /test-skill
        allowed_tools: [Read, Glob]
""")

SKILL_REGISTRY_MISSING_VERSION = dedent("""\
    skills:
      test-skill:
        name: test-skill
        description: A test skill
        category: development
        tags: [testing]
""")

SKILL_REGISTRY_INVALID_VERSION_FORMAT = dedent("""\
    version: "not-semver"

    skills:
      test-skill:
        name: test-skill
        description: A test skill
        category: development
        tags: [testing]
""")

SKILL_REGISTRY_MISSING_SKILLS = dedent("""\
    version: "1.0.0"
""")

SKILL_REGISTRY_INVALID_CATEGORY = dedent("""\
    version: "1.0.0"

    skills:
      test-skill:
        name: test-skill
        description: A test skill
        category: invalid-category
        tags: [testing]
""")

SKILL_REGISTRY_MISSING_REQUIRED_FIELDS = dedent("""\
    version: "1.0.0"

    skills:
      test-skill:
        name: test-skill
""")

SKILL_REGISTRY_EXTRA_FIELDS = dedent("""\
    version: "1.0.0"

    skills:
      test-skill:
        name: test-skill
        description: A test skill
        category: development
        tags: [testing]
        unknown_field: should not be here
""")

SKILL_REGISTRY_MULTIPLE_SKILLS = dedent("""\
    version: "1.0.0"

    skills:
      skill-one:
        name: skill-one
        description: First skill
        category: development
        tags: [first]
      skill-two:
        name: skill-two
        description: Second skill
        category: tools
        tags: [second]
      skill-three:
        name: skill-three
        description: Third skill
        category: ai-llm
        tags: [third]
""")

SKILL_REGISTRY_INVALID_EXAMPLE = dedent("""\
    version: "1.0.0"

    skills:
      test-skill:
        name: test-skill
        description: A test skill
        category: development
        tags: [testing]
        examples:
          - context: Missing invocation field
""")

VALID_COMMAND_WITH_FRONTMATTER = dedent("""\
    ---
    description: Run quality gates before handoff
    ---

    # Quality Check

    <purpose>
    Run all quality gates before handing off.
    </purpose>

    <execution>
    ## Running Quality Checks
    Use the check.sh script.
    </execution>
""")

VALID_AGENT_COMMAND = dedent("""\
    ---
    description: Scrum Master - Story coordination
    ---

    <agent-activation>
    **FIRST:** Use Bash tool to run:
    ```bash
    pf agent start "sm"
    ```
    </agent-activation>

    <instructions>
    You are now the SM agent.
    </instructions>
""")

COMMAND_MISSING_FRONTMATTER = dedent("""\
    # No Frontmatter Command

    This command has no YAML frontmatter.

    <purpose>
    Do something.
    </purpose>
""")

COMMAND_MISSING_DESCRIPTION = dedent("""\
    ---
    other_field: not description
    ---

    # Missing Description

    <purpose>
    A command without a description field in frontmatter.
    </purpose>
""")

COMMAND_EMPTY_DESCRIPTION = dedent("""\
    ---
    description: ""
    ---

    # Empty Description

    <purpose>
    A command with empty description.
    </purpose>
""")

COMMAND_EMPTY_CONTENT = dedent("""\
    ---
    description: This command has no body
    ---
""")


# =============================================================================
# Helpers
# =============================================================================


def _write_skill_registry(tmp_path: Path, content: str) -> Path:
    """Write a skill-registry.yaml file and return its path."""
    skills_dir = tmp_path / "pennyfarthing-dist" / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)
    path = skills_dir / "skill-registry.yaml"
    path.write_text(content)
    return path


def _write_skill_schema(tmp_path: Path) -> Path:
    """Write the skill-registry.schema.json file (copy from real project)."""
    skills_dir = tmp_path / "pennyfarthing-dist" / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)

    # Real schema content matching the project
    schema = """{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://pennyfarthing.dev/schemas/skill-registry.schema.json",
  "title": "Pennyfarthing Skill Registry",
  "description": "Schema for the centralized skill metadata registry",
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$",
      "description": "Semantic version of the registry format"
    },
    "skills": {
      "type": "object",
      "description": "Map of skill names to their metadata",
      "additionalProperties": {
        "$ref": "#/definitions/skill"
      }
    }
  },
  "required": ["version", "skills"],
  "additionalProperties": false,
  "definitions": {
    "skill": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "description": { "type": "string" },
        "category": {
          "type": "string",
          "enum": [
            "development",
            "project-management",
            "theming",
            "tools",
            "ai-llm",
            "documentation",
            "benchmarking"
          ]
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        },
        "version": {
          "type": "string",
          "pattern": "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$"
        },
        "prerequisites": {
          "type": "array",
          "items": { "type": "string" }
        },
        "examples": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "context": { "type": "string" },
              "invocation": { "type": "string" }
            },
            "required": ["context", "invocation"],
            "additionalProperties": false
          }
        },
        "anti_patterns": {
          "type": "array",
          "items": { "type": "string" }
        },
        "related_skills": {
          "type": "array",
          "items": { "type": "string" }
        },
        "keywords": {
          "type": "array",
          "items": { "type": "string" }
        },
        "allowed_tools": {
          "type": "array",
          "items": { "type": "string" }
        },
        "deprecated": { "type": "boolean" },
        "redirect": { "type": "string" }
      },
      "required": ["name", "description", "category", "tags"],
      "additionalProperties": false
    }
  }
}"""
    path = skills_dir / "skill-registry.schema.json"
    path.write_text(schema)
    return path


def _write_command(tmp_path: Path, name: str, content: str) -> Path:
    """Write a command markdown file and return its path."""
    commands_dir = tmp_path / "pennyfarthing-dist" / "commands"
    commands_dir.mkdir(parents=True, exist_ok=True)
    path = commands_dir / name
    path.write_text(content)
    return path


def _setup_project(tmp_path: Path, registry_content: str = VALID_SKILL_REGISTRY) -> Path:
    """Set up a minimal project with skill registry and schema."""
    _write_skill_registry(tmp_path, registry_content)
    _write_skill_schema(tmp_path)
    return tmp_path


# =============================================================================
# AC1: Enforce skill-registry.schema.json on skill-registry.yaml
# =============================================================================


class TestAC1SkillRegistryValidation:
    """Enforce existing skill-registry.schema.json validation on skill-registry.yaml."""

    def test_valid_registry_passes(self, tmp_path: Path) -> None:
        """Valid skill registry should produce no errors."""
        _setup_project(tmp_path)

        errors, warnings = validate_skill_registry(tmp_path)

        assert errors == []

    def test_missing_version_is_error(self, tmp_path: Path) -> None:
        """Skill registry without version field should produce an error."""
        _setup_project(tmp_path, SKILL_REGISTRY_MISSING_VERSION)

        errors, warnings = validate_skill_registry(tmp_path)

        assert any("version" in e.lower() for e in errors)

    def test_invalid_version_format_is_error(self, tmp_path: Path) -> None:
        """Skill registry with non-semver version should produce an error."""
        _setup_project(tmp_path, SKILL_REGISTRY_INVALID_VERSION_FORMAT)

        errors, warnings = validate_skill_registry(tmp_path)

        assert any("version" in e.lower() for e in errors)

    def test_missing_skills_is_error(self, tmp_path: Path) -> None:
        """Skill registry without skills section should produce an error."""
        _setup_project(tmp_path, SKILL_REGISTRY_MISSING_SKILLS)

        errors, warnings = validate_skill_registry(tmp_path)

        assert any("skills" in e.lower() for e in errors)

    def test_invalid_category_is_error(self, tmp_path: Path) -> None:
        """Skill with invalid category should produce an error."""
        _setup_project(tmp_path, SKILL_REGISTRY_INVALID_CATEGORY)

        errors, warnings = validate_skill_registry(tmp_path)

        assert any("category" in e.lower() for e in errors)

    def test_missing_required_skill_fields_is_error(self, tmp_path: Path) -> None:
        """Skill missing required fields (description, category, tags) is an error."""
        _setup_project(tmp_path, SKILL_REGISTRY_MISSING_REQUIRED_FIELDS)

        errors, warnings = validate_skill_registry(tmp_path)

        assert len(errors) >= 1

    def test_extra_fields_is_error(self, tmp_path: Path) -> None:
        """Skill with unknown fields should produce an error (additionalProperties: false)."""
        _setup_project(tmp_path, SKILL_REGISTRY_EXTRA_FIELDS)

        errors, warnings = validate_skill_registry(tmp_path)

        assert any("unknown_field" in e.lower() or "additional" in e.lower() for e in errors)

    def test_multiple_valid_skills(self, tmp_path: Path) -> None:
        """Registry with multiple valid skills should pass with no errors."""
        _setup_project(tmp_path, SKILL_REGISTRY_MULTIPLE_SKILLS)

        errors, warnings = validate_skill_registry(tmp_path)

        assert errors == []

    def test_invalid_example_structure_is_error(self, tmp_path: Path) -> None:
        """Skill with malformed examples should produce an error."""
        _setup_project(tmp_path, SKILL_REGISTRY_INVALID_EXAMPLE)

        errors, warnings = validate_skill_registry(tmp_path)

        assert len(errors) >= 1

    def test_registry_not_found_is_error(self, tmp_path: Path) -> None:
        """Missing skill-registry.yaml should produce an error."""
        # A dist root must exist, otherwise get_dist_root() falls back to the
        # installed package's bundled pf._dist and finds a real registry.
        (tmp_path / "pennyfarthing-dist").mkdir()

        errors, warnings = validate_skill_registry(tmp_path)

        assert any("not found" in e.lower() or "missing" in e.lower() for e in errors)

    def test_schema_not_found_is_error(self, tmp_path: Path) -> None:
        """Missing skill-registry.schema.json should produce an error."""
        # Write registry but no schema
        _write_skill_registry(tmp_path, VALID_SKILL_REGISTRY)

        errors, warnings = validate_skill_registry(tmp_path)

        assert any("schema" in e.lower() for e in errors)

    def test_yaml_parse_error_is_error(self, tmp_path: Path) -> None:
        """Malformed YAML in registry should produce an error, not crash."""
        _write_skill_schema(tmp_path)
        _write_skill_registry(tmp_path, "version: [\ninvalid yaml")

        errors, warnings = validate_skill_registry(tmp_path)

        assert len(errors) >= 1


# =============================================================================
# AC2: Command file structural validation
# =============================================================================


class TestAC2CommandFileValidation:
    """Add command file structural validation for command files."""

    def test_valid_command_with_frontmatter_passes(self, tmp_path: Path) -> None:
        """Command with valid frontmatter and description should pass."""
        path = _write_command(tmp_path, "check.md", VALID_COMMAND_WITH_FRONTMATTER)

        errors, warnings = validate_command_file(path)

        assert errors == []

    def test_valid_agent_command_passes(self, tmp_path: Path) -> None:
        """Agent command with activation block should pass."""
        path = _write_command(tmp_path, "sm.md", VALID_AGENT_COMMAND)

        errors, warnings = validate_command_file(path)

        assert errors == []

    def test_missing_frontmatter_is_error(self, tmp_path: Path) -> None:
        """Command without YAML frontmatter should produce an error."""
        path = _write_command(tmp_path, "bad.md", COMMAND_MISSING_FRONTMATTER)

        errors, warnings = validate_command_file(path)

        assert any("frontmatter" in e.lower() for e in errors)

    def test_missing_description_in_frontmatter_is_error(self, tmp_path: Path) -> None:
        """Command with frontmatter but no description field should produce an error."""
        path = _write_command(tmp_path, "bad.md", COMMAND_MISSING_DESCRIPTION)

        errors, warnings = validate_command_file(path)

        assert any("description" in e.lower() for e in errors)

    def test_empty_description_is_error(self, tmp_path: Path) -> None:
        """Command with empty description should produce an error."""
        path = _write_command(tmp_path, "bad.md", COMMAND_EMPTY_DESCRIPTION)

        errors, warnings = validate_command_file(path)

        assert any("description" in e.lower() for e in errors)

    def test_empty_body_is_warning(self, tmp_path: Path) -> None:
        """Command with frontmatter but no body content should produce a warning."""
        path = _write_command(tmp_path, "bare.md", COMMAND_EMPTY_CONTENT)

        errors, warnings = validate_command_file(path)

        assert any("body" in w.lower() or "content" in w.lower() or "empty" in w.lower() for w in warnings)


# =============================================================================
# AC3: Integration into validation pipeline
# =============================================================================


class TestAC3PipelineIntegration:
    """Integration into validation pipeline (pf validate skill-command)."""

    def test_run_returns_validate_report(self, tmp_path: Path) -> None:
        """run() should return a ValidateReport with correct validator name."""
        _setup_project(tmp_path)
        _write_command(tmp_path, "check.md", VALID_COMMAND_WITH_FRONTMATTER)

        report = run(tmp_path, fix=False, strict=False)

        assert report.validator == "skill-command"

    def test_run_validates_both_registry_and_commands(self, tmp_path: Path) -> None:
        """run() should validate both skill registry and command files."""
        _setup_project(tmp_path)
        _write_command(tmp_path, "check.md", VALID_COMMAND_WITH_FRONTMATTER)
        _write_command(tmp_path, "sm.md", VALID_AGENT_COMMAND)

        report = run(tmp_path, fix=False, strict=False)

        # Registry (1) + commands (2) should all pass
        assert report.passed >= 3
        assert report.errors == []

    def test_run_reports_mixed_results(self, tmp_path: Path) -> None:
        """run() with valid registry but bad command should report correctly."""
        _setup_project(tmp_path)
        _write_command(tmp_path, "good.md", VALID_COMMAND_WITH_FRONTMATTER)
        _write_command(tmp_path, "bad.md", COMMAND_MISSING_FRONTMATTER)

        report = run(tmp_path, fix=False, strict=False)

        assert report.passed >= 1
        assert len(report.errors) >= 1


# =============================================================================
# AC4: Zero false positives against current codebase
# =============================================================================


class TestAC4ZeroFalsePositives:
    """Zero false positives against current codebase."""

    def test_real_skill_registry_passes(self) -> None:
        """Real skill-registry.yaml should pass validation with zero errors."""
        root = Path(__file__).resolve().parents[2]
        registry_path = root / "pennyfarthing-dist" / "skills" / "skill-registry.yaml"

        if not registry_path.is_file():
            pytest.skip("skill-registry.yaml not found (not in repo)")

        errors, warnings = validate_skill_registry(root)

        assert errors == [], (
            f"Real skill-registry.yaml has {len(errors)} errors:\n"
            + "\n".join(errors)
        )

    def test_real_command_files_pass(self) -> None:
        """All real command files should pass validation with zero errors."""
        root = Path(__file__).resolve().parents[2]
        commands_dir = root / "pennyfarthing-dist" / "commands"

        if not commands_dir.is_dir():
            pytest.skip("commands/ directory not found (not in repo)")

        report = run(root, fix=False, strict=False)

        assert report.errors == [], (
            f"Real files have {len(report.errors)} errors:\n"
            + "\n".join(d for d in report.details if "[ERROR]" in d)
        )

    def test_real_command_file_count(self) -> None:
        """Expected number of command files are discovered."""
        root = Path(__file__).resolve().parents[2]
        commands_dir = root / "pennyfarthing-dist" / "commands"

        if not commands_dir.is_dir():
            pytest.skip("commands/ directory not found (not in repo)")

        files = discover_command_files(commands_dir)

        # Should find at least 40 command files (currently ~46)
        assert len(files) >= 40, f"Expected >= 40 command files, found {len(files)}"


# =============================================================================
# AC5: --strict promotes warnings to errors
# =============================================================================


class TestAC5StrictMode:
    """--strict promotes warnings to errors."""

    def test_warning_not_error_in_normal_mode(self, tmp_path: Path) -> None:
        """Warnings should remain as warnings in normal mode."""
        _setup_project(tmp_path)
        _write_command(tmp_path, "bare.md", COMMAND_EMPTY_CONTENT)

        report = run(tmp_path, fix=False, strict=False)

        assert report.warnings >= 1
        # The command itself shouldn't be an error (only warning)
        cmd_errors = [d for d in report.details if "[ERROR]" in d and "bare.md" in d]
        assert len(cmd_errors) == 0

    def test_warning_becomes_error_in_strict_mode(self, tmp_path: Path) -> None:
        """Warnings should be promoted to errors in strict mode."""
        _setup_project(tmp_path)
        _write_command(tmp_path, "bare.md", COMMAND_EMPTY_CONTENT)

        report = run(tmp_path, fix=False, strict=True)

        assert len(report.errors) >= 1
        assert any("[ERROR]" in d and "bare.md" in d for d in report.details)


# =============================================================================
# AC6: CLI registration in VALIDATORS dict
# =============================================================================


class TestAC6CLIRegistration:
    """skill-command is registered in the VALIDATORS dict."""

    def test_skill_command_in_validators_registry(self) -> None:
        """'skill-command' key should exist in the VALIDATORS dict."""
        from pf.validate.cli import VALIDATORS

        assert "skill-command" in VALIDATORS

    def test_skill_command_validator_module_path(self) -> None:
        """skill-command validator should point to the correct module path."""
        from pf.validate.cli import VALIDATORS

        assert VALIDATORS["skill-command"] == "pf.validate.adapters.skill_command"


# =============================================================================
# AC7: Discovery — finds all skill and command files
# =============================================================================


class TestAC7Discovery:
    """Discovery of skill registry and command files."""

    def test_discover_skill_registry_found(self, tmp_path: Path) -> None:
        """Should locate skill-registry.yaml when present."""
        _write_skill_registry(tmp_path, VALID_SKILL_REGISTRY)

        path = discover_skill_registry(tmp_path)

        assert path is not None
        assert path.name == "skill-registry.yaml"

    def test_discover_skill_registry_missing(self, tmp_path: Path) -> None:
        """Should return None when skill-registry.yaml is absent."""
        # A dist root must exist, otherwise get_dist_root() falls back to the
        # installed package's bundled pf._dist and finds a real registry.
        (tmp_path / "pennyfarthing-dist").mkdir()

        path = discover_skill_registry(tmp_path)

        assert path is None

    def test_discover_command_files_found(self, tmp_path: Path) -> None:
        """Should find all .md files in commands directory."""
        _write_command(tmp_path, "check.md", VALID_COMMAND_WITH_FRONTMATTER)
        _write_command(tmp_path, "sm.md", VALID_AGENT_COMMAND)
        _write_command(tmp_path, "work.md", VALID_COMMAND_WITH_FRONTMATTER)
        commands_dir = tmp_path / "pennyfarthing-dist" / "commands"

        files = discover_command_files(commands_dir)
        names = {f.name for f in files}

        assert "check.md" in names
        assert "sm.md" in names
        assert "work.md" in names

    def test_discover_command_files_empty_dir(self, tmp_path: Path) -> None:
        """Should return empty list for empty commands directory."""
        commands_dir = tmp_path / "pennyfarthing-dist" / "commands"
        commands_dir.mkdir(parents=True, exist_ok=True)

        files = discover_command_files(commands_dir)

        assert files == []

    def test_discover_command_files_only_md(self, tmp_path: Path) -> None:
        """Should only find .md files, not other file types."""
        _write_command(tmp_path, "check.md", VALID_COMMAND_WITH_FRONTMATTER)
        commands_dir = tmp_path / "pennyfarthing-dist" / "commands"
        (commands_dir / "not-a-command.txt").write_text("ignore me")
        (commands_dir / "also-not.json").write_text("{}")

        files = discover_command_files(commands_dir)

        assert len(files) == 1
        assert files[0].name == "check.md"


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_run_missing_commands_dir_still_validates_registry(self, tmp_path: Path) -> None:
        """run() should validate registry even if commands/ doesn't exist."""
        _setup_project(tmp_path)
        # No commands directory created

        report = run(tmp_path, fix=False, strict=False)

        # Registry should still validate — just no command results
        assert report.passed >= 1

    def test_run_missing_skills_dir_still_validates_commands(self, tmp_path: Path) -> None:
        """run() should validate commands even if skills/ doesn't exist."""
        _write_command(tmp_path, "check.md", VALID_COMMAND_WITH_FRONTMATTER)
        # No skills directory created

        report = run(tmp_path, fix=False, strict=False)

        # Should report missing registry as error, but commands should still pass
        assert len(report.errors) >= 1  # Missing registry
        assert report.passed >= 1  # Command validated

    def test_report_details_use_error_prefix(self, tmp_path: Path) -> None:
        """Error details should contain [ERROR] prefix."""
        _setup_project(tmp_path, SKILL_REGISTRY_MISSING_VERSION)

        report = run(tmp_path, fix=False, strict=False)

        error_details = [d for d in report.details if "[ERROR]" in d]
        assert len(error_details) >= 1

    def test_report_details_use_warn_prefix(self, tmp_path: Path) -> None:
        """Warning details should contain [WARN] prefix."""
        _setup_project(tmp_path)
        _write_command(tmp_path, "bare.md", COMMAND_EMPTY_CONTENT)

        report = run(tmp_path, fix=False, strict=False)

        warn_details = [d for d in report.details if "[WARN]" in d]
        assert len(warn_details) >= 1

    def test_report_details_include_filenames(self, tmp_path: Path) -> None:
        """Report details should include relevant filenames."""
        _setup_project(tmp_path)
        _write_command(tmp_path, "bad.md", COMMAND_MISSING_FRONTMATTER)

        report = run(tmp_path, fix=False, strict=False)

        assert any("bad.md" in d for d in report.details)

    def test_skill_registry_malformed_yaml_not_crash(self, tmp_path: Path) -> None:
        """Malformed YAML should produce an error, not crash the validator."""
        _write_skill_schema(tmp_path)
        _write_skill_registry(tmp_path, "skills:\n  - [broken yaml\n  :")

        errors, warnings = validate_skill_registry(tmp_path)

        assert len(errors) >= 1
