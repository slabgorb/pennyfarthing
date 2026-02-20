"""Tests for BikeRack TUI scaffold (Story 103-1).

Verifies:
  AC1: Textual app launches with header, main content area, and footer
  AC2: Header has placeholder for connection status
  AC3: Footer shows panel name and keybinding hints
  AC4: Main content area serves as panel render target
  AC5: App exits cleanly on quit keybinding (q)
  AC6: Entry point callable from Python

Run with: python -m pytest tests/python/test_bikerack_tui.py -v
"""

import pytest
from textual.app import App


class TestImportAndEntryPoint:
    """AC6: Entry point callable from Python."""

    def test_bikerack_app_importable(self):
        """BikeRackApp should be importable from bikerack.tui."""
        from pf.bikerack.tui import BikeRackApp

        assert BikeRackApp is not None

    def test_bikerack_app_is_textual_app(self):
        """BikeRackApp should be a subclass of textual.app.App."""
        from pf.bikerack.tui import BikeRackApp

        assert issubclass(BikeRackApp, App)

    def test_bikerack_app_has_title(self):
        """BikeRackApp should have a meaningful TITLE."""
        from pf.bikerack.tui import BikeRackApp

        app = BikeRackApp()
        # Default App title is empty string or class name — we want "BikeRack" somewhere
        assert "bikerack" in app.title.lower(), (
            f"App title should contain 'BikeRack', got: '{app.title}'"
        )


class TestAppLayout:
    """AC1: Textual app launches with header, main content area, and footer."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_app_has_header(self, app):
        """App should mount a Header widget."""
        async with app.run_test() as _pilot:
            headers = app.query("Header")
            assert len(headers) > 0, "App should have a Header widget"

    async def test_app_has_footer(self, app):
        """App should mount a Footer widget."""
        async with app.run_test() as _pilot:
            footers = app.query("Footer")
            assert len(footers) > 0, "App should have a Footer widget"

    async def test_app_has_main_content_area(self, app):
        """App should mount a main content area (container for panels)."""
        async with app.run_test() as _pilot:
            # Main content should be identifiable — look for a container with id
            main = app.query("#main-content")
            assert len(main) > 0, (
                "App should have a main content container with id='main-content'"
            )

    async def test_layout_has_three_regions(self, app):
        """App compose() should yield header, main content, and footer."""
        async with app.run_test() as _pilot:
            # All three core layout elements must be present
            assert len(app.query("Header")) > 0, "Missing Header"
            assert len(app.query("#main-content")) > 0, "Missing main content"
            assert len(app.query("Footer")) > 0, "Missing Footer"


class TestConnectionStatusHeader:
    """AC2: Header has placeholder for connection status."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_header_has_connection_status_widget(self, app):
        """Header area should contain a connection status indicator."""
        async with app.run_test() as _pilot:
            # Look for a widget that shows connection status
            status = app.query("#connection-status")
            assert len(status) > 0, (
                "App should have a connection status widget with id='connection-status'"
            )

    async def test_connection_status_shows_disconnected_by_default(self, app):
        """Connection status should show disconnected state initially."""
        async with app.run_test() as _pilot:
            status = app.query_one("#connection-status")
            text = status.render().plain if hasattr(status.render(), "plain") else str(status.render())
            # Should indicate disconnected/not connected state
            assert any(word in text.lower() for word in ["disconnected", "not connected", "●"]), (
                f"Connection status should indicate disconnected state, got: '{text}'"
            )


class TestFooter:
    """AC3: Footer shows panel name and keybinding hints."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_footer_exists(self, app):
        """Footer widget should be present."""
        async with app.run_test() as _pilot:
            footers = app.query("Footer")
            assert len(footers) > 0, "App should have a Footer widget"

    async def test_app_has_quit_binding(self, app):
        """App should have a 'q' keybinding for quit."""
        # Check that the app defines a binding for 'q'
        binding_keys = [b.key for b in app.BINDINGS if hasattr(app, "BINDINGS")]
        assert "q" in binding_keys or "Q" in binding_keys, (
            f"App should have a 'q' keybinding, found: {binding_keys}"
        )


class TestMainContentArea:
    """AC4: Main content area serves as panel render target."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_main_content_is_container(self, app):
        """Main content area should be a Container or similar widget that can hold children."""
        from textual.containers import Container, Vertical, VerticalScroll

        async with app.run_test() as _pilot:
            main = app.query_one("#main-content")
            assert isinstance(main, (Container, Vertical, VerticalScroll)), (
                f"Main content should be a Container-type widget, got: {type(main).__name__}"
            )

    async def test_main_content_shows_placeholder(self, app):
        """Main content should show placeholder text when no panel is active."""
        async with app.run_test() as _pilot:
            main = app.query_one("#main-content")
            # Should have some default/placeholder content
            children = main.children
            assert len(children) > 0, (
                "Main content should have placeholder content when no panel is active"
            )


class TestQuitBehavior:
    """AC5: App exits cleanly on quit keybinding (q)."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_quit_keybinding_exits_app(self, app):
        """Pressing 'q' should trigger app exit."""
        async with app.run_test() as pilot:
            await pilot.press("q")
            # After pressing q, app should be in exiting state
            # Textual sets _exit to True or app.return_code when exiting
            assert pilot.app._exit, "App should exit after pressing 'q'"

    async def test_app_defines_quit_action(self, app):
        """App should define a quit action via BINDINGS."""
        bindings = getattr(app, "BINDINGS", [])
        quit_bindings = [
            b for b in bindings
            if hasattr(b, "key") and b.key in ("q", "Q")
        ]
        assert len(quit_bindings) > 0, (
            "App BINDINGS should include a 'q' keybinding for quit"
        )
