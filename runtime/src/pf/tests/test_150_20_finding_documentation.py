"""Tests for 150-20: Reviewer finding documentation requirements.

Reviewer findings need structured documentation with explicit go/no-go decisions.
Every finding from every specialist must be documented in the session file with
a clear disposition: FIX (blocks approval) or RECORD (acknowledged but not blocking).

These tests verify:
- AC1: Finding dataclass with required fields
- AC2: parse_findings_from_assessment parses markdown findings
- AC3: validate_findings_completeness enforces disposition rules
- AC4: format_findings_table renders markdown table

Story: 150-20
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# AC1: Finding dataclass
# ---------------------------------------------------------------------------


class TestFindingDataclass:
    """Finding must be a dataclass with id, source, severity, description,
    disposition, and rationale fields."""

    def test_finding_can_be_constructed(self) -> None:
        from pf.reviewer.findings import Finding

        f = Finding(
            id="F001",
            source="reviewer-edge-hunter",
            severity="HIGH",
            description="Missing boundary check on user input",
            disposition="FIX",
            rationale="Security-critical — no input validation on public endpoint",
        )
        assert f.id == "F001"
        assert f.source == "reviewer-edge-hunter"
        assert f.severity == "HIGH"
        assert f.description == "Missing boundary check on user input"
        assert f.disposition == "FIX"
        assert f.rationale == "Security-critical — no input validation on public endpoint"

    def test_finding_has_all_required_fields(self) -> None:
        from pf.reviewer.findings import Finding

        import dataclasses

        fields = {f.name for f in dataclasses.fields(Finding)}
        assert fields == {"id", "source", "severity", "description", "disposition", "rationale"}

    def test_finding_rejects_invalid_severity(self) -> None:
        from pf.reviewer.findings import Finding

        with pytest.raises((ValueError, TypeError)):
            Finding(
                id="F001",
                source="reviewer-security",
                severity="CRITICAL",
                description="test",
                disposition="FIX",
                rationale="test",
            )

    def test_finding_rejects_invalid_disposition(self) -> None:
        from pf.reviewer.findings import Finding

        with pytest.raises((ValueError, TypeError)):
            Finding(
                id="F001",
                source="reviewer-security",
                severity="HIGH",
                description="test",
                disposition="SKIP",
                rationale="test",
            )

    def test_finding_accepts_valid_severities(self) -> None:
        from pf.reviewer.findings import Finding

        for sev in ("HIGH", "MEDIUM", "LOW"):
            f = Finding(
                id="F001",
                source="reviewer-security",
                severity=sev,
                description="test",
                disposition="FIX",
                rationale="test",
            )
            assert f.severity == sev

    def test_finding_accepts_valid_dispositions(self) -> None:
        from pf.reviewer.findings import Finding

        for disp in ("FIX", "RECORD"):
            f = Finding(
                id="F001",
                source="reviewer-security",
                severity="MEDIUM",
                description="test",
                disposition=disp,
                rationale="test",
            )
            assert f.disposition == disp


# ---------------------------------------------------------------------------
# AC2: parse_findings_from_assessment
# ---------------------------------------------------------------------------


class TestParseFindingsFromAssessment:
    """parse_findings_from_assessment must extract findings from markdown."""

    SAMPLE_ASSESSMENT = """\
## Findings

| ID | Source | Severity | Description | Disposition | Rationale |
|----|--------|----------|-------------|-------------|-----------|
| F001 | reviewer-edge-hunter | HIGH | Missing boundary check | FIX | Security risk |
| F002 | reviewer-test-analyzer | MEDIUM | Test coverage gap in auth module | RECORD | Non-critical path |
| F003 | reviewer-security | LOW | Unused import in utils.py | RECORD | Style only |
"""

    def test_parse_returns_list_of_findings(self) -> None:
        from pf.reviewer.findings import parse_findings_from_assessment

        findings = parse_findings_from_assessment(self.SAMPLE_ASSESSMENT)
        assert isinstance(findings, list)
        assert len(findings) == 3

    def test_parse_extracts_correct_fields(self) -> None:
        from pf.reviewer.findings import Finding, parse_findings_from_assessment

        findings = parse_findings_from_assessment(self.SAMPLE_ASSESSMENT)
        f1 = findings[0]
        assert isinstance(f1, Finding)
        assert f1.id == "F001"
        assert f1.source == "reviewer-edge-hunter"
        assert f1.severity == "HIGH"
        assert f1.description == "Missing boundary check"
        assert f1.disposition == "FIX"
        assert f1.rationale == "Security risk"

    def test_parse_handles_empty_assessment(self) -> None:
        from pf.reviewer.findings import parse_findings_from_assessment

        findings = parse_findings_from_assessment("## Reviewer Assessment\n\nNo findings.\n")
        assert findings == []

    def test_parse_handles_no_findings_section(self) -> None:
        from pf.reviewer.findings import parse_findings_from_assessment

        findings = parse_findings_from_assessment("Some random text without a findings table.")
        assert findings == []

    def test_parse_strips_whitespace_from_fields(self) -> None:
        from pf.reviewer.findings import parse_findings_from_assessment

        assessment = """\
## Findings

| ID | Source | Severity | Description | Disposition | Rationale |
|----|--------|----------|-------------|-------------|-----------|
|  F001  |  reviewer-security  |  HIGH  |  Desc with spaces  |  FIX  |  Reason here  |
"""
        findings = parse_findings_from_assessment(assessment)
        assert len(findings) == 1
        assert findings[0].id == "F001"
        assert findings[0].source == "reviewer-security"
        assert findings[0].description == "Desc with spaces"

    def test_parse_skips_separator_rows(self) -> None:
        from pf.reviewer.findings import parse_findings_from_assessment

        assessment = """\
## Findings

| ID | Source | Severity | Description | Disposition | Rationale |
|----|--------|----------|-------------|-------------|-----------|
| F001 | reviewer-security | HIGH | Test finding | FIX | Reason |
|------|--------|----------|-------------|-------------|-----------|
| F002 | reviewer-security | LOW | Another | RECORD | Minor |
"""
        findings = parse_findings_from_assessment(assessment)
        assert len(findings) == 2


# ---------------------------------------------------------------------------
# AC3: validate_findings_completeness
# ---------------------------------------------------------------------------


class TestValidateFindingsCompleteness:
    """validate_findings_completeness must enforce disposition rules."""

    def test_valid_findings_return_valid(self) -> None:
        from pf.reviewer.findings import Finding, validate_findings_completeness

        findings = [
            Finding("F001", "reviewer-security", "HIGH", "desc", "FIX", "reason"),
            Finding("F002", "reviewer-test-analyzer", "MEDIUM", "desc", "RECORD", "reason"),
            Finding("F003", "reviewer-edge-hunter", "LOW", "desc", "RECORD", "reason"),
        ]
        result = validate_findings_completeness(findings)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_high_severity_must_be_fix(self) -> None:
        from pf.reviewer.findings import Finding, validate_findings_completeness

        findings = [
            Finding("F001", "reviewer-security", "HIGH", "desc", "RECORD", "reason"),
        ]
        result = validate_findings_completeness(findings)
        assert result["valid"] is False
        assert len(result["errors"]) == 1
        assert "F001" in result["errors"][0]
        assert "HIGH" in result["errors"][0]

    def test_multiple_high_severity_record_errors(self) -> None:
        from pf.reviewer.findings import Finding, validate_findings_completeness

        findings = [
            Finding("F001", "reviewer-security", "HIGH", "desc1", "RECORD", "reason1"),
            Finding("F002", "reviewer-edge-hunter", "HIGH", "desc2", "RECORD", "reason2"),
        ]
        result = validate_findings_completeness(findings)
        assert result["valid"] is False
        assert len(result["errors"]) == 2

    def test_medium_and_low_can_be_record(self) -> None:
        from pf.reviewer.findings import Finding, validate_findings_completeness

        findings = [
            Finding("F001", "reviewer-security", "MEDIUM", "desc", "RECORD", "reason"),
            Finding("F002", "reviewer-edge-hunter", "LOW", "desc", "RECORD", "reason"),
        ]
        result = validate_findings_completeness(findings)
        assert result["valid"] is True

    def test_empty_findings_is_valid(self) -> None:
        from pf.reviewer.findings import validate_findings_completeness

        result = validate_findings_completeness([])
        assert result["valid"] is True
        assert result["errors"] == []

    def test_result_dict_shape(self) -> None:
        from pf.reviewer.findings import Finding, validate_findings_completeness

        findings = [
            Finding("F001", "reviewer-security", "LOW", "desc", "FIX", "reason"),
        ]
        result = validate_findings_completeness(findings)
        assert "valid" in result
        assert "errors" in result
        assert isinstance(result["valid"], bool)
        assert isinstance(result["errors"], list)


# ---------------------------------------------------------------------------
# AC4: format_findings_table
# ---------------------------------------------------------------------------


class TestFormatFindingsTable:
    """format_findings_table must render findings as a markdown table."""

    def test_format_returns_markdown_table(self) -> None:
        from pf.reviewer.findings import Finding, format_findings_table

        findings = [
            Finding("F001", "reviewer-security", "HIGH", "Security issue", "FIX", "Critical"),
        ]
        table = format_findings_table(findings)
        assert "| ID |" in table or "| id |" in table.lower()
        assert "F001" in table
        assert "reviewer-security" in table
        assert "HIGH" in table
        assert "FIX" in table

    def test_format_includes_header_row(self) -> None:
        from pf.reviewer.findings import Finding, format_findings_table

        findings = [
            Finding("F001", "reviewer-security", "HIGH", "desc", "FIX", "reason"),
        ]
        table = format_findings_table(findings)
        lines = table.strip().split("\n")
        assert len(lines) >= 3  # header, separator, data row
        assert "---" in lines[1]  # separator row

    def test_format_includes_all_findings(self) -> None:
        from pf.reviewer.findings import Finding, format_findings_table

        findings = [
            Finding("F001", "reviewer-security", "HIGH", "First", "FIX", "reason1"),
            Finding("F002", "reviewer-test-analyzer", "LOW", "Second", "RECORD", "reason2"),
            Finding("F003", "reviewer-edge-hunter", "MEDIUM", "Third", "FIX", "reason3"),
        ]
        table = format_findings_table(findings)
        assert "F001" in table
        assert "F002" in table
        assert "F003" in table

    def test_format_empty_list(self) -> None:
        from pf.reviewer.findings import format_findings_table

        table = format_findings_table([])
        # Should return header-only table or empty indicator
        assert isinstance(table, str)
        assert len(table) > 0

    def test_format_includes_all_columns(self) -> None:
        from pf.reviewer.findings import Finding, format_findings_table

        findings = [
            Finding("F001", "reviewer-security", "HIGH", "desc", "FIX", "reason"),
        ]
        table = format_findings_table(findings)
        header = table.strip().split("\n")[0].lower()
        for col in ("id", "source", "severity", "description", "disposition", "rationale"):
            assert col in header, f"Missing column '{col}' in table header"

    def test_roundtrip_format_then_parse(self) -> None:
        """Formatted table should be parseable back into findings."""
        from pf.reviewer.findings import (
            Finding,
            format_findings_table,
            parse_findings_from_assessment,
        )

        original = [
            Finding("F001", "reviewer-security", "HIGH", "Security issue", "FIX", "Critical"),
            Finding("F002", "reviewer-test-analyzer", "MEDIUM", "Coverage gap", "RECORD", "Minor"),
        ]
        table = format_findings_table(original)
        # Wrap in findings section for parser
        assessment = f"## Findings\n\n{table}"
        parsed = parse_findings_from_assessment(assessment)
        assert len(parsed) == len(original)
        for orig, p in zip(original, parsed):
            assert orig.id == p.id
            assert orig.source == p.source
            assert orig.severity == p.severity
            assert orig.disposition == p.disposition
