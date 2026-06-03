"""portrait_cdn — On-demand portrait download from the Cloudflare R2 CDN.

Story 154-1. Drop-in replacement for the gh-CLI GitHub Contents API download
in :mod:`pf.package.portraits`. Downloads per-theme portrait packs lazily on
first use, verifies them with SHA256, and caches them locally behind a
``.complete`` sentinel for instant subsequent access.

The public contract below is specified in GitHub issue #17. Every function
returns a result object or ``None`` and MUST NOT raise on failure paths
(SOUL principle #10 — return results, don't throw): a dead or unreachable CDN
degrades gracefully so a session continues without portraits.

RED-phase stub: bodies raise ``NotImplementedError``. The Dev (GREEN) phase
fills them in. Constants are part of the contract and should be preserved.

Implementation note for Dev: keep network calls *qualified*
(``urllib.request.urlopen``, ``urllib.request.urlretrieve``) so the test
suite's monkeypatching of the stdlib intercepts them.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

CDN_BASE_URL = "https://portraits.darkatelier.org/v1"
MANIFEST_URL = f"{CDN_BASE_URL}/manifest.json"
MANIFEST_CHECK_INTERVAL = 86400  # 24h rate limit between manifest fetches


def _cache_dir() -> Path:
    """Return the XDG-compliant portrait cache directory.

    ``$XDG_DATA_HOME/pennyfarthing/portraits`` if set, else
    ``~/.local/share/pennyfarthing/portraits``.
    """
    raise NotImplementedError


def fetch_manifest(cache: Path | None = None) -> dict | None:
    """Fetch the remote manifest with etag caching, rate-limited to 24h.

    Returns the parsed manifest dict, or ``None`` if it cannot be obtained
    (and no usable local copy exists). Never raises on network failure.
    """
    raise NotImplementedError


def ensure_portraits(theme: str, cache: Path | None = None) -> dict[str, Any]:
    """Ensure portraits for ``theme`` are present locally, downloading if missing.

    Instant on cache hit (``.complete`` sentinel). On a miss: fetch manifest,
    download the theme pack, verify SHA256 before extraction, extract, write
    the sentinel, and merge the persona map into the local manifest.

    Returns ``{"success": True, "cache_dir": str, "action": "cached"|"downloaded"}``
    on success, or ``{"success": False, "error": str}`` on any failure. Never
    raises.
    """
    raise NotImplementedError


def resolve_portrait(
    theme: str,
    agent: str,
    preferred_size: str = "medium",
    cache: Path | None = None,
) -> Path | None:
    """Resolve the path to an agent's portrait from the CDN cache.

    Returns ``None`` when the local manifest is missing, the agent has no slug,
    or no image file exists for any candidate size.
    """
    raise NotImplementedError


def list_cached(cache: Path | None = None) -> list[str]:
    """Return the sorted list of themes with a ``.complete`` sentinel."""
    raise NotImplementedError


def status(cache: Path | None = None) -> dict[str, Any]:
    """Return cache stats: ``{"cache_dir", "themes", "images", "mb"}``."""
    raise NotImplementedError


def clean(theme: str, cache: Path | None = None) -> dict[str, Any]:
    """Remove a cached theme. ``{"success": False, ...}`` if not cached."""
    raise NotImplementedError
