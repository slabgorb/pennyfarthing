"""
Configuration loading utilities for Pennyfarthing scripts.

This module re-exports from pennyfarthing_scripts.common.config for
backwards compatibility. New code should import from common.config directly.
"""

# Re-export everything from the new location
from pennyfarthing_scripts.common.config import (
    find_project_root,
    get_project_root,
    load_pennyfarthing_config,
    load_yaml_config,
)

__all__ = [
    "find_project_root",
    "get_project_root",
    "load_pennyfarthing_config",
    "load_yaml_config",
]
