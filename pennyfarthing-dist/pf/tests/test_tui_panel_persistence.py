"""Tests for BikeRack TUI panel persistence (extend ERB mechanism).

Story 103-8: Panel persistence (extend ERB mechanism)
Epic: 103 — BikeRack TUI
Jira: MSSCI-14963

Acceptance Criteria:
- [AC1] get_last_panel() reads last_panel from config.local.yaml
- [AC2] save_last_panel() writes last_panel to config.local.yaml
- [AC3] TUI restores last-viewed panel on startup (defaults to sprint)
- [AC4] TUI persists panel on focus change
- [AC5] Single source of truth — ERB and TUI share config.local.yaml:last_panel

Tests should FAIL until persistence is implemented in bc/focus.py and tui.py.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from ruamel.yaml import YAML

from pf.bc.focus import (
    VALID_PANELS,
    get_last_panel,
    save_last_panel,
)
from pf.bikerack.tui import BikeRackApp
from pf.bikerack.ws_client import WheelHubClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_config_dir(tmp_path: Path) -> Path:
    """Create .pennyfarthing dir in tmp_path, return project root."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir(parents=True, exist_ok=True)
    return tmp_path


def _write_config(project_dir: Path, content: str) -> None:
    """Write config.local.yaml content."""
    config_path = project_dir / ".pennyfarthing" / "config.local.yaml"
    config_path.write_text(content)


def _read_config(project_dir: Path) -> dict:
    """Read config.local.yaml as dict."""
    config_path = project_dir / ".pennyfarthing" / "config.local.yaml"
    yml = YAML()
    return dict(yml.load(config_path.read_text()) or {})


def focus_msg(panel: str | None, msg_type: str = "update") -> dict:
    """Create a focus message matching the FocusMessage contract."""
    return {"type": msg_type, "focus": panel}


def make_app(client=None, project_dir=None):
    """Create a BikeRackApp with optional mock client and project_dir."""
    if client is None:
        client = MagicMock(spec=WheelHubClient)
    return BikeRackApp(client=client)


# ---------------------------------------------------------------------------
# AC1: get_last_panel reads last_panel from config.local.yaml
# ---------------------------------------------------------------------------


class TestGetLastPanel:
    """AC1: get_last_panel reads persisted panel from config."""

    def test_returns_saved_panel_name(self, tmp_path: Path) -> None:
        """Should return panel name when last_panel key exists in config."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\nlast_panel: git\n")

        result = get_last_panel(project_dir=project_dir)

        assert result["success"] is True, f"Expected success, got: {result}"
        assert result["last_panel"] == "git", (
            f"Expected last_panel='git', got '{result.get('last_panel')}'"
        )

    def test_returns_none_when_key_not_present(self, tmp_path: Path) -> None:
        """Should return None when last_panel key doesn't exist."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\n")

        result = get_last_panel(project_dir=project_dir)

        assert result["success"] is True, f"Expected success, got: {result}"
        assert result["last_panel"] is None, (
            f"Expected last_panel=None, got '{result.get('last_panel')}'"
        )

    def test_returns_none_when_config_missing(self, tmp_path: Path) -> None:
        """Should return None when config file doesn't exist."""
        # Don't create .pennyfarthing dir
        result = get_last_panel(project_dir=tmp_path)

        assert result["success"] is True, f"Expected success, got: {result}"
        assert result["last_panel"] is None

    def test_returns_none_when_last_panel_is_null(self, tmp_path: Path) -> None:
        """Should return None when last_panel is explicitly null."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "last_panel: null\n")

        result = get_last_panel(project_dir=project_dir)

        assert result["success"] is True
        assert result["last_panel"] is None

    def test_returns_none_for_invalid_panel(self, tmp_path: Path) -> None:
        """Should return None for a panel name not in VALID_PANELS."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "last_panel: nonexistent_panel\n")

        result = get_last_panel(project_dir=project_dir)

        assert result["success"] is True
        assert result["last_panel"] is None, (
            "Invalid panel names should be treated as no saved state"
        )

    def test_returns_all_valid_panels(self, tmp_path: Path) -> None:
        """Should return any valid panel name correctly."""
        project_dir = _make_config_dir(tmp_path)

        for panel in VALID_PANELS:
            _write_config(project_dir, f"last_panel: {panel}\n")
            result = get_last_panel(project_dir=project_dir)
            assert result["success"] is True
            assert result["last_panel"] == panel, (
                f"Expected last_panel='{panel}', got '{result.get('last_panel')}'"
            )


# ---------------------------------------------------------------------------
# AC2: save_last_panel writes last_panel to config.local.yaml
# ---------------------------------------------------------------------------


class TestSaveLastPanel:
    """AC2: save_last_panel persists panel to config."""

    def test_writes_panel_to_config(self, tmp_path: Path) -> None:
        """Should write last_panel key to config.local.yaml."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\n")

        result = save_last_panel("sprint", project_dir=project_dir)

        assert result["success"] is True, f"Expected success, got: {result}"
        config = _read_config(project_dir)
        assert config.get("last_panel") == "sprint", (
            f"Expected last_panel='sprint' in config, got: {config}"
        )

    def test_preserves_other_config_keys(self, tmp_path: Path) -> None:
        """Should not clobber existing config keys when saving."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(
            project_dir,
            "theme: fifth-element\nfocus: diffs\nbell_mode: true\n",
        )

        result = save_last_panel("git", project_dir=project_dir)

        assert result["success"] is True
        config = _read_config(project_dir)
        assert config.get("theme") == "fifth-element", "theme should be preserved"
        assert config.get("focus") == "diffs", "focus should be preserved"
        assert config.get("bell_mode") is True, "bell_mode should be preserved"
        assert config.get("last_panel") == "git"

    def test_creates_config_if_missing(self, tmp_path: Path) -> None:
        """Should create config file if it doesn't exist."""
        project_dir = _make_config_dir(tmp_path)
        # .pennyfarthing dir exists but no config.local.yaml

        result = save_last_panel("workflow", project_dir=project_dir)

        assert result["success"] is True
        config = _read_config(project_dir)
        assert config.get("last_panel") == "workflow"

    def test_rejects_invalid_panel(self, tmp_path: Path) -> None:
        """Should reject panel names not in VALID_PANELS."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\n")

        result = save_last_panel("nonexistent", project_dir=project_dir)

        assert result["success"] is False, (
            "Invalid panel name should be rejected"
        )
        config = _read_config(project_dir)
        assert "last_panel" not in config, (
            "Invalid panel should not be written to config"
        )

    def test_overwrites_existing_last_panel(self, tmp_path: Path) -> None:
        """Should overwrite existing last_panel value."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "last_panel: sprint\n")

        result = save_last_panel("git", project_dir=project_dir)

        assert result["success"] is True
        config = _read_config(project_dir)
        assert config.get("last_panel") == "git", (
            f"Expected last_panel='git' after overwrite, got: {config}"
        )


# ---------------------------------------------------------------------------
# AC3: TUI restores last-viewed panel on startup
# ---------------------------------------------------------------------------


class TestTuiRestore:
    """AC3: BikeRackApp restores last-viewed panel on mount."""

    def test_restores_last_panel_on_mount(self, tmp_path: Path) -> None:
        """on_mount should read last_panel from config and set _focused_panel."""
        import asyncio

        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "last_panel: git\n")

        client = MagicMock(spec=WheelHubClient)
        app = BikeRackApp(client=client)

        loop = asyncio.new_event_loop()
        try:
            with patch.object(BikeRackApp, "run_worker"), \
                 patch(
                     "pf.bikerack.tui.get_last_panel",
                     return_value={"success": True, "last_panel": "git"},
                 ):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        assert app._focused_panel == "git", (
            f"Expected _focused_panel='git' after restore, got '{app._focused_panel}'"
        )

    def test_defaults_to_none_when_no_saved_state(self, tmp_path: Path) -> None:
        """on_mount should leave _focused_panel as None when no last_panel saved.

        Sprint is the default panel by compose() — _focused_panel=None means
        no override, so SprintPanel shows by default.
        """
        import asyncio

        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\n")

        client = MagicMock(spec=WheelHubClient)
        app = BikeRackApp(client=client)

        loop = asyncio.new_event_loop()
        try:
            with patch.object(BikeRackApp, "run_worker"), \
                 patch(
                     "pf.bikerack.tui.get_last_panel",
                     return_value={"success": True, "last_panel": None},
                 ):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        # _focused_panel should remain None (Sprint is default via compose)
        assert app._focused_panel is None, (
            "No saved state → _focused_panel should be None (Sprint is compose default)"
        )

    def test_handles_config_error_gracefully(self, tmp_path: Path) -> None:
        """on_mount should not crash if config read fails."""
        import asyncio

        client = MagicMock(spec=WheelHubClient)
        app = BikeRackApp(client=client)

        loop = asyncio.new_event_loop()
        try:
            with patch.object(BikeRackApp, "run_worker"), \
                 patch(
                     "pf.bikerack.tui.get_last_panel",
                     return_value={"success": False, "error": "File not found"},
                 ):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        # Should not raise — graceful fallback
        assert app._focused_panel is None


# ---------------------------------------------------------------------------
# AC4: TUI persists panel on focus change
# ---------------------------------------------------------------------------


class TestTuiPersist:
    """AC4: BikeRackApp saves last_panel when focus changes."""

    def test_persists_panel_on_focus_update(self, tmp_path: Path) -> None:
        """_handle_focus_message should save panel to config when focus changes."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\n")

        app = make_app()

        with patch(
            "pf.bikerack.tui.save_last_panel"
        ) as mock_save:
            mock_save.return_value = {"success": True, "data": "git"}
            app._handle_focus_message(focus_msg("git"))

        mock_save.assert_called_once_with("git", project_dir=None)

    def test_does_not_persist_null_focus(self) -> None:
        """Reset (null focus) should NOT overwrite saved last_panel."""
        app = make_app()
        app._handle_focus_message(focus_msg("sprint"))

        with patch(
            "pf.bikerack.tui.save_last_panel"
        ) as mock_save:
            app._handle_focus_message(focus_msg(None))

        mock_save.assert_not_called(), (
            "Null focus (reset) should not overwrite the saved last_panel"
        )

    def test_sequential_changes_update_last_panel(self) -> None:
        """Multiple panel switches should each persist the new panel."""
        app = make_app()

        with patch(
            "pf.bikerack.tui.save_last_panel"
        ) as mock_save:
            mock_save.return_value = {"success": True}
            app._handle_focus_message(focus_msg("sprint"))
            app._handle_focus_message(focus_msg("git"))
            app._handle_focus_message(focus_msg("diffs"))

        # Should have saved each panel switch
        assert mock_save.call_count == 3, (
            f"Expected 3 save calls for 3 switches, got {mock_save.call_count}"
        )

    def test_does_not_persist_init_messages(self) -> None:
        """Init messages should not trigger persistence."""
        app = make_app()

        with patch(
            "pf.bikerack.tui.save_last_panel"
        ) as mock_save:
            app._handle_focus_message(focus_msg("sprint", msg_type="init"))

        mock_save.assert_not_called(), (
            "Init messages should not trigger persistence"
        )


# ---------------------------------------------------------------------------
# AC5: Single source of truth — shared config key
# ---------------------------------------------------------------------------


class TestSharedConfigKey:
    """AC5: ERB and TUI share config.local.yaml:last_panel key."""

    def test_config_key_is_last_panel(self, tmp_path: Path) -> None:
        """The shared key should be 'last_panel' in config.local.yaml."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\n")

        # Save via Python function
        save_result = save_last_panel("diffs", project_dir=project_dir)
        assert save_result["success"] is True

        # Read raw YAML — verify the key is 'last_panel'
        config = _read_config(project_dir)
        assert "last_panel" in config, (
            "Persistence should use 'last_panel' key in config.local.yaml"
        )
        assert config["last_panel"] == "diffs"

    def test_roundtrip_read_after_write(self, tmp_path: Path) -> None:
        """Reading after writing should return the saved panel."""
        project_dir = _make_config_dir(tmp_path)
        _write_config(project_dir, "theme: fifth-element\n")

        save_result = save_last_panel("workflow", project_dir=project_dir)
        assert save_result["success"] is True

        read_result = get_last_panel(project_dir=project_dir)
        assert read_result["success"] is True
        assert read_result["last_panel"] == "workflow", (
            f"Roundtrip failed: saved 'workflow', read '{read_result.get('last_panel')}'"
        )
