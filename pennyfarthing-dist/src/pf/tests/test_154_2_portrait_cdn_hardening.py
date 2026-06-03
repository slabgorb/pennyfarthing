"""Story 154-2: portrait_cdn hardening — Reviewer findings C1-C8.

RED-phase suite for the security/quality defects that the Reviewer (Granny
Weatherwax) confirmed against the 154-1 portrait_cdn module and deferred to this
hardening story. 154-1 shipped to develop (PR #72) and, after PR #73 stripped
bundled portraits from the wheel, portrait_cdn is now the *primary* portrait
source for installed users — so these are live defects, not theoretical.

Each test encodes one finding's acceptance criterion from
``sprint/context/context-story-154-2.md``. The harness mirrors
``test_154_1_portrait_cdn.py``: a ``FakeCDN`` monkeypatches the stdlib
``urllib.request.urlopen`` and serves a real ``tar.gz`` pack with a real SHA256,
so coverage is hermetic — no network, no live CDN, no LFS assets.

Finding → rule (``gates/lang-review/python.md``) mapping:
  C1 clean() traversal           — #5 path handling / #11 input validation (CWE-22)
  C2 ensure_portraits traversal  — #5 path handling / #11 input validation (CWE-22)
  C3 unguarded manifest keys     — #1 silent exceptions / #7 resource leaks
  C4 SSRF via manifest base_url  — #11 input validation (CWE-918)
  C5 filter="data" on 3.11.0-3   — #1 silent exceptions (TypeError escapes handler)
  C8 partial-extraction cleanup  — #7 resource leaks (impl half)
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import tarfile
import tomllib
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from pf.package.portrait_cdn import CDN_BASE_URL, clean, ensure_portraits

ALL_SIZES = ("small", "medium", "large", "original")


# --------------------------------------------------------------------------- #
# Helpers / fixtures (self-contained; mirror test_154_1_portrait_cdn.py)
# --------------------------------------------------------------------------- #


def _png_bytes(n: int = 400) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * n


def _make_pack(tmp: Path, persona_map: dict[str, str], sizes=ALL_SIZES) -> tuple[Path, str, int]:
    """Build a well-formed theme pack tar.gz with ``{size}/{slug}.png`` members."""
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


def _manifest(
    theme: str,
    persona_map: dict[str, str],
    sha: str,
    nbytes: int,
    base_url: str = CDN_BASE_URL,
) -> dict:
    return {
        "schema": 1,
        "updated": "2026-06-03T00:00:00Z",
        "base_url": base_url,
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

    Dispatches on URL: ``manifest.json`` -> the manifest JSON, anything else ->
    the tar.gz pack bytes. Records every request so tests can assert *where* the
    pack was fetched from (C4 SSRF).
    """

    def __init__(self, manifest: dict, pack_path: Path, etag: str = "etag-v1"):
        self.manifest = manifest
        self.pack_path = pack_path
        self.etag = etag
        self.urlopen_calls: list = []

    @staticmethod
    def _url(req) -> str:
        return req.full_url if isinstance(req, urllib.request.Request) else req

    def urlopen(self, req, timeout=None):
        self.urlopen_calls.append(req)
        url = self._url(req)
        if url.endswith("manifest.json"):
            return _FakeResp(json.dumps(self.manifest).encode(), self.etag)
        return _FakeResp(self.pack_path.read_bytes())

    def install(self, monkeypatch):
        monkeypatch.setattr(urllib.request, "urlopen", self.urlopen)


@pytest.fixture
def cache(tmp_path: Path) -> Path:
    return tmp_path / "cache"


@pytest.fixture
def personas() -> dict[str, str]:
    return {"sm": "carrot-25551", "dev": "moist-44342"}


# --------------------------------------------------------------------------- #
# C1 — clean() must not delete directories outside the cache (CWE-22)
# --------------------------------------------------------------------------- #


def test_clean_rejects_path_traversal_and_deletes_nothing_outside_cache(
    tmp_path: Path, cache: Path
):
    """``pf portraits clean ../victim`` must not escape the cache and rmtree it."""
    cache.mkdir(parents=True, exist_ok=True)
    victim = tmp_path / "victim"
    victim.mkdir()
    (victim / "precious.txt").write_text("do not delete", encoding="utf-8")

    result = clean("../victim", cache)

    # Contract: refused, and the out-of-cache directory is untouched.
    assert result["success"] is False
    assert victim.exists()
    assert (victim / "precious.txt").exists()


def test_clean_rejects_absolute_path_theme(tmp_path: Path, cache: Path):
    cache.mkdir(parents=True, exist_ok=True)
    victim = tmp_path / "abs_victim"
    victim.mkdir()
    # An absolute-path "theme" resolves outside the cache: cache / "/abs" == "/abs".
    result = clean(str(victim), cache)
    assert result["success"] is False
    assert victim.exists()


# --------------------------------------------------------------------------- #
# C2 — ensure_portraits() must reject traversing theme names (CWE-22)
# --------------------------------------------------------------------------- #


def test_ensure_portraits_rejects_traversal_theme_name(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    """A theme name with ``..`` (e.g. a poisoned manifest key) must be rejected
    *up front* — before any path is built or any network request is made — so the
    theme dir / ``.tmp`` can never be placed outside the cache.

    The strong contract here is "rejected before fetch": the malicious key is
    even present in the manifest, but a validated theme name must short-circuit
    before ``fetch_manifest`` runs. (Asserting only ``success is False`` is not
    enough — the current code happens to fail later with an incidental OSError
    when the escaped tmp-parent dir is missing, which is not the guarantee.)
    """
    evil_theme = "../pwned"
    pack_path, sha, nbytes = _make_pack(tmp_path, personas)
    manifest = _manifest(evil_theme, personas, sha, nbytes)
    cdn = FakeCDN(manifest, pack_path)
    cdn.install(monkeypatch)

    result = ensure_portraits(evil_theme, cache)

    assert result["success"] is False
    # Rejected before touching the network: no manifest fetch, no pack download.
    assert cdn.urlopen_calls == [], "traversal theme was not rejected before fetch"
    # And nothing was written outside the cache directory.
    assert not (cache.parent / "pwned").exists()
    assert list(cache.parent.glob(".*pwned*")) == []


def test_ensure_portraits_rejects_slash_in_theme_name(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    pack_path, sha, nbytes = _make_pack(tmp_path, personas)
    manifest = _manifest("a/b", personas, sha, nbytes)
    cdn = FakeCDN(manifest, pack_path)
    cdn.install(monkeypatch)

    result = ensure_portraits("a/b", cache)
    assert result["success"] is False
    # A slash in the theme name is invalid input — rejected before fetch.
    assert cdn.urlopen_calls == [], "slashed theme was not rejected before fetch"
    assert not (cache / "a" / "b").exists()


def test_ensure_portraits_rejects_empty_theme_name(cache: Path, monkeypatch):
    """Empty theme is invalid input and must be rejected before any fetch."""
    import urllib.request

    def _boom(req, timeout=None):  # any network touch is a failure here
        raise AssertionError("empty theme reached the network")

    monkeypatch.setattr(urllib.request, "urlopen", _boom)
    result = ensure_portraits("", cache)
    assert result["success"] is False


# --------------------------------------------------------------------------- #
# C3 — unguarded manifest keys break "never raises" + leak the tmp file
# --------------------------------------------------------------------------- #


def test_ensure_portraits_missing_base_url_returns_false_without_raising(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    pack_path, sha, nbytes = _make_pack(tmp_path, personas)
    manifest = _manifest("discworld", personas, sha, nbytes)
    del manifest["base_url"]  # malformed manifest
    FakeCDN(manifest, pack_path).install(monkeypatch)

    try:
        result = ensure_portraits("discworld", cache)
    except Exception as exc:  # pragma: no cover - raising IS the failure
        pytest.fail(f"ensure_portraits raised on malformed manifest: {exc!r}")
    assert result["success"] is False


def test_ensure_portraits_missing_pack_sha256_returns_false_and_leaks_no_tmp(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    """The ``pack_sha256`` KeyError fires *after* the download — it must be guarded
    so it neither raises nor leaves the downloaded ``.tmp`` behind (rule #7)."""
    pack_path, sha, nbytes = _make_pack(tmp_path, personas)
    manifest = _manifest("discworld", personas, sha, nbytes)
    del manifest["themes"]["discworld"]["pack_sha256"]  # entry missing the digest
    FakeCDN(manifest, pack_path).install(monkeypatch)

    try:
        result = ensure_portraits("discworld", cache)
    except Exception as exc:  # pragma: no cover
        pytest.fail(f"ensure_portraits raised on missing pack_sha256: {exc!r}")
    assert result["success"] is False
    # No leaked temp download.
    assert list(cache.glob("*.tmp")) == []
    assert list(cache.glob(".*.tmp")) == []


# --------------------------------------------------------------------------- #
# C4 — SSRF: the pack URL must come from the hardcoded CDN, not the manifest body
# --------------------------------------------------------------------------- #


def test_ensure_portraits_pack_url_ignores_poisoned_manifest_base_url(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    """A poisoned ``base_url`` (file://, internal host, ...) must not redirect the
    pack fetch — integrity is no defense since the SHA comes from the same
    manifest (CWE-918). The pack must be fetched from ``CDN_BASE_URL``."""
    pack_path, sha, nbytes = _make_pack(tmp_path, personas)
    manifest = _manifest(
        "discworld", personas, sha, nbytes, base_url="file:///etc/passwd-exfil"
    )
    cdn = FakeCDN(manifest, pack_path)
    cdn.install(monkeypatch)

    ensure_portraits("discworld", cache)

    pack_reqs = [
        FakeCDN._url(r) for r in cdn.urlopen_calls if not FakeCDN._url(r).endswith("manifest.json")
    ]
    assert pack_reqs, "expected a pack download request"
    for url in pack_reqs:
        assert url.startswith(CDN_BASE_URL), f"pack fetched from poisoned base_url: {url}"
        assert not url.startswith("file:"), f"SSRF: scheme honored from manifest: {url}"


# --------------------------------------------------------------------------- #
# C5 — filter="data" raises TypeError on Python 3.11.0-3.11.3 (within ">=3.11")
# --------------------------------------------------------------------------- #


def test_requires_python_floor_excludes_broken_filter_versions():
    """``tar.extractall(filter="data")`` (the CWE-22 guard) only exists on
    3.12 / 3.11.4+. With ``requires-python = ">=3.11"`` it raises ``TypeError``
    (not ``TarError``) on 3.11.0-3.11.3, escaping the handler — so the floor must
    be at least 3.11.4."""
    pyproject = Path(__file__).resolve().parents[3] / "pyproject.toml"
    assert pyproject.is_file(), f"pyproject not found at {pyproject}"
    spec = tomllib.loads(pyproject.read_text(encoding="utf-8"))["project"]["requires-python"]

    m = re.search(r">=\s*(\d+)\.(\d+)(?:\.(\d+))?", spec)
    assert m, f"no '>=' lower bound found in requires-python={spec!r}"
    floor = (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0))
    assert floor >= (3, 11, 4), (
        f"requires-python floor {floor} admits 3.11.0-3.11.3 where "
        f"filter='data' raises TypeError and extraction silently never runs"
    )


# --------------------------------------------------------------------------- #
# C8 — partial extraction must be cleaned so a retry doesn't re-enter a
#      populated-but-sentinel-less theme dir (impl half; rule #7)
# --------------------------------------------------------------------------- #


def test_ensure_portraits_cleans_theme_dir_on_extraction_failure(
    tmp_path: Path, cache: Path, personas, monkeypatch
):
    """A pack whose SHA matches the manifest but extracts partially before a
    ``TarError`` (a traversal member) must leave NO populated theme dir behind —
    otherwise a retry finds files but no ``.complete`` sentinel and never heals."""
    src = tmp_path / "evilsrc"
    (src / "medium").mkdir(parents=True)
    (src / "medium" / "carrot-25551.png").write_bytes(_png_bytes())
    evil = tmp_path / "evil.tar.gz"
    with tarfile.open(evil, "w:gz") as tar:
        tar.add(src / "medium", arcname="medium")  # a legit member extracts first
        payload = tmp_path / "payload.png"
        payload.write_bytes(_png_bytes())
        tar.add(payload, arcname="../escaped.png")  # then the traversal member aborts
    sha = hashlib.sha256(evil.read_bytes()).hexdigest()
    FakeCDN(_manifest("discworld", personas, sha, evil.stat().st_size), evil).install(monkeypatch)

    result = ensure_portraits("discworld", cache)

    assert result["success"] is False
    assert not (cache / "discworld" / ".complete").exists()
    # The traversal sibling must never appear...
    assert not (cache / "escaped.png").exists()
    # ...and the partially-populated theme dir must be cleaned, not left for a
    # sentinel-less retry.
    theme_dir = cache / "discworld"
    assert not theme_dir.exists() or not any(theme_dir.rglob("*.png")), (
        "partial extraction left orphaned files in the theme dir"
    )
