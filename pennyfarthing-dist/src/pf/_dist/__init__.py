"""Bundled pennyfarthing-dist content.

When installed via pip/pipx, this package contains the content directories
(agents, commands, guides, skills, etc.) that are copied into consumer
projects by ``pf init``.

At dev time these are symlinks into the source tree; in the wheel they are
real copies (minus portraits/).
"""

from pathlib import Path


def get_root() -> Path:
    """Return the root of the bundled _dist content directory."""
    return Path(__file__).resolve().parent


def is_populated() -> bool:
    """Check whether the bundled content is actually present.

    Returns True if at least the agents/ and commands/ directories exist,
    which indicates the package was built with content included.
    """
    root = get_root()
    return (
        (root / "agents").is_dir() and (root / "commands").is_dir() and (root / "skills").is_dir()
    )
