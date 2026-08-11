"""
Tests for Story 130-3: Tandem Partner Selection and Integration.

Validates that the pf-context skill supports tandem partner selection
during story context creation with:
  AC1: Partner selection logic based on workflow type
  AC2: Integration with tandem protocol (backseat spawn)
  AC3: Override flags (--no-tandem, --tandem)
  AC4: Graceful degradation on backseat failure
  AC5: PM-only deferral note removed / replaced with tandem instructions

Run with: python -m pytest tests/python/test_context_tandem_integration.py -v
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
    # Skill body file was renamed skill.md -> context.md (skill dir name carries the id).
    return PROJECT_ROOT / "pennyfarthing-dist" / "skills" / "pf-context" / "context.md"


@pytest.fixture
def skill_content(skill_path):
    """Read the pf-context skill definition."""
    assert skill_path.exists(), f"Skill file not found: {skill_path}"
    return skill_path.read_text()


@pytest.fixture
def story_section(skill_content):
    """Extract the Create Story Context section."""
    section = _extract_story_section(skill_content)
    assert section is not None, (
        "Cannot find '## Create Story Context' section in skill.md"
    )
    return section


# =============================================================================
# AC1: Partner selection logic based on workflow type
# =============================================================================


class TestAC1PartnerSelectionLogic:
    """Skill must define workflow-to-partner mapping rules."""

    def test_skill_maps_tdd_to_architect(self, story_section):
        """tdd workflow must select architect as tandem partner."""
        lower = story_section.lower()
        # Must mention tdd mapping to architect
        assert "tdd" in lower and "architect" in lower, (
            "Story section does not map tdd workflow to architect partner. "
            "Per ADR-0029 Rule #5: tdd → Architect."
        )

    def test_skill_maps_trivial_to_architect(self, story_section):
        """trivial workflow must select architect as tandem partner."""
        lower = story_section.lower()
        assert "trivial" in lower and "architect" in lower, (
            "Story section does not map trivial workflow to architect partner. "
            "Per ADR-0029 Rule #5: trivial → Architect."
        )

    def test_skill_maps_bdd_to_ux_designer(self, story_section):
        """bdd workflow must select ux-designer as tandem partner."""
        lower = story_section.lower()
        assert "bdd" in lower and "ux" in lower, (
            "Story section does not map bdd workflow to ux-designer partner. "
            "Per ADR-0029 Rule #5: bdd → UX-Designer."
        )

    def test_skill_has_selection_table_or_rules(self, story_section):
        """Skill must have a clear selection mapping (table or rule list)."""
        lower = story_section.lower()
        # Should have either a table with workflow→partner or explicit rule listing
        has_selection = (
            ("selection" in lower or "partner" in lower or "mapping" in lower)
            and ("workflow" in lower)
        )
        assert has_selection, (
            "Story section lacks a clear partner selection mechanism. "
            "Must define workflow → partner mapping (table or rules)."
        )


# =============================================================================
# AC2: Integration with tandem protocol (backseat spawn)
# =============================================================================


class TestAC2TandemProtocolIntegration:
    """Skill must instruct spawning backseat via tandem protocol."""

    def test_skill_mentions_backseat_spawn(self, story_section):
        """Skill must instruct spawning a tandem backseat observer."""
        lower = story_section.lower()
        assert "backseat" in lower or "tandem" in lower or "spawn" in lower, (
            "Story section does not mention spawning a tandem backseat. "
            "Must integrate with existing tandem protocol for background observation."
        )

    def test_skill_references_observation_scope(self, story_section):
        """Skill must specify observation scope for the backseat partner."""
        lower = story_section.lower()
        # The epic context specifies scope "context-creation"
        assert "scope" in lower or "observation" in lower or "context-creation" in lower, (
            "Story section does not mention observation scope for backseat. "
            "Must specify scope (e.g., context-creation) per tandem protocol."
        )

    def test_skill_mentions_reading_workflow_field(self, story_section):
        """Skill must instruct reading the story's workflow field for selection."""
        lower = story_section.lower()
        assert "workflow" in lower, (
            "Story section does not mention reading the workflow field. "
            "Must read story workflow to determine tandem partner."
        )


# =============================================================================
# AC3: Override flags (--no-tandem, --tandem)
# =============================================================================


class TestAC3OverrideFlags:
    """Skill must support --no-tandem and --tandem override flags."""

    def test_skill_supports_no_tandem_flag(self, story_section):
        """Skill must document --no-tandem flag to skip partner spawn."""
        assert "--no-tandem" in story_section, (
            "Story section does not mention --no-tandem flag. "
            "Per ADR-0029 Rule #9: --no-tandem skips partner spawn entirely."
        )

    def test_skill_supports_tandem_override_flag(self, story_section):
        """Skill must document --tandem flag for explicit partner override."""
        assert "--tandem" in story_section, (
            "Story section does not mention --tandem override flag. "
            "Must support --tandem architect|ux to override automatic selection."
        )

    def test_skill_args_include_flags(self, skill_content):
        """Skill frontmatter args should hint at tandem flag support."""
        # Extract YAML frontmatter
        parts = skill_content.split("---")
        assert len(parts) >= 3, "Skill file missing YAML frontmatter"

        frontmatter = yaml.safe_load(parts[1])
        args = frontmatter.get("args", "")

        # Args should mention tandem flags or at least the story command with options
        assert "no-tandem" in args or "tandem" in args, (
            f"Skill frontmatter args='{args}' does not reference tandem flags. "
            "Should include flag hints like '[--no-tandem] [--tandem partner]'."
        )


# =============================================================================
# AC4: Graceful degradation on backseat failure
# =============================================================================


class TestAC4GracefulDegradation:
    """Skill must handle backseat failure by continuing PM-only."""

    def test_skill_handles_backseat_failure(self, story_section):
        """Skill must instruct continuing solo if backseat fails."""
        lower = story_section.lower()
        has_failure_handling = (
            ("fail" in lower or "error" in lower or "silent" in lower)
            and ("continu" in lower or "solo" in lower or "pm" in lower)
        )
        assert has_failure_handling, (
            "Story section does not handle backseat failure. "
            "Per ADR-0029: tandem failure is silent — PM continues solo."
        )

    def test_skill_does_not_block_on_tandem_failure(self, story_section):
        """Skill must not make tandem a hard requirement for context creation."""
        lower = story_section.lower()
        # Should NOT have language like "must have tandem" or "require tandem"
        # Instead should have "optional" or "graceful" or "continues"
        has_graceful = (
            "optional" in lower
            or "graceful" in lower
            or "continues" in lower
            or "continue" in lower
            or "solo" in lower
            or "warning" in lower
        )
        assert has_graceful, (
            "Story section does not make tandem optional/graceful. "
            "Tandem is enhancement, not gate — context creation must succeed without it."
        )


# =============================================================================
# AC5: PM-only deferral note removed
# =============================================================================


class TestAC5PMOnlyDeferralRemoved:
    """The PM-only mode deferral note must be replaced with tandem instructions."""

    def test_pm_only_deferral_removed(self, skill_content):
        """The 'deferred to 130-3' note must be removed from constraints."""
        assert "deferred to 130-3" not in skill_content, (
            "Skill still contains 'deferred to 130-3' placeholder. "
            "Story 130-3 IS the tandem integration — the deferral must be replaced "
            "with actual tandem instructions."
        )

    def test_pm_only_constraint_updated(self, skill_content):
        """The PM-only mode constraint should be updated or removed."""
        # The constraint line "PM-only mode: No tandem partner spawning" should be gone
        assert "No tandem partner spawning" not in skill_content, (
            "Skill still says 'No tandem partner spawning'. "
            "Story 130-3 adds tandem support — this constraint must be updated."
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
