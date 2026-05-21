"""Tests for 132-10: Add guided tour prompt to pf-setup completion step.

Verifies:
1. step-11-complete.md contains a guided tour section with AskUserQuestion prompt
2. step-11-complete.md NEXT STEPS mentions the guided tour
3. step-11-complete.md FINAL MESSAGE includes /guided-tour command
4. pf-tour.md command file exists and loads the guided-tour workflow
5. Tour prompt offers three options: Yes, Later, Skip
6. The prompt uses AskUserQuestion (switch-gate pattern), not plain text
7. /guided-tour command references the correct workflow
"""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def dist_root() -> Path:
    """Resolve the pennyfarthing-dist root."""
    here = Path(__file__).resolve()
    # tests/ -> pf/ -> src/ -> pennyfarthing-dist/
    return here.parent.parent.parent.parent


@pytest.fixture
def step_11(dist_root: Path) -> str:
    """Read step-11-complete.md content."""
    path = dist_root / "workflows" / "project-setup" / "steps" / "step-11-complete.md"
    assert path.exists(), f"step-11-complete.md not found at {path}"
    return path.read_text()


@pytest.fixture
def tour_command(dist_root: Path) -> str:
    """Read pf-tour.md command file content."""
    path = dist_root / "commands" / "pf-tour.md"
    assert path.exists(), f"pf-tour.md command file not found at {path}"
    return path.read_text()


# ---------------------------------------------------------------------------
# AC1: Step-11 contains guided tour prompt section
# ---------------------------------------------------------------------------


class TestTourPromptInStep11:
    """AC1: After step-11 completes, user is prompted to take the tour."""

    def test_guided_tour_section_exists(self, step_11: str) -> None:
        """Step-11 must have a GUIDED TOUR section."""
        assert "GUIDED TOUR" in step_11.upper(), (
            "step-11-complete.md must contain a 'GUIDED TOUR' section"
        )

    def test_tour_section_between_final_and_complete(self, step_11: str) -> None:
        """Tour section must appear after FINAL MESSAGE and before WORKFLOW COMPLETE."""
        final_pos = step_11.find("FINAL MESSAGE")
        tour_pos = step_11.upper().find("GUIDED TOUR")
        complete_pos = step_11.find("WORKFLOW COMPLETE")
        assert final_pos != -1, "FINAL MESSAGE section not found"
        assert tour_pos != -1, "GUIDED TOUR section not found"
        assert complete_pos != -1, "WORKFLOW COMPLETE section not found"
        assert final_pos < tour_pos < complete_pos, (
            "GUIDED TOUR must appear between FINAL MESSAGE and WORKFLOW COMPLETE"
        )


# ---------------------------------------------------------------------------
# AC2/AC3/AC4: Three options — Yes, Later, Skip
# ---------------------------------------------------------------------------


class TestTourPromptOptions:
    """AC2-4: Prompt offers Yes (start tour), Later (manual), Skip."""

    def test_yes_option_present(self, step_11: str) -> None:
        """Must offer a 'Yes' option to start the tour."""
        lower = step_11.lower()
        assert "yes" in lower and "tour" in lower, (
            "step-11 must offer a 'Yes' option to start the guided tour"
        )

    def test_later_option_present(self, step_11: str) -> None:
        """Must offer a 'Later' option showing manual invocation."""
        lower = step_11.lower()
        assert "later" in lower, "step-11 must offer a 'Later' option"

    def test_skip_option_present(self, step_11: str) -> None:
        """Must offer a 'Skip' option to continue without tour."""
        lower = step_11.lower()
        assert "skip" in lower, "step-11 must offer a 'Skip' option"


# ---------------------------------------------------------------------------
# AC5: /guided-tour slash command exists
# ---------------------------------------------------------------------------


class TestTourCommandFile:
    """AC5: A /guided-tour command file exists for independent invocation."""

    def test_tour_command_exists(self, dist_root: Path) -> None:
        """pf-tour.md must exist in commands/."""
        path = dist_root / "commands" / "pf-tour.md"
        assert path.exists(), "pf-tour.md command file must exist"

    def test_tour_command_references_workflow(self, tour_command: str) -> None:
        """Command must reference the guided-tour workflow."""
        assert "guided-tour" in tour_command, "pf-tour.md must reference the 'guided-tour' workflow"

    def test_tour_command_has_execution_section(self, tour_command: str) -> None:
        """Command must have an <execution> section like pf-setup.md."""
        assert "<execution>" in tour_command, "pf-tour.md must have an <execution> section"

    def test_tour_command_loads_workflow_yaml(self, tour_command: str) -> None:
        """Command must load the guided-tour workflow YAML."""
        assert "guided-tour/workflow.yaml" in tour_command, (
            "pf-tour.md must load guided-tour/workflow.yaml"
        )


# ---------------------------------------------------------------------------
# AC6: NEXT STEPS mentions the guided tour
# ---------------------------------------------------------------------------


class TestNextStepsMentionsTour:
    """AC6: The NEXT STEPS checklist includes the guided tour."""

    def test_next_steps_has_tour(self, step_11: str) -> None:
        """NEXT STEPS section must mention the guided tour."""
        # Extract NEXT STEPS section
        next_steps_start = step_11.find("NEXT STEPS")
        assert next_steps_start != -1, "NEXT STEPS section not found"
        # Look from NEXT STEPS to end of file
        next_steps_section = step_11[next_steps_start:]
        lower = next_steps_section.lower()
        assert "guided" in lower or "/tour" in lower or "guided-tour" in lower, (
            "NEXT STEPS section must mention the guided tour"
        )


# ---------------------------------------------------------------------------
# AC7: Uses AskUserQuestion pattern
# ---------------------------------------------------------------------------


class TestAskUserQuestionPattern:
    """AC7: Tour prompt uses AskUserQuestion, not plain text."""

    def test_askuserquestion_referenced(self, step_11: str) -> None:
        """Step-11 must reference AskUserQuestion for the tour prompt."""
        assert "AskUserQuestion" in step_11, (
            "step-11 must use AskUserQuestion tool for the tour prompt"
        )

    def test_switch_gate_pattern(self, step_11: str) -> None:
        """Step-11 must use the switch-gate pattern from 132-7."""
        lower = step_11.lower()
        assert "switch" in lower or "<switch>" in lower, (
            "step-11 must use the switch-gate pattern for tour prompt"
        )


# ---------------------------------------------------------------------------
# AC bonus: FINAL MESSAGE includes /guided-tour
# ---------------------------------------------------------------------------


class TestFinalMessageIncludesTour:
    """FINAL MESSAGE quick commands should include /guided-tour."""

    def test_final_message_has_tour_command(self, step_11: str) -> None:
        """FINAL MESSAGE must list /guided-tour or /tour in quick commands."""
        final_start = step_11.find("FINAL MESSAGE")
        assert final_start != -1, "FINAL MESSAGE section not found"
        final_section = step_11[final_start:]
        assert "/guided-tour" in final_section or "/tour" in final_section, (
            "FINAL MESSAGE must include /guided-tour in quick commands"
        )
