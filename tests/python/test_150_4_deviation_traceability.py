"""Tests for deviation traceability — link every deviation to spec source.

Story: 150-4 (Deviation traceability — link every deviation to its spec source)

Tests the deviation traceability module that:
1. Parses Spec source fields into structured references (file path, AC, section)
2. Parses Forward impact fields into affected story IDs
3. Builds a traceability matrix: deviation → source → affected stories
4. Integrates with existing deviations.py validation

Run with: python -m pytest tests/python/test_150_4_deviation_traceability.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_session(tmp_path):
    """Factory: write session content to a temp file and return its path."""

    def _write(content: str, name: str = "session.md") -> Path:
        p = tmp_path / name
        p.write_text(textwrap.dedent(content))
        return p

    return _write


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

SESSION_WITH_DEVIATIONS = """\
# Story 99-1: Test Story

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- **Used TOML instead of YAML**
  - Spec source: context-story-99-1.md, Assumptions section
  - Spec text: "YAML format only"
  - Implementation: Used TOML for config parsing
  - Rationale: TOML has better type safety
  - Severity: minor
  - Forward impact: none

- **Replaced data model with class-based approach**
  - Spec source: context-story-99-1.md, AC-1
  - Spec text: "Module exists with function foo()"
  - Implementation: Replaced foo() with BarHandler class
  - Rationale: Class-based is more extensible
  - Severity: major
  - Forward impact: breaking — 99-2, 99-3
"""

SESSION_MULTIPLE_AGENTS = """\
# Story 99-2: Multi-agent deviations

## Design Deviations

### TEA (test design)
- **Added extra edge case tests**
  - Spec source: context-story-99-2.md, AC-3
  - Spec text: "Test happy path"
  - Implementation: Added boundary tests beyond AC scope
  - Rationale: Found edge cases during test design
  - Severity: minor
  - Forward impact: minor — 99-4

### Dev (implementation)
- **Changed return type from list to generator**
  - Spec source: SOUL.md, Principle 10
  - Spec text: "Return result objects"
  - Implementation: Returns generator for memory efficiency
  - Rationale: Large datasets would OOM with list
  - Severity: major
  - Forward impact: breaking — 99-5, 99-6, 99-7
"""

SESSION_NO_DEVIATIONS = """\
# Story 99-3: Clean story

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.
"""

SESSION_MIXED_IMPACT = """\
# Story 99-4: Mixed impacts

## Design Deviations

### Dev (implementation)
- **Added caching layer**
  - Spec source: context-story-99-4.md, AC-2
  - Spec text: "Direct database access"
  - Implementation: Added Redis caching
  - Rationale: Performance requirement
  - Severity: minor
  - Forward impact: minor — 99-8

- **Changed API endpoint path**
  - Spec source: docs/api-spec.md, Section 3
  - Spec text: "/api/v1/items"
  - Implementation: "/api/v2/items"
  - Rationale: Versioning strategy change
  - Severity: major
  - Forward impact: breaking — 99-9, 99-10
"""


# =============================================================================
# AC-1: parse_spec_source() extracts structured reference from Spec source field
# =============================================================================


class TestParseSpecSource:
    """AC-1: Parse Spec source field into structured reference with
    document path, reference type (file, AC, section), and specific location."""

    def test_import(self):
        from pf.gates.deviation_traceability import parse_spec_source
        assert callable(parse_spec_source)

    def test_file_with_section(self):
        from pf.gates.deviation_traceability import parse_spec_source
        result = parse_spec_source("context-story-99-1.md, Assumptions section")
        assert result["document"] == "context-story-99-1.md"
        assert result["ref_type"] == "file"

    def test_file_with_ac_reference(self):
        from pf.gates.deviation_traceability import parse_spec_source
        result = parse_spec_source("context-story-99-1.md, AC-1")
        assert result["document"] == "context-story-99-1.md"
        assert "AC-1" in result.get("location", "")

    def test_soul_md_reference(self):
        from pf.gates.deviation_traceability import parse_spec_source
        result = parse_spec_source("SOUL.md, Principle 10")
        assert result["document"] == "SOUL.md"

    def test_docs_path_reference(self):
        from pf.gates.deviation_traceability import parse_spec_source
        result = parse_spec_source("docs/api-spec.md, Section 3")
        assert result["document"] == "docs/api-spec.md"
        assert result["ref_type"] == "file"

    def test_returns_dict_with_required_keys(self):
        from pf.gates.deviation_traceability import parse_spec_source
        result = parse_spec_source("context-story-99-1.md, AC-1")
        assert "document" in result
        assert "ref_type" in result
        assert "location" in result

    def test_empty_string_returns_unknown(self):
        from pf.gates.deviation_traceability import parse_spec_source
        result = parse_spec_source("")
        assert result["ref_type"] == "unknown"


# =============================================================================
# AC-2: parse_forward_impact() extracts affected story IDs
# =============================================================================


class TestParseForwardImpact:
    """AC-2: Parse Forward impact field into impact level and list of
    affected story IDs."""

    def test_import(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        assert callable(parse_forward_impact)

    def test_none_impact(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        result = parse_forward_impact("none")
        assert result["level"] == "none"
        assert result["affected_stories"] == []

    def test_breaking_with_stories(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        result = parse_forward_impact("breaking — 99-2, 99-3")
        assert result["level"] == "breaking"
        assert "99-2" in result["affected_stories"]
        assert "99-3" in result["affected_stories"]

    def test_minor_with_story(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        result = parse_forward_impact("minor — 99-4")
        assert result["level"] == "minor"
        assert "99-4" in result["affected_stories"]

    def test_returns_dict_with_required_keys(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        result = parse_forward_impact("breaking — 99-2")
        assert "level" in result
        assert "affected_stories" in result

    def test_empty_string(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        result = parse_forward_impact("")
        assert result["level"] == "unknown"
        assert result["affected_stories"] == []

    def test_multiple_stories_various_formats(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        result = parse_forward_impact("breaking — 99-5, 99-6, 99-7")
        assert len(result["affected_stories"]) == 3


# =============================================================================
# AC-3: build_traceability_matrix() from session file
# =============================================================================


class TestBuildTraceabilityMatrix:
    """AC-3: Build a traceability matrix from a session file that maps
    each deviation to its spec source and affected stories."""

    def test_import(self):
        from pf.gates.deviation_traceability import build_traceability_matrix
        assert callable(build_traceability_matrix)

    def test_returns_result_object(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert "success" in result
        assert "data" in result
        assert "error" in result

    def test_success_on_valid_session(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert result["success"] is True

    def test_matrix_has_entries(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert result["success"] is True
        matrix = result["data"]["matrix"]
        assert len(matrix) > 0

    def test_entry_has_deviation_description(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        entry = result["data"]["matrix"][0]
        assert "deviation" in entry
        assert len(entry["deviation"]) > 0

    def test_entry_has_spec_source(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        entry = result["data"]["matrix"][0]
        assert "spec_source" in entry
        assert "document" in entry["spec_source"]

    def test_entry_has_forward_impact(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        entry = result["data"]["matrix"][0]
        assert "forward_impact" in entry
        assert "level" in entry["forward_impact"]

    def test_entry_has_agent(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        entry = result["data"]["matrix"][0]
        assert "agent" in entry

    def test_matrix_counts_match_deviations(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        # SESSION_WITH_DEVIATIONS has 2 real deviations (Dev agent)
        matrix = result["data"]["matrix"]
        assert len(matrix) == 2

    def test_no_deviations_returns_empty_matrix(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_NO_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert result["success"] is True
        assert len(result["data"]["matrix"]) == 0

    def test_multi_agent_deviations(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_MULTIPLE_AGENTS)
        result = build_traceability_matrix(session)
        assert result["success"] is True
        matrix = result["data"]["matrix"]
        # 1 from TEA + 1 from Dev = 2 entries
        assert len(matrix) == 2
        agents = {e["agent"] for e in matrix}
        assert "tea" in agents
        assert "dev" in agents


# =============================================================================
# AC-4: Aggregate affected stories across all deviations
# =============================================================================


class TestAffectedStories:
    """AC-4: The traceability result includes a deduplicated list of all
    affected stories across all deviations."""

    def test_affected_stories_in_result(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert "affected_stories" in result["data"]

    def test_affected_stories_from_breaking(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        affected = result["data"]["affected_stories"]
        assert "99-2" in affected
        assert "99-3" in affected

    def test_no_duplicates(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        affected = result["data"]["affected_stories"]
        assert len(affected) == len(set(affected))

    def test_empty_when_no_forward_impact(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_NO_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert result["data"]["affected_stories"] == []

    def test_multi_agent_aggregation(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_MULTIPLE_AGENTS)
        result = build_traceability_matrix(session)
        affected = result["data"]["affected_stories"]
        # TEA: 99-4, Dev: 99-5, 99-6, 99-7
        assert len(affected) == 4


# =============================================================================
# AC-5: Breaking deviation summary
# =============================================================================


class TestBreakingSummary:
    """AC-5: The result includes a breaking_deviations list with only
    breaking-impact entries for quick reviewer scanning."""

    def test_breaking_deviations_in_result(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert "breaking_deviations" in result["data"]

    def test_only_breaking_included(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        breaking = result["data"]["breaking_deviations"]
        assert len(breaking) == 1  # Only the major/breaking one
        assert "Replaced data model" in breaking[0]["deviation"]

    def test_empty_when_no_breaking(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_NO_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert result["data"]["breaking_deviations"] == []

    def test_mixed_impacts_filters_correctly(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_MIXED_IMPACT)
        result = build_traceability_matrix(session)
        breaking = result["data"]["breaking_deviations"]
        # Only the "Changed API endpoint path" is breaking
        assert len(breaking) == 1
        assert "API endpoint" in breaking[0]["deviation"]


# =============================================================================
# AC-6: Never throws — return-results pattern
# =============================================================================


class TestNeverThrows:
    """AC-6: All functions follow return-results pattern and never throw."""

    def test_nonexistent_session(self):
        from pf.gates.deviation_traceability import build_traceability_matrix
        result = build_traceability_matrix("/nonexistent/session.md")
        assert isinstance(result, dict)
        assert result["success"] is False
        assert result["error"] is not None

    def test_empty_session(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session("")
        result = build_traceability_matrix(session)
        assert isinstance(result, dict)
        assert "success" in result

    def test_malformed_session(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session("not a valid session file at all")
        result = build_traceability_matrix(session)
        assert isinstance(result, dict)
        assert "success" in result

    def test_parse_spec_source_never_throws(self):
        from pf.gates.deviation_traceability import parse_spec_source
        # Should not raise on any input
        for input_val in ["", None, "   ", "garbage!@#$"]:
            result = parse_spec_source(input_val or "")
            assert isinstance(result, dict)

    def test_parse_forward_impact_never_throws(self):
        from pf.gates.deviation_traceability import parse_forward_impact
        for input_val in ["", "   ", "garbage!@#$", "breaking"]:
            result = parse_forward_impact(input_val)
            assert isinstance(result, dict)

    def test_result_always_has_required_keys(self, tmp_session):
        from pf.gates.deviation_traceability import build_traceability_matrix
        session = tmp_session(SESSION_WITH_DEVIATIONS)
        result = build_traceability_matrix(session)
        assert "success" in result
        assert "data" in result
        assert "error" in result
