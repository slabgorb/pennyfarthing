"""Tests for frontmatter hooks integration with dispatcher.

Verifies that pf init collects frontmatter hook declarations from agent .md
and skill SKILL.md files, and that dispatcher-managed hooks (pf hooks <name>)
are NOT added as separate settings.local.json entries (they run in-process
via pf.hooks.dispatch instead).

Acceptance Criteria:
  AC1: pf init collects frontmatter hooks from all agents and skills
  AC2: Dispatcher-managed hooks are NOT duplicated in settings.local.json
  AC3: settings.local.json has exactly 4 dispatcher entries (one per event)
  AC4: pf init is idempotent — running twice produces same result
  AC5: Graceful fallback when no agents directory exists

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
    """AC1: pf init should collect frontmatter hooks but not add them as
    separate settings entries (dispatcher handles them in-process)."""

    def test_frontmatter_pf_hooks_not_added_separately(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """pf hooks commands from frontmatter should NOT appear as separate entries."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        # These are handled by the dispatcher, not as individual entries
        assert "pf hooks schema-validation" not in commands
        assert "pf hooks reflector-check" not in commands
        assert "pf hooks sprint-yaml" not in commands

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
# AC2: Dispatcher-managed hooks are not duplicated
# ===================================================================


class TestNoDuplicateHooks:
    """AC2: No duplicate hook entries should appear in settings."""

    def test_only_dispatcher_entries(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Settings should only have dispatcher entries, not individual hooks."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        for cmd in commands:
            # All hook commands should be dispatcher or statusline
            assert "dispatch" in cmd or "statusline" in cmd, (
                f"Unexpected individual hook entry: {cmd}"
            )

    def test_each_dispatcher_appears_once(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Each dispatcher entry should appear exactly once."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        for event in ("SessionStart", "Stop", "PreToolUse", "PostToolUse", "SessionEnd", "PreCompact"):
            count = sum(1 for cmd in commands if f"dispatch {event}" in cmd)
            assert count == 1, f"dispatch {event} found {count} times (expected 1)"


# ===================================================================
# AC3: settings.local.json has exactly 4 dispatcher entries
# ===================================================================


class TestSettingsDispatcherEntries:
    """AC3: Settings should have exactly 4 dispatcher entries."""

    def test_has_four_hook_entries(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """With frontmatter agents, total hook count should be 6 (one per event)."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        total = sum(len(entries) for entries in hooks.values())
        assert total == 6, f"Expected 6 dispatcher entries, got {total}"

    def test_all_events_have_dispatcher(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """All 6 event types must have a dispatcher entry."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)

        for event in ("SessionStart", "Stop", "PreToolUse", "PostToolUse", "SessionEnd", "PreCompact"):
            assert any(f"dispatch {event}" in cmd for cmd in commands), (
                f"Missing dispatcher for {event}"
            )

    def test_statusline_preserved(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """statusLine should still be present after frontmatter merge."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        assert "statusLine" in data
        assert data["statusLine"]["command"].endswith("pf hooks statusline")


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

    def test_upgrade_consolidates_old_hooks(
        self, target_dir: Path, mock_dist_with_frontmatter: Path
    ) -> None:
        """Re-init on old-style settings should consolidate to dispatcher."""
        from pf.init.core import init_project

        # First init creates dispatcher settings
        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        # Simulate old-style settings with individual hook entries
        settings_path = target_dir / ".claude" / "settings.local.json"
        old_settings = {
            "hooks": {
                "PreToolUse": [
                    {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks pre-edit-check"}]},
                    {"matcher": "Edit|Write|Bash|Task", "hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks context-warning"}]},
                ],
                "PostToolUse": [
                    {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks bell-mode"}]},
                ],
                "SessionStart": [
                    {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks session-start"}]},
                ],
                "Stop": [
                    {"hooks": [{"type": "command", "command": ".pennyfarthing/bin/pf hooks session-stop"}]},
                ],
            },
            "statusLine": {"type": "command", "command": ".pennyfarthing/bin/pf hooks statusline"},
        }
        settings_path.write_text(json.dumps(old_settings, indent=2) + "\n")

        # Re-init should consolidate to dispatcher entries
        init_project(target_dir=target_dir, dist_root=mock_dist_with_frontmatter)

        restored = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(restored)
        # Should have dispatcher entries, not individual hooks
        for event in ("SessionStart", "Stop", "PreToolUse", "PostToolUse", "SessionEnd", "PreCompact"):
            assert any(f"dispatch {event}" in cmd for cmd in commands)
        # Individual hooks should be gone
        assert ".pennyfarthing/bin/pf hooks pre-edit-check" not in commands
        assert ".pennyfarthing/bin/pf hooks context-warning" not in commands


# ===================================================================
# AC5: Graceful fallback — no agents directory
# ===================================================================


class TestGracefulFallback:
    """No agents directory should fall back to dispatcher-only hooks."""

    def test_no_agents_dir_still_succeeds(
        self, target_dir: Path, mock_dist_no_agents: Path
    ) -> None:
        """Init without agents directory should still succeed."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist_no_agents)
        assert result["success"] is True

    def test_no_agents_dir_has_four_dispatcher_entries(
        self, target_dir: Path, mock_dist_no_agents: Path
    ) -> None:
        """Without agents, settings should have 6 dispatcher entries."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_no_agents)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        total = sum(len(entries) for entries in hooks.values())
        assert total == 6, f"Expected exactly 6 dispatcher entries, got {total}"

    def test_no_agents_dir_no_individual_hooks(
        self, target_dir: Path, mock_dist_no_agents: Path
    ) -> None:
        """Without agents, no individual hook commands should appear."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist_no_agents)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        commands = _extract_all_hook_commands(data)
        component_hooks = ["schema-validation", "reflector-check", "sprint-yaml"]
        for hook_name in component_hooks:
            assert f"pf hooks {hook_name}" not in commands
