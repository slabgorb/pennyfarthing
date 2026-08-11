"""Tests for spec-reconcile validation gate.

Story: 144-7 (Create Architect spec-reconcile phase and gate)

Tests validate_spec_reconcile() against all 7 ACs from story context.
Each AC maps to a test class. Tests are in RED state — stub raises NotImplementedError.

Run with: python -m pytest tests/python/test_spec_reconcile_gate.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.gates.spec_reconcile import validate_spec_reconcile  # noqa: E402


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


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

GATE_FILE = PROJECT_ROOT / "pennyfarthing-dist" / "gates" / "spec-reconcile-pass.md"
ARCHITECT_FILE = PROJECT_ROOT / "pennyfarthing-dist" / "agents" / "architect.md"

VALID_RECONCILE_ENTRY = """\
- **Simplified cost model vs AC-6**
  - Spec source: context-story-99-1.md, AC-6
  - Spec text: "Calculate cost using full itemized breakdown"
  - Implementation: Used aggregate cost model without line-item detail
  - Rationale: TEA and Dev agreed the aggregate model met the intent; full breakdown was infeasible in scope
  - Severity: minor
  - Forward impact: none"""

SESSION_WITH_RECONCILE_NO_DEVIATIONS = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-reconcile

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.

### Architect (reconcile)
- No additional deviations found.

## Dev Assessment

**Implementation Complete:** Yes
**AC Coverage:**
- AC-1: Module exists — DONE
"""

SESSION_WITH_RECONCILE_ENTRY = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-reconcile

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.

### Architect (reconcile)
{entry}

## Dev Assessment

**Implementation Complete:** Yes
**AC Coverage:**
- AC-1: Module exists — DONE
"""

SESSION_WITHOUT_RECONCILE = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-reconcile

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
- AC-1: Module exists — DONE
"""

SESSION_WITH_EMPTY_RECONCILE = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-reconcile

## Design Deviations

### TEA (test design)
- No deviations from spec.

### Dev (implementation)
- No deviations from spec.

### Architect (reconcile)

## Dev Assessment

**Implementation Complete:** Yes
"""

SESSION_NO_DESIGN_DEVIATIONS = """\
# Story 99-1: Test Story

## Workflow Tracking
**Workflow:** tdd
**Phase:** spec-reconcile

## Dev Assessment

**Implementation Complete:** Yes
"""


# =============================================================================
# AC 1: Architect loads full context on reconcile activation
# =============================================================================


class TestArchitectContextLoading:
    """AC-1: <spec-reconcile> section in architect.md lists all required context sources."""

    def test_architect_has_spec_reconcile_section(self):
        """architect.md must have a <spec-reconcile> section."""
        content = ARCHITECT_FILE.read_text()
        assert "<spec-reconcile>" in content, "Missing <spec-reconcile> section in architect.md"
        assert "</spec-reconcile>" in content, "Missing closing </spec-reconcile> tag"

    def test_lists_story_context_source(self):
        """Section must mention loading story context document."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "story context" in section, "Must specify story context as a context source"

    def test_lists_epic_context_source(self):
        """Section must mention loading epic context document."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "epic context" in section, "Must specify epic context as a context source"

    def test_lists_prd_references(self):
        """Section must mention PRD references."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "prd" in section, "Must specify PRD references as a context source"

    def test_lists_sibling_story_acs(self):
        """Section must mention sibling story ACs from sprint YAML."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "sibling" in section, "Must specify sibling story ACs as a context source"

    def test_lists_inflight_deviation_logs(self):
        """Section must mention in-flight deviation logs from TEA and Dev."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end]
        assert "TEA" in section or "tea" in section.lower(), (
            "Must mention TEA deviation logs as context"
        )
        assert "Dev" in section or "dev" in section.lower(), (
            "Must mention Dev deviation logs as context"
        )

    def test_prd_fallback_to_epic_context(self):
        """Section must specify fallback to epic context if no PRD in story context."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "fallback" in section or "fall back" in section or (
            "epic" in section and "prd" in section
        ), "Must specify PRD fallback to epic context"

    def test_mentions_ac_deferral_records(self):
        """Section must mention AC deferral records from ac-completion gate."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "deferral" in section or "deferred" in section, (
            "Must mention AC deferral records as context"
        )


# =============================================================================
# AC 2: Architect reviews each existing deviation entry
# =============================================================================


class TestArchitectReviewCriteria:
    """AC-2: <spec-reconcile> section specifies review criteria for existing entries."""

    def test_specifies_spec_source_validation(self):
        """Must check that spec source is a real document path."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "spec source" in section or "document path" in section, (
            "Must specify checking spec source is a real document path"
        )

    def test_specifies_spec_text_validation(self):
        """Must check that spec text is a real quote from the spec."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "spec text" in section or "quote" in section, (
            "Must specify checking spec text is a real quote"
        )

    def test_specifies_forward_impact_validation(self):
        """Must check that forward impact accurately reflects downstream stories."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "forward impact" in section, (
            "Must specify checking forward impact accuracy"
        )

    def test_specifies_completeness_check(self):
        """Must check all 6 fields are present and substantive."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "6" in section or "six" in section or "field" in section, (
            "Must specify checking all 6 fields are present"
        )

    def test_annotate_not_delete_inaccurate_entries(self):
        """Must annotate inaccurate entries rather than deleting them."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "annotate" in section or "correction" in section or "not delet" in section, (
            "Must specify annotation over deletion for inaccurate entries"
        )

    def test_adds_missing_fields_to_incomplete_entries(self):
        """Must add missing fields to incomplete entries rather than flagging as new deviation."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "missing field" in section or "incomplete" in section, (
            "Must specify handling of incomplete entries (add missing fields)"
        )


# =============================================================================
# AC 3: Architect adds missed deviations under ### Architect (reconcile)
# =============================================================================


class TestArchitectMissedDeviations:
    """AC-3: <spec-reconcile> section specifies adding missed deviations."""

    def test_references_deviation_format_md(self):
        """Must explicitly reference deviation-format.md."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end]
        assert "deviation-format.md" in section, (
            "Must reference deviation-format.md for the 6-field format"
        )

    def test_specifies_architect_reconcile_subsection(self):
        """Must specify ### Architect (reconcile) as the target subsection."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end]
        assert "### Architect (reconcile)" in section, (
            "Must specify ### Architect (reconcile) as the target subsection"
        )

    def test_specifies_no_additional_deviations_phrase(self):
        """Must specify 'No additional deviations found.' for when none are missed."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end]
        assert "No additional deviations found" in section, (
            "Must specify 'No additional deviations found.' phrase"
        )


# =============================================================================
# AC 4: Architect verifies AC deferral justifications post-review
# =============================================================================


class TestArchitectDeferralVerification:
    """AC-4: <spec-reconcile> section instructs AC deferral verification."""

    def test_cross_references_ac_accountability_table(self):
        """Must instruct cross-referencing the AC accountability table."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "ac" in section and ("accountability" in section or "deferral" in section), (
            "Must instruct cross-referencing AC accountability table or deferral records"
        )

    def test_notes_conditional_noop(self):
        """Must note that this step is conditional (no-op when no ACs deferred)."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "no-op" in section or "conditional" in section or "no acs" in section, (
            "Must note this step is conditional when no ACs are deferred"
        )

    def test_checks_reviewer_findings_against_deferrals(self):
        """Must instruct checking if Reviewer findings affected deferred ACs."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "review" in section, (
            "Must reference Reviewer findings in deferral verification"
        )


# =============================================================================
# AC 5: spec-reconcile-pass gate passes when section exists
# =============================================================================


class TestGatePassesWhenSectionExists:
    """AC-5: Gate passes when ### Architect (reconcile) section exists."""

    def test_passes_with_no_additional_deviations(self, tmp_session):
        """Gate passes when section has 'No additional deviations found.'"""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        result = validate_spec_reconcile(session)
        assert result["success"] is True, f"Expected pass with no deviations, got: {result}"

    def test_passes_with_valid_6_field_entry(self, tmp_session):
        """Gate passes when section has properly formatted deviation entry."""
        content = SESSION_WITH_RECONCILE_ENTRY.format(entry=VALID_RECONCILE_ENTRY)
        session = tmp_session(content)
        result = validate_spec_reconcile(session)
        assert result["success"] is True, f"Expected pass with valid entry, got: {result}"

    def test_passes_with_both_entries_and_no_deviations_phrase(self, tmp_session):
        """Gate passes when section has entries plus the no-deviations phrase."""
        combined = VALID_RECONCILE_ENTRY + "\n- No additional deviations found."
        content = SESSION_WITH_RECONCILE_ENTRY.format(entry=combined)
        session = tmp_session(content)
        result = validate_spec_reconcile(session)
        assert result["success"] is True, f"Expected pass with combined content, got: {result}"

    def test_result_has_data_with_checks(self, tmp_session):
        """Successful result must have data.checks array."""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        result = validate_spec_reconcile(session)
        assert result["success"] is True
        assert "data" in result, "Result missing 'data' key"
        assert isinstance(result["data"]["checks"], list), "data.checks must be a list"

    def test_no_error_on_success(self, tmp_session):
        """Successful result should have error=None."""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        result = validate_spec_reconcile(session)
        assert result["success"] is True
        assert result.get("error") is None


# =============================================================================
# AC 6: Gate fails with specific recovery message when section absent
# =============================================================================


EXPECTED_FAIL_MESSAGE = "Architect reconcile section required — run spec-reconcile phase"


class TestGateFailsWhenSectionAbsent:
    """AC-6: Gate fails with specific message when ### Architect (reconcile) is missing."""

    def test_fails_when_reconcile_section_missing(self, tmp_session):
        """Gate fails when ### Architect (reconcile) subsection is absent."""
        session = tmp_session(SESSION_WITHOUT_RECONCILE)
        result = validate_spec_reconcile(session)
        assert result["success"] is False, f"Expected fail when section missing, got: {result}"

    def test_fail_message_is_verbatim(self, tmp_session):
        """Failure error must contain the exact recovery message."""
        session = tmp_session(SESSION_WITHOUT_RECONCILE)
        result = validate_spec_reconcile(session)
        assert result["success"] is False
        assert EXPECTED_FAIL_MESSAGE in result["error"], (
            f"Expected verbatim message '{EXPECTED_FAIL_MESSAGE}', got: {result['error']}"
        )

    def test_fails_when_section_empty(self, tmp_session):
        """Gate fails when ### Architect (reconcile) exists but is empty."""
        session = tmp_session(SESSION_WITH_EMPTY_RECONCILE)
        result = validate_spec_reconcile(session)
        assert result["success"] is False, f"Expected fail when section empty, got: {result}"

    def test_fails_when_design_deviations_missing(self, tmp_session):
        """Gate fails when ## Design Deviations is entirely absent."""
        session = tmp_session(SESSION_NO_DESIGN_DEVIATIONS)
        result = validate_spec_reconcile(session)
        assert result["success"] is False, (
            f"Expected fail when Design Deviations missing, got: {result}"
        )

    def test_result_has_checks_on_failure(self, tmp_session):
        """Failed result should have data.checks with failing check."""
        session = tmp_session(SESSION_WITHOUT_RECONCILE)
        result = validate_spec_reconcile(session)
        assert result["success"] is False
        assert "data" in result
        checks = result["data"]["checks"]
        assert isinstance(checks, list)
        fail_checks = [c for c in checks if c.get("status") == "fail"]
        assert len(fail_checks) > 0, "Failed result should have at least one failing check"

    def test_empty_file_fails(self, tmp_session):
        """Empty session file should fail, not crash."""
        session = tmp_session("")
        result = validate_spec_reconcile(session)
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_nonexistent_file_fails(self):
        """Non-existent session file should return error, not raise."""
        result = validate_spec_reconcile("/nonexistent/session.md")
        assert isinstance(result, dict)
        assert result["success"] is False


# =============================================================================
# AC 5 Gate file tests: spec-reconcile-pass.md structure
# =============================================================================


class TestGateFileStructure:
    """AC-5/6: Gate file follows gate-schema.md format."""

    def test_gate_file_exists(self):
        assert GATE_FILE.exists(), f"Gate file not found: {GATE_FILE}"

    def test_gate_has_gate_tag(self):
        content = GATE_FILE.read_text()
        assert "<gate " in content, "Missing <gate> root element"
        assert 'name="spec-reconcile-pass"' in content, (
            "Missing name='spec-reconcile-pass' attribute"
        )

    def test_gate_has_purpose_tag(self):
        content = GATE_FILE.read_text()
        assert "<purpose>" in content, "Missing <purpose> tag"
        assert "</purpose>" in content, "Missing closing </purpose> tag"
        start = content.index("<purpose>") + len("<purpose>")
        end = content.index("</purpose>")
        purpose_text = content[start:end].strip()
        assert len(purpose_text) > 10, "Purpose text is too short/empty"

    def test_gate_has_pass_tag_with_gate_result(self):
        content = GATE_FILE.read_text()
        assert "<pass>" in content, "Missing <pass> tag"
        assert "</pass>" in content, "Missing closing </pass> tag"
        start = content.index("<pass>") + len("<pass>")
        end = content.index("</pass>")
        pass_text = content[start:end]
        assert "GATE_RESULT:" in pass_text, "Pass section missing GATE_RESULT template"
        assert "status: pass" in pass_text, "Pass section missing 'status: pass'"

    def test_gate_has_fail_tag_with_gate_result(self):
        content = GATE_FILE.read_text()
        assert "<fail>" in content, "Missing <fail> tag"
        assert "</fail>" in content, "Missing closing </fail> tag"
        start = content.index("<fail>") + len("<fail>")
        end = content.index("</fail>")
        fail_text = content[start:end]
        assert "GATE_RESULT:" in fail_text, "Fail section missing GATE_RESULT template"
        assert "status: fail" in fail_text, "Fail section missing 'status: fail'"

    def test_gate_has_closing_tag(self):
        content = GATE_FILE.read_text()
        assert "</gate>" in content, "Missing closing </gate> tag"

    def test_gate_specifies_haiku_model(self):
        content = GATE_FILE.read_text()
        assert 'model="haiku"' in content, "Gate should specify model='haiku'"

    def test_gate_fail_message_verbatim(self):
        """Gate fail section must contain the exact recovery message from AC-6."""
        content = GATE_FILE.read_text()
        start = content.index("<fail>") + len("<fail>")
        end = content.index("</fail>")
        fail_text = content[start:end]
        assert EXPECTED_FAIL_MESSAGE in fail_text, (
            f"Fail section must contain: '{EXPECTED_FAIL_MESSAGE}'"
        )

    def test_gate_passes_pf_validate(self):
        """Gate file must pass pf gate validate."""
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

    def test_gate_references_python_module(self):
        """Gate should call validate_spec_reconcile from pf.gates.spec_reconcile."""
        content = GATE_FILE.read_text()
        assert "spec_reconcile" in content, (
            "Gate should reference the pf.gates.spec_reconcile module"
        )


# =============================================================================
# AC 7: Boss can audit from session file alone
# =============================================================================


class TestSelfContainedEntries:
    """AC-7: architect.md specifies self-contained entries (no 'see above')."""

    def test_specifies_self_contained_entries(self):
        """Entries must be self-contained — no 'see above' or 'see spec'."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "self-contained" in section or "self contained" in section, (
            "Must specify entries are self-contained"
        )

    def test_specifies_spec_text_quoted_inline(self):
        """Spec text must be quoted inline, not referenced externally."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end].lower()
        assert "inline" in section or "quoted" in section, (
            "Must specify spec text is quoted inline"
        )

    def test_specifies_gate_resolution(self):
        """Must specify spec-reconcile-pass gate resolves at phase exit."""
        content = ARCHITECT_FILE.read_text()
        start = content.index("<spec-reconcile>")
        end = content.index("</spec-reconcile>")
        section = content[start:end]
        assert "spec-reconcile-pass" in section, (
            "Must reference spec-reconcile-pass gate"
        )


# =============================================================================
# Module contract — delegation and return-results pattern
# =============================================================================


class TestModuleContract:
    """Module follows return-results pattern and delegates to deviations module."""

    MODULE_PATH = (
        PROJECT_ROOT / "pennyfarthing-dist" / "src" / "pf" / "gates" / "spec_reconcile.py"
    )

    def test_module_file_exists(self):
        assert self.MODULE_PATH.exists(), f"Module not found: {self.MODULE_PATH}"

    def test_function_is_importable(self):
        """validate_spec_reconcile should be importable."""
        from pf.gates.spec_reconcile import validate_spec_reconcile as fn
        assert callable(fn)

    def test_function_accepts_session_path(self):
        """Function signature requires session_path."""
        import inspect
        sig = inspect.signature(validate_spec_reconcile)
        params = list(sig.parameters.keys())
        assert "session_path" in params, "Missing session_path parameter"

    def test_function_returns_dict(self, tmp_session):
        """Function must return a dict (not raise)."""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        result = validate_spec_reconcile(session)
        assert isinstance(result, dict), f"Expected dict, got {type(result)}"

    def test_delegates_to_deviations_module(self):
        """Module should import from pf.gates.deviations to delegate format validation."""
        source_code = self.MODULE_PATH.read_text()
        assert "pf.gates.deviations" in source_code or "from pf.gates.deviations" in source_code, (
            "spec_reconcile should import from pf.gates.deviations"
        )

    def test_never_throws_on_nonexistent(self):
        """Non-existent path should return error dict, not raise."""
        result = validate_spec_reconcile("/nonexistent/path.md")
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_never_throws_on_empty(self, tmp_session):
        """Empty file should return error dict, not raise."""
        session = tmp_session("")
        result = validate_spec_reconcile(session)
        assert isinstance(result, dict)
        assert result["success"] is False


# =============================================================================
# Edge cases — the Mentat demands lethal precision
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions for reconcile validation."""

    def test_reconcile_section_with_malformed_entry_fails(self, tmp_session):
        """Entry with missing fields in reconcile section should fail."""
        malformed = """\
- **Incomplete entry**
  - Spec source: context-story-99-1.md, AC-1
  - Rationale: just because"""
        content = SESSION_WITH_RECONCILE_ENTRY.format(entry=malformed)
        session = tmp_session(content)
        result = validate_spec_reconcile(session)
        assert result["success"] is False, "Malformed entry should fail"

    def test_reconcile_accepts_no_additional_deviations_found(self, tmp_session):
        """'No additional deviations found.' is a valid reconcile-specific phrase."""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        result = validate_spec_reconcile(session)
        assert result["success"] is True, (
            "'No additional deviations found.' should be accepted"
        )

    def test_reconcile_accepts_no_deviations_from_spec(self, tmp_session):
        """'No deviations from spec.' should also be valid in reconcile section."""
        content = SESSION_WITH_RECONCILE_ENTRY.format(
            entry="- No deviations from spec."
        )
        session = tmp_session(content)
        result = validate_spec_reconcile(session)
        assert result["success"] is True, (
            "'No deviations from spec.' should be accepted in reconcile"
        )

    def test_section_stops_at_next_h2(self, tmp_session):
        """Parser only reads content under ## Design Deviations, not beyond."""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        result = validate_spec_reconcile(session)
        assert result["success"] is True

    def test_reconcile_stops_at_next_h3(self, tmp_session):
        """Reconcile subsection stops at the next ### heading."""
        content = """\
# Story 99-1: Test

## Design Deviations

### Architect (reconcile)
- No additional deviations found.

### Some other section
- Malformed content that should be ignored
"""
        session = tmp_session(content)
        result = validate_spec_reconcile(session)
        assert result["success"] is True, "Content after next ### should be ignored"

    def test_idempotent_result(self, tmp_session):
        """Running validation twice produces identical results."""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        result1 = validate_spec_reconcile(session)
        result2 = validate_spec_reconcile(session)
        assert result1 == result2

    def test_session_file_not_modified(self, tmp_session):
        """Validation must not modify the session file."""
        session = tmp_session(SESSION_WITH_RECONCILE_NO_DEVIATIONS)
        content_before = session.read_text()
        validate_spec_reconcile(session)
        content_after = session.read_text()
        assert content_before == content_after

    def test_invalid_severity_in_reconcile_entry_fails(self, tmp_session):
        """Severity must be exactly 'minor' or 'major'."""
        bad_entry = """\
- **Bad severity**
  - Spec source: context-story-99-1.md, AC-1
  - Spec text: "some spec"
  - Implementation: what was done
  - Rationale: why
  - Severity: critical
  - Forward impact: none"""
        content = SESSION_WITH_RECONCILE_ENTRY.format(entry=bad_entry)
        session = tmp_session(content)
        result = validate_spec_reconcile(session)
        assert result["success"] is False, "Invalid severity should fail"

    def test_invalid_forward_impact_in_reconcile_entry_fails(self, tmp_session):
        """Forward impact must start with none, minor, or breaking."""
        bad_entry = """\
- **Bad impact**
  - Spec source: context-story-99-1.md, AC-1
  - Spec text: "some spec"
  - Implementation: what was done
  - Rationale: why
  - Severity: minor
  - Forward impact: high"""
        content = SESSION_WITH_RECONCILE_ENTRY.format(entry=bad_entry)
        session = tmp_session(content)
        result = validate_spec_reconcile(session)
        assert result["success"] is False, "Invalid forward impact should fail"
