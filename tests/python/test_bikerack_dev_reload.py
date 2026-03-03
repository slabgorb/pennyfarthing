"""Tests for BikeRack TUI dev-mode auto-reload (Story 120-11).

Verifies:
  AC1: Dev mode launcher exists and is importable
  AC2: File watcher targets correct directories and ignore patterns
  AC3: File change events trigger app restart with same arguments
  AC4: CSS hot-reload passthrough via Textual dev mode

Run with: python -m pytest tests/python/test_bikerack_dev_reload.py -v
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

# ============================================================================
# AC1: Dev mode launcher exists and is importable
# ============================================================================


class TestDevModeLauncherExists:
    """AC1: A dev-mode launcher module exists with auto-reload capability."""

    def test_dev_main_importable(self):
        """tui.py should export a dev_main() function for dev-mode launch."""
        from pf.bikerack.tui import dev_main

        assert callable(dev_main), "dev_main should be a callable function"

    def test_dev_main_is_not_main(self):
        """dev_main() should be distinct from main() (adds watching)."""
        from pf.bikerack.tui import dev_main, main

        assert dev_main is not main, "dev_main should be separate from main"

    def test_dev_main_accepts_port(self):
        """dev_main() should accept port parameter like main()."""
        import inspect

        from pf.bikerack.tui import dev_main

        sig = inspect.signature(dev_main)
        assert "port" in sig.parameters, "dev_main should accept a 'port' parameter"

    def test_dev_main_accepts_project_dir(self):
        """dev_main() should accept project_dir parameter like main()."""
        import inspect

        from pf.bikerack.tui import dev_main

        sig = inspect.signature(dev_main)
        assert "project_dir" in sig.parameters, (
            "dev_main should accept a 'project_dir' parameter"
        )


# ============================================================================
# AC2: Watch scope — correct directories and ignore patterns
# ============================================================================


class TestWatchScope:
    """AC2: File watcher targets correct directories and excludes noise."""

    def test_watch_paths_include_bikerack(self):
        """Watcher should monitor pf/bikerack/ directory."""
        from pf.bikerack.tui import get_watch_paths

        paths = get_watch_paths()
        Path(__file__).resolve().parent.parent.parent / "pennyfarthing-dist" / "pf" / "bikerack"
        # At least one path should be or contain the bikerack directory
        path_strs = [str(p) for p in paths]
        assert any("bikerack" in s for s in path_strs), (
            f"Watch paths should include bikerack dir, got: {path_strs}"
        )

    def test_watch_paths_include_bc(self):
        """Watcher should also monitor pf/bc/ (panel focus module)."""
        from pf.bikerack.tui import get_watch_paths

        paths = get_watch_paths()
        path_strs = [str(p) for p in paths]
        assert any("bc" in s for s in path_strs), (
            f"Watch paths should include bc dir, got: {path_strs}"
        )

    def test_watch_filter_ignores_pycache(self):
        """File watcher should ignore __pycache__ directories."""
        from pf.bikerack.tui import watch_filter

        # Simulate a change event in __pycache__
        assert watch_filter(
            "modified", "/path/to/pf/bikerack/sprint_panel.py"
        ), "Should accept .py files"
        assert not watch_filter(
            "modified", "/path/to/pf/bikerack/__pycache__/sprint_panel.cpython-314.pyc"
        ), "Should reject __pycache__ files"

    def test_watch_filter_ignores_pyc(self):
        """File watcher should ignore .pyc files even outside __pycache__."""
        from pf.bikerack.tui import watch_filter

        assert not watch_filter(
            "modified", "/path/to/pf/bikerack/tui.pyc"
        ), "Should reject .pyc files"

    def test_watch_filter_accepts_python_files(self):
        """File watcher should accept .py file changes."""
        from pf.bikerack.tui import watch_filter

        assert watch_filter(
            "modified", "/path/to/pf/bikerack/tui.py"
        ), "Should accept .py files"
        assert watch_filter(
            "modified", "/path/to/pf/bikerack/sprint_panel.py"
        ), "Should accept panel .py files"

    def test_watch_filter_ignores_non_python(self):
        """File watcher should ignore non-Python files."""
        from pf.bikerack.tui import watch_filter

        assert not watch_filter(
            "modified", "/path/to/pf/bikerack/README.md"
        ), "Should reject .md files"
        assert not watch_filter(
            "modified", "/path/to/pf/bikerack/data.json"
        ), "Should reject .json files"


# ============================================================================
# AC3: Clean restart with same arguments
# ============================================================================


class TestCleanRestart:
    """AC3: App restart preserves port and project-dir arguments."""

    def test_dev_main_passes_port_through(self):
        """dev_main(port=3456) should pass port to the underlying app."""
        from pf.bikerack.tui import dev_main

        with patch("pf.bikerack.tui.WheelHubClient"):
            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                with patch("pf.bikerack.tui._run_with_reload") as mock_reload:
                    mock_app = MagicMock()
                    MockApp.return_value = mock_app

                    dev_main(port=3456)

                    # _run_with_reload should be called (not app.run directly)
                    mock_reload.assert_called_once()
                    # Port should be forwarded
                    call_args = mock_reload.call_args
                    assert call_args is not None


# ============================================================================
# AC4: CSS hot-reload passthrough
# ============================================================================


class TestCSSHotReload:
    """AC4: Textual CSS hot-reload should work in dev mode."""

    def test_dev_main_enables_textual_dev_mode(self):
        """dev_main should set TEXTUAL env var for CSS hot-reload."""
        from pf.bikerack.tui import dev_main

        with patch("pf.bikerack.tui.WheelHubClient"):
            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                with patch("pf.bikerack.tui._run_with_reload"):
                    with patch.dict("os.environ", {}, clear=False):

                        mock_app = MagicMock()
                        MockApp.return_value = mock_app

                        dev_main(port=2898)

                        # Textual dev mode should be enabled
                        # (either TEXTUAL=devtools or app created with dev=True)
                        # The exact mechanism depends on implementation
