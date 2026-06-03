"""portrait_cdn — On-demand portrait download from the Cloudflare R2 CDN.

Story 154-1. Drop-in replacement for the gh-CLI GitHub Contents API download
in :mod:`pf.package.portraits`. Downloads per-theme portrait packs lazily on
first use, verifies them with SHA256, and caches them locally behind a
``.complete`` sentinel for instant subsequent access.

Every function returns a result object or ``None`` and never raises on failure
paths (SOUL principle #10 — return results, don't throw): a dead or unreachable
CDN degrades gracefully so a session continues without portraits.

Security:
- Pack integrity is checked with SHA256 *before* extraction.
- Extraction uses the tarfile ``"data"`` filter so a malicious/MITM'd pack
  cannot escape the theme cache directory via ``..`` or absolute-path members
  (CWE-22). Filter rejections surface as :class:`tarfile.TarError` and degrade
  gracefully.
- All text I/O is UTF-8 (CWE-838 — no locale-dependent decoding).

Implementation note: network calls are kept *qualified*
(``urllib.request.urlopen`` / ``urllib.request.urlretrieve``) so they remain
interceptable by the test suite's stdlib monkeypatching.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

CDN_BASE_URL = "https://portraits.darkatelier.org/v1"
MANIFEST_URL = f"{CDN_BASE_URL}/manifest.json"
MANIFEST_CHECK_INTERVAL = 86400  # 24h rate limit between manifest fetches

# The CDN (Cloudflare) rejects the default ``Python-urllib`` User-Agent with a
# 403. Every request MUST send an explicit UA or it will be blocked.
_USER_AGENT = "pennyfarthing-portrait-cdn/1.0"

# A theme name is a single cache segment that is also interpolated into a CDN
# URL. Allow only an alphanumeric leading char followed by alnum/dot/dash/
# underscore. An *allowlist* (not a blocklist) closes the whole class at once:
# it rejects empty, ``.``/``..``, path separators (``/``, ``\``), null bytes,
# whitespace, and URL-special chars (``#``, ``?``) — all of which could escape
# the cache (CWE-22) or redirect the pack fetch.
_SAFE_THEME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")


def _cache_dir() -> Path:
    """Return the XDG-compliant portrait cache directory.

    ``$XDG_DATA_HOME/pennyfarthing/portraits`` if set, else
    ``~/.local/share/pennyfarthing/portraits``.
    """
    base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "pennyfarthing" / "portraits"


def _is_safe_theme(theme: str) -> bool:
    """Whether ``theme`` is a safe single cache segment (CWE-22).

    Theme names are slug segments (e.g. ``discworld``). Validated against an
    allowlist (:data:`_SAFE_THEME_RE`) so it is rejected before any path is built
    or any network request is made. A bare ``.`` (would resolve to the cache root
    and rmtree/extract there), ``..``, separators, null bytes, whitespace, and
    URL-special chars are all excluded.
    """
    return bool(theme) and _SAFE_THEME_RE.fullmatch(theme) is not None


def _within_cache(path: Path, cache: Path) -> bool:
    """Whether ``path`` resolves to a location inside ``cache`` (CWE-59 guard).

    String validation alone can't stop a pre-planted symlink at
    ``cache/<valid-name>`` from redirecting an extraction outside the cache, so
    resolve both paths and require containment. Returns ``False`` on any resolve
    error rather than raising (the "never raises" contract).
    """
    try:
        return path.resolve().is_relative_to(cache.resolve())
    except (OSError, ValueError, RuntimeError):
        return False


def _read_meta(cache: Path) -> dict:
    try:
        return json.loads((cache / ".cache_meta.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"etag": None, "last_checked": 0}


def _write_meta(cache: Path, meta: dict) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    (cache / ".cache_meta.json").write_text(json.dumps(meta), encoding="utf-8")


def fetch_manifest(cache: Path | None = None) -> dict | None:
    """Fetch the remote manifest with etag caching, rate-limited to 24h.

    Returns the parsed manifest dict, or ``None`` if it cannot be obtained
    (and no usable local copy exists). Never raises on network failure.
    """
    cache = cache or _cache_dir()
    cache.mkdir(parents=True, exist_ok=True)
    manifest_path = cache / ".manifest_cache.json"
    meta = _read_meta(cache)
    now = int(time.time())

    # Rate limit: reuse the cached manifest if we checked recently.
    if now - meta.get("last_checked", 0) < MANIFEST_CHECK_INTERVAL:
        try:
            return json.loads(manifest_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            pass

    req = urllib.request.Request(MANIFEST_URL, headers={"User-Agent": _USER_AGENT})
    if meta.get("etag"):
        req.add_header("If-None-Match", meta["etag"])

    try:
        resp = urllib.request.urlopen(req, timeout=15)
        body = resp.read().decode()
        manifest = json.loads(body)
        manifest_path.write_text(body, encoding="utf-8")
        _write_meta(cache, {"etag": resp.headers.get("ETag"), "last_checked": now})
        return manifest
    except urllib.error.HTTPError as e:
        if e.code == 304:
            _write_meta(cache, {**meta, "last_checked": now})
            try:
                return json.loads(manifest_path.read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError):
                return None
        return None
    except (urllib.error.URLError, OSError):
        try:
            return json.loads(manifest_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return None


def _verify_sha256(path: Path, expected: str) -> bool:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest() == expected


def ensure_portraits(theme: str, cache: Path | None = None) -> dict[str, Any]:
    """Ensure portraits for ``theme`` are present locally, downloading if missing.

    Instant on cache hit (``.complete`` sentinel). On a miss: fetch manifest,
    download the theme pack, verify SHA256 before extraction, extract safely,
    write the sentinel, and merge the persona map into the local manifest.

    Returns ``{"success": True, "cache_dir": str, "action": "cached"|"downloaded"}``
    on success, or ``{"success": False, "error": str}`` on any failure. Never
    raises.
    """
    cache = cache or _cache_dir()
    # Reject traversing / malformed theme names up front, before building any
    # path or touching the network (CWE-22).
    if not _is_safe_theme(theme):
        return {"success": False, "error": f"Invalid theme name: {theme!r}"}
    theme_dir = cache / theme
    # Defence in depth (CWE-59): even a valid name can resolve outside the cache
    # via a pre-planted symlink at cache/<theme>. Refuse to read/extract through it.
    if not _within_cache(theme_dir, cache):
        return {"success": False, "error": f"Theme dir escapes cache: {theme!r}"}
    sentinel = theme_dir / ".complete"

    if sentinel.exists():
        return {"success": True, "cache_dir": str(theme_dir), "action": "cached"}

    manifest = fetch_manifest(cache)
    if not manifest:
        return {"success": False, "error": "Could not fetch portrait manifest"}

    themes = manifest.get("themes", {})
    if theme not in themes:
        return {"success": False, "error": f"Theme '{theme}' not in manifest"}

    # Guard the manifest fields instead of indexing blindly: a malformed manifest
    # must degrade gracefully, not raise a KeyError (the "never raises" contract).
    entry = themes[theme]
    expected_sha = entry.get("pack_sha256")
    if "base_url" not in manifest or not expected_sha:
        return {"success": False, "error": f"Malformed manifest for '{theme}'"}

    # Build the pack URL from the trusted hardcoded CDN, NOT the manifest body:
    # a poisoned/MITM'd base_url could redirect the fetch (file://, internal
    # host) and supply a matching SHA from the same source (CWE-918 SSRF).
    pack_url = f"{CDN_BASE_URL}/themes/{theme}.tar.gz"
    tmp = cache / f".{theme}.tar.gz.tmp"
    cache.mkdir(parents=True, exist_ok=True)

    pack_req = urllib.request.Request(pack_url, headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(pack_req, timeout=30) as resp, open(tmp, "wb") as fh:
            shutil.copyfileobj(resp, fh)
    except (urllib.error.URLError, OSError) as e:
        tmp.unlink(missing_ok=True)
        return {"success": False, "error": f"Download failed: {e}"}

    if not _verify_sha256(tmp, expected_sha):
        tmp.unlink(missing_ok=True)
        return {"success": False, "error": f"SHA256 mismatch for {theme}"}

    theme_dir.mkdir(parents=True, exist_ok=True)
    try:
        with tarfile.open(tmp, "r:gz") as tar:
            # "data" filter blocks path-traversal / absolute-path members.
            tar.extractall(path=theme_dir, filter="data")
    except tarfile.TarError as e:
        # Clean the partially-extracted theme dir so a retry doesn't re-enter a
        # populated-but-sentinel-less directory and skip the (failed) download.
        shutil.rmtree(theme_dir, ignore_errors=True)
        tmp.unlink(missing_ok=True)
        return {"success": False, "error": f"Extraction failed: {e}"}
    finally:
        tmp.unlink(missing_ok=True)

    sentinel.write_text("", encoding="utf-8")

    # Merge the persona map (agent role -> slug) into the local manifest.
    personas = manifest.get("personas", {}).get(theme, {})
    if personas:
        local_manifest = cache / "manifest.json"
        try:
            local = json.loads(local_manifest.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            local = {}
        local[theme] = personas
        local_manifest.write_text(json.dumps(local, indent=2), encoding="utf-8")

    return {"success": True, "cache_dir": str(theme_dir), "action": "downloaded"}


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
    cache = cache or _cache_dir()
    try:
        local = json.loads((cache / "manifest.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None

    slug = local.get(theme, {}).get(agent)
    if not slug:
        return None

    sizes = {
        "small": ["small", "medium", "large", "original"],
        "large": ["large", "original", "medium", "small"],
    }.get(preferred_size, ["medium", "large", "small", "original"])

    for size in sizes:
        candidate = cache / theme / size / f"{slug}.png"
        if candidate.is_file():
            return candidate
    return None


def list_cached(cache: Path | None = None) -> list[str]:
    """Return the sorted list of themes with a ``.complete`` sentinel."""
    cache = cache or _cache_dir()
    if not cache.is_dir():
        return []
    return sorted(
        d.name for d in cache.iterdir() if d.is_dir() and (d / ".complete").exists()
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
    """Remove a cached theme. ``{"success": False, ...}`` if not cached."""
    cache = cache or _cache_dir()
    # Reject traversing / absolute theme names: a bare ``cache / theme`` with a
    # ``../`` or absolute path would rmtree a directory outside the cache (CWE-22).
    if not _is_safe_theme(theme):
        return {"success": False, "error": f"Invalid theme name: {theme!r}"}
    d = cache / theme
    # Defence in depth (CWE-59): refuse to operate on a path that resolves
    # outside the cache (e.g. a pre-planted symlink at cache/<theme>).
    if not _within_cache(d, cache):
        return {"success": False, "error": f"Theme dir escapes cache: {theme!r}"}
    if not d.is_dir():
        return {"success": False, "error": f"'{theme}' not cached"}
    shutil.rmtree(d)
    return {"success": True, "removed": str(d)}
