"""
Tests for named layout management via /bc (Story 104-4).

These tests verify save, load, list, clear, and clear-all operations
for named layouts stored in config.local.yaml under the `layouts` key.

Run with: python -m pytest tests/python/test_bc_named_layouts.py -v
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.bc.focus import (
    clear_all_named_layouts,
    clear_named_layout,
    list_named_layouts,
    load_named_layout,
    save_named_layout,
    validate_layout_name,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_LAYOUT = {
    "grid": {
        "root": {
            "type": "leaf",
            "data": {"views": ["sprint"], "activeView": "sprint", "id": "g1"},
            "size": 1,
        },
        "width": 1,
        "height": 1,
        "orientation": "HORIZONTAL",
    },
    "panels": {
        "sprint": {
            "id": "sprint",
            "contentComponent": "PanelAdapter",
            "title": "sprint",
            "params": {"panelId": "sprint"},
        }
    },
    "activeGroup": "g1",
}

SAMPLE_LAYOUT_2 = {
    "grid": {
        "root": {
            "type": "leaf",
            "data": {"views": ["debug", "git"], "activeView": "debug", "id": "g2"},
            "size": 1,
        },
        "width": 1,
        "height": 1,
        "orientation": "HORIZONTAL",
    },
    "panels": {
        "debug": {
            "id": "debug",
            "contentComponent": "PanelAdapter",
            "title": "debug",
            "params": {"panelId": "debug"},
        },
        "git": {
            "id": "git",
            "contentComponent": "PanelAdapter",
            "title": "git",
            "params": {"panelId": "git"},
        },
    },
    "activeGroup": "g2",
}


@pytest.fixture()
def project_dir(tmp_path: Path) -> Path:
    """Create a temporary project directory with config.local.yaml."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    config_path = pf_dir / "config.local.yaml"
    config_path.write_text(yaml.dump({"focus": None}, default_flow_style=False))
    return tmp_path


@pytest.fixture()
def project_dir_with_layouts(tmp_path: Path) -> Path:
    """Create project dir pre-populated with two named layouts."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    config_path = pf_dir / "config.local.yaml"
    config = {
        "focus": None,
        "layouts": {
            "debug_layout": SAMPLE_LAYOUT,
            "perf_layout": SAMPLE_LAYOUT_2,
        },
    }
    config_path.write_text(yaml.dump(config, default_flow_style=False))
    return tmp_path


# ---------------------------------------------------------------------------
# AC7: Name validation
# ---------------------------------------------------------------------------


class TestValidateLayoutName:
    """AC7: Invalid layout names are rejected (alphanumeric + underscore only)."""

    def test_valid_alphanumeric(self):
        assert validate_layout_name("debug_layout") is True

    def test_valid_all_lowercase(self):
        assert validate_layout_name("tdd") is True

    def test_valid_with_numbers(self):
        assert validate_layout_name("layout3") is True

    def test_valid_underscore_only_separator(self):
        assert validate_layout_name("my_custom_layout") is True

    def test_valid_uppercase(self):
        assert validate_layout_name("DebugLayout") is True

    def test_reject_spaces(self):
        assert validate_layout_name("my layout") is False

    def test_reject_hyphens(self):
        assert validate_layout_name("my-layout") is False

    def test_reject_special_chars(self):
        assert validate_layout_name("layout!@#") is False

    def test_reject_dots(self):
        assert validate_layout_name("my.layout") is False

    def test_reject_empty_string(self):
        assert validate_layout_name("") is False

    def test_reject_slashes(self):
        assert validate_layout_name("path/layout") is False


# ---------------------------------------------------------------------------
# AC1: /bc save <name> saves layout to config.local.yaml
# ---------------------------------------------------------------------------


class TestSaveNamedLayout:
    """AC1: /bc save <name> saves the current dockview layout."""

    def test_save_layout_success(self, project_dir: Path):
        result = save_named_layout("debug_layout", SAMPLE_LAYOUT, project_dir)
        assert result["success"] is True
        assert result["data"] == "debug_layout"

    def test_save_layout_persists_to_yaml(self, project_dir: Path):
        save_named_layout("debug_layout", SAMPLE_LAYOUT, project_dir)
        config = yaml.safe_load(
            (project_dir / ".pennyfarthing" / "config.local.yaml").read_text()
        )
        assert "layouts" in config
        assert "debug_layout" in config["layouts"]
        assert config["layouts"]["debug_layout"] == SAMPLE_LAYOUT

    def test_save_multiple_layouts(self, project_dir: Path):
        save_named_layout("layout_a", SAMPLE_LAYOUT, project_dir)
        save_named_layout("layout_b", SAMPLE_LAYOUT_2, project_dir)
        config = yaml.safe_load(
            (project_dir / ".pennyfarthing" / "config.local.yaml").read_text()
        )
        assert len(config["layouts"]) == 2

    def test_save_overwrites_existing_name(self, project_dir_with_layouts: Path):
        result = save_named_layout(
            "debug_layout", SAMPLE_LAYOUT_2, project_dir_with_layouts
        )
        assert result["success"] is True
        config = yaml.safe_load(
            (
                project_dir_with_layouts / ".pennyfarthing" / "config.local.yaml"
            ).read_text()
        )
        assert config["layouts"]["debug_layout"] == SAMPLE_LAYOUT_2

    def test_save_preserves_existing_config(self, project_dir: Path):
        """Existing config keys (focus, theme, etc.) must survive save."""
        config_path = project_dir / ".pennyfarthing" / "config.local.yaml"
        config_path.write_text(
            yaml.dump(
                {"focus": "sprint", "theme": "fifth-element"},
                default_flow_style=False,
            )
        )
        save_named_layout("my_layout", SAMPLE_LAYOUT, project_dir)
        config = yaml.safe_load(config_path.read_text())
        assert config["focus"] == "sprint"
        assert config["theme"] == "fifth-element"

    def test_save_rejects_invalid_name(self, project_dir: Path):
        result = save_named_layout("bad name!", SAMPLE_LAYOUT, project_dir)
        assert result["success"] is False
        assert "error" in result

    def test_save_rejects_empty_name(self, project_dir: Path):
        result = save_named_layout("", SAMPLE_LAYOUT, project_dir)
        assert result["success"] is False


# ---------------------------------------------------------------------------
# AC2: /bc load <name> loads a previously saved layout
# ---------------------------------------------------------------------------


class TestLoadNamedLayout:
    """AC2: /bc load <name> loads a previously saved layout."""

    def test_load_existing_layout(self, project_dir_with_layouts: Path):
        result = load_named_layout("debug_layout", project_dir_with_layouts)
        assert result["success"] is True
        assert result["data"] == SAMPLE_LAYOUT

    def test_load_returns_full_layout_data(self, project_dir_with_layouts: Path):
        result = load_named_layout("perf_layout", project_dir_with_layouts)
        assert result["success"] is True
        assert "grid" in result["data"]
        assert "panels" in result["data"]

    def test_load_nonexistent_layout_fails(self, project_dir_with_layouts: Path):
        """AC8: Attempting to load a non-existent named layout shows error."""
        result = load_named_layout("does_not_exist", project_dir_with_layouts)
        assert result["success"] is False
        assert "error" in result

    def test_load_rejects_invalid_name(self, project_dir: Path):
        result = load_named_layout("bad-name", project_dir)
        assert result["success"] is False

    def test_load_with_no_layouts_key(self, project_dir: Path):
        """Config exists but has no layouts key at all."""
        result = load_named_layout("anything", project_dir)
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# AC3: /bc list displays all saved named layouts
# ---------------------------------------------------------------------------


class TestListNamedLayouts:
    """AC3: /bc list displays all saved named layouts."""

    def test_list_returns_layout_names(self, project_dir_with_layouts: Path):
        result = list_named_layouts(project_dir_with_layouts)
        assert result["success"] is True
        assert sorted(result["data"]) == ["debug_layout", "perf_layout"]

    def test_list_empty_when_no_layouts(self, project_dir: Path):
        result = list_named_layouts(project_dir)
        assert result["success"] is True
        assert result["data"] == []

    def test_list_after_save(self, project_dir: Path):
        save_named_layout("new_one", SAMPLE_LAYOUT, project_dir)
        result = list_named_layouts(project_dir)
        assert result["success"] is True
        assert "new_one" in result["data"]


# ---------------------------------------------------------------------------
# AC4: /bc clear <name> deletes a named layout
# ---------------------------------------------------------------------------


class TestClearNamedLayout:
    """AC4: /bc clear <name> deletes a named layout."""

    def test_clear_existing_layout(self, project_dir_with_layouts: Path):
        result = clear_named_layout("debug_layout", project_dir_with_layouts)
        assert result["success"] is True
        # Verify it's gone
        config = yaml.safe_load(
            (
                project_dir_with_layouts / ".pennyfarthing" / "config.local.yaml"
            ).read_text()
        )
        assert "debug_layout" not in config.get("layouts", {})

    def test_clear_preserves_other_layouts(self, project_dir_with_layouts: Path):
        clear_named_layout("debug_layout", project_dir_with_layouts)
        config = yaml.safe_load(
            (
                project_dir_with_layouts / ".pennyfarthing" / "config.local.yaml"
            ).read_text()
        )
        assert "perf_layout" in config["layouts"]

    def test_clear_nonexistent_layout(self, project_dir_with_layouts: Path):
        result = clear_named_layout("ghost", project_dir_with_layouts)
        assert result["success"] is False
        assert "error" in result

    def test_clear_rejects_invalid_name(self, project_dir: Path):
        result = clear_named_layout("bad name", project_dir)
        assert result["success"] is False


# ---------------------------------------------------------------------------
# AC5: /bc clear-all deletes all named layouts
# ---------------------------------------------------------------------------


class TestClearAllNamedLayouts:
    """AC5: /bc clear-all deletes all named layouts."""

    def test_clear_all_removes_layouts(self, project_dir_with_layouts: Path):
        result = clear_all_named_layouts(project_dir_with_layouts)
        assert result["success"] is True
        config = yaml.safe_load(
            (
                project_dir_with_layouts / ".pennyfarthing" / "config.local.yaml"
            ).read_text()
        )
        layouts = config.get("layouts", {})
        assert layouts is None or layouts == {}

    def test_clear_all_preserves_other_config(self, project_dir_with_layouts: Path):
        config_path = (
            project_dir_with_layouts / ".pennyfarthing" / "config.local.yaml"
        )
        config = yaml.safe_load(config_path.read_text())
        config["theme"] = "fifth-element"
        config_path.write_text(yaml.dump(config, default_flow_style=False))

        clear_all_named_layouts(project_dir_with_layouts)

        config = yaml.safe_load(config_path.read_text())
        assert config.get("theme") == "fifth-element"

    def test_clear_all_when_no_layouts(self, project_dir: Path):
        result = clear_all_named_layouts(project_dir)
        assert result["success"] is True


# ---------------------------------------------------------------------------
# AC6: Saved layouts persist across restarts
# ---------------------------------------------------------------------------


class TestLayoutPersistence:
    """AC6: Saved layouts persist across Cyclist restarts (config file survives)."""

    def test_save_then_fresh_load(self, project_dir: Path):
        """Save a layout, then load it via a fresh function call (simulates restart)."""
        save_named_layout("persist_test", SAMPLE_LAYOUT, project_dir)

        # Simulate "restart" by reading fresh from disk
        result = load_named_layout("persist_test", project_dir)
        assert result["success"] is True
        assert result["data"] == SAMPLE_LAYOUT

    def test_multiple_saves_all_persist(self, project_dir: Path):
        save_named_layout("layout_a", SAMPLE_LAYOUT, project_dir)
        save_named_layout("layout_b", SAMPLE_LAYOUT_2, project_dir)

        result = list_named_layouts(project_dir)
        assert result["success"] is True
        assert sorted(result["data"]) == ["layout_a", "layout_b"]


# ---------------------------------------------------------------------------
# CLI integration tests (Click runner)
# ---------------------------------------------------------------------------


class TestCLISaveCommand:
    """CLI: pf bc save <name> invokes save_named_layout."""

    def test_save_command_exists(self):
        """The save subcommand should be registered on the bc group."""
        from click.testing import CliRunner

        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["save", "--help"])
        assert result.exit_code == 0
        assert "save" in result.output.lower() or "Save" in result.output


class TestCLILoadCommand:
    """CLI: pf bc load <name> invokes load_named_layout."""

    def test_load_command_exists(self):
        from click.testing import CliRunner

        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["load", "--help"])
        assert result.exit_code == 0


class TestCLIListCommand:
    """CLI: pf bc list shows all saved layouts."""

    def test_list_command_exists(self):
        from click.testing import CliRunner

        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["list"])
        # Should succeed even if empty
        assert result.exit_code == 0


class TestCLIClearCommand:
    """CLI: pf bc clear <name> deletes a layout."""

    def test_clear_command_exists(self):
        from click.testing import CliRunner

        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["clear", "--help"])
        assert result.exit_code == 0


class TestCLIClearAllCommand:
    """CLI: pf bc clear-all deletes all layouts."""

    def test_clear_all_command_exists(self):
        from click.testing import CliRunner

        from pf.bc.cli import bc

        runner = CliRunner()
        result = runner.invoke(bc, ["clear-all"])
        assert result.exit_code == 0
