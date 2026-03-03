"""
Tests for stale hooks detection — Story 129-6.

Validates the detect_stale_hooks() function that compares installed hooks
in .claude/settings.local.json against the canonical hooks shipped by
pennyfarthing (INFRASTRUCTURE_HOOKS + frontmatter declarations).

Run with: python -m pytest tests/python/test_stale_hooks_detection.py -v
"""

import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.common.hooks import INFRASTRUCTURE_HOOKS  # noqa: E402
from pf.hooks.stale_detection import detect_stale_hooks  # noqa: E402

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture()
def tmp_project(tmp_path):
    """Create a temporary project with .claude and .pennyfarthing dirs."""
    (tmp_path / ".claude").mkdir()
    (tmp_path / ".pennyfarthing").mkdir()
    return tmp_path


@pytest.fixture()
def current_settings(tmp_project):
    """Write a fully up-to-date settings.local.json."""
    settings = {"hooks": INFRASTRUCTURE_HOOKS}
    (tmp_project / ".claude" / "settings.local.json").write_text(
        json.dumps(settings, indent=2)
    )
    return tmp_project


@pytest.fixture()
def dist_root(tmp_path):
    """Create a minimal dist_root with no agent/skill frontmatter hooks."""
    dist = tmp_path / "pennyfarthing-dist"
    dist.mkdir()
    (dist / "agents").mkdir()
    (dist / "skills").mkdir()
    return dist


# =============================================================================
# AC1: Detect Missing Infrastructure Hooks
# =============================================================================


class TestMissingInfrastructureHooks:
    """When settings.local.json is missing an infrastructure hook, report it."""

    def test_missing_session_start_hook(self, tmp_project, dist_root):
        """Detect when SessionStart hook is completely absent."""
        # Settings with SessionStart removed
        partial = {
            "hooks": {
                k: v
                for k, v in INFRASTRUCTURE_HOOKS.items()
                if k != "SessionStart"
            }
        }
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps(partial)
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["missing_infrastructure"]) > 0
        # Should identify the missing SessionStart hooks
        missing_commands = [h["command"] for h in result["missing_infrastructure"]]
        assert "pf hooks session-start" in missing_commands

    def test_missing_single_hook_entry(self, tmp_project, dist_root):
        """Detect when one hook entry within an event type is missing."""
        # Remove context-warning from PreToolUse but keep pre-edit-check
        hooks = json.loads(json.dumps(INFRASTRUCTURE_HOOKS))
        hooks["PreToolUse"] = [
            entry
            for entry in hooks["PreToolUse"]
            if "context-warning" not in entry["hooks"][0]["command"]
        ]
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": hooks})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        missing_commands = [h["command"] for h in result["missing_infrastructure"]]
        assert "pf hooks context-warning" in missing_commands

    def test_missing_hook_event_type(self, tmp_project, dist_root):
        """Detect when an entire event type is missing from settings."""
        hooks = json.loads(json.dumps(INFRASTRUCTURE_HOOKS))
        del hooks["Stop"]
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": hooks})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        missing_commands = [h["command"] for h in result["missing_infrastructure"]]
        assert "pf hooks session-stop" in missing_commands


# =============================================================================
# AC2: Detect Deprecated pf.sh Hook References
# =============================================================================


class TestDeprecatedHooks:
    """When settings contain pf.sh references, flag them as deprecated."""

    def test_detect_deprecated_pf_sh_command(self, tmp_project, dist_root):
        """Detect hooks still using .pennyfarthing/scripts/core/pf.sh."""
        hooks = json.loads(json.dumps(INFRASTRUCTURE_HOOKS))
        hooks["PreToolUse"].append(
            {
                "matcher": "Edit|Write",
                "hooks": [
                    {
                        "type": "command",
                        "command": ".pennyfarthing/scripts/core/pf.sh hooks pre-edit-check",
                    }
                ],
            }
        )
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": hooks})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["deprecated"]) > 0
        deprecated_cmds = [h["command"] for h in result["deprecated"]]
        assert any("pf.sh" in cmd for cmd in deprecated_cmds)

    def test_detect_multiple_deprecated_entries(self, tmp_project, dist_root):
        """Detect multiple deprecated hook entries."""
        hooks = {
            "SessionStart": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": ".pennyfarthing/scripts/core/pf.sh hooks session-start",
                        }
                    ]
                }
            ],
            "PreToolUse": [
                {
                    "matcher": "Edit|Write",
                    "hooks": [
                        {
                            "type": "command",
                            "command": ".pennyfarthing/scripts/core/pf.sh hooks pre-edit-check",
                        }
                    ],
                }
            ],
        }
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": hooks})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["deprecated"]) >= 2


# =============================================================================
# AC3: Detect Missing Frontmatter Hooks
# =============================================================================


class TestMissingFrontmatterHooks:
    """When agent/skill frontmatter declares hooks not in settings, report them."""

    def test_missing_agent_frontmatter_hook(self, tmp_project, dist_root):
        """Detect when an agent declares a hook not present in settings."""
        # Create an agent with a hook declaration
        agent_md = dist_root / "agents" / "sm.md"
        agent_md.write_text(
            "---\nhooks:\n  PreToolUse:\n    - command: pf hooks schema-validation\n"
            "      matcher: Write\n  Stop:\n    - command: pf hooks reflector-check\n---\n"
            "# SM Agent\n"
        )

        # Settings with only infrastructure hooks (missing schema-validation, reflector-check)
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": INFRASTRUCTURE_HOOKS})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["missing_frontmatter"]) > 0
        missing_commands = [h["command"] for h in result["missing_frontmatter"]]
        assert "pf hooks schema-validation" in missing_commands

    def test_missing_skill_frontmatter_hook(self, tmp_project, dist_root):
        """Detect when a skill declares a hook not present in settings."""
        skill_dir = dist_root / "skills" / "pf-sprint"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: pf-sprint\nhooks:\n  PostToolUse:\n"
            "    - command: pf hooks sprint-yaml\n      matcher: Edit|Write\n---\n"
        )

        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": INFRASTRUCTURE_HOOKS})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        missing_commands = [h["command"] for h in result["missing_frontmatter"]]
        assert "pf hooks sprint-yaml" in missing_commands


# =============================================================================
# AC4: Clean Settings Pass
# =============================================================================


class TestCleanSettings:
    """When all hooks are up to date, no drift should be reported."""

    def test_all_hooks_current(self, current_settings, dist_root):
        """No drift when settings match infrastructure hooks exactly."""
        result = detect_stale_hooks(current_settings, dist_root)

        assert result["stale"] is False
        assert len(result["missing_infrastructure"]) == 0
        assert len(result["missing_frontmatter"]) == 0
        assert len(result["deprecated"]) == 0

    def test_extra_user_hooks_not_flagged(self, current_settings, dist_root):
        """User-added custom hooks should not be flagged as stale."""
        settings_path = current_settings / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        data["hooks"]["PreToolUse"].append(
            {
                "matcher": "Bash",
                "hooks": [
                    {"type": "command", "command": "/usr/local/bin/my-custom-hook"}
                ],
            }
        )
        settings_path.write_text(json.dumps(data))

        result = detect_stale_hooks(current_settings, dist_root)

        assert result["stale"] is False

    def test_superset_of_hooks_not_flagged(self, current_settings, dist_root):
        """Settings with all required hooks plus extras should pass clean."""
        settings_path = current_settings / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        # Add frontmatter hooks too
        data["hooks"].setdefault("Stop", []).append(
            {"hooks": [{"type": "command", "command": "pf hooks reflector-check"}]}
        )
        settings_path.write_text(json.dumps(data))

        result = detect_stale_hooks(current_settings, dist_root)

        assert result["stale"] is False


# =============================================================================
# AC5: Generate Upgrade Prompt
# =============================================================================


class TestUpgradePrompt:
    """When stale hooks detected, produce additionalContext for session-start."""

    def test_summary_contains_actionable_message(self, tmp_project, dist_root):
        """Summary should tell the user what to do."""
        # Empty hooks — everything is missing
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": {}})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert result["summary"]  # Non-empty
        assert "pf init" in result["summary"].lower() or "upgrade" in result["summary"].lower()

    def test_summary_lists_missing_hooks(self, tmp_project, dist_root):
        """Summary should mention which hooks are missing."""
        hooks = json.loads(json.dumps(INFRASTRUCTURE_HOOKS))
        del hooks["Stop"]
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": hooks})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert "session-stop" in result["summary"].lower()

    def test_clean_summary_is_empty(self, current_settings, dist_root):
        """No summary when hooks are clean."""
        result = detect_stale_hooks(current_settings, dist_root)

        assert result["summary"] == ""


# =============================================================================
# AC6: Handle Missing Settings File
# =============================================================================


class TestMissingSettingsFile:
    """Gracefully handle when .claude/settings.local.json doesn't exist."""

    def test_no_settings_file(self, tmp_project, dist_root):
        """Report stale when settings file is missing entirely."""
        # No settings.local.json written
        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["missing_infrastructure"]) > 0

    def test_no_claude_dir(self, tmp_path, dist_root):
        """Handle when even .claude/ directory doesn't exist."""
        # No .claude dir at all
        result = detect_stale_hooks(tmp_path, dist_root)

        assert result["stale"] is True


# =============================================================================
# AC7: Handle Malformed Settings
# =============================================================================


class TestMalformedSettings:
    """Gracefully handle corrupted or invalid settings files."""

    def test_invalid_json(self, tmp_project, dist_root):
        """Handle settings file with invalid JSON."""
        (tmp_project / ".claude" / "settings.local.json").write_text(
            "{ this is not valid json }"
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["missing_infrastructure"]) > 0

    def test_empty_file(self, tmp_project, dist_root):
        """Handle empty settings file."""
        (tmp_project / ".claude" / "settings.local.json").write_text("")

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True

    def test_hooks_key_not_dict(self, tmp_project, dist_root):
        """Handle when hooks key is not a dict."""
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"hooks": "not a dict"})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["missing_infrastructure"]) > 0

    def test_no_hooks_key(self, tmp_project, dist_root):
        """Handle settings with no hooks key at all."""
        (tmp_project / ".claude" / "settings.local.json").write_text(
            json.dumps({"some_other_key": True})
        )

        result = detect_stale_hooks(tmp_project, dist_root)

        assert result["stale"] is True
        assert len(result["missing_infrastructure"]) > 0
