"""Project-aware pf CLI launcher.

Resolves the project-local pf source before importing, so a single
global pipx install serves whichever project you're working in.

Detection order:
  1. PROJECT_ROOT env var (explicit override)
  2. Walk up from CWD looking for pennyfarthing-dist/src/pf/ (framework repo)
  3. Walk up from CWD looking for pennyfarthing/pennyfarthing-dist/src/pf/ (orchestrator)
  4. Fall back to whatever the pipx venv has installed
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _find_local_src() -> str | None:
    """Find project-local pf source directory."""
    if env_root := os.environ.get("PROJECT_ROOT"):
        candidates = [
            Path(env_root) / "pennyfarthing-dist" / "src",
            Path(env_root) / "pennyfarthing" / "pennyfarthing-dist" / "src",
        ]
        for c in candidates:
            if (c / "pf" / "cli.py").is_file():
                return str(c)

    current = Path.cwd().resolve()
    while current != current.parent:
        # Framework repo: pennyfarthing-dist/src/pf/ is a direct child
        candidate = current / "pennyfarthing-dist" / "src"
        if (candidate / "pf" / "cli.py").is_file():
            return str(candidate)
        # Orchestrator: pennyfarthing/ subdir contains the framework
        candidate = current / "pennyfarthing" / "pennyfarthing-dist" / "src"
        if (candidate / "pf" / "cli.py").is_file():
            return str(candidate)
        current = current.parent

    return None


def main() -> None:
    """Entry point — resolve project-local pf, then run CLI."""
    local_src = _find_local_src()
    if local_src and local_src not in sys.path:
        sys.path.insert(0, local_src)

    from pf.cli import main as cli_main
    cli_main()
