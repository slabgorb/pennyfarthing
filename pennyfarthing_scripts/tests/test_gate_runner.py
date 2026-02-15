"""Tests for gate subagent runner — Story 106-2.

Epic: 106 (Gate Files & First Migration)
Story: 106-2 — Gate subagent runner with GATE_RESULT contract

Tests parse_gate_file() and extract_gate_result() — the parsing layer
around gate file evaluation. The actual subagent spawning is handled by
the Claude agent; these functions parse inputs and outputs.

Acceptance Criteria:
- [AC1] Gate runner function accepts a gate file path and spawns it as a haiku Task subagent
- [AC2] Returns structured GATE_RESULT: {status: pass|fail, message, checks}
- [AC3] Supports model attribute (default: haiku, overridable per gate)
- [AC4] Default-deny: missing GATE_RESULT = fail
- [AC5] GATE_RESULT extraction uses regex/grep, not full YAML parser
- [AC6] Gate files are read-only at runtime (never written to)
- [AC7] Handles subagent timeouts and crashes gracefully (default to fail)
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from pennyfarthing_scripts.handoff.gate_runner import (
    extract_gate_result,
    parse_gate_file,
)


# ---------------------------------------------------------------------------
# Fixtures: Gate file content
# ---------------------------------------------------------------------------

GATE_WITH_MODEL = """\
<gate name="tests-pass" model="haiku">

<purpose>
Verify that all tests pass and working tree is clean.
</purpose>

<pass>
Run tests and report results.

```yaml
GATE_RESULT:
  status: pass
  message: "All tests passing"
```
</pass>

<fail>
Report failures.

```yaml
GATE_RESULT:
  status: fail
  message: "Tests failing"
```
</fail>

</gate>
"""

GATE_WITH_CUSTOM_MODEL = """\
<gate name="deep-review" model="sonnet">

<purpose>
Deep code review requiring more capable model.
</purpose>

<pass>
Review passes.
</pass>

<fail>
Review fails.
</fail>

</gate>
"""

GATE_WITHOUT_MODEL = """\
<gate name="simple-check">

<purpose>
A gate with no model attribute — should default to haiku.
</purpose>

<pass>
Check passes.
</pass>

<fail>
Check fails.
</fail>

</gate>
"""

GATE_MINIMAL = """\
<gate name="minimal" model="haiku">
<pass>Pass</pass>
<fail>Fail</fail>
</gate>
"""


@pytest.fixture
def gate_file(tmp_path: Path) -> Path:
    """Create a standard gate file with model="haiku"."""
    p = tmp_path / "tests-pass.md"
    p.write_text(GATE_WITH_MODEL)
    return p


@pytest.fixture
def gate_file_custom_model(tmp_path: Path) -> Path:
    """Create a gate file with model="sonnet"."""
    p = tmp_path / "deep-review.md"
    p.write_text(GATE_WITH_CUSTOM_MODEL)
    return p


@pytest.fixture
def gate_file_no_model(tmp_path: Path) -> Path:
    """Create a gate file with no model attribute."""
    p = tmp_path / "simple-check.md"
    p.write_text(GATE_WITHOUT_MODEL)
    return p


@pytest.fixture
def gate_file_minimal(tmp_path: Path) -> Path:
    """Create a minimal gate file."""
    p = tmp_path / "minimal.md"
    p.write_text(GATE_MINIMAL)
    return p


# ===========================================================================
# AC1: Gate runner accepts a gate file path and parses it
# ===========================================================================


class TestParseGateFileBasic:
    """AC1: parse_gate_file reads gate file and returns structured metadata."""

    def test_returns_ok_status(self, gate_file: Path) -> None:
        """AC1: Successful parse returns status 'ok'."""
        result = parse_gate_file(gate_file)
        assert result["status"] == "ok"

    def test_returns_gate_name(self, gate_file: Path) -> None:
        """AC1: Extracts gate name from <gate name="...">."""
        result = parse_gate_file(gate_file)
        assert result["name"] == "tests-pass"

    def test_returns_gate_content(self, gate_file: Path) -> None:
        """AC1: Returns full gate file content for subagent prompt."""
        result = parse_gate_file(gate_file)
        assert result["content"] is not None
        assert len(result["content"]) > 0
        assert "<gate" in result["content"]

    def test_content_matches_file(self, gate_file: Path) -> None:
        """AC1: Content matches what was written to file."""
        result = parse_gate_file(gate_file)
        assert result["content"] == GATE_WITH_MODEL

    def test_returns_model(self, gate_file: Path) -> None:
        """AC1: Extracts model from <gate model="...">."""
        result = parse_gate_file(gate_file)
        assert result["model"] == "haiku"

    def test_error_is_none_on_success(self, gate_file: Path) -> None:
        """AC1: Error field is None when parse succeeds."""
        result = parse_gate_file(gate_file)
        assert result["error"] is None

    def test_result_has_required_keys(self, gate_file: Path) -> None:
        """AC1: Result dict has all required keys."""
        result = parse_gate_file(gate_file)
        assert "status" in result
        assert "name" in result
        assert "model" in result
        assert "content" in result
        assert "error" in result

    def test_accepts_string_path(self, gate_file: Path) -> None:
        """AC1: Accepts both str and Path objects."""
        result = parse_gate_file(str(gate_file))
        assert result["status"] == "ok"

    def test_nonexistent_file_returns_error(self, tmp_path: Path) -> None:
        """AC1: Missing file returns error status."""
        result = parse_gate_file(tmp_path / "nonexistent.md")
        assert result["status"] == "error"
        assert result["error"] is not None

    def test_empty_file_returns_error(self, tmp_path: Path) -> None:
        """AC1: Empty file with no <gate> tag returns error."""
        p = tmp_path / "empty.md"
        p.write_text("")
        result = parse_gate_file(p)
        assert result["status"] == "error"

    def test_file_without_gate_tag_returns_error(self, tmp_path: Path) -> None:
        """AC1: File without <gate> tag returns error."""
        p = tmp_path / "bad.md"
        p.write_text("# Just a regular markdown file\nNo gate here.\n")
        result = parse_gate_file(p)
        assert result["status"] == "error"


# ===========================================================================
# AC3: Model attribute — default haiku, overridable per gate
# ===========================================================================


class TestParseGateFileModel:
    """AC3: Model attribute extraction with default fallback."""

    def test_extracts_haiku_model(self, gate_file: Path) -> None:
        """AC3: model="haiku" extracted correctly."""
        result = parse_gate_file(gate_file)
        assert result["model"] == "haiku"

    def test_extracts_custom_model(self, gate_file_custom_model: Path) -> None:
        """AC3: model="sonnet" extracted correctly."""
        result = parse_gate_file(gate_file_custom_model)
        assert result["model"] == "sonnet"

    def test_defaults_to_haiku_when_no_model(
        self, gate_file_no_model: Path
    ) -> None:
        """AC3: Missing model attribute defaults to 'haiku'."""
        result = parse_gate_file(gate_file_no_model)
        assert result["model"] == "haiku"

    def test_extracts_name_when_no_model(
        self, gate_file_no_model: Path
    ) -> None:
        """AC3: Gate name still extracted when model is missing."""
        result = parse_gate_file(gate_file_no_model)
        assert result["name"] == "simple-check"


# ===========================================================================
# AC6: Gate files are read-only at runtime
# ===========================================================================


class TestParseGateFileReadOnly:
    """AC6: Gate files must not be modified during parsing."""

    def test_file_not_modified(self, gate_file: Path) -> None:
        """AC6: File mtime unchanged after parsing."""
        mtime_before = os.path.getmtime(gate_file)
        content_before = gate_file.read_text()
        parse_gate_file(gate_file)
        mtime_after = os.path.getmtime(gate_file)
        content_after = gate_file.read_text()
        assert mtime_before == mtime_after
        assert content_before == content_after

    def test_file_size_unchanged(self, gate_file: Path) -> None:
        """AC6: File size unchanged after parsing."""
        size_before = gate_file.stat().st_size
        parse_gate_file(gate_file)
        size_after = gate_file.stat().st_size
        assert size_before == size_after


# ===========================================================================
# AC2: Returns structured GATE_RESULT: {status, message, checks}
# ===========================================================================


# Subagent output samples for extract_gate_result tests

PASSING_OUTPUT = """\
I've run all the checks. Here are the results:

GATE_RESULT:
  status: pass
  gate: tests-pass
  message: "All 47 tests passing. Working tree clean."
  checks:
    - name: test-suite
      status: pass
      detail: "47/47 tests passing (0 skipped)"
    - name: working-tree
      status: pass
      detail: "No uncommitted changes"
    - name: branch-status
      status: pass
      detail: "On branch feature/106-2, HEAD at abc1234"
"""

FAILING_OUTPUT = """\
Some checks failed:

GATE_RESULT:
  status: fail
  gate: tests-pass
  message: "3 tests failing, dirty working tree"
  checks:
    - name: test-suite
      status: fail
      detail: "44/47 tests passing, 3 failing"
    - name: working-tree
      status: fail
      detail: "2 uncommitted files"
    - name: branch-status
      status: pass
      detail: "On branch feature/106-2, HEAD at abc1234"
"""

MINIMAL_PASS_OUTPUT = """\
GATE_RESULT:
  status: pass
  message: "All good"
  checks: []
"""

MINIMAL_FAIL_OUTPUT = """\
GATE_RESULT:
  status: fail
  message: "Something wrong"
  checks: []
"""


class TestExtractGateResultPass:
    """AC2: Correctly extracts passing GATE_RESULT."""

    def test_status_is_pass(self) -> None:
        """AC2: Passing output yields status 'pass'."""
        result = extract_gate_result(PASSING_OUTPUT)
        assert result["status"] == "pass"

    def test_message_extracted(self) -> None:
        """AC2: Message field extracted from output."""
        result = extract_gate_result(PASSING_OUTPUT)
        assert "47 tests passing" in result["message"]

    def test_checks_is_list(self) -> None:
        """AC2: Checks field is a list."""
        result = extract_gate_result(PASSING_OUTPUT)
        assert isinstance(result["checks"], list)

    def test_checks_have_required_fields(self) -> None:
        """AC2: Each check has name, status, detail."""
        result = extract_gate_result(PASSING_OUTPUT)
        for check in result["checks"]:
            assert "name" in check
            assert "status" in check
            assert "detail" in check

    def test_check_count(self) -> None:
        """AC2: Correct number of checks extracted."""
        result = extract_gate_result(PASSING_OUTPUT)
        assert len(result["checks"]) == 3

    def test_check_names(self) -> None:
        """AC2: Check names match expected values."""
        result = extract_gate_result(PASSING_OUTPUT)
        names = [c["name"] for c in result["checks"]]
        assert "test-suite" in names
        assert "working-tree" in names
        assert "branch-status" in names

    def test_all_checks_pass(self) -> None:
        """AC2: All checks have status 'pass' in passing output."""
        result = extract_gate_result(PASSING_OUTPUT)
        for check in result["checks"]:
            assert check["status"] == "pass"


class TestExtractGateResultFail:
    """AC2: Correctly extracts failing GATE_RESULT."""

    def test_status_is_fail(self) -> None:
        """AC2: Failing output yields status 'fail'."""
        result = extract_gate_result(FAILING_OUTPUT)
        assert result["status"] == "fail"

    def test_message_extracted(self) -> None:
        """AC2: Failure message extracted."""
        result = extract_gate_result(FAILING_OUTPUT)
        assert "failing" in result["message"].lower()

    def test_mixed_check_statuses(self) -> None:
        """AC2: Individual checks can have different statuses."""
        result = extract_gate_result(FAILING_OUTPUT)
        statuses = {c["name"]: c["status"] for c in result["checks"]}
        assert statuses["test-suite"] == "fail"
        assert statuses["working-tree"] == "fail"
        assert statuses["branch-status"] == "pass"


class TestExtractGateResultMinimal:
    """AC2: Handles minimal GATE_RESULT (no checks)."""

    def test_minimal_pass(self) -> None:
        """AC2: Minimal pass output with empty checks."""
        result = extract_gate_result(MINIMAL_PASS_OUTPUT)
        assert result["status"] == "pass"
        assert isinstance(result["checks"], list)

    def test_minimal_fail(self) -> None:
        """AC2: Minimal fail output with empty checks."""
        result = extract_gate_result(MINIMAL_FAIL_OUTPUT)
        assert result["status"] == "fail"

    def test_result_has_required_keys(self) -> None:
        """AC2: Result always has status, message, checks."""
        result = extract_gate_result(MINIMAL_PASS_OUTPUT)
        assert "status" in result
        assert "message" in result
        assert "checks" in result


# ===========================================================================
# AC4: Default-deny — missing GATE_RESULT = fail
# ===========================================================================


class TestExtractGateResultDefaultDeny:
    """AC4: Missing or unparseable GATE_RESULT always returns fail."""

    def test_none_output_returns_fail(self) -> None:
        """AC4: None input (crash/timeout) → fail."""
        result = extract_gate_result(None)
        assert result["status"] == "fail"

    def test_empty_string_returns_fail(self) -> None:
        """AC4: Empty string output → fail."""
        result = extract_gate_result("")
        assert result["status"] == "fail"

    def test_no_gate_result_block_returns_fail(self) -> None:
        """AC4: Output without GATE_RESULT → fail."""
        result = extract_gate_result("I ran the tests and everything looks good!")
        assert result["status"] == "fail"

    def test_partial_gate_result_no_status_returns_fail(self) -> None:
        """AC4: GATE_RESULT without status field → fail."""
        output = "GATE_RESULT:\n  message: 'partial result'\n  checks: []\n"
        result = extract_gate_result(output)
        assert result["status"] == "fail"

    def test_malformed_yaml_returns_fail(self) -> None:
        """AC4: Malformed GATE_RESULT block → fail."""
        output = "GATE_RESULT:\n  status: [[[invalid yaml\n"
        result = extract_gate_result(output)
        assert result["status"] == "fail"

    def test_default_deny_has_message(self) -> None:
        """AC4: Default-deny result includes explanatory message."""
        result = extract_gate_result(None)
        assert result["message"] is not None
        assert len(result["message"]) > 0

    def test_default_deny_has_empty_checks(self) -> None:
        """AC4: Default-deny result has empty checks list."""
        result = extract_gate_result(None)
        assert result["checks"] == []

    def test_status_typo_returns_fail(self) -> None:
        """AC4: status: 'passed' (not 'pass') → fail (strict enum)."""
        output = "GATE_RESULT:\n  status: passed\n  message: 'oops'\n  checks: []\n"
        result = extract_gate_result(output)
        assert result["status"] == "fail"

    def test_status_uppercase_returns_fail(self) -> None:
        """AC4: status: PASS (uppercase) → fail (strict matching)."""
        output = "GATE_RESULT:\n  status: PASS\n  message: 'oops'\n  checks: []\n"
        result = extract_gate_result(output)
        assert result["status"] == "fail"


# ===========================================================================
# AC5: GATE_RESULT extraction uses regex, not full YAML parser
# ===========================================================================


class TestExtractGateResultRegex:
    """AC5: Extraction uses regex patterns, handles various formats."""

    def test_gate_result_embedded_in_prose(self) -> None:
        """AC5: GATE_RESULT found even when surrounded by other text."""
        output = (
            "Here is my analysis of the codebase.\n"
            "I found several issues.\n\n"
            "GATE_RESULT:\n"
            "  status: fail\n"
            '  message: "Found issues"\n'
            "  checks:\n"
            "    - name: lint\n"
            "      status: fail\n"
            '      detail: "3 lint errors"\n'
            "\nLet me know if you need more details."
        )
        result = extract_gate_result(output)
        assert result["status"] == "fail"

    def test_gate_result_in_code_block(self) -> None:
        """AC5: GATE_RESULT inside a code block still extracted."""
        output = (
            "```yaml\n"
            "GATE_RESULT:\n"
            "  status: pass\n"
            '  message: "All clear"\n'
            "  checks: []\n"
            "```\n"
        )
        result = extract_gate_result(output)
        assert result["status"] == "pass"

    def test_handles_extra_whitespace(self) -> None:
        """AC5: Extra whitespace in GATE_RESULT still parses."""
        output = (
            "GATE_RESULT:\n"
            "  status:   pass\n"
            '  message:   "Tests OK"\n'
            "  checks:   []\n"
        )
        result = extract_gate_result(output)
        assert result["status"] == "pass"

    def test_handles_unquoted_message(self) -> None:
        """AC5: Message without quotes still extracted."""
        output = (
            "GATE_RESULT:\n"
            "  status: pass\n"
            "  message: All tests passing\n"
            "  checks: []\n"
        )
        result = extract_gate_result(output)
        assert result["status"] == "pass"
        assert len(result["message"]) > 0

    def test_handles_single_quoted_message(self) -> None:
        """AC5: Single-quoted message extracted."""
        output = (
            "GATE_RESULT:\n"
            "  status: pass\n"
            "  message: 'All tests passing'\n"
            "  checks: []\n"
        )
        result = extract_gate_result(output)
        assert result["status"] == "pass"
        assert "All tests passing" in result["message"]


# ===========================================================================
# AC7: Handles subagent timeouts and crashes gracefully
# ===========================================================================


class TestExtractGateResultEdgeCases:
    """AC7: Graceful handling of timeouts, crashes, and edge cases."""

    def test_timeout_marker_returns_fail(self) -> None:
        """AC7: Output indicating timeout → fail."""
        output = "Error: Task timed out after 120 seconds"
        result = extract_gate_result(output)
        assert result["status"] == "fail"

    def test_very_long_output_still_extracts(self) -> None:
        """AC7: Large output doesn't break extraction."""
        padding = "x" * 10000
        output = (
            f"{padding}\n"
            "GATE_RESULT:\n"
            "  status: pass\n"
            '  message: "Found after long output"\n'
            "  checks: []\n"
            f"\n{padding}"
        )
        result = extract_gate_result(output)
        assert result["status"] == "pass"

    def test_multiple_gate_results_takes_last(self) -> None:
        """AC7: If multiple GATE_RESULT blocks, take the last one."""
        output = (
            "GATE_RESULT:\n"
            "  status: fail\n"
            '  message: "First attempt failed"\n'
            "  checks: []\n"
            "\nRetrying...\n\n"
            "GATE_RESULT:\n"
            "  status: pass\n"
            '  message: "Second attempt passed"\n'
            "  checks: []\n"
        )
        result = extract_gate_result(output)
        assert result["status"] == "pass"
        assert "Second" in result["message"] or "passed" in result["message"]

    def test_only_whitespace_returns_fail(self) -> None:
        """AC7: Whitespace-only output → fail."""
        result = extract_gate_result("   \n\n\t  \n")
        assert result["status"] == "fail"

    def test_gate_result_with_extra_fields_ignored(self) -> None:
        """AC7: Extra fields in GATE_RESULT don't break extraction."""
        output = (
            "GATE_RESULT:\n"
            "  status: pass\n"
            "  gate: tests-pass\n"
            '  message: "All good"\n'
            "  extra_field: ignored\n"
            "  checks: []\n"
        )
        result = extract_gate_result(output)
        assert result["status"] == "pass"
