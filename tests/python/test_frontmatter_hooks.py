"""
Tests for Story 126-6: Frontmatter hooks on all agents and skills.

Covers all 4 Acceptance Criteria:
  AC1: All agent .md files have frontmatter hooks for their lifecycle
  AC2: Relevant skill directories have frontmatter hooks
  AC3: settings.local.json reduced to 5 infrastructure hooks
  AC4: No functional regression — all hooks still fire correctly

Run with: python -m pytest tests/python/test_frontmatter_hooks.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from textwrap import dedent

import pytest
import yaml

PROJECT_ROOT = Path(__file__).parent.parent.parent
DIST_ROOT = PROJECT_ROOT / "pennyfarthing-dist"
sys.path.insert(0, str(PROJECT_ROOT))

from pf.hooks.frontmatter import (
    INFRASTRUCTURE_HOOKS,
    VALID_EVENTS,
    HookDeclaration,
    collect_all_frontmatter_hooks,
    count_hooks_in_settings,
    merge_with_infrastructure,
    parse_agent_hooks,
    parse_frontmatter,
    parse_skill_hooks,
    to_settings_format,
)
from pf.init.core import _MINIMAL_SETTINGS


# =============================================================================
# Fixtures
# =============================================================================


AGENT_WITH_HOOKS = dedent("""\
    ---
    hooks:
      PreToolUse:
        - command: pf hooks schema-validation
          matcher: Write
      Stop:
        - command: pf hooks reflector-check
    ---
    # Test Agent - Test Role

    <role>
    Test agent for validation testing
    </role>
""")

AGENT_WITHOUT_HOOKS = dedent("""\
    # Test Agent - No Hooks

    <role>
    Test agent without frontmatter hooks
    </role>
""")

SKILL_WITH_HOOKS = dedent("""\
    ---
    name: pf-sprint
    description: Sprint management
    hooks:
      PostToolUse:
        - command: pf hooks sprint-yaml
          matcher: Edit|Write
    ---

    # /pf-sprint - Sprint Management
""")

SKILL_WITHOUT_HOOKS = dedent("""\
    ---
    name: pf-testing
    description: Test runner
    ---

    # /pf-testing - Test Runner
""")

AGENT_WITH_MULTIPLE_HOOKS = dedent("""\
    ---
    hooks:
      SessionStart:
        - command: pf hooks auto-load-sm
      PreToolUse:
        - command: pf hooks schema-validation
          matcher: Write
        - command: pf hooks cyclist-pretooluse
      Stop:
        - command: pf hooks reflector-check
      PostToolUse:
        - command: pf hooks sprint-yaml
          matcher: Edit|Write
    ---
    # SM Agent - Scrum Master

    <role>
    Story coordination
    </role>
""")

AGENT_WITH_INVALID_EVENT = dedent("""\
    ---
    hooks:
      InvalidEvent:
        - command: pf hooks something
    ---
    # Bad Agent

    <role>
    Invalid hook event
    </role>
""")


# =============================================================================
# AC1: All agent .md files have frontmatter hooks
# =============================================================================


class TestParseAgentHooks:
    """Test parsing hook declarations from agent frontmatter."""

    def test_parse_frontmatter_extracts_yaml(self):
        """Frontmatter parser should extract YAML between --- markers."""
        fm = parse_frontmatter(AGENT_WITH_HOOKS)
        assert "hooks" in fm
        assert isinstance(fm["hooks"], dict)

    def test_parse_frontmatter_no_frontmatter(self):
        """Should return empty dict when no frontmatter."""
        fm = parse_frontmatter(AGENT_WITHOUT_HOOKS)
        assert fm == {}

    def test_parse_agent_hooks_basic(self):
        """Should extract hook declarations from agent frontmatter."""
        hooks = parse_agent_hooks(AGENT_WITH_HOOKS)
        assert len(hooks) == 2

        # Check PreToolUse hook
        pre = [h for h in hooks if h.event == "PreToolUse"]
        assert len(pre) == 1
        assert pre[0].command == "pf hooks schema-validation"
        assert pre[0].matcher == "Write"

        # Check Stop hook
        stop = [h for h in hooks if h.event == "Stop"]
        assert len(stop) == 1
        assert stop[0].command == "pf hooks reflector-check"
        assert stop[0].matcher is None

    def test_parse_agent_hooks_multiple(self):
        """Should handle multiple hooks per event type."""
        hooks = parse_agent_hooks(AGENT_WITH_MULTIPLE_HOOKS)
        assert len(hooks) == 5

        pre = [h for h in hooks if h.event == "PreToolUse"]
        assert len(pre) == 2

    def test_parse_agent_hooks_no_frontmatter(self):
        """Should return empty list when no frontmatter."""
        hooks = parse_agent_hooks(AGENT_WITHOUT_HOOKS)
        assert hooks == []

    def test_parse_agent_hooks_no_hooks_key(self):
        """Should return empty list when frontmatter has no hooks key."""
        content = "---\nname: test\n---\n# Agent\n"
        hooks = parse_agent_hooks(content)
        assert hooks == []

    def test_parse_agent_hooks_validates_event_types(self):
        """Should only accept valid Claude Code event types."""
        hooks = parse_agent_hooks(AGENT_WITH_INVALID_EVENT)
        # Invalid events should be rejected
        assert len(hooks) == 0

    def test_hook_declaration_fields(self):
        """Each HookDeclaration should have event, command, and optional matcher."""
        hooks = parse_agent_hooks(AGENT_WITH_HOOKS)
        for hook in hooks:
            assert isinstance(hook, HookDeclaration)
            assert hook.event in VALID_EVENTS
            assert hook.command.startswith("pf hooks ")


class TestAllAgentsHaveFrontmatterHooks:
    """AC1: Verify all real agent .md files have frontmatter hooks."""

    @pytest.fixture()
    def agent_files(self):
        """Get all main agent .md files (excluding README and subagents)."""
        agents_dir = DIST_ROOT / "agents"
        if not agents_dir.is_dir():
            pytest.skip("agents directory not found")
        # Main agents: those that define primary roles
        # Subagents already have frontmatter (name, description, tools, model)
        main_agents = [
            "sm.md", "tea.md", "dev.md", "reviewer.md",
            "architect.md", "pm.md", "tech-writer.md",
            "ux-designer.md", "devops.md", "orchestrator.md", "ba.md",
        ]
        return [(agents_dir / name) for name in main_agents if (agents_dir / name).exists()]

    def test_all_main_agents_have_hooks_frontmatter(self, agent_files):
        """Every main agent should have a hooks: key in frontmatter."""
        missing = []
        for path in agent_files:
            content = path.read_text()
            fm = parse_frontmatter(content)
            if "hooks" not in fm:
                missing.append(path.name)
        assert missing == [], f"Agents missing hooks frontmatter: {missing}"

    def test_all_main_agents_have_at_least_one_hook(self, agent_files):
        """Every main agent should declare at least one hook."""
        empty = []
        for path in agent_files:
            content = path.read_text()
            hooks = parse_agent_hooks(content)
            if len(hooks) == 0:
                empty.append(path.name)
        assert empty == [], f"Agents with no hook declarations: {empty}"

    def test_agent_hooks_reference_valid_commands(self, agent_files):
        """All hook commands should reference known pf hooks commands."""
        known_commands = {
            "pf hooks session-start",
            "pf hooks session-stop",
            "pf hooks reflector-check",
            "pf hooks pre-edit-check",
            "pf hooks context-warning",
            "pf hooks context-breaker",
            "pf hooks cyclist-pretooluse",
            "pf hooks schema-validation",
            "pf hooks bell-mode",
            "pf hooks sprint-yaml",
            "pf hooks statusline",
            "pf hooks auto-load-sm",
        }
        invalid = []
        for path in agent_files:
            content = path.read_text()
            hooks = parse_agent_hooks(content)
            for hook in hooks:
                if hook.command not in known_commands:
                    invalid.append(f"{path.name}: {hook.command}")
        assert invalid == [], f"Unknown hook commands: {invalid}"


# =============================================================================
# AC2: Relevant skill directories have frontmatter hooks
# =============================================================================


class TestParseSkillHooks:
    """Test parsing hook declarations from skill frontmatter."""

    def test_parse_skill_hooks_basic(self):
        """Should extract hook declarations from skill SKILL.md frontmatter."""
        hooks = parse_skill_hooks(SKILL_WITH_HOOKS)
        assert len(hooks) == 1
        assert hooks[0].event == "PostToolUse"
        assert hooks[0].command == "pf hooks sprint-yaml"
        assert hooks[0].matcher == "Edit|Write"

    def test_parse_skill_hooks_no_hooks(self):
        """Should return empty list when skill has no hooks."""
        hooks = parse_skill_hooks(SKILL_WITHOUT_HOOKS)
        assert hooks == []

    def test_parse_skill_hooks_preserves_existing_fields(self):
        """Skill frontmatter should keep name/description alongside hooks."""
        fm = parse_frontmatter(SKILL_WITH_HOOKS)
        assert fm.get("name") == "pf-sprint"
        assert fm.get("description") == "Sprint management"
        assert "hooks" in fm


class TestRelevantSkillsHaveFrontmatterHooks:
    """AC2: Skills that own hooks should declare them in frontmatter."""

    # Skills that are expected to have hooks (they currently have
    # corresponding hooks in settings.local.json)
    SKILLS_WITH_EXPECTED_HOOKS = {
        "pf-sprint": ["sprint-yaml"],  # sprint YAML validation
    }

    @pytest.fixture()
    def skill_dirs(self):
        """Get all skill directories."""
        skills_dir = DIST_ROOT / "skills"
        if not skills_dir.is_dir():
            pytest.skip("skills directory not found")
        return [d for d in sorted(skills_dir.iterdir()) if d.is_dir() and (d / "SKILL.md").exists()]

    def test_expected_skills_have_hooks(self, skill_dirs):
        """Skills that own hooks should declare them in frontmatter."""
        missing = []
        for skill_name, expected_hooks in self.SKILLS_WITH_EXPECTED_HOOKS.items():
            skill_dir = DIST_ROOT / "skills" / skill_name
            if not skill_dir.is_dir():
                missing.append(f"{skill_name}: directory not found")
                continue
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                missing.append(f"{skill_name}: SKILL.md not found")
                continue
            content = skill_md.read_text()
            hooks = parse_skill_hooks(content)
            hook_names = [h.command.split()[-1] for h in hooks]
            for expected in expected_hooks:
                if expected not in hook_names:
                    missing.append(f"{skill_name}: missing hook '{expected}'")
        assert missing == [], f"Skills missing expected hooks: {missing}"


# =============================================================================
# AC3: settings.local.json reduced to 5 infrastructure hooks
# =============================================================================


class TestInfrastructureHooksReduction:
    """AC3: settings.local.json should contain only 5 infrastructure hooks."""

    def test_minimal_settings_has_five_hooks(self):
        """_MINIMAL_SETTINGS template should have exactly 5 hook entries."""
        count = count_hooks_in_settings(_MINIMAL_SETTINGS)
        assert count == 5, f"Expected 5 infrastructure hooks, got {count}"

    def test_infrastructure_hooks_constant(self):
        """INFRASTRUCTURE_HOOKS should list exactly 5 hook names."""
        assert len(INFRASTRUCTURE_HOOKS) == 5
        assert "session-start" in INFRASTRUCTURE_HOOKS
        assert "session-stop" in INFRASTRUCTURE_HOOKS
        assert "pre-edit-check" in INFRASTRUCTURE_HOOKS
        assert "context-warning" in INFRASTRUCTURE_HOOKS
        assert "bell-mode" in INFRASTRUCTURE_HOOKS

    def test_minimal_settings_contains_all_infrastructure_hooks(self):
        """All 5 infrastructure hooks should be present in _MINIMAL_SETTINGS."""
        settings_json = json.dumps(_MINIMAL_SETTINGS)
        for hook_name in INFRASTRUCTURE_HOOKS:
            assert f"pf hooks {hook_name}" in settings_json, (
                f"Infrastructure hook '{hook_name}' missing from _MINIMAL_SETTINGS"
            )

    def test_minimal_settings_has_no_component_hooks(self):
        """_MINIMAL_SETTINGS should NOT contain component-specific hooks."""
        component_hooks = [
            "reflector-check",
            "cyclist-pretooluse",
            "context-breaker",
            "schema-validation",
            "sprint-yaml",
            "auto-load-sm",
            "statusline",
        ]
        settings_json = json.dumps(_MINIMAL_SETTINGS)
        present = [h for h in component_hooks if f"pf hooks {h}" in settings_json]
        assert present == [], f"Component hooks found in _MINIMAL_SETTINGS: {present}"

    def test_count_hooks_function(self):
        """count_hooks_in_settings should accurately count hook entries."""
        settings = {
            "hooks": {
                "SessionStart": [{"hooks": [{"type": "command", "command": "a"}]}],
                "PreToolUse": [
                    {"hooks": [{"type": "command", "command": "b"}]},
                    {"hooks": [{"type": "command", "command": "c"}]},
                ],
            }
        }
        assert count_hooks_in_settings(settings) == 3


# =============================================================================
# AC4: No functional regression — hooks still fire correctly
# =============================================================================


class TestToSettingsFormat:
    """Test converting HookDeclarations to Claude Code settings format."""

    def test_basic_conversion(self):
        """Should produce valid Claude Code hook entry."""
        decl = HookDeclaration(
            event="PreToolUse",
            command="pf hooks schema-validation",
            matcher="Write",
        )
        entries = to_settings_format([decl])
        assert len(entries) == 1
        entry = entries[0]
        assert entry["matcher"] == "Write"
        assert entry["hooks"][0]["type"] == "command"
        assert entry["hooks"][0]["command"] == "pf hooks schema-validation"

    def test_no_matcher_omitted(self):
        """Should omit matcher field when None."""
        decl = HookDeclaration(
            event="Stop",
            command="pf hooks reflector-check",
            matcher=None,
        )
        entries = to_settings_format([decl])
        assert len(entries) == 1
        assert "matcher" not in entries[0] or entries[0].get("matcher") is None

    def test_empty_list(self):
        """Should return empty list for empty input."""
        assert to_settings_format([]) == []

    def test_multiple_declarations(self):
        """Should produce one entry per declaration."""
        decls = [
            HookDeclaration("PreToolUse", "pf hooks schema-validation", "Write"),
            HookDeclaration("PreToolUse", "pf hooks cyclist-pretooluse"),
        ]
        entries = to_settings_format(decls)
        assert len(entries) == 2


class TestMergeWithInfrastructure:
    """Test merging frontmatter hooks with infrastructure settings."""

    def test_infrastructure_unchanged_when_no_frontmatter(self):
        """With no frontmatter hooks, infrastructure should be returned as-is."""
        result = merge_with_infrastructure(_MINIMAL_SETTINGS, {})
        assert result == _MINIMAL_SETTINGS

    def test_adds_frontmatter_hooks_to_events(self):
        """Frontmatter hooks should be appended to the right event arrays."""
        frontmatter = {
            "PreToolUse": [
                HookDeclaration("PreToolUse", "pf hooks schema-validation", "Write"),
            ],
            "Stop": [
                HookDeclaration("Stop", "pf hooks reflector-check"),
            ],
        }
        result = merge_with_infrastructure(_MINIMAL_SETTINGS, frontmatter)

        # PreToolUse should have original + frontmatter
        pre_entries = result["hooks"]["PreToolUse"]
        commands = []
        for entry in pre_entries:
            for h in entry.get("hooks", []):
                commands.append(h["command"])
        assert "pf hooks schema-validation" in commands
        assert "pf hooks pre-edit-check" in commands  # infrastructure preserved

        # Stop should have original + frontmatter
        stop_entries = result["hooks"]["Stop"]
        commands = []
        for entry in stop_entries:
            for h in entry.get("hooks", []):
                commands.append(h["command"])
        assert "pf hooks reflector-check" in commands
        assert "pf hooks session-stop" in commands  # infrastructure preserved

    def test_does_not_duplicate_hooks(self):
        """If a frontmatter hook already exists in infrastructure, don't duplicate."""
        frontmatter = {
            "PostToolUse": [
                HookDeclaration("PostToolUse", "pf hooks bell-mode"),  # already infra
            ],
        }
        result = merge_with_infrastructure(_MINIMAL_SETTINGS, frontmatter)
        post_entries = result["hooks"]["PostToolUse"]
        bell_count = sum(
            1
            for entry in post_entries
            for h in entry.get("hooks", [])
            if h["command"] == "pf hooks bell-mode"
        )
        assert bell_count == 1, f"bell-mode duplicated: found {bell_count} times"


class TestCollectAllFrontmatterHooks:
    """Test collecting hooks from all agents and skills."""

    def test_collects_from_agents_dir(self, tmp_path):
        """Should read hook declarations from all agent .md files."""
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()
        (agents_dir / "sm.md").write_text(AGENT_WITH_HOOKS)
        (agents_dir / "README.md").write_text("# Agents")

        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        result = collect_all_frontmatter_hooks(tmp_path)
        assert "PreToolUse" in result
        assert "Stop" in result
        assert any(h.command == "pf hooks schema-validation" for h in result.get("PreToolUse", []))

    def test_collects_from_skills_dir(self, tmp_path):
        """Should read hook declarations from skill SKILL.md files."""
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()

        skills_dir = tmp_path / "skills" / "pf-sprint"
        skills_dir.mkdir(parents=True)
        (skills_dir / "SKILL.md").write_text(SKILL_WITH_HOOKS)

        result = collect_all_frontmatter_hooks(tmp_path)
        assert "PostToolUse" in result
        assert any(h.command == "pf hooks sprint-yaml" for h in result.get("PostToolUse", []))

    def test_deduplicates_across_files(self, tmp_path):
        """Same hook declared in multiple agents should appear only once."""
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()
        # Two agents both declare schema-validation
        (agents_dir / "sm.md").write_text(AGENT_WITH_HOOKS)
        (agents_dir / "dev.md").write_text(AGENT_WITH_HOOKS)

        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        result = collect_all_frontmatter_hooks(tmp_path)
        schema_hooks = [
            h for h in result.get("PreToolUse", [])
            if h.command == "pf hooks schema-validation"
        ]
        assert len(schema_hooks) == 1, "Duplicate hook declarations should be deduplicated"

    def test_returns_empty_for_missing_dirs(self, tmp_path):
        """Should handle missing agents/skills directories gracefully."""
        result = collect_all_frontmatter_hooks(tmp_path)
        assert result == {}

    def test_skips_readme(self, tmp_path):
        """Should skip README.md in agents directory."""
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()
        (agents_dir / "README.md").write_text("---\nhooks:\n  Stop:\n    - command: pf hooks test\n---\n# README")

        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        result = collect_all_frontmatter_hooks(tmp_path)
        # README hooks should not be collected
        all_hooks = [h for hooks in result.values() for h in hooks]
        assert len(all_hooks) == 0


class TestEndToEndHookMerge:
    """Integration: collect frontmatter + merge with infrastructure = complete config."""

    def test_full_pipeline(self, tmp_path):
        """Collecting and merging should produce a complete hook configuration."""
        # Set up agents with hooks
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()
        (agents_dir / "sm.md").write_text(AGENT_WITH_MULTIPLE_HOOKS)

        # Set up skills with hooks
        skills_dir = tmp_path / "skills" / "pf-sprint"
        skills_dir.mkdir(parents=True)
        (skills_dir / "SKILL.md").write_text(SKILL_WITH_HOOKS)

        # Collect all frontmatter hooks
        frontmatter = collect_all_frontmatter_hooks(tmp_path)
        assert len(frontmatter) > 0, "Should find frontmatter hooks"

        # Merge with infrastructure
        merged = merge_with_infrastructure(_MINIMAL_SETTINGS, frontmatter)

        # Verify all infrastructure hooks are present
        merged_json = json.dumps(merged)
        for hook_name in INFRASTRUCTURE_HOOKS:
            assert f"pf hooks {hook_name}" in merged_json

        # Verify frontmatter hooks are also present
        assert "pf hooks reflector-check" in merged_json
        assert "pf hooks schema-validation" in merged_json
        assert "pf hooks sprint-yaml" in merged_json

    def test_merged_output_valid_json(self, tmp_path):
        """Merged result should be valid JSON serializable."""
        agents_dir = tmp_path / "agents"
        agents_dir.mkdir()
        (agents_dir / "sm.md").write_text(AGENT_WITH_HOOKS)

        skills_dir = tmp_path / "skills"
        skills_dir.mkdir()

        frontmatter = collect_all_frontmatter_hooks(tmp_path)
        merged = merge_with_infrastructure(_MINIMAL_SETTINGS, frontmatter)

        # Should serialize without error
        json_str = json.dumps(merged, indent=2)
        # Should parse back correctly
        parsed = json.loads(json_str)
        assert "hooks" in parsed
