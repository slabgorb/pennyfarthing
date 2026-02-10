"""Common utilities for Pennyfarthing scripts.

This package provides shared utilities used across all CLI tools:
- output: Colored console output functions
- config: Project configuration loading
"""

from pennyfarthing_scripts.common.config import (
    find_project_root,
    get_project_root,
    load_pennyfarthing_config,
    load_yaml_config,
)
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
    # Output
    "Colors",
    "bold",
    "debug",
    "dim",
    "divider",
    "error",
    "header",
    "info",
    "success",
    "warn",
    "_colorize",
    "_supports_color",
    # Config
    "find_project_root",
    "get_project_root",
    "load_pennyfarthing_config",
    "load_yaml_config",
]
