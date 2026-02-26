"""Tests for setup auto-detection in session-start hook (Story 126-12).

Validates that the session-start hook detects incomplete setup state
(pf init ran but /pf-setup did not) and returns additionalContext
instructing the user to run /pf-setup.

Run with: python -m pytest tests/python/test_setup_detection.py -v
"""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from pf.hooks.session_start import detect_incomplete_setup


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture()
def bare_project(tmp_path):
    """Project with no .pennyfarthing/ — not initialized at all."""
    return tmp_path


@pytest.fixture()
def init_only_project(tmp_path):
    """Project where pf init ran but /pf-setup did not.

    Has .pennyfarthing/ directory and .claude/settings.local.json
    but missing config.local.yaml and repos.yaml.
    """
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".pennyfarthing" / "commands").mkdir()
    (tmp_path / ".claude").mkdir()
    (tmp_path / ".claude" / "settings.local.json").write_text('{"hooks": {}}')
    return tmp_path


@pytest.fixture()
def partial_setup_project(tmp_path):
    """Project where setup started but didn't finish.

    Has config.local.yaml but missing repos.yaml.
    """
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".claude").mkdir()
    (tmp_path / ".claude" / "settings.local.json").write_text('{"hooks": {}}')
    config = pf_dir / "config.local.yaml"
    config.write_text(yaml.dump({"theme": "discworld"}))
    return tmp_path


@pytest.fixture()
def complete_project(tmp_path):
    """Fully set up project — should return None (no action needed)."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (tmp_path / ".claude").mkdir()
    (tmp_path / ".claude" / "settings.local.json").write_text('{"hooks": {}}')
    config = pf_dir / "config.local.yaml"
    config.write_text(yaml.dump({"theme": "discworld"}))
    repos = pf_dir / "repos.yaml"
    repos.write_text(yaml.dump({"repos": {"my-project": {"path": "."}}}))
    return tmp_path


# =============================================================================
# AC1: Detects .pennyfarthing/ exists but config.local.yaml missing
# =============================================================================


class TestConfigMissing:
    """AC1: session-start detects missing or incomplete config.local.yaml."""

    def test_missing_config_returns_context(self, init_only_project):
        """When config.local.yaml is missing entirely, returns additionalContext."""
        result = detect_incomplete_setup(init_only_project)
        assert result is not None
        assert "/pf-setup" in result

    def test_config_without_theme_returns_context(self, init_only_project):
        """When config.local.yaml exists but has no theme key, returns context."""
        config = init_only_project / ".pennyfarthing" / "config.local.yaml"
        config.write_text(yaml.dump({"bell_mode": "standard"}))
        result = detect_incomplete_setup(init_only_project)
        assert result is not None
        assert "/pf-setup" in result

    def test_config_with_empty_theme_returns_context(self, init_only_project):
        """When config.local.yaml has theme: null, returns context."""
        config = init_only_project / ".pennyfarthing" / "config.local.yaml"
        config.write_text(yaml.dump({"theme": None}))
        result = detect_incomplete_setup(init_only_project)
        assert result is not None


# =============================================================================
# AC2: Detects missing repos.yaml
# =============================================================================


class TestReposMissing:
    """AC2: session-start detects when repos.yaml is missing."""

    def test_missing_repos_returns_context(self, partial_setup_project):
        """When repos.yaml is missing, returns additionalContext."""
        result = detect_incomplete_setup(partial_setup_project)
        assert result is not None
        assert "/pf-setup" in result

    def test_repos_present_but_empty_returns_context(self, partial_setup_project):
        """When repos.yaml exists but is empty, returns context."""
        repos = partial_setup_project / ".pennyfarthing" / "repos.yaml"
        repos.write_text("")
        result = detect_incomplete_setup(partial_setup_project)
        assert result is not None


# =============================================================================
# AC3: Detects missing settings.local.json
# =============================================================================


class TestSettingsMissing:
    """AC3: session-start detects when settings.local.json is missing."""

    def test_missing_settings_returns_context(self, tmp_path):
        """When .claude/settings.local.json is missing, returns context."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        # No .claude/ dir at all
        result = detect_incomplete_setup(tmp_path)
        assert result is not None
        assert "/pf-setup" in result


# =============================================================================
# AC4: Returns additionalContext with /pf-setup instruction
# =============================================================================


class TestAdditionalContext:
    """AC4: returned context instructs user to run /pf-setup."""

    def test_context_mentions_setup_command(self, init_only_project):
        """additionalContext mentions /pf-setup."""
        result = detect_incomplete_setup(init_only_project)
        assert result is not None
        assert "/pf-setup" in result

    def test_context_lists_what_is_missing(self, init_only_project):
        """additionalContext says what is incomplete."""
        result = detect_incomplete_setup(init_only_project)
        assert result is not None
        # Should mention the missing items
        assert "config" in result.lower() or "theme" in result.lower()
        assert "repos" in result.lower()

    def test_context_is_string_not_dict(self, init_only_project):
        """additionalContext is a plain string, not JSON."""
        result = detect_incomplete_setup(init_only_project)
        assert isinstance(result, str)


# =============================================================================
# AC5: Detection is fast — file existence checks only
# =============================================================================


class TestPerformance:
    """AC5: detection uses file existence checks, no YAML parsing on happy path."""

    def test_complete_project_does_not_parse_yaml(self, complete_project):
        """When setup is complete, yaml.safe_load is NOT called."""
        with patch("pf.hooks.session_start.yaml") as mock_yaml:
            result = detect_incomplete_setup(complete_project)
            assert result is None
            mock_yaml.safe_load.assert_not_called()


# =============================================================================
# AC6: Setup complete state has no performance penalty
# =============================================================================


class TestCompleteState:
    """AC6: fully setup project returns None with no penalty."""

    def test_complete_project_returns_none(self, complete_project):
        """Fully configured project returns None — no action needed."""
        result = detect_incomplete_setup(complete_project)
        assert result is None

    def test_not_initialized_returns_none(self, bare_project):
        """Project with no .pennyfarthing/ at all returns None.

        If init hasn't run, we can't tell them to run setup.
        The problem is they haven't installed yet.
        """
        result = detect_incomplete_setup(bare_project)
        assert result is None


# =============================================================================
# Integration: session-start main() outputs additionalContext
# =============================================================================


class TestSessionStartIntegration:
    """Verify that main() in session_start.py wires up detection."""

    def test_main_outputs_additional_context_when_incomplete(self, init_only_project):
        """When setup is incomplete, main() outputs JSON with additionalContext."""
        input_data = json.dumps({
            "session_id": "test-session",
            "source": "api",
        })
        with (
            patch("sys.stdin.read", return_value=input_data),
            patch.dict(
                "os.environ",
                {"CLAUDE_PROJECT_DIR": str(init_only_project)},
            ),
            patch("pf.hooks.session_start._ensure_wheelhub", return_value=None),
            patch("pf.hooks.session_start._show_welcome"),
            patch("pf.hooks.session_start._write_env_file"),
        ):
            from pf.hooks.session_start import main

            captured = []
            original_print = print

            def capture_print(*args, **kwargs):
                captured.append(" ".join(str(a) for a in args))

            with patch("builtins.print", side_effect=capture_print):
                with pytest.raises(SystemExit) as exc:
                    main()
                assert exc.value.code == 0

            # Find the JSON output line with additionalContext
            json_outputs = []
            for line in captured:
                try:
                    parsed = json.loads(line)
                    if "hookSpecificOutput" in parsed:
                        json_outputs.append(parsed)
                except (json.JSONDecodeError, ValueError):
                    pass

            assert len(json_outputs) >= 1, f"Expected JSON hook output, got: {captured}"
            hook_output = json_outputs[0]["hookSpecificOutput"]
            assert "additionalContext" in hook_output
            assert "/pf-setup" in hook_output["additionalContext"]

    def test_main_no_extra_output_when_complete(self, complete_project):
        """When setup is complete, main() does not output additionalContext."""
        input_data = json.dumps({
            "session_id": "test-session",
            "source": "api",
        })
        with (
            patch("sys.stdin.read", return_value=input_data),
            patch.dict(
                "os.environ",
                {"CLAUDE_PROJECT_DIR": str(complete_project)},
            ),
            patch("pf.hooks.session_start._ensure_wheelhub", return_value=None),
            patch("pf.hooks.session_start._show_welcome", return_value=False),
            patch("pf.hooks.session_start._write_env_file"),
        ):
            from pf.hooks.session_start import main

            captured = []

            def capture_print(*args, **kwargs):
                captured.append(" ".join(str(a) for a in args))

            with patch("builtins.print", side_effect=capture_print):
                with pytest.raises(SystemExit) as exc:
                    main()
                assert exc.value.code == 0

            # No JSON output with additionalContext expected
            for line in captured:
                try:
                    parsed = json.loads(line)
                    if "hookSpecificOutput" in parsed:
                        assert "additionalContext" not in parsed["hookSpecificOutput"], \
                            "Complete project should not emit additionalContext"
                except (json.JSONDecodeError, ValueError):
                    pass
