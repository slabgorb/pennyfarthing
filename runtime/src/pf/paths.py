"""Runtime-state path chokepoint for the pf plugin.

This module is the *single* place that knows how to derive runtime-state
locations for sessions, sidecars, and config. Every other module that
needs a runtime path imports from here.

Two environments are supported:

- Plugin context: ``CLAUDE_PLUGIN_DATA`` is set by Claude Code on hook
  invocation and points at ``~/.claude/plugins/data/<marketplace>-<plugin>/``.
  This is the primary path.

- Outside-plugin context (Keith's optional ``pf`` shim per spec §5.2):
  ``CLAUDE_PLUGIN_DATA`` is unset. Fall back to ``~/.claude/data/pf/``
  so both contexts agree.

Design references:
- Storage tiers: design spec §3.2
- Project hash (per-folder bucketing for sessions, sidecars, and config):
  design spec §3.4
- Paths chokepoint discussion: design spec §7.2
"""

from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path


_FALLBACK_DATA_ROOT = Path.home() / ".claude" / "data" / "pf"


def project_hash(path: Path | None = None) -> str:
    """12-character hex digest identifying a working copy.

    ``path`` defaults to ``Path.cwd()``. The hash is computed from the
    *absolute* path so that relative and absolute references to the same
    directory agree. This matches spec §3.4.

    Note: this function does NOT attempt git-toplevel discovery — the
    caller passes the directory they want hashed. The "use git toplevel
    when in a git repo" policy is implemented by ``project_root()``
    below; ``project_hash`` just hashes whatever path it is given.
    """
    if path is None:
        path = Path.cwd()
    absolute = Path(path).resolve()
    return hashlib.sha256(str(absolute).encode("utf-8")).hexdigest()[:12]


def project_root(path: Path | None = None) -> Path:
    """Resolve the working-copy root.

    If ``path`` (or cwd) is inside a git repo, return ``git rev-parse
    --show-toplevel`` as a ``Path``. Otherwise return the resolved
    absolute path of the input. The result is always absolute.

    Times out the git invocation at 5 seconds and treats timeout as a
    fallback case (returns the resolved input path).
    """
    start = Path(path).resolve() if path is not None else Path.cwd().resolve()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=start,
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # git not on PATH or hung — fall back
        return start
    if result.returncode != 0:
        return start
    top = result.stdout.strip()
    if not top:
        return start
    return Path(top).resolve()


def runtime_data() -> Path:
    """Resolve the runtime-state root.

    Reads ``CLAUDE_PLUGIN_DATA`` (set by Claude Code in plugin hooks);
    falls back to ``~/.claude/data/pf`` when unset (the §5.2 shim case).
    """
    env = os.environ.get("CLAUDE_PLUGIN_DATA")
    if env:
        return Path(env)
    return _FALLBACK_DATA_ROOT


def session_dir(path: Path | None = None) -> Path:
    """Active-session directory for the current working copy."""
    root = project_root(path)
    return runtime_data() / "projects" / project_hash(root) / ".session"


def config_path(path: Path | None = None) -> Path:
    """Local config (``config.local.yaml``) location for current working copy."""
    root = project_root(path)
    return runtime_data() / "projects" / project_hash(root) / "config.local.yaml"


def sidecars_dir(path: Path | None = None) -> Path:
    """Sidecar root for the current working copy (bucketed by project hash).

    Per-folder bucketing: each working copy gets its own sidecar directory,
    keyed on the same project_hash used by session_dir() and config_path().
    """
    root = project_root(path)
    return runtime_data() / "sidecars" / project_hash(root)
