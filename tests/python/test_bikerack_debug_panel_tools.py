"""Tests for BikeRack TUI DebugPanel — Code quality tool triggers (Story 121-2).

Adds interactive keybindings and tool triggers to the debug panel so users
can run hotspots, dead code, and health score analysis directly from the TUI.

Verifies:
  AC1:  Tool keybindings register in TUI (h, d, s, escape)
  AC2:  Hotspots analysis triggers from TUI
  AC3:  Hotspots results display as table (File, Churn, Avg Days, Frequency)
  AC4:  Dead code analysis triggers from TUI
  AC5:  Dead code results display with tabs (Stale Files, Unused Exports)
  AC6:  Health score analysis triggers from TUI
  AC7:  Health score results display dimensions (score + trend indicators)
  AC8:  Escape returns to normal debug view
  AC9:  Loading state prevents duplicate triggers
  AC10: Errors are displayed gracefully

Run with: python -m pytest tests/python/test_bikerack_debug_panel_tools.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

from pf.bikerack.debug_panel import DebugPanel
from pf.deadcode.models import DeadCodeResult, StaleFile, UnusedExport, UnusedExportResult
from pf.healthscore.models import DimensionScore, HealthscoreResult
from pf.hotspots.models import FileHotspot, HotspotResult, MultiRepoHotspotResult
from rich.console import Console

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


def _make_panel() -> DebugPanel:
    """Create a DebugPanel with a mock client."""
    return DebugPanel(client=MagicMock())


# ---------------------------------------------------------------------------
# Test data fixtures
# ---------------------------------------------------------------------------

SAMPLE_HOTSPOT_RESULT = MultiRepoHotspotResult(
    success=True,
    repo_results=[
        HotspotResult(
            success=True,
            repo_name="pennyfarthing",
            repo_path="/fake/path",
            time_window_days=90,
            commit_count=150,
            file_hotspots=[
                FileHotspot(
                    path="src/core/server/api.ts",
                    change_count=45,
                    churn=320,
                    last_changed="2026-02-10",
                    hotspot_score=87.5,
                ),
                FileHotspot(
                    path="src/public/hooks/useGit.ts",
                    change_count=38,
                    churn=210,
                    last_changed="2026-02-15",
                    hotspot_score=72.3,
                ),
            ],
        ),
    ],
)

SAMPLE_DEADCODE_RESULT = DeadCodeResult(
    success=True,
    repo_name="pennyfarthing",
    repo_path="/fake/path",
    time_window_days=180,
    stale_files=[
        StaleFile(
            path="src/legacy/old-component.tsx",
            last_commit_date="2025-06-01",
            days_since_last_commit=287,
        ),
        StaleFile(
            path="packages/example/unused.js",
            last_commit_date="2025-09-20",
            days_since_last_commit=156,
        ),
    ],
    total_files=500,
)

SAMPLE_UNUSED_EXPORTS = UnusedExportResult(
    success=True,
    repo_name="pennyfarthing",
    repo_path="/fake/path",
    unused_exports=[
        UnusedExport(symbol="oldHelper", file="src/utils/old.ts", line=12),
        UnusedExport(symbol="LegacyType", file="src/types/legacy.ts", line=5, export_type="named"),
    ],
    total_exports_scanned=200,
)

SAMPLE_HEALTHSCORE_RESULT = HealthscoreResult(
    success=True,
    composite_score=72.5,
    target_path="/fake/path",
    dimensions=[
        DimensionScore(name="churn", score=65.0, weight=0.15),
        DimensionScore(name="complexity", score=72.0, weight=0.15),
        DimensionScore(name="test_gaps", score=81.0, weight=0.15),
        DimensionScore(name="todo_density", score=88.0, weight=0.15),
        DimensionScore(name="dead_code", score=55.0, weight=0.10),
    ],
)

# Context data so render_panel has something for "normal" view
SAMPLE_CONTEXT_DATA: dict[str, Any] = {
    "type": "init",
    "context": {
        "tokens": 45000,
        "percent": 22,
        "status": "ok",
        "baseline": 8000,
        "usableTokens": 37000,
        "available": 155000,
        "tier": "FULL",
    },
}


# ---------------------------------------------------------------------------
# AC1: Tool keybindings register in TUI
# ---------------------------------------------------------------------------


class TestToolKeybindingsRegister:
    """AC1: Hotspots (h), dead code (d), health score (s) keybindings exist."""

    def test_debug_panel_has_current_view_attribute(self):
        """DebugPanel should have a current_view attribute defaulting to 'normal'."""
        panel = _make_panel()
        assert hasattr(panel, "current_view"), "DebugPanel must have current_view attribute"
        assert panel.current_view == "normal"

    def test_tui_has_hotspots_binding(self):
        """BikeRackApp should have an 'h' binding for hotspots."""
        from pf.bikerack.tui import BikeRackApp

        binding_keys = [b.key for b in BikeRackApp.BINDINGS]
        assert "h" in binding_keys, "Missing 'h' keybinding for hotspots"

    def test_tui_has_deadcode_binding(self):
        """BikeRackApp should have a 'd' binding for dead code."""
        from pf.bikerack.tui import BikeRackApp

        binding_keys = [b.key for b in BikeRackApp.BINDINGS]
        assert "d" in binding_keys, "Missing 'd' keybinding for dead code"

    def test_tui_has_healthscore_binding(self):
        """BikeRackApp should have an 's' binding for health score."""
        from pf.bikerack.tui import BikeRackApp

        binding_keys = [b.key for b in BikeRackApp.BINDINGS]
        assert "s" in binding_keys, "Missing 's' keybinding for health score"

    def test_tui_has_escape_binding(self):
        """BikeRackApp should have an 'escape' binding to return to normal view."""
        from pf.bikerack.tui import BikeRackApp

        binding_keys = [b.key for b in BikeRackApp.BINDINGS]
        assert "escape" in binding_keys, "Missing 'escape' keybinding for back"

    def test_tui_has_debug_hotspots_action(self):
        """BikeRackApp should have action_debug_hotspots method."""
        from pf.bikerack.tui import BikeRackApp

        assert hasattr(BikeRackApp, "action_debug_hotspots"), (
            "Missing action_debug_hotspots on BikeRackApp"
        )

    def test_tui_has_debug_deadcode_action(self):
        """BikeRackApp should have action_debug_deadcode method."""
        from pf.bikerack.tui import BikeRackApp

        assert hasattr(BikeRackApp, "action_debug_deadcode"), (
            "Missing action_debug_deadcode on BikeRackApp"
        )

    def test_tui_has_debug_healthscore_action(self):
        """BikeRackApp should have action_debug_healthscore method."""
        from pf.bikerack.tui import BikeRackApp

        assert hasattr(BikeRackApp, "action_debug_healthscore"), (
            "Missing action_debug_healthscore on BikeRackApp"
        )

    def test_tui_has_debug_back_action(self):
        """BikeRackApp should have action_debug_back method."""
        from pf.bikerack.tui import BikeRackApp

        assert hasattr(BikeRackApp, "action_debug_back"), (
            "Missing action_debug_back on BikeRackApp"
        )


# ---------------------------------------------------------------------------
# AC2: Hotspots analysis triggers from TUI
# ---------------------------------------------------------------------------


class TestHotspotsAnalysisTrigger:
    """AC2: Pressing 'h' triggers hotspots analysis in a background worker."""

    def test_debug_panel_has_run_hotspots_method(self):
        """DebugPanel should have run_hotspots_analysis method."""
        panel = _make_panel()
        assert hasattr(panel, "run_hotspots_analysis"), (
            "DebugPanel must have run_hotspots_analysis method"
        )

    def test_hotspots_trigger_sets_loading_state(self):
        """Triggering hotspots should set current_view to indicate loading."""
        panel = _make_panel()
        panel.show_loading("Analyzing hotspots...")
        assert panel.loading is True, "Panel should be in loading state"

    def test_hotspots_trigger_shows_loading_message(self):
        """Loading state should render an 'Analyzing hotspots...' message."""
        panel = _make_panel()
        panel.show_loading("Analyzing hotspots...")
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "Analyzing" in output or "hotspots" in output.lower(), (
            f"Loading message not found in: {output!r}"
        )


# ---------------------------------------------------------------------------
# AC3: Hotspots results display as table
# ---------------------------------------------------------------------------


class TestHotspotsResultsDisplay:
    """AC3: Hotspots results render as Rich Table with correct columns."""

    def test_display_hotspots_sets_view(self):
        """display_hotspots_results should set current_view to 'hotspots'."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        assert panel.current_view == "hotspots"

    def test_hotspots_table_shows_file_path(self):
        """Hotspots table should include file paths."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "api.ts" in output, f"File path not found in: {output!r}"

    def test_hotspots_table_shows_churn(self):
        """Hotspots table should include churn values."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "320" in output or "Churn" in output, (
            f"Churn column not found in: {output!r}"
        )

    def test_hotspots_table_sorted_by_churn(self):
        """Hotspots results should be sorted by churn (highest first)."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        result = panel.render_panel({})
        output = _render_to_string(result)
        # api.ts (churn=320) should appear before useGit.ts (churn=210)
        api_pos = output.find("api.ts")
        git_pos = output.find("useGit.ts")
        assert api_pos < git_pos, (
            f"Files not sorted by churn: api.ts at {api_pos}, useGit.ts at {git_pos}"
        )

    def test_hotspots_stores_last_results(self):
        """display_hotspots_results should store results in last_results."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        assert panel.last_results is not None, "last_results should be set"


# ---------------------------------------------------------------------------
# AC4: Dead code analysis triggers from TUI
# ---------------------------------------------------------------------------


class TestDeadCodeAnalysisTrigger:
    """AC4: Pressing 'd' triggers dead code analysis in a background worker."""

    def test_debug_panel_has_run_dead_code_method(self):
        """DebugPanel should have run_dead_code_analysis method."""
        panel = _make_panel()
        assert hasattr(panel, "run_dead_code_analysis"), (
            "DebugPanel must have run_dead_code_analysis method"
        )

    def test_deadcode_trigger_sets_loading_state(self):
        """Triggering dead code should set loading state."""
        panel = _make_panel()
        panel.show_loading("Analyzing dead code...")
        assert panel.loading is True


# ---------------------------------------------------------------------------
# AC5: Dead code results display with tabs
# ---------------------------------------------------------------------------


class TestDeadCodeResultsDisplay:
    """AC5: Dead code results display Stale Files and Unused Exports."""

    def test_display_deadcode_sets_view(self):
        """display_dead_code_results should set current_view to 'deadcode'."""
        panel = _make_panel()
        panel.display_dead_code_results(SAMPLE_DEADCODE_RESULT, SAMPLE_UNUSED_EXPORTS)
        assert panel.current_view == "deadcode"

    def test_deadcode_shows_stale_files(self):
        """Dead code results should show stale file paths."""
        panel = _make_panel()
        panel.display_dead_code_results(SAMPLE_DEADCODE_RESULT, SAMPLE_UNUSED_EXPORTS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "old-component.tsx" in output, f"Stale file not found in: {output!r}"

    def test_deadcode_shows_days_stale(self):
        """Dead code results should show days since last commit."""
        panel = _make_panel()
        panel.display_dead_code_results(SAMPLE_DEADCODE_RESULT, SAMPLE_UNUSED_EXPORTS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "287" in output, f"Days stale (287) not found in: {output!r}"

    def test_deadcode_shows_unused_exports(self):
        """Dead code results should show unused export symbols."""
        panel = _make_panel()
        panel.display_dead_code_results(SAMPLE_DEADCODE_RESULT, SAMPLE_UNUSED_EXPORTS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "oldHelper" in output, f"Unused export 'oldHelper' not found in: {output!r}"

    def test_deadcode_shows_section_headers(self):
        """Dead code results should have Stale Files and Unused Exports sections."""
        panel = _make_panel()
        panel.display_dead_code_results(SAMPLE_DEADCODE_RESULT, SAMPLE_UNUSED_EXPORTS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "Stale" in output, f"'Stale Files' section header not found in: {output!r}"
        assert "Unused" in output or "Export" in output, (
            f"'Unused Exports' section header not found in: {output!r}"
        )


# ---------------------------------------------------------------------------
# AC6: Health score analysis triggers from TUI
# ---------------------------------------------------------------------------


class TestHealthScoreAnalysisTrigger:
    """AC6: Pressing 's' triggers health score analysis in a background worker."""

    def test_debug_panel_has_run_health_score_method(self):
        """DebugPanel should have run_health_score_analysis method."""
        panel = _make_panel()
        assert hasattr(panel, "run_health_score_analysis"), (
            "DebugPanel must have run_health_score_analysis method"
        )

    def test_healthscore_trigger_sets_loading_state(self):
        """Triggering health score should set loading state."""
        panel = _make_panel()
        panel.show_loading("Analyzing health score...")
        assert panel.loading is True


# ---------------------------------------------------------------------------
# AC7: Health score results display dimensions
# ---------------------------------------------------------------------------


class TestHealthScoreResultsDisplay:
    """AC7: Health score results display dimensions with scores and trends."""

    def test_display_healthscore_sets_view(self):
        """display_health_score_results should set current_view to 'healthscore'."""
        panel = _make_panel()
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        assert panel.current_view == "healthscore"

    def test_healthscore_shows_composite_score(self):
        """Health score results should show the composite score."""
        panel = _make_panel()
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "72" in output, f"Composite score (72.5) not found in: {output!r}"

    def test_healthscore_shows_dimension_names(self):
        """Health score results should show dimension names."""
        panel = _make_panel()
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "churn" in output.lower(), f"Dimension 'churn' not found in: {output!r}"
        assert "complexity" in output.lower(), f"Dimension 'complexity' not found in: {output!r}"

    def test_healthscore_shows_dimension_scores(self):
        """Health score results should show individual dimension scores."""
        panel = _make_panel()
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "65" in output, f"Churn score (65) not found in: {output!r}"
        assert "81" in output, f"Test gaps score (81) not found in: {output!r}"

    def test_healthscore_stores_last_results(self):
        """display_health_score_results should store results."""
        panel = _make_panel()
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        assert panel.last_results is not None


# ---------------------------------------------------------------------------
# AC8: Escape returns to normal debug view
# ---------------------------------------------------------------------------


class TestEscapeReturnsToNormal:
    """AC8: Pressing escape returns to normal token/context display."""

    def test_show_normal_view_resets_current_view(self):
        """show_normal_view should set current_view back to 'normal'."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        assert panel.current_view == "hotspots"
        panel.show_normal_view()
        assert panel.current_view == "normal"

    def test_show_normal_view_clears_loading(self):
        """show_normal_view should clear loading state."""
        panel = _make_panel()
        panel.show_loading("Analyzing...")
        assert panel.loading is True
        panel.show_normal_view()
        assert panel.loading is False

    def test_normal_view_renders_context_data(self):
        """After escape, panel should render context/token data again."""
        panel = _make_panel()
        panel._handle_context_message(SAMPLE_CONTEXT_DATA)
        # Switch to tool view then back
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        panel.show_normal_view()
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output, f"Normal view should show tier after escape: {output!r}"
        assert "45,000" in output, f"Normal view should show tokens after escape: {output!r}"

    def test_escape_from_deadcode_view(self):
        """Escape from dead code view should return to normal."""
        panel = _make_panel()
        panel.display_dead_code_results(SAMPLE_DEADCODE_RESULT, SAMPLE_UNUSED_EXPORTS)
        assert panel.current_view == "deadcode"
        panel.show_normal_view()
        assert panel.current_view == "normal"

    def test_escape_from_healthscore_view(self):
        """Escape from health score view should return to normal."""
        panel = _make_panel()
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        assert panel.current_view == "healthscore"
        panel.show_normal_view()
        assert panel.current_view == "normal"


# ---------------------------------------------------------------------------
# AC9: Loading state prevents duplicate triggers
# ---------------------------------------------------------------------------


class TestLoadingPreventseDuplicates:
    """AC9: While analysis is running, duplicate triggers are ignored."""

    def test_loading_attribute_exists(self):
        """DebugPanel should have a loading attribute, defaulting to False."""
        panel = _make_panel()
        assert hasattr(panel, "loading"), "DebugPanel must have loading attribute"
        assert panel.loading is False

    def test_show_loading_sets_flag(self):
        """show_loading should set loading to True."""
        panel = _make_panel()
        panel.show_loading("Analyzing...")
        assert panel.loading is True

    def test_loading_renders_indicator(self):
        """While loading, render_panel should show loading indicator."""
        panel = _make_panel()
        panel.show_loading("Analyzing hotspots...")
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "Analyzing" in output, f"Loading indicator not shown: {output!r}"


# ---------------------------------------------------------------------------
# AC10: Errors are displayed gracefully
# ---------------------------------------------------------------------------


class TestErrorsDisplayGracefully:
    """AC10: Analysis failures show error message with retry option."""

    def test_debug_panel_has_show_error_method(self):
        """DebugPanel should have show_error method."""
        panel = _make_panel()
        assert hasattr(panel, "show_error"), "DebugPanel must have show_error method"

    def test_show_error_sets_error_view(self):
        """show_error should update view to show the error."""
        panel = _make_panel()
        panel.show_error("Hotspots failed: timeout")
        # Should not be in loading state
        assert panel.loading is False

    def test_show_error_renders_error_message(self):
        """Error state should render the error message."""
        panel = _make_panel()
        panel.show_error("Hotspots failed: timeout")
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "Error" in output or "error" in output or "failed" in output.lower(), (
            f"Error message not shown in: {output!r}"
        )
        assert "timeout" in output, f"Error detail 'timeout' not found in: {output!r}"

    def test_error_clears_on_escape(self):
        """Pressing escape after error should return to normal view."""
        panel = _make_panel()
        panel.show_error("Analysis failed")
        panel.show_normal_view()
        assert panel.current_view == "normal"
        assert panel.loading is False

    def test_error_from_hotspots_failure(self):
        """Hotspots analysis failure should show graceful error."""
        panel = _make_panel()
        panel.show_error("Hotspots failed: No git repository found")
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "git" in output.lower() or "repository" in output.lower(), (
            f"Error context not shown: {output!r}"
        )


# ---------------------------------------------------------------------------
# View state management — cross-cutting
# ---------------------------------------------------------------------------


class TestViewStateManagement:
    """Cross-cutting: view state transitions are consistent."""

    def test_initial_view_is_normal(self):
        """Fresh DebugPanel should start in 'normal' view."""
        panel = _make_panel()
        assert panel.current_view == "normal"

    def test_view_transitions_are_exclusive(self):
        """Switching views should update current_view exclusively."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        assert panel.current_view == "hotspots"
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        assert panel.current_view == "healthscore"
        panel.show_normal_view()
        assert panel.current_view == "normal"

    def test_last_results_updates_on_new_analysis(self):
        """last_results should reflect the most recent analysis."""
        panel = _make_panel()
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        assert panel.last_results is SAMPLE_HOTSPOT_RESULT
        panel.display_health_score_results(SAMPLE_HEALTHSCORE_RESULT)
        assert panel.last_results is SAMPLE_HEALTHSCORE_RESULT

    def test_render_panel_dispatches_by_view(self):
        """render_panel should produce different output per current_view."""
        panel = _make_panel()
        panel._handle_context_message(SAMPLE_CONTEXT_DATA)

        # Normal view
        panel.show_normal_view()
        normal_output = _render_to_string(panel.render_panel(panel._context_data or {}))

        # Hotspots view
        panel.display_hotspots_results(SAMPLE_HOTSPOT_RESULT)
        hotspots_output = _render_to_string(panel.render_panel({}))

        assert normal_output != hotspots_output, (
            "Normal and hotspots views should produce different output"
        )
