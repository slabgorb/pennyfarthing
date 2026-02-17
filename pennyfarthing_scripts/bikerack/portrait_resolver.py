"""Portrait path resolution for BikeRack TUI.

Resolves persona portrait image paths from theme YAML and portrait directories.
Python port of packages/core/src/shared/portrait-resolver.ts.

Story 110-3: Portrait image header with textual-image.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def resolve_portrait_path(theme: str, agent: str, project_root: Path | None = None) -> Path | None:
    """Resolve the full path to a portrait image.

    Args:
        theme: Theme name (e.g., 'hogans-heroes', 'monty-python')
        agent: Agent role (e.g., 'sm', 'tea', 'dev')
        project_root: Project root for path resolution. Defaults to cwd.

    Returns:
        Path to portrait file, or None if not found.
    """
    return None


def detect_image_protocol() -> str | None:
    """Detect the best available terminal image protocol.

    Must be called BEFORE App.run() since protocol detection requires
    raw terminal access that Textual's event loop will claim.

    Returns:
        Protocol name ('kitty', 'sixel', 'halfcell', None for unsupported).
    """
    return None
