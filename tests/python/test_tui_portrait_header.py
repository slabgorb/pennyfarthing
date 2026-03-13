"""Tests for BikeRack portrait image header (Story 110-3).

Verifies:
  AC1: textual-image added to [tui] optional dependencies
  AC2: Portrait image renders alongside agent info in header
  AC3: Protocol auto-detection runs before App.run()
  AC4: Graceful fallback to text-only on unsupported terminals
  AC5: Portrait updates on agent/persona change via WebSocket

Run with: python -m pytest tests/python/test_bikerack_portrait_header.py -v
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

# Project root for path resolution in tests
PROJECT_ROOT = Path(__file__).resolve().parents[2]
PYPROJECT_PATH = PROJECT_ROOT / "pyproject.toml"

# Sample persona data mimicking /ws/persona WebSocket messages
PERSONA_SM = {
    "character": "Colonel Hogan",
    "role": "sm",
    "roleDescription": "Story coordination",
    "quote": "I have a plan!",
    "style": "Charismatic fast-talker",
    "theme": "hogans-heroes",
}

PERSONA_TEA = {
    "character": "Major Hochstetter",
    "role": "tea",
    "roleDescription": "Test engineer",
    "quote": "What is this man doing here?",
    "style": "Paranoid investigator",
    "theme": "hogans-heroes",
}

PERSONA_STREAMING = {
    "type": "streaming",
    "isStreaming": True,
}


class TestDependencies:
    """AC1: textual-image added to [tui] optional dependencies."""

    def test_textual_image_in_tui_deps(self):
        """pyproject.toml [tui] optional deps should include textual-image."""
        content = PYPROJECT_PATH.read_text()
        # Parse the [tui] section — textual-image must appear in the tui deps
        in_tui_section = False
        found = False
        for line in content.splitlines():
            if line.strip().startswith("tui = ["):
                in_tui_section = True
                continue
            if in_tui_section:
                if line.strip() == "]":
                    break
                if "textual-image" in line:
                    found = True
                    break
        assert found, (
            "textual-image should be listed in [project.optional-dependencies] tui"
        )


class TestPortraitPathResolution:
    """Portrait resolver should find portrait files given theme + agent."""

    def test_resolve_returns_path_for_valid_theme_and_agent(self):
        """resolve_portrait_path should return a Path for a known theme/agent combo."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("hogans-heroes", "sm", project_root=PROJECT_ROOT)
        assert result is not None, "Should resolve portrait for hogans-heroes/sm"
        assert isinstance(result, Path), f"Should return Path, got {type(result)}"

    def test_resolved_path_exists_on_disk(self):
        """Resolved portrait path should point to an actual file."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("hogans-heroes", "sm", project_root=PROJECT_ROOT)
        assert result is not None, "Should resolve portrait"
        assert result.exists(), f"Portrait file should exist at {result}"

    def test_resolved_path_is_png_or_jpg(self):
        """Portrait file should be a .png or .jpg image."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("hogans-heroes", "sm", project_root=PROJECT_ROOT)
        assert result is not None, "Should resolve portrait"
        assert result.suffix in (".png", ".jpg"), f"Expected image file, got {result.suffix}"

    def test_resolve_returns_none_for_unknown_theme(self):
        """Unknown theme should return None, not raise."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("nonexistent-theme", "sm", project_root=PROJECT_ROOT)
        assert result is None, "Unknown theme should return None"

    def test_resolve_returns_none_for_unknown_agent(self):
        """Unknown agent role should return None, not raise."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("hogans-heroes", "nonexistent-agent", project_root=PROJECT_ROOT)
        assert result is None, "Unknown agent should return None"

    def test_resolve_prefers_medium_size(self):
        """Resolver should prefer the 'medium' size for balanced quality/performance."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("hogans-heroes", "sm", project_root=PROJECT_ROOT)
        assert result is not None, "Should resolve portrait"
        assert "medium" in str(result), f"Should prefer medium size, got {result}"

    def test_resolve_all_standard_agents(self):
        """Should resolve portraits for all standard agent roles in hogans-heroes."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        agents = ["sm", "tea", "dev", "reviewer", "architect", "pm"]
        for agent in agents:
            result = resolve_portrait_path("hogans-heroes", agent, project_root=PROJECT_ROOT)
            assert result is not None, f"Should resolve portrait for agent '{agent}'"


class TestProtocolDetection:
    """AC3: Protocol auto-detection runs before App.run()."""

    def test_detect_protocol_function_exists(self):
        """detect_image_protocol should be importable."""
        from pf.tui.portrait_resolver import detect_image_protocol

        assert callable(detect_image_protocol)

    def test_detect_protocol_returns_string_or_none(self):
        """detect_image_protocol should return a protocol string or None."""
        from pf.tui.portrait_resolver import detect_image_protocol

        result = detect_image_protocol()
        assert result is None or isinstance(result, str), (
            f"Should return str or None, got {type(result)}"
        )

    def test_detect_protocol_valid_values(self):
        """If detection returns a value, it should be a known protocol."""
        from pf.tui.portrait_resolver import detect_image_protocol

        result = detect_image_protocol()
        valid = {None, "kitty", "sixel", "halfcell", "unicode"}
        assert result in valid, f"Unknown protocol '{result}', expected one of {valid}"

    def test_main_calls_detect_before_app_run(self):
        """main() should call detect_image_protocol() before App.run()."""
        from pf.tui import tui

        call_order: list[str] = []

        with patch(
            "pf.tui.portrait_resolver.detect_image_protocol",
            side_effect=lambda: (call_order.append("detect"), None)[1],
        ), patch.object(
            tui.TuiApp,
            "run",
            side_effect=lambda *a, **kw: call_order.append("app_run"),
        ):
            tui.main(port=9999)

        assert "detect" in call_order, "main() should call detect_image_protocol()"
        assert "app_run" in call_order, "main() should call app.run()"
        assert call_order.index("detect") < call_order.index("app_run"), (
            f"detect must be called BEFORE app.run(), got order: {call_order}"
        )


class TestAgentHeaderWithPortrait:
    """AC2: Portrait image renders alongside agent info in header."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_header_uses_horizontal_layout_with_portrait(self, app):
        """AgentHeader should use Horizontal layout when portrait is available."""

        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")
            # Apply persona that should trigger portrait
            header._apply_persona(PERSONA_SM)
            await pilot.pause()

            # Header should contain a Horizontal container for image + text
            horizontals = header.query("Horizontal")
            assert len(horizontals) > 0, (
                "AgentHeader should use Horizontal layout when portrait is available"
            )

    async def test_header_shows_character_name_with_portrait(self, app):
        """Character name should still be visible when portrait is shown."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")
            header._apply_persona(PERSONA_SM)
            await pilot.pause()

            # When portrait is present, text is in child #agent-text widget
            try:
                text_widget = header.query_one("#agent-text")
                rendered = str(text_widget.render())
            except Exception:
                rendered = str(header.render())
            assert "Colonel Hogan" in rendered or "Hogan" in rendered, (
                f"Character name should be visible, got: '{rendered}'"
            )

    async def test_header_shows_role_badge_with_portrait(self, app):
        """Role badge should still render when portrait is displayed."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")
            header._apply_persona(PERSONA_SM)
            await pilot.pause()

            # When portrait is present, text is in child #agent-text widget
            try:
                text_widget = header.query_one("#agent-text")
                rendered = str(text_widget.render())
            except Exception:
                rendered = str(header.render())
            assert "SM" in rendered, f"Role badge [SM] should be visible, got: '{rendered}'"


class TestFallbackBehavior:
    """AC4: Graceful fallback to text-only on unsupported terminals."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_header_renders_text_only_when_no_portrait_file(self, app):
        """Header should fall back to text-only when portrait file doesn't exist."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")
            # Persona with a theme that has no portraits
            persona_no_portrait = {
                **PERSONA_SM,
                "theme": "nonexistent-theme",
            }
            header._apply_persona(persona_no_portrait)
            await pilot.pause()

            rendered = str(header.render())
            # Should still show character info in text mode
            assert "Colonel Hogan" in rendered or "Hogan" in rendered, (
                "Should fall back to text-only header"
            )
            # Should NOT have a Horizontal layout (no portrait to show)
            horizontals = header.query("Horizontal")
            assert len(horizontals) == 0, (
                "Should not use Horizontal layout when no portrait available"
            )

    async def test_header_fallback_when_protocol_unsupported(self, app):
        """Header should be text-only when terminal doesn't support image protocols."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")

            with patch(
                "pf.tui.portrait_resolver.detect_image_protocol",
                return_value=None,
            ):
                header._apply_persona(PERSONA_SM)
                await pilot.pause()

                rendered = str(header.render())
                assert "Colonel Hogan" in rendered or "Hogan" in rendered, (
                    "Should render text-only when protocol unsupported"
                )

    async def test_header_still_functional_without_textual_image(self, app):
        """Header should work even if textual-image package is not installed."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")
            # Simulate textual-image not being available
            with patch.dict("sys.modules", {
                "textual_image": None,
                "textual_image.widget": None,
                "textual_image._terminal": None,
            }), patch(
                "pf.tui.portrait_resolver.detect_image_protocol",
                return_value=None,
            ):
                header._apply_persona(PERSONA_SM)
                await pilot.pause()

                rendered = str(header.render())
                assert "Colonel Hogan" in rendered or "Hogan" in rendered, (
                    "Header must work without textual-image installed"
                )


class TestPortraitUpdatesOnPersonaChange:
    """AC5: Portrait updates on agent/persona change via WebSocket."""

    @pytest.fixture
    def app(self):
        from pf.tui.app import TuiApp

        return TuiApp()

    async def test_portrait_changes_when_agent_changes(self, app):
        """Switching agents should update the portrait."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")

            def _get_header_text() -> str:
                """Get visible text from header or its child #agent-text."""
                try:
                    text_widget = header.query_one("#agent-text")
                    return str(text_widget.render())
                except Exception:
                    return str(header.render())

            # First persona
            header._apply_persona(PERSONA_SM)
            await pilot.pause()
            rendered_sm = _get_header_text()

            # Switch to different persona
            header._apply_persona(PERSONA_TEA)
            await pilot.pause()
            rendered_tea = _get_header_text()

            # Renderings should differ (different character names at minimum)
            assert rendered_sm != rendered_tea, (
                "Header should update when persona changes"
            )
            assert "Hochstetter" in rendered_tea or "TEA" in rendered_tea, (
                f"Header should show new persona, got: '{rendered_tea}'"
            )

    async def test_streaming_update_preserves_portrait(self, app):
        """Streaming status update should not remove the portrait."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")

            # Set initial persona
            header._apply_persona(PERSONA_SM)
            await pilot.pause()

            # Send streaming update
            header._apply_persona(PERSONA_STREAMING)
            await pilot.pause()

            # When portrait is present, text is in child #agent-text widget
            try:
                text_widget = header.query_one("#agent-text")
                rendered = str(text_widget.render())
            except Exception:
                rendered = str(header.render())
            # Character name should still be visible after streaming update
            assert "Colonel Hogan" in rendered or "Hogan" in rendered, (
                f"Streaming update should preserve persona display, got: '{rendered}'"
            )

    async def test_persona_with_portrait_path_in_data(self, app):
        """If persona data includes portraitPath, header should use it directly."""
        async with app.run_test() as pilot:
            header = app.query_one("#agent-header")

            portrait_path = str(
                PROJECT_ROOT
                / "pennyfarthing-dist"
                / "personas"
                / "portraits"
                / "hogans-heroes"
                / "small"
                / "hogan-44541.png"
            )
            persona_with_path = {
                **PERSONA_SM,
                "portraitPath": portrait_path,
            }
            header._apply_persona(persona_with_path)
            await pilot.pause()

            # When portrait path is provided, header should attempt to show image
            # This tests that the header respects server-provided portrait paths
            horizontals = header.query("Horizontal")
            assert len(horizontals) > 0, (
                "Header should use Horizontal layout when portraitPath is provided"
            )
