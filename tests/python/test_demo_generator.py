"""Tests for demo content generator (story 145-3).

Tests validate generate_content(), build_prompt(), and parse_response() for
Claude-powered ELI5 translation from classified story signals.

Run with: python -m pytest tests/python/test_demo_generator.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.demo.classifier import ARTIFACT_MAP  # noqa: E402
from pf.demo.generator import build_prompt, generate_content, parse_response  # noqa: E402
from pf.demo.models import (  # noqa: E402
    ArtifactType,
    ClassifiedStory,
    GeneratedContent,
    SignalBundle,
    StoryType,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_signals(
    *,
    title: str = "Add REST API endpoint for users",
    story_type_hint: str = "backend",
    story_id: str = "99-1",
) -> SignalBundle:
    """Create a SignalBundle with sensible defaults for testing."""
    extensions = {".py", ".rs"} if story_type_hint == "backend" else set()
    if story_type_hint == "ui":
        extensions = {".tsx", ".css"}
    elif story_type_hint == "infrastructure":
        extensions = set()
    elif story_type_hint == "refactor":
        extensions = {".py"}
    elif story_type_hint == "bugfix":
        extensions = {".py"}

    return SignalBundle(
        story_id=story_id,
        title=title,
        jira_key="MSSCI-12345",
        points=3,
        acceptance_criteria=[
            "Users can create accounts via POST /api/users",
            "Input validation rejects invalid email",
            "Returns 201 with user ID on success",
        ],
        pr_diff="diff --git a/src/api.py b/src/api.py\n+def create_user():\n+    pass",
        commit_messages=["feat: add user creation endpoint", "test: add user API tests"],
        session_fields={"workflow": "tdd", "phase": "green"},
        review_findings="No critical issues found",
        file_extensions=extensions,
    )


def _make_classified(
    *,
    story_type: StoryType = StoryType.BACKEND,
    title: str = "Add REST API endpoint for users",
    artifacts: list[ArtifactType] | None = None,
) -> ClassifiedStory:
    """Create a ClassifiedStory with sensible defaults."""
    type_hint = story_type.value
    signals = _make_signals(title=title, story_type_hint=type_hint)
    if artifacts is None:
        artifacts = list(ARTIFACT_MAP[story_type])
    return ClassifiedStory(signals=signals, story_type=story_type, artifacts=artifacts)


# ---------------------------------------------------------------------------
# AC1: generate_content returns GeneratedContent dataclass
# ---------------------------------------------------------------------------


class TestGenerateContentReturnsGeneratedContent:
    """generate_content() must return a result object with GeneratedContent."""

    def test_returns_result_object(self):
        """Result is a dict with success key."""
        classified = _make_classified()
        result = generate_content(classified)
        assert isinstance(result, dict)
        assert "success" in result

    def test_success_contains_generated_content(self):
        """On success, data is a GeneratedContent instance."""
        classified = _make_classified()
        result = generate_content(classified)
        assert result["success"] is True
        assert isinstance(result["data"], GeneratedContent)

    def test_generated_content_has_all_fields(self):
        """GeneratedContent has all required fields populated."""
        classified = _make_classified()
        result = generate_content(classified)
        content = result["data"]
        assert isinstance(content.problem_statement, str)
        assert len(content.problem_statement) > 0
        assert isinstance(content.what_changed, str)
        assert len(content.what_changed) > 0
        assert isinstance(content.why_this_approach, str)
        assert len(content.why_this_approach) > 0
        assert isinstance(content.demo_script, str)
        assert len(content.demo_script) > 0
        assert isinstance(content.slide_outline, list)
        assert len(content.slide_outline) > 0


# ---------------------------------------------------------------------------
# AC2: ELI5 translation for non-technical executive audience
# ---------------------------------------------------------------------------


class TestELI5Translation:
    """Content must be translated for non-technical audience."""

    def test_problem_statement_format(self):
        """Problem statement follows 'Problem: X. Why it matters: Y.' structure."""
        classified = _make_classified()
        result = generate_content(classified)
        ps = result["data"].problem_statement
        # Must contain problem framing and impact
        assert "problem" in ps.lower() or "challenge" in ps.lower() or "issue" in ps.lower()

    def test_what_changed_is_non_technical(self):
        """what_changed should explain in plain language, not code."""
        classified = _make_classified()
        result = generate_content(classified)
        wc = result["data"].what_changed
        assert len(wc) > 20  # Not a trivial one-liner


# ---------------------------------------------------------------------------
# AC3: Ground all claims in signals (no hallucination)
# ---------------------------------------------------------------------------


class TestGroundedInSignals:
    """All generated content must be traceable to input signals."""

    def test_prompt_includes_acceptance_criteria(self):
        """Prompt must include the story's ACs."""
        classified = _make_classified()
        prompt = build_prompt(classified)
        for ac in classified.signals.acceptance_criteria:
            assert ac in prompt

    def test_prompt_includes_story_type(self):
        """Prompt must include the classified story type."""
        classified = _make_classified()
        prompt = build_prompt(classified)
        assert classified.story_type.value in prompt.lower()

    def test_prompt_includes_pr_diff(self):
        """Prompt must include the PR diff."""
        classified = _make_classified()
        prompt = build_prompt(classified)
        assert classified.signals.pr_diff in prompt or "diff" in prompt.lower()

    def test_prompt_includes_commit_messages(self):
        """Prompt must include commit messages."""
        classified = _make_classified()
        prompt = build_prompt(classified)
        for msg in classified.signals.commit_messages:
            assert msg in prompt

    def test_prompt_includes_title(self):
        """Prompt must include the story title."""
        classified = _make_classified()
        prompt = build_prompt(classified)
        assert classified.signals.title in prompt


# ---------------------------------------------------------------------------
# AC4: Story type-specific content generation
# ---------------------------------------------------------------------------


class TestStoryTypeSpecificContent:
    """Generated content varies by story type."""

    def test_backend_includes_diagram_source(self):
        """Backend stories produce diagram_source (mermaid)."""
        classified = _make_classified(story_type=StoryType.BACKEND)
        result = generate_content(classified)
        assert result["data"].diagram_source is not None

    def test_ui_excludes_diagram_source(self):
        """UI stories do not produce diagram_source."""
        classified = _make_classified(
            story_type=StoryType.UI,
            title="Add login screen with form validation",
        )
        result = generate_content(classified)
        assert result["data"].diagram_source is None

    def test_refactor_includes_before_after(self):
        """Refactor stories produce before_after content."""
        classified = _make_classified(
            story_type=StoryType.REFACTOR,
            title="Refactor user service for clarity",
        )
        result = generate_content(classified)
        assert result["data"].before_after is not None
        assert len(result["data"].before_after) > 0

    def test_bugfix_includes_before_after(self):
        """Bugfix stories produce before_after content."""
        classified = _make_classified(
            story_type=StoryType.BUGFIX,
            title="Fix login regression on mobile",
        )
        result = generate_content(classified)
        assert result["data"].before_after is not None

    def test_infrastructure_includes_diagram_source(self):
        """Infrastructure stories produce diagram_source."""
        classified = _make_classified(
            story_type=StoryType.INFRASTRUCTURE,
            title="Deploy k8s monitoring stack",
        )
        result = generate_content(classified)
        assert result["data"].diagram_source is not None

    def test_backend_demo_script_not_empty(self):
        """Backend stories have a non-empty demo script."""
        classified = _make_classified(story_type=StoryType.BACKEND)
        result = generate_content(classified)
        assert len(result["data"].demo_script) > 0


# ---------------------------------------------------------------------------
# AC5: Slide outline metadata per-slide
# ---------------------------------------------------------------------------


class TestSlideOutline:
    """Slide outline must have per-slide metadata."""

    def test_slide_outline_is_list_of_dicts(self):
        """Each slide is a dict with metadata."""
        classified = _make_classified()
        result = generate_content(classified)
        outline = result["data"].slide_outline
        assert isinstance(outline, list)
        assert all(isinstance(s, dict) for s in outline)

    def test_each_slide_has_title(self):
        """Each slide dict must have a 'title' key."""
        classified = _make_classified()
        result = generate_content(classified)
        for slide in result["data"].slide_outline:
            assert "title" in slide
            assert isinstance(slide["title"], str)
            assert len(slide["title"]) > 0

    def test_each_slide_has_bullets(self):
        """Each slide dict must have a 'bullets' key with a list."""
        classified = _make_classified()
        result = generate_content(classified)
        for slide in result["data"].slide_outline:
            assert "bullets" in slide
            assert isinstance(slide["bullets"], list)

    def test_each_slide_has_speaker_notes(self):
        """Each slide dict must have 'speaker_notes' key."""
        classified = _make_classified()
        result = generate_content(classified)
        for slide in result["data"].slide_outline:
            assert "speaker_notes" in slide
            assert isinstance(slide["speaker_notes"], str)

    def test_minimum_slide_count(self):
        """At least 3 slides: title, content, closing."""
        classified = _make_classified()
        result = generate_content(classified)
        assert len(result["data"].slide_outline) >= 3


# ---------------------------------------------------------------------------
# AC6: Demo script format with scenes
# ---------------------------------------------------------------------------


class TestDemoScriptFormat:
    """Demo script must follow the scene-based format."""

    def test_demo_script_has_scene_headers(self):
        """Demo script contains scene/section markers."""
        classified = _make_classified()
        result = generate_content(classified)
        script = result["data"].demo_script
        # Should have markdown headers for scenes
        assert "##" in script or "Scene" in script or "Step" in script

    def test_demo_script_has_presenter_actions(self):
        """Demo script references what presenter should say or show."""
        classified = _make_classified()
        result = generate_content(classified)
        script = result["data"].demo_script.lower()
        has_action = any(kw in script for kw in ["show", "click", "say", "narrate", "presenter", "demo"])
        assert has_action


# ---------------------------------------------------------------------------
# AC7: Corrections workflow (FR-22)
# ---------------------------------------------------------------------------


class TestCorrectionsWorkflow:
    """Developer can provide corrections for regeneration."""

    def test_corrections_included_in_prompt(self):
        """When corrections provided, they appear in the prompt."""
        classified = _make_classified()
        corrections = "Slide 2 says 40% but spec says 30%"
        prompt = build_prompt(classified, corrections=corrections)
        assert corrections in prompt

    def test_corrections_none_produces_normal_prompt(self):
        """When no corrections, prompt has no corrections section."""
        classified = _make_classified()
        prompt_no_corr = build_prompt(classified, corrections=None)
        prompt_with_corr = build_prompt(classified, corrections="Fix the numbers")
        # The corrected prompt should be longer (has extra section)
        assert len(prompt_with_corr) > len(prompt_no_corr)

    def test_generate_with_corrections_returns_success(self):
        """generate_content with corrections still returns valid result."""
        classified = _make_classified()
        result = generate_content(classified, corrections="Slide 2 is wrong")
        assert result["success"] is True
        assert isinstance(result["data"], GeneratedContent)


# ---------------------------------------------------------------------------
# AC8: ADR-0008 result objects
# ---------------------------------------------------------------------------


class TestResultObjects:
    """All functions return {success, data?, error?} per ADR-0008."""

    def test_success_result_structure(self):
        """Success result has success=True and data key."""
        classified = _make_classified()
        result = generate_content(classified)
        assert result["success"] is True
        assert "data" in result

    def test_error_result_has_error_key(self):
        """Error result has success=False and error key."""
        # Empty signals should cause an error
        signals = SignalBundle(
            story_id="",
            title="",
            jira_key=None,
            points=None,
            acceptance_criteria=[],
            pr_diff="",
            commit_messages=[],
            session_fields={},
            review_findings=None,
            file_extensions=set(),
        )
        classified = ClassifiedStory(
            signals=signals,
            story_type=StoryType.BACKEND,
            artifacts=[ArtifactType.NARRATIVE],
        )
        result = generate_content(classified)
        # With empty story_id this should fail
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)

    def test_parse_response_error_on_empty_text(self):
        """parse_response with empty text returns error result."""
        classified = _make_classified()
        result = parse_response("", classified)
        assert result["success"] is False
        assert "error" in result

    def test_parse_response_error_on_malformed_text(self):
        """parse_response with malformed text returns error result."""
        classified = _make_classified()
        result = parse_response("just some random text without structure", classified)
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# Prompt construction (build_prompt)
# ---------------------------------------------------------------------------


class TestBuildPrompt:
    """build_prompt constructs a complete prompt for Claude."""

    def test_returns_string(self):
        """build_prompt returns a non-empty string."""
        classified = _make_classified()
        prompt = build_prompt(classified)
        assert isinstance(prompt, str)
        assert len(prompt) > 100  # Non-trivial prompt

    def test_includes_eli5_instruction(self):
        """Prompt must instruct for ELI5 / non-technical translation."""
        classified = _make_classified()
        prompt = build_prompt(classified).lower()
        has_eli5 = any(kw in prompt for kw in ["eli5", "non-technical", "executive", "plain language", "simple"])
        assert has_eli5

    def test_includes_signal_bundle_data(self):
        """Prompt includes key fields from the SignalBundle."""
        classified = _make_classified()
        prompt = build_prompt(classified)
        assert classified.signals.story_id in prompt
        assert classified.signals.title in prompt

    def test_prompt_varies_by_story_type(self):
        """Different story types produce different prompts."""
        backend = _make_classified(story_type=StoryType.BACKEND)
        ui = _make_classified(story_type=StoryType.UI, title="Add dashboard UI")
        prompt_backend = build_prompt(backend)
        prompt_ui = build_prompt(ui)
        assert prompt_backend != prompt_ui

    def test_includes_review_findings_when_present(self):
        """Prompt includes review findings if available."""
        classified = _make_classified()
        # signals has review_findings = "No critical issues found"
        prompt = build_prompt(classified)
        assert classified.signals.review_findings in prompt


# ---------------------------------------------------------------------------
# Response parsing (parse_response)
# ---------------------------------------------------------------------------


class TestParseResponse:
    """parse_response extracts GeneratedContent from Claude's response."""

    def test_valid_response_returns_generated_content(self):
        """A well-structured response parses into GeneratedContent."""
        classified = _make_classified()
        # Simulate a well-structured Claude response
        response = """
## Problem Statement
Problem: Users couldn't create accounts. Why it matters: Growth depends on onboarding.

## What Changed
We added a new REST API endpoint that lets users sign up.

## Why This Approach
REST API is the standard for our platform. It integrates with existing auth.

## Demo Script
### Scene 1: Setup (30 sec)
**Show:** The API documentation
**Presenter says:** "Today we added user creation."

### Scene 2: Demo (1 min)
**Show:** POST request to /api/users
**Click:** Submit button

## Slide Outline
- slide: Title
  bullets: ["Story 99-1", "Add REST API endpoint"]
  speaker_notes: "Welcome to the demo"
- slide: Problem
  bullets: ["Users couldn't sign up", "Growth blocked"]
  speaker_notes: "Here's what we solved"
- slide: Solution
  bullets: ["New POST /api/users endpoint", "Validation included"]
  speaker_notes: "Clean REST implementation"

## Diagram Source
```mermaid
graph LR
  A[Client] --> B[API Gateway]
  B --> C[User Service]
  C --> D[Database]
```
"""
        result = parse_response(response, classified)
        assert result["success"] is True
        content = result["data"]
        assert isinstance(content, GeneratedContent)
        assert len(content.problem_statement) > 0
        assert len(content.what_changed) > 0
        assert len(content.demo_script) > 0

    def test_missing_required_section_returns_error(self):
        """Response missing a required section returns error."""
        classified = _make_classified()
        # Missing problem_statement
        response = """
## What Changed
We added stuff.
"""
        result = parse_response(response, classified)
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_empty_acceptance_criteria(self):
        """Generate content with empty AC list still works."""
        signals = SignalBundle(
            story_id="99-2",
            title="Improve logging",
            jira_key=None,
            points=1,
            acceptance_criteria=[],
            pr_diff="diff --git a/log.py b/log.py",
            commit_messages=["chore: improve logging"],
            session_fields={},
            review_findings=None,
            file_extensions={".py"},
        )
        classified = ClassifiedStory(
            signals=signals,
            story_type=StoryType.BACKEND,
            artifacts=[ArtifactType.NARRATIVE, ArtifactType.DEMO_SCRIPT],
        )
        result = generate_content(classified)
        assert result["success"] is True

    def test_no_review_findings(self):
        """Generate content when review_findings is None."""
        signals = _make_signals()
        signals.review_findings = None
        classified = ClassifiedStory(
            signals=signals,
            story_type=StoryType.BACKEND,
            artifacts=[ArtifactType.NARRATIVE, ArtifactType.DEMO_SCRIPT],
        )
        result = generate_content(classified)
        assert result["success"] is True

    def test_very_long_pr_diff(self):
        """Handle large PR diffs (50K+ chars) without crash."""
        signals = _make_signals()
        signals.pr_diff = "+" * 60_000  # Exceeds MAX_DIFF_CHARS
        classified = ClassifiedStory(
            signals=signals,
            story_type=StoryType.BACKEND,
            artifacts=[ArtifactType.NARRATIVE],
        )
        # Should not crash — build_prompt handles truncation
        prompt = build_prompt(classified)
        assert isinstance(prompt, str)

    def test_empty_story_id_returns_error(self):
        """Empty story_id in signals should cause error."""
        signals = SignalBundle(
            story_id="",
            title="",
            jira_key=None,
            points=None,
            acceptance_criteria=[],
            pr_diff="",
            commit_messages=[],
            session_fields={},
            review_findings=None,
            file_extensions=set(),
        )
        classified = ClassifiedStory(
            signals=signals,
            story_type=StoryType.BACKEND,
            artifacts=[ArtifactType.NARRATIVE],
        )
        result = generate_content(classified)
        assert result["success"] is False

    def test_all_story_types_produce_content(self):
        """Every StoryType produces GeneratedContent."""
        type_titles = {
            StoryType.UI: "Add login screen with form",
            StoryType.BACKEND: "Add REST API endpoint",
            StoryType.INFRASTRUCTURE: "Deploy k8s cluster",
            StoryType.REFACTOR: "Refactor auth service",
            StoryType.BUGFIX: "Fix login regression",
        }
        for st, title in type_titles.items():
            classified = _make_classified(story_type=st, title=title)
            result = generate_content(classified)
            assert result["success"] is True, f"Failed for {st.value}"
            assert isinstance(result["data"], GeneratedContent)
