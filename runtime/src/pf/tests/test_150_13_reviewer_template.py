"""Tests for 150-13: Reviewer gate template and docs for specialist tag format.

The reviewer approval gate has conflicting requirements around specialist tag
format. Reviewers take 4+ attempts to get the format right because there's no
template. This module tests a template generator that produces a correctly-
formatted reviewer assessment skeleton with all specialist tags positioned
correctly.

Tests verify:
1. Module exists with generate_reviewer_template callable
2. All 8 dispatch tags present when all subagents enabled
3. Tags appear BEFORE ## Subagent Results heading
4. Disabled subagents excluded from template
5. ## Reviewer Assessment heading present
6. ### Rule Compliance section present
7. **Specialist findings incorporated:** line present
8. ## Subagent Results heading present
9. Template passes _check_subagent_dispatch from complete_phase.py
10. Empty enabled set produces basic structure but no tags

Story: 150-13
"""

from __future__ import annotations

import re
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALL_DISPATCH_TAGS = {"[EDGE]", "[SILENT]", "[TEST]", "[DOC]", "[TYPE]", "[SEC]", "[SIMPLE]", "[RULE]"}

# Mapping from tag to setting key (inverse of _SUBAGENT_SETTING_MAP)
TAG_TO_SETTING = {
    "[EDGE]": "edge_hunter",
    "[SILENT]": "silent_failure_hunter",
    "[TEST]": "test_analyzer",
    "[DOC]": "comment_analyzer",
    "[TYPE]": "type_design",
    "[SEC]": "security",
    "[SIMPLE]": "simplifier",
    "[RULE]": "rule_checker",
}


# ---------------------------------------------------------------------------
# Test 1: Module exists
# ---------------------------------------------------------------------------


class TestModuleExists:
    def test_import_generate_reviewer_template(self):
        """generate_reviewer_template is importable from pf.reviewer.template."""
        from pf.reviewer.template import generate_reviewer_template

        assert callable(generate_reviewer_template)


# ---------------------------------------------------------------------------
# Test 2: All 8 dispatch tags present when all subagents enabled
# ---------------------------------------------------------------------------


class TestAllTagsPresent:
    def test_all_dispatch_tags_in_template(self):
        """Template contains all 8 dispatch tags when all subagents enabled."""
        from pf.reviewer.template import generate_reviewer_template

        result = generate_reviewer_template(enabled_subagents=set(TAG_TO_SETTING.values()) | {"preflight"})
        for tag in ALL_DISPATCH_TAGS:
            assert tag in result, f"Missing dispatch tag {tag} in template output"


# ---------------------------------------------------------------------------
# Test 3: Tags appear BEFORE ## Subagent Results
# ---------------------------------------------------------------------------


class TestTagsBeforeSubagentResults:
    def test_tags_in_assessment_section(self):
        """All dispatch tags appear before the ## Subagent Results heading."""
        from pf.reviewer.template import generate_reviewer_template

        result = generate_reviewer_template(enabled_subagents=set(TAG_TO_SETTING.values()) | {"preflight"})
        subagent_results_pos = result.find("## Subagent Results")
        assert subagent_results_pos > 0, "## Subagent Results heading not found"

        for tag in ALL_DISPATCH_TAGS:
            tag_pos = result.find(tag)
            assert tag_pos < subagent_results_pos, (
                f"Tag {tag} at position {tag_pos} is not before "
                f"## Subagent Results at position {subagent_results_pos}"
            )


# ---------------------------------------------------------------------------
# Test 4: Disabled subagents excluded
# ---------------------------------------------------------------------------


class TestDisabledSubagentsExcluded:
    def test_subset_excludes_disabled_tags(self):
        """When only a subset of subagents is enabled, disabled tags are absent."""
        from pf.reviewer.template import generate_reviewer_template

        # Enable only edge_hunter and security
        enabled = {"preflight", "edge_hunter", "security"}
        result = generate_reviewer_template(enabled_subagents=enabled)

        assert "[EDGE]" in result
        assert "[SEC]" in result
        # These should NOT be present
        assert "[SILENT]" not in result
        assert "[TEST]" not in result
        assert "[DOC]" not in result
        assert "[TYPE]" not in result
        assert "[SIMPLE]" not in result
        assert "[RULE]" not in result


# ---------------------------------------------------------------------------
# Test 5: ## Reviewer Assessment heading present
# ---------------------------------------------------------------------------


class TestReviewerAssessmentHeading:
    def test_reviewer_assessment_heading(self):
        """Template contains ## Reviewer Assessment heading."""
        from pf.reviewer.template import generate_reviewer_template

        result = generate_reviewer_template(enabled_subagents=set(TAG_TO_SETTING.values()) | {"preflight"})
        assert re.search(r"^## Reviewer Assessment\b", result, re.MULTILINE)


# ---------------------------------------------------------------------------
# Test 6: ### Rule Compliance section present
# ---------------------------------------------------------------------------


class TestRuleComplianceSection:
    def test_rule_compliance_section(self):
        """Template contains ### Rule Compliance section."""
        from pf.reviewer.template import generate_reviewer_template

        result = generate_reviewer_template(enabled_subagents=set(TAG_TO_SETTING.values()) | {"preflight"})
        assert re.search(r"^### Rule Compliance\b", result, re.MULTILINE)


# ---------------------------------------------------------------------------
# Test 7: **Specialist findings incorporated:** line present
# ---------------------------------------------------------------------------


class TestSpecialistFindingsLine:
    def test_specialist_findings_incorporated_line(self):
        """Template contains **Specialist findings incorporated:** line."""
        from pf.reviewer.template import generate_reviewer_template

        result = generate_reviewer_template(enabled_subagents=set(TAG_TO_SETTING.values()) | {"preflight"})
        assert "**Specialist findings incorporated:**" in result


# ---------------------------------------------------------------------------
# Test 8: ## Subagent Results heading present
# ---------------------------------------------------------------------------


class TestSubagentResultsHeading:
    def test_subagent_results_heading(self):
        """Template contains ## Subagent Results heading."""
        from pf.reviewer.template import generate_reviewer_template

        result = generate_reviewer_template(enabled_subagents=set(TAG_TO_SETTING.values()) | {"preflight"})
        assert re.search(r"^## Subagent Results\b", result, re.MULTILINE)


# ---------------------------------------------------------------------------
# Test 9: Template passes _check_subagent_dispatch
# ---------------------------------------------------------------------------


class TestPassesGateCheck:
    def test_template_passes_subagent_dispatch_check(self):
        """Template output passes _check_subagent_dispatch from complete_phase.py."""
        from pf.reviewer.template import generate_reviewer_template
        from pf.handoff.complete_phase import _check_subagent_dispatch

        all_enabled = set(TAG_TO_SETTING.values()) | {"preflight"}
        template = generate_reviewer_template(enabled_subagents=all_enabled)

        # Mock _get_enabled_subagents to return all tags as enabled
        with patch("pf.handoff.complete_phase._get_enabled_subagents") as mock_get:
            mock_get.return_value = (
                {
                    "reviewer-preflight",
                    "reviewer-edge-hunter",
                    "reviewer-silent-failure-hunter",
                    "reviewer-test-analyzer",
                    "reviewer-comment-analyzer",
                    "reviewer-type-design",
                    "reviewer-security",
                    "reviewer-simplifier",
                    "reviewer-rule-checker",
                },
                ALL_DISPATCH_TAGS,
            )
            missing = _check_subagent_dispatch(template)

        assert missing == set(), f"Template failed gate check — missing tags: {missing}"


# ---------------------------------------------------------------------------
# Test 10: Empty enabled set — basic structure, no tags
# ---------------------------------------------------------------------------


class TestEmptyEnabledSet:
    def test_empty_enabled_set_no_tags(self):
        """With no subagents enabled, template has structure but no dispatch tags."""
        from pf.reviewer.template import generate_reviewer_template

        result = generate_reviewer_template(enabled_subagents=set())

        # Basic structure still present
        assert re.search(r"^## Reviewer Assessment\b", result, re.MULTILINE)
        assert re.search(r"^## Subagent Results\b", result, re.MULTILINE)

        # No dispatch tags
        for tag in ALL_DISPATCH_TAGS:
            assert tag not in result, f"Tag {tag} should not appear with empty enabled set"
