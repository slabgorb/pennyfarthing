"""
Console output utilities for Pennyfarthing scripts.

Provides consistent colored output for CLI tools:
- success(): Green [OK] prefix
- info(): Blue [INFO] prefix
- warn(): Yellow [WARN] prefix
- error(): Red [ERROR] prefix

Consolidates output formatting from jira_sync.py and provides
a consistent interface for all CLI scripts.
"""

from __future__ import annotations

import os
import sys
from typing import TextIO


# ANSI color codes
class Colors:
    """ANSI escape codes for terminal colors."""

    RED = "\x1b[31m"
    GREEN = "\x1b[32m"
    YELLOW = "\x1b[33m"
    BLUE = "\x1b[34m"
    MAGENTA = "\x1b[35m"
    CYAN = "\x1b[36m"
    BOLD = "\x1b[1m"
    DIM = "\x1b[2m"
    RESET = "\x1b[0m"


def _supports_color(stream: TextIO) -> bool:
    """Check if the output stream supports ANSI colors.

    Args:
        stream: Output stream to check

    Returns:
        True if colors are supported
    """
    # Check for NO_COLOR environment variable (standard)
    if os.environ.get("NO_COLOR"):
        return False

    # Check for FORCE_COLOR environment variable
    if os.environ.get("FORCE_COLOR"):
        return True

    # Check if stream is a TTY
    if hasattr(stream, "isatty") and stream.isatty():
        return True

    return False


def _colorize(text: str, color: str, stream: TextIO = sys.stderr) -> str:
    """Apply color to text if supported.

    Args:
        text: Text to colorize
        color: ANSI color code
        stream: Output stream (for TTY detection)

    Returns:
        Colorized text or plain text if colors not supported
    """
    if _supports_color(stream):
        return f"{color}{text}{Colors.RESET}"
    return text


def success(msg: str, file: TextIO = sys.stderr) -> None:
    """Print success message with green [OK] prefix.

    Args:
        msg: Message to print
        file: Output stream (default: stderr)
    """
    prefix = _colorize("[OK]", Colors.GREEN, file)
    print(f"{prefix} {msg}", file=file)


def info(msg: str, file: TextIO = sys.stderr) -> None:
    """Print info message with blue [INFO] prefix.

    Args:
        msg: Message to print
        file: Output stream (default: stderr)
    """
    prefix = _colorize("[INFO]", Colors.BLUE, file)
    print(f"{prefix} {msg}", file=file)


def warn(msg: str, file: TextIO = sys.stderr) -> None:
    """Print warning message with yellow [WARN] prefix.

    Args:
        msg: Message to print
        file: Output stream (default: stderr)
    """
    prefix = _colorize("[WARN]", Colors.YELLOW, file)
    print(f"{prefix} {msg}", file=file)


def error(msg: str, file: TextIO = sys.stderr) -> None:
    """Print error message with red [ERROR] prefix.

    Args:
        msg: Message to print
        file: Output stream (default: stderr)
    """
    prefix = _colorize("[ERROR]", Colors.RED, file)
    print(f"{prefix} {msg}", file=file)


def debug(msg: str, file: TextIO = sys.stderr) -> None:
    """Print debug message with dim [DEBUG] prefix.

    Args:
        msg: Message to print
        file: Output stream (default: stderr)
    """
    prefix = _colorize("[DEBUG]", Colors.DIM, file)
    print(f"{prefix} {msg}", file=file)


def header(msg: str, char: str = "=", width: int = 60, file: TextIO = sys.stderr) -> None:
    """Print a header with decorative lines.

    Args:
        msg: Header text
        char: Character for decoration line
        width: Total width of the line
        file: Output stream (default: stderr)
    """
    line = char * width
    print(f"\n{line}", file=file)
    print(msg, file=file)
    print(line, file=file)


def divider(char: str = "-", width: int = 40, file: TextIO = sys.stderr) -> None:
    """Print a divider line.

    Args:
        char: Character for divider
        width: Width of divider
        file: Output stream (default: stderr)
    """
    print(char * width, file=file)


def bold(text: str, stream: TextIO = sys.stdout) -> str:
    """Return bold text if colors supported.

    Args:
        text: Text to make bold
        stream: Output stream (for TTY detection)

    Returns:
        Bold text or plain text
    """
    return _colorize(text, Colors.BOLD, stream)


def dim(text: str, stream: TextIO = sys.stdout) -> str:
    """Return dimmed text if colors supported.

    Args:
        text: Text to dim
        stream: Output stream (for TTY detection)

    Returns:
        Dimmed text or plain text
    """
    return _colorize(text, Colors.DIM, stream)
