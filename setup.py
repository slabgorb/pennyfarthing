"""Custom build that resolves _dist symlinks into real copies for wheel builds.

In development, pf/_dist/ contains symlinks back to pennyfarthing-dist/
content directories (agents, commands, guides, etc.).  setuptools does not
follow symlinks when building wheels, so the installed package would be
missing all bundled content.  This override copies symlink targets into
real directories before the build runs, then restores the symlinks
afterward so the dev tree stays clean.
"""

import shutil
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py as _build_py

_DIST_DIR = Path(__file__).parent / "pennyfarthing-dist" / "src" / "pf" / "_dist"

# Directories to exclude from the copy
_EXCLUDE = {"__pycache__"}


class build_py(_build_py):
    """Resolve _dist symlinks before collecting package data."""

    def run(self):
        resolved = []
        for entry in _DIST_DIR.iterdir():
            if entry.is_symlink() and entry.is_dir():
                target = entry.resolve()
                entry.unlink()
                shutil.copytree(
                    target,
                    entry,
                    ignore=shutil.ignore_patterns(*_EXCLUDE),
                )
                resolved.append(entry)
        try:
            super().run()
        finally:
            # Restore symlinks so the dev tree stays clean
            for entry in resolved:
                # Compute the original relative symlink target
                rel = Path("../../..") / entry.name
                shutil.rmtree(entry)
                entry.symlink_to(rel)


setup(cmdclass={"build_py": build_py})
