"""
Tests for Story 130-2: /pf-context create story Skill (PM-Only Mode).

Validates that the pf-context skill supports story context creation with:
  AC1: Skill definition includes story creation section
  AC2: Story context template exists with required sections
  AC3: Skill args register story creation command
  AC4: Skill instructions validate parent epic context
  AC5: Skill writes correct frontmatter and output location

Run with: python -m pytest tests/python/test_context_story_skill.py -v
"""

from pathlib import Path

import pytest
import yaml

# Project root is pennyfarthing/ (2 levels up from tests/python/)
PROJECT_ROOT = Path(__file__).parent.parent.parent


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def skill_path():
    """Path to the pf-context skill definition."""
    return PROJECT_ROOT / "pennyfarthing-dist" / "skills" / "pf-context" / "skill.md"


@pytest.fixture
def skill_content(skill_path):
    """Read the pf-context skill definition."""
    assert skill_path.exists(), f"Skill file not found: {skill_path}"
    return skill_path.read_text()


@pytest.fixture
def template_dir():
    """Path to the templates directory."""
    return PROJECT_ROOT / "pennyfarthing-dist" / "templates"


@pytest.fixture
def schema_path(template_dir):
    """Path to the context schema."""
    return template_dir / "context-schema.yaml"


@pytest.fixture
def schema(schema_path):
    """Parsed context schema."""
    assert schema_path.exists(), f"Schema not found: {schema_path}"
    return yaml.safe_load(schema_path.read_text())


@pytest.fixture
def story_template_path(template_dir):
    """Path to the story context template."""
    return template_dir / "context-story-template.md"


# =============================================================================
# AC1: Skill definition includes story creation section
# =============================================================================


class TestAC1SkillContainsStorySection:
    """The skill.md must have a dedicated section for creating story context."""

    def test_skill_has_create_story_context_heading(self, skill_content):
        """Skill must contain a '## Create Story Context' section."""
        assert "## Create Story Context" in skill_content, (
            "Skill definition missing '## Create Story Context' section. "
            "The skill only supports epic creation — story creation must be added."
        )

    def test_skill_quick_reference_includes_story(self, skill_content):
        """Quick Reference table must list the story creation command."""
        # Look for a row mentioning "create story" in the quick reference
        assert "create story" in skill_content.lower(), (
            "Skill definition does not mention 'create story' anywhere. "
            "The Quick Reference table and instructions must include story creation."
        )


# =============================================================================
# AC2: Story context template exists with required sections
# =============================================================================


class TestAC2StoryTemplateExists:
    """A story context template must exist with schema-required sections."""

    def test_story_template_file_exists(self, story_template_path):
        """Template file context-story-template.md must exist in templates/."""
        assert story_template_path.exists(), (
            f"Story context template not found at {story_template_path}. "
            "Must create context-story-template.md matching context-schema.yaml story sections."
        )

    def test_story_template_has_required_sections(self, story_template_path, schema):
        """Template must contain headings for all required story sections."""
        if not story_template_path.exists():
            pytest.fail("Story template does not exist yet — cannot check sections.")

        content = story_template_path.read_text()
        required = schema["story"]["required_sections"]

        missing = [s for s in required if f"## {s}" not in content]
        assert not missing, (
            f"Story template missing required section headings: {missing}. "
            f"Schema requires: {required}"
        )

    def test_story_template_has_frontmatter_placeholder(self, story_template_path, schema):
        """Template must include frontmatter with parent field placeholder."""
        if not story_template_path.exists():
            pytest.fail("Story template does not exist yet — cannot check frontmatter.")

        content = story_template_path.read_text()
        required_fm = schema["story"]["required_frontmatter"]

        for field in required_fm:
            assert field in content, (
                f"Story template missing required frontmatter field '{field}'. "
                f"Schema requires frontmatter: {required_fm}"
            )


# =============================================================================
# AC3: Skill args register story creation command
# =============================================================================


class TestAC3SkillArgsRegisterStory:
    """Skill frontmatter must register the story creation command."""

    def test_skill_frontmatter_includes_story_args(self, skill_content):
        """Skill frontmatter 'args' field must include story creation."""
        # Extract YAML frontmatter between --- markers
        parts = skill_content.split("---")
        assert len(parts) >= 3, "Skill file missing YAML frontmatter (--- delimiters)"

        frontmatter = yaml.safe_load(parts[1])
        args = frontmatter.get("args", "")

        # The args field should mention story creation
        # Current: args: "create epic {id}" — needs to also include story
        assert "story" in args.lower(), (
            f"Skill frontmatter args='{args}' does not include story creation. "
            "Must register 'create story {{id}}' in the args field."
        )


# =============================================================================
# AC4: Skill instructions validate parent epic context
# =============================================================================


class TestAC4SkillValidatesParentEpic:
    """Story creation instructions must validate parent epic context exists."""

    def test_skill_checks_parent_epic_exists(self, skill_content):
        """Skill must instruct checking that parent epic context exists."""
        # The story creation section must mention validating parent epic
        story_section = _extract_story_section(skill_content)
        assert story_section is not None, (
            "Cannot find story creation section in skill to check for parent epic validation."
        )

        # Must mention checking epic context exists
        lower = story_section.lower()
        assert "epic" in lower and ("exist" in lower or "parent" in lower or "context-epic" in lower), (
            "Story creation section does not mention validating parent epic context. "
            "Must check sprint/context/context-epic-{N}.md exists before creating story context."
        )

    def test_skill_fails_on_missing_epic(self, skill_content):
        """Skill must instruct failing with clear message if parent epic missing."""
        story_section = _extract_story_section(skill_content)
        assert story_section is not None, (
            "Cannot find story creation section in skill."
        )

        lower = story_section.lower()
        assert "fail" in lower or "error" in lower or "missing" in lower, (
            "Story creation section does not mention failing on missing parent epic. "
            "Must fail with clear message when parent epic context doesn't exist."
        )


# =============================================================================
# AC5: Skill writes correct frontmatter and output location
# =============================================================================


class TestAC5SkillOutputFormat:
    """Skill must instruct correct frontmatter and output path for story context."""

    def test_skill_writes_parent_frontmatter(self, skill_content):
        """Skill must instruct writing frontmatter with parent field."""
        story_section = _extract_story_section(skill_content)
        assert story_section is not None, (
            "Cannot find story creation section in skill."
        )

        assert "parent" in story_section.lower(), (
            "Story creation section does not mention 'parent' frontmatter field. "
            "Must write frontmatter with parent: context-epic-{N}.md"
        )

    def test_skill_outputs_to_correct_location(self, skill_content):
        """Skill must instruct writing to sprint/context/context-story-{id}.md."""
        story_section = _extract_story_section(skill_content)
        assert story_section is not None, (
            "Cannot find story creation section in skill."
        )

        assert "context-story-" in story_section, (
            "Story creation section does not mention output path 'context-story-{id}.md'. "
            "Must write to sprint/context/context-story-{id}.md"
        )

    def test_skill_reads_schema(self, skill_content):
        """Skill must instruct reading context-schema.yaml for section requirements."""
        story_section = _extract_story_section(skill_content)
        assert story_section is not None, (
            "Cannot find story creation section in skill."
        )

        assert "context-schema" in story_section.lower() or "schema" in story_section.lower(), (
            "Story creation section does not mention reading context-schema.yaml. "
            "Must read schema for required sections (ADR-0029 Rule #2)."
        )


# =============================================================================
# Helpers
# =============================================================================


def _extract_story_section(skill_content: str) -> str | None:
    """Extract the '## Create Story Context' section from skill.md.

    Returns the section content from the heading to the next ## heading,
    or None if the section doesn't exist.
    """
    marker = "## Create Story Context"
    idx = skill_content.find(marker)
    if idx == -1:
        return None

    # Find the next ## heading after this one
    rest = skill_content[idx + len(marker):]
    next_heading = rest.find("\n## ")
    if next_heading == -1:
        return rest
    return rest[:next_heading]
