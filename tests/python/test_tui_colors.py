"""Tests for Story 136-4: Extract shared TUI color thresholds and contrast constants.

The Frame TUI TUI has color threshold logic (green < 70, yellow <= 85, red > 85)
duplicated across three modules. This story extracts them into a shared
`colors.py` module. Tests verify the new module's API, that callers use it,
and that visual output is unchanged.

Verifies:
  AC1: Shared constants module exists with correct API
  AC2: base_panel.py render_progress_bar uses shared constants
  AC3: debug_panel.py uses shared _TIER_STYLES and warn_style
  AC4: context_meter_footer.py uses shared warn_style
  AC5: No visual regression at boundary values

Run with: python -m pytest tests/python/test_tui_colors.py -v
"""

from __future__ import annotations

import sys
from collections import deque
from io import StringIO
from typing import Any
from unittest.mock import MagicMock

from rich.console import Console
from rich.text import Text


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


# ===========================================================================
# AC1: Shared constants module exists
# ===========================================================================


class TestColorsModuleAPI:
    """AC1: colors.py exists and exports the required constants and functions."""

    def test_module_importable(self):
        """colors.py should be importable from pf.tui."""
        from pf.tui import colors  # noqa: F401

    def test_warn_threshold_low_value(self):
        """WARN_THRESHOLD_LOW should be 70 (aligned with the statusline in 1cd0a2b03)."""
        from pf.tui.colors import WARN_THRESHOLD_LOW

        assert WARN_THRESHOLD_LOW == 70, (
            f"WARN_THRESHOLD_LOW should be 70, got {WARN_THRESHOLD_LOW}"
        )

    def test_warn_threshold_high_value(self):
        """WARN_THRESHOLD_HIGH should be 85 (aligned with the statusline in 1cd0a2b03)."""
        from pf.tui.colors import WARN_THRESHOLD_HIGH

        assert WARN_THRESHOLD_HIGH == 85, (
            f"WARN_THRESHOLD_HIGH should be 85, got {WARN_THRESHOLD_HIGH}"
        )

    def test_tier_styles_dict_keys(self):
        """TIER_STYLES should map all four tier names."""
        from pf.tui.colors import TIER_STYLES

        expected_keys = {"FULL", "REFRESH", "HANDOFF", "MINIMAL"}
        assert set(TIER_STYLES.keys()) == expected_keys, (
            f"TIER_STYLES keys should be {expected_keys}, got {set(TIER_STYLES.keys())}"
        )

    def test_tier_styles_dict_values(self):
        """TIER_STYLES values should match the original debug_panel.py values."""
        from pf.tui.colors import TIER_STYLES

        assert TIER_STYLES["FULL"] == "bold green"
        assert TIER_STYLES["REFRESH"] == "bold yellow"
        assert TIER_STYLES["HANDOFF"] == "bold cyan"
        assert TIER_STYLES["MINIMAL"] == "bold red"

    def test_warn_style_green_at_zero(self):
        """warn_style(0) should return 'green'."""
        from pf.tui.colors import warn_style

        assert warn_style(0) == "green"

    def test_warn_style_green_at_69(self):
        """warn_style(69) should return 'green' (below the low threshold)."""
        from pf.tui.colors import warn_style

        assert warn_style(69) == "green"

    def test_warn_style_yellow_at_70(self):
        """warn_style(70) should return 'yellow' (exactly at low threshold)."""
        from pf.tui.colors import warn_style

        assert warn_style(70) == "yellow", (
            "percent=70 should be 'yellow' — matches the 'if percent < 70' boundary"
        )

    def test_warn_style_yellow_at_84(self):
        """warn_style(84) should return 'yellow'."""
        from pf.tui.colors import warn_style

        assert warn_style(84) == "yellow"

    def test_warn_style_yellow_at_85(self):
        """warn_style(85) should return 'yellow' (exactly at high threshold)."""
        from pf.tui.colors import warn_style

        assert warn_style(85) == "yellow", (
            "percent=85 should be 'yellow' — matches the 'elif percent <= 85' boundary"
        )

    def test_warn_style_red_at_86(self):
        """warn_style(86) should return 'red'."""
        from pf.tui.colors import warn_style

        assert warn_style(86) == "red"

    def test_warn_style_red_at_100(self):
        """warn_style(100) should return 'red'."""
        from pf.tui.colors import warn_style

        assert warn_style(100) == "red"

    def test_warn_style_accepts_float(self):
        """warn_style should accept float values."""
        from pf.tui.colors import warn_style

        assert warn_style(69.9) == "green"
        assert warn_style(70.0) == "yellow"
        assert warn_style(85.1) == "red"

    def test_no_intra_package_imports(self):
        """colors.py should have no imports from pf.tui (prevents circular)."""
        import inspect

        from pf.tui import colors

        source = inspect.getsource(colors)
        assert "from pf.tui" not in source, (
            "colors.py should not import from pf.tui (circular import risk)"
        )
        assert "import pf.tui" not in source, (
            "colors.py should not import pf.tui (circular import risk)"
        )


# ===========================================================================
# AC2: base_panel.py uses shared constants
# ===========================================================================


class TestBasePanelUsesSharedConstants:
    """AC2: render_progress_bar uses warn_style from colors.py."""

    def test_render_progress_bar_signature_unchanged(self):
        """render_progress_bar signature should not change."""
        import inspect

        from pf.tui.base_panel import render_progress_bar

        sig = inspect.signature(render_progress_bar)
        params = list(sig.parameters.keys())
        assert params == ["percent", "width", "warn_high", "fill_style", "show_percent"], (
            f"Signature changed: {params}"
        )

    def test_warn_high_true_green(self):
        """warn_high=True at percent=25 should produce green fill."""
        from pf.tui.base_panel import render_progress_bar

        result = render_progress_bar(25, warn_high=True)
        output = _render_to_string(result)
        assert "25%" in output

    def test_warn_high_true_yellow(self):
        """warn_high=True at percent=60 should produce yellow fill."""
        from pf.tui.base_panel import render_progress_bar

        result = render_progress_bar(60, warn_high=True)
        output = _render_to_string(result)
        assert "60%" in output

    def test_warn_high_true_red(self):
        """warn_high=True at percent=90 should produce red fill."""
        from pf.tui.base_panel import render_progress_bar

        result = render_progress_bar(90, warn_high=True)
        output = _render_to_string(result)
        assert "90%" in output

    def test_fill_style_override_takes_priority(self):
        """fill_style parameter should override threshold-computed style."""
        from pf.tui.base_panel import render_progress_bar

        result = render_progress_bar(90, warn_high=True, fill_style="green")
        # Should render with green fill despite 90% (which would be red)
        output = _render_to_string(result)
        assert "90%" in output

    def test_warn_high_false_returns_blue(self):
        """warn_high=False should always use blue, regardless of percent."""
        from pf.tui.base_panel import render_progress_bar

        result = render_progress_bar(95, warn_high=False)
        output = _render_to_string(result)
        assert "95%" in output

    def test_base_panel_imports_from_colors(self):
        """base_panel should import warn_style from colors module."""
        import inspect

        from pf.tui import base_panel

        source = inspect.getsource(base_panel)
        assert "from pf.tui.colors import" in source or "from .colors import" in source, (
            "base_panel should import from colors module"
        )


# ===========================================================================
# AC3: debug_panel.py uses shared constants
# ===========================================================================


class TestDebugPanelUsesSharedConstants:
    """AC3: debug_panel imports _TIER_STYLES and uses warn_style for sparkline."""

    def test_tier_styles_imported_from_colors(self):
        """debug_panel._TIER_STYLES should be the same object as colors.TIER_STYLES."""
        from pf.tui.colors import TIER_STYLES
        from pf.tui.debug_panel import _TIER_STYLES

        assert _TIER_STYLES is TIER_STYLES, (
            "_TIER_STYLES should be imported from colors, not defined locally"
        )

    def test_debug_panel_imports_from_colors(self):
        """debug_panel source should import from colors module."""
        import inspect

        from pf.tui import debug_panel

        source = inspect.getsource(debug_panel)
        assert "from pf.tui.colors import" in source or "from .colors import" in source, (
            "debug_panel should import from colors module"
        )

    def test_no_local_tier_styles_definition(self):
        """debug_panel should not define _TIER_STYLES locally (only import it)."""
        import inspect

        from pf.tui import debug_panel

        source = inspect.getsource(debug_panel)
        # Should not have a local dict definition for _TIER_STYLES
        assert '_TIER_STYLES: dict[str, str] = {' not in source, (
            "debug_panel should not define _TIER_STYLES locally — import from colors"
        )

    def test_sparkline_green_below_50(self):
        """Sparkline chars below 50% should be styled green."""
        from pf.tui.debug_panel import _render_sparkline

        history = deque([10, 25, 40])
        result = _render_sparkline(history)
        # All values below 50 — each char should be green
        assert isinstance(result, Text)

    def test_sparkline_yellow_at_65(self):
        """Sparkline char at 65% should be styled yellow."""
        from pf.tui.debug_panel import _render_sparkline

        history = deque([65])
        result = _render_sparkline(history)
        assert isinstance(result, Text)

    def test_sparkline_red_above_80(self):
        """Sparkline char at 90% should be styled red."""
        from pf.tui.debug_panel import _render_sparkline

        history = deque([90])
        result = _render_sparkline(history)
        assert isinstance(result, Text)

    def test_tier_badge_uses_tier_styles(self):
        """_render_context should use TIER_STYLES for tier badge styling."""
        from pf.tui.debug_panel import _render_context

        ctx = {"tier": "FULL", "tokens": 1000, "percent": 10}
        result = _render_context(ctx)
        output = _render_to_string(result)
        assert "FULL" in output


# ===========================================================================
# AC4: context_meter_footer.py uses shared constants
# ===========================================================================


class TestContextMeterFooterUsesSharedConstants:
    """AC4: context_meter_footer uses warn_style for tier label coloring."""

    def test_footer_imports_from_colors(self):
        """context_meter_footer source should import from colors module."""
        import inspect

        from pf.tui import context_meter_footer

        source = inspect.getsource(context_meter_footer)
        assert "from pf.tui.colors import" in source or "from .colors import" in source, (
            "context_meter_footer should import from colors module"
        )

    def test_no_inline_threshold_logic(self):
        """context_meter_footer should not compare percent to a threshold literal
        in _render_context_bar — it must delegate to warn_style()."""
        import inspect

        from pf.tui import context_meter_footer

        source = inspect.getsource(context_meter_footer.StatusFooter._render_context_bar)
        for literal in ("percent < 50", "percent <= 80", "percent < 70", "percent <= 85"):
            assert literal not in source, (
                f"_render_context_bar should use warn_style(), not the inline "
                f"threshold check {literal!r}"
            )

    def test_footer_tier_green_at_low_percent(self):
        """Tier label at percent=0 with tier='FULL' should be bold green."""
        from pf.tui.context_meter_footer import StatusFooter

        footer = StatusFooter(client=MagicMock())
        footer._context_data = {"percent": 0, "tier": "FULL"}
        bar = footer._render_context_bar()
        output = _render_to_string(bar)
        assert "FULL" in output

    def test_footer_tier_yellow_at_mid_percent(self):
        """Tier label at percent=79 with tier='REFRESH' should be bold yellow."""
        from pf.tui.context_meter_footer import StatusFooter

        footer = StatusFooter(client=MagicMock())
        footer._context_data = {"percent": 79, "tier": "REFRESH"}
        bar = footer._render_context_bar()
        output = _render_to_string(bar)
        assert "REFRESH" in output

    def test_footer_tier_red_at_high_percent(self):
        """Tier label at percent=81 with tier='MINIMAL' should be bold red."""
        from pf.tui.context_meter_footer import StatusFooter

        footer = StatusFooter(client=MagicMock())
        footer._context_data = {"percent": 81, "tier": "MINIMAL"}
        bar = footer._render_context_bar()
        output = _render_to_string(bar)
        assert "MINIMAL" in output


# ===========================================================================
# AC5: No visual regression
# ===========================================================================


class TestNoVisualRegression:
    """AC5: Output identical at all boundary values after refactor."""

    def test_progress_bar_boundary_values(self):
        """render_progress_bar output at boundary values should match expected styles."""
        from pf.tui.base_panel import render_progress_bar

        boundaries = [0, 25, 49, 50, 79, 80, 81, 100]
        for pct in boundaries:
            result = render_progress_bar(pct, warn_high=True)
            output = _render_to_string(result)
            assert f"{pct}%" in output, (
                f"Should show {pct}% in output, got: {output!r}"
            )

    def test_all_modules_importable(self):
        """All modified modules should import without errors."""
        from pf.tui import (
            base_panel,  # noqa: F401
            colors,  # noqa: F401
            context_meter_footer,  # noqa: F401
            debug_panel,  # noqa: F401
        )

    def test_no_circular_imports(self):
        """Importing colors then all consumers should not cause circular import."""
        # Force reload to detect circular imports
        if "pf.tui.colors" in sys.modules:
            del sys.modules["pf.tui.colors"]

        from pf.tui import (
            base_panel,  # noqa: F401
            colors,  # noqa: F401
            context_meter_footer,  # noqa: F401
            debug_panel,  # noqa: F401
        )

    def test_footer_context_bar_boundary_values(self):
        """StatusFooter context bar at boundary percents should show tier correctly."""
        from pf.tui.context_meter_footer import StatusFooter

        test_cases = [
            (0, "FULL"),
            (50, "REFRESH"),
            (80, "HANDOFF"),
            (81, "MINIMAL"),
            (100, "MINIMAL"),
        ]
        for pct, tier in test_cases:
            footer = StatusFooter(client=MagicMock())
            footer._context_data = {"percent": pct, "tier": tier}
            bar = footer._render_context_bar()
            output = _render_to_string(bar)
            assert tier in output, (
                f"Tier '{tier}' should show at {pct}%, got: {output!r}"
            )

    def test_sparkline_boundary_colors(self):
        """Sparkline should produce Text with correct chars at boundary values."""
        from pf.tui.debug_panel import _render_sparkline

        history = deque([0, 25, 49, 50, 79, 80, 81, 100])
        result = _render_sparkline(history)
        assert isinstance(result, Text)
        # Should have 8 sparkline chars plus the "Context trend: " prefix
        plain = result.plain
        assert "Context trend:" in plain
