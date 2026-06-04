"""Tests for the direct-PNG portrait CDN consumer.

The consumer fetches **individual** PNGs at
``{base}/portraits/{theme}/{size}/{slug}.png`` — no manifest, no tarball packs.
(Replaces the manifest+tarball tests from stories 154-1/154-2, which pointed at
a third-party ``darkatelier.org`` bucket.)

A ``FakeCDN`` monkeypatches the *stdlib* ``urllib.request.urlopen`` to serve
seeded object keys and 404 everything else — hermetic coverage of the
fetch → cache → size-fallback → guard paths with no network.
"""

from __future__ import annotations

import io
import os
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import pytest

from pf.package import portrait_cdn as pc

# Minimal but recognisable PNG-ish payload (>1KB so smoke asserts on size hold).
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake-portrait-bytes" * 64


class _FakeResp(io.BytesIO):
    """BytesIO that also works as the ``urlopen`` context manager."""

    status = 200

    def __enter__(self) -> _FakeResp:
        return self

    def __exit__(self, *exc: object) -> bool:
        self.close()
        return False


class FakeCDN:
    """Serve ``PNG_BYTES`` for seeded keys, 404 the rest. Records UA + requests."""

    def __init__(self, keys: set[str]) -> None:
        self.keys = keys
        self.user_agents: list[str | None] = []
        self.requested: list[str] = []

    def __call__(self, req: urllib.request.Request, timeout: float | None = None) -> _FakeResp:
        url = req.full_url
        self.requested.append(url)
        self.user_agents.append(req.get_header("User-agent"))
        key = urlparse(url).path.lstrip("/")
        if key in self.keys:
            return _FakeResp(PNG_BYTES)
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)


def _key(theme: str, size: str, slug: str) -> str:
    return f"portraits/{theme}/{size}/{slug}.png"


@pytest.fixture
def install_cdn(monkeypatch: pytest.MonkeyPatch):
    """Return an installer that monkeypatches urlopen with a FakeCDN over keys."""

    def _install(keys: set[str]) -> FakeCDN:
        cdn = FakeCDN(set(keys))
        monkeypatch.setattr(urllib.request, "urlopen", cdn)
        return cdn

    return _install


# --------------------------------------------------------------------------- #
# fetch_portrait — download, cache, fallback, failure
# --------------------------------------------------------------------------- #


def test_fetch_downloads_preferred_size(tmp_path: Path, install_cdn) -> None:
    cdn = install_cdn({_key("1984", "large", "big-brother-15511")})
    p = pc.fetch_portrait("1984", "big-brother-15511", preferred_size="large", cache=tmp_path)

    assert p is not None
    assert p == tmp_path / "1984" / "large" / "big-brother-15511.png"
    assert p.read_bytes() == PNG_BYTES
    # The preferred size is requested first.
    assert cdn.requested[0].endswith("/portraits/1984/large/big-brother-15511.png")


def test_request_sends_explicit_user_agent(tmp_path: Path, install_cdn) -> None:
    # Cloudflare 403s the default urllib UA — every request MUST set one.
    cdn = install_cdn({_key("1984", "medium", "slug-11111")})
    pc.fetch_portrait("1984", "slug-11111", cache=tmp_path)

    assert cdn.user_agents
    assert all(ua == pc._USER_AGENT for ua in cdn.user_agents)


def test_cache_hit_does_not_hit_network(tmp_path: Path, install_cdn, monkeypatch) -> None:
    install_cdn({_key("1984", "large", "slug-11111")})
    first = pc.fetch_portrait("1984", "slug-11111", preferred_size="large", cache=tmp_path)
    assert first is not None

    # Network now hard-down: any urlopen call raises. Cache must still resolve.
    def _boom(*a, **k):  # noqa: ANN001, ANN002, ANN003
        raise AssertionError("network should not be touched on a cache hit")

    monkeypatch.setattr(urllib.request, "urlopen", _boom)
    second = pc.fetch_portrait("1984", "slug-11111", preferred_size="large", cache=tmp_path)
    assert second == first


def test_size_fallback_when_preferred_missing(tmp_path: Path, install_cdn) -> None:
    # Only "original" exists; a request for "small" must fall through to it.
    install_cdn({_key("1984", "original", "slug-11111")})
    p = pc.fetch_portrait("1984", "slug-11111", preferred_size="small", cache=tmp_path)

    assert p == tmp_path / "1984" / "original" / "slug-11111.png"


def test_all_sizes_missing_returns_none(tmp_path: Path, install_cdn) -> None:
    cdn = install_cdn(set())  # 404 everything
    assert pc.fetch_portrait("1984", "nope-00000", cache=tmp_path) is None
    # It tried every size before giving up.
    assert len(cdn.requested) == len(pc.SIZES)


def test_network_error_returns_none(tmp_path: Path, monkeypatch) -> None:
    def _err(*a, **k):  # noqa: ANN001, ANN002, ANN003
        raise urllib.error.URLError("offline")

    monkeypatch.setattr(urllib.request, "urlopen", _err)
    assert pc.fetch_portrait("1984", "slug-11111", cache=tmp_path) is None


# --------------------------------------------------------------------------- #
# Security guards — validated before any network call (CWE-22)
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("theme", ["../etc", ".", "..", "a/b", "", "with space", "q?x"])
def test_invalid_theme_rejected_without_network(tmp_path: Path, install_cdn, theme: str) -> None:
    cdn = install_cdn({_key(theme, "large", "slug-11111")})
    assert pc.fetch_portrait(theme, "slug-11111", cache=tmp_path) is None
    assert cdn.requested == []  # rejected before any request


@pytest.mark.parametrize("slug", ["../../secret", "a/b", "..", "", "x?y"])
def test_invalid_slug_rejected_without_network(tmp_path: Path, install_cdn, slug: str) -> None:
    cdn = install_cdn(set())
    assert pc.fetch_portrait("1984", slug, cache=tmp_path) is None
    assert cdn.requested == []


# --------------------------------------------------------------------------- #
# ensure_portraits — prefetch a theme's agents
# --------------------------------------------------------------------------- #


def test_ensure_portraits_prefetches_theme_slugs(tmp_path: Path, install_cdn, monkeypatch) -> None:
    monkeypatch.setattr(
        pc, "_iter_theme_slugs", lambda theme, project_root=None: ["a-11111", "b-22222"]
    )
    install_cdn({_key("1984", "medium", "a-11111"), _key("1984", "medium", "b-22222")})

    result = pc.ensure_portraits("1984", cache=tmp_path)
    assert result["success"] is True
    assert result["downloaded"] == 2
    assert result["missing"] == 0
    # Second run is all cache hits.
    again = pc.ensure_portraits("1984", cache=tmp_path)
    assert again["cached"] == 2 and again["downloaded"] == 0


def test_ensure_portraits_invalid_theme(tmp_path: Path) -> None:
    out = pc.ensure_portraits("../bad", cache=tmp_path)
    assert out["success"] is False


# --------------------------------------------------------------------------- #
# Cache management — list_cached / status / clean
# --------------------------------------------------------------------------- #


def test_list_status_and_clean(tmp_path: Path, install_cdn) -> None:
    install_cdn({_key("1984", "large", "slug-11111"), _key("brazil", "large", "slug-22222")})
    pc.fetch_portrait("1984", "slug-11111", preferred_size="large", cache=tmp_path)
    pc.fetch_portrait("brazil", "slug-22222", preferred_size="large", cache=tmp_path)

    assert pc.list_cached(tmp_path) == ["1984", "brazil"]
    st = pc.status(tmp_path)
    assert st["themes"] == 2 and st["images"] == 2

    removed = pc.clean("1984", cache=tmp_path)
    assert removed["success"] is True
    assert pc.list_cached(tmp_path) == ["brazil"]


def test_clean_uncached_and_invalid(tmp_path: Path) -> None:
    assert pc.clean("never-fetched", cache=tmp_path)["success"] is False
    assert pc.clean("../escape", cache=tmp_path)["success"] is False


# --------------------------------------------------------------------------- #
# Config — the default base URL is ours, darkatelier is gone
# --------------------------------------------------------------------------- #


def test_default_base_url_is_pennyfarthing() -> None:
    assert "pennyfarthing.slabgorb.com" in pc.CDN_BASE_URL
    assert "darkatelier" not in pc.CDN_BASE_URL
    assert not pc.CDN_BASE_URL.endswith("/")


# --------------------------------------------------------------------------- #
# Live smoke test — real bucket, network-gated
# --------------------------------------------------------------------------- #


def test_live_fetch_real_portrait(tmp_path: Path) -> None:
    """Opt-in live check against the real CDN (``PF_CDN_LIVE_TEST=1``).

    Skipped by default so the suite stays hermetic/offline-safe; also skips if
    the CDN is unreachable or the object has moved.
    """
    if not os.environ.get("PF_CDN_LIVE_TEST"):
        pytest.skip("set PF_CDN_LIVE_TEST=1 to run the live CDN check")
    p = pc.fetch_portrait("1984", "big-brother-15511", preferred_size="large", cache=tmp_path)
    if p is None:
        pytest.skip("CDN unreachable or object absent — skipping live check")
    assert p.is_file() and p.stat().st_size > 1000
