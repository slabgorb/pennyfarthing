"""Tests for 148-17: Approval gate regex accepts bold markdown.

The reviewer agent template writes bold markdown (`**All received:** Yes`)
but the approval gate regex in complete_phase.py expects plain text
(`All received: Yes`). These tests verify the gate accepts both formats.

Story: 148-17
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

SUBAGENTS = [
    "reviewer-preflight",
    "reviewer-edge-hunter",
    "reviewer-silent-failure-hunter",
    "reviewer-test-analyzer",
    "reviewer-comment-analyzer",
    "reviewer-type-design",
    "reviewer-security",
    "reviewer-simplifier",
]


# =============================================================================
# Fixtures
# =============================================================================


def _build_subagent_results_section(
    *,
    all_received_line: str,
    include_all_subagents: bool = True,
) -> str:
    """Build a Subagent Results section with configurable formatting."""
    agents = SUBAGENTS if include_all_subagents else SUBAGENTS[:3]
    rows = "\n".join(
        f"| {i} | {name} | Yes | clean | none | N/A |"
        for i, name in enumerate(agents, 1)
    )

    return (
        "## Subagent Results\n"
        "\n"
        "| # | Specialist | Received | Status | Findings | Decision |\n"
        "|---|-----------|----------|--------|----------|----------|\n"
        f"{rows}\n"
        "\n"
        f"{all_received_line}\n"
        "**Total findings:** 0 confirmed, 0 dismissed, 0 deferred\n"
    )


def _build_reviewer_assessment() -> str:
    """Build a Reviewer Assessment section with all required tags."""
    return (
        "## Reviewer Assessment\n"
        "\n"
        "**Verdict: APPROVED**\n"
        "\n"
        "Summary of review:\n"
        "- [EDGE] No boundary condition issues found\n"
        "- [SILENT] No swallowed errors\n"
        "- [TEST] Test coverage adequate\n"
        "- [DOC] Documentation complete\n"
        "- [TYPE] Type design sound\n"
        "- [SEC] No security concerns\n"
        "- [SIMPLE] No unnecessary complexity\n"
    )


def _build_session_content(
    *,
    all_received_line: str,
    include_all_subagents: bool = True,
) -> str:
    """Build a complete session file content for gate testing."""
    return (
        "# Session: 148-17\n\n"
        "**Story:** 148-17\n"
        "**Workflow:** tdd\n"
        "**Phase:** review\n\n"
        + _build_subagent_results_section(
            all_received_line=all_received_line,
            include_all_subagents=include_all_subagents,
        )
        + "\n"
        + _build_reviewer_assessment()
    )


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """Create a minimal project with TDD workflow and approval gate."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    workflows_dir = pf_dir / "workflows"
    workflows_dir.mkdir()
    (workflows_dir / "tdd.yaml").write_text(
        yaml.dump(
            {
                "workflow": {
                    "name": "tdd",
                    "phases": [
                        {"name": "setup", "agent": "sm"},
                        {"name": "red", "agent": "tea"},
                        {"name": "green", "agent": "dev"},
                        {"name": "verify", "agent": "tea"},
                        {
                            "name": "review",
                            "agent": "reviewer",
                            "gate": {
                                "file": "gates/approval",
                                "type": "approval",
                            },
                        },
                        {"name": "finish", "agent": "sm"},
                    ],
                }
            }
        )
    )

    gates_dir = pf_dir / "gates"
    gates_dir.mkdir()
    (gates_dir / "approval.md").write_text(
        '<gate name="approval" model="haiku">\n'
        "<purpose>Code review approved</purpose>\n"
        "<pass>Reviewer approved</pass>\n"
        "<fail>Not yet approved</fail>\n"
        "</gate>\n"
    )

    (pf_dir / "repos.yaml").write_text(
        yaml.dump({"repos": {"orchestrator": {"path": ".", "type": "orchestrator"}}})
    )

    session_dir = tmp_path / ".session"
    session_dir.mkdir()

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(
        yaml.dump({"sprint": {"number": 2610, "goal": "Test"}, "epics": [], "stories": []})
    )

    return tmp_path


# =============================================================================
# AC2: Gate regex accepts bold markdown "**All received:** Yes"
# =============================================================================


class TestSubagentCompletionMarkdown:
    """Test _check_subagent_completion accepts both plain and bold markdown."""

    def test_plain_text_all_received_passes(self) -> None:
        """Plain text 'All received: Yes' passes (existing behavior, regression guard)."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_session_content(all_received_line="All received: Yes")
        result = _check_subagent_completion(content)
        assert result is None, f"Expected pass but got: {result}"

    def test_bold_markdown_all_received_passes(self) -> None:
        """Bold markdown '**All received:** Yes' must pass — this is what the reviewer template produces."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_session_content(all_received_line="**All received:** Yes")
        result = _check_subagent_completion(content)
        assert result is None, f"Expected pass but got: {result}"

    def test_bold_markdown_with_bold_value_passes(self) -> None:
        """Bold key AND value: '**All received:** **Yes**' must also pass."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_session_content(all_received_line="**All received:** **Yes**")
        result = _check_subagent_completion(content)
        assert result is None, f"Expected pass but got: {result}"

    def test_bold_markdown_no_not_pass(self) -> None:
        """Bold markdown '**All received:** No' must still fail."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_session_content(all_received_line="**All received:** No")
        result = _check_subagent_completion(content)
        assert result is not None, "Expected failure for 'No' but got pass"

    def test_plain_text_no_not_pass(self) -> None:
        """Plain text 'All received: No' must still fail."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_session_content(all_received_line="All received: No")
        result = _check_subagent_completion(content)
        assert result is not None, "Expected failure for 'No' but got pass"

    def test_missing_all_received_line_fails(self) -> None:
        """No 'All received' line at all must fail."""
        from pf.handoff.complete_phase import _check_subagent_completion

        content = _build_session_content(all_received_line="")
        result = _check_subagent_completion(content)
        assert result is not None, "Expected failure for missing line"


# =============================================================================
# AC2: complete_phase integration — bold markdown doesn't block phase transition
# =============================================================================


class TestCompletePhaseMarkdownIntegration:
    """Test that complete_phase accepts bold markdown in session file."""

    def test_complete_phase_with_plain_text_succeeds(
        self, project_root: Path
    ) -> None:
        """Plain text 'All received: Yes' allows phase transition (regression guard)."""
        from pf.handoff.complete_phase import complete_phase

        session = project_root / ".session" / "148-17-session.md"
        session.write_text(
            _build_session_content(all_received_line="All received: Yes")
        )

        result = complete_phase(
            story_id="148-17",
            workflow="tdd",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=project_root,
        )
        assert result["status"] == "success", f"Expected success: {result.get('error')}"

    def test_complete_phase_with_bold_markdown_succeeds(
        self, project_root: Path
    ) -> None:
        """Bold markdown '**All received:** Yes' must allow phase transition."""
        from pf.handoff.complete_phase import complete_phase

        session = project_root / ".session" / "148-17-session.md"
        session.write_text(
            _build_session_content(all_received_line="**All received:** Yes")
        )

        result = complete_phase(
            story_id="148-17",
            workflow="tdd",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=project_root,
        )
        assert result["status"] == "success", f"Expected success: {result.get('error')}"

    def test_complete_phase_with_bold_value_succeeds(
        self, project_root: Path
    ) -> None:
        """Bold key+value '**All received:** **Yes**' must allow phase transition."""
        from pf.handoff.complete_phase import complete_phase

        session = project_root / ".session" / "148-17-session.md"
        session.write_text(
            _build_session_content(all_received_line="**All received:** **Yes**")
        )

        result = complete_phase(
            story_id="148-17",
            workflow="tdd",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=project_root,
        )
        assert result["status"] == "success", f"Expected success: {result.get('error')}"

    def test_complete_phase_with_incomplete_subagents_still_fails(
        self, project_root: Path
    ) -> None:
        """Incomplete subagent table still fails even with bold markdown."""
        from pf.handoff.complete_phase import complete_phase

        session = project_root / ".session" / "148-17-session.md"
        session.write_text(
            _build_session_content(
                all_received_line="**All received:** Yes",
                include_all_subagents=False,
            )
        )

        result = complete_phase(
            story_id="148-17",
            workflow="tdd",
            from_phase="review",
            to_phase="finish",
            gate_type="approval",
            project_root=project_root,
        )
        assert result["status"] == "error", "Should fail with missing subagents"
