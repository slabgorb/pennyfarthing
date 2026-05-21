"""Tests for BC panel focus CLI.

Story 104-1: pf bc CLI command + /bc user skill
Epic: 104 — /bc CLI Panel Focus

Acceptance Criteria:
- [AC1] `pf bc <panel>` writes `focus: <panel>` to config.local.yaml
- [AC2] Preserves all other config keys (theme, display, layout, etc.)
- [AC3] `pf bc reset` removes the `focus` key from config
- [AC4] Invalid panel names rejected with error and non-zero exit
- [AC5] Config file created if missing (with directory)
- [AC6] YAML parse error on existing config reported gracefully
- [AC7] Result objects returned: {success, data?, error?}
- [AC8] get_panel_focus reads current focus state

Tests should FAIL until focus.py is implemented.
"""

from pathlib import Path

import yaml

from pf.bc.focus import (
    VALID_PANELS,
    clear_panel_focus,
    get_panel_focus,
    set_panel_focus,
)

# ---------------------------------------------------------------------------
# AC1: set_panel_focus writes focus key to config.local.yaml
# ---------------------------------------------------------------------------


class TestSetPanelFocus:
    """AC1: set_panel_focus writes the focus key correctly."""

    def test_writes_focus_key(self, pf_config_root) -> None:
        """set_panel_focus should write focus: <panel> to config."""
        pf_config_root.write_config("theme: the-expanse\n")

        result = set_panel_focus("sprint", project_dir=pf_config_root.project_dir)

        assert result["success"] is True
        config = pf_config_root.read_config()
        assert config["focus"] == "sprint"

    def test_writes_each_valid_panel(self, pf_config_root) -> None:
        """set_panel_focus should accept every valid panel name."""
        for panel in VALID_PANELS:
            pf_config_root.write_config("theme: test\n")
            result = set_panel_focus(panel, project_dir=pf_config_root.project_dir)
            assert result["success"] is True, f"Failed for panel: {panel}"
            config = pf_config_root.read_config()
            assert config["focus"] == panel, f"Focus not set for: {panel}"

    def test_returns_panel_in_data(self, tmp_path: Path) -> None:
        """set_panel_focus should return the panel name in data field."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = set_panel_focus("git", project_dir=tmp_path)

        assert result["success"] is True
        assert result["data"] == "git"

    def test_overwrites_existing_focus(self, pf_config_root) -> None:
        """set_panel_focus should overwrite a previously set focus."""
        pf_config_root.write_config("theme: test\nfocus: sprint\n")

        result = set_panel_focus("diffs", project_dir=pf_config_root.project_dir)

        assert result["success"] is True
        config = pf_config_root.read_config()
        assert config["focus"] == "diffs"


# ---------------------------------------------------------------------------
# AC2: Preserves all other config keys
# ---------------------------------------------------------------------------


class TestConfigPreservation:
    """AC2: set_panel_focus preserves existing config keys."""

    def test_preserves_theme(self, tmp_path: Path) -> None:
        """set_panel_focus should not clobber the theme key."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        config_path = config_dir / "config.local.yaml"
        config_path.write_text("theme: the-expanse\ntui:\n  toasts: true\n")

        set_panel_focus("sprint", project_dir=tmp_path)

        config = yaml.safe_load(config_path.read_text())
        assert config["theme"] == "the-expanse"

    def test_preserves_nested_keys(self, pf_config_root) -> None:
        """set_panel_focus should preserve nested config structures."""
        original = {
            "theme": "the-expanse",
            "workflow": {"permission_mode": "accept", "bell_mode": True},
            "tui": {"toasts": True},
        }
        pf_config_root.write_config(yaml.dump(original, default_flow_style=False))

        set_panel_focus("git", project_dir=pf_config_root.project_dir)

        config = pf_config_root.read_config()
        assert config["theme"] == "the-expanse"
        assert config["workflow"]["permission_mode"] == "accept"
        assert config["workflow"]["bell_mode"] is True
        assert config["tui"]["toasts"] is True
        assert config["focus"] == "git"

    def test_preserves_layout_key(self, tmp_path: Path) -> None:
        """set_panel_focus should preserve the layout key (critical for Cyclist)."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        config_path = config_dir / "config.local.yaml"
        original = {
            "theme": "test",
            "layout": {
                "grid": {"root": {"type": "branch"}},
                "panels": {"sprint": {"id": "sprint"}},
            },
        }
        config_path.write_text(yaml.dump(original, default_flow_style=False))

        set_panel_focus("todo", project_dir=tmp_path)

        config = yaml.safe_load(config_path.read_text())
        assert "layout" in config
        assert config["layout"]["grid"]["root"]["type"] == "branch"

    def test_uses_sort_keys_false(self, pf_config_root) -> None:
        """set_panel_focus should write YAML with sort_keys=False."""
        pf_config_root.write_config("theme: test\nworkflow:\n  bell_mode: true\n")

        set_panel_focus("sprint", project_dir=pf_config_root.project_dir)

        raw = pf_config_root.read_text()
        # theme should appear before focus (insertion order preserved)
        theme_pos = raw.index("theme:")
        focus_pos = raw.index("focus:")
        assert theme_pos < focus_pos, "Key order not preserved (sort_keys should be False)"


# ---------------------------------------------------------------------------
# AC3: clear_panel_focus removes the focus key
# ---------------------------------------------------------------------------


class TestClearPanelFocus:
    """AC3: clear_panel_focus removes focus key from config."""

    def test_removes_focus_key(self, pf_config_root) -> None:
        """clear_panel_focus should remove the focus key entirely."""
        pf_config_root.write_config("theme: test\nfocus: sprint\n")

        result = clear_panel_focus(project_dir=pf_config_root.project_dir)

        assert result["success"] is True
        config = pf_config_root.read_config()
        assert "focus" not in config

    def test_preserves_other_keys_on_clear(self, pf_config_root) -> None:
        """clear_panel_focus should preserve other config keys."""
        pf_config_root.write_config(
            "theme: the-expanse\nfocus: git\ntui:\n  toasts: true\n"
        )

        clear_panel_focus(project_dir=pf_config_root.project_dir)

        config = pf_config_root.read_config()
        assert config["theme"] == "the-expanse"
        assert config["tui"]["toasts"] is True
        assert "focus" not in config

    def test_success_when_no_focus_key(self, tmp_path: Path) -> None:
        """clear_panel_focus should succeed even if focus key doesn't exist."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        config_path = config_dir / "config.local.yaml"
        config_path.write_text("theme: test\n")

        result = clear_panel_focus(project_dir=tmp_path)

        assert result["success"] is True

    def test_success_when_no_config_file(self, tmp_path: Path) -> None:
        """clear_panel_focus should succeed even if config file doesn't exist."""
        result = clear_panel_focus(project_dir=tmp_path)

        assert result["success"] is True

    def test_returns_message(self, tmp_path: Path) -> None:
        """clear_panel_focus should return a message field."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("focus: sprint\n")

        result = clear_panel_focus(project_dir=tmp_path)

        assert "message" in result


# ---------------------------------------------------------------------------
# AC4: Invalid panel names rejected
# ---------------------------------------------------------------------------


class TestInvalidPanelValidation:
    """AC4: set_panel_focus rejects invalid panel names."""

    def test_rejects_invalid_panel(self, tmp_path: Path) -> None:
        """set_panel_focus should return error for unknown panel."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = set_panel_focus("nonexistent-panel", project_dir=tmp_path)

        assert result["success"] is False
        assert "error" in result

    def test_rejects_empty_string(self, tmp_path: Path) -> None:
        """set_panel_focus should reject empty string as panel name."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = set_panel_focus("", project_dir=tmp_path)

        assert result["success"] is False

    def test_rejects_message_panel(self, tmp_path: Path) -> None:
        """set_panel_focus should reject 'message' (sacred center, not focusable)."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = set_panel_focus("message", project_dir=tmp_path)

        assert result["success"] is False

    def test_error_lists_valid_panels(self, tmp_path: Path) -> None:
        """set_panel_focus error should list valid panel names."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = set_panel_focus("invalid", project_dir=tmp_path)

        assert result["success"] is False
        error_msg = result["error"]
        # Should mention at least a few valid panels
        assert "sprint" in error_msg
        assert "git" in error_msg

    def test_does_not_write_config_on_invalid(self, tmp_path: Path) -> None:
        """set_panel_focus should not modify config for invalid panel."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        config_path = config_dir / "config.local.yaml"
        original_content = "theme: test\n"
        config_path.write_text(original_content)

        set_panel_focus("bogus", project_dir=tmp_path)

        assert config_path.read_text() == original_content


# ---------------------------------------------------------------------------
# AC5: Config file created if missing
# ---------------------------------------------------------------------------


class TestConfigCreation:
    """AC5: set_panel_focus creates config file and directory if needed."""

    def test_creates_config_when_missing(self, pf_config_root) -> None:
        """set_panel_focus should create config.local.yaml if it doesn't exist."""
        # No config file exists yet

        result = set_panel_focus("sprint", project_dir=pf_config_root.project_dir)

        assert result["success"] is True
        assert pf_config_root.config_path.exists()
        config = pf_config_root.read_config()
        assert config["focus"] == "sprint"

    def test_creates_directory_when_missing(self, pf_config_root) -> None:
        """set_panel_focus should create parent directories if needed."""
        # No config dir exists yet (pf_config_root does not pre-create it)

        result = set_panel_focus("git", project_dir=pf_config_root.project_dir)

        assert result["success"] is True
        assert pf_config_root.config_path.exists()

    def test_new_config_has_only_focus(self, pf_config_root) -> None:
        """New config should contain only the focus key (no garbage)."""
        set_panel_focus("todo", project_dir=pf_config_root.project_dir)

        config = pf_config_root.read_config()
        assert config == {"focus": "todo"}


# ---------------------------------------------------------------------------
# AC6: YAML parse error handled gracefully
# ---------------------------------------------------------------------------


class TestYamlErrorHandling:
    """AC6: Corrupted config handled gracefully."""

    def test_handles_corrupted_yaml(self, pf_config_root) -> None:
        """set_panel_focus should return error on corrupted YAML."""
        pf_config_root.write_config(":\n  - :\n    invalid: [yaml: {broken")

        result = set_panel_focus("sprint", project_dir=pf_config_root.project_dir)

        assert result["success"] is False
        assert "error" in result

    def test_handles_non_dict_yaml(self, tmp_path: Path) -> None:
        """set_panel_focus should handle YAML that parses to non-dict (e.g. list)."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        config_path = config_dir / "config.local.yaml"
        config_path.write_text("- item1\n- item2\n")

        result = set_panel_focus("sprint", project_dir=tmp_path)

        # Should either handle gracefully or start fresh
        assert result["success"] is True or "error" in result

    def test_handles_empty_config_file(self, pf_config_root) -> None:
        """set_panel_focus should handle empty config file."""
        pf_config_root.write_config("")

        result = set_panel_focus("sprint", project_dir=pf_config_root.project_dir)

        assert result["success"] is True
        config = pf_config_root.read_config()
        assert config["focus"] == "sprint"


# ---------------------------------------------------------------------------
# AC7: Result objects have correct shape
# ---------------------------------------------------------------------------


class TestResultObjects:
    """AC7: Functions return proper result objects."""

    def test_set_success_has_success_and_data(self, tmp_path: Path) -> None:
        """Successful set should return {success: True, data: panel}."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = set_panel_focus("sprint", project_dir=tmp_path)

        assert isinstance(result, dict)
        assert "success" in result
        assert result["success"] is True
        assert "data" in result

    def test_set_error_has_success_and_error(self, tmp_path: Path) -> None:
        """Failed set should return {success: False, error: message}."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = set_panel_focus("invalid-panel", project_dir=tmp_path)

        assert isinstance(result, dict)
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)

    def test_clear_success_has_success_and_message(self, tmp_path: Path) -> None:
        """Successful clear should return {success: True, message: str}."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("focus: sprint\n")

        result = clear_panel_focus(project_dir=tmp_path)

        assert isinstance(result, dict)
        assert result["success"] is True
        assert "message" in result


# ---------------------------------------------------------------------------
# AC8: get_panel_focus reads current focus state
# ---------------------------------------------------------------------------


class TestGetPanelFocus:
    """AC8: get_panel_focus reads the current focus setting."""

    def test_reads_current_focus(self, pf_config_root) -> None:
        """get_panel_focus should return the current focus panel name."""
        pf_config_root.write_config("theme: test\nfocus: sprint\n")

        result = get_panel_focus(project_dir=pf_config_root.project_dir)

        assert result["success"] is True
        assert result["focus"] == "sprint"

    def test_returns_none_when_no_focus(self, tmp_path: Path) -> None:
        """get_panel_focus should return focus: None when no focus set."""
        config_dir = tmp_path / ".pennyfarthing"
        config_dir.mkdir()
        (config_dir / "config.local.yaml").write_text("theme: test\n")

        result = get_panel_focus(project_dir=tmp_path)

        assert result["success"] is True
        assert result["focus"] is None

    def test_returns_none_when_no_config(self, tmp_path: Path) -> None:
        """get_panel_focus should return focus: None when config doesn't exist."""
        result = get_panel_focus(project_dir=tmp_path)

        assert result["success"] is True
        assert result["focus"] is None


# ---------------------------------------------------------------------------
# VALID_PANELS constant tests
# ---------------------------------------------------------------------------


class TestValidPanels:
    """Verify the VALID_PANELS constant is correct."""

    def test_contains_all_expected_panels(self) -> None:
        """VALID_PANELS should contain all Frame TUI + Cyclist panels."""
        expected = {
            "sprint",
            "git",
            "diffs",
            "todo",
            "workflow",
            "progress",
            "audit-log",
            "ac",
            "debug",
            "settings",
            "tty",
        }
        assert set(VALID_PANELS) == expected

    def test_does_not_contain_message(self) -> None:
        """VALID_PANELS should NOT contain 'message' (sacred center)."""
        assert "message" not in VALID_PANELS

    def test_panel_count(self) -> None:
        """VALID_PANELS should have exactly 11 entries."""
        assert len(VALID_PANELS) == 11
