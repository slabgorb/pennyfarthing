"""Tests for BikeRack TUI panel header chrome (Story 103-9).

Verifies:
  AC1: Panel header/footer displays current panel name
  AC2: Each panel type has a Nerd Font icon
  AC3: Icon and name are visible at all times
  AC4: Active panel indicator updates when switching panels
  AC5: Icon rendering works across terminal types (ASCII fallback)

Run with: python -m pytest tests/python/test_bikerack_panel_chrome.py -v
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from pennyfarthing_scripts.bikerack.base_panel import (
    PANEL_ICONS,
    BasePanel,
    get_panel_icon,
)
from pennyfarthing_scripts.bikerack.sprint_panel import SprintPanel
from pennyfarthing_scripts.bikerack.tui import (
    PANEL_DISPLAY_NAMES,
    BikeRackApp,
    PanelTabBar,
)
from pennyfarthing_scripts.bc.focus import VALID_PANELS


# ---------------------------------------------------------------------------
# AC1: Panel header/footer displays current panel name
# ---------------------------------------------------------------------------


class TestPanelNameDisplay:
    """AC1: Panel name is visible in the TUI."""

    async def test_tab_bar_widget_exists(self):
        """App should have a PanelTabBar widget."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            tab_bar = app.query("#tab-bar")
            assert len(tab_bar) > 0, "App should have a tab bar widget"

    async def test_tab_bar_shows_name(self):
        """PanelTabBar should display panel names."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            rendered = tab_bar.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            # Should show at least Sprint (default active panel)
            assert "Sprint" in text, f"Tab bar should show 'Sprint', got: '{text}'"

    def test_all_valid_panels_have_display_names(self):
        """Every panel in VALID_PANELS should have a display name."""
        for panel in VALID_PANELS:
            assert panel in PANEL_DISPLAY_NAMES, (
                f"Panel '{panel}' missing from PANEL_DISPLAY_NAMES"
            )


# ---------------------------------------------------------------------------
# AC2: Each panel type has a Nerd Font icon
# ---------------------------------------------------------------------------


class TestPanelIcons:
    """AC2: Each panel type has a Nerd Font icon."""

    def test_all_valid_panels_have_icons(self):
        """Every panel in VALID_PANELS should have an icon entry."""
        for panel in VALID_PANELS:
            assert panel in PANEL_ICONS, (
                f"Panel '{panel}' missing from PANEL_ICONS"
            )

    def test_icon_entries_have_nerd_font_and_fallback(self):
        """Each PANEL_ICONS entry should be a (nerd_font, ascii) tuple."""
        for name, entry in PANEL_ICONS.items():
            assert isinstance(entry, tuple), f"PANEL_ICONS['{name}'] should be a tuple"
            assert len(entry) == 2, f"PANEL_ICONS['{name}'] should have 2 elements"
            nerd, ascii_fb = entry
            assert isinstance(nerd, str) and len(nerd) > 0, (
                f"PANEL_ICONS['{name}'][0] should be non-empty Nerd Font string"
            )
            assert isinstance(ascii_fb, str) and len(ascii_fb) > 0, (
                f"PANEL_ICONS['{name}'][1] should be non-empty ASCII fallback"
            )

    def test_get_panel_icon_nerd_font(self):
        """get_panel_icon should return the Nerd Font glyph by default."""
        icon = get_panel_icon("sprint")
        assert icon == PANEL_ICONS["sprint"][0]

    def test_get_panel_icon_ascii_fallback(self):
        """get_panel_icon with use_nerd_font=False should return ASCII."""
        icon = get_panel_icon("sprint", use_nerd_font=False)
        assert icon == PANEL_ICONS["sprint"][1]

    def test_get_panel_icon_unknown_panel(self):
        """get_panel_icon with unknown panel should return empty string."""
        icon = get_panel_icon("nonexistent")
        assert icon == ""

    def test_sprint_panel_has_icon(self):
        """SprintPanel should have icon and panel_name set."""
        assert SprintPanel.icon != ""
        assert SprintPanel.panel_name == "Sprint"

    def test_base_panel_has_empty_defaults(self):
        """BasePanel should have empty icon and panel_name by default."""
        assert BasePanel.icon == ""
        assert BasePanel.panel_name == ""


# ---------------------------------------------------------------------------
# AC3: Icon and name are visible at all times
# ---------------------------------------------------------------------------


class TestIconVisibility:
    """AC3: Icon and name visible at all times."""

    async def test_tab_bar_visible_on_launch(self):
        """PanelTabBar should be rendered on app launch."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            rendered = tab_bar.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            assert len(text.strip()) > 0, "Tab bar should not be empty on launch"

    async def test_tab_bar_contains_icon_character(self):
        """PanelTabBar should contain icon characters."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            rendered = tab_bar.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            has_non_ascii = any(ord(c) > 127 for c in text)
            assert has_non_ascii, (
                f"Tab bar should contain Nerd Font icons (non-ASCII chars), got: '{text}'"
            )


# ---------------------------------------------------------------------------
# AC4: Active panel indicator updates when switching panels
# ---------------------------------------------------------------------------


class TestPanelSwitching:
    """AC4: Tab bar updates on panel switch."""

    async def test_tab_bar_updates_on_focus_message(self):
        """PanelTabBar should update when focus message arrives."""
        client = MagicMock()
        client.connect = AsyncMock()
        app = BikeRackApp(client=client)
        async with app.run_test() as pilot:
            # Simulate focus switch to git
            app._handle_focus_message({"type": "update", "focus": "git"})
            await pilot.pause()

            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            assert tab_bar.active == "git"
            rendered = tab_bar.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            assert "Git" in text, f"Tab bar should show 'Git' after switch, got: '{text}'"

    async def test_tab_bar_updates_multiple_switches(self):
        """Tab bar should track multiple panel switches."""
        client = MagicMock()
        client.connect = AsyncMock()
        app = BikeRackApp(client=client)
        async with app.run_test() as pilot:
            for panel in ["git", "diffs", "changed", "sprint"]:
                app._handle_focus_message({"type": "update", "focus": panel})
                await pilot.pause()

            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            assert tab_bar.active == "sprint"

    async def test_tab_bar_ignores_non_update_messages(self):
        """Tab bar should not change on 'init' type messages."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            original_active = tab_bar.active

            app._handle_focus_message({"type": "init", "focus": "git"})
            await pilot.pause()

            assert tab_bar.active == original_active

    async def test_tab_bar_ignores_null_focus(self):
        """When focus is null, tab bar keeps last panel."""
        client = MagicMock()
        client.connect = AsyncMock()
        app = BikeRackApp(client=client)
        async with app.run_test() as pilot:
            app._handle_focus_message({"type": "update", "focus": "git"})
            await pilot.pause()

            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            assert tab_bar.active == "git"

            # Null focus — tab bar should NOT update
            app._handle_focus_message({"type": "update", "focus": None})
            await pilot.pause()

            assert tab_bar.active == "git"

    async def test_keyboard_switches_panel(self):
        """Pressing number keys should switch panels."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            # Start from sprint explicitly
            app.action_switch_panel("sprint")
            await pilot.pause()

            await pilot.press("2")
            await pilot.pause()

            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            assert tab_bar.active == "git"
            assert app._focused_panel == "git"

    async def test_bracket_cycles_panels(self):
        """Pressing ] should cycle to the next panel."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            # Ensure we start from sprint (index 0)
            app.action_switch_panel("sprint")
            await pilot.pause()

            await pilot.press("bracketright")
            await pilot.pause()

            tab_bar = app.query_one("#tab-bar", PanelTabBar)
            assert tab_bar.active == "git"

            await pilot.press("bracketright")
            await pilot.pause()

            assert tab_bar.active == "diffs"


# ---------------------------------------------------------------------------
# AC5: Icon rendering works across terminal types (ASCII fallback)
# ---------------------------------------------------------------------------


class TestAsciifallback:
    """AC5: ASCII fallback for terminals without Nerd Font support."""

    def test_all_panels_have_ascii_fallback(self):
        """Every panel icon should have an ASCII fallback character."""
        for name, (nerd, ascii_fb) in PANEL_ICONS.items():
            assert ascii_fb.isascii(), (
                f"PANEL_ICONS['{name}'] fallback should be ASCII, got: '{ascii_fb}'"
            )

    def test_get_panel_icon_fallback_mode(self):
        """get_panel_icon with use_nerd_font=False returns ASCII for all panels."""
        for panel in VALID_PANELS:
            icon = get_panel_icon(panel, use_nerd_font=False)
            assert icon.isascii(), (
                f"Fallback icon for '{panel}' should be ASCII, got: '{icon}'"
            )

    def test_nerd_font_icons_are_non_ascii(self):
        """Nerd Font icons should be non-ASCII characters."""
        for name, (nerd, _) in PANEL_ICONS.items():
            assert not nerd.isascii(), (
                f"PANEL_ICONS['{name}'] Nerd Font icon should be non-ASCII"
            )
