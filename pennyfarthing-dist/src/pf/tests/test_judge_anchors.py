"""Tests for story 42-2: Reference anchors in judge prompts.

Validates that pf-judge/SKILL.md includes behavioral anchor descriptions
from rubric-anchors.md in all judge prompt templates.

Acceptance Criteria:
- [AC1] Solo mode generic rubric references behavioral anchors for all 4 dimensions
- [AC2] Solo mode checklist rubric references anchors for quality/persona, preserves detection
- [AC3] Compare mode rubric references behavioral anchors for all 4 dimensions
- [AC4] Phase-specific rubrics reference relevant behavioral anchors
- [AC5] SKILL.md references rubric-anchors.md as source of truth
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_REPO = Path(__file__).resolve().parents[3]  # pennyfarthing-dist/
_SKILL_MD = _REPO / "skills" / "pf-judge" / "SKILL.md"
_ANCHORS_MD = _REPO / "guides" / "rubric-anchors.md"

DIMENSIONS = ["correctness", "depth", "quality", "persona"]
BAND_LEVELS = ["1-2", "3-4", "5-6", "7-8", "9-10"]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def skill_md() -> str:
    assert _SKILL_MD.exists(), f"SKILL.md not found at {_SKILL_MD}"
    return _SKILL_MD.read_text()


@pytest.fixture(scope="module")
def anchors_md() -> str:
    assert _ANCHORS_MD.exists(), f"rubric-anchors.md not found at {_ANCHORS_MD}"
    return _ANCHORS_MD.read_text()


@pytest.fixture(scope="module")
def anchor_snippets(anchors_md: str) -> dict[str, dict[str, str]]:
    """Extract anchor text per dimension per band from rubric-anchors.md.

    Returns: {dimension: {band: first_sentence_of_anchor}}
    """
    result: dict[str, dict[str, str]] = {}
    current_dim = None

    for line in anchors_md.splitlines():
        heading = re.match(r"^## (\w+)", line)
        if heading:
            current_dim = heading.group(1).lower()
            result[current_dim] = {}
            continue

        if current_dim is None:
            continue

        band_match = re.match(r"\*\*(\d+-\d+):\*\*\s+(.+)", line)
        if band_match:
            band = band_match.group(1)
            # Use first distinctive phrase (first 6+ words) as fingerprint
            text = band_match.group(2)
            words = text.split()
            snippet = " ".join(words[:8])
            result[current_dim][band] = snippet

    return result


def _extract_section(text: str, summary_pattern: str) -> str:
    """Extract content from a <details> block matching a summary pattern."""
    pattern = (
        r"<details>\s*\n\s*<summary>"
        + re.escape(summary_pattern)
        + r".*?</summary>\s*\n(.*?)</details>"
    )
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1)
    return ""


# ===========================================================================
# AC1: Solo mode generic rubric references behavioral anchors
# ===========================================================================


class TestAC1SoloGenericAnchors:
    """Solo mode generic rubric must include behavioral anchors for all 4 dims."""

    def test_solo_generic_section_exists(self, skill_md: str) -> None:
        section = _extract_section(skill_md, "<strong>Solo Mode Prompt (Generic Rubric)</strong>")
        assert section, "Solo Mode Prompt (Generic Rubric) section not found in SKILL.md"

    @pytest.mark.parametrize("dimension", DIMENSIONS)
    def test_dimension_has_anchor_text(
        self, skill_md: str, anchor_snippets: dict, dimension: str
    ) -> None:
        """Each dimension in solo generic must include behavioral anchor descriptions."""
        section = _extract_section(skill_md, "<strong>Solo Mode Prompt (Generic Rubric)</strong>")
        assert section, "Solo generic section not found"

        # The section should contain anchor text for this dimension
        dim_snippets = anchor_snippets.get(dimension, {})
        assert dim_snippets, f"No anchor snippets found for {dimension}"

        for band in BAND_LEVELS:
            snippet = dim_snippets.get(band, "")
            assert snippet, f"No snippet for {dimension} band {band}"
            assert snippet in section, (
                f"Solo generic missing {dimension} band {band} anchor: '{snippet}'"
            )

    def test_all_five_bands_per_dimension(self, skill_md: str) -> None:
        """Each dimension must have all 5 band levels (1-2 through 9-10)."""
        section = _extract_section(skill_md, "<strong>Solo Mode Prompt (Generic Rubric)</strong>")
        assert section, "Solo generic section not found"

        for dim in DIMENSIONS:
            for band in BAND_LEVELS:
                assert band in section, (
                    f"Solo generic missing band level {band} for {dim}"
                )


# ===========================================================================
# AC2: Solo mode checklist rubric — anchors for quality/persona, detection preserved
# ===========================================================================


class TestAC2SoloChecklistAnchors:
    """Checklist mode: quality + persona get anchors, detection keeps precision/recall."""

    @pytest.mark.parametrize("dimension", ["quality", "persona"])
    def test_checklist_has_anchors_for_quality_persona(
        self, skill_md: str, anchor_snippets: dict, dimension: str
    ) -> None:
        """Quality and persona in checklist mode include behavioral anchors."""
        section = _extract_section(
            skill_md, "<strong>Solo Mode Prompt (Checklist Rubric v2 - Precision/Recall)</strong>"
        )
        assert section, "Checklist rubric section not found"

        dim_snippets = anchor_snippets.get(dimension, {})
        # At least the extreme bands should be present
        for band in ["1-2", "9-10"]:
            snippet = dim_snippets.get(band, "")
            assert snippet, f"No snippet for {dimension} band {band}"
            assert snippet in section, (
                f"Checklist missing {dimension} band {band} anchor: '{snippet}'"
            )

    def test_detection_preserves_precision_recall(self, skill_md: str) -> None:
        """Detection dimension must retain precision/recall formulas, not be overridden."""
        section = _extract_section(
            skill_md, "<strong>Solo Mode Prompt (Checklist Rubric v2 - Precision/Recall)</strong>"
        )
        assert section, "Checklist rubric section not found"

        # These precision/recall formulas must still be present
        assert "recall" in section.lower(), "Detection must retain recall scoring"
        assert "precision" in section.lower(), "Detection must retain precision scoring"
        assert "f2_score" in section, "Detection must retain F2 score formula"
        assert "weighted_found" in section, "Detection must retain weighted_found metric"

    def test_detection_not_overridden_by_anchors(
        self, skill_md: str, anchor_snippets: dict
    ) -> None:
        """Detection section should NOT contain correctness/depth anchor text."""
        section = _extract_section(
            skill_md, "<strong>Solo Mode Prompt (Checklist Rubric v2 - Precision/Recall)</strong>"
        )
        assert section, "Checklist rubric section not found"

        # The detection scoring block shouldn't have correctness anchors injected
        # (correctness anchors talk about "factual errors" and "root causes" which
        # are not part of detection scoring)
        correctness_12 = anchor_snippets.get("correctness", {}).get("1-2", "")
        if correctness_12 and "Detection Scoring" in section:
            detection_block = section.split("Detection Scoring")[1]
            assert correctness_12 not in detection_block, (
                "Correctness anchor text should NOT appear in the Detection Scoring section"
            )


# ===========================================================================
# AC3: Compare mode rubric references behavioral anchors
# ===========================================================================


class TestAC3CompareAnchors:
    """Compare mode must include behavioral anchors for all 4 dimensions."""

    def test_compare_section_exists(self, skill_md: str) -> None:
        section = _extract_section(skill_md, "<strong>Compare Mode Prompt</strong>")
        assert section, "Compare Mode Prompt section not found in SKILL.md"

    @pytest.mark.parametrize("dimension", DIMENSIONS)
    def test_compare_dimension_has_anchors(
        self, skill_md: str, anchor_snippets: dict, dimension: str
    ) -> None:
        """Each dimension in compare mode must include behavioral anchor descriptions."""
        section = _extract_section(skill_md, "<strong>Compare Mode Prompt</strong>")
        assert section, "Compare section not found"

        dim_snippets = anchor_snippets.get(dimension, {})
        for band in BAND_LEVELS:
            snippet = dim_snippets.get(band, "")
            assert snippet, f"No snippet for {dimension} band {band}"
            assert snippet in section, (
                f"Compare mode missing {dimension} band {band} anchor: '{snippet}'"
            )


# ===========================================================================
# AC4: Phase-specific rubrics reference relevant anchors
# ===========================================================================


class TestAC4PhaseAnchors:
    """Phase rubrics (SM, TEA, Dev, Reviewer) include relevant behavioral anchors."""

    def test_phase_section_exists(self, skill_md: str) -> None:
        section = _extract_section(
            skill_md, "<strong>Phase Mode and Coherence Mode Prompts</strong>"
        )
        assert section, "Phase Mode section not found in SKILL.md"

    @pytest.mark.parametrize(
        "phase,expected_keyword",
        [
            ("SM", "behavioral anchor"),
            ("TEA", "behavioral anchor"),
            ("Dev", "behavioral anchor"),
            ("Reviewer", "behavioral anchor"),
        ],
    )
    def test_phase_has_anchor_reference(
        self, skill_md: str, phase: str, expected_keyword: str
    ) -> None:
        """Each phase prompt must include at least one anchor reference."""
        section = _extract_section(
            skill_md, "<strong>Phase Mode and Coherence Mode Prompts</strong>"
        )
        assert section, "Phase section not found"

        # Phase section should mention anchors for each phase
        # Look for either inline anchors or a reference to rubric-anchors.md
        has_anchor = (
            expected_keyword.lower() in section.lower()
            or "rubric-anchors" in section.lower()
            or any(
                band in section
                for band in BAND_LEVELS
            )
        )
        assert has_anchor, (
            f"Phase {phase} prompt has no behavioral anchor reference"
        )

    @pytest.mark.parametrize(
        "phase_rubric",
        ["SM Phase Rubric", "TEA Phase Rubric", "Dev Phase Rubric", "Reviewer Phase Rubric"],
    )
    def test_phase_rubric_details_has_anchors(self, skill_md: str, phase_rubric: str) -> None:
        """Each phase rubric details section should reference behavioral anchors."""
        section = _extract_section(skill_md, f"<strong>{phase_rubric}</strong>")
        assert section, f"{phase_rubric} section not found"

        # Phase rubrics should include band-level descriptions or anchor references
        has_bands = any(band in section for band in BAND_LEVELS)
        has_ref = "rubric-anchors" in section.lower() or "behavioral anchor" in section.lower()
        assert has_bands or has_ref, (
            f"{phase_rubric} has no behavioral anchors or anchor reference"
        )


# ===========================================================================
# AC5: Anchor references sourced from rubric-anchors.md
# ===========================================================================


class TestAC5AnchorSourceReference:
    """SKILL.md must reference rubric-anchors.md as the source of truth."""

    def test_skill_references_rubric_anchors(self, skill_md: str) -> None:
        """SKILL.md must contain a reference to rubric-anchors.md."""
        assert "rubric-anchors.md" in skill_md, (
            "SKILL.md must reference rubric-anchors.md as source of truth"
        )

    def test_reference_is_in_rubric_section(self, skill_md: str) -> None:
        """The rubric-anchors.md reference should appear near the rubric definitions."""
        # Find where rubric-anchors.md is mentioned
        idx = skill_md.find("rubric-anchors.md")
        assert idx >= 0, "rubric-anchors.md reference not found"

        # It should be near dimension/rubric content, not just in a random comment
        context = skill_md[max(0, idx - 500):idx + 500]
        rubric_terms = ["dimension", "correctness", "depth", "quality", "persona", "anchor", "rubric"]
        matches = sum(1 for term in rubric_terms if term.lower() in context.lower())
        assert matches >= 2, (
            f"rubric-anchors.md reference appears isolated from rubric content "
            f"(only {matches} rubric-related terms nearby)"
        )

    def test_anchor_text_matches_source(
        self, skill_md: str, anchor_snippets: dict
    ) -> None:
        """Anchor text in SKILL.md must match what's in rubric-anchors.md (no drift)."""
        # For each dimension, check that any anchor text present in SKILL.md
        # matches the source file exactly (using snippet fingerprints)
        missing = []
        for dimension, bands in anchor_snippets.items():
            for band, snippet in bands.items():
                if snippet not in skill_md:
                    missing.append(f"{dimension} band {band}: '{snippet}'")

        assert not missing, (
            f"Anchor text in SKILL.md drifted from rubric-anchors.md:\n"
            + "\n".join(missing)
        )
