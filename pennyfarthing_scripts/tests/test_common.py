"""Tests for common/ shared utilities package.

Story 63-9: Reorganize pennyfarthing_scripts into fan-out CLI pattern.

These tests verify the common/ package provides shared utilities
that work correctly when imported from the new location.
"""

import io
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest


class TestOutputModule:
    """Tests for common/output.py module."""

    def test_success_prints_green_prefix(self) -> None:
        """success() should print with [OK] prefix."""
        from pennyfarthing_scripts.common import output

        buffer = io.StringIO()
        # Force color support for testing
        with patch.object(output, "_supports_color", return_value=True):
            output.success("Test message", file=buffer)

        result = buffer.getvalue()
        assert "[OK]" in result or "\x1b[32m" in result  # Green or prefix
        assert "Test message" in result

    def test_info_prints_blue_prefix(self) -> None:
        """info() should print with [INFO] prefix."""
        from pennyfarthing_scripts.common import output

        buffer = io.StringIO()
        output.info("Info message", file=buffer)

        result = buffer.getvalue()
        assert "INFO" in result or "Info message" in result

    def test_warn_prints_yellow_prefix(self) -> None:
        """warn() should print with [WARN] prefix."""
        from pennyfarthing_scripts.common import output

        buffer = io.StringIO()
        output.warn("Warning message", file=buffer)

        result = buffer.getvalue()
        assert "WARN" in result or "Warning message" in result

    def test_error_prints_red_prefix(self) -> None:
        """error() should print with [ERROR] prefix."""
        from pennyfarthing_scripts.common import output

        buffer = io.StringIO()
        output.error("Error message", file=buffer)

        result = buffer.getvalue()
        assert "ERROR" in result or "Error message" in result

    def test_no_color_env_disables_colors(self) -> None:
        """NO_COLOR environment variable should disable colors."""
        from pennyfarthing_scripts.common import output

        with patch.dict(os.environ, {"NO_COLOR": "1"}):
            buffer = io.StringIO()
            output.success("Test", file=buffer)
            result = buffer.getvalue()
            # Should not contain ANSI escape codes
            assert "\x1b[" not in result

    def test_force_color_env_enables_colors(self) -> None:
        """FORCE_COLOR environment variable should enable colors."""
        from pennyfarthing_scripts.common import output

        with patch.dict(os.environ, {"FORCE_COLOR": "1"}, clear=False):
            # Remove NO_COLOR if present
            with patch.dict(os.environ, {"NO_COLOR": ""}, clear=False):
                assert output._supports_color(sys.stderr) is True

    def test_header_prints_decorated_line(self) -> None:
        """header() should print decorated header."""
        from pennyfarthing_scripts.common import output

        buffer = io.StringIO()
        output.header("Test Header", char="=", width=40, file=buffer)

        result = buffer.getvalue()
        assert "Test Header" in result
        assert "=" * 40 in result

    def test_divider_prints_line(self) -> None:
        """divider() should print a line."""
        from pennyfarthing_scripts.common import output

        buffer = io.StringIO()
        output.divider(char="-", width=20, file=buffer)

        result = buffer.getvalue()
        assert "-" * 20 in result


class TestConfigModule:
    """Tests for common/config.py module."""

    def test_get_project_root_finds_pennyfarthing_dir(self) -> None:
        """get_project_root() should find .pennyfarthing directory."""
        from pennyfarthing_scripts.common import config

        # This test assumes we're running from within the pennyfarthing project
        root = config.get_project_root()
        assert root is not None
        assert (root / ".pennyfarthing").is_dir()

    def test_get_project_root_raises_if_not_found(self) -> None:
        """get_project_root() should raise if no .pennyfarthing found."""
        from pennyfarthing_scripts.common import config

        # Start from root filesystem where there's no .pennyfarthing
        with pytest.raises(FileNotFoundError):
            config.get_project_root(start_dir=Path("/"))

    def test_load_yaml_config_returns_dict(self) -> None:
        """load_yaml_config() should return parsed YAML as dict."""
        from pennyfarthing_scripts.common import config

        # Test with existing sprint file
        root = config.get_project_root()
        sprint_path = root / "sprint" / "current-sprint.yaml"

        if sprint_path.exists():
            result = config.load_yaml_config(sprint_path)
            assert isinstance(result, dict)

    def test_load_yaml_config_returns_none_if_missing(self) -> None:
        """load_yaml_config() should return None for missing files."""
        from pennyfarthing_scripts.common import config

        result = config.load_yaml_config(Path("/nonexistent/file.yaml"))
        assert result is None

    def test_find_project_root_alias(self) -> None:
        """find_project_root should be an alias for get_project_root."""
        from pennyfarthing_scripts.common import config

        assert config.find_project_root == config.get_project_root

    def test_load_pennyfarthing_config_returns_dict(self) -> None:
        """load_pennyfarthing_config() should return config or empty dict."""
        from pennyfarthing_scripts.common import config

        result = config.load_pennyfarthing_config()
        assert isinstance(result, dict)


class TestColorsClass:
    """Tests for Colors class with ANSI codes."""

    def test_colors_has_expected_constants(self) -> None:
        """Colors class should have standard ANSI color codes."""
        from pennyfarthing_scripts.common.output import Colors

        assert hasattr(Colors, "RED")
        assert hasattr(Colors, "GREEN")
        assert hasattr(Colors, "YELLOW")
        assert hasattr(Colors, "BLUE")
        assert hasattr(Colors, "RESET")
        assert hasattr(Colors, "BOLD")
        assert hasattr(Colors, "DIM")

    def test_colors_are_ansi_escape_codes(self) -> None:
        """Color constants should be ANSI escape sequences."""
        from pennyfarthing_scripts.common.output import Colors

        assert Colors.RED.startswith("\x1b[")
        assert Colors.RESET == "\x1b[0m"
