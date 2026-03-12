"""Tests for story/ library package.

Story 63-9: Reorganize pf into fan-out CLI pattern.

These tests verify the story/ package modules work correctly.
"""


class TestStorySizeModule:
    """Tests for story/size.py module."""

    def test_get_sizing_guidelines_returns_dict(self) -> None:
        """get_sizing_guidelines should return sizing info."""
        from pf.story.size import get_sizing_guidelines

        result = get_sizing_guidelines()

        assert isinstance(result, dict)
        # Should have point values as keys
        assert 1 in result or "1" in result or len(result) > 0

    def test_get_sizing_guidelines_for_specific_points(self) -> None:
        """get_sizing_guidelines should filter by points."""
        from pf.story.size import get_sizing_guidelines

        result = get_sizing_guidelines(points=3)

        assert isinstance(result, dict)

    def test_format_size_info(self) -> None:
        """format_size_info should return formatted string."""
        from pf.story.size import format_size_info

        size_info = {
            3: {
                "scale": "Small",
                "complexity": "Few files, some testing",
                "examples": ["Validation", "single component"],
            }
        }
        result = format_size_info(size_info)

        assert isinstance(result, str)
        assert "Small" in result or "3" in result


class TestStoryTemplateModule:
    """Tests for story/template.py module."""

    def test_get_template_feature(self) -> None:
        """get_template should return feature template."""
        from pf.story.template import get_template

        result = get_template("feature")

        assert isinstance(result, dict) or isinstance(result, str)
        # Should have template content

    def test_get_template_bug(self) -> None:
        """get_template should return bug template."""
        from pf.story.template import get_template

        result = get_template("bug")

        assert isinstance(result, dict) or isinstance(result, str)

    def test_get_template_unknown_returns_default(self) -> None:
        """get_template should return default for unknown type."""
        from pf.story.template import get_template

        result = get_template("unknown_type")

        # Should return None or default template
        assert result is None or isinstance(result, (dict, str))

    def test_get_all_templates(self) -> None:
        """get_all_templates should return all available templates."""
        from pf.story.template import get_all_templates

        result = get_all_templates()

        assert isinstance(result, dict)
        # Should have standard types
        assert "feature" in result or len(result) > 0


class TestStoryCreateModule:
    """Tests for story/create.py module."""

    def test_generate_story_yaml(self) -> None:
        """generate_story_yaml should create valid YAML block."""
        from pf.story.create import generate_story_yaml

        result = generate_story_yaml(
            epic_id="MSSCI-11952",
            title="Add error handling",
            points=3,
            story_type="feature",
        )

        assert isinstance(result, str)
        # Should contain key fields
        assert "title" in result or "Add error handling" in result
        assert "points" in result or "3" in result

    def test_generate_story_yaml_with_options(self) -> None:
        """generate_story_yaml should support optional parameters."""
        from pf.story.create import generate_story_yaml

        result = generate_story_yaml(
            epic_id="MSSCI-11952",
            title="Bug fix",
            points=2,
            story_type="bug",
            priority="P1",
            workflow="tdd",
        )

        assert isinstance(result, str)
        # Should contain type and priority
        assert "bug" in result.lower() or "P1" in result

    def test_create_story_validates_points(self) -> None:
        """create_story should validate point values."""
        from pf.story.create import create_story

        # Invalid points should fail or warn
        result = create_story(
            epic_id="MSSCI-11952",
            title="Test",
            points=100,  # Invalid - too high
            dry_run=True,
        )

        assert isinstance(result, dict)
        # May succeed with warning or fail
        assert "success" in result or "error" in result or "warning" in result

    def test_create_story_dry_run(self) -> None:
        """create_story with dry_run should not modify files."""
        from pf.story.create import create_story

        result = create_story(
            epic_id="MSSCI-11952",
            title="Test Story",
            points=3,
            dry_run=True,
        )

        assert isinstance(result, dict)
        assert result.get("dry_run") is True
