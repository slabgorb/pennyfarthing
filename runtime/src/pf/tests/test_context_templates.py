"""Tests for context template generator.

Story: PROJ-15684 (129-4) — Generate Context Document Templates from Schema
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.context.cli import context
from pf.context.templates import (
    file_extension,
    generate_component_template,
    generate_templates,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def schema_path() -> Path:
    return Path(__file__).resolve().parents[3] / "schemas" / "context-schema.yaml"


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# AC2: Generate blank template files for each component
# =============================================================================


class TestGenerateTemplates:
    """generate_templates must create files for all components."""

    def test_generates_all_components(self, tmp_path: Path, schema_path: Path) -> None:
        """Should generate a template file for every component in the schema."""
        written = generate_templates(tmp_path, schema_path=schema_path)

        assert len(written) > 0
        # Schema has 10 components
        assert len(written) == 10

    def test_creates_output_directory(self, tmp_path: Path, schema_path: Path) -> None:
        """Should create the output directory if it doesn't exist."""
        out = tmp_path / "nested" / "templates"
        generate_templates(out, schema_path=schema_path)

        assert out.exists()
        assert out.is_dir()

    def test_files_have_content(self, tmp_path: Path, schema_path: Path) -> None:
        """Generated files should not be empty."""
        written = generate_templates(tmp_path, schema_path=schema_path)

        for p in written:
            assert p.stat().st_size > 0, f"{p.name} is empty"

    def test_no_overwrite_by_default(self, tmp_path: Path, schema_path: Path) -> None:
        """Should not overwrite existing files by default."""
        generate_templates(tmp_path, schema_path=schema_path)
        first_run = {p.name for p in tmp_path.iterdir() if p.is_file()}

        # Second run should skip existing files
        written = generate_templates(tmp_path, schema_path=schema_path)

        assert len(written) == 0
        # Files still exist
        second_run = {p.name for p in tmp_path.iterdir() if p.is_file()}
        assert first_run == second_run

    def test_overwrite_flag(self, tmp_path: Path, schema_path: Path) -> None:
        """--overwrite should replace existing files."""
        generate_templates(tmp_path, schema_path=schema_path)
        written = generate_templates(tmp_path, schema_path=schema_path, overwrite=True)

        assert len(written) == 10


# =============================================================================
# AC3: Support all component types
# =============================================================================


class TestComponentTypes:
    """Templates must be generated for all component types."""

    def test_structured_template(self) -> None:
        """Structured component should produce YAML with field stubs."""
        schema = {
            "description": "Test structured",
            "type": "structured",
            "fields": {
                "state": {
                    "type": "enum",
                    "values": ["A", "B"],
                    "required": True,
                },
                "name": {
                    "type": "string",
                    "required": False,
                },
            },
        }
        result = generate_component_template("test", schema)

        assert "state:" in result
        assert "name:" in result
        assert "A" in result  # First enum value as default

    def test_markdown_template(self) -> None:
        """Markdown component should produce sections from validation rules."""
        schema = {
            "description": "Test markdown",
            "type": "markdown",
            "validation": {
                "min_length": 100,
                "required_sections": ["role"],
                "recommended_sections": ["helpers"],
            },
        }
        result = generate_component_template("test", schema)

        assert "<role>" in result
        assert "</role>" in result
        assert "<helpers>" in result
        assert "100" in result  # min_length mentioned

    def test_text_template(self) -> None:
        """Text component should include pattern and field documentation."""
        schema = {
            "description": "Test text",
            "type": "text",
            "validation": {
                "pattern": "^Sprint \\d+:",
                "required_fields": ["path", "type"],
            },
        }
        result = generate_component_template("test", schema)

        assert "Sprint" in result
        assert "path" in result
        assert "type" in result

    def test_formatted_text_template(self) -> None:
        """Formatted text should include field stubs."""
        schema = {
            "description": "Test formatted",
            "type": "formatted_text",
            "fields": {
                "character": {"type": "string", "required": True},
                "style": {"type": "string", "required": True},
            },
        }
        result = generate_component_template("test", schema)

        assert "character:" in result
        assert "style:" in result

    def test_collection_template(self) -> None:
        """Collection should produce item stubs with recommended tags."""
        schema = {
            "description": "Test collection",
            "type": "collection",
            "items": {
                "patterns.md": {
                    "description": "Patterns file",
                    "validation": {"recommended_tags": ["pattern"]},
                },
            },
        }
        result = generate_component_template("test", schema)

        assert "patterns.md:" in result
        assert "<pattern" in result


# =============================================================================
# AC4: Templates include inline documentation
# =============================================================================


class TestInlineDocumentation:
    """Templates must include helpful comments specific to each component."""

    def test_structured_has_field_comments(self) -> None:
        """Structured templates should document field types and requirements."""
        schema = {
            "type": "structured",
            "description": "Workflow state",
            "fields": {
                "state": {
                    "type": "enum",
                    "values": ["A"],
                    "required": True,
                    "description": "Current state",
                },
            },
        }
        result = generate_component_template("workflow_state", schema)

        assert "required" in result.lower()
        assert "enum" in result.lower()

    def test_markdown_has_section_comments(self) -> None:
        """Markdown templates should document required vs recommended sections."""
        schema = {
            "type": "markdown",
            "description": "Agent def",
            "validation": {
                "required_sections": ["role"],
                "recommended_sections": ["exit"],
            },
        }
        result = generate_component_template("agent_definition", schema)

        assert "Required section" in result
        assert "Recommended section" in result

    def test_text_has_pattern_comment(self) -> None:
        """Text templates should document the expected pattern."""
        schema = {
            "type": "text",
            "description": "Sprint context",
            "validation": {
                "pattern": "^Sprint \\d+:",
                "description": "Must start with Sprint N:",
            },
        }
        result = generate_component_template("sprint_context", schema)

        assert "Pattern:" in result
        assert "Sprint" in result

    def test_component_description_included(self) -> None:
        """All templates should include the component description."""
        schema = {
            "type": "text",
            "description": "My specific component description",
        }
        result = generate_component_template("test", schema)

        assert "My specific component description" in result


# =============================================================================
# AC5: --tier filter
# =============================================================================


class TestTierFilter:
    """Template generation must support tier filtering."""

    def test_full_tier_generates_all(self, tmp_path: Path, schema_path: Path) -> None:
        """FULL tier should generate templates for all 9 components in FULL."""
        written = generate_templates(tmp_path, tier="FULL", schema_path=schema_path)

        names = {p.stem for p in written}
        assert "workflow_state" in names
        assert "agent_definition" in names
        assert "behavior_guide" in names

    def test_minimal_tier_generates_one(self, tmp_path: Path, schema_path: Path) -> None:
        """MINIMAL tier should generate only workflow_state."""
        written = generate_templates(tmp_path, tier="MINIMAL", schema_path=schema_path)

        assert len(written) == 1
        assert written[0].stem == "workflow_state"

    def test_refresh_tier_subset(self, tmp_path: Path, schema_path: Path) -> None:
        """REFRESH tier should generate a subset of components."""
        written = generate_templates(tmp_path, tier="REFRESH", schema_path=schema_path)

        names = {p.stem for p in written}
        assert "workflow_state" in names
        assert "sprint_context" in names
        # REFRESH has 4 components
        assert len(written) == 4

    def test_invalid_tier_raises(self, tmp_path: Path, schema_path: Path) -> None:
        """Invalid tier name should raise ValueError."""
        with pytest.raises(ValueError):
            generate_templates(tmp_path, tier="NONEXISTENT", schema_path=schema_path)


# =============================================================================
# AC6: Output directory and --output option
# =============================================================================


class TestFileExtensions:
    """Components should get appropriate file extensions."""

    def test_structured_gets_yaml(self) -> None:
        assert file_extension({"type": "structured"}) == ".yaml"

    def test_markdown_gets_md(self) -> None:
        assert file_extension({"type": "markdown"}) == ".md"

    def test_text_gets_txt(self) -> None:
        assert file_extension({"type": "text"}) == ".txt"

    def test_formatted_text_gets_txt(self) -> None:
        assert file_extension({"type": "formatted_text"}) == ".txt"

    def test_collection_gets_yaml(self) -> None:
        assert file_extension({"type": "collection"}) == ".yaml"

    def test_unknown_type_defaults_to_txt(self) -> None:
        assert file_extension({"type": "unknown"}) == ".txt"


# =============================================================================
# AC1: CLI command exists
# =============================================================================


class TestCLICommand:
    """pf context template CLI command."""

    def test_template_subcommand_exists(self) -> None:
        """template should be a subcommand of context."""
        import click

        cmd = context.get_command(click.Context(context), "template")
        assert cmd is not None

    def test_template_generates_files(self, runner: CliRunner, tmp_path: Path) -> None:
        """Running template should create files."""
        result = runner.invoke(context, ["template", "-o", str(tmp_path)])

        assert result.exit_code == 0
        assert "Generated" in result.output
        assert len(list(tmp_path.iterdir())) > 0

    def test_template_with_tier(self, runner: CliRunner, tmp_path: Path) -> None:
        """--tier flag should filter components."""
        result = runner.invoke(context, ["template", "--tier", "MINIMAL", "-o", str(tmp_path)])

        assert result.exit_code == 0
        files = list(tmp_path.iterdir())
        assert len(files) == 1

    def test_template_overwrite(self, runner: CliRunner, tmp_path: Path) -> None:
        """--overwrite should regenerate files."""
        runner.invoke(context, ["template", "-o", str(tmp_path)])
        result = runner.invoke(context, ["template", "-o", str(tmp_path), "--overwrite"])

        assert result.exit_code == 0
        assert "Generated" in result.output

    def test_template_no_overwrite_message(self, runner: CliRunner, tmp_path: Path) -> None:
        """Without --overwrite, should report no files generated."""
        runner.invoke(context, ["template", "-o", str(tmp_path)])
        result = runner.invoke(context, ["template", "-o", str(tmp_path)])

        assert result.exit_code == 0
        assert "No templates generated" in result.output

    def test_template_invalid_tier(self, runner: CliRunner, tmp_path: Path) -> None:
        """Invalid tier should be rejected by Click choice."""
        result = runner.invoke(context, ["template", "--tier", "BOGUS", "-o", str(tmp_path)])

        assert result.exit_code != 0


# =============================================================================
# Integration: real schema produces correct files
# =============================================================================


class TestRealSchemaIntegration:
    """Templates from the real schema should be well-formed."""

    def test_workflow_state_yaml(self, tmp_path: Path, schema_path: Path) -> None:
        """workflow_state template should be valid YAML-like content."""
        generate_templates(tmp_path, tier="MINIMAL", schema_path=schema_path)

        ws = tmp_path / "workflow_state.yaml"
        assert ws.exists()
        content = ws.read_text()
        assert "state:" in content
        assert "NEW_WORK_STATE" in content

    def test_agent_definition_md(self, tmp_path: Path, schema_path: Path) -> None:
        """agent_definition template should be markdown with role section."""
        generate_templates(tmp_path, schema_path=schema_path)

        ad = tmp_path / "agent_definition.md"
        assert ad.exists()
        content = ad.read_text()
        assert "<role>" in content

    def test_sidecars_yaml(self, tmp_path: Path, schema_path: Path) -> None:
        """sidecars template should list items with recommended tags."""
        generate_templates(tmp_path, schema_path=schema_path)

        sc = tmp_path / "sidecars.yaml"
        assert sc.exists()
        content = sc.read_text()
        assert "patterns.md:" in content
        assert "<pattern" in content
