"""Story 154-1: portrait_cdn — on-demand R2 CDN portrait packs with SHA256 + cache.

RED-phase test suite for :mod:`pf.package.portrait_cdn`, the drop-in replacement
for the gh-CLI GitHub Contents API portrait download. Contract is specified in
GitHub issue #17.

Tests are hermetic: a ``FakeCDN`` monkeypatches the stdlib network calls
(``urllib.request.urlopen`` / ``urllib.request.urlretrieve``) and serves a real
``tar.gz`` pack built on a tmp dir with a real SHA256. No network, no real LFS
assets, no live CDN dependency.

Coverage maps to the issue #17 acceptance criteria:
  - ensure_portraits downloads on first use; instant on sentinel hit
  - SHA256 verification *before* extraction (mismatch aborts, no sentinel)
  - .complete sentinel for the hot path
  - manifest etag caching with a 24h rate limit
  - status / clean / list_cached helpers
  - XDG cache directory location
  - graceful degradation: failures return {"success": False} and never raise
    (SOUL principle #10 — return results, don't throw)
  - no auth: requests carry no Authorization header
"""

from __future__ import annotations

import hashlib
import io
import json
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from pf.package import portrait_cdn
from pf.package.portrait_cdn import (
    CDN_BASE_URL,
    clean,
    ensure_portraits,
    fetch_manifest,
    list_cached,
    resolve_portrait,
    status,
)

ALL_SIZES = ("small", "medium", "large", "original")


# --------------------------------------------------------------------------- #
# Helpers / fixtures
# --------------------------------------------------------------------------- #


def _png_bytes(n: int = 400) -> bytes:
    """Fake but non-trivial PNG payload (over the 200-byte LFS-pointer floor)."""
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * n


def _make_pack(
    tmp: Path, persona_map: dict[str, str], sizes=ALL_SIZES
) -> tuple[Path, str, int]:
    """Build a theme pack tar.gz with ``{size}/{slug}.png`` members.

    Returns (pack_path, sha256_hex, byte_count).
    """
    src = tmp / "_packsrc"
    for size in sizes:
        for slug in persona_map.values():
            f = src / size / f"{slug}.png"
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(_png_bytes())
    pack_path = tmp / "pack.tar.gz"
    with tarfile.open(pack_path, "w:gz") as tar:
        for size in sizes:
            tar.add(src / size, arcname=size)
    data = pack_path.read_bytes()
    return pack_path, hashlib.sha256(data).hexdigest(), len(data)


def _manifest(theme: str, persona_map: dict[str, str], sha: str, nbytes: int) -> dict:
    return {
        "schema": 1,
        "updated": "2026-04-26T00:00:00Z",
        "base_url": CDN_BASE_URL,
        "themes": {
            theme: {
                "pack_sha256": sha,
                "pack_bytes": nbytes,
                "persona_count": len(persona_map),
            }
        },
        "personas": {theme: persona_map},
    }


class _FakeResp:
    def __init__(self, body: bytes, etag: str | None = None):
        self._buf = io.BytesIO(body)
        self.headers = {"ETag": etag}

    def read(self, *args) -> bytes:
        return self._buf.read(*args)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeCDN:
    """Monkeypatchable stand-in for the public R2 CDN.

    Both the manifest and the theme pack are served via ``urlopen`` (the real
    CDN requires a User-Agent on every request, so the module uses qualified
    ``urllib.request.urlopen`` for both). ``urlopen`` dispatches on the request
    URL: ``manifest.json`` -> manifest JSON, otherwise -> the tar.gz pack bytes.
    """

    def __init__(self, manifest: dict, pack_path: Path, etag: str = "etag-v1"):
        self.manifest = manifest
        self.pack_path = pack_path
        self.etag = etag
        self.status = 200  # manifest response status (200 or 304)
        self.fail_network = False
        self.pack_fail = False
        self.urlopen_calls: list = []

    @staticmethod
    def _url(req) -> str:
        return req.full_url if isinstance(req, urllib.request.Request) else req

    def urlopen(self, req, timeout=None):
        self.urlopen_calls.append(req)
        url = self._url(req)
        if url.endswith("manifest.json"):
            if self.fail_network:
                raise urllib.error.URLError("network down")
            if self.status == 304:
                raise urllib.error.HTTPError(
                    portrait_cdn.MANIFEST_URL, 304, "Not Modified", {}, None
                )
            return _FakeResp(json.dumps(self.manifest).encode(), self.etag)
        # Theme pack request.
        if self.fail_network or self.pack_fail:
            raise urllib.error.URLError("pack unreachable")
        return _FakeResp(self.pack_path.read_bytes())

    def install(self, monkeypatch):
        monkeypatch.setattr(urllib.request, "urlopen", self.urlopen)


@pytest.fixture
def cache(tmp_path: Path) -> Path:
    return tmp_path / "cache"


@pytest.fixture
def personas() -> dict[str, str]:
    return {"sm": "carrot-25551", "dev": "moist-44342"}


@pytest.fixture
def cdn(tmp_path: Path, personas: dict[str, str]) -> FakeCDN:
    pack_path, sha, nbytes = _make_pack(tmp_path, personas)
    return FakeCDN(_manifest("discworld", personas, sha, nbytes), pack_path)


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Controllable wall clock; advance ``holder['t']`` to age the cache."""
    holder = {"t": 1_000_000}
    monkeypatch.setattr(time, "time", lambda: holder["t"])
    return holder


def _seed_cache(
    cache: Path, theme: str, persona_map: dict[str, str], sizes=ALL_SIZES
) -> None:
    """Build a fully-populated cache for resolve/status/clean tests."""
    for size in sizes:
        for slug in persona_map.values():
            f = cache / theme / size / f"{slug}.png"
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(_png_bytes(100))
    (cache / theme / ".complete").write_text("")
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "manifest.json").write_text(json.dumps({theme: persona_map}))


# --------------------------------------------------------------------------- #
# fetch_manifest
# --------------------------------------------------------------------------- #


def test_fetch_manifest_downloads_and_returns(cdn: FakeCDN, cache: Path, monkeypatch):
    cdn.install(monkeypatch)
    result = fetch_manifest(cache)
    assert result == cdn.manifest
    assert len(cdn.urlopen_calls) == 1


def test_fetch_manifest_rate_limited_reuses_cache(cdn: FakeCDN, cache: Path, monkeypatch):
    cdn.install(monkeypatch)
    first = fetch_manifest(cache)
    second = fetch_manifest(cache)  # within 24h window
    assert second == first
    # Rate limit: only the first call touched the network.
    assert len(cdn.urlopen_calls) == 1


def test_fetch_manifest_304_returns_cached(cdn: FakeCDN, cache: Path, monkeypatch, clock):
    cdn.install(monkeypatch)
    first = fetch_manifest(cache)
    clock["t"] += portrait_cdn.MANIFEST_CHECK_INTERVAL + 1  # age past the window
    cdn.status = 304
    second = fetch_manifest(cache)
    assert second == first
    assert len(cdn.urlopen_calls) == 2  # window expired -> revalidated over network


def test_fetch_manifest_sends_if_none_match_after_first_fetch(
    cdn: FakeCDN, cache: Path, monkeypatch, clock
):
    cdn.install(monkeypatch)
    fetch_manifest(cache)
    clock["t"] += portrait_cdn.MANIFEST_CHECK_INTERVAL + 1
    fetch_manifest(cache)
    revalidation = cdn.urlopen_calls[-1]
    assert revalidation.get_header("If-none-match") == cdn.etag


def test_fetch_manifest_no_auth_header(cdn: FakeCDN, cache: Path, monkeypatch):
    cdn.install(monkeypatch)
    fetch_manifest(cache)
    assert cdn.urlopen_calls[0].get_header("Authorization") is None


def test_fetch_manifest_network_error_returns_cached_copy(
    cdn: FakeCDN, cache: Path, monkeypatch, clock
):
    cdn.install(monkeypatch)
    good = fetch_manifest(cache)
    clock["t"] += portrait_cdn.MANIFEST_CHECK_INTERVAL + 1
    cdn.fail_network = True
    degraded = fetch_manifest(cache)
    assert degraded == good  # falls back to the on-disk copy


def test_fetch_manifest_network_error_no_cache_returns_none(
    cdn: FakeCDN, cache: Path, monkeypatch
):
    cdn.fail_network = True
    cdn.install(monkeypatch)
    assert fetch_manifest(cache) is None  # graceful, no raise


# --------------------------------------------------------------------------- #
# ensure_portraits
# --------------------------------------------------------------------------- #


def test_ensure_portraits_downloads_and_extracts(cdn: FakeCDN, cache: Path, monkeypatch):
    cdn.install(monkeypatch)
    result = ensure_portraits("discworld", cache)
    assert result["success"] is True
    assert result["action"] == "downloaded"
    # Extracted into {size}/{slug}.png
    assert (cache / "discworld" / "medium" / "carrot-25551.png").is_file()
    # Sentinel written
    assert (cache / "discworld" / ".complete").exists()


def test_requests_set_user_agent(cdn: FakeCDN, cache: Path, monkeypatch):
    """The CDN 403s the default Python-urllib UA — every request must override it."""
    cdn.install(monkeypatch)
    ensure_portraits("discworld", cache)  # triggers manifest + pack fetch
    user_agents = [r.get_header("User-agent") for r in cdn.urlopen_calls]
    assert len(user_agents) == 2  # manifest + pack
    assert all(ua and "python-urllib" not in ua.lower() for ua in user_agents)


def test_ensure_portraits_verifies_sha256_before_extract(cdn: FakeCDN, cache: Path, monkeypatch):
    # Corrupt the advertised digest -> verification must fail.
    cdn.manifest["themes"]["discworld"]["pack_sha256"] = "0" * 64
    cdn.install(monkeypatch)
    result = ensure_portraits("discworld", cache)
    assert result["success"] is False
    assert "sha256" in result["error"].lower()
    # No partial extraction, no sentinel.
    assert not (cache / "discworld" / ".complete").exists()
    assert not (cache / "discworld" / "medium").exists()
    # Resource hygiene: the temp download is cleaned up, not leaked (rule #7).
    assert list(cache.glob("*.tmp")) == []
    assert list(cache.glob(".*.tmp")) == []


def test_ensure_portraits_cache_hit_skips_network(cdn: FakeCDN, cache: Path, personas, monkeypatch):
    _seed_cache(cache, "discworld", personas)
    cdn.install(monkeypatch)
    result = ensure_portraits("discworld", cache)
    assert result["success"] is True
    assert result["action"] == "cached"
    # Hot path: neither the manifest nor the pack was fetched.
    assert cdn.urlopen_calls == []


def test_ensure_portraits_merges_persona_map(cdn: FakeCDN, cache: Path, personas, monkeypatch):
    cdn.install(monkeypatch)
    ensure_portraits("discworld", cache)
    local = json.loads((cache / "manifest.json").read_text())
    assert local["discworld"]["sm"] == personas["sm"]
    assert local["discworld"]["dev"] == personas["dev"]


def test_ensure_portraits_theme_not_in_manifest(cdn: FakeCDN, cache: Path, monkeypatch):
    cdn.install(monkeypatch)
    result = ensure_portraits("not-a-theme", cache)
    assert result["success"] is False
    assert "not-a-theme" in result["error"]


def test_ensure_portraits_manifest_unavailable(cdn: FakeCDN, cache: Path, monkeypatch):
    cdn.fail_network = True  # manifest fetch fails, nothing cached
    cdn.install(monkeypatch)
    result = ensure_portraits("discworld", cache)
    assert result["success"] is False


def test_ensure_portraits_download_failure_is_graceful(cdn: FakeCDN, cache: Path, monkeypatch):
    # Manifest fetch succeeds, pack download fails.
    cdn.pack_fail = True
    cdn.install(monkeypatch)
    result = ensure_portraits("discworld", cache)
    assert result["success"] is False
    assert not (cache / "discworld" / ".complete").exists()
    assert list(cache.glob("*.tmp")) == []
    assert list(cache.glob(".*.tmp")) == []


def test_ensure_portraits_extraction_failure_is_graceful(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    # Pack bytes are NOT a valid tar.gz, but the manifest sha matches them,
    # so verification passes and extraction is what fails.
    bogus = tmp_path / "bogus.tar.gz"
    bogus.write_bytes(b"this is not a gzip tarball")
    sha = hashlib.sha256(bogus.read_bytes()).hexdigest()
    bad_cdn = FakeCDN(_manifest("discworld", personas, sha, bogus.stat().st_size), bogus)
    bad_cdn.install(monkeypatch)
    result = ensure_portraits("discworld", cache)
    assert result["success"] is False
    assert not (cache / "discworld" / ".complete").exists()
    # Temp download cleaned up even on extraction failure (rule #7).
    assert list(cache.glob("*.tmp")) == []
    assert list(cache.glob(".*.tmp")) == []


def test_ensure_portraits_rejects_path_traversal_in_pack(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    """A malicious pack member must not escape the theme cache dir (rule #8).

    The pack's SHA256 matches the manifest (so integrity passes), but it carries
    a ``../escaped.png`` traversal member. ensure_portraits must extract safely:
    the file must NOT land outside the theme directory. (Naive
    ``tar.extractall`` without a filter would let it escape — that is the bug
    this test exists to catch.)
    """
    src = tmp_path / "evilsrc"
    (src / "medium").mkdir(parents=True)
    (src / "medium" / "carrot-25551.png").write_bytes(_png_bytes())
    evil = tmp_path / "evil.tar.gz"
    with tarfile.open(evil, "w:gz") as tar:
        tar.add(src / "medium", arcname="medium")
        # Traversal member aiming above the theme dir.
        payload = tmp_path / "payload.png"
        payload.write_bytes(_png_bytes())
        tar.add(payload, arcname="../escaped.png")
    sha = hashlib.sha256(evil.read_bytes()).hexdigest()
    evil_cdn = FakeCDN(_manifest("discworld", personas, sha, evil.stat().st_size), evil)
    evil_cdn.install(monkeypatch)

    ensure_portraits("discworld", cache)

    # The traversal target (cache/escaped.png, a sibling of the theme dir) must
    # never be created.
    assert not (cache / "escaped.png").exists()


def test_ensure_portraits_dead_cdn_never_raises(cdn: FakeCDN, cache: Path, monkeypatch):
    """SOUL #10: a totally dead CDN degrades, it does not blow up the session."""
    cdn.fail_network = True
    cdn.install(monkeypatch)
    try:
        result = ensure_portraits("discworld", cache)
    except Exception as exc:  # pragma: no cover - raising IS the failure
        pytest.fail(f"ensure_portraits raised instead of degrading: {exc!r}")
    assert result["success"] is False


# --------------------------------------------------------------------------- #
# resolve_portrait
# --------------------------------------------------------------------------- #


def test_resolve_portrait_returns_path(cache: Path, personas):
    _seed_cache(cache, "discworld", personas)
    path = resolve_portrait("discworld", "sm", "medium", cache)
    assert path == cache / "discworld" / "medium" / "carrot-25551.png"


def test_resolve_portrait_size_fallback(cache: Path, personas):
    # Only 'original' present; asking for 'large' falls back to it.
    _seed_cache(cache, "discworld", personas, sizes=("original",))
    path = resolve_portrait("discworld", "dev", "large", cache)
    assert path == cache / "discworld" / "original" / "moist-44342.png"


def test_resolve_portrait_small_preference_order(cache: Path, personas):
    # Both small and large present; preferring 'small' returns small.
    _seed_cache(cache, "discworld", personas, sizes=("small", "large"))
    path = resolve_portrait("discworld", "sm", "small", cache)
    assert path == cache / "discworld" / "small" / "carrot-25551.png"


def test_resolve_portrait_missing_manifest_returns_none(cache: Path):
    # Files on disk but no local manifest.json -> no slug mapping -> None.
    f = cache / "discworld" / "medium" / "carrot-25551.png"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(_png_bytes(100))
    assert resolve_portrait("discworld", "sm", "medium", cache) is None


def test_resolve_portrait_unknown_agent_returns_none(cache: Path, personas):
    _seed_cache(cache, "discworld", personas)
    assert resolve_portrait("discworld", "reviewer", "medium", cache) is None


def test_resolve_portrait_missing_file_returns_none(cache: Path, personas):
    # Manifest maps the agent, but no image file exists for any size.
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "manifest.json").write_text(json.dumps({"discworld": personas}))
    assert resolve_portrait("discworld", "sm", "medium", cache) is None


# --------------------------------------------------------------------------- #
# list_cached / status / clean
# --------------------------------------------------------------------------- #


def test_list_cached_only_completed_themes(cache: Path, personas):
    _seed_cache(cache, "discworld", personas)
    # A theme dir present but WITHOUT a .complete sentinel must be excluded.
    (cache / "half-baked" / "medium").mkdir(parents=True, exist_ok=True)
    assert list_cached(cache) == ["discworld"]


def test_list_cached_sorted(cache: Path, personas):
    _seed_cache(cache, "discworld", personas)
    _seed_cache(cache, "ankh-morpork", personas)
    assert list_cached(cache) == ["ankh-morpork", "discworld"]


def test_list_cached_empty_when_no_cache_dir(tmp_path: Path):
    assert list_cached(tmp_path / "nonexistent") == []


def test_status_counts_themes_and_images(cache: Path, personas):
    # 1 theme, 4 sizes x 2 personas = 8 png files.
    _seed_cache(cache, "discworld", personas)
    s = status(cache)
    assert s["themes"] == 1
    assert s["images"] == 8
    assert "mb" in s  # contract includes a size field (value asserted via images)
    assert s["cache_dir"] == str(cache)


def test_clean_removes_theme(cache: Path, personas):
    _seed_cache(cache, "discworld", personas)
    result = clean("discworld", cache)
    assert result["success"] is True
    assert not (cache / "discworld").exists()


def test_clean_missing_theme_returns_error(cache: Path):
    cache.mkdir(parents=True, exist_ok=True)
    result = clean("never-cached", cache)
    assert result["success"] is False
    assert "never-cached" in result["error"]


# --------------------------------------------------------------------------- #
# _cache_dir (XDG)
# --------------------------------------------------------------------------- #


def test_cache_dir_respects_xdg_data_home(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    assert portrait_cdn._cache_dir() == tmp_path / "xdg" / "pennyfarthing" / "portraits"


def test_cache_dir_defaults_to_local_share(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    expected = tmp_path / "home" / ".local" / "share" / "pennyfarthing" / "portraits"
    assert portrait_cdn._cache_dir() == expected
