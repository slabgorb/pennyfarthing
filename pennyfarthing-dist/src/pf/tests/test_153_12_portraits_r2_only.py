"""Story 153-12 — Portraits: R2 is the only source.

Failing tests (RED) that pin the five acceptance criteria:

1. ``init._install_portraits`` (and the ``_symlink_portraits`` behaviour) is
   removed — definition AND both call sites.
2. The ``--force-portraits`` CLI flag and the ``force_portraits`` parameter on
   ``init_project`` are gone.
3. ``resolve_portrait_path`` consults the R2 CDN ONLY — no ``~/.pennyfarthing``
   override, no theme-sibling search, no Git-LFS self-heal, no Cyclist npm
   fallback.
4. ``portrait_cdn.fetch_portrait`` validates PNG magic on a cache HIT, so a
   poisoned stub entry (LFS pointer text, truncated/empty file) is discarded and
   re-fetched — stub poisoning self-heals. A still-bad CDN yields ``None``, never
   the poisoned stub.
5. (Whole-story) the suite is green after the deletions — verified at GREEN.

The CDN fetch path is exercised hermetically with a ``FakeCDN`` that
monkeypatches the *stdlib* ``urllib.request.urlopen`` (mirrors
``test_portrait_cdn_direct.py``); no network, no real LFS assets.
"""

from __future__ import annotations

import inspect
import io
import logging
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import pytest
from click.testing import CliRunner

from pf.package import portrait_cdn as pc

# --------------------------------------------------------------------------- #
# Fixtures / fakes
# --------------------------------------------------------------------------- #

# Full 8-byte PNG signature; the story names magic bytes 0x89 'P' 'N' 'G'.
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"real-portrait-pixels" * 64

# A Git-LFS pointer — the canonical "stub poisoning" payload. Does NOT start
# with the PNG signature, so a magic check must reject it.
LFS_STUB = (
    b"version https://git-lfs.github.com/spec/v1\n"
    b"oid sha256:deadbeef\nsize 4096\n"
)


class _FakeResp(io.BytesIO):
    """BytesIO doubling as the ``urlopen`` context manager."""

    status = 200

    def __enter__(self) -> _FakeResp:
        return self

    def __exit__(self, *exc: object) -> bool:
        self.close()
        return False


class FakeCDN:
    """Serve ``PNG_BYTES`` for seeded keys, 404 the rest. Records requests."""

    def __init__(self, keys: set[str]) -> None:
        self.keys = keys
        self.requested: list[str] = []

    def __call__(self, req: urllib.request.Request, timeout: float | None = None) -> _FakeResp:
        url = req.full_url
        self.requested.append(url)
        key = urlparse(url).path.lstrip("/")
        if key in self.keys:
            return _FakeResp(PNG_BYTES)
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)


def _key(theme: str, size: str, slug: str) -> str:
    return f"portraits/{theme}/{size}/{slug}.png"


@pytest.fixture
def install_cdn(monkeypatch: pytest.MonkeyPatch):
    def _install(keys: set[str]) -> FakeCDN:
        cdn = FakeCDN(set(keys))
        monkeypatch.setattr(urllib.request, "urlopen", cdn)
        return cdn

    return _install


def _seed(cache: Path, theme: str, size: str, slug: str, data: bytes) -> Path:
    """Pre-populate a cache entry (possibly poisoned) and return its path."""
    p = cache / theme / size / f"{slug}.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return p


# --------------------------------------------------------------------------- #
# AC1 — init._install_portraits and _symlink_portraits are removed
# --------------------------------------------------------------------------- #


def test_install_portraits_function_is_removed() -> None:
    from pf.init import core

    assert not hasattr(core, "_install_portraits"), (
        "_install_portraits must be deleted — R2 CDN is the only portrait source"
    )


def test_symlink_portraits_function_is_removed() -> None:
    from pf.init import core

    assert not hasattr(core, "_symlink_portraits"), (
        "_symlink_portraits must be deleted — no managed local copies or symlinks"
    )


def test_no_install_or_symlink_call_sites_remain_in_core() -> None:
    # AC1 names both call sites (init_project lines 439, 485/486). A source scan
    # catches a lingering call even if the def were somehow kept.
    from pf.init import core

    src = Path(core.__file__).read_text(encoding="utf-8")
    assert "_install_portraits" not in src, "stale _install_portraits reference in init/core.py"
    assert "_symlink_portraits" not in src, "stale _symlink_portraits reference in init/core.py"


# --------------------------------------------------------------------------- #
# AC2 — --force-portraits flag and force_portraits param are removed
# --------------------------------------------------------------------------- #


def test_init_help_has_no_force_portraits_flag() -> None:
    from pf.init.cli import init

    result = CliRunner().invoke(init, ["--help"])
    assert result.exit_code == 0
    assert "force-portraits" not in result.output, (
        "--force-portraits must be gone from `pf init --help`"
    )


def test_init_project_signature_has_no_force_portraits_param() -> None:
    from pf.init.core import init_project

    params = inspect.signature(init_project).parameters
    assert "force_portraits" not in params, (
        "init_project() must no longer accept a force_portraits parameter"
    )


# --------------------------------------------------------------------------- #
# AC3 — resolver consults the R2 CDN only (no override / sibling / LFS / cyclist)
# --------------------------------------------------------------------------- #


@pytest.fixture
def resolver_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    """Pin slug + theme-dir discovery so resolve_portrait_path is deterministic.

    Returns ``(slug, themes_dir)``. ``themes_dir.parent`` is ``tmp_path``, so the
    legacy theme-sibling search would look in ``tmp_path/portraits/<theme>``.
    """
    slug = "hero-50505"
    themes_dir = tmp_path / "themes"
    themes_dir.mkdir()
    monkeypatch.setattr(
        "pf.tui.portrait_resolver._extract_agent_slug",
        lambda theme_yaml, agent: slug,
    )
    monkeypatch.setattr(
        "pf.common.themes.discover_all_theme_dirs",
        lambda project_root=None: [themes_dir],
    )
    # Pin HOME so the ~/.pennyfarthing override dir is inside the sandbox.
    monkeypatch.setenv("HOME", str(tmp_path))
    return slug, themes_dir


def test_resolver_ignores_home_override_dir(resolver_env, monkeypatch, tmp_path: Path) -> None:
    from pf.tui import portrait_resolver as pr

    slug, _ = resolver_env
    theme = "1984"
    # A portrait sitting in the legacy ~/.pennyfarthing override location.
    override = tmp_path / ".pennyfarthing" / "portraits" / theme / "medium" / f"{slug}.png"
    override.parent.mkdir(parents=True, exist_ok=True)
    override.write_bytes(PNG_BYTES)
    # CDN has nothing — the ONLY legitimate source is empty.
    monkeypatch.setattr(pr, "_extract_agent_slug", lambda y, a: slug)
    monkeypatch.setattr("pf.package.portrait_cdn.fetch_portrait", lambda *a, **k: None)

    result = pr.resolve_portrait_path(theme, "sm", project_root=tmp_path)
    assert result is None, "resolver must NOT serve the ~/.pennyfarthing override"


def test_resolver_ignores_cyclist_package_fallback(resolver_env, monkeypatch, tmp_path: Path) -> None:
    from pf.tui import portrait_resolver as pr

    slug, _ = resolver_env
    theme = "1984"
    cyclist = tmp_path / "packages" / "cyclist" / "portraits" / theme / "medium" / f"{slug}.png"
    cyclist.parent.mkdir(parents=True, exist_ok=True)
    cyclist.write_bytes(PNG_BYTES)
    monkeypatch.setattr("pf.package.portrait_cdn.fetch_portrait", lambda *a, **k: None)

    result = pr.resolve_portrait_path(theme, "sm", project_root=tmp_path)
    assert result is None, "resolver must NOT fall back to Cyclist npm portraits"


def test_resolver_does_not_attempt_lfs_self_heal(resolver_env, monkeypatch, tmp_path: Path) -> None:
    from unittest.mock import Mock

    from pf.tui import portrait_resolver as pr

    slug, _ = resolver_env
    theme = "1984"
    # Seed an LFS-pointer stub in the theme-sibling portraits dir so the legacy
    # _has_lfs_stubs gate would fire and trigger an LFS pull.
    stub = tmp_path / "portraits" / theme / "medium" / f"{slug}.png"
    stub.parent.mkdir(parents=True, exist_ok=True)
    stub.write_bytes(LFS_STUB)
    lfs_pull = Mock(return_value={"pulled": False})
    monkeypatch.setattr("pf.common.themes.ensure_portrait_lfs", lfs_pull)
    monkeypatch.setattr("pf.package.portrait_cdn.fetch_portrait", lambda *a, **k: None)

    result = pr.resolve_portrait_path(theme, "sm", project_root=tmp_path)
    assert result is None
    assert lfs_pull.call_count == 0, "resolver must not run the Git-LFS self-heal path"


def test_resolver_returns_the_cdn_result(resolver_env, monkeypatch, tmp_path: Path) -> None:
    # Positive direction of AC3: when the CDN has the portrait, that path wins.
    # (Preservation guard — green before and after; pairs with the negatives.)
    from pf.tui import portrait_resolver as pr

    slug, _ = resolver_env
    theme = "1984"
    sentinel = tmp_path / "cdn-cache" / f"{slug}.png"
    sentinel.parent.mkdir(parents=True, exist_ok=True)
    sentinel.write_bytes(PNG_BYTES)
    monkeypatch.setattr(
        "pf.package.portrait_cdn.fetch_portrait",
        lambda theme_, slug_, **k: sentinel if slug_ == slug else None,
    )

    result = pr.resolve_portrait_path(theme, "sm", project_root=tmp_path)
    assert result == sentinel


# --------------------------------------------------------------------------- #
# AC4 — fetch_portrait validates PNG magic on a cache hit (stub self-heal)
# --------------------------------------------------------------------------- #


def test_cache_hit_lfs_stub_is_discarded_and_refetched(tmp_path: Path, install_cdn) -> None:
    cdn = install_cdn({_key("1984", "large", "slug-11111")})
    poisoned = _seed(tmp_path, "1984", "large", "slug-11111", LFS_STUB)
    assert poisoned.read_bytes() == LFS_STUB  # precondition: cache is poisoned

    p = pc.fetch_portrait("1984", "slug-11111", preferred_size="large", cache=tmp_path)

    assert p is not None
    assert p.read_bytes() == PNG_BYTES, "poisoned stub must be replaced by the real PNG"
    assert cdn.requested, "a poisoned cache hit MUST re-fetch from the CDN"


def test_cache_hit_empty_file_is_discarded_and_refetched(tmp_path: Path, install_cdn) -> None:
    install_cdn({_key("1984", "medium", "slug-22222")})
    _seed(tmp_path, "1984", "medium", "slug-22222", b"")  # truncated/empty

    p = pc.fetch_portrait("1984", "slug-22222", cache=tmp_path)

    assert p is not None
    assert p.read_bytes() == PNG_BYTES


def test_poisoned_cache_with_dead_cdn_returns_none_not_stub(tmp_path: Path, install_cdn) -> None:
    install_cdn(set())  # CDN 404s everything — no valid replacement available
    _seed(tmp_path, "1984", "large", "slug-33333", LFS_STUB)

    p = pc.fetch_portrait("1984", "slug-33333", preferred_size="large", cache=tmp_path)

    assert p is None, "a poisoned stub must NEVER be returned, even when the CDN is dead"


def test_valid_png_cache_hit_is_served_without_network(tmp_path: Path, monkeypatch) -> None:
    # Preservation guard: a genuine PNG cache entry still resolves offline; the
    # magic check must not punish a healthy cache.
    cached = _seed(tmp_path, "1984", "large", "slug-44444", PNG_BYTES)

    def _boom(*a, **k):  # noqa: ANN001, ANN002, ANN003
        raise AssertionError("a valid cache hit must not touch the network")

    monkeypatch.setattr(urllib.request, "urlopen", _boom)
    p = pc.fetch_portrait("1984", "slug-44444", preferred_size="large", cache=tmp_path)
    assert p == cached


def test_self_heal_is_logged(tmp_path: Path, install_cdn, caplog) -> None:
    # AC4: the self-heal event is observable in debug output.
    install_cdn({_key("1984", "large", "slug-55555")})
    _seed(tmp_path, "1984", "large", "slug-55555", LFS_STUB)

    with caplog.at_level(logging.DEBUG):
        pc.fetch_portrait("1984", "slug-55555", preferred_size="large", cache=tmp_path)

    messages = [r.getMessage().lower() for r in caplog.records]
    assert any(
        ("slug-55555" in m) or any(kw in m for kw in ("self-heal", "poison", "stub", "invalid", "magic"))
        for m in messages
    ), "self-heal must emit a debug log record"
