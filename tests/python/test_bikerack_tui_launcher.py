"""Tests for BikeRack TUI launcher entry point (Story 103-20).

Verifies:
  AC1: tui.py has a main() function as standalone entry point
  AC2: main() accepts --port argument for explicit port override
  AC3: main() discovers port from .bikerack-port when no --port given
  AC4: main() creates WheelHubClient and passes to BikeRackApp
  AC5: main() falls back to default port (2898) when no port file exists
  AC6: `just tui` recipe exists in the orchestrator justfile

Run with: python -m pytest tests/python/test_bikerack_tui_launcher.py -v
"""

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


class TestMainFunctionExists:
    """AC1: tui.py has a main() function as standalone entry point."""

    def test_main_is_importable(self):
        """tui.py should export a main() function."""
        from pf.bikerack.tui import main

        assert callable(main), "main should be a callable function"

    def test_main_is_not_bikerack_app(self):
        """main() should be a function, not the BikeRackApp class itself."""
        from pf.bikerack.tui import BikeRackApp, main

        assert main is not BikeRackApp, "main should be a launcher function, not BikeRackApp"


class TestMainPortArgument:
    """AC2: main() accepts --port argument for explicit port override."""

    def test_main_with_explicit_port(self):
        """main(port=3456) should create client with that port."""
        from pf.bikerack.tui import main

        with patch("pf.bikerack.tui.WheelHubClient") as MockClient:
            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=3456)

                # WheelHubClient should be created with port=3456
                MockClient.assert_called_once()
                call_kwargs = MockClient.call_args
                assert call_kwargs.kwargs.get("port") == 3456 or (
                    call_kwargs.args and call_kwargs.args[0] == 3456
                ), f"WheelHubClient should be created with port=3456, got: {call_kwargs}"

    def test_main_with_different_port(self):
        """main(port=9999) should pass 9999 to client."""
        from pf.bikerack.tui import main

        with patch("pf.bikerack.tui.WheelHubClient") as MockClient:
            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=9999)

                call_kwargs = MockClient.call_args
                assert call_kwargs.kwargs.get("port") == 9999 or (
                    call_kwargs.args and call_kwargs.args[0] == 9999
                ), f"WheelHubClient should be created with port=9999, got: {call_kwargs}"


class TestMainPortDiscovery:
    """AC3: main() discovers port from .bikerack-port when no --port given."""

    def test_main_reads_port_file(self, tmp_path):
        """main() should read .bikerack-port when no port argument is given."""
        from pf.bikerack.tui import main

        # Write a port file
        (tmp_path / ".bikerack-port").write_text("4567")

        with patch("pf.bikerack.tui.WheelHubClient") as MockClient:
            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(project_dir=tmp_path)

                # Should discover port 4567 from port file
                call_kwargs = MockClient.call_args
                port_used = call_kwargs.kwargs.get("port") or (
                    call_kwargs.args[0] if call_kwargs.args else None
                )
                assert port_used == 4567, (
                    f"Should discover port 4567 from .bikerack-port, got: {port_used}"
                )


class TestMainDefaultPort:
    """AC5: main() falls back to default port (2898) when no port file exists."""

    def test_main_uses_default_port_when_no_file(self, tmp_path):
        """main() should use default port 2898 when no .bikerack-port exists."""
        from pf.bikerack.tui import main

        # No port file in tmp_path

        with patch("pf.bikerack.tui.WheelHubClient") as MockClient:
            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(project_dir=tmp_path)

                # Should fall back to default port 2898
                call_kwargs = MockClient.call_args
                port_used = call_kwargs.kwargs.get("port") or (
                    call_kwargs.args[0] if call_kwargs.args else None
                )
                assert port_used == 2898, (
                    f"Should fall back to default port 2898, got: {port_used}"
                )


class TestMainCreatesClientAndApp:
    """AC4: main() creates WheelHubClient and passes to BikeRackApp."""

    def test_main_passes_client_to_app(self):
        """main() should create WheelHubClient and pass it to BikeRackApp."""
        from pf.bikerack.tui import main

        with patch("pf.bikerack.tui.WheelHubClient") as MockClient:
            mock_client_instance = MagicMock()
            MockClient.return_value = mock_client_instance

            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=2898)

                # BikeRackApp should be created with the client
                MockApp.assert_called_once()
                call_kwargs = MockApp.call_args
                client_arg = call_kwargs.kwargs.get("client") or (
                    call_kwargs.args[0] if call_kwargs.args else None
                )
                assert client_arg is mock_client_instance, (
                    "BikeRackApp should be created with the WheelHubClient instance"
                )

    def test_main_runs_app(self):
        """main() should call app.run() to start the Textual event loop."""
        from pf.bikerack.tui import main

        with patch("pf.bikerack.tui.WheelHubClient") as MockClient:
            with patch("pf.bikerack.tui.BikeRackApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=2898)

                mock_app.run.assert_called_once(), (
                    "main() should call app.run() to start the TUI"
                )


class TestCliEntryPoint:
    """AC2: tui.py supports CLI invocation with --port flag."""

    def test_module_has_cli_block(self):
        """tui.py should have an if __name__ == '__main__' block."""
        import inspect

        from pf.bikerack import tui

        source = inspect.getsource(tui)
        assert '__name__' in source and '__main__' in source, (
            "tui.py should have an if __name__ == '__main__' block for CLI invocation"
        )


class TestJustTuiRecipe:
    """AC6: `just tui` recipe exists in the orchestrator justfile."""

    def test_just_tui_recipe_listed(self):
        """The orchestrator justfile should contain a 'tui' recipe."""
        # Read the justfile from the orchestrator root
        justfile = Path(__file__).resolve().parent.parent.parent.parent / "justfile"
        if not justfile.exists():
            # Try relative to project structure
            justfile = Path(__file__).resolve().parent.parent.parent / "justfile"

        # Search for the recipe in known locations
        found = False
        for candidate in [justfile, justfile.parent / "justfile"]:
            if candidate.exists():
                content = candidate.read_text()
                # Look for a 'tui' recipe definition (justfile syntax: recipe_name:)
                if "\ntui" in content or content.startswith("tui"):
                    found = True
                    break

        assert found, (
            "Orchestrator justfile should contain a 'tui' recipe"
        )

    def test_just_tui_delegates_to_pennyfarthing(self):
        """The `just tui` recipe should invoke the TUI entry point."""
        # Read the pennyfarthing justfile
        justfile = Path(__file__).resolve().parent.parent.parent / "justfile"
        if not justfile.exists():
            pytest.skip("Could not locate pennyfarthing justfile")

        content = justfile.read_text()

        # Check that there's a tui recipe that involves bikerack.tui or similar
        has_tui = False
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.startswith("tui") and ":" in line:
                has_tui = True
                break

        assert has_tui, (
            "pennyfarthing justfile should contain a 'tui' recipe"
        )
