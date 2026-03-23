"""
Tests for story 150-1: Impact Summary enhancement — downstream effects
and deviation justifications in PR body.

The current compile_impact_summary() produces a flat list of findings with
counts. This story enhances it to include:

  AC1: Downstream effects analysis — group findings by affected module/directory,
       show cross-cutting impacts that span multiple modules
  AC2: Deviation justifications — pull Design Deviations from session and
       include rationale summaries in the Impact Summary
  AC3: Enhanced write_impact_summary_to_session reads Design Deviations section
       and passes them to the compiler
  AC4: Backward compatibility — works without deviations, existing API stable
  AC5: Edge cases — empty deviations, single finding, many modules
  AC6: Return shape — all new functions follow {success, data?, error?} pattern

Python lang-review rules tested:
  #3: Type annotations at boundaries
  #6: Test quality (meaningful assertions)
  #7: Resource leaks (tempfile cleanup in write path)
  #10: Import hygiene

Run with: python -m pytest pennyfarthing-dist/src/pf/tests/test_150_1_impact_summary_enhancement.py -v
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from pf.findings.summary import (
    compile_impact_summary,
    write_impact_summary_to_session,
)

# ─── Fixtures: parsed findings with diverse paths ──────────────────────

CROSS_MODULE_FINDINGS = [
    {
        "type": "Gap",
        "urgency": "blocking",
        "description": "Missing input validation on CLI handler",
        "path": "src/pf/cli.py",
        "what_changes": "add validation",
        "agent": "TEA",
        "phase": "test design",
    },
    {
        "type": "Improvement",
        "urgency": "non-blocking",
        "description": "Sprint YAML loader silently drops malformed entries",
        "path": "src/pf/sprint/loader.py",
        "what_changes": "add warning log",
        "agent": "Dev",
        "phase": "implementation",
    },
    {
        "type": "Gap",
        "urgency": "non-blocking",
        "description": "Jira sync skips stories without jira key",
        "path": "src/pf/jira/sync.py",
        "what_changes": "add fallback lookup",
        "agent": "Reviewer",
        "phase": "code review",
    },
    {
        "type": "Conflict",
        "urgency": "blocking",
        "description": "CLI handler uses wrong sprint loader method",
        "path": "src/pf/cli.py",
        "what_changes": "fix method call",
        "agent": "Reviewer",
        "phase": "code review",
    },
    {
        "type": "Improvement",
        "urgency": "non-blocking",
        "description": "Sprint status should show Jira link",
        "path": "src/pf/sprint/status.py",
        "what_changes": "add jira URL",
        "agent": "Dev",
        "phase": "implementation",
    },
]

SINGLE_MODULE_FINDINGS = [
    {
        "type": "Gap",
        "urgency": "blocking",
        "description": "Missing retry on network timeout",
        "path": "src/pf/jira/client.py",
        "what_changes": "add retry logic",
        "agent": "TEA",
        "phase": "test design",
    },
    {
        "type": "Improvement",
        "urgency": "non-blocking",
        "description": "Connection pool not configurable",
        "path": "src/pf/jira/client.py",
        "what_changes": "add pool size param",
        "agent": "Dev",
        "phase": "implementation",
    },
]

SAMPLE_DEVIATIONS = [
    {
        "description": "Used property-based tests instead of example list",
        "spec_source": "context-story-150-1.md, AC-1",
        "spec_text": "validate with three example sessions",
        "implementation": "Tests use property-based generation",
        "rationale": "Catches more edge cases than enumerated examples",
        "severity": "minor",
        "forward_impact": "none",
    },
    {
        "description": "Added Jinja2 dependency for template rendering",
        "spec_source": "context-story-150-1.md, AC-2",
        "spec_text": "use Python f-strings for template rendering",
        "implementation": "Jinja2 templates for maintainability",
        "rationale": "f-strings become unwieldy with complex conditional sections",
        "severity": "major",
        "forward_impact": "minor — Story 150-3 assumes string-based templates",
    },
]

BREAKING_DEVIATION = [
    {
        "description": "Changed Impact Summary schema from flat to nested",
        "spec_source": "context-story-150-1.md, AC-3",
        "spec_text": "maintain backward-compatible flat format",
        "implementation": "Nested format with downstream_effects subsection",
        "rationale": "Flat format cannot represent module groupings",
        "severity": "major",
        "forward_impact": "breaking — Story 150-2 PR body template expects flat format",
    },
]

# ─── Fixtures: session file content ────────────────────────────────────

SESSION_WITH_DEVIATIONS_AND_FINDINGS = textwrap.dedent("""\
    # Story 150-1: Impact Summary Enhancement

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## Design Deviations

    <!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Used property-based tests instead of example list**
      - Spec source: context-story-150-1.md, AC-1
      - Spec text: "validate with three example sessions"
      - Implementation: Tests use property-based generation
      - Rationale: Catches more edge cases than enumerated examples
      - Severity: minor
      - Forward impact: none

    ### Dev (implementation)
    - **Added Jinja2 dependency for template rendering**
      - Spec source: context-story-150-1.md, AC-2
      - Spec text: "use Python f-strings for template rendering"
      - Implementation: Jinja2 templates for maintainability
      - Rationale: f-strings become unwieldy with complex conditional sections
      - Severity: major
      - Forward impact: minor — Story 150-3 assumes string-based templates

    ## Delivery Findings

    Agents record upstream observations discovered during their phase.

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (blocking): Missing input validation on CLI handler. Affects `src/pf/cli.py` (add validation). *Found by TEA during test design.*

    ### Dev (implementation)
    - **Improvement** (non-blocking): Sprint YAML loader silently drops malformed entries. Affects `src/pf/sprint/loader.py` (add warning log). *Found by Dev during implementation.*

    ### Reviewer (code review)
    - **Conflict** (blocking): CLI handler uses wrong sprint loader method. Affects `src/pf/cli.py` (fix method call). *Found by Reviewer during code review.*

    ## TEA Assessment

    **Tests Required:** Yes

    ## Dev Assessment

    **Implementation:** Complete
""")

SESSION_NO_DEVIATIONS = textwrap.dedent("""\
    # Story 99-1: Simple Story

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (blocking): Missing auth check. Affects `src/auth.py` (add check). *Found by TEA during test design.*

    ## TEA Assessment

    **Tests Required:** Yes
""")

SESSION_EMPTY_DEVIATIONS = textwrap.dedent("""\
    # Story 99-2: Clean Story

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## Design Deviations

    <!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - No deviations from spec.

    ### Dev (implementation)
    - No deviations from spec.

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - No upstream findings.

    ## TEA Assessment

    **Tests Required:** Yes
""")

SESSION_WITH_BREAKING_DEVIATION = textwrap.dedent("""\
    # Story 105-3: Breaking Change Story

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## Design Deviations

    <!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

    ### Dev (implementation)
    - **Changed API contract for downstream consumers**
      - Spec source: context-story-105-3.md, AC-1
      - Spec text: "maintain backward-compatible response format"
      - Implementation: New response envelope with version field
      - Rationale: Old format cannot represent pagination metadata
      - Severity: major
      - Forward impact: breaking — Story 105-4 and 105-5 depend on old response format

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### Dev (implementation)
    - **Conflict** (blocking): Response format change breaks 2 downstream consumers. Affects `src/api/response.py` (update schema). *Found by Dev during implementation.*

    ## Dev Assessment

    **Implementation:** Complete
""")


# =============================================================================
# AC1: Downstream Effects Analysis
# =============================================================================


class TestDownstreamEffects:
    """AC1: Impact Summary includes downstream effects — findings grouped by
    affected module with cross-cutting impact identification."""

    def test_downstream_effects_section_present(self):
        """Enhanced Impact Summary must contain a downstream effects subsection."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=[]
        )
        md = result["data"]["markdown"]
        assert "### Downstream Effects" in md

    def test_findings_grouped_by_module(self):
        """Findings affecting the same directory are grouped together."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=[]
        )
        md = result["data"]["markdown"]
        # src/pf/cli.py has 2 findings — should be grouped under its module
        assert "src/pf" in md or "cli" in md
        # The grouping should show the count per module
        assert "2" in md  # Two findings in cli.py

    def test_cross_cutting_impact_identified(self):
        """When findings span multiple modules, cross-cutting impact is noted."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=[]
        )
        md = result["data"]["markdown"]
        # 5 findings across 4 files in 3 modules (cli, sprint, jira)
        # Should identify this as cross-cutting
        downstream = md[md.index("### Downstream Effects"):]
        assert "module" in downstream.lower() or "cross" in downstream.lower()

    def test_single_module_no_cross_cutting(self):
        """When all findings are in one module, no cross-cutting label."""
        result = compile_impact_summary(
            SINGLE_MODULE_FINDINGS, deviations=[]
        )
        md = result["data"]["markdown"]
        downstream = md[md.index("### Downstream Effects"):]
        # Single module — should list the module but not flag cross-cutting
        assert "jira" in downstream.lower()

    def test_affected_modules_listed(self):
        """Each unique parent directory of affected paths appears in downstream effects."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=[]
        )
        md = result["data"]["markdown"]
        downstream = md[md.index("### Downstream Effects"):]
        # Three distinct modules: cli (root pf), sprint, jira
        assert "sprint" in downstream.lower()
        assert "jira" in downstream.lower()

    def test_module_finding_count(self):
        """Each module group shows how many findings affect it."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=[]
        )
        md = result["data"]["markdown"]
        downstream = md[md.index("### Downstream Effects"):]
        # sprint has 2 findings (loader.py + status.py)
        # jira has 1 finding (sync.py)
        # cli has 2 findings (cli.py × 2)
        # These counts should appear
        assert any(c in downstream for c in ["2 finding", "1 finding"])

    def test_no_findings_no_downstream_section(self):
        """When no findings exist, downstream effects shows clean message."""
        result = compile_impact_summary([], deviations=[])
        md = result["data"]["markdown"]
        # Should still have the header but indicate no effects
        assert "No upstream effects noted" in md or "No downstream" in md

    def test_downstream_effects_data_in_result(self):
        """Result data dict includes structured downstream effects info."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=[]
        )
        data = result["data"]
        assert "downstream_effects" in data
        effects = data["downstream_effects"]
        assert isinstance(effects, list)
        assert len(effects) > 0
        # Each effect should have module and count
        first = effects[0]
        assert "module" in first
        assert "count" in first


# =============================================================================
# AC2: Deviation Justifications in Impact Summary
# =============================================================================


class TestDeviationJustifications:
    """AC2: Impact Summary includes deviation justifications pulled from
    session Design Deviations, with rationale summaries."""

    def test_deviations_section_present_when_deviations_exist(self):
        """Impact Summary includes deviation justifications subsection."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        assert "### Deviation Justifications" in md

    def test_deviation_descriptions_included(self):
        """Each deviation's short description appears in the summary."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        justifications = md[md.index("### Deviation Justifications"):]
        assert "property-based tests" in justifications.lower()
        assert "jinja2" in justifications.lower()

    def test_deviation_rationale_included(self):
        """Each deviation's rationale appears in the summary."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        justifications = md[md.index("### Deviation Justifications"):]
        assert "edge cases" in justifications.lower()
        assert "unwieldy" in justifications.lower()

    def test_deviation_severity_shown(self):
        """Deviation severity (minor/major) is visible in summary."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        justifications = md[md.index("### Deviation Justifications"):]
        assert "minor" in justifications.lower() or "major" in justifications.lower()

    def test_forward_impact_shown(self):
        """Deviation forward impact is visible in summary."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        justifications = md[md.index("### Deviation Justifications"):]
        # The major deviation has forward_impact mentioning 150-3
        assert "150-3" in justifications or "forward impact" in justifications.lower()

    def test_breaking_deviation_highlighted(self):
        """Breaking deviations are prominently marked."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=BREAKING_DEVIATION
        )
        md = result["data"]["markdown"]
        justifications = md[md.index("### Deviation Justifications"):]
        assert "BREAKING" in justifications or "breaking" in justifications.lower()

    def test_no_deviations_no_justifications_section(self):
        """When no deviations, the justifications subsection is omitted."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=[]
        )
        md = result["data"]["markdown"]
        assert "### Deviation Justifications" not in md

    def test_deviation_count_in_data(self):
        """Result data includes deviation_count."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        data = result["data"]
        assert "deviation_count" in data
        assert data["deviation_count"] == 2

    def test_breaking_count_in_data(self):
        """Result data includes breaking_deviation_count."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=BREAKING_DEVIATION
        )
        data = result["data"]
        assert "breaking_deviation_count" in data
        assert data["breaking_deviation_count"] == 1


# =============================================================================
# AC3: Enhanced write_impact_summary_to_session reads Design Deviations
# =============================================================================


class TestWriteEnhancedImpactSummary:
    """AC3: write_impact_summary_to_session() reads the Design Deviations
    section from the session and includes them in the compiled Impact Summary."""

    def test_writes_downstream_effects(self, tmp_path: Path):
        """Session with findings produces Impact Summary with downstream effects."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert "### Downstream Effects" in content

    def test_writes_deviation_justifications(self, tmp_path: Path):
        """Session with deviations produces Impact Summary with justifications."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert "### Deviation Justifications" in content

    def test_deviation_rationale_in_written_summary(self, tmp_path: Path):
        """Written Impact Summary includes actual deviation rationale text."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        # Find the Impact Summary section
        is_start = content.index("## Impact Summary")
        # Find next ## heading after Impact Summary
        rest = content[is_start + len("## Impact Summary"):]
        next_h2_idx = rest.find("\n## ")
        if next_h2_idx >= 0:
            impact_section = content[is_start:is_start + len("## Impact Summary") + next_h2_idx]
        else:
            impact_section = content[is_start:]
        assert "edge cases" in impact_section.lower() or "enumerated" in impact_section.lower()

    def test_no_deviations_session_still_succeeds(self, tmp_path: Path):
        """Session without Design Deviations section still writes Impact Summary."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_NO_DEVIATIONS)
        result = write_impact_summary_to_session(session)
        assert result["success"] is True
        content = session.read_text()
        assert "## Impact Summary" in content

    def test_empty_deviations_no_justifications(self, tmp_path: Path):
        """Session with 'No deviations from spec' markers → no justifications section."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_EMPTY_DEVIATIONS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert "## Impact Summary" in content
        assert "### Deviation Justifications" not in content

    def test_breaking_deviation_in_written_summary(self, tmp_path: Path):
        """Breaking deviations are highlighted in the written Impact Summary."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_BREAKING_DEVIATION)
        write_impact_summary_to_session(session)
        content = session.read_text()
        is_start = content.index("## Impact Summary")
        rest = content[is_start + len("## Impact Summary"):]
        next_h2_idx = rest.find("\n## ")
        if next_h2_idx >= 0:
            impact_section = content[is_start:is_start + len("## Impact Summary") + next_h2_idx]
        else:
            impact_section = content[is_start:]
        assert "breaking" in impact_section.lower()

    def test_preserves_design_deviations_section(self, tmp_path: Path):
        """Writing Impact Summary must not modify the Design Deviations section."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        # Read deviations section before
        original = session.read_text()
        dev_start = original.index("## Design Deviations")
        dev_end_rest = original[dev_start + len("## Design Deviations"):]
        dev_next = dev_end_rest.find("\n## ")
        original_deviations = original[dev_start:dev_start + len("## Design Deviations") + dev_next] if dev_next >= 0 else original[dev_start:]

        write_impact_summary_to_session(session)

        content = session.read_text()
        assert "## Design Deviations" in content
        new_dev_start = content.index("## Design Deviations")
        new_rest = content[new_dev_start + len("## Design Deviations"):]
        new_next = new_rest.find("\n## ")
        new_deviations = content[new_dev_start:new_dev_start + len("## Design Deviations") + new_next] if new_next >= 0 else content[new_dev_start:]
        assert original_deviations == new_deviations

    def test_idempotent_with_deviations(self, tmp_path: Path):
        """Calling twice with deviations produces identical result."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        write_impact_summary_to_session(session)
        first_content = session.read_text()
        write_impact_summary_to_session(session)
        second_content = session.read_text()
        assert first_content == second_content

    def test_result_includes_deviation_count(self, tmp_path: Path):
        """Result data from write includes deviation_count."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        result = write_impact_summary_to_session(session)
        assert result["success"] is True
        assert "deviation_count" in result["data"]
        assert result["data"]["deviation_count"] == 2


# =============================================================================
# AC4: Backward Compatibility
# =============================================================================


class TestBackwardCompat:
    """AC4: Existing callers of compile_impact_summary(findings) without the
    deviations parameter still work correctly."""

    def test_no_deviations_param_still_works(self):
        """compile_impact_summary(findings) without deviations kwarg succeeds."""
        result = compile_impact_summary(CROSS_MODULE_FINDINGS)
        assert result["success"] is True
        assert "markdown" in result["data"]

    def test_no_deviations_param_has_finding_count(self):
        """Existing data fields (finding_count, blocking_count) unchanged."""
        result = compile_impact_summary(CROSS_MODULE_FINDINGS)
        assert result["data"]["finding_count"] == 5
        assert result["data"]["blocking_count"] == 2

    def test_no_deviations_param_markdown_has_header(self):
        """Output still starts with ## Impact Summary."""
        result = compile_impact_summary(CROSS_MODULE_FINDINGS)
        md = result["data"]["markdown"]
        assert md.strip().startswith("## Impact Summary")

    def test_no_deviations_param_upstream_effects_line(self):
        """Upstream Effects count line still present."""
        result = compile_impact_summary(CROSS_MODULE_FINDINGS)
        md = result["data"]["markdown"]
        assert "**Upstream Effects:**" in md

    def test_no_deviations_param_blocking_line(self):
        """Blocking line still present."""
        result = compile_impact_summary(CROSS_MODULE_FINDINGS)
        md = result["data"]["markdown"]
        assert "**BLOCKING:**" in md

    def test_empty_findings_no_deviations_backward_compat(self):
        """Empty findings without deviations still produces clean output."""
        result = compile_impact_summary([])
        assert result["success"] is True
        md = result["data"]["markdown"]
        assert "No upstream effects noted" in md

    def test_write_session_backward_compat(self, tmp_path: Path):
        """write_impact_summary_to_session on session without deviations section."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_NO_DEVIATIONS)
        result = write_impact_summary_to_session(session)
        assert result["success"] is True
        assert result["data"]["finding_count"] >= 0


# =============================================================================
# AC5: Edge Cases
# =============================================================================


class TestEdgeCases:
    """AC5: Edge cases for the enhanced Impact Summary."""

    def test_deviations_none_param(self):
        """Passing deviations=None is equivalent to deviations=[]."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=None
        )
        assert result["success"] is True
        assert "### Deviation Justifications" not in result["data"]["markdown"]

    def test_single_finding_single_deviation(self):
        """Minimal case: one finding, one deviation."""
        findings = [CROSS_MODULE_FINDINGS[0]]
        deviations = [SAMPLE_DEVIATIONS[0]]
        result = compile_impact_summary(findings, deviations=deviations)
        assert result["success"] is True
        md = result["data"]["markdown"]
        assert "### Downstream Effects" in md
        assert "### Deviation Justifications" in md

    def test_many_modules_listed(self):
        """Findings across 5+ distinct modules all appear in downstream effects."""
        findings = [
            {
                "type": "Gap",
                "urgency": "non-blocking",
                "description": f"Issue in module {i}",
                "path": f"src/pf/module{i}/file.py",
                "what_changes": "fix",
                "agent": "TEA",
                "phase": "test design",
            }
            for i in range(6)
        ]
        result = compile_impact_summary(findings, deviations=[])
        data = result["data"]
        effects = data["downstream_effects"]
        assert len(effects) == 6

    def test_deviation_with_no_forward_impact(self):
        """Deviation with forward_impact='none' doesn't flag breaking."""
        deviations = [
            {
                "description": "Used alternative approach",
                "rationale": "Simpler implementation",
                "severity": "minor",
                "forward_impact": "none",
            },
        ]
        result = compile_impact_summary(
            SINGLE_MODULE_FINDINGS, deviations=deviations
        )
        data = result["data"]
        assert data.get("breaking_deviation_count", 0) == 0

    def test_deviation_missing_optional_fields(self):
        """Deviations with minimal fields (description + rationale only) still work."""
        deviations = [
            {
                "description": "Changed test approach",
                "rationale": "Better coverage",
            },
        ]
        result = compile_impact_summary(
            SINGLE_MODULE_FINDINGS, deviations=deviations
        )
        assert result["success"] is True
        md = result["data"]["markdown"]
        assert "### Deviation Justifications" in md
        assert "Changed test approach" in md

    def test_findings_same_file_grouped(self):
        """Multiple findings in the same file appear under one module group."""
        result = compile_impact_summary(
            SINGLE_MODULE_FINDINGS, deviations=[]
        )
        data = result["data"]
        effects = data["downstream_effects"]
        # Both findings are in src/pf/jira/client.py — should be one module entry
        assert len(effects) == 1
        assert effects[0]["count"] == 2


# =============================================================================
# AC6: Return Shape — {success, data?, error?} pattern
# =============================================================================


class TestReturnShape:
    """AC6: All enhanced functions follow the {success, data?, error?} pattern
    per SOUL.md principle #10."""

    def test_compile_returns_success_true(self):
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        assert result["success"] is True

    def test_compile_returns_data_dict(self):
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        assert isinstance(result["data"], dict)

    def test_compile_data_has_all_fields(self):
        """Data dict includes markdown, finding_count, blocking_count,
        downstream_effects, deviation_count, breaking_deviation_count."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        data = result["data"]
        assert "markdown" in data
        assert "finding_count" in data
        assert "blocking_count" in data
        assert "downstream_effects" in data
        assert "deviation_count" in data
        assert "breaking_deviation_count" in data

    def test_write_returns_deviation_count(self, tmp_path: Path):
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        result = write_impact_summary_to_session(session)
        assert result["success"] is True
        assert "deviation_count" in result["data"]

    def test_write_returns_downstream_effects_count(self, tmp_path: Path):
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        result = write_impact_summary_to_session(session)
        assert "downstream_module_count" in result["data"]
        assert result["data"]["downstream_module_count"] > 0


# =============================================================================
# Python lang-review rule coverage
# =============================================================================


class TestLangReviewRules:
    """Tests enforcing Python lang-review checklist rules on the implementation."""

    def test_type_annotations_on_compile(self):
        """Rule #3: compile_impact_summary has type annotations on params and return."""
        import inspect
        sig = inspect.signature(compile_impact_summary)
        # findings param should have annotation
        findings_param = sig.parameters.get("findings")
        assert findings_param is not None
        assert findings_param.annotation != inspect.Parameter.empty
        # deviations param should have annotation
        deviations_param = sig.parameters.get("deviations")
        assert deviations_param is not None
        assert deviations_param.annotation != inspect.Parameter.empty
        # return type should be annotated
        assert sig.return_annotation != inspect.Signature.empty

    def test_no_mutable_default_deviations(self):
        """Rule #2: deviations parameter must not use mutable default (list)."""
        import inspect
        sig = inspect.signature(compile_impact_summary)
        deviations_param = sig.parameters.get("deviations")
        assert deviations_param is not None
        # Default should be None, not [] (mutable default)
        if deviations_param.default is not inspect.Parameter.empty:
            assert deviations_param.default is None, (
                "deviations parameter must default to None, not a mutable list"
            )

    def test_tempfile_cleanup_in_write(self, tmp_path: Path):
        """Rule #7: write_impact_summary_to_session cleans up temp files on success."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_DEVIATIONS_AND_FINDINGS)
        write_impact_summary_to_session(session)
        # No .tmp files should remain
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert len(tmp_files) == 0, f"Temp files not cleaned up: {tmp_files}"


# =============================================================================
# Section ordering within Impact Summary
# =============================================================================


class TestSectionOrdering:
    """Verify internal ordering within the enhanced Impact Summary."""

    def test_upstream_effects_before_downstream(self):
        """**Upstream Effects:** line comes before ### Downstream Effects."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        upstream_pos = md.index("**Upstream Effects:**")
        downstream_pos = md.index("### Downstream Effects")
        assert upstream_pos < downstream_pos

    def test_downstream_before_deviations(self):
        """### Downstream Effects comes before ### Deviation Justifications."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        downstream_pos = md.index("### Downstream Effects")
        deviations_pos = md.index("### Deviation Justifications")
        assert downstream_pos < deviations_pos

    def test_blocking_before_downstream(self):
        """**BLOCKING:** items come before ### Downstream Effects."""
        result = compile_impact_summary(
            CROSS_MODULE_FINDINGS, deviations=SAMPLE_DEVIATIONS
        )
        md = result["data"]["markdown"]
        blocking_pos = md.index("**BLOCKING:**")
        downstream_pos = md.index("### Downstream Effects")
        assert blocking_pos < downstream_pos
