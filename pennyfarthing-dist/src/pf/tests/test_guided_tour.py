"""Tests for guided-tour stepped workflow.

Story: 132-6 / MSSCI-15640 — Create Guided Tour Stepped Workflow
Epic: 132 / MSSCI-15616 (Developer Discovery & Onboarding)

Acceptance Criteria:
- [AC1] Guided tour is a BikeLane stepped workflow defined in workflows/guided-tour/
- [AC2] Tour covers: theme selection, agent activation, workflow basics, sprint commands, hook/config overview
- [AC3] Each step has a verification gate confirming the user completed the action
- [AC4] Tour can be started via `/pf-workflow start guided-tour`
- [AC5] Tour integrates with getting-started guide (132-1) and welcome nudge (132-2) as entry points
- [AC6] Tour is resumable — if interrupted, `/pf-workflow resume guided-tour` picks up where left off
- [AC7] Tour progress is visible via `/pf-workflow status guided-tour`

These tests verify the guided-tour workflow structure, step files, and CLI integration.
Tests should fail until the implementation is complete (RED state).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml
from click.testing import CliRunner

from pf.cli import cli

# Resolve paths relative to the pennyfarthing-dist directory
DIST_DIR = Path(__file__).resolve().parent.parent.parent.parent  # pennyfarthing-dist/
WORKFLOW_DIR = DIST_DIR / "workflows" / "guided-tour"
WORKFLOW_YAML = WORKFLOW_DIR / "workflow.yaml"
STEPS_DIR = WORKFLOW_DIR / "steps"

# The five required topic areas from AC2
REQUIRED_TOPICS = [
    "theme",  # theme selection
    "agent",  # agent activation
    "workflow",  # workflow basics
    "sprint",  # sprint commands
    "config",  # hook/config overview (may also match "hook")
]


@pytest.fixture
def workflow_yaml() -> dict:
    """Load and parse the guided-tour workflow YAML."""
    assert WORKFLOW_YAML.exists(), (
        f"Workflow file not found at {WORKFLOW_YAML}. Create guided-tour/workflow.yaml to proceed."
    )
    with open(WORKFLOW_YAML) as f:
        data = yaml.safe_load(f)
    assert data is not None, "Workflow YAML is empty"
    return data


@pytest.fixture
def workflow_config(workflow_yaml: dict) -> dict:
    """Extract the 'workflow:' block from the YAML."""
    assert "workflow" in workflow_yaml, "YAML must have top-level 'workflow:' key"
    return workflow_yaml["workflow"]


@pytest.fixture
def step_files() -> list[Path]:
    """Collect all step markdown files from the steps directory."""
    assert STEPS_DIR.is_dir(), (
        f"Steps directory not found at {STEPS_DIR}. Create guided-tour/steps/ with step files."
    )
    files = sorted(STEPS_DIR.glob("step-*.md"))
    assert len(files) > 0, "No step files found in steps directory"
    return files


@pytest.fixture
def runner() -> CliRunner:
    """Create a CLI test runner."""
    return CliRunner()


# ============================================================================
# AC1: Workflow Definition
# ============================================================================


class TestWorkflowDefinition:
    """AC1: Guided tour is a BikeLane stepped workflow."""

    def test_workflow_directory_exists(self) -> None:
        """AC1: guided-tour/ directory should exist under workflows/."""
        assert WORKFLOW_DIR.is_dir(), f"Expected workflow directory at {WORKFLOW_DIR}"

    def test_workflow_yaml_exists(self) -> None:
        """AC1: workflow.yaml should exist in guided-tour/."""
        assert WORKFLOW_YAML.is_file(), f"Expected workflow.yaml at {WORKFLOW_YAML}"

    def test_workflow_name_is_guided_tour(self, workflow_config: dict) -> None:
        """AC1: workflow.name should be 'guided-tour'."""
        assert workflow_config.get("name") == "guided-tour", (
            f"Expected name 'guided-tour', got '{workflow_config.get('name')}'"
        )

    def test_workflow_type_is_stepped(self, workflow_config: dict) -> None:
        """AC1: workflow.type should be 'stepped'."""
        assert workflow_config.get("type") == "stepped", (
            f"Expected type 'stepped', got '{workflow_config.get('type')}'"
        )

    def test_workflow_has_steps_config(self, workflow_config: dict) -> None:
        """AC1: workflow should have steps.path and steps.pattern."""
        steps = workflow_config.get("steps", {})
        assert "path" in steps, "Workflow must define steps.path"
        assert "pattern" in steps, "Workflow must define steps.pattern"

    def test_workflow_has_agent(self, workflow_config: dict) -> None:
        """AC1: workflow should have an assigned agent."""
        assert "agent" in workflow_config, "Workflow must define an agent"
        assert workflow_config["agent"], "Agent must not be empty"

    def test_workflow_has_description(self, workflow_config: dict) -> None:
        """AC1: workflow should have a description."""
        desc = workflow_config.get("description", "")
        assert desc, "Workflow should have a description"
        assert len(desc) > 20, "Description should be meaningful (>20 chars)"

    def test_steps_directory_exists(self) -> None:
        """AC1: steps/ directory should exist under guided-tour/."""
        assert STEPS_DIR.is_dir(), f"Expected steps directory at {STEPS_DIR}"


# ============================================================================
# AC2: Topic Coverage
# ============================================================================


class TestTopicCoverage:
    """AC2: Tour covers all five required topic areas."""

    def test_minimum_step_count(self, step_files: list[Path]) -> None:
        """AC2: Tour should have at least 5 steps (one per topic area)."""
        assert len(step_files) >= 5, f"Expected at least 5 step files, found {len(step_files)}"

    def test_step_files_follow_naming_pattern(self, step_files: list[Path]) -> None:
        """AC2: Step files should follow step-{nn}-{name}.md pattern."""
        pattern = re.compile(r"^step-\d{2}-.+\.md$")
        for f in step_files:
            assert pattern.match(f.name), (
                f"Step file '{f.name}' doesn't match pattern step-NN-name.md"
            )

    def test_covers_theme_selection(self, step_files: list[Path]) -> None:
        """AC2: A step should cover theme selection."""
        combined = " ".join(f.read_text().lower() for f in step_files)
        assert "theme" in combined, (
            "No step file mentions 'theme' — theme selection topic is missing"
        )

    def test_covers_agent_activation(self, step_files: list[Path]) -> None:
        """AC2: A step should cover agent activation."""
        combined = " ".join(f.read_text().lower() for f in step_files)
        assert "agent" in combined, (
            "No step file mentions 'agent' — agent activation topic is missing"
        )

    def test_covers_workflow_basics(self, step_files: list[Path]) -> None:
        """AC2: A step should cover workflow basics."""
        combined = " ".join(f.read_text().lower() for f in step_files)
        assert "workflow" in combined, (
            "No step file mentions 'workflow' — workflow basics topic is missing"
        )

    def test_covers_sprint_commands(self, step_files: list[Path]) -> None:
        """AC2: A step should cover sprint commands."""
        combined = " ".join(f.read_text().lower() for f in step_files)
        assert "sprint" in combined, (
            "No step file mentions 'sprint' — sprint commands topic is missing"
        )

    def test_covers_hook_config_overview(self, step_files: list[Path]) -> None:
        """AC2: A step should cover hook/config overview."""
        combined = " ".join(f.read_text().lower() for f in step_files)
        has_hook = "hook" in combined
        has_config = "config" in combined
        assert has_hook or has_config, (
            "No step file mentions 'hook' or 'config' — hook/config overview topic is missing"
        )


# ============================================================================
# AC3: Verification Gates
# ============================================================================


class TestVerificationGates:
    """AC3: Each step has a verification gate."""

    def test_workflow_has_gates_config(self, workflow_config: dict) -> None:
        """AC3: Workflow YAML should define gates configuration."""
        assert "gates" in workflow_config, "Workflow must define gates configuration"

    def test_gates_has_after_steps(self, workflow_config: dict) -> None:
        """AC3: Gates should specify after_steps list."""
        gates = workflow_config.get("gates", {})
        assert "after_steps" in gates, "Gates must define after_steps list"
        assert isinstance(gates["after_steps"], list), "after_steps must be a list"
        assert len(gates["after_steps"]) > 0, "after_steps must not be empty"

    def test_step_files_have_gate_sections(self, step_files: list[Path]) -> None:
        """AC3: Each step should have a <gate> section with completion criteria."""
        for f in step_files:
            content = f.read_text()
            assert "<gate>" in content, (
                f"Step {f.name} is missing <gate> section — every step needs a verification gate"
            )
            assert "</gate>" in content, f"Step {f.name} has unclosed <gate> tag"

    def test_gate_sections_have_criteria(self, step_files: list[Path]) -> None:
        """AC3: Gate sections should contain checkable criteria."""
        for f in step_files:
            content = f.read_text()
            # Extract gate content
            gate_match = re.search(r"<gate>(.*?)</gate>", content, re.DOTALL)
            if gate_match:
                gate_content = gate_match.group(1)
                # Should have at least one checkbox or criterion
                has_checkbox = "- [" in gate_content
                has_criterion = (
                    "criterion" in gate_content.lower() or len(gate_content.strip()) > 10
                )
                assert has_checkbox or has_criterion, (
                    f"Step {f.name} gate section has no checkable criteria"
                )


# ============================================================================
# AC4: CLI Start Command
# ============================================================================


class TestCLIStart:
    """AC4: Tour can be started via /pf-workflow start guided-tour."""

    def test_guided_tour_appears_in_workflow_list(self, runner: CliRunner) -> None:
        """AC4: guided-tour should appear in pf workflow list output."""
        result = runner.invoke(cli, ["workflow", "list"])
        assert result.exit_code == 0
        assert "guided-tour" in result.output, "guided-tour workflow not found in workflow list"

    def test_guided_tour_listed_as_stepped(self, runner: CliRunner) -> None:
        """AC4: guided-tour should be listed as 'stepped' type."""
        result = runner.invoke(cli, ["workflow", "list"])
        assert result.exit_code == 0

        tour_line = None
        for line in result.output.splitlines():
            if "guided-tour" in line and "|" in line:
                tour_line = line
                break

        assert tour_line is not None, "guided-tour not found as a table row in workflow list"
        assert "stepped" in tour_line.lower(), "guided-tour should be listed as 'stepped' type"

    def test_workflow_show_guided_tour(self, runner: CliRunner) -> None:
        """AC4: pf workflow show guided-tour should display details."""
        result = runner.invoke(cli, ["workflow", "show", "guided-tour"])
        assert result.exit_code == 0
        assert "guided-tour" in result.output.lower()


# ============================================================================
# AC5: Integration with Onboarding Stories
# ============================================================================


class TestOnboardingIntegration:
    """AC5: Tour integrates with getting-started guide and welcome nudge."""

    def test_workflow_description_mentions_onboarding(self, workflow_config: dict) -> None:
        """AC5: Workflow description should reference onboarding or discovery."""
        desc = workflow_config.get("description", "").lower()
        onboarding_terms = ["onboarding", "getting started", "discovery", "new user", "tour"]
        assert any(term in desc for term in onboarding_terms), (
            "Workflow description should reference onboarding/discovery"
        )

    def test_step_references_help_command(self, step_files: list[Path]) -> None:
        """AC5: At least one step should reference /pf-help or getting-started."""
        combined = " ".join(f.read_text() for f in step_files)
        has_help = "/pf-help" in combined
        has_guide = "getting-started" in combined.lower() or "getting started" in combined.lower()
        assert has_help or has_guide, (
            "No step references /pf-help or getting-started guide — "
            "integration with onboarding stories is missing"
        )

    def test_workflow_has_onboarding_triggers(self, workflow_config: dict) -> None:
        """AC5: Workflow should have trigger tags for onboarding discovery."""
        triggers = workflow_config.get("triggers", {})
        tags = triggers.get("tags", [])
        types = triggers.get("types", [])
        all_triggers = [str(t).lower() for t in tags + types]
        onboarding_terms = ["onboarding", "tour", "guided-tour", "discovery", "getting-started"]
        assert any(term in all_triggers for term in onboarding_terms), (
            f"Workflow triggers {all_triggers} should include onboarding-related terms"
        )


# ============================================================================
# AC6: Resumability
# ============================================================================


class TestResumability:
    """AC6: Tour is resumable after interruption."""

    def test_steps_have_sequential_numbering(self, step_files: list[Path]) -> None:
        """AC6: Steps should have sequential numbers for resume tracking."""
        numbers = []
        for f in step_files:
            match = re.match(r"step-(\d{2})-", f.name)
            assert match, f"Cannot extract step number from {f.name}"
            numbers.append(int(match.group(1)))

        # Should be sequential starting from 1
        expected = list(range(1, len(numbers) + 1))
        assert numbers == expected, f"Step numbers {numbers} should be sequential {expected}"

    def test_steps_have_meta_with_next(self, step_files: list[Path]) -> None:
        """AC6: Non-final steps with <step-meta> should have 'next' field.

        step-meta is optional — steps without it are skipped.
        """
        for f in step_files[:-1]:  # All except last
            content = f.read_text()
            meta_match = re.search(r"<step-meta>(.*?)</step-meta>", content, re.DOTALL)
            if not meta_match:
                continue  # step-meta is optional
            meta_content = meta_match.group(1)
            assert "next:" in meta_content, (
                f"Step {f.name} meta is missing 'next:' field for resume navigation"
            )

    def test_final_step_has_next_complete(self, step_files: list[Path]) -> None:
        """AC6: Final step should use 'next: complete' sentinel."""
        final = step_files[-1]
        content = final.read_text()
        meta_match = re.search(r"<step-meta>(.*?)</step-meta>", content, re.DOTALL)
        assert meta_match, f"Final step {final.name} missing <step-meta>"
        meta_content = meta_match.group(1)
        assert "next: complete" in meta_content, (
            f"Final step {final.name} should have 'next: complete' sentinel"
        )


# ============================================================================
# AC7: Progress Visibility (via workflow status)
# ============================================================================


class TestProgressVisibility:
    """AC7: Tour progress is visible via /pf-workflow status guided-tour."""

    def test_workflow_has_collaboration_menus(self, workflow_config: dict) -> None:
        """AC7: Workflow should define collaboration menus for user interaction."""
        collab = workflow_config.get("collaboration", {})
        menus = collab.get("menus", [])
        assert len(menus) > 0, "Workflow should define collaboration menus"

    def test_collaboration_has_continue_option(self, workflow_config: dict) -> None:
        """AC7: Collaboration menus should include a Continue option."""
        collab = workflow_config.get("collaboration", {})
        menus = collab.get("menus", [])
        menu_names = [m.get("name", "").lower() for m in menus]
        assert "continue" in menu_names, "Collaboration menus should include a 'Continue' option"

    def test_steps_have_step_meta_number(self, step_files: list[Path]) -> None:
        """AC7: Steps with <step-meta> should include a step number.

        step-meta is optional — steps without it are skipped.
        """
        for f in step_files:
            content = f.read_text()
            meta_match = re.search(r"<step-meta>(.*?)</step-meta>", content, re.DOTALL)
            if not meta_match:
                continue  # step-meta is optional
            meta_content = meta_match.group(1)
            assert re.search(r"step:\s*\d+", meta_content), (
                f"Step {f.name} meta missing 'step: N' for progress tracking"
            )


# ============================================================================
# Structural Integrity
# ============================================================================


class TestStepStructure:
    """Verify step files have required XML sections."""

    def test_steps_have_purpose(self, step_files: list[Path]) -> None:
        """Steps should have <purpose> sections."""
        for f in step_files:
            content = f.read_text()
            assert "<purpose>" in content, f"Step {f.name} missing <purpose> section"

    def test_steps_have_instructions(self, step_files: list[Path]) -> None:
        """Steps should have <instructions> sections."""
        for f in step_files:
            content = f.read_text()
            assert "<instructions>" in content, f"Step {f.name} missing <instructions> section"

    def test_steps_have_collaboration_menu_or_switch(self, step_files: list[Path]) -> None:
        """Steps should have <collaboration-menu> or <switch> sections.

        <switch> with attributes (e.g. <switch tool="AskUserQuestion">) replaces
        <collaboration-menu> in updated steps.
        """
        for f in step_files:
            content = f.read_text()
            has_collab = "<collaboration-menu>" in content
            has_switch = "<switch" in content
            assert has_collab or has_switch, (
                f"Step {f.name} missing both <collaboration-menu> and <switch> section"
            )

    def test_steps_have_markdown_title(self, step_files: list[Path]) -> None:
        """Steps should start with a markdown H1 title."""
        for f in step_files:
            content = f.read_text().strip()
            assert content.startswith("# "), f"Step {f.name} should start with '# Title'"
