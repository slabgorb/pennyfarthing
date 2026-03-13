"""Tests for demo script generator (story 145-4).

Tests validate generate_demo_script() against all 8 ACs.
Each AC maps to a test class. Tests are in RED state — stub raises NotImplementedError.

Run with: python -m pytest tests/python/test_demo_script_generator.py -v
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.demo.models import GeneratedContent, StoryType  # noqa: E402
from pf.demo.script_generator import generate_demo_script  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_content(
    *,
    story_type: StoryType = StoryType.BACKEND,
    story_id: str = "99-1",
    demo_script: str = (
        "Today we built a new API endpoint for user management. "
        "The system now handles user creation, updates, and deletion "
        "through a clean REST interface. Previously, user operations "
        "required direct database access."
    ),
    problem_statement: str = "Users had to manually edit the database to manage accounts.",
    what_changed: str = "Added a REST API with full CRUD operations for user management.",
    why_this_approach: str = "REST provides a standard interface that all clients can consume.",
    before_after: str | None = None,
    diagram_source: str | None = None,
    slide_outline: list[dict] | None = None,
) -> GeneratedContent:
    """Create a GeneratedContent with sensible defaults for testing."""
    return GeneratedContent(
        problem_statement=problem_statement,
        what_changed=what_changed,
        why_this_approach=why_this_approach,
        before_after=before_after,
        demo_script=demo_script,
        diagram_source=diagram_source,
        slide_outline=slide_outline or [
            {"title": "Problem", "bullets": ["Manual DB edits"], "speaker_notes": "Explain pain"},
            {"title": "Solution", "bullets": ["REST API"], "speaker_notes": "Show endpoint"},
        ],
        story_type=story_type,
        story_id=story_id,
    )


def _make_ui_content(**kwargs: Any) -> GeneratedContent:
    """Create UI-type GeneratedContent."""
    defaults = {
        "story_type": StoryType.UI,
        "demo_script": (
            "We redesigned the settings screen with a new tabbed layout. "
            "Users can now navigate between General, Notifications, and Privacy "
            "tabs without page reloads. The save button provides instant feedback."
        ),
        "problem_statement": "Settings were spread across multiple pages, causing confusion.",
        "what_changed": "Consolidated settings into a single tabbed interface.",
    }
    defaults.update(kwargs)
    return _make_content(**defaults)


def _make_refactor_content(**kwargs: Any) -> GeneratedContent:
    """Create Refactor-type GeneratedContent."""
    defaults = {
        "story_type": StoryType.REFACTOR,
        "demo_script": (
            "We simplified the authentication middleware from a monolithic "
            "function into three focused modules. The login flow is now "
            "30% faster and easier to extend."
        ),
        "before_after": "Before: single 500-line auth handler. After: three focused modules.",
        "problem_statement": "Auth middleware was a 500-line monolith, hard to test or extend.",
        "what_changed": "Split into token-validator, session-manager, and permission-checker modules.",
    }
    defaults.update(kwargs)
    return _make_content(**defaults)


def _make_bugfix_content(**kwargs: Any) -> GeneratedContent:
    """Create Bugfix-type GeneratedContent."""
    defaults = {
        "story_type": StoryType.BUGFIX,
        "demo_script": (
            "We fixed a crash that occurred when users with special characters "
            "in their names tried to log in. The system now properly escapes "
            "all user input during authentication."
        ),
        "before_after": "Before: crash on special chars. After: proper escaping.",
        "problem_statement": "Users with special characters in names couldn't log in.",
        "what_changed": "Added input escaping in the authentication pipeline.",
    }
    defaults.update(kwargs)
    return _make_content(**defaults)


def _make_infra_content(**kwargs: Any) -> GeneratedContent:
    """Create Infrastructure-type GeneratedContent."""
    defaults = {
        "story_type": StoryType.INFRASTRUCTURE,
        "demo_script": (
            "We automated the deployment pipeline so code changes go from "
            "merge to production in under 10 minutes. The new pipeline includes "
            "automated testing, staging validation, and blue-green deployment."
        ),
        "problem_statement": "Deployments were manual and took over an hour.",
        "what_changed": "Automated CI/CD pipeline with blue-green deployment.",
        "diagram_source": "graph LR\n  A[Merge] --> B[Test] --> C[Stage] --> D[Prod]",
    }
    defaults.update(kwargs)
    return _make_content(**defaults)


# ---------------------------------------------------------------------------
# AC1: Parse GeneratedContent.demo_script field from Generator output
# ---------------------------------------------------------------------------


class TestParsesDemoScript:
    """AC1: The generator consumes the demo_script field from GeneratedContent."""

    def test_uses_demo_script_content(self) -> None:
        """Output contains content derived from the demo_script field."""
        content = _make_content(
            demo_script="We built a revolutionary new widget for the dashboard."
        )
        result = generate_demo_script(content)
        assert result["success"] is True
        # The demo_script content should appear in the output
        assert "widget" in result["data"].lower() or "dashboard" in result["data"].lower()

    def test_empty_demo_script_returns_error(self) -> None:
        """Empty demo_script field returns an error — no partial output."""
        content = _make_content(demo_script="")
        result = generate_demo_script(content)
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)

    def test_uses_problem_statement(self) -> None:
        """Output incorporates the problem_statement for setup context."""
        content = _make_content(
            problem_statement="The system crashed every Tuesday at noon."
        )
        result = generate_demo_script(content)
        assert result["success"] is True
        # Problem context should appear somewhere in the script
        assert "crash" in result["data"].lower() or "tuesday" in result["data"].lower()

    def test_uses_what_changed(self) -> None:
        """Output incorporates the what_changed summary."""
        content = _make_content(
            what_changed="Replaced the legacy scheduler with a cron-based solution."
        )
        result = generate_demo_script(content)
        assert result["success"] is True
        assert "scheduler" in result["data"].lower() or "cron" in result["data"].lower()


# ---------------------------------------------------------------------------
# AC2: Structure output as Markdown with scene breakdowns
# ---------------------------------------------------------------------------


class TestSceneStructure:
    """AC2: Output is Markdown with scene breakdowns (Setup, Act 1, Act 2, Closing)."""

    def test_output_is_markdown_string(self) -> None:
        """Result data is a string containing Markdown."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert isinstance(result["data"], str)

    def test_has_title_heading(self) -> None:
        """Output starts with a title heading containing the story ID."""
        content = _make_content(story_id="145-4")
        result = generate_demo_script(content)
        assert result["success"] is True
        assert "# " in result["data"]
        assert "145-4" in result["data"]

    def test_has_setup_scene(self) -> None:
        """Output contains a Setup scene."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert re.search(r"##\s+.*setup", result["data"], re.IGNORECASE)

    def test_has_act_1_scene(self) -> None:
        """Output contains an Act 1 scene."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert re.search(r"##\s+.*act\s*1", result["data"], re.IGNORECASE)

    def test_has_act_2_scene(self) -> None:
        """Output contains an Act 2 scene."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert re.search(r"##\s+.*act\s*2", result["data"], re.IGNORECASE)

    def test_has_closing_scene(self) -> None:
        """Output contains a Closing scene."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert re.search(r"##\s+.*closing", result["data"], re.IGNORECASE)

    def test_scenes_have_presenter_directions(self) -> None:
        """Each scene has presenter directions (says/show/click markers)."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        # Should contain at least some presenter direction markers
        direction_patterns = [
            r"\*\*Presenter says:\*\*",
            r"\*\*Show:\*\*",
        ]
        found = sum(1 for p in direction_patterns if re.search(p, md))
        assert found >= 1, f"Expected presenter directions, got none in output"

    def test_scenes_in_order(self) -> None:
        """Scenes appear in order: Setup → Act 1 → Act 2 → Closing."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        setup_pos = re.search(r"setup", md, re.IGNORECASE)
        act1_pos = re.search(r"act\s*1", md, re.IGNORECASE)
        act2_pos = re.search(r"act\s*2", md, re.IGNORECASE)
        closing_pos = re.search(r"closing", md, re.IGNORECASE)
        assert setup_pos and act1_pos and act2_pos and closing_pos, "Missing scenes"
        assert setup_pos.start() < act1_pos.start() < act2_pos.start() < closing_pos.start()


# ---------------------------------------------------------------------------
# AC3: Story-type-specific formatting
# ---------------------------------------------------------------------------


class TestUIFormatting:
    """AC3: UI stories emphasize interaction — click paths and visual changes."""

    def test_ui_has_click_directions(self) -> None:
        """UI stories include Click directions."""
        content = _make_ui_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert re.search(r"\*\*Click:\*\*", result["data"])

    def test_ui_emphasizes_visual_changes(self) -> None:
        """UI stories reference visual changes or screen elements."""
        content = _make_ui_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"].lower()
        visual_indicators = ["screen", "tab", "button", "interface", "navigate", "click", "tap"]
        found = any(ind in md for ind in visual_indicators)
        assert found, "UI story should reference visual elements"

    def test_ui_minimal_code(self) -> None:
        """UI stories should not contain code blocks unless UX-critical."""
        content = _make_ui_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        code_blocks = re.findall(r"```", result["data"])
        assert len(code_blocks) == 0, "UI stories should not contain code blocks"


class TestBackendInfraFormatting:
    """AC3: Backend/Infra stories focus on architecture narrative."""

    def test_backend_before_after_narrative(self) -> None:
        """Backend stories reference before/after system state."""
        content = _make_content(
            story_type=StoryType.BACKEND,
            before_after="Before: direct DB access. After: REST API layer.",
        )
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"].lower()
        assert "before" in md or "previously" in md or "now" in md

    def test_infra_architecture_focus(self) -> None:
        """Infrastructure stories focus on system-level changes."""
        content = _make_infra_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"].lower()
        system_indicators = ["pipeline", "deploy", "automated", "production", "system"]
        found = any(ind in md for ind in system_indicators)
        assert found, "Infra story should reference system-level concepts"

    def test_backend_no_implementation_details(self) -> None:
        """Backend stories focus on user impact, not implementation."""
        content = _make_content(story_type=StoryType.BACKEND)
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"].lower()
        # Should not contain raw implementation references
        impl_indicators = ["function", "class ", "import ", "def ", "return "]
        found = any(ind in md for ind in impl_indicators)
        assert not found, "Backend story should not contain implementation details"


class TestRefactorBugfixFormatting:
    """AC3: Refactor/Bugfix stories use problem-solution framing."""

    def test_refactor_has_before_after(self) -> None:
        """Refactor stories include before/after comparison when available."""
        content = _make_refactor_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"].lower()
        assert "before" in md and "after" in md

    def test_bugfix_problem_solution_framing(self) -> None:
        """Bugfix stories frame as problem → solution."""
        content = _make_bugfix_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"].lower()
        problem_indicators = ["problem", "issue", "crash", "fix", "resolved"]
        found = any(ind in md for ind in problem_indicators)
        assert found, "Bugfix story should reference the problem being solved"

    def test_bugfix_impact_focus(self) -> None:
        """Bugfix stories focus on impact, not internal changes."""
        content = _make_bugfix_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"].lower()
        # Should mention user impact
        impact_indicators = ["user", "log in", "special character", "now"]
        found = any(ind in md for ind in impact_indicators)
        assert found, "Bugfix story should describe user impact"


# ---------------------------------------------------------------------------
# AC4: Include timing estimates per scene in presenter notes
# ---------------------------------------------------------------------------


class TestTimingEstimates:
    """AC4: Each scene includes timing estimates."""

    def test_setup_has_timing(self) -> None:
        """Setup scene includes a timing estimate."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        # Look for time patterns like "30 sec", "1 min", "(30s)", etc.
        assert re.search(
            r"\d+\s*(sec|min|s\b|m\b|second|minute)",
            result["data"],
            re.IGNORECASE,
        ), "Setup scene should include timing estimate"

    def test_each_scene_has_timing(self) -> None:
        """Every scene heading or body includes a timing estimate."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        # Split into scenes by ## headings
        scenes = re.split(r"(?=^##\s)", md, flags=re.MULTILINE)
        scene_sections = [s for s in scenes if re.search(r"^##\s", s)]
        assert len(scene_sections) >= 4, f"Expected 4+ scenes, got {len(scene_sections)}"
        for scene in scene_sections:
            assert re.search(
                r"\d+\s*(sec|min|s\b|m\b|second|minute)",
                scene,
                re.IGNORECASE,
            ), f"Scene missing timing: {scene[:80]}"

    def test_timing_is_reasonable(self) -> None:
        """Total timing should be between 30 seconds and 15 minutes."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        # Extract all minute values
        minutes = re.findall(r"(\d+(?:\.\d+)?)\s*min", md, re.IGNORECASE)
        seconds = re.findall(r"(\d+)\s*sec", md, re.IGNORECASE)
        total_seconds = sum(float(m) * 60 for m in minutes) + sum(int(s) for s in seconds)
        assert total_seconds >= 30, f"Total time {total_seconds}s is too short"
        assert total_seconds <= 900, f"Total time {total_seconds}s exceeds 15 minutes"


# ---------------------------------------------------------------------------
# AC5: Non-technical language throughout
# ---------------------------------------------------------------------------


class TestNonTechnicalLanguage:
    """AC5: Use non-technical language (no implementation details unless UX-critical)."""

    def test_no_code_snippets_in_backend(self) -> None:
        """Backend stories should not contain code blocks."""
        content = _make_content(story_type=StoryType.BACKEND)
        result = generate_demo_script(content)
        assert result["success"] is True
        code_blocks = re.findall(r"```", result["data"])
        assert len(code_blocks) == 0, "Demo script should not contain code blocks"

    def test_no_code_snippets_in_infra(self) -> None:
        """Infrastructure stories should not contain code blocks."""
        content = _make_infra_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        code_blocks = re.findall(r"```", result["data"])
        assert len(code_blocks) == 0, "Demo script should not contain code blocks"

    def test_no_code_snippets_in_refactor(self) -> None:
        """Refactor stories should not contain code blocks."""
        content = _make_refactor_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        code_blocks = re.findall(r"```", result["data"])
        assert len(code_blocks) == 0, "Demo script should not contain code blocks"

    def test_no_code_snippets_in_bugfix(self) -> None:
        """Bugfix stories should not contain code blocks."""
        content = _make_bugfix_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        code_blocks = re.findall(r"```", result["data"])
        assert len(code_blocks) == 0, "Demo script should not contain code blocks"

    def test_no_raw_variable_names(self) -> None:
        """Output should not contain snake_case or camelCase variable names."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        # Allow bold markers (**word:**) but flag snake_case in prose
        # Strip markdown formatting first
        prose = re.sub(r"\*\*[^*]+\*\*", "", md)
        # snake_case: word_word pattern (but not in headings like story_id)
        snake_matches = re.findall(r"\b[a-z]+_[a-z]+_[a-z]+\b", prose)
        assert len(snake_matches) == 0, f"Found snake_case in prose: {snake_matches}"


# ---------------------------------------------------------------------------
# AC6: Output to sprint/demos/<story-id>/demo-script.md
# ---------------------------------------------------------------------------


class TestOutputPath:
    """AC6: Output targets sprint/demos/<story-id>/demo-script.md.

    Note: The script generator returns content as a string (AC7).
    File I/O is handled by the Assembler (145-5). These tests verify
    the generator includes the story-id in its output metadata.
    """

    def test_story_id_in_output(self) -> None:
        """Output data contains the story ID for downstream file routing."""
        content = _make_content(story_id="145-4")
        result = generate_demo_script(content)
        assert result["success"] is True
        assert "145-4" in result["data"]

    def test_different_story_ids_produce_different_titles(self) -> None:
        """Each story ID produces a unique title in the output."""
        content_a = _make_content(story_id="100-1")
        content_b = _make_content(story_id="200-5")
        result_a = generate_demo_script(content_a)
        result_b = generate_demo_script(content_b)
        assert result_a["success"] is True
        assert result_b["success"] is True
        assert "100-1" in result_a["data"]
        assert "200-5" in result_b["data"]
        assert "200-5" not in result_a["data"]


# ---------------------------------------------------------------------------
# AC7: Return {success, data?, error?} result object per ADR-0008
# ---------------------------------------------------------------------------


class TestResultObject:
    """AC7: All returns follow ADR-0008 result object pattern."""

    def test_success_shape(self) -> None:
        """Successful result has {success: True, data: str}."""
        content = _make_content()
        result = generate_demo_script(content)
        assert "success" in result
        assert result["success"] is True
        assert "data" in result
        assert isinstance(result["data"], str)

    def test_error_shape(self) -> None:
        """Failed result has {success: False, error: str}."""
        content = _make_content(demo_script="")
        result = generate_demo_script(content)
        assert "success" in result
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)

    def test_success_has_no_error_key(self) -> None:
        """Successful result should not have an error field."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert result.get("error") is None

    def test_error_has_no_data_key(self) -> None:
        """Failed result should not have a data field."""
        content = _make_content(demo_script="")
        result = generate_demo_script(content)
        assert result["success"] is False
        assert result.get("data") is None

    def test_never_throws(self) -> None:
        """Function should never raise — returns error result instead.

        Even with pathological input, the function returns a result object.
        """
        # None for required fields — implementation should catch, not crash
        try:
            content = _make_content(
                demo_script="x",
                problem_statement="",
                what_changed="",
                slide_outline=[],
            )
            result = generate_demo_script(content)
            # Either succeeds or returns error — both are valid
            assert "success" in result
        except NotImplementedError:
            # Acceptable in RED state — stub not yet implemented
            pass
        except Exception as exc:
            pytest.fail(f"generate_demo_script raised {type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# AC8: Format validated and parsed by Assembler — no partial output
# ---------------------------------------------------------------------------


class TestNoPartialOutput:
    """AC8: Output is complete or fails — no partial Markdown."""

    def test_all_scenes_present_on_success(self) -> None:
        """When success, all four scene types must be present."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        assert re.search(r"setup", md, re.IGNORECASE)
        assert re.search(r"act\s*1", md, re.IGNORECASE)
        assert re.search(r"act\s*2", md, re.IGNORECASE)
        assert re.search(r"closing", md, re.IGNORECASE)

    def test_title_present_on_success(self) -> None:
        """When success, the title heading must be present."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        assert result["data"].startswith("#")

    def test_no_placeholder_text(self) -> None:
        """Output must not contain placeholder markers."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        placeholders = ["TODO", "FIXME", "TBD", "PLACEHOLDER", "[INSERT", "{{"]
        for ph in placeholders:
            assert ph not in md, f"Found placeholder '{ph}' in output"

    def test_valid_markdown_headings(self) -> None:
        """All headings use proper Markdown ## syntax."""
        content = _make_content()
        result = generate_demo_script(content)
        assert result["success"] is True
        md = result["data"]
        headings = re.findall(r"^(#+)\s", md, re.MULTILINE)
        assert len(headings) >= 5, f"Expected 5+ headings (title + 4 scenes), got {len(headings)}"
        for h in headings:
            assert h in ("#", "##", "###"), f"Invalid heading level: {h}"


# ---------------------------------------------------------------------------
# Edge Cases — Paranoid Testing
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_all_story_types_produce_output(self) -> None:
        """Every StoryType produces valid output."""
        factories = {
            StoryType.UI: _make_ui_content,
            StoryType.BACKEND: _make_content,
            StoryType.INFRASTRUCTURE: _make_infra_content,
            StoryType.REFACTOR: _make_refactor_content,
            StoryType.BUGFIX: _make_bugfix_content,
        }
        for story_type, factory in factories.items():
            content = factory()
            result = generate_demo_script(content)
            assert result["success"] is True, f"Failed for {story_type.value}"
            assert isinstance(result["data"], str), f"Non-string data for {story_type.value}"
            assert len(result["data"]) > 100, f"Suspiciously short output for {story_type.value}"

    def test_very_long_demo_script_handled(self) -> None:
        """Very long input demo_script is processed without error."""
        long_script = "This is a very detailed explanation. " * 500
        content = _make_content(demo_script=long_script)
        result = generate_demo_script(content)
        assert result["success"] is True

    def test_demo_script_with_special_characters(self) -> None:
        """Input containing special characters is handled."""
        content = _make_content(
            demo_script="We fixed the <script> injection & the 'quotes' issue — it's done."
        )
        result = generate_demo_script(content)
        assert result["success"] is True

    def test_none_before_after_handled(self) -> None:
        """None before_after is handled gracefully (backend stories may not have it)."""
        content = _make_content(before_after=None)
        result = generate_demo_script(content)
        assert result["success"] is True

    def test_none_diagram_source_handled(self) -> None:
        """None diagram_source is handled gracefully."""
        content = _make_content(diagram_source=None)
        result = generate_demo_script(content)
        assert result["success"] is True

    def test_empty_slide_outline_handled(self) -> None:
        """Empty slide_outline doesn't crash."""
        content = _make_content(slide_outline=[])
        result = generate_demo_script(content)
        # Should still succeed — demo script doesn't depend on slides
        assert result["success"] is True

    def test_deterministic_output(self) -> None:
        """Same input always produces identical output (pure function)."""
        content = _make_content()
        result1 = generate_demo_script(content)
        result2 = generate_demo_script(content)
        assert result1["success"] == result2["success"]
        assert result1["data"] == result2["data"]
