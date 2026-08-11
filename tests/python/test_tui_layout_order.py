"""Tests for Frame TUI layout order configuration (Story 120-10).

Verifies:
  AC1: layout_order setting exists in config.local.yaml schema
  AC2: Setting accepts an ordered list of four regions
  AC3: Default order is menu, profile, content, status
  AC4: All four regions must be present (reject partial/duplicate lists)
  AC5: Rendering pipeline respects the configured order
  AC6: Disabled bars omitted from layout, remaining bars keep order

Run with: python -m pytest tests/python/test_tui_layout_order.py -v
"""

import pytest
from pf.tui.layout_order import (
    DEFAULT_ORDER,
    get_layout_order,
    validate_layout_order,
)

# ---------------------------------------------------------------------------
# AC1 + AC2: layout_order setting accepts an ordered list of four regions
# ---------------------------------------------------------------------------


class TestValidateLayoutOrder:
    """Validation of the layout_order config value."""

    def test_default_order_is_valid(self):
        """The default order [menu, profile, content, status] should validate."""
        result = validate_layout_order(["menu", "profile", "content", "status"])
        assert result["success"] is True

    def test_reversed_order_is_valid(self):
        """A reversed ordering should be accepted."""
        result = validate_layout_order(["status", "content", "profile", "menu"])
        assert result["success"] is True

    def test_arbitrary_reorder_is_valid(self):
        """Any permutation of the four regions should validate."""
        result = validate_layout_order(["status", "menu", "content", "profile"])
        assert result["success"] is True


# ---------------------------------------------------------------------------
# AC3: Default order is menu, profile, content, status
# ---------------------------------------------------------------------------


class TestDefaultOrder:
    """When no layout_order is configured, use the default."""

    def test_default_order_constant(self):
        """DEFAULT_ORDER should be [menu, profile, content, status]."""
        assert DEFAULT_ORDER == ["menu", "profile", "content", "status"]

    def test_get_layout_order_returns_default_for_empty_config(self):
        """Empty config dict should return the default order."""
        order = get_layout_order({})
        assert order == ["menu", "profile", "content", "status"]

    def test_get_layout_order_returns_default_for_missing_key(self):
        """Config without layout_order key should return default."""
        config = {"theme": "mash", "workflow": {"statusbar": True}}
        order = get_layout_order(config)
        assert order == ["menu", "profile", "content", "status"]


# ---------------------------------------------------------------------------
# AC4: Reject partial lists, duplicates, and unknown regions
# ---------------------------------------------------------------------------


class TestValidateRejectsInvalid:
    """Validation must reject malformed layout_order values."""

    def test_rejects_partial_list(self):
        """A list with fewer than four regions must fail validation."""
        result = validate_layout_order(["menu", "profile"])
        assert result["success"] is False
        assert "error" in result

    def test_rejects_empty_list(self):
        """An empty list must fail validation."""
        result = validate_layout_order([])
        assert result["success"] is False
        assert "error" in result

    def test_rejects_duplicates(self):
        """A list with duplicate regions must fail validation."""
        result = validate_layout_order(["menu", "menu", "content", "status"])
        assert result["success"] is False
        assert "error" in result

    def test_rejects_unknown_region(self):
        """A list with an unknown region name must fail validation."""
        result = validate_layout_order(["menu", "profile", "content", "sidebar"])
        assert result["success"] is False
        assert "error" in result

    def test_rejects_non_list(self):
        """A non-list value (e.g. string) must fail validation."""
        result = validate_layout_order("menu,profile,content,status")
        assert result["success"] is False
        assert "error" in result

    def test_rejects_none(self):
        """None must fail validation."""
        result = validate_layout_order(None)
        assert result["success"] is False
        assert "error" in result

    def test_rejects_five_regions(self):
        """Extra regions beyond four must fail validation."""
        result = validate_layout_order(
            ["menu", "profile", "content", "status", "extra"]
        )
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# AC2 (continued): get_layout_order reads from config
# ---------------------------------------------------------------------------


class TestGetLayoutOrderFromConfig:
    """get_layout_order should read and return the configured order."""

    def test_reads_custom_order_from_config(self):
        """When layout_order is set, return that order."""
        config = {"layout_order": ["status", "content", "profile", "menu"]}
        order = get_layout_order(config)
        assert order == ["status", "content", "profile", "menu"]

    def test_reads_status_first_order(self):
        """Status bar at top, menu at bottom."""
        config = {"layout_order": ["status", "profile", "content", "menu"]}
        order = get_layout_order(config)
        assert order == ["status", "profile", "content", "menu"]

    def test_ignores_invalid_order_returns_default(self):
        """If layout_order is invalid, fall back to default."""
        config = {"layout_order": ["menu", "profile"]}  # partial
        order = get_layout_order(config)
        assert order == DEFAULT_ORDER

    def test_ignores_non_list_order_returns_default(self):
        """If layout_order is not a list, fall back to default."""
        config = {"layout_order": "not-a-list"}
        order = get_layout_order(config)
        assert order == DEFAULT_ORDER


# ---------------------------------------------------------------------------
# AC5: Rendering pipeline respects the configured order
# ---------------------------------------------------------------------------


class TestRenderingOrder:
    """The TUI compose/mount should arrange regions per layout_order config."""

    def test_tui_app_has_get_region_widgets_method(self):
        """TuiApp should expose a method to get ordered region widgets."""
        from pf.tui.app import TuiApp

        app = TuiApp()
        assert hasattr(app, "get_region_widgets") or hasattr(
            app, "_build_layout_regions"
        ), "TuiApp should have a method to build ordered layout regions"

    @pytest.mark.asyncio
    async def test_default_order_renders_menu_first(self):
        """With default config, menu (Header) should be the first region."""
        from pf.tui.app import TuiApp

        app = TuiApp()
        async with app.run_test() as _pilot:
            # The first docked-top or yielded widget should be the Header (menu)
            children = list(app.screen.children)
            widget_types = [type(w).__name__ for w in children]
            # Header should come before AgentHeader
            header_idx = next(
                (i for i, t in enumerate(widget_types) if t == "Header"), None
            )
            agent_idx = next(
                (i for i, t in enumerate(widget_types) if t == "AgentHeader"), None
            )
            assert header_idx is not None, "Header (menu) should be present"
            assert agent_idx is not None, "AgentHeader (profile) should be present"
            assert header_idx < agent_idx, "Header should render before AgentHeader"

    @pytest.mark.asyncio
    async def test_custom_order_status_first(self, monkeypatch):
        """With layout_order=[status,...], StatusFooter should be the first region."""
        from pf.tui import layout_order as lo_mod
        from pf.tui.app import TuiApp

        # Patch get_layout_order to return status-first
        monkeypatch.setattr(
            lo_mod,
            "get_layout_order",
            lambda config: ["status", "profile", "content", "menu"],
        )

        app = TuiApp()
        async with app.run_test() as _pilot:
            children = list(app.screen.children)
            widget_types = [type(w).__name__ for w in children]
            # StatusFooter should appear before Header
            status_idx = next(
                (i for i, t in enumerate(widget_types) if t == "StatusFooter"), None
            )
            header_idx = next(
                (i for i, t in enumerate(widget_types) if t == "Header"), None
            )
            assert status_idx is not None, "StatusFooter should be present"
            assert header_idx is not None, "Header should be present"
            assert (
                status_idx < header_idx
            ), "StatusFooter should render before Header when status is first in layout_order"


# ---------------------------------------------------------------------------
# AC6: Disabled bars omitted, remaining bars keep configured order
# ---------------------------------------------------------------------------


class TestDisabledBarsOmitted:
    """Individual bar toggle settings should omit disabled bars from layout."""

    def test_get_layout_order_filters_disabled_bars(self):
        """When a bar is disabled in config, it should not appear in the order."""
        config = {
            "layout_order": ["menu", "profile", "content", "status"],
            "workflow": {"statusbar": False},
        }
        order = get_layout_order(config)
        assert "status" not in order, (
            "Disabled status bar should be omitted from layout order"
        )
        assert order == ["menu", "profile", "content"]

    def test_disabled_profile_bar_omitted(self):
        """Disabling the profile bar should omit it from the layout."""
        config = {
            "layout_order": ["menu", "profile", "content", "status"],
            "workflow": {"profile_bar": False},
        }
        order = get_layout_order(config)
        assert "profile" not in order
        assert len(order) == 3

    def test_disabled_bars_preserve_relative_order(self):
        """Remaining bars keep their configured order after disabled bars are removed."""
        config = {
            "layout_order": ["status", "profile", "content", "menu"],
            "workflow": {"profile_bar": False},
        }
        order = get_layout_order(config)
        # Should be status, content, menu (profile removed, order preserved)
        assert order == ["status", "content", "menu"]

    def test_all_bars_enabled_returns_full_order(self):
        """When all bars are enabled, the full configured order is returned."""
        config = {
            "layout_order": ["status", "content", "profile", "menu"],
            "workflow": {"statusbar": True},
        }
        order = get_layout_order(config)
        assert order == ["status", "content", "profile", "menu"]
