"""portrait_cdn — On-demand portrait download from the pennyfarthing R2 CDN.

Fetches **individual** portrait PNGs directly from the bucket on first use and
caches them locally for instant subsequent access. The bucket layout is::

    {CDN_BASE_URL}/portraits/{theme}/{size}/{slug}.png

where ``slug`` is the locally-computed ``shortName-OCEAN`` identifier (see
:func:`pf.tui.portrait_resolver._extract_agent_slug`). The consumer already
knows the slug from the theme YAML, so it asks the CDN for exactly the file it
needs — there is **no manifest and no per-theme tarball pack**. (The historical
manifest+pack protocol pointed at a third party's ``portraits.darkatelier.org``
bucket; this module talks to our own ``pennyfarthing.slabgorb.com`` bucket,
which serves raw PNGs.)

Every function returns a result object / path or ``None`` and never raises on a
failure path (SOUL principle #10 — return results, don't throw): a dead or
unreachable CDN degrades gracefully so a session continues without portraits.

Security:
- ``theme`` and ``slug`` are single path/URL segments validated against an
  allowlist before interpolation (CWE-22); a symlink-containment check keeps
  every write inside the cache (CWE-59).
- Cloudflare rejects the default ``Python-urllib`` User-Agent with a 403, so
  every request sends an explicit UA.
- All text I/O is UTF-8 (CWE-838).

Implementation note: network calls are kept *qualified*
(``urllib.request.urlopen``) so they remain interceptable by the test suite's
stdlib monkeypatching.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# The 8-byte PNG signature. A cached entry that does not start with these bytes
# is a poisoned stub (a Git-LFS pointer, a truncated/empty file) rather than a
# real image — it must be discarded and re-fetched (story 153-12).
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# Base of our R2 bucket's public custom domain. Override with
# ``PF_PORTRAIT_CDN_BASE_URL`` (e.g. to point at a staging bucket). No trailing
# slash and no ``/v1`` — the bucket serves objects at ``/portraits/...``.
CDN_BASE_URL = os.environ.get(
    "PF_PORTRAIT_CDN_BASE_URL", "https://pennyfarthing.slabgorb.com"
).rstrip("/")

# Cloudflare 403s the default ``Python-urllib/x.y`` UA. Every request MUST set
# an explicit User-Agent or it is blocked.
_USER_AGENT = "pennyfarthing-portrait-cdn/1.0"

# A theme/slug is a single cache + URL segment. Allow an alphanumeric leading
# char followed by alnum/dot/dash/underscore. An *allowlist* closes the whole
# escape class at once: empty, ``.``/``..``, separators (``/``, ``\``), null
# bytes, whitespace, and URL-special chars (``#``, ``?``) are all rejected
# before any path is built or any request is made (CWE-22).
_SAFE_SEGMENT_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")

# Size buckets present in the bucket, smallest first.
SIZES: tuple[str, ...] = ("small", "medium", "large", "original")

# For a requested size, the order in which we try buckets (preferred first,
# then nearest-useful fallbacks).
_SIZE_ORDER: dict[str, tuple[str, ...]] = {
    "small": ("small", "medium", "large", "original"),
    "medium": ("medium", "large", "small", "original"),
    "large": ("large", "medium", "small", "original"),
    "original": ("original", "large", "medium", "small"),
}


def _cache_dir() -> Path:
    """Return the XDG-compliant portrait cache directory.

    ``$XDG_DATA_HOME/pennyfarthing/portraits`` if set, else
    ``~/.local/share/pennyfarthing/portraits``.
    """
    base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "pennyfarthing" / "portraits"


def _is_safe_segment(seg: str) -> bool:
    """Whether ``seg`` is a safe single path/URL segment (CWE-22)."""
    return bool(seg) and _SAFE_SEGMENT_RE.fullmatch(seg) is not None


def _within_cache(path: Path, cache: Path) -> bool:
    """Whether ``path`` resolves inside ``cache`` (CWE-59 symlink guard).

    Returns ``False`` on any resolve error rather than raising (the module's
    "never raises" contract).
    """
    try:
        return path.resolve().is_relative_to(cache.resolve())
    except (OSError, ValueError, RuntimeError):
        return False


def _size_order(preferred_size: str) -> tuple[str, ...]:
    return _SIZE_ORDER.get(preferred_size, _SIZE_ORDER["medium"])


def _is_valid_png(path: Path) -> bool:
    """Whether ``path`` begins with the PNG signature.

    Used to validate a cache hit before serving it: a poisoned stub (LFS
    pointer text, truncated/empty file) fails this check so the caller can
    discard it and re-fetch. Never raises (a read error is treated as invalid).
    """
    try:
        with open(path, "rb") as fh:
            return fh.read(len(_PNG_MAGIC)) == _PNG_MAGIC
    except OSError:
        return False


def _download(url: str, dest: Path) -> bool:
    """GET ``url`` to ``dest`` atomically. Returns ``True`` on a 200, else
    ``False``. Never raises; a non-200, network error, or write error is a
    clean ``False`` (the caller tries the next size or gives up gracefully).
    """
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    tmp = dest.with_name(dest.name + ".tmp")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if getattr(resp, "status", 200) != 200:
                return False
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(tmp, "wb") as fh:
                shutil.copyfileobj(resp, fh)
        tmp.replace(dest)
        return True
    except (urllib.error.URLError, OSError, ValueError):
        tmp.unlink(missing_ok=True)
        return False


def fetch_portrait(
    theme: str,
    slug: str,
    preferred_size: str = "medium",
    cache: Path | None = None,
) -> Path | None:
    """Return a local path to ``theme``/``slug``'s portrait, downloading if needed.

    Tries ``preferred_size`` first, then the remaining size buckets. Returns the
    cached path on a hit, downloads the PNG directly from the CDN on a miss, or
    ``None`` when no size is available (offline, all-404, or an invalid name).
    Never raises.
    """
    cache = cache or _cache_dir()
    if not _is_safe_segment(theme) or not _is_safe_segment(slug):
        return None

    sizes = _size_order(preferred_size)

    # Cache hit: any already-downloaded size, in preference order. An entry that
    # fails PNG-magic validation is a poisoned stub (LFS pointer, truncated
    # file) — discard it so the download path below self-heals (story 153-12).
    for size in sizes:
        local = cache / theme / size / f"{slug}.png"
        if local.is_file() and _within_cache(local, cache):
            if _is_valid_png(local):
                return local
            logger.debug(
                "portrait cache stub poisoned (%s/%s/%s) — discarding and re-fetching",
                theme,
                size,
                slug,
            )
            local.unlink(missing_ok=True)

    # Miss: download, preferred size first, falling back through the rest.
    for size in sizes:
        local = cache / theme / size / f"{slug}.png"
        if not _within_cache(local, cache):
            continue
        url = f"{CDN_BASE_URL}/portraits/{theme}/{size}/{slug}.png"
        if _download(url, local):
            return local
    return None


def _iter_theme_slugs(theme: str, project_root: Path | None = None) -> list[str]:
    """Return the deduped portrait slugs for every agent defined in ``theme``.

    Reuses the resolver's slug derivation (``shortName-OCEAN``) so there is one
    source of truth. Returns ``[]`` if the theme YAML can't be found/parsed.
    """
    try:
        import yaml

        from pf.common.themes import discover_all_theme_dirs
        from pf.tui.portrait_resolver import _extract_agent_slug
    except Exception:
        return []

    seen: list[str] = []
    for themes_dir in discover_all_theme_dirs(project_root):
        theme_yaml = themes_dir / f"{theme}.yaml"
        if not theme_yaml.exists():
            continue
        try:
            data = yaml.safe_load(theme_yaml.read_text(encoding="utf-8")) or {}
        except Exception:
            return seen
        for agent in data.get("agents") or {}:
            slug = _extract_agent_slug(theme_yaml, agent)
            if slug and slug not in seen:
                seen.append(slug)
        break  # first themes dir that defines this theme wins
    return seen


def ensure_portraits(
    theme: str,
    cache: Path | None = None,
    preferred_size: str = "medium",
) -> dict[str, Any]:
    """Prefetch ``theme``'s agent portraits into the local cache (best-effort).

    On-demand fetching means callers don't *need* this, but session start and
    ``pf package install-portraits`` call it to warm the cache so the first
    portrait paints instantly. Resolves each agent's slug from the theme YAML
    and downloads the preferred size. Missing slugs / an unreachable CDN degrade
    gracefully.

    Returns ``{"success": True, "cache_dir": str, "downloaded": int,
    "cached": int, "missing": int}`` or ``{"success": False, "error": str}``.
    Never raises.
    """
    cache = cache or _cache_dir()
    if not _is_safe_segment(theme):
        return {"success": False, "error": f"Invalid theme name: {theme!r}"}

    slugs = _iter_theme_slugs(theme)
    downloaded = cached = missing = 0
    for slug in slugs:
        existing = any((cache / theme / size / f"{slug}.png").is_file() for size in SIZES)
        path = fetch_portrait(theme, slug, preferred_size=preferred_size, cache=cache)
        if path is None:
            missing += 1
        elif existing:
            cached += 1
        else:
            downloaded += 1

    return {
        "success": True,
        "cache_dir": str(cache / theme),
        "downloaded": downloaded,
        "cached": cached,
        "missing": missing,
    }


def resolve_portrait(
    theme: str,
    agent: str,
    preferred_size: str = "medium",
    cache: Path | None = None,
) -> Path | None:
    """Resolve (and lazily download) an agent's portrait path from the CDN.

    Computes the agent's slug from the theme YAML (same derivation as the TUI
    resolver) then fetches it. Returns ``None`` when the slug can't be derived
    or no portrait is available. Never raises.
    """
    if not _is_safe_segment(theme):
        return None
    try:
        from pf.common.themes import discover_all_theme_dirs
        from pf.tui.portrait_resolver import _extract_agent_slug

        slug = None
        for themes_dir in discover_all_theme_dirs():
            slug = _extract_agent_slug(themes_dir / f"{theme}.yaml", agent)
            if slug:
                break
    except Exception:
        return None
    if not slug or not _is_safe_segment(slug):
        return None
    return fetch_portrait(theme, slug, preferred_size=preferred_size, cache=cache)


def list_cached(cache: Path | None = None) -> list[str]:
    """Return the sorted themes that have at least one cached portrait PNG."""
    cache = cache or _cache_dir()
    if not cache.is_dir():
        return []
    return sorted(
        d.name
        for d in cache.iterdir()
        if d.is_dir() and not d.name.startswith(".") and next(d.rglob("*.png"), None)
    )


def status(cache: Path | None = None) -> dict[str, Any]:
    """Return cache stats: ``{"cache_dir", "themes", "images", "mb"}``."""
    cache = cache or _cache_dir()
    cached = list_cached(cache)
    images = sum(1 for t in cached for _ in (cache / t).rglob("*.png"))
    size = sum(f.stat().st_size for t in cached for f in (cache / t).rglob("*.png"))
    return {
        "cache_dir": str(cache),
        "themes": len(cached),
        "images": images,
        "mb": round(size / 1_048_576, 1),
    }


def clean(theme: str, cache: Path | None = None) -> dict[str, Any]:
    """Remove a cached theme. ``{"success": False, ...}`` if not cached.

    Rejects traversing/malformed names (CWE-22) and refuses a symlinked theme
    dir (CWE-59) so a planted symlink can't redirect the ``rmtree``.
    """
    cache = cache or _cache_dir()
    if not _is_safe_segment(theme):
        return {"success": False, "error": f"Invalid theme name: {theme!r}"}
    d = cache / theme
    if not _within_cache(d, cache):
        return {"success": False, "error": f"Theme dir escapes cache: {theme!r}"}
    if not d.is_dir():
        return {"success": False, "error": f"'{theme}' not cached"}
    if d.is_symlink():
        return {"success": False, "error": f"Theme dir escapes cache: {theme!r}"}
    try:
        shutil.rmtree(d)
    except OSError as e:  # honour the "never raises" contract
        return {"success": False, "error": f"Could not remove '{theme}': {e}"}
    return {"success": True, "removed": str(d)}
