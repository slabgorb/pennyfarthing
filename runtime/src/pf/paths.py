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
- Origin slug normalization: design spec §3.3
- Project hash: design spec §3.4
- Paths chokepoint discussion: design spec §7.2
"""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
from pathlib import Path
from typing import Optional


_FALLBACK_DATA_ROOT = Path.home() / ".claude" / "data" / "pf"
_GIT_DOT_GIT_SUFFIX = re.compile(r"\.git$")


def origin_slug(url: str) -> Optional[str]:
    """Normalize a git remote URL to a stable ``host/owner/repo`` slug.

    Returns ``None`` if the URL does not resemble a git remote. Callers
    that need a guaranteed-non-None bucket key (e.g., for sidecar dirs)
    should fall back to ``_local/<project_hash>`` themselves.
    """
    if not url:
        return None

    candidate = url.strip()

    # Strip ssh://user@ prefix
    if candidate.startswith("ssh://"):
        candidate = candidate[len("ssh://"):]
        if "@" in candidate.split("/", 1)[0]:
            candidate = candidate.split("@", 1)[1]
        # ssh://host/owner/repo — already path-form
    elif candidate.startswith("http://") or candidate.startswith("https://"):
        candidate = candidate.split("://", 1)[1]
        # https://host/owner/repo — already path-form
    elif "@" in candidate and ":" in candidate:
        # git@github.com:owner/repo.git form
        user_host, sep, path = candidate.partition(":")
        if not sep:
            return None
        _, _, host = user_host.rpartition("@")
        candidate = f"{host}/{path}"
    else:
        return None

    # Strip trailing .git
    candidate = _GIT_DOT_GIT_SUFFIX.sub("", candidate)

    # Lowercase the host segment only (keep owner/repo casing)
    host_part, sep, rest = candidate.partition("/")
    if not sep or not rest:
        return None
    return f"{host_part.lower()}/{rest}"


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
    """
    start = Path(path).resolve() if path is not None else Path.cwd().resolve()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=start,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        # git not on PATH — fall back
        return start
    if result.returncode != 0:
        return start
    top = result.stdout.strip()
    if not top:
        return start
    return Path(top).resolve()


def project_origin_slug(path: Path | None = None) -> str:
    """Origin slug for sidecar bucketing.

    Falls back to ``_local/<project_hash>`` when no git remote, no git
    repo, or an unparseable origin URL is detected. Never returns None;
    the caller can use the result directly as a directory name segment.
    """
    root = project_root(path)
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return f"_local/{project_hash(root)}"
    if result.returncode != 0:
        return f"_local/{project_hash(root)}"
    slug = origin_slug(result.stdout.strip())
    if slug is None:
        return f"_local/{project_hash(root)}"
    return slug


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
    """Sidecar root for the current project (bucketed by origin slug)."""
    slug = project_origin_slug(path)
    return runtime_data() / "sidecars" / slug
