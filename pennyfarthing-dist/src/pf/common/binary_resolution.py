"""Binary resolution strategy for the pf CLI.

Resolves the pf binary path for non-PATH contexts (IDE extensions,
GUI launches, Electron apps) where ~/.local/bin may not be on PATH.

Resolution order:
  1. PF_BIN environment variable (explicit override)
  2. ~/.local/bin/pf (uv/pipx default install location)
  3. Bare 'pf' on PATH (terminal sessions)
"""

from __future__ import annotations

import os
from pathlib import Path


def resolve_pf_binary() -> str:
    """Resolve the pf binary path.

    Returns:
        Absolute path to pf binary, or 'pf' as PATH fallback.
    """
    # 1. Explicit override
    pf_bin = os.environ.get("PF_BIN")
    if pf_bin:
        return pf_bin

    # 2. Default install location
    local_bin = Path.home() / ".local" / "bin" / "pf"
    if local_bin.exists():
        return str(local_bin)

    # 3. PATH fallback
    return "pf"
