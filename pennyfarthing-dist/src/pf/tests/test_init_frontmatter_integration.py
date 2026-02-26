"""Tests for Story 129-5: Integrate frontmatter hooks into pf init pipeline.

Verifies that pf init collects frontmatter hook declarations from agent .md
and skill SKILL.md files and merges them with infrastructure hooks into
settings.local.json.

Acceptance Criteria:
  AC1: pf init collects frontmatter hooks from all agents and skills
  AC2: Frontmatter hooks merged with infrastructure hooks (no duplicates)
  AC3: settings.local.json contains both infrastructure and frontmatter hooks
  AC4: pf init is idempotent — running twice produces same result
  AC5: Existing tests continue to pass (no regression)

Run with: python -m pytest pennyfarthing-dist/src/pf/tests/test_init_frontmatter_integration.py -v
"""

from __future__ import annotations

import json
from pathlib import Path
from textwrap import dedent

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def target_dir(tmp_path: Path) -> Path:
    """Empty target directory simulating a fresh project."""
    target = tmp_path / "my-project"
    target.mkdir()
    return target


@pytest.fixture
def mock_dist_with_frontmatter(tmp_path: Path) -> Path:
    """Mock pennyfarthing-dist with agents and skills that have frontmatter hooks.

    Layout:
        pennyfarthing-dist/
          commands/
            pf-sm.md
          skills/
            pf-sprint/
              SKILL.md    (has PostToolUse hook)
            pf-testing/
              SKILL.md    (no hooks)
          agents/
            sm.md         (has PreToolUse + Stop hooks)
            dev.md        (has PreToolUse + Stop hooks)
            README.md     (should be skipped)
    """
    dist = tmp_path / "pennyfarthing-dist"
    dist.mkdir()

    # Commands
    commands_dir = dist / "commands"
    commands_dir.mkdir()
    (commands_dir / "pf-sm.md").write_text("# SM command\n")

    # Agents with frontmatter hooks
    agents_dir = dist / "agents"
    agents_dir.mkdir()

    (agents_dir / "sm.md").write_text(dedent("""\
        ---
        hooks:
          PreToolUse:
            - command: pf hooks schema-validation
              matcher: Write
          Stop:
            - command: pf hooks reflector-check
        ---
        # SM Agent
        <role>Scrum Master</role>
    """))

    (agents_dir / "dev.md").write_text(dedent("""\
        ---
        hooks:
          PreToolUse:
            - command: pf hooks schema-validation
              matcher: Write
          Stop:
            - command: pf hooks reflector-check
        ---
        # Dev Agent
        <role>Developer</role>
    """))

    # README should be skipped
    (agents_dir / "README.md").write_text(
        "---\nhooks:\n  Stop:\n    - command: pf hooks readme-hook\n---\n# README"
    )

    # Skills
    skills_dir = dist / "skills"
    skills_dir.mkdir()

    sprint_skill = skills_dir / "pf-sprint"
    sprint_skill.mkdir()
    (sprint_skill / "SKILL.md").write_text(dedent("""\
        ---
        name: pf-sprint
        description: Sprint management
        hooks:
          PostToolUse:
            - command: pf hooks sprint-yaml
              matcher: Edit|Write
        ---
        # /pf-sprint
    """))

    testing_skill = skills_dir / "pf-testing"
    testing_skill.mkdir()
    (testing_skill / "SKILL.md").write_text(dedent("""\
        ---
        name: pf-testing
        description: Test runner
        ---
        # /pf-testing (no hooks)
    """))

    return dist


@pytest.fixture
def mock_dist_no_agents(tmp_path: Path) -> Path:
    """Mock pennyfarthing-dist with no agents directory (graceful fallback)."""
    dist = tmp_path / "pennyfarthing-dist"
    dist.mkdir()

    commands_dir = dist / "commands"
    commands_dir.mkdir()
    (commands_dir / "pf-sm.md").write_text("# SM command\n")

    skills_dir = dist / "skills"
    skills_dir.mkdir()

    return dist


def _extract_all_hook_commands(settings: dict) -> list[str]:
    """Extract all hook command strings from a settings dict."""
    commands = []
    for _event, entries in settings.get("hooks", {}).items():
        for entry in entries:
            for hook in entry.get("hooks", []):
                if "command" in hook:
                    commands.append(hook["command"])
    return commands


def _count_command_occurrences(settings: dict, command: str) -> int:
    """Count how many times a specific hook command appears in settings."""
    return _extract_all_hook_commands(settings).count(command)


# ===================================================================
# AC1: pf init collects frontmatter hooks from agents and skills
# ===================================================================


class TestInitCollectsFrontmatterHooks:
    """AC1: pf init should collect frontmatter hooks from agents and skills."""

    def test_settings_contains_agent_pretooluse_hook(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """settings.local.json should contain schema-validation from agent frontmatter."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        assert "pf hooks schema-validation" in commands

    def test_settings_contains_agent_stop_hook(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """settings.local.json should contain reflector-check from agent frontmatter."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        assert "pf hooks reflector-check" in commands

    def test_settings_contains_skill_posttooluse_hook(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """settings.local.json should contain sprint-yaml from skill frontmatter."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        assert "pf hooks sprint-yaml" in commands

    def test_settings_skips_readme_hooks(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Hooks from README.md should NOT appear in settings."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        assert "pf hooks readme-hook" not in commands


# ===================================================================
# AC2: Frontmatter hooks merged without duplicates
# ===================================================================


class TestNoDuplicateHooks:
    """AC2: Frontmatter hooks should be merged without duplicates."""

    def test_schema_validation_appears_once(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """schema-validation declared in two agents should appear only once."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        count = _count_command_occurrences(data, "pf hooks schema-validation")
        assert count == 1, f"schema-validation duplicated: found {count} times"

    def test_reflector_check_appears_once(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """reflector-check declared in two agents should appear only once."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        count = _count_command_occurrences(data, "pf hooks reflector-check")
        assert count == 1, f"reflector-check duplicated: found {count} times"

    def test_infrastructure_hooks_not_duplicated(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Infrastructure hooks should appear exactly once even after merge."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())

        for infra_cmd in [
            "pf hooks session-start",
            "pf hooks session-stop",
            "pf hooks pre-edit-check",
            "pf hooks context-warning",
            "pf hooks bell-mode",
        ]:
            count = _count_command_occurrences(data, infra_cmd)
            assert count == 1, f"{infra_cmd} duplicated: found {count} times"


# ===================================================================
# AC3: settings.local.json contains both infrastructure and frontmatter
# ===================================================================


class TestSettingsContainsBothHookSets:
    """AC3: Settings should contain infrastructure AND frontmatter hooks."""

    def test_has_more_than_five_hooks(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """With frontmatter agents, total hook count should exceed 5 infrastructure hooks."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        total = sum(len(entries) for entries in hooks.values())
        # 5 infrastructure + at least schema-validation, reflector-check, sprint-yaml = 8
        assert total > 5, f"Expected >5 hooks (infra + frontmatter), got {total}"

    def test_all_infrastructure_hooks_present(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """All 5 infrastructure hooks must still be present after merge."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)

        for infra_cmd in [
            "pf hooks session-start",
            "pf hooks session-stop",
            "pf hooks pre-edit-check",
            "pf hooks context-warning",
            "pf hooks bell-mode",
        ]:
            assert infra_cmd in commands, f"Infrastructure hook missing: {infra_cmd}"

    def test_all_frontmatter_hooks_present(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """All frontmatter-declared hooks should be present."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)

        assert "pf hooks schema-validation" in commands
        assert "pf hooks reflector-check" in commands
        assert "pf hooks sprint-yaml" in commands

    def test_frontmatter_hook_has_correct_matcher(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Frontmatter hooks with matchers should preserve them in settings."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())

        # Find schema-validation entry — should have matcher "Write"
        pre_tool = data["hooks"].get("PreToolUse", [])
        schema_entry = None
        for entry in pre_tool:
            for h in entry.get("hooks", []):
                if h.get("command") == "pf hooks schema-validation":
                    schema_entry = entry
                    break
        assert schema_entry is not None, "schema-validation entry not found"
        assert schema_entry.get("matcher") == "Write"

    def test_statusline_preserved(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """statusLine should still be present after frontmatter merge."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        assert "statusLine" in data
        assert data["statusLine"]["command"] == "pf hooks statusline"


# ===================================================================
# AC4: Idempotent — running twice produces same result
# ===================================================================


class TestFrontmatterIdempotency:
    """AC4: pf init with frontmatter hooks should be idempotent."""

    def test_running_twice_same_settings(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Running init twice should produce identical settings.local.json."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)
        first_settings = json.loads(
            (target_dir / ".claude" / "settings.local.json").read_text()
        )

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)
        second_settings = json.loads(
            (target_dir / ".claude" / "settings.local.json").read_text()
        )

        assert first_settings == second_settings

    def test_running_twice_same_hook_count(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Running init twice should not increase hook count."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)
        first = json.loads(
            (target_dir / ".claude" / "settings.local.json").read_text()
        )
        first_count = sum(
            len(entries) for entries in first.get("hooks", {}).values()
        )

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)
        second = json.loads(
            (target_dir / ".claude" / "settings.local.json").read_text()
        )
        second_count = sum(
            len(entries) for entries in second.get("hooks", {}).values()
        )

        assert first_count == second_count

    def test_upgrade_path_adds_frontmatter_hooks(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Re-init on existing settings should add missing frontmatter hooks."""
        from pf.init.core import init_project

        # First init creates settings
        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        # Simulate old settings with only infrastructure hooks (remove frontmatter ones)
        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        # Strip non-infrastructure hooks
        for event in list(data["hooks"].keys()):
            data["hooks"][event] = [
                entry for entry in data["hooks"][event]
                if any(
                    h.get("command", "").split()[-1] in {
                        "session-start", "session-stop", "pre-edit-check",
                        "context-warning", "bell-mode",
                    }
                    for h in entry.get("hooks", [])
                )
            ]
            if not data["hooks"][event]:
                del data["hooks"][event]
        settings_path.write_text(json.dumps(data, indent=2) + "\n")

        # Re-init should add frontmatter hooks back
        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        restored = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(restored)
        assert "pf hooks schema-validation" in commands
        assert "pf hooks reflector-check" in commands
        assert "pf hooks sprint-yaml" in commands


# ===================================================================
# AC5: Graceful fallback — no agents directory
# ===================================================================


class TestGracefulFallback:
    """No agents directory should fall back to infrastructure-only hooks."""

    def test_no_agents_dir_still_succeeds(
        self, target_dir: Path, mock_dist_no_agents: Path
    ) -> None:
        """Init without agents directory should still succeed."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist_no_agents)
        assert result["success"] is True

    def test_no_agents_dir_has_infrastructure_hooks(
        self, target_dir: Path, mock_dist_no_agents: Path
    ) -> None:
        """Without agents, settings should still have 5 infrastructure hooks."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_no_agents)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        total = sum(len(entries) for entries in hooks.values())
        assert total == 5, f"Expected exactly 5 infrastructure hooks, got {total}"

    def test_no_agents_dir_no_frontmatter_hooks(
        self, target_dir: Path, mock_dist_no_agents: Path
    ) -> None:
        """Without agents, no component-specific hooks should appear."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_no_agents)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        component_hooks = ["schema-validation", "reflector-check", "sprint-yaml"]
        for hook_name in component_hooks:
            assert f"pf hooks {hook_name}" not in commands
