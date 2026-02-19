"""Tests for confidence gate file — Story 90-2 (generalized).

Epic: 90 (Confidence Circuit Breaker via Gate)
Story: 90-2 — Implement confidence gate file

Tests the confidence gate file that checks whether an instruction to any
agent is ambiguous. If ambiguous, <fail> returns clarifying options. If
unambiguous, <pass> lets the agent proceed.

Originally SM-specific (confidence-sm), generalized to agent-agnostic (confidence).

Acceptance Criteria:
- [AC1] Gate file exists in pennyfarthing-dist/gates/ following Gate PRD schema
- [AC2] Gate has <gate>, <purpose>, <pass>, <fail> blocks
- [AC3] Gate checks whether instruction is ambiguous
- [AC4] <fail> block returns clarifying options when ambiguous
- [AC5] <pass> block lets the agent proceed when unambiguous
- [AC6] Gate uses model="haiku"
- [AC7] Gate validates against existing schema (same structure as tests-pass.md)
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.handoff.gate_file import resolve_gate_file
from pf.handoff.gate_runner import parse_gate_file

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

GATE_NAME = "confidence"

# The gate file lives in pennyfarthing-dist/gates/ relative to the framework root
# In the dogfooding context, the project root is the orchestrator, so we need
# to resolve paths relative to this test file.
_THIS_DIR = Path(__file__).resolve().parent
_SCRIPTS_DIR = _THIS_DIR.parent  # pf/
_FRAMEWORK_ROOT = _SCRIPTS_DIR.parent  # pennyfarthing/
_GATE_FILE = _FRAMEWORK_ROOT / "pennyfarthing-dist" / "gates" / f"{GATE_NAME}.md"


@pytest.fixture
def gate_path() -> Path:
    """Return the expected path to the confidence gate file."""
    return _GATE_FILE


@pytest.fixture
def gate_content(gate_path: Path) -> str:
    """Read and return the gate file content. Fails if file missing."""
    assert gate_path.is_file(), f"Gate file not found: {gate_path}"
    return gate_path.read_text()


@pytest.fixture
def parsed_gate(gate_path: Path) -> dict:
    """Parse the gate file using the gate runner's parse_gate_file."""
    return parse_gate_file(gate_path)


# ===========================================================================
# AC1: Gate file exists in pennyfarthing-dist/gates/
# ===========================================================================


class TestGateFileExists:
    """AC1: Gate file exists at the expected location."""

    def test_gate_file_exists(self, gate_path: Path) -> None:
        """AC1: confidence.md exists in pennyfarthing-dist/gates/."""
        assert gate_path.is_file(), f"Gate file not found: {gate_path}"

    def test_gate_file_not_empty(self, gate_path: Path) -> None:
        """AC1: Gate file is not empty."""
        assert gate_path.is_file(), f"Gate file not found: {gate_path}"
        content = gate_path.read_text()
        assert len(content.strip()) > 0, "Gate file is empty"

    def test_gate_discoverable(self, gate_path: Path) -> None:
        """AC1: Gate is discoverable via resolve_gate_file()."""
        # Use the framework root which has pennyfarthing-dist/gates/
        result = resolve_gate_file(GATE_NAME, project_root=_FRAMEWORK_ROOT)
        assert result["status"] == "found", (
            f"Gate not discoverable: {result.get('error')}"
        )

    def test_gate_discoverable_with_prefix(self, gate_path: Path) -> None:
        """AC1: Gate discoverable with gates/ prefix."""
        result = resolve_gate_file(
            f"gates/{GATE_NAME}", project_root=_FRAMEWORK_ROOT
        )
        assert result["status"] == "found"


# ===========================================================================
# AC2: Gate has <gate>, <purpose>, <pass>, <fail> blocks
# ===========================================================================


class TestGateSchemaStructure:
    """AC2: Gate file has all required XML-tagged blocks."""

    def test_has_gate_tag(self, gate_content: str) -> None:
        """AC2: File contains a <gate> opening tag."""
        assert "<gate " in gate_content or "<gate>" in gate_content

    def test_has_closing_gate_tag(self, gate_content: str) -> None:
        """AC2: File contains a </gate> closing tag."""
        assert "</gate>" in gate_content

    def test_has_purpose_block(self, gate_content: str) -> None:
        """AC2: File contains <purpose> and </purpose> tags."""
        assert "<purpose>" in gate_content
        assert "</purpose>" in gate_content

    def test_has_pass_block(self, gate_content: str) -> None:
        """AC2: File contains <pass> and </pass> tags."""
        assert "<pass>" in gate_content
        assert "</pass>" in gate_content

    def test_has_fail_block(self, gate_content: str) -> None:
        """AC2: File contains <fail> and </fail> tags."""
        assert "<fail>" in gate_content
        assert "</fail>" in gate_content

    def test_parses_without_error(self, parsed_gate: dict) -> None:
        """AC2: parse_gate_file returns status 'ok'."""
        assert parsed_gate["status"] == "ok", (
            f"Parse error: {parsed_gate.get('error')}"
        )


# ===========================================================================
# AC3: Gate checks whether SM instruction is ambiguous
# ===========================================================================


class TestGateAmbiguityDetection:
    """AC3: Gate content describes checking for ambiguous instructions."""

    def test_purpose_mentions_ambiguity(self, gate_content: str) -> None:
        """AC3: Purpose section references ambiguity or unclear instructions."""
        import re

        purpose_match = re.search(
            r"<purpose>(.*?)</purpose>", gate_content, re.DOTALL
        )
        assert purpose_match is not None, "No <purpose> block found"
        purpose = purpose_match.group(1).lower()
        assert any(
            term in purpose
            for term in ["ambig", "unclear", "vague", "confidence", "clarif"]
        ), f"Purpose doesn't reference ambiguity: {purpose}"

    def test_gate_name_is_confidence(self, parsed_gate: dict) -> None:
        """AC3: Gate name is 'confidence'."""
        assert parsed_gate["name"] == GATE_NAME

    def test_content_is_agent_agnostic(self, gate_content: str) -> None:
        """AC3: Gate content is agent-agnostic (not SM-specific)."""
        content_lower = gate_content.lower()
        assert any(
            term in content_lower
            for term in ["current agent", "the agent", "any agent"]
        ), "Gate should be agent-agnostic"


# ===========================================================================
# AC4: <fail> block returns clarifying options when ambiguous
# ===========================================================================


class TestGateFailBlock:
    """AC4: Fail block provides clarifying options for ambiguous instructions."""

    def test_fail_block_has_content(self, gate_content: str) -> None:
        """AC4: Fail block is not empty."""
        import re

        fail_match = re.search(r"<fail>(.*?)</fail>", gate_content, re.DOTALL)
        assert fail_match is not None, "No <fail> block found"
        fail_content = fail_match.group(1).strip()
        assert len(fail_content) > 0, "Fail block is empty"

    def test_fail_block_mentions_clarification(self, gate_content: str) -> None:
        """AC4: Fail block mentions clarifying or asking for more info."""
        import re

        fail_match = re.search(r"<fail>(.*?)</fail>", gate_content, re.DOTALL)
        assert fail_match is not None
        fail_content = fail_match.group(1).lower()
        assert any(
            term in fail_content
            for term in ["clarif", "option", "which", "specify", "did you mean"]
        ), f"Fail block doesn't offer clarifying options: {fail_content[:200]}"

    def test_fail_block_has_gate_result(self, gate_content: str) -> None:
        """AC4: Fail block includes GATE_RESULT template with status: fail."""
        import re

        fail_match = re.search(r"<fail>(.*?)</fail>", gate_content, re.DOTALL)
        assert fail_match is not None
        fail_content = fail_match.group(1)
        assert "GATE_RESULT" in fail_content, "Fail block missing GATE_RESULT"
        assert "status: fail" in fail_content, "Fail block missing status: fail"


# ===========================================================================
# AC5: <pass> block lets the agent proceed when unambiguous
# ===========================================================================


class TestGatePassBlock:
    """AC5: Pass block describes proceeding when instruction is clear."""

    def test_pass_block_has_content(self, gate_content: str) -> None:
        """AC5: Pass block is not empty."""
        import re

        pass_match = re.search(r"<pass>(.*?)</pass>", gate_content, re.DOTALL)
        assert pass_match is not None, "No <pass> block found"
        pass_content = pass_match.group(1).strip()
        assert len(pass_content) > 0, "Pass block is empty"

    def test_pass_block_indicates_proceed(self, gate_content: str) -> None:
        """AC5: Pass block indicates the agent should proceed."""
        import re

        pass_match = re.search(r"<pass>(.*?)</pass>", gate_content, re.DOTALL)
        assert pass_match is not None
        pass_content = pass_match.group(1).lower()
        assert any(
            term in pass_content
            for term in ["proceed", "continue", "clear", "unambig", "confident"]
        ), f"Pass block doesn't indicate proceeding: {pass_content[:200]}"

    def test_pass_block_has_gate_result(self, gate_content: str) -> None:
        """AC5: Pass block includes GATE_RESULT template with status: pass."""
        import re

        pass_match = re.search(r"<pass>(.*?)</pass>", gate_content, re.DOTALL)
        assert pass_match is not None
        pass_content = pass_match.group(1)
        assert "GATE_RESULT" in pass_content, "Pass block missing GATE_RESULT"
        assert "status: pass" in pass_content, "Pass block missing status: pass"


# ===========================================================================
# AC6: Gate uses model="haiku"
# ===========================================================================


class TestGateModel:
    """AC6: Gate specifies model="haiku" per Gate PRD defaults."""

    def test_model_is_haiku(self, parsed_gate: dict) -> None:
        """AC6: parse_gate_file extracts model as 'haiku' from a valid gate."""
        assert parsed_gate["status"] == "ok", (
            f"Gate parse failed: {parsed_gate.get('error')}"
        )
        assert parsed_gate["model"] == "haiku", (
            f"Expected model 'haiku', got '{parsed_gate['model']}'"
        )

    def test_gate_tag_has_model_attribute(self, gate_content: str) -> None:
        """AC6: <gate> tag explicitly includes model="haiku"."""
        import re

        gate_match = re.search(r"<gate\b[^>]*>", gate_content)
        assert gate_match is not None
        gate_tag = gate_match.group(0)
        assert 'model="haiku"' in gate_tag, (
            f"<gate> tag missing model=\"haiku\": {gate_tag}"
        )


# ===========================================================================
# AC7: Validates against existing schema (same structure as tests-pass.md)
# ===========================================================================


class TestGateSchemaConsistency:
    """AC7: Gate follows the same structural patterns as tests-pass.md."""

    def test_result_has_all_required_keys(self, parsed_gate: dict) -> None:
        """AC7: parse_gate_file result has all expected keys and parse succeeds."""
        assert parsed_gate["status"] == "ok", (
            f"Gate parse failed: {parsed_gate.get('error')}"
        )
        for key in ("status", "name", "model", "content", "error"):
            assert key in parsed_gate, f"Missing key: {key}"

    def test_name_matches_filename(self, parsed_gate: dict) -> None:
        """AC7: Gate name attribute matches the filename convention."""
        assert parsed_gate["name"] == GATE_NAME

    def test_content_is_full_file(self, gate_path: Path, parsed_gate: dict) -> None:
        """AC7: Parsed content matches raw file read."""
        assert parsed_gate["status"] == "ok"
        raw = gate_path.read_text()
        assert parsed_gate["content"] == raw

    def test_gate_result_yaml_in_both_blocks(self, gate_content: str) -> None:
        """AC7: Both pass and fail blocks include GATE_RESULT YAML blocks."""
        import re

        pass_match = re.search(r"<pass>(.*?)</pass>", gate_content, re.DOTALL)
        fail_match = re.search(r"<fail>(.*?)</fail>", gate_content, re.DOTALL)
        assert pass_match is not None
        assert fail_match is not None
        assert "GATE_RESULT:" in pass_match.group(1)
        assert "GATE_RESULT:" in fail_match.group(1)
