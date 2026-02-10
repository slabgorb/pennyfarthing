"""
Tests for scale level detection and workflow routing.

Stories:
  - MSSCI-12416 - Define Scale Levels
  - MSSCI-12417 - Wire Scale Level into Workflow Initiation
Epic: MSSCI-12415 - Scale Adaptation and Brownfield Support

BMAD Scale Levels:
- Level 0: fix, bug, typo, small change, patch (1 story, no artifacts)
- Level 1: simple, basic, small feature, add (1-10 stories, tech-spec)
- Level 2: dashboard, several features, admin panel (5-15 stories, PRD optional arch)
- Level 3: platform, integration, complex, system (12-40 stories, PRD + architecture)
- Level 4: enterprise, multi-tenant, multiple products (40+ stories, full BMAD)

Routing Rules:
- L0 -> trivial workflow
- L1+ -> prd workflow (full planning)
"""

import pytest


class TestScaleLevelDetection:
    """Test keyword-based scale level detection."""

    def test_level_0_fix_keywords(self):
        """Level 0 detected from fix-related keywords."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        assert detect_scale_level("fix the login bug") == 0
        assert detect_scale_level("typo in README") == 0
        assert detect_scale_level("small change to config") == 0
        assert detect_scale_level("patch the security issue") == 0
        assert detect_scale_level("bug in user authentication") == 0

    def test_level_1_simple_feature_keywords(self):
        """Level 1 detected from simple feature keywords."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        assert detect_scale_level("add a logout button") == 1
        assert detect_scale_level("simple validation for email") == 1
        assert detect_scale_level("basic search feature") == 1
        assert detect_scale_level("small feature for notifications") == 1

    def test_level_2_moderate_scope_keywords(self):
        """Level 2 detected from moderate scope keywords."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        assert detect_scale_level("build an admin panel") == 2
        assert detect_scale_level("create a dashboard for metrics") == 2
        assert detect_scale_level("several features for user management") == 2

    def test_level_3_complex_system_keywords(self):
        """Level 3 detected from complex system keywords."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        assert detect_scale_level("build a platform for data processing") == 3
        assert detect_scale_level("integration with external APIs") == 3
        assert detect_scale_level("complex workflow system") == 3
        assert detect_scale_level("new system for inventory management") == 3

    def test_level_4_enterprise_keywords(self):
        """Level 4 detected from enterprise-scale keywords."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        assert detect_scale_level("enterprise authentication system") == 4
        assert detect_scale_level("multi-tenant SaaS platform") == 4
        assert detect_scale_level("multiple products integration") == 4

    def test_case_insensitive_detection(self):
        """Keywords detected regardless of case."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        assert detect_scale_level("FIX the BUG") == 0
        assert detect_scale_level("ENTERPRISE system") == 4
        assert detect_scale_level("Simple Feature") == 1

    def test_no_keywords_defaults_to_level_1(self):
        """When no keywords match, default to Level 1."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        assert detect_scale_level("implement the thing") == 1
        assert detect_scale_level("make it work") == 1

    def test_conflicting_keywords_uses_highest_match(self):
        """When multiple levels match, use highest specificity."""
        from pennyfarthing_scripts.workflow import detect_scale_level

        # "enterprise" (L4) beats "simple" (L1)
        assert detect_scale_level("simple enterprise feature") == 4
        # "platform" (L3) beats "add" (L1)
        assert detect_scale_level("add a new platform") == 3


class TestScaleLevelFromStoryCount:
    """Test scale level inference from story count."""

    def test_single_story_is_level_0_or_1(self):
        """Single story suggests Level 0-1."""
        from pennyfarthing_scripts.workflow import scale_level_from_story_count

        assert scale_level_from_story_count(1) in [0, 1]

    def test_few_stories_is_level_1(self):
        """2-10 stories suggests Level 1."""
        from pennyfarthing_scripts.workflow import scale_level_from_story_count

        assert scale_level_from_story_count(2) == 1
        assert scale_level_from_story_count(5) == 1
        assert scale_level_from_story_count(10) == 1

    def test_moderate_stories_is_level_2(self):
        """5-15 stories suggests Level 2."""
        from pennyfarthing_scripts.workflow import scale_level_from_story_count

        assert scale_level_from_story_count(11) == 2
        assert scale_level_from_story_count(15) == 2

    def test_many_stories_is_level_3(self):
        """12-40 stories suggests Level 3."""
        from pennyfarthing_scripts.workflow import scale_level_from_story_count

        assert scale_level_from_story_count(20) == 3
        assert scale_level_from_story_count(40) == 3

    def test_enterprise_scale_stories(self):
        """40+ stories suggests Level 4."""
        from pennyfarthing_scripts.workflow import scale_level_from_story_count

        assert scale_level_from_story_count(41) == 4
        assert scale_level_from_story_count(100) == 4


class TestWorkflowRouting:
    """Test workflow selection based on scale level."""

    def test_level_0_routes_to_trivial(self):
        """Level 0 (fix/bug) routes to trivial workflow."""
        from pennyfarthing_scripts.workflow import get_workflow_for_scale_level

        assert get_workflow_for_scale_level(0) == "trivial"

    def test_level_1_routes_to_prd(self):
        """Level 1 (simple feature) routes to prd workflow."""
        from pennyfarthing_scripts.workflow import get_workflow_for_scale_level

        assert get_workflow_for_scale_level(1) == "prd"

    def test_level_2_routes_to_prd(self):
        """Level 2 (dashboard/multiple features) routes to PRD workflow."""
        from pennyfarthing_scripts.workflow import get_workflow_for_scale_level

        assert get_workflow_for_scale_level(2) == "prd"

    def test_level_3_routes_to_prd(self):
        """Level 3 (platform/system) routes to PRD workflow."""
        from pennyfarthing_scripts.workflow import get_workflow_for_scale_level

        assert get_workflow_for_scale_level(3) == "prd"

    def test_level_4_routes_to_prd(self):
        """Level 4 (enterprise) routes to PRD workflow."""
        from pennyfarthing_scripts.workflow import get_workflow_for_scale_level

        assert get_workflow_for_scale_level(4) == "prd"


class TestScaleLevelArtifacts:
    """Test required artifacts for each scale level."""

    def test_level_0_no_artifacts(self):
        """Level 0 requires no planning artifacts."""
        from pennyfarthing_scripts.workflow import get_required_artifacts

        artifacts = get_required_artifacts(0)
        assert artifacts == []

    def test_level_1_tech_spec(self):
        """Level 1 requires tech-spec only."""
        from pennyfarthing_scripts.workflow import get_required_artifacts

        artifacts = get_required_artifacts(1)
        assert "tech-spec" in artifacts
        assert "prd" not in artifacts

    def test_level_2_prd_optional_architecture(self):
        """Level 2 requires PRD, architecture is optional."""
        from pennyfarthing_scripts.workflow import get_required_artifacts

        artifacts = get_required_artifacts(2)
        assert "prd" in artifacts
        # Architecture should be in optional, not required
        assert "architecture" not in artifacts

    def test_level_3_prd_and_architecture(self):
        """Level 3 requires both PRD and architecture."""
        from pennyfarthing_scripts.workflow import get_required_artifacts

        artifacts = get_required_artifacts(3)
        assert "prd" in artifacts
        assert "architecture" in artifacts

    def test_level_4_full_bmad(self):
        """Level 4 requires full BMAD process artifacts."""
        from pennyfarthing_scripts.workflow import get_required_artifacts

        artifacts = get_required_artifacts(4)
        assert "prd" in artifacts
        assert "architecture" in artifacts
        assert "epics-and-stories" in artifacts


class TestUserOverride:
    """Test user ability to override detected scale level."""

    def test_explicit_level_overrides_detection(self):
        """User can explicitly set scale level."""
        from pennyfarthing_scripts.workflow import determine_scale_level

        # Even though "fix" suggests L0, user can override to L2
        result = determine_scale_level("fix the login", explicit_level=2)
        assert result == 2

    def test_explicit_level_validation(self):
        """Explicit level must be 0-4."""
        from pennyfarthing_scripts.workflow import determine_scale_level

        with pytest.raises(ValueError):
            determine_scale_level("anything", explicit_level=5)

        with pytest.raises(ValueError):
            determine_scale_level("anything", explicit_level=-1)


class TestScaleLevelInfo:
    """Test scale level metadata retrieval."""

    def test_get_scale_level_info(self):
        """Can retrieve full info for a scale level."""
        from pennyfarthing_scripts.workflow import get_scale_level_info

        info = get_scale_level_info(2)
        assert info["level"] == 2
        assert "scope" in info  # e.g., "dashboard, several features, admin panel"
        assert "stories_min" in info
        assert "stories_max" in info
        assert "workflow" in info
        assert "artifacts" in info

    def test_all_levels_have_info(self):
        """All levels 0-4 have complete info."""
        from pennyfarthing_scripts.workflow import get_scale_level_info

        for level in range(5):
            info = get_scale_level_info(level)
            assert info is not None
            assert info["level"] == level
