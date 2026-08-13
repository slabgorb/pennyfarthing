"""Tests for TUI launcher entry point (Story 103-20).

Verifies:
  AC1: app.py has a main() function as standalone entry point
  AC2: main() accepts --port argument for explicit port override
  AC3: main() delegates .frame-port discovery to FrameClient via project_dir
  AC4: main() creates FrameClient and passes to TuiApp
  AC5: main() defaults project_dir to the cwd when none is given
  AC6: `pf launch tui --foreground` is the launch entry point

Repaired for 162-30 (class G, TUI/Frame API drift). Three contracts moved:
  * The `pf.tui.tui` module was replaced by `pf.tui.app` + `pf.tui.__main__`
    (see `pf/tui/__main__.py`), so the CLI-block check follows `__main__`.
  * There is no default port any more. Frame binds an OS-assigned free port
    (`frame/launcher.py:find_free_port`) and publishes `.frame-port`; `main()`
    hands `project_dir` to `FrameClient`, which does the discovery and raises
    rather than falling back. AC3/AC5 are re-derived onto that split.
  * The `just tui` recipe was removed in orchestrator commit `a6817c8`
    (`just tui-dev` remains for dev-mode reload). The sanctioned launch path is
    `pf launch tui`, so AC6 is re-derived onto that command.

Run with: python -m pytest tests/python/test_frame_tui_launcher.py -v
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


class TestMainFunctionExists:
    """AC1: tui.py has a main() function as standalone entry point."""

    def test_main_is_importable(self):
        """tui.py should export a main() function."""
        from pf.tui.app import main

        assert callable(main), "main should be a callable function"

    def test_main_is_not_tui_app(self):
        """main() should be a function, not the TuiApp class itself."""
        from pf.tui.app import TuiApp, main

        assert main is not TuiApp, "main should be a launcher function, not TuiApp"


class TestMainPortArgument:
    """AC2: main() accepts --port argument for explicit port override."""

    def test_main_with_explicit_port(self):
        """main(port=3456) should create client with that port."""
        from pf.tui.app import main

        with patch("pf.tui.app.FrameClient") as MockClient:
            with patch("pf.tui.app.TuiApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=3456)

                # FrameClient should be created with port=3456
                MockClient.assert_called_once()
                call_kwargs = MockClient.call_args
                assert call_kwargs.kwargs.get("port") == 3456 or (
                    call_kwargs.args and call_kwargs.args[0] == 3456
                ), f"FrameClient should be created with port=3456, got: {call_kwargs}"

    def test_main_with_different_port(self):
        """main(port=9999) should pass 9999 to client."""
        from pf.tui.app import main

        with patch("pf.tui.app.FrameClient") as MockClient:
            with patch("pf.tui.app.TuiApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=9999)

                call_kwargs = MockClient.call_args
                assert call_kwargs.kwargs.get("port") == 9999 or (
                    call_kwargs.args and call_kwargs.args[0] == 9999
                ), f"FrameClient should be created with port=9999, got: {call_kwargs}"


class TestMainPortDiscovery:
    """AC3: main() delegates .frame-port discovery to FrameClient."""

    def test_main_delegates_port_discovery_to_client(self, tmp_path):
        """main() should hand project_dir — not a port — to FrameClient."""
        from pf.tui.app import main

        # Write a port file; main() must NOT read it itself.
        (tmp_path / ".frame-port").write_text("4567")

        with patch("pf.tui.app.FrameClient") as MockClient:
            with patch("pf.tui.app.TuiApp") as MockApp:
                MockApp.return_value = MagicMock()

                main(project_dir=tmp_path)

                MockClient.assert_called_once()
                kwargs = MockClient.call_args.kwargs
                assert kwargs.get("project_dir") == tmp_path, (
                    f"FrameClient should get project_dir={tmp_path}, got: {kwargs}"
                )
                assert "port" not in kwargs, (
                    f"main() must not pre-resolve the port; discovery belongs to "
                    f"FrameClient.discover_port(), got: {kwargs}"
                )

    def test_client_discovery_reads_the_port_file(self, tmp_path):
        """The delegated discovery really does resolve the .frame-port value."""
        from pf.tui.client import FrameClient

        (tmp_path / ".frame-port").write_text("4567")

        assert FrameClient(project_dir=tmp_path).discover_port() == 4567


class TestMainDefaultProjectDir:
    """AC5: main() defaults project_dir to the cwd; there is no default port."""

    def test_main_defaults_project_dir_to_cwd(self):
        """main() with neither port nor project_dir should use Path.cwd()."""
        from pf.tui.app import main

        with patch("pf.tui.app.FrameClient") as MockClient:
            with patch("pf.tui.app.TuiApp") as MockApp:
                MockApp.return_value = MagicMock()

                main()

                kwargs = MockClient.call_args.kwargs
                assert kwargs.get("project_dir") == Path.cwd(), (
                    f"FrameClient should fall back to cwd, got: {kwargs}"
                )

    def test_no_port_file_raises_rather_than_defaulting(self, tmp_path):
        """With no .frame-port, discovery must fail loudly, not pick 2898."""
        from pf.tui.client import FrameClient

        with pytest.raises(FileNotFoundError):
            FrameClient(project_dir=tmp_path).discover_port()


class TestMainCreatesClientAndApp:
    """AC4: main() creates FrameClient and passes to TuiApp."""

    def test_main_passes_client_to_app(self):
        """main() should create FrameClient and pass it to TuiApp."""
        from pf.tui.app import main

        with patch("pf.tui.app.FrameClient") as MockClient:
            mock_client_instance = MagicMock()
            MockClient.return_value = mock_client_instance

            with patch("pf.tui.app.TuiApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=2898)

                # TuiApp should be created with the client
                MockApp.assert_called_once()
                call_kwargs = MockApp.call_args
                client_arg = call_kwargs.kwargs.get("client") or (
                    call_kwargs.args[0] if call_kwargs.args else None
                )
                assert client_arg is mock_client_instance, (
                    "TuiApp should be created with the FrameClient instance"
                )

    def test_main_runs_app(self):
        """main() should call app.run() to start the Textual event loop."""
        from pf.tui.app import main

        with patch("pf.tui.app.FrameClient"):
            with patch("pf.tui.app.TuiApp") as MockApp:
                mock_app = MagicMock()
                MockApp.return_value = mock_app

                main(port=2898)

                mock_app.run.assert_called_once(), (
                    "main() should call app.run() to start the TUI"
                )


class TestCliEntryPoint:
    """AC2: `python -m pf.tui` supports CLI invocation with a --port flag."""

    def test_module_has_cli_block(self):
        """pf/tui/__main__.py should have an if __name__ == '__main__' block."""
        import inspect

        from pf.tui import __main__ as tui_main_module

        source = inspect.getsource(tui_main_module)
        assert 'if __name__ == "__main__":' in source, (
            "pf/tui/__main__.py should have an if __name__ == '__main__' block "
            "for `python -m pf.tui` invocation"
        )

    def test_cli_block_accepts_port_and_project_dir(self):
        """The module entry point should parse --port and --project-dir."""
        import inspect

        from pf.tui import __main__ as tui_main_module

        source = inspect.getsource(tui_main_module)
        for flag in ("--port", "--project-dir"):
            assert flag in source, f"`python -m pf.tui` should accept {flag}"

    def test_cli_block_delegates_to_app_main(self):
        """`python -m pf.tui` must go through app.main() for terminal setup."""
        from pf.tui import __main__ as tui_main_module

        with patch("pf.tui.app.main") as mock_main:
            with patch(
                "sys.argv", ["pf.tui", "--port", "4567", "--project-dir", "/tmp"]
            ):
                tui_main_module.main()

        mock_main.assert_called_once_with(port=4567, project_dir=Path("/tmp"))


class TestLaunchEntryPoint:
    """AC6: `pf launch tui` is the launch entry point (replaces `just tui`)."""

    def test_pf_launch_tui_command_exists(self):
        """`pf launch tui` should be a registered Click command."""
        from pf.launch.cli import launch

        assert "tui" in launch.commands, (
            f"`pf launch` should expose a `tui` command, got: "
            f"{sorted(launch.commands)}"
        )

    def test_pf_tui_shortcut_maps_to_launch_tui(self):
        """The `pf tui` sugar shortcut should expand to `pf launch tui`."""
        from pf.cli import _SUGAR_SHORTCUTS

        assert _SUGAR_SHORTCUTS["tui"] == ("pf.launch.cli", "launch", "tui"), (
            f"`pf tui` should expand to `pf launch tui`, got: "
            f"{_SUGAR_SHORTCUTS.get('tui')}"
        )

    def test_launch_tui_foreground_calls_app_main(self):
        """`pf launch tui --foreground --port N` should call pf.tui.app.main()."""
        from click.testing import CliRunner
        from pf.launch.cli import launch

        with patch("pf.tui.app.main") as mock_main:
            result = CliRunner().invoke(
                launch,
                ["tui", "--foreground", "--port", "4567", "--project-dir", "."],
            )

        assert result.exit_code == 0, result.output
        mock_main.assert_called_once()
        assert mock_main.call_args.kwargs["port"] == 4567, (
            f"app.main should receive the explicit port, got: {mock_main.call_args}"
        )

    def test_tui_dev_recipe_still_present_in_orchestrator_justfile(self):
        """`just tui-dev` (auto-reload dev mode) should still exist upstream.

        The plain `just tui` recipe was removed in orchestrator commit a6817c8;
        `tui-dev` is the surviving justfile entry point. Skipped when the
        orchestrator checkout is not present (pennyfarthing is also used
        standalone).
        """
        import re

        orchestrator_justfile = (
            Path(__file__).resolve().parent.parent.parent.parent / "justfile"
        )
        if not orchestrator_justfile.exists():
            pytest.skip("Not running inside a pennyfarthing-orchestrator checkout")

        content = orchestrator_justfile.read_text()
        assert re.search(r"^tui-dev\s*:", content, re.MULTILINE), (
            "Orchestrator justfile should contain a 'tui-dev' recipe"
        )
        assert not re.search(r"^tui\s*:", content, re.MULTILINE), (
            "A plain 'tui' recipe reappeared — `pf launch tui` is the entry "
            "point now; update this test if the recipe was reinstated"
        )
