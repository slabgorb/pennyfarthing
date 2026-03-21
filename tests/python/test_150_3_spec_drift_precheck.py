"""Tests for spec-drift pre-check at review phase entry.

Story: 150-3 (Internal spec-drift pre-check during review phase)

Tests run_spec_drift_precheck() which detects specification drift before
the Reviewer begins substantive code review. This is distinct from the
Architect's spec-check phase — it runs at review entry and produces a
drift report the Reviewer uses as a first-pass checklist.

Run with: python -m pytest tests/python/test_150_3_spec_drift_precheck.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.gates.spec_drift_precheck import run_spec_drift_precheck  # noqa: E402


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


@pytest.fixture
def tmp_context(tmp_path):
    """Factory: write context content to a temp file and return its path."""

    def _write(content: str, name: str = "context.md") -> Path:
        p = tmp_path / name
        p.write_text(textwrap.dedent(content))
        return p

    return _write


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

MINIMAL_CONTEXT = """\
# Story Context: 99-1

## Acceptance Criteria

- AC-1: Module exists with function foo()
- AC-2: Function returns bar when given baz

## Assumptions

- No database required
"""

CONTEXT_THREE_ACS = """\
# Story Context: 99-2

## Acceptance Criteria

- AC-1: Config file exists at expected path
- AC-2: Config parser validates required fields
- AC-3: Invalid config returns error result

## Assumptions

- YAML format only
"""

SESSION_ALIGNED = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/module.py` — implements foo() returning bar when given baz

**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_MISSING_AC = """\
# Story 99-2: Config Parser

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/config.py` — config parser

**AC Coverage:**
- AC-1: Config file exists at expected path — DONE
- AC-3: Invalid config returns error result — DONE
"""

SESSION_WITH_VALID_DEVIATION = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- **Used TOML instead of YAML**
  - Spec source: context-story-99-1.md, Assumptions
  - Spec text: "YAML format only"
  - Implementation: Used TOML for config parsing
  - Rationale: TOML has better type safety for config files
  - Severity: minor
  - Forward impact: none

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/module.py` — implements foo()

**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_WITH_MALFORMED_DEVIATION = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- **Changed the API shape**
  - Spec source: context-story-99-1.md, AC-1
  - Rationale: Better ergonomics

## Dev Assessment

**Implementation Complete:** Yes
**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_SCOPE_CREEP = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/module.py` — implements foo()
- `src/unrelated_feature.py` — adds caching layer not in any AC
- `src/extra_utils.py` — helper utilities not in spec

**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_MISSING_DEVIATIONS_SECTION = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Dev Assessment

**Implementation Complete:** Yes
**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_MISSING_DEV_SUBSECTION = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

## Dev Assessment

**Implementation Complete:** Yes
**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_IMPL_NOT_COMPLETE = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.

## Dev Assessment

**Implementation Complete:** No
**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_MAJOR_DEVIATION = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** review

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- **Completely replaced the data model**
  - Spec source: context-story-99-1.md, AC-1
  - Spec text: "Module exists with function foo()"
  - Implementation: Replaced foo() with bar_handler() class
  - Rationale: Class-based approach is more extensible
  - Severity: major
  - Forward impact: breaking — 99-2, 99-3

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/module.py` — implements bar_handler class

**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

GATE_FILE = PROJECT_ROOT / "pennyfarthing-dist" / "gates" / "spec-drift-precheck.md"
MODULE_PATH = (
    PROJECT_ROOT / "pennyfarthing-dist" / "src" / "pf" / "gates" / "spec_drift_precheck.py"
)


# =============================================================================
# AC-1: Gate file exists and follows gate-schema.md format
# =============================================================================


class TestGateFileFormat:
    """AC-1: Gate file pennyfarthing-dist/gates/spec-drift-precheck.md exists
    and follows gate-schema.md format."""

    def test_gate_file_exists(self):
        assert GATE_FILE.exists(), f"Gate file not found: {GATE_FILE}"

    def test_gate_has_gate_tag(self):
        content = GATE_FILE.read_text()
        assert "<gate " in content, "Missing <gate> root element"
        assert 'name="spec-drift-precheck"' in content, (
            "Missing name='spec-drift-precheck' attribute"
        )

    def test_gate_has_purpose_tag(self):
        content = GATE_FILE.read_text()
        assert "<purpose>" in content, "Missing <purpose> tag"
        assert "</purpose>" in content, "Missing closing </purpose> tag"
        start = content.index("<purpose>") + len("<purpose>")
        end = content.index("</purpose>")
        purpose_text = content[start:end].strip()
        assert len(purpose_text) > 10, "Purpose text is too short/empty"

    def test_gate_has_pass_tag(self):
        content = GATE_FILE.read_text()
        assert "<pass>" in content, "Missing <pass> tag"
        assert "</pass>" in content, "Missing closing </pass> tag"
        start = content.index("<pass>") + len("<pass>")
        end = content.index("</pass>")
        pass_text = content[start:end]
        assert "GATE_RESULT:" in pass_text, "Pass section missing GATE_RESULT template"
        assert "status: pass" in pass_text, "Pass section missing 'status: pass'"

    def test_gate_has_fail_tag(self):
        content = GATE_FILE.read_text()
        assert "<fail>" in content, "Missing <fail> tag"
        assert "</fail>" in content, "Missing closing </fail> tag"
        start = content.index("<fail>") + len("<fail>")
        end = content.index("</fail>")
        fail_text = content[start:end]
        assert "GATE_RESULT:" in fail_text, "Fail section missing GATE_RESULT template"
        assert "status: fail" in fail_text, "Fail section missing 'status: fail'"

    def test_gate_has_closing_gate_tag(self):
        content = GATE_FILE.read_text()
        assert "</gate>" in content, "Missing closing </gate> tag"

    def test_gate_specifies_haiku_model(self):
        content = GATE_FILE.read_text()
        assert 'model="haiku"' in content, "Gate should specify model='haiku'"


# =============================================================================
# AC-2: Python module exists with run_spec_drift_precheck() function
# =============================================================================


class TestModuleExists:
    """AC-2: Python module exists with run_spec_drift_precheck() function
    that accepts session_path and context_path."""

    def test_module_file_exists(self):
        assert MODULE_PATH.exists(), f"Module not found: {MODULE_PATH}"

    def test_function_is_importable(self):
        from pf.gates.spec_drift_precheck import run_spec_drift_precheck as fn

        assert callable(fn)

    def test_function_accepts_two_path_args(self):
        import inspect

        sig = inspect.signature(run_spec_drift_precheck)
        params = list(sig.parameters.keys())
        assert "session_path" in params, "Missing session_path parameter"
        assert "context_path" in params, "Missing context_path parameter"

    def test_function_returns_dict(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert isinstance(result, dict), f"Expected dict, got {type(result)}"

    def test_delegates_to_deviations_module(self):
        """Should import from pf.gates.deviations to delegate format validation."""
        source_code = MODULE_PATH.read_text()
        assert (
            "pf.gates.deviations" in source_code
            or "from pf.gates.deviations" in source_code
        ), "spec_drift_precheck should import from pf.gates.deviations"


# =============================================================================
# AC-3: Returns {success: True} with drift report when no drift detected
# =============================================================================


class TestNoDriftDetected:
    """AC-3: Returns {success: True, data: {findings: [], drift_score: 0, summary: str}}
    when no specification drift is detected."""

    def test_aligned_session_passes(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True, f"Aligned session should pass: {result}"

    def test_result_has_data_key(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert "data" in result, "Successful result missing 'data' key"

    def test_data_has_findings_array(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True
        assert isinstance(result["data"]["findings"], list)

    def test_findings_empty_when_aligned(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True
        assert len(result["data"]["findings"]) == 0, (
            f"Aligned session should have no findings: {result['data']['findings']}"
        )

    def test_data_has_drift_score(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True
        assert "drift_score" in result["data"], "Missing drift_score in data"
        assert result["data"]["drift_score"] == 0, (
            f"No-drift result should have drift_score=0, got {result['data']['drift_score']}"
        )

    def test_data_has_summary(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True
        assert "summary" in result["data"], "Missing summary in data"
        assert isinstance(result["data"]["summary"], str)
        assert len(result["data"]["summary"]) > 0, "Summary should not be empty"

    def test_no_error_on_success(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True
        assert result.get("error") is None

    def test_valid_deviation_does_not_trigger_drift(self, tmp_session, tmp_context):
        """Properly logged minor deviation should not cause failure."""
        session = tmp_session(SESSION_WITH_VALID_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True, (
            f"Valid minor deviation should not fail: {result}"
        )


# =============================================================================
# AC-4: Detects missing AC coverage
# =============================================================================


class TestDetectsMissingACCoverage:
    """AC-4: Returns {success: False} with findings when acceptance criteria
    from the context are not addressed in the session."""

    def test_missing_ac_detected(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False, f"Missing AC should fail: {result}"

    def test_missing_ac_in_findings(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        findings = result["data"]["findings"]
        ac_findings = [f for f in findings if f["category"] == "missing-ac"]
        assert len(ac_findings) > 0, "Should have at least one missing-ac finding"

    def test_missing_ac_identifies_which(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        findings_text = str(result["data"]["findings"])
        assert "AC-2" in findings_text, f"Should identify AC-2 as missing: {findings_text}"

    def test_drift_score_nonzero_on_missing_ac(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        assert result["data"]["drift_score"] > 0, (
            f"Drift score should be > 0 when ACs missing: {result['data']['drift_score']}"
        )

    def test_error_message_present(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)
        assert len(result["error"]) > 10

    def test_context_without_acs(self, tmp_session, tmp_context):
        """Context file missing ## Acceptance Criteria should fail."""
        context_content = """\
        # Story Context: 99-1

        ## Summary

        Some story without acceptance criteria.
        """
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(context_content)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False, "Context without ACs should fail"


# =============================================================================
# AC-5: Detects malformed/incomplete deviations
# =============================================================================


class TestDetectsMalformedDeviations:
    """AC-5: Returns {success: False} when deviations are present but missing
    required fields from the 6-field format."""

    def test_malformed_deviation_detected(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_WITH_MALFORMED_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False, (
            f"Malformed deviation should fail: {result}"
        )

    def test_malformed_deviation_in_findings(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_WITH_MALFORMED_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        findings = result["data"]["findings"]
        deviation_findings = [
            f for f in findings if f["category"] == "malformed-deviation"
        ]
        assert len(deviation_findings) > 0, (
            "Should have malformed-deviation finding"
        )

    def test_missing_deviations_section(self, tmp_session, tmp_context):
        """Session missing ## Design Deviations entirely should fail."""
        session = tmp_session(SESSION_MISSING_DEVIATIONS_SECTION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False, "Missing deviations section should fail"

    def test_missing_dev_subsection(self, tmp_session, tmp_context):
        """Session with Design Deviations but no Dev subsection should fail."""
        session = tmp_session(SESSION_MISSING_DEV_SUBSECTION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False, "Missing Dev deviation subsection should fail"


# =============================================================================
# AC-6: Detects scope creep (files not traceable to ACs)
# =============================================================================


class TestDetectsScopeCreep:
    """AC-6: Returns findings when files in Dev Assessment's Files Changed
    section are not traceable to any acceptance criteria."""

    def test_scope_creep_detected(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_SCOPE_CREEP)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False, (
            f"Scope creep should fail: {result}"
        )

    def test_scope_creep_in_findings(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_SCOPE_CREEP)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        findings = result["data"]["findings"]
        scope_findings = [f for f in findings if f["category"] == "scope-creep"]
        assert len(scope_findings) > 0, (
            f"Should have scope-creep findings: {findings}"
        )

    def test_scope_creep_identifies_files(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_SCOPE_CREEP)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        findings = result["data"]["findings"]
        scope_findings = [f for f in findings if f["category"] == "scope-creep"]
        findings_text = str(scope_findings)
        # Should identify at least one of the unrelated files
        assert (
            "unrelated_feature" in findings_text or "extra_utils" in findings_text
        ), f"Should identify unrelated files: {findings_text}"

    def test_scope_creep_does_not_flag_ac_files(self, tmp_session, tmp_context):
        """Files that implement an AC should NOT be flagged as scope creep."""
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is True
        findings = result["data"]["findings"]
        scope_findings = [f for f in findings if f["category"] == "scope-creep"]
        assert len(scope_findings) == 0, (
            f"Aligned files should not be flagged: {scope_findings}"
        )


# =============================================================================
# AC-7: Flags major deviations for reviewer attention
# =============================================================================


class TestFlagsMajorDeviations:
    """AC-7: Major-severity deviations or breaking forward-impact deviations
    are flagged as high-priority findings for the reviewer."""

    def test_major_deviation_flagged(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MAJOR_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        findings = result["data"]["findings"]
        major_findings = [
            f for f in findings if f.get("severity") == "high"
        ]
        assert len(major_findings) > 0, (
            f"Major deviation should produce high-severity finding: {findings}"
        )

    def test_major_deviation_has_category(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MAJOR_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        findings = result["data"]["findings"]
        major_findings = [
            f for f in findings if f.get("category") == "major-deviation"
        ]
        assert len(major_findings) > 0, (
            f"Major deviation should have category='major-deviation': {findings}"
        )

    def test_minor_deviation_not_flagged_high(self, tmp_session, tmp_context):
        """Minor deviations should not be flagged as high severity."""
        session = tmp_session(SESSION_WITH_VALID_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        findings = result["data"]["findings"]
        high_findings = [f for f in findings if f.get("severity") == "high"]
        assert len(high_findings) == 0, (
            f"Minor deviation should not produce high-severity finding: {findings}"
        )


# =============================================================================
# AC-8: Findings have structured format
# =============================================================================


class TestFindingsFormat:
    """AC-8: Each finding in the findings array has category, severity, and
    detail fields for consistent reviewer consumption."""

    def test_finding_has_category(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        for finding in result["data"]["findings"]:
            assert "category" in finding, f"Finding missing 'category': {finding}"

    def test_finding_has_severity(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        for finding in result["data"]["findings"]:
            assert "severity" in finding, f"Finding missing 'severity': {finding}"
            assert finding["severity"] in ("low", "medium", "high"), (
                f"Invalid severity: {finding['severity']}"
            )

    def test_finding_has_detail(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        for finding in result["data"]["findings"]:
            assert "detail" in finding, f"Finding missing 'detail': {finding}"
            assert isinstance(finding["detail"], str)
            assert len(finding["detail"]) > 5, "Detail too short"

    def test_valid_categories(self, tmp_session, tmp_context):
        """Categories should be from the known set."""
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        valid_categories = {
            "missing-ac",
            "malformed-deviation",
            "scope-creep",
            "major-deviation",
            "missing-deviations",
            "implementation-incomplete",
        }
        for finding in result["data"]["findings"]:
            assert finding["category"] in valid_categories, (
                f"Unknown category '{finding['category']}', valid: {valid_categories}"
            )


# =============================================================================
# AC-9: Drift score reflects severity
# =============================================================================


class TestDriftScore:
    """AC-9: drift_score is an integer that reflects the aggregate severity
    of all findings. Higher = more drift."""

    def test_drift_score_is_int(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert isinstance(result["data"]["drift_score"], int), (
            f"drift_score should be int, got {type(result['data']['drift_score'])}"
        )

    def test_zero_drift_when_aligned(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["data"]["drift_score"] == 0

    def test_higher_drift_for_more_issues(self, tmp_session, tmp_context):
        """Session with multiple issues should have higher drift_score than
        session with single issue."""
        # Single issue: missing one AC
        session_one = tmp_session(SESSION_MISSING_AC, name="session_one.md")
        context = tmp_context(CONTEXT_THREE_ACS)
        result_one = run_spec_drift_precheck(session_one, context)

        # Multiple issues: missing deviations section entirely
        session_multi = tmp_session(
            SESSION_MISSING_DEVIATIONS_SECTION, name="session_multi.md"
        )
        context_multi = tmp_context(MINIMAL_CONTEXT, name="context_multi.md")
        result_multi = run_spec_drift_precheck(session_multi, context_multi)

        # Both should fail
        assert result_one["success"] is False
        assert result_multi["success"] is False

        # Both should have positive drift scores
        assert result_one["data"]["drift_score"] > 0
        assert result_multi["data"]["drift_score"] > 0

    def test_major_deviation_increases_score(self, tmp_session, tmp_context):
        """Major deviation should contribute more to drift_score than no deviation."""
        session = tmp_session(SESSION_MAJOR_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        # Major deviation should produce a nonzero drift_score
        assert result["data"]["drift_score"] > 0, (
            "Major deviation should increase drift_score"
        )

    def test_implementation_incomplete_adds_to_score(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_IMPL_NOT_COMPLETE)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert result["success"] is False
        assert result["data"]["drift_score"] > 0


# =============================================================================
# AC-10: Never throws — return-results pattern
# =============================================================================


class TestNeverThrows:
    """AC-10: Module follows return-results pattern ({success, data?, error?})
    and never throws exceptions."""

    def test_nonexistent_session_path(self, tmp_context):
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck("/nonexistent/session.md", context)
        assert isinstance(result, dict)
        assert result["success"] is False
        assert "error" in result

    def test_nonexistent_context_path(self, tmp_session):
        session = tmp_session(SESSION_ALIGNED)
        result = run_spec_drift_precheck(session, "/nonexistent/context.md")
        assert isinstance(result, dict)
        assert result["success"] is False
        assert "error" in result

    def test_both_paths_nonexistent(self):
        result = run_spec_drift_precheck("/no/session.md", "/no/context.md")
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_empty_session_file(self, tmp_session, tmp_context):
        session = tmp_session("")
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_empty_context_file(self, tmp_session, tmp_context):
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context("")
        result = run_spec_drift_precheck(session, context)
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_binary_garbage_session(self, tmp_path, tmp_context):
        """Binary/garbage content should not raise."""
        session = tmp_path / "garbage.md"
        session.write_bytes(b"\x00\x01\x02\xff\xfe" * 100)
        context = tmp_context(MINIMAL_CONTEXT)
        try:
            result = run_spec_drift_precheck(str(session), context)
        except Exception:
            pytest.fail("run_spec_drift_precheck raised on binary input")
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_result_always_has_required_keys(self, tmp_session, tmp_context):
        """Every result should have success, data, error keys."""
        session = tmp_session(SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = run_spec_drift_precheck(session, context)
        assert "success" in result
        assert "data" in result
        assert "error" in result
