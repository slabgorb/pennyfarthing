"""
Console output utilities for Pennyfarthing scripts.

This module re-exports from pennyfarthing_scripts.common.output for
backwards compatibility. New code should import from common.output directly.
"""

# Re-export everything from the new location
from pennyfarthing_scripts.common.output import (
    Colors,
    _colorize,
    _supports_color,
    bold,
    debug,
    dim,
    divider,
    error,
    header,
    info,
    success,
    warn,
)

__all__ = [
    "Colors",
    "_colorize",
    "_supports_color",
    "bold",
    "debug",
    "dim",
    "divider",
    "error",
    "header",
    "info",
    "success",
    "warn",
]
