"""Tests for PPTX assembler — story 145-5.

Verifies that the assembler takes GeneratedContent + ClassifiedStory and
produces a valid PPTX slide deck plus supporting files in the correct
output directory structure.

AC coverage:
  AC1: Takes GeneratedContent + ClassifiedStory as input → assemble() signature
  AC2: Produces deck.pptx with correct slide structure → slide count + titles
  AC3: Writes supporting files (narrative.md, metadata.yaml, etc.)
  AC4: Output to sprint/demos/<story-id>/
  AC5: Graceful degradation (missing mmdc, missing Playwright)
  AC6: Returns {success, data?, error?} per ADR-0008
  AC7: Handles missing optional fields (diagram_source=None, before_after=None)
  AC8: PPTX is valid (loadable by python-pptx)
"""

from __future__ import annotations

from pathlib import Path

from pf.demo.models import (
    ArtifactType,
    ClassifiedStory,
    GeneratedContent,
    SignalBundle,
    StoryType,
)

# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------


def _make_signals(story_id: str = "145-5") -> SignalBundle:
    """Build a minimal SignalBundle for testing."""
    return SignalBundle(
        story_id=story_id,
        title="PPTX assembler — build slide deck",
        jira_key="PROJ-16401",
        points=3,
        acceptance_criteria=["Produce valid PPTX", "Write supporting files"],
        pr_diff="diff --git a/assembler.py ...",
        commit_messages=["feat: add PPTX assembler"],
        session_fields={"Phase": "green", "Workflow": "tdd"},
        review_findings=None,
        file_extensions={".py"},
    )


def _make_generated_content(
    story_id: str = "145-5",
    story_type: StoryType = StoryType.BACKEND,
    *,
    diagram_source: str | None = "graph LR\n  A-->B",
    before_after: str | None = None,
    slide_outline: list[dict] | None = None,
) -> GeneratedContent:
    """Build a GeneratedContent with sensible defaults."""
    return GeneratedContent(
        problem_statement="We needed automated slide decks.",
        what_changed="Added a PPTX assembler that builds decks from generated content.",
        why_this_approach="python-pptx is reliable and avoids external services.",
        before_after=before_after,
        demo_script="Step 1: Run pf demo generate. Step 2: Open deck.pptx.",
        diagram_source=diagram_source,
        slide_outline=slide_outline or [
            {"title": "Title Slide", "bullets": [], "speaker_notes": ""},
            {"title": "Problem", "bullets": ["Manual decks"], "speaker_notes": "Setup"},
            {"title": "What We Built", "bullets": ["Auto-gen"], "speaker_notes": "Main"},
        ],
        story_type=story_type,
        story_id=story_id,
    )


def _make_classified_story(
    story_type: StoryType = StoryType.BACKEND,
    story_id: str = "145-5",
) -> ClassifiedStory:
    """Build a ClassifiedStory for testing."""
    return ClassifiedStory(
        signals=_make_signals(story_id),
        story_type=story_type,
        artifacts=[ArtifactType.SLIDE_DECK, ArtifactType.MERMAID_DIAGRAM, ArtifactType.NARRATIVE],
    )


# ---------------------------------------------------------------------------
# AC1: Takes GeneratedContent + ClassifiedStory as input
# ---------------------------------------------------------------------------


class TestAssembleSignature:
    """AC1: assemble() accepts the correct inputs."""

    def test_accepts_generated_content_and_classified_story(self, tmp_path: Path) -> None:
        """assemble() must accept GeneratedContent + ClassifiedStory."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert isinstance(result, dict)
        assert "success" in result

    def test_returns_result_object_on_success(self, tmp_path: Path) -> None:
        """Successful assembly returns {success: True, data: {...}}."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        assert "data" in result
        assert "output_dir" in result["data"]
        assert "files" in result["data"]


# ---------------------------------------------------------------------------
# AC2: Produces deck.pptx with correct slide structure
# ---------------------------------------------------------------------------


class TestPptxSlideStructure:
    """AC2: Generated PPTX has the required slides."""

    def test_backend_deck_has_minimum_slides(self, tmp_path: Path) -> None:
        """Backend story deck must have: Title, Problem, What We Built, Why, CTA."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(story_type=StoryType.BACKEND)
        cs = _make_classified_story(story_type=StoryType.BACKEND)
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        pptx_path = tmp_path / "deck.pptx"
        assert pptx_path.exists(), "deck.pptx must be created"

        from pptx import Presentation

        prs = Presentation(str(pptx_path))
        # Minimum: Title + Problem + What We Built + Why + CTA = 5
        assert len(prs.slides) >= 5, f"Expected >= 5 slides, got {len(prs.slides)}"

    def test_title_slide_contains_story_id(self, tmp_path: Path) -> None:
        """First slide should reference the story ID."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(story_id="99-1")
        cs = _make_classified_story(story_id="99-1")
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        from pptx import Presentation

        prs = Presentation(str(tmp_path / "deck.pptx"))
        first_slide = prs.slides[0]
        text = "\n".join(shape.text for shape in first_slide.shapes if shape.has_text_frame)
        assert "99-1" in text, "Title slide must contain story ID"

    def test_problem_slide_has_problem_statement(self, tmp_path: Path) -> None:
        """Second slide should contain the problem statement."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        from pptx import Presentation

        prs = Presentation(str(tmp_path / "deck.pptx"))
        # Problem slide is slide 2 (index 1)
        problem_slide = prs.slides[1]
        text = "\n".join(shape.text for shape in problem_slide.shapes if shape.has_text_frame)
        assert "automated slide decks" in text.lower() or gc.problem_statement in text

    def test_refactor_deck_includes_before_after_slide(self, tmp_path: Path) -> None:
        """Refactor stories should include a Before/After slide when content exists."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(
            story_type=StoryType.REFACTOR,
            before_after="Before: monolith. After: modular services.",
            diagram_source=None,
        )
        cs = _make_classified_story(story_type=StoryType.REFACTOR)
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        from pptx import Presentation

        prs = Presentation(str(tmp_path / "deck.pptx"))
        all_text = ""
        for slide in prs.slides:
            for shape in slide.shapes:
                if shape.has_text_frame:
                    all_text += shape.text + "\n"
        assert "before" in all_text.lower() or "after" in all_text.lower()

    def test_cta_slide_is_last(self, tmp_path: Path) -> None:
        """Last slide should be a Call-to-Action / Questions slide."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        from pptx import Presentation

        prs = Presentation(str(tmp_path / "deck.pptx"))
        last_slide = prs.slides[-1]
        text = "\n".join(shape.text for shape in last_slide.shapes if shape.has_text_frame).lower()
        assert "question" in text or "call" in text or "next" in text or "action" in text


# ---------------------------------------------------------------------------
# AC3: Writes supporting files
# ---------------------------------------------------------------------------


class TestSupportingFiles:
    """AC3: Assembler writes all required supporting files."""

    def test_writes_narrative_md(self, tmp_path: Path) -> None:
        """narrative.md must be written with ELI5 content."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        narrative = tmp_path / "narrative.md"
        assert narrative.exists(), "narrative.md must be created"
        content = narrative.read_text()
        assert gc.what_changed in content or gc.problem_statement in content

    def test_writes_metadata_yaml(self, tmp_path: Path) -> None:
        """metadata.yaml must contain story_id and generated_at."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        meta = tmp_path / "metadata.yaml"
        assert meta.exists(), "metadata.yaml must be created"
        content = meta.read_text()
        assert "story_id" in content
        assert "145-5" in content

    def test_writes_demo_script_md(self, tmp_path: Path) -> None:
        """demo-script.md must be written with presenter walkthrough."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        script = tmp_path / "demo-script.md"
        assert script.exists(), "demo-script.md must be created"
        content = script.read_text()
        assert len(content) > 0

    def test_writes_diagram_mmd_when_source_present(self, tmp_path: Path) -> None:
        """diagram.mmd must be written when diagram_source is provided."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(diagram_source="graph LR\n  A-->B-->C")
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        mmd = tmp_path / "diagram.mmd"
        assert mmd.exists(), "diagram.mmd must be created when diagram_source exists"
        assert "graph LR" in mmd.read_text()

    def test_skips_diagram_when_source_none(self, tmp_path: Path) -> None:
        """diagram.mmd must NOT be written when diagram_source is None."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(diagram_source=None)
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        mmd = tmp_path / "diagram.mmd"
        assert not mmd.exists(), "diagram.mmd must NOT exist when diagram_source is None"

    def test_data_files_list_matches_written_files(self, tmp_path: Path) -> None:
        """Result data.files list should match actually written files."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        reported_files = result["data"]["files"]
        assert isinstance(reported_files, list)
        assert len(reported_files) > 0

        for f in reported_files:
            assert (tmp_path / f).exists() or Path(f).exists(), f"Reported file {f} must exist"


# ---------------------------------------------------------------------------
# AC4: Output to sprint/demos/<story-id>/
# ---------------------------------------------------------------------------


class TestOutputDirectory:
    """AC4: Default output directory follows spec."""

    def test_default_output_dir_pattern(self, tmp_path: Path) -> None:
        """Without output_dir override, assembler uses sprint/demos/<story-id>/."""
        from unittest.mock import patch

        from pf.demo.assembler import assemble

        gc = _make_generated_content(story_id="99-2")
        cs = _make_classified_story(story_id="99-2")

        # Mock get_project_root to use tmp_path
        with patch("pf.demo.assembler.get_project_root", return_value=tmp_path):
            result = assemble(gc, cs)

        assert result["success"] is True
        expected_dir = tmp_path / "sprint" / "demos" / "99-2"
        assert expected_dir.exists(), f"Expected output at {expected_dir}"

    def test_creates_output_dir_if_missing(self, tmp_path: Path) -> None:
        """Assembler must create the output directory if it doesn't exist."""
        from pf.demo.assembler import assemble

        out = tmp_path / "deep" / "nested" / "path"
        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(out))

        assert result["success"] is True
        assert out.exists()

    def test_overwrites_existing_artifacts(self, tmp_path: Path) -> None:
        """Re-running assembler overwrites previous artifacts."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()

        # First run
        result1 = assemble(gc, cs, output_dir=str(tmp_path))
        assert result1["success"] is True

        # Modify content and re-run
        gc2 = _make_generated_content()
        gc2.problem_statement = "UPDATED problem statement for re-run."
        result2 = assemble(gc2, cs, output_dir=str(tmp_path))
        assert result2["success"] is True

        # Verify overwrite
        narrative = (tmp_path / "narrative.md").read_text()
        assert "UPDATED" in narrative


# ---------------------------------------------------------------------------
# AC5: Graceful degradation
# ---------------------------------------------------------------------------


class TestGracefulDegradation:
    """AC5: Missing optional tools don't block assembly."""

    def test_succeeds_without_mmdc(self, tmp_path: Path) -> None:
        """Assembly succeeds even when mmdc is not on PATH."""
        from unittest.mock import patch

        from pf.demo.assembler import assemble

        gc = _make_generated_content(diagram_source="graph TD\n  X-->Y")
        cs = _make_classified_story()

        # Ensure mmdc is "not found"
        with patch("pf.demo.assembler._has_mmdc", return_value=False):
            result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        # .mmd source should still be written
        assert (tmp_path / "diagram.mmd").exists()
        # .png should NOT exist (no mmdc)
        assert not (tmp_path / "diagram.png").exists()

    def test_diagram_png_created_when_mmdc_available(self, tmp_path: Path) -> None:
        """When mmdc is available, diagram.png should be rendered."""
        from unittest.mock import patch

        from pf.demo.assembler import assemble

        gc = _make_generated_content(diagram_source="graph LR\n  A-->B")
        cs = _make_classified_story()

        # Mock mmdc as available and successful
        with patch("pf.demo.assembler._has_mmdc", return_value=True), \
             patch("pf.demo.assembler._render_mermaid") as mock_render:
            # Simulate mmdc writing a .png
            def fake_render(mmd_path, png_path):
                Path(png_path).write_bytes(b"fake-png")

            mock_render.side_effect = fake_render
            result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        assert (tmp_path / "diagram.png").exists()


# ---------------------------------------------------------------------------
# AC6: Returns {success, data?, error?} per ADR-0008
# ---------------------------------------------------------------------------


class TestResultContract:
    """AC6: All return values follow ADR-0008."""

    def test_success_result_shape(self, tmp_path: Path) -> None:
        """Success result has success=True and data dict."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        assert isinstance(result["data"], dict)
        assert result.get("error") is None

    def test_error_result_on_empty_content(self, tmp_path: Path) -> None:
        """Empty generated content should return error result."""
        from pf.demo.assembler import assemble

        gc = GeneratedContent(
            problem_statement="",
            what_changed="",
            why_this_approach="",
            before_after=None,
            demo_script="",
            diagram_source=None,
            slide_outline=[],
            story_type=StoryType.BACKEND,
            story_id="empty-1",
        )
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is False
        assert isinstance(result["error"], str)
        assert len(result["error"]) > 0

    def test_never_raises_exceptions(self, tmp_path: Path) -> None:
        """assemble() must catch exceptions and return error result."""
        from pf.demo.assembler import assemble

        # Pass None to trigger internal error — must not raise
        gc = _make_generated_content()
        cs = _make_classified_story()

        # Force an internal failure by corrupting output_dir to unwritable
        result = assemble(gc, cs, output_dir="/proc/nonexistent/impossible")

        assert isinstance(result, dict)
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# AC7: Handles missing optional fields
# ---------------------------------------------------------------------------


class TestOptionalFields:
    """AC7: Missing optional fields handled gracefully."""

    def test_no_diagram_source(self, tmp_path: Path) -> None:
        """Assembler succeeds when diagram_source is None."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(diagram_source=None)
        cs = _make_classified_story(story_type=StoryType.BUGFIX)
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        assert not (tmp_path / "diagram.mmd").exists()

    def test_no_before_after(self, tmp_path: Path) -> None:
        """Assembler succeeds when before_after is None."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(before_after=None)
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        # PPTX should still be valid
        from pptx import Presentation

        prs = Presentation(str(tmp_path / "deck.pptx"))
        assert len(prs.slides) >= 4  # No before/after slide, but rest should be there

    def test_empty_slide_outline(self, tmp_path: Path) -> None:
        """Assembler handles empty slide_outline by using defaults."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(slide_outline=[])
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        from pptx import Presentation

        prs = Presentation(str(tmp_path / "deck.pptx"))
        # Should still produce at least Title + Problem + What Built + Why + CTA
        assert len(prs.slides) >= 5


# ---------------------------------------------------------------------------
# AC8: PPTX is valid (loadable)
# ---------------------------------------------------------------------------


class TestPptxValidity:
    """AC8: Output PPTX is valid and loadable."""

    def test_pptx_loadable_by_python_pptx(self, tmp_path: Path) -> None:
        """Generated deck.pptx must load without errors."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        from pptx import Presentation

        # This should not raise
        prs = Presentation(str(tmp_path / "deck.pptx"))
        assert prs is not None

    def test_pptx_has_nonzero_size(self, tmp_path: Path) -> None:
        """deck.pptx must have nonzero file size."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        pptx_path = tmp_path / "deck.pptx"
        assert pptx_path.stat().st_size > 0

    def test_all_story_types_produce_valid_pptx(self, tmp_path: Path) -> None:
        """Every StoryType should produce a valid PPTX."""
        from pptx import Presentation

        from pf.demo.assembler import assemble

        for stype in StoryType:
            out = tmp_path / stype.value
            gc = _make_generated_content(
                story_type=stype,
                diagram_source="graph LR\n  A-->B" if stype in (StoryType.BACKEND, StoryType.INFRASTRUCTURE) else None,
                before_after="Before: X. After: Y." if stype in (StoryType.REFACTOR, StoryType.BUGFIX) else None,
            )
            cs = _make_classified_story(story_type=stype)
            result = assemble(gc, cs, output_dir=str(out))

            assert result["success"] is True, f"{stype.value} failed: {result.get('error')}"
            prs = Presentation(str(out / "deck.pptx"))
            assert len(prs.slides) >= 4, f"{stype.value}: expected >= 4 slides, got {len(prs.slides)}"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_special_characters_in_content(self, tmp_path: Path) -> None:
        """Content with special chars (quotes, ampersands, unicode) must not corrupt PPTX."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        gc.problem_statement = 'He said "hello" & she said <goodbye> — with émojis 🎉'
        gc.what_changed = "Changed the API's response to include 'data' & 'errors'"
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

        from pptx import Presentation

        prs = Presentation(str(tmp_path / "deck.pptx"))
        assert len(prs.slides) >= 4

    def test_very_long_content(self, tmp_path: Path) -> None:
        """Very long content fields should not crash the assembler."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        gc.what_changed = "A" * 10_000
        gc.problem_statement = "B" * 5_000
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True

    def test_deterministic_output(self, tmp_path: Path) -> None:
        """Same input should produce same slide structure."""
        from pptx import Presentation

        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()

        out1 = tmp_path / "run1"
        out2 = tmp_path / "run2"
        result1 = assemble(gc, cs, output_dir=str(out1))
        result2 = assemble(gc, cs, output_dir=str(out2))

        assert result1["success"] is True
        assert result2["success"] is True

        prs1 = Presentation(str(out1 / "deck.pptx"))
        prs2 = Presentation(str(out2 / "deck.pptx"))
        assert len(prs1.slides) == len(prs2.slides)


# ---------------------------------------------------------------------------
# Metadata content
# ---------------------------------------------------------------------------


class TestMetadataContent:
    """Metadata.yaml must contain required fields."""

    def test_metadata_contains_story_type(self, tmp_path: Path) -> None:
        """metadata.yaml must record the classifier decision (story_type)."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content(story_type=StoryType.INFRASTRUCTURE)
        cs = _make_classified_story(story_type=StoryType.INFRASTRUCTURE)
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        meta = (tmp_path / "metadata.yaml").read_text()
        assert "infrastructure" in meta.lower()

    def test_metadata_contains_generated_at(self, tmp_path: Path) -> None:
        """metadata.yaml must include a generated_at timestamp."""
        from pf.demo.assembler import assemble

        gc = _make_generated_content()
        cs = _make_classified_story()
        result = assemble(gc, cs, output_dir=str(tmp_path))

        assert result["success"] is True
        meta = (tmp_path / "metadata.yaml").read_text()
        assert "generated_at" in meta
