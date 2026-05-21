"""Tests for guided-tour enhancements: interactive deep-dives and switch gates.

Story: 132-7 / PROJ-15642 — Enhance guided tour with interactive deep-dives and switch gates
Epic: 132 / PROJ-15616 (Developer Discovery & Onboarding)

Acceptance Criteria:
- [AC1] All agent commands in step files use /pf- prefix
- [AC2] Step 3 lists all 11 agents with correct commands, roles, and theme characters
- [AC3] Every step has a Dig In option that opens an interactive deep-dive sub-loop
- [AC4] All collaboration menus drive AskUserQuestion, not plain text prompts
- [AC5] Step 4 deep-dive covers YAML shard structure, epic files, archive, Jira sync, story lifecycle
- [AC6] Step 5 deep-dive covers individual hooks, permission modes, relay/bell mode with examples
- [AC7] New <switch> gate type in BikeLane schema maps menu options to AskUserQuestion choices
- [AC8] Stepped workflow engine recognizes <switch> gates and agents translate to AskUserQuestion
- [AC9] Existing guided-tour step gates updated to use <switch> where appropriate

Tests should fail until the implementation is complete (RED state).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from pf.common.config import get_dist_root

# Resolve paths relative to the plugin root (content root)
DIST_DIR = get_dist_root()
WORKFLOW_DIR = DIST_DIR / "workflows" / "guided-tour"
WORKFLOW_YAML = WORKFLOW_DIR / "workflow.yaml"
STEPS_DIR = WORKFLOW_DIR / "steps"

# All 11 agent slash commands with /pf- prefix
ALL_AGENT_COMMANDS = [
    "/pf-sm",
    "/pf-tea",
    "/pf-dev",
    "/pf-reviewer",
    "/pf-architect",
    "/pf-pm",
    "/pf-tech-writer",
    "/pf-ux-designer",
    "/pf-devops",
    "/pf-ba",
    "/pf-orchestrator",
]

# Unprefixed agent commands that should NOT appear
UNPREFIXED_AGENT_COMMANDS = [
    "/sm",
    "/tea",
    "/dev",
    "/reviewer",
    "/architect",
    "/pm",
    "/tech-writer",
    "/ux-designer",
    "/devops",
    "/ba",
    "/orchestrator",
]


@pytest.fixture
def workflow_yaml() -> dict:
    """Load and parse the guided-tour workflow YAML."""
    assert WORKFLOW_YAML.exists(), f"Workflow file not found at {WORKFLOW_YAML}"
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
    assert STEPS_DIR.is_dir(), f"Steps directory not found at {STEPS_DIR}"
    files = sorted(STEPS_DIR.glob("step-*.md"))
    assert len(files) > 0, "No step files found in steps directory"
    return files


@pytest.fixture
def step_03_content() -> str:
    """Read step-03-agents.md content."""
    path = STEPS_DIR / "step-03-agents.md"
    assert path.exists(), "step-03-agents.md not found"
    return path.read_text()


@pytest.fixture
def step_04_content() -> str:
    """Read step-04-sprint.md content."""
    path = STEPS_DIR / "step-04-sprint.md"
    assert path.exists(), "step-04-sprint.md not found"
    return path.read_text()


@pytest.fixture
def step_05_content() -> str:
    """Read step-05-config.md content."""
    path = STEPS_DIR / "step-05-config.md"
    assert path.exists(), "step-05-config.md not found"
    return path.read_text()


# ============================================================================
# AC1: Agent commands use /pf- prefix
# ============================================================================


class TestCommandPrefix:
    """AC1: All agent commands in step files use /pf- prefix."""

    def test_no_unprefixed_slash_sm(self, step_files: list[Path]) -> None:
        """AC1: No step should use `/sm` instead of `/pf-sm`."""
        for f in step_files:
            content = f.read_text()
            # Match `/sm` that is NOT preceded by /pf-
            # Use word boundary: `/sm` followed by space, backtick, pipe, or end
            matches = re.findall(r"(?<!/pf-)`?/sm`?(?=[\s|`\)])", content)
            assert len(matches) == 0, f"Step {f.name} uses unprefixed '/sm' — should be '/pf-sm'"

    def test_no_unprefixed_slash_dev(self, step_files: list[Path]) -> None:
        """AC1: No step should use `/dev` instead of `/pf-dev`."""
        for f in step_files:
            content = f.read_text()
            matches = re.findall(r"(?<!/pf-)`?/dev`?(?=[\s|`\)])", content)
            assert len(matches) == 0, f"Step {f.name} uses unprefixed '/dev' — should be '/pf-dev'"

    def test_no_unprefixed_slash_tea(self, step_files: list[Path]) -> None:
        """AC1: No step should use `/tea` instead of `/pf-tea`."""
        for f in step_files:
            content = f.read_text()
            matches = re.findall(r"(?<!/pf-)`?/tea`?(?=[\s|`\)])", content)
            assert len(matches) == 0, f"Step {f.name} uses unprefixed '/tea' — should be '/pf-tea'"

    def test_no_unprefixed_slash_reviewer(self, step_files: list[Path]) -> None:
        """AC1: No step should use `/reviewer` instead of `/pf-reviewer`."""
        for f in step_files:
            content = f.read_text()
            matches = re.findall(r"(?<!/pf-)`?/reviewer`?(?=[\s|`\)])", content)
            assert len(matches) == 0, (
                f"Step {f.name} uses unprefixed '/reviewer' — should be '/pf-reviewer'"
            )

    def test_no_unprefixed_slash_architect(self, step_files: list[Path]) -> None:
        """AC1: No step should use `/architect` instead of `/pf-architect`."""
        for f in step_files:
            content = f.read_text()
            matches = re.findall(r"(?<!/pf-)`?/architect`?(?=[\s|`\)])", content)
            assert len(matches) == 0, (
                f"Step {f.name} uses unprefixed '/architect' — should be '/pf-architect'"
            )

    def test_step_03_actions_use_prefix(self, step_03_content: str) -> None:
        """AC1: Step 03 actions section should use /pf- prefixed commands."""
        actions_match = re.search(r"<actions>(.*?)</actions>", step_03_content, re.DOTALL)
        assert actions_match, "Step 03 missing <actions> section"
        actions = actions_match.group(1)
        # Should NOT have unprefixed agent commands in actions
        for cmd in UNPREFIXED_AGENT_COMMANDS:
            # Only flag if the unprefixed version appears without /pf- before it
            pattern = rf"(?<!/pf-)`?{re.escape(cmd)}`?"
            if re.search(pattern, actions):
                raise AssertionError(
                    f"Step 03 actions uses '{cmd}' — should be '/pf-{cmd.lstrip('/')}'"
                )


# ============================================================================
# AC2: Step 3 lists all 11 agents
# ============================================================================


class TestFullAgentRoster:
    """AC2: Step 3 lists all 11 agents with correct commands, roles, and theme characters."""

    def test_step_03_lists_eleven_agents(self, step_03_content: str) -> None:
        """AC2: Step 03 agent table should list all 11 agents."""
        # Count rows in the agent table (lines with | that contain /pf: prefix)
        agent_rows = re.findall(r"\|.*?/pf[:-]\w+.*?\|", step_03_content)
        assert len(agent_rows) >= 11, f"Step 03 lists {len(agent_rows)} agents — should list all 11"

    def test_step_03_has_sm(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:sm or /pf-sm."""
        assert "/pf:sm" in step_03_content or "/pf-sm" in step_03_content, "Step 03 missing sm agent"

    def test_step_03_has_tea(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:tea or /pf-tea."""
        assert "/pf:tea" in step_03_content or "/pf-tea" in step_03_content, "Step 03 missing tea agent"

    def test_step_03_has_dev(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:dev or /pf-dev."""
        assert "/pf:dev" in step_03_content or "/pf-dev" in step_03_content, "Step 03 missing dev agent"

    def test_step_03_has_reviewer(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:reviewer or /pf-reviewer."""
        assert "/pf:reviewer" in step_03_content or "/pf-reviewer" in step_03_content, "Step 03 missing reviewer agent"

    def test_step_03_has_architect(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:architect or /pf-architect."""
        assert "/pf:architect" in step_03_content or "/pf-architect" in step_03_content, "Step 03 missing architect agent"

    def test_step_03_has_pm(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:pm or /pf-pm."""
        assert "/pf:pm" in step_03_content or "/pf-pm" in step_03_content, "Step 03 missing pm agent"

    def test_step_03_has_tech_writer(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:tech-writer or /pf-tech-writer."""
        assert "/pf:tech-writer" in step_03_content or "/pf-tech-writer" in step_03_content, "Step 03 missing tech-writer agent"

    def test_step_03_has_ux_designer(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:ux-designer or /pf-ux-designer."""
        assert "/pf:ux-designer" in step_03_content or "/pf-ux-designer" in step_03_content, "Step 03 missing ux-designer agent"

    def test_step_03_has_devops(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:devops or /pf-devops."""
        assert "/pf:devops" in step_03_content or "/pf-devops" in step_03_content, "Step 03 missing devops agent"

    def test_step_03_has_ba(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:ba or /pf-ba."""
        assert "/pf:ba" in step_03_content or "/pf-ba" in step_03_content, "Step 03 missing ba agent"

    def test_step_03_has_orchestrator(self, step_03_content: str) -> None:
        """AC2: Step 03 should list /pf:orchestrator or /pf-orchestrator."""
        assert "/pf:orchestrator" in step_03_content or "/pf-orchestrator" in step_03_content, "Step 03 missing orchestrator agent"


# ============================================================================
# AC3: Every step has a Dig In option
# ============================================================================


class TestDigInOption:
    """AC3: Every step has a Dig In option for interactive deep-dive."""

    def test_all_steps_have_dig_in(self, step_files: list[Path]) -> None:
        """AC3: Every step should include a Dig In option.

        Dig In may appear in <collaboration-menu> or inside a <switch> element
        (as a <case value="dig-in"> or similar).
        """
        for f in step_files:
            content = f.read_text()
            # Check collaboration-menu first, then fall back to switch block
            menu_match = re.search(
                r"<collaboration-menu>(.*?)</collaboration-menu>",
                content,
                re.DOTALL,
            )
            switch_match = re.search(
                r"<switch\b[^>]*>(.*?)</switch>",
                content,
                re.DOTALL,
            )
            has_dig = False
            if menu_match and "dig in" in menu_match.group(1).lower():
                has_dig = True
            if switch_match and "dig-in" in switch_match.group(1).lower():
                has_dig = True
            assert has_dig, (
                f"Step {f.name} missing 'Dig In' option in <collaboration-menu> or <switch>"
            )

    def test_dig_in_has_description(self, step_files: list[Path]) -> None:
        """AC3: Dig In option should have a meaningful description."""
        for f in step_files:
            content = f.read_text()
            menu_match = re.search(
                r"<collaboration-menu>(.*?)</collaboration-menu>",
                content,
                re.DOTALL,
            )
            if menu_match:
                menu = menu_match.group(1)
                # Find the Dig In line and check it has description after —
                dig_line = [line for line in menu.splitlines() if "dig in" in line.lower()]
                assert len(dig_line) > 0, f"Step {f.name} missing Dig In menu entry"
                assert "—" in dig_line[0] or "-" in dig_line[0], (
                    f"Step {f.name} Dig In option missing description"
                )


# ============================================================================
# AC4: Collaboration menus use <switch> (not plain text)
# ============================================================================


class TestSwitchGateMenus:
    """AC4: All collaboration menus drive AskUserQuestion via <switch> gates."""

    def test_all_steps_have_switch_gate(self, step_files: list[Path]) -> None:
        """AC4: Every step should have a <switch> section for interactive menus.

        <switch> may have attributes (e.g. <switch tool="AskUserQuestion">).
        """
        for f in step_files:
            content = f.read_text()
            assert "<switch" in content, (
                f"Step {f.name} missing <switch> gate — "
                "collaboration menus should use <switch> for AskUserQuestion"
            )
            assert "</switch>" in content, f"Step {f.name} has unclosed <switch> tag"

    def test_switch_has_options(self, step_files: list[Path]) -> None:
        """AC4: <switch> sections should define selectable options."""
        for f in step_files:
            content = f.read_text()
            switch_match = re.search(r"<switch>(.*?)</switch>", content, re.DOTALL)
            if switch_match:
                switch_content = switch_match.group(1)
                # Should have option entries
                options = re.findall(r"<option\b", switch_content)
                assert len(options) >= 2, (
                    f"Step {f.name} <switch> should have at least 2 options, found {len(options)}"
                )

    def test_switch_options_have_labels(self, step_files: list[Path]) -> None:
        """AC4: Each <option> in <switch> should have a label attribute."""
        for f in step_files:
            content = f.read_text()
            switch_match = re.search(r"<switch>(.*?)</switch>", content, re.DOTALL)
            if switch_match:
                switch_content = switch_match.group(1)
                options = re.findall(r"<option\b([^>]*)>", switch_content)
                for opt_attrs in options:
                    assert "label=" in opt_attrs, f"Step {f.name} <option> missing label attribute"

    def test_switch_options_have_descriptions(self, step_files: list[Path]) -> None:
        """AC4: Each <option> should have a description attribute."""
        for f in step_files:
            content = f.read_text()
            switch_match = re.search(r"<switch>(.*?)</switch>", content, re.DOTALL)
            if switch_match:
                switch_content = switch_match.group(1)
                options = re.findall(r"<option\b([^>]*)>", switch_content)
                for opt_attrs in options:
                    assert "description=" in opt_attrs, (
                        f"Step {f.name} <option> missing description attribute"
                    )

    def test_no_bracket_c_menus(self, step_files: list[Path]) -> None:
        """AC4: Steps should not use [C]/[T]/[H]/[S] text-based menu patterns."""
        for f in step_files:
            content = f.read_text()
            menu_match = re.search(
                r"<collaboration-menu>(.*?)</collaboration-menu>",
                content,
                re.DOTALL,
            )
            if menu_match:
                menu = menu_match.group(1)
                bracket_pattern = re.findall(r"\*\*\[[A-Z]\]", menu)
                assert len(bracket_pattern) == 0, (
                    f"Step {f.name} uses text-based **[X]** menu pattern — "
                    "should use <switch> gate with <option> elements instead"
                )


# ============================================================================
# AC5: Step 4 deep-dive content (sprint details)
# ============================================================================


class TestSprintDeepDive:
    """AC5: Step 4 deep-dive covers YAML shard structure, epic files, archive, Jira sync, story lifecycle."""

    def test_step_04_mentions_yaml_shards(self, step_04_content: str) -> None:
        """AC5: Step 04 should explain YAML shard structure."""
        content_lower = step_04_content.lower()
        assert "shard" in content_lower, "Step 04 missing explanation of YAML shard structure"

    def test_step_04_mentions_epic_files(self, step_04_content: str) -> None:
        """AC5: Step 04 should reference epic shard files (epic-*.yaml)."""
        assert "epic-" in step_04_content.lower() or "epic shard" in step_04_content.lower(), (
            "Step 04 missing reference to epic shard files (epic-*.yaml)"
        )

    def test_step_04_mentions_archive(self, step_04_content: str) -> None:
        """AC5: Step 04 should explain the archive process."""
        assert "archive" in step_04_content.lower(), (
            "Step 04 missing explanation of story archive process"
        )

    def test_step_04_mentions_jira_sync(self, step_04_content: str) -> None:
        """AC5: Step 04 should cover Jira synchronization."""
        content_lower = step_04_content.lower()
        has_jira_sync = "jira sync" in content_lower or "jira reconcile" in content_lower
        has_bidirectional = "bidirectional" in content_lower
        assert has_jira_sync or has_bidirectional, (
            "Step 04 missing explanation of Jira sync/reconcile"
        )

    def test_step_04_mentions_story_lifecycle(self, step_04_content: str) -> None:
        """AC5: Step 04 should explain the full story lifecycle."""
        content_lower = step_04_content.lower()
        lifecycle_terms = ["backlog", "in_progress", "done", "archived"]
        found = [term for term in lifecycle_terms if term in content_lower]
        assert len(found) >= 3, (
            f"Step 04 only mentions {found} — should cover full lifecycle: {lifecycle_terms}"
        )

    def test_step_04_mentions_current_sprint_yaml(self, step_04_content: str) -> None:
        """AC5: Step 04 should reference current-sprint.yaml as the index file."""
        assert "current-sprint.yaml" in step_04_content, (
            "Step 04 missing reference to current-sprint.yaml index file"
        )


# ============================================================================
# AC6: Step 5 deep-dive content (hooks and config)
# ============================================================================


class TestConfigDeepDive:
    """AC6: Step 5 deep-dive covers individual hooks, permission modes, relay/bell mode."""

    def test_step_05_mentions_permission_mode(self, step_05_content: str) -> None:
        """AC6: Step 05 should explain permission_mode options."""
        assert "permission_mode" in step_05_content, (
            "Step 05 missing explanation of permission_mode"
        )

    def test_step_05_mentions_relay_mode(self, step_05_content: str) -> None:
        """AC6: Step 05 should explain relay_mode for auto-handoff."""
        assert "relay_mode" in step_05_content, "Step 05 missing explanation of relay_mode"

    def test_step_05_mentions_bell_mode(self, step_05_content: str) -> None:
        """AC6: Step 05 should explain bell_mode for message injection."""
        assert "bell_mode" in step_05_content, "Step 05 missing explanation of bell_mode"

    def test_step_05_explains_session_start_hook(self, step_05_content: str) -> None:
        """AC6: Step 05 should explain the session-start hook in detail."""
        content_lower = step_05_content.lower()
        assert "session-start" in content_lower or "session_start" in content_lower, (
            "Step 05 missing detailed explanation of session-start hook"
        )
        # Should explain what it does, not just list it
        assert (
            "welcome" in content_lower or "banner" in content_lower or "setup" in content_lower
        ), "Step 05 should explain what session-start hook does (setup, welcome)"

    def test_step_05_explains_pre_edit_check(self, step_05_content: str) -> None:
        """AC6: Step 05 should explain the pre-edit-check hook."""
        content_lower = step_05_content.lower()
        assert "pre-edit-check" in content_lower or "pre_edit_check" in content_lower, (
            "Step 05 missing explanation of pre-edit-check hook"
        )

    def test_step_05_has_config_examples(self, step_05_content: str) -> None:
        """AC6: Step 05 should include configuration examples."""
        # Should have YAML code blocks showing config
        has_yaml_block = "```yaml" in step_05_content or "```yml" in step_05_content
        has_config_example = "theme:" in step_05_content and "workflow:" in step_05_content
        assert has_yaml_block and has_config_example, (
            "Step 05 should include YAML configuration examples"
        )

    def test_step_05_explains_permission_mode_options(self, step_05_content: str) -> None:
        """AC6: Step 05 should list permission_mode options (plan, manual, accept)."""
        content_lower = step_05_content.lower()
        options = ["plan", "manual", "accept"]
        found = [opt for opt in options if opt in content_lower]
        assert len(found) >= 3, (
            f"Step 05 only mentions {found} — should list all permission_mode options: {options}"
        )


# ============================================================================
# AC7: New <switch> gate type in workflow YAML
# ============================================================================


class TestSwitchGateSchema:
    """AC7: New <switch> gate type in BikeLane schema maps menu options to AskUserQuestion."""

    def test_workflow_collaboration_has_switch_type(self, workflow_config: dict) -> None:
        """AC7: Workflow YAML collaboration should reference switch gate type."""
        collab = workflow_config.get("collaboration", {})
        gate_type = collab.get("gate_type", "")
        assert gate_type == "switch", (
            f"Workflow collaboration.gate_type should be 'switch', got '{gate_type}'"
        )

    def test_workflow_menus_have_action_field(self, workflow_config: dict) -> None:
        """AC7: Each menu option should have an action field for routing."""
        collab = workflow_config.get("collaboration", {})
        menus = collab.get("menus", [])
        for menu in menus:
            assert "action" in menu, (
                f"Menu '{menu.get('name', '?')}' missing 'action' field for switch routing"
            )

    def test_workflow_has_dig_in_menu(self, workflow_config: dict) -> None:
        """AC7: Workflow collaboration menus should include a 'Dig In' option."""
        collab = workflow_config.get("collaboration", {})
        menus = collab.get("menus", [])
        menu_names = [m.get("name", "").lower() for m in menus]
        assert "dig in" in menu_names, f"Collaboration menus {menu_names} should include 'Dig In'"


# ============================================================================
# AC8: Engine recognizes <switch> gates
# ============================================================================


class TestSwitchGateEngine:
    """AC8: Stepped workflow engine recognizes <switch> gates."""

    def test_switch_options_have_action_types(self, step_files: list[Path]) -> None:
        """AC8: <option> elements should have action= attribute for engine routing."""
        for f in step_files:
            content = f.read_text()
            switch_match = re.search(r"<switch>(.*?)</switch>", content, re.DOTALL)
            if switch_match:
                options = re.findall(r"<option\b([^>]*)>", switch_match.group(1))
                for opt_attrs in options:
                    assert "action=" in opt_attrs, (
                        f"Step {f.name} <option> missing action= attribute for engine routing"
                    )

    def test_switch_has_continue_action(self, step_files: list[Path]) -> None:
        """AC8: Every <switch> should have a continue action option."""
        for f in step_files:
            content = f.read_text()
            switch_match = re.search(r"<switch>(.*?)</switch>", content, re.DOTALL)
            if switch_match:
                switch_content = switch_match.group(1).lower()
                assert (
                    'action="continue"' in switch_content or "action='continue'" in switch_content
                ), f'Step {f.name} <switch> missing action="continue" option'

    def test_switch_has_deep_dive_action(self, step_files: list[Path]) -> None:
        """AC8: Every <switch> should have a deep-dive action option."""
        for f in step_files:
            content = f.read_text()
            switch_match = re.search(r"<switch>(.*?)</switch>", content, re.DOTALL)
            if switch_match:
                switch_content = switch_match.group(1).lower()
                has_dig = 'action="dig-in"' in switch_content or "action='dig-in'" in switch_content
                has_deep = (
                    'action="deep-dive"' in switch_content or "action='deep-dive'" in switch_content
                )
                assert has_dig or has_deep, (
                    f"Step {f.name} <switch> missing dig-in/deep-dive action"
                )


# ============================================================================
# AC9: Existing guided-tour gates updated to use <switch>
# ============================================================================


class TestExistingGatesUpdated:
    """AC9: Existing guided-tour step gates updated to use <switch>."""

    def test_step_01_has_switch(self) -> None:
        """AC9: step-01-welcome.md should have <switch> gate.

        <switch> may have attributes (e.g. <switch tool="AskUserQuestion">).
        """
        path = STEPS_DIR / "step-01-welcome.md"
        assert path.exists(), "step-01-welcome.md not found"
        content = path.read_text()
        assert "<switch" in content, "step-01-welcome.md should be updated with <switch> gate"

    def test_step_02_has_switch(self) -> None:
        """AC9: step-02-themes.md should have <switch> gate.

        <switch> may have attributes (e.g. <switch tool="AskUserQuestion">).
        """
        path = STEPS_DIR / "step-02-themes.md"
        assert path.exists(), "step-02-themes.md not found"
        content = path.read_text()
        assert "<switch" in content, "step-02-themes.md should be updated with <switch> gate"

    def test_step_03_has_switch(self) -> None:
        """AC9: step-03-agents.md should have <switch> gate.

        <switch> may have attributes (e.g. <switch tool="AskUserQuestion">).
        """
        path = STEPS_DIR / "step-03-agents.md"
        assert path.exists(), "step-03-agents.md not found"
        content = path.read_text()
        assert "<switch" in content, "step-03-agents.md should be updated with <switch> gate"

    def test_step_04_has_switch(self) -> None:
        """AC9: step-04-sprint.md should have <switch> gate.

        <switch> may have attributes (e.g. <switch tool="AskUserQuestion">).
        """
        path = STEPS_DIR / "step-04-sprint.md"
        assert path.exists(), "step-04-sprint.md not found"
        content = path.read_text()
        assert "<switch" in content, "step-04-sprint.md should be updated with <switch> gate"

    def test_step_05_has_switch(self) -> None:
        """AC9: step-05-config.md should have <switch> gate.

        <switch> may have attributes (e.g. <switch tool="AskUserQuestion">).
        """
        path = STEPS_DIR / "step-05-config.md"
        assert path.exists(), "step-05-config.md not found"
        content = path.read_text()
        assert "<switch" in content, "step-05-config.md should be updated with <switch> gate"

    def test_switch_replaces_text_menus(self, step_files: list[Path]) -> None:
        """AC9: Steps with <switch> should not also have text-based [X] menus."""
        for f in step_files:
            content = f.read_text()
            if "<switch>" in content:
                menu_match = re.search(
                    r"<collaboration-menu>(.*?)</collaboration-menu>",
                    content,
                    re.DOTALL,
                )
                if menu_match:
                    menu = menu_match.group(1)
                    bracket_entries = re.findall(r"\*\*\[[A-Z]\]", menu)
                    assert len(bracket_entries) == 0, (
                        f"Step {f.name} has both <switch> and text-based **[X]** menus — "
                        "remove text menus when using <switch>"
                    )
