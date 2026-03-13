"""Tests for spec-check validation gate.

Story: 144-6 (Create Architect spec-check phase and gate)

Tests validate_spec_alignment() against all 8 ACs from story context.
Each AC maps to a test class. Tests are in RED state — stub returns wrong results.

Run with: python -m pytest tests/python/test_spec_check_gate.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.gates.spec_check import validate_spec_alignment  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_session(tmp_path):
    """Factory fixture: write session content to a temp file and return its path."""

    def _write(content: str, name: str = "session.md") -> Path:
        p = tmp_path / name
        p.write_text(textwrap.dedent(content))
        return p

    return _write


@pytest.fixture
def tmp_context(tmp_path):
    """Factory fixture: write context content to a temp file and return its path."""

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

MINIMAL_SESSION_ALIGNED = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-check

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

CONTEXT_THREE_ACS = """\
# Story Context: 99-2

## Acceptance Criteria

- AC-1: Config file exists at expected path
- AC-2: Config parser validates required fields
- AC-3: Invalid config returns error result

## Assumptions

- YAML format only
"""

SESSION_MISSING_AC = """\
# Story 99-2: Config Parser

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-check

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
**Phase:** spec-check

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
**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_WITH_UNLOGGED_DEVIATION = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-check

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
- `src/extra_feature.py` — bonus utility not in spec

**AC Coverage:**
- AC-1: Module exists with function foo() — DONE
- AC-2: Function returns bar when given baz — DONE
"""

SESSION_WITH_MALFORMED_DEVIATION = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-check

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

# A gate file path for AC-1 and AC-2 tests
GATE_FILE = PROJECT_ROOT / "pennyfarthing-dist" / "gates" / "spec-check.md"


# =============================================================================
# AC-1: Gate file exists and follows gate-schema.md format
# =============================================================================


class TestGateFileFormat:
    """AC-1: Gate file pennyfarthing-dist/gates/spec-check.md exists and follows
    gate-schema.md format (<gate>, <purpose>, <pass>, <fail> tags)."""

    def test_gate_file_exists(self):
        assert GATE_FILE.exists(), f"Gate file not found: {GATE_FILE}"

    def test_gate_has_gate_tag(self):
        content = GATE_FILE.read_text()
        assert "<gate " in content, "Missing <gate> root element"
        assert 'name="spec-check"' in content, "Missing name='spec-check' attribute"

    def test_gate_has_purpose_tag(self):
        content = GATE_FILE.read_text()
        assert "<purpose>" in content, "Missing <purpose> tag"
        assert "</purpose>" in content, "Missing closing </purpose> tag"
        # Purpose should not be empty
        start = content.index("<purpose>") + len("<purpose>")
        end = content.index("</purpose>")
        purpose_text = content[start:end].strip()
        assert len(purpose_text) > 10, "Purpose text is too short/empty"

    def test_gate_has_pass_tag(self):
        content = GATE_FILE.read_text()
        assert "<pass>" in content, "Missing <pass> tag"
        assert "</pass>" in content, "Missing closing </pass> tag"
        # Pass section should contain GATE_RESULT template
        start = content.index("<pass>") + len("<pass>")
        end = content.index("</pass>")
        pass_text = content[start:end]
        assert "GATE_RESULT:" in pass_text, "Pass section missing GATE_RESULT template"
        assert "status: pass" in pass_text, "Pass section missing 'status: pass'"

    def test_gate_has_fail_tag(self):
        content = GATE_FILE.read_text()
        assert "<fail>" in content, "Missing <fail> tag"
        assert "</fail>" in content, "Missing closing </fail> tag"
        # Fail section should contain GATE_RESULT template
        start = content.index("<fail>") + len("<fail>")
        end = content.index("</fail>")
        fail_text = content[start:end]
        assert "GATE_RESULT:" in fail_text, "Fail section missing GATE_RESULT template"
        assert "status: fail" in fail_text, "Fail section missing 'status: fail'"

    def test_gate_has_closing_gate_tag(self):
        content = GATE_FILE.read_text()
        assert "</gate>" in content, "Missing closing </gate> tag"


# =============================================================================
# AC-2: Gate passes pf gate validate
# =============================================================================


class TestGateValidation:
    """AC-2: Gate passes pf gate validate without errors."""

    def test_gate_file_validates(self):
        """Gate file must pass schema validation."""
        import subprocess

        result = subprocess.run(
            ["pf", "gate", "validate", str(GATE_FILE)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, (
            f"pf gate validate failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
        )

    def test_gate_specifies_haiku_model(self):
        """Gate should specify haiku model for fast execution."""
        content = GATE_FILE.read_text()
        assert 'model="haiku"' in content, "Gate should specify model='haiku'"


# =============================================================================
# AC-3: Python module exists with validate_spec_alignment() function
# =============================================================================


class TestModuleExists:
    """AC-3: Python module pennyfarthing-dist/src/pf/gates/spec_check.py exists
    with validate_spec_alignment() function."""

    MODULE_PATH = PROJECT_ROOT / "pennyfarthing-dist" / "src" / "pf" / "gates" / "spec_check.py"

    def test_module_file_exists(self):
        assert self.MODULE_PATH.exists(), f"Module not found: {self.MODULE_PATH}"

    def test_function_is_importable(self):
        """validate_spec_alignment should be importable."""
        from pf.gates.spec_check import validate_spec_alignment as fn

        assert callable(fn)

    def test_function_accepts_two_path_args(self):
        """Function signature requires session_path and context_path."""
        import inspect

        sig = inspect.signature(validate_spec_alignment)
        params = list(sig.parameters.keys())
        assert "session_path" in params, "Missing session_path parameter"
        assert "context_path" in params, "Missing context_path parameter"

    def test_function_returns_dict(self, tmp_session, tmp_context):
        """Function must return a dict."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert isinstance(result, dict), f"Expected dict, got {type(result)}"


# =============================================================================
# AC-4: Returns {success: True} when aligned
# =============================================================================


class TestAlignedImplementation:
    """AC-4: validate_spec_alignment() returns {success: True} when all ACs are
    addressed and no undocumented drift exists."""

    def test_all_acs_addressed_passes(self, tmp_session, tmp_context):
        """When all ACs in context are covered in session, return success."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True, f"Expected success=True, got: {result}"

    def test_result_has_data_key(self, tmp_session, tmp_context):
        """Successful result must have 'data' key."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert "data" in result, "Successful result missing 'data' key"

    def test_data_has_checks_array(self, tmp_session, tmp_context):
        """data.checks must be a list."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True
        assert isinstance(result["data"]["checks"], list)

    def test_no_error_key_on_success(self, tmp_session, tmp_context):
        """Successful result should not have 'error' key, or it should be None."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True
        assert result.get("error") is None, f"Unexpected error on success: {result.get('error')}"

    def test_deviations_section_present_no_deviations(self, tmp_session, tmp_context):
        """Session with 'No deviations from spec.' should pass."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True

    def test_with_properly_logged_deviation_passes(self, tmp_session, tmp_context):
        """Session with a properly formatted deviation should still pass."""
        session = tmp_session(SESSION_WITH_VALID_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True, (
            f"Properly logged deviation should not cause failure: {result}"
        )

    def test_multiple_acs_all_covered(self, tmp_session, tmp_context):
        """All 3 ACs covered in assessment → success."""
        session_content = """\
        # Story 99-2: Config Parser

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

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
        **AC Coverage:**
        - AC-1: Config file exists at expected path — DONE
        - AC-2: Config parser validates required fields — DONE
        - AC-3: Invalid config returns error result — DONE
        """
        session = tmp_session(session_content)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True, f"All ACs covered but got: {result}"

    def test_ac_coverage_case_insensitive(self, tmp_session, tmp_context):
        """AC matching should not be overly case-sensitive on the AC identifier."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

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
        **AC Coverage:**
        - ac-1: Module exists with function foo() — DONE
        - ac-2: Function returns bar when given baz — DONE
        """
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True


# =============================================================================
# AC-5: Returns {success: False} when spec drift detected
# =============================================================================


class TestSpecDrift:
    """AC-5: validate_spec_alignment() returns {success: False, error: ...} with
    specific findings when spec drift is detected."""

    def test_missing_ac_coverage(self, tmp_session, tmp_context):
        """When an AC from context is not addressed in session, fail."""
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, f"Missing AC should fail: {result}"

    def test_missing_ac_error_identifies_which_ac(self, tmp_session, tmp_context):
        """Error message should identify which AC is missing."""
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False
        assert "error" in result, "Failed result missing 'error' key"
        error = result["error"]
        assert "AC-2" in error, f"Error should mention missing AC-2: {error}"

    def test_no_dev_assessment_section(self, tmp_session, tmp_context):
        """Session with no Dev Assessment section should fail."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

        ## Delivery Findings

        ### Dev (implementation)
        - No upstream findings during implementation.

        ## Design Deviations

        ### TEA (test design)
        - No deviations from spec.

        ### Dev (implementation)
        - No deviations from spec.
        """
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "No Dev Assessment should fail"

    def test_empty_ac_coverage_section(self, tmp_session, tmp_context):
        """Session with Dev Assessment but no AC Coverage should fail."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

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
        """
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "No AC coverage listing should fail"

    def test_context_with_no_acs_section(self, tmp_session, tmp_context):
        """Context file missing ## Acceptance Criteria should fail."""
        context_content = """\
        # Story Context: 99-1

        ## Summary

        Some story summary without acceptance criteria.
        """
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(context_content)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "Context without ACs should fail"

    def test_multiple_missing_acs(self, tmp_session, tmp_context):
        """Error should list all missing ACs, not just the first."""
        session_content = """\
        # Story 99-2: Config Parser

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

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
        **AC Coverage:**
        - AC-1: Config file exists at expected path — DONE
        """
        session = tmp_session(session_content)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False
        error = result["error"]
        assert "AC-2" in error, f"Error should mention AC-2: {error}"
        assert "AC-3" in error, f"Error should mention AC-3: {error}"

    def test_missing_design_deviations_section(self, tmp_session, tmp_context):
        """Session missing ## Design Deviations section entirely should fail."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

        ## Delivery Findings

        ### Dev (implementation)
        - No upstream findings during implementation.

        ## Dev Assessment

        **Implementation Complete:** Yes
        **AC Coverage:**
        - AC-1: Module exists with function foo() — DONE
        - AC-2: Function returns bar when given baz — DONE
        """
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "Missing Design Deviations should fail"

    def test_missing_dev_deviation_subsection(self, tmp_session, tmp_context):
        """Session with Design Deviations but no Dev subsection should fail."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

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
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "Missing Dev deviation subsection should fail"

    def test_error_has_string_message(self, tmp_session, tmp_context):
        """Error value should be a descriptive string."""
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False
        assert isinstance(result["error"], str), f"Error should be str, got: {type(result['error'])}"
        assert len(result["error"]) > 10, "Error message too short to be useful"

    def test_implementation_not_complete_flag(self, tmp_session, tmp_context):
        """Dev Assessment with Implementation Complete: No should fail."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

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
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "Implementation not complete should fail"


# =============================================================================
# AC-6: Respects deviation format from 144-1
# =============================================================================


class TestDeviationRespect:
    """AC-6: Validation respects the deviation format from 144-1 — properly logged
    deviations do NOT trigger failure."""

    def test_valid_6_field_deviation_passes(self, tmp_session, tmp_context):
        """Deviation with all 6 fields should not trigger failure."""
        session = tmp_session(SESSION_WITH_VALID_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True, (
            f"Valid deviation should not fail: {result}"
        )

    def test_malformed_deviation_fails(self, tmp_session, tmp_context):
        """Deviation missing required fields should trigger failure."""
        session = tmp_session(SESSION_WITH_MALFORMED_DEVIATION)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, (
            f"Malformed deviation should fail: {result}"
        )

    def test_no_deviations_phrase_is_valid(self, tmp_session, tmp_context):
        """'No deviations from spec.' is valid and should not fail."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True

    def test_deviation_does_not_duplicate_deviations_logged_check(self, tmp_session, tmp_context):
        """spec_check should check deviation presence but delegate format validation
        to the existing deviations module, not re-implement it."""
        # This test verifies the module imports from pf.gates.deviations
        import importlib
        import pf.gates.spec_check as mod

        source = importlib.util.find_spec("pf.gates.spec_check")
        assert source is not None
        source_code = Path(source.origin).read_text()
        assert "pf.gates.deviations" in source_code or "from pf.gates.deviations" in source_code, (
            "spec_check should import from pf.gates.deviations to delegate format validation"
        )

    def test_empty_dev_deviation_subsection_fails(self, tmp_session, tmp_context):
        """Dev deviation subsection exists but is empty — should fail."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

        ## Delivery Findings

        ### Dev (implementation)
        - No upstream findings during implementation.

        ## Design Deviations

        ### TEA (test design)
        - No deviations from spec.

        ### Dev (implementation)

        ## Dev Assessment

        **Implementation Complete:** Yes
        **AC Coverage:**
        - AC-1: Module exists with function foo() — DONE
        - AC-2: Function returns bar when given baz — DONE
        """
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "Empty Dev deviation subsection should fail"

    def test_tea_deviation_subsection_also_checked(self, tmp_session, tmp_context):
        """TEA deviation subsection should also be validated."""
        session_content = """\
        # Story 99-1: Test Story

        ## Workflow Tracking
        **Workflow:** tdd
        **Phase:** spec-check

        ## Delivery Findings

        ### Dev (implementation)
        - No upstream findings during implementation.

        ## Design Deviations

        ### Dev (implementation)
        - No deviations from spec.

        ## Dev Assessment

        **Implementation Complete:** Yes
        **AC Coverage:**
        - AC-1: Module exists with function foo() — DONE
        - AC-2: Function returns bar when given baz — DONE
        """
        session = tmp_session(session_content)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False, "Missing TEA deviation subsection should fail"


# =============================================================================
# AC-7: GATE_RESULT includes checks array
# =============================================================================


class TestChecksArray:
    """AC-7: Gate GATE_RESULT includes checks array with individual check results
    per the gate-schema.md contract."""

    def test_success_has_checks_array(self, tmp_session, tmp_context):
        """Successful result data must include checks array."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True
        checks = result["data"]["checks"]
        assert isinstance(checks, list)
        assert len(checks) > 0, "Checks array should not be empty on success"

    def test_checks_have_name_and_status(self, tmp_session, tmp_context):
        """Each check must have 'name' and 'status' fields."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True
        for check in result["data"]["checks"]:
            assert "name" in check, f"Check missing 'name': {check}"
            assert "status" in check, f"Check missing 'status': {check}"
            assert check["status"] in ("pass", "fail"), f"Invalid status: {check['status']}"

    def test_checks_have_detail(self, tmp_session, tmp_context):
        """Each check should have a 'detail' field."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True
        for check in result["data"]["checks"]:
            assert "detail" in check, f"Check missing 'detail': {check}"

    def test_failure_also_has_checks(self, tmp_session, tmp_context):
        """Failed results should also include checks array in data."""
        session = tmp_session(SESSION_MISSING_AC)
        context = tmp_context(CONTEXT_THREE_ACS)
        result = validate_spec_alignment(session, context)
        assert result["success"] is False
        assert "data" in result, "Failed result should still have 'data' key"
        checks = result["data"]["checks"]
        assert isinstance(checks, list)
        # At least one check should have status=fail
        fail_checks = [c for c in checks if c.get("status") == "fail"]
        assert len(fail_checks) > 0, "Failed result should have at least one failing check"

    def test_checks_cover_known_categories(self, tmp_session, tmp_context):
        """Checks should cover key validation categories."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert result["success"] is True
        check_names = {c["name"] for c in result["data"]["checks"]}
        # Should have checks for AC coverage and deviation logging at minimum
        assert len(check_names) >= 2, (
            f"Expected at least 2 distinct check categories, got: {check_names}"
        )


# =============================================================================
# AC-8: Return-results pattern, never throws
# =============================================================================


class TestNeverThrows:
    """AC-8: Module follows return-results pattern ({success, data?, error?}) — never throws."""

    def test_nonexistent_session_path(self, tmp_context):
        """Non-existent session path should return error, not raise."""
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment("/nonexistent/session.md", context)
        assert isinstance(result, dict)
        assert result["success"] is False
        assert "error" in result

    def test_nonexistent_context_path(self, tmp_session):
        """Non-existent context path should return error, not raise."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        result = validate_spec_alignment(session, "/nonexistent/context.md")
        assert isinstance(result, dict)
        assert result["success"] is False
        assert "error" in result

    def test_both_paths_nonexistent(self):
        """Both paths missing should return error, not raise."""
        result = validate_spec_alignment("/no/session.md", "/no/context.md")
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_empty_session_file(self, tmp_session, tmp_context):
        """Empty session file should return error, not raise."""
        session = tmp_session("")
        context = tmp_context(MINIMAL_CONTEXT)
        result = validate_spec_alignment(session, context)
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_empty_context_file(self, tmp_session, tmp_context):
        """Empty context file should return error, not raise."""
        session = tmp_session(MINIMAL_SESSION_ALIGNED)
        context = tmp_context("")
        result = validate_spec_alignment(session, context)
        assert isinstance(result, dict)
        assert result["success"] is False
