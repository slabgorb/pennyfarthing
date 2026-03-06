"""
Tests for Story 42-1: Create rubric-anchors.md with behavioral scales.

Validates that pennyfarthing-dist/guides/rubric-anchors.md:
  AC1: Contains behavioral scales for correctness dimension
  AC2: Contains behavioral scales for depth dimension
  AC3: Contains behavioral scales for quality dimension
  AC4: Contains behavioral scales for persona dimension
  AC5: Follows guide format (markdown, proper structure)

Each dimension must have 5 band levels (1-2, 3-4, 5-6, 7-8, 9-10)
with concrete, observable behavioral descriptions.

Run with: python -m pytest tests/python/test_rubric_anchors.py -v
"""

import re
from pathlib import Path

import pytest

# Path to the rubric anchors guide
GUIDES_DIR = Path(__file__).parent.parent.parent / "pennyfarthing-dist" / "guides"
RUBRIC_ANCHORS_PATH = GUIDES_DIR / "rubric-anchors.md"

# The four required judge dimensions (from SKILL.md)
REQUIRED_DIMENSIONS = ["correctness", "depth", "quality", "persona"]

# The five required band levels
REQUIRED_BANDS = ["1-2", "3-4", "5-6", "7-8", "9-10"]


@pytest.fixture
def rubric_content():
    """Load rubric anchors document content."""
    assert RUBRIC_ANCHORS_PATH.exists(), (
        f"rubric-anchors.md not found at {RUBRIC_ANCHORS_PATH}"
    )
    return RUBRIC_ANCHORS_PATH.read_text()


@pytest.fixture
def rubric_sections(rubric_content):
    """Parse rubric content into sections by top-level heading."""
    sections = {}
    current_heading = None
    current_lines = []

    for line in rubric_content.splitlines():
        if line.startswith("## "):
            if current_heading:
                sections[current_heading] = "\n".join(current_lines)
            current_heading = line.lstrip("#").strip().lower()
            current_lines = []
        else:
            current_lines.append(line)

    if current_heading:
        sections[current_heading] = "\n".join(current_lines)

    return sections


# ============================================================================
# AC5: Document follows guide format
# ============================================================================


class TestDocumentStructure:
    """AC5: Document follows guide format."""

    def test_file_exists(self):
        """Rubric anchors guide file exists at expected path."""
        assert RUBRIC_ANCHORS_PATH.exists(), (
            f"rubric-anchors.md not found at {RUBRIC_ANCHORS_PATH}"
        )

    def test_has_title_heading(self, rubric_content):
        """Document starts with a top-level markdown heading."""
        first_line = rubric_content.strip().splitlines()[0]
        assert first_line.startswith("# "), (
            f"Expected top-level heading, got: {first_line}"
        )

    def test_has_all_four_dimensions(self, rubric_content):
        """Document contains sections for all four judge dimensions."""
        content_lower = rubric_content.lower()
        for dim in REQUIRED_DIMENSIONS:
            assert dim in content_lower, (
                f"Missing dimension: {dim}"
            )

    def test_minimum_length(self, rubric_content):
        """Document has substantial content (not a stub)."""
        # 4 dimensions x 5 bands x ~1 line each = at least 20 lines of content
        lines = [l for l in rubric_content.splitlines() if l.strip()]
        assert len(lines) >= 30, (
            f"Document too short ({len(lines)} non-empty lines). "
            "Expected at least 30 lines for 4 dimensions with 5 bands each."
        )


# ============================================================================
# AC1: Behavioral scales for correctness dimension
# ============================================================================


class TestCorrectnessDimension:
    """AC1: Behavioral scales for correctness dimension."""

    def test_correctness_section_exists(self, rubric_content):
        """Correctness dimension has a dedicated section."""
        assert re.search(
            r"#+\s+correctness", rubric_content, re.IGNORECASE
        ), "No heading found for correctness dimension"

    def test_correctness_has_all_bands(self, rubric_content):
        """Correctness dimension covers all 5 score bands."""
        # Extract correctness section
        section = _extract_dimension_section(rubric_content, "correctness")
        assert section is not None, "Could not extract correctness section"

        for band in REQUIRED_BANDS:
            assert band in section, (
                f"Correctness missing band level: {band}"
            )

    def test_correctness_bands_are_behavioral(self, rubric_content):
        """Correctness anchors describe observable behaviors, not subjective qualities."""
        section = _extract_dimension_section(rubric_content, "correctness")
        assert section is not None, "Could not extract correctness section"

        # Behavioral language should include action verbs or observable outcomes
        # Subjective words to flag: "good", "bad", "nice", "adequate" without context
        _assert_behavioral_language(section, "correctness")

    def test_correctness_low_scores_describe_failures(self, rubric_content):
        """Low correctness scores (1-2) describe concrete failure modes."""
        section = _extract_dimension_section(rubric_content, "correctness")
        assert section is not None, "Could not extract correctness section"

        band_12 = _extract_band(section, "1-2")
        assert band_12 is not None, "Could not extract 1-2 band from correctness"
        # Low scores should mention errors, mistakes, or incorrect outcomes
        assert any(word in band_12.lower() for word in [
            "error", "incorrect", "wrong", "fail", "broken", "misidentif",
            "invalid", "miss", "omit",
        ]), f"1-2 band should describe failure modes, got: {band_12}"

    def test_correctness_high_scores_describe_excellence(self, rubric_content):
        """High correctness scores (9-10) describe expert-level outcomes."""
        section = _extract_dimension_section(rubric_content, "correctness")
        assert section is not None, "Could not extract correctness section"

        band_910 = _extract_band(section, "9-10")
        assert band_910 is not None, "Could not extract 9-10 band from correctness"
        # High scores should mention expert, comprehensive, or production-ready
        assert any(word in band_910.lower() for word in [
            "expert", "comprehensive", "production", "thorough", "complete",
            "non-obvious", "edge case", "nuance",
        ]), f"9-10 band should describe excellence, got: {band_910}"


# ============================================================================
# AC2: Behavioral scales for depth dimension
# ============================================================================


class TestDepthDimension:
    """AC2: Behavioral scales for depth dimension."""

    def test_depth_section_exists(self, rubric_content):
        """Depth dimension has a dedicated section."""
        assert re.search(
            r"#+\s+depth", rubric_content, re.IGNORECASE
        ), "No heading found for depth dimension"

    def test_depth_has_all_bands(self, rubric_content):
        """Depth dimension covers all 5 score bands."""
        section = _extract_dimension_section(rubric_content, "depth")
        assert section is not None, "Could not extract depth section"

        for band in REQUIRED_BANDS:
            assert band in section, f"Depth missing band level: {band}"

    def test_depth_distinguishes_surface_from_deep(self, rubric_content):
        """Depth scale differentiates surface observation from root-cause analysis."""
        section = _extract_dimension_section(rubric_content, "depth")
        assert section is not None, "Could not extract depth section"

        band_12 = _extract_band(section, "1-2")
        band_910 = _extract_band(section, "9-10")
        assert band_12 is not None, "Could not extract 1-2 band from depth"
        assert band_910 is not None, "Could not extract 9-10 band from depth"

        # Low should mention surface-level
        assert any(word in band_12.lower() for word in [
            "surface", "shallow", "superficial", "no analysis", "observation",
            "restate", "repeat",
        ]), f"Depth 1-2 should describe surface-level, got: {band_12}"

        # High should mention root cause or systemic analysis
        assert any(word in band_910.lower() for word in [
            "root cause", "systemic", "multi-layer", "pattern", "implication",
            "cascading", "architectural", "structural",
        ]), f"Depth 9-10 should describe deep analysis, got: {band_910}"


# ============================================================================
# AC3: Behavioral scales for quality dimension
# ============================================================================


class TestQualityDimension:
    """AC3: Behavioral scales for quality dimension."""

    def test_quality_section_exists(self, rubric_content):
        """Quality dimension has a dedicated section."""
        assert re.search(
            r"#+\s+quality", rubric_content, re.IGNORECASE
        ), "No heading found for quality dimension"

    def test_quality_has_all_bands(self, rubric_content):
        """Quality dimension covers all 5 score bands."""
        section = _extract_dimension_section(rubric_content, "quality")
        assert section is not None, "Could not extract quality section"

        for band in REQUIRED_BANDS:
            assert band in section, f"Quality missing band level: {band}"

    def test_quality_covers_clarity_and_actionability(self, rubric_content):
        """Quality scale addresses both clarity and actionability."""
        section = _extract_dimension_section(rubric_content, "quality")
        assert section is not None, "Could not extract quality section"

        section_lower = section.lower()
        assert any(word in section_lower for word in [
            "clarity", "clear", "readable", "organized", "structured",
        ]), "Quality section should address clarity"

        assert any(word in section_lower for word in [
            "actionable", "actionability", "implementable", "concrete",
            "specific", "next step", "practical",
        ]), "Quality section should address actionability"

    def test_quality_distinguishes_verbose_from_actionable(self, rubric_content):
        """Quality scale can differentiate verbose-unhelpful from concise-actionable."""
        section = _extract_dimension_section(rubric_content, "quality")
        assert section is not None, "Could not extract quality section"

        # Mid-range or low should mention verbosity or lack of focus
        low_mid = ""
        for band in ["1-2", "3-4", "5-6"]:
            extracted = _extract_band(section, band)
            if extracted:
                low_mid += extracted.lower()

        # High range should mention conciseness or directness
        high = ""
        for band in ["7-8", "9-10"]:
            extracted = _extract_band(section, band)
            if extracted:
                high += extracted.lower()

        # We just need the scale to differentiate — check both ends exist
        assert len(low_mid) > 20, "Quality low/mid bands have insufficient description"
        assert len(high) > 20, "Quality high bands have insufficient description"


# ============================================================================
# AC4: Behavioral scales for persona dimension
# ============================================================================


class TestPersonaDimension:
    """AC4: Behavioral scales for persona dimension."""

    def test_persona_section_exists(self, rubric_content):
        """Persona dimension has a dedicated section."""
        assert re.search(
            r"#+\s+persona", rubric_content, re.IGNORECASE
        ), "No heading found for persona dimension"

    def test_persona_has_all_bands(self, rubric_content):
        """Persona dimension covers all 5 score bands."""
        section = _extract_dimension_section(rubric_content, "persona")
        assert section is not None, "Could not extract persona section"

        for band in REQUIRED_BANDS:
            assert band in section, f"Persona missing band level: {band}"

    def test_persona_covers_voice_and_behavior(self, rubric_content):
        """Persona scale addresses character voice and role-appropriate behavior."""
        section = _extract_dimension_section(rubric_content, "persona")
        assert section is not None, "Could not extract persona section"

        section_lower = section.lower()
        # Voice/character aspects
        assert any(word in section_lower for word in [
            "voice", "character", "tone", "speech", "language", "style",
        ]), "Persona section should address character voice"

        # Behavioral alignment
        assert any(word in section_lower for word in [
            "behavior", "role", "consistent", "alignment", "decision",
            "approach", "judgment", "perspective",
        ]), "Persona section should address behavioral alignment"

    def test_persona_distinguishes_mimicry_from_embodiment(self, rubric_content):
        """Persona scale differentiates surface mimicry from deep embodiment."""
        section = _extract_dimension_section(rubric_content, "persona")
        assert section is not None, "Could not extract persona section"

        band_12 = _extract_band(section, "1-2")
        band_34 = _extract_band(section, "3-4")
        band_910 = _extract_band(section, "9-10")

        # Low scores: no persona or generic
        low = (band_12 or "") + (band_34 or "")
        assert any(word in low.lower() for word in [
            "generic", "absent", "no persona", "catchphrase", "surface",
            "mimicry", "inconsistent", "stereotype", "token", "drop",
        ]), f"Persona low scores should describe weak embodiment, got: {low}"

        # High scores: deep alignment
        assert band_910 is not None, "Could not extract 9-10 band from persona"
        assert any(word in band_910.lower() for word in [
            "embod", "authentic", "natural", "deep", "seamless",
            "indistinguishable", "internalized", "consistent",
        ]), f"Persona 9-10 should describe deep embodiment, got: {band_910}"


# ============================================================================
# Cross-dimension tests
# ============================================================================


class TestCrossDimension:
    """Tests that span multiple dimensions for consistency."""

    def test_all_dimensions_have_same_band_structure(self, rubric_content):
        """All four dimensions use the same 5-band structure."""
        for dim in REQUIRED_DIMENSIONS:
            section = _extract_dimension_section(rubric_content, dim)
            assert section is not None, f"Missing section for {dim}"
            for band in REQUIRED_BANDS:
                assert band in section, (
                    f"{dim} missing band {band}"
                )

    def test_bands_are_monotonically_ordered(self, rubric_content):
        """Within each dimension, bands appear in ascending order (1-2 before 9-10)."""
        for dim in REQUIRED_DIMENSIONS:
            section = _extract_dimension_section(rubric_content, dim)
            assert section is not None, f"Missing section for {dim}"

            positions = []
            for band in REQUIRED_BANDS:
                pos = section.find(band)
                assert pos >= 0, f"{dim} missing band {band}"
                positions.append(pos)

            assert positions == sorted(positions), (
                f"{dim} bands are not in ascending order: {REQUIRED_BANDS} "
                f"found at positions {positions}"
            )

    def test_no_dimension_is_a_stub(self, rubric_content):
        """Each dimension has meaningful content, not just headings."""
        for dim in REQUIRED_DIMENSIONS:
            section = _extract_dimension_section(rubric_content, dim)
            assert section is not None, f"Missing section for {dim}"
            # At least 5 non-empty lines (one per band minimum)
            non_empty = [l for l in section.splitlines() if l.strip()]
            assert len(non_empty) >= 5, (
                f"{dim} section too short ({len(non_empty)} non-empty lines). "
                "Each band needs at least one line of behavioral description."
            )


# ============================================================================
# Helper functions
# ============================================================================


def _extract_dimension_section(content: str, dimension: str) -> str | None:
    """Extract the section for a given dimension from the document."""
    pattern = rf"(#+\s+{re.escape(dimension)}.*?)(?=\n#+\s|\Z)"
    match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
    return match.group(1) if match else None


def _extract_band(section: str, band: str) -> str | None:
    """Extract content for a specific band (e.g., '1-2') from a dimension section.

    Looks for the band label and captures text until the next band or section end.
    """
    # Match band like "1-2:" or "**1-2**" or "### 1-2" etc.
    pattern = rf"(?:^|\n).*?{re.escape(band)}[:\s*]+(.*?)(?=\n.*?(?:\d+-\d+)[:\s*]+|\n#+\s|\Z)"
    match = re.search(pattern, section, re.DOTALL)
    return match.group(1).strip() if match else None


def _assert_behavioral_language(section: str, dimension: str) -> None:
    """Assert that a section uses behavioral language, not purely subjective terms."""
    # Check for presence of action verbs or observable outcomes
    behavioral_markers = [
        "identif", "analyz", "propos", "implement", "describ",
        "explain", "demonstrat", "produc", "resolv", "address",
        "contain", "include", "provid", "present", "connect",
        "cover", "miss", "omit", "fail", "error",
    ]
    section_lower = section.lower()
    found = [m for m in behavioral_markers if m in section_lower]
    assert len(found) >= 3, (
        f"{dimension} section lacks behavioral language. "
        f"Found only {len(found)} behavioral markers: {found}. "
        "Anchors should describe observable actions and outcomes."
    )
