"""Story 154-1: integration wiring for the R2 CDN portrait path.

Proves the portrait_cdn module is actually consumed end-to-end:
  - ``resolve_portrait_path`` (the single resolver used by TUI, Frame, and
    peloton) reads portraits from the CDN cache, and a developer override
    directory wins over it.
  - the ``pf portraits`` CLI surface (status / list / clean) is wired and
    delegates to the module functions.

Hermetic: XDG + HOME are redirected to tmp, the CDN cache is pre-seeded with a
``.complete`` sentinel so ``ensure_portraits`` is a no-op (no network), and
theme discovery is monkeypatched to a tmp theme dir.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from click.testing import CliRunner

from pf.package import portrait_cdn

# Ponder's OCEAN 5/5/2/3/4 -> slug "ponder-55234" (matches _extract_agent_slug).
SLUG = "ponder-55234"
THEME_YAML = {
    "agents": {"dev": {"shortName": "Ponder", "ocean": {"O": 5, "C": 5, "E": 2, "A": 3, "N": 4}}}
}


def _png(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 300)
    return path


@pytest.fixture
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect XDG (cache) and HOME (override dir) to tmp; return tmp_path."""
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    return tmp_path


@pytest.fixture
def theme_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A tmp theme dir with discworld.yaml; discovery is patched to return it."""
    d = tmp_path / "themes"
    d.mkdir()
    (d / "discworld.yaml").write_text(yaml.safe_dump(THEME_YAML), encoding="utf-8")
    monkeypatch.setattr("pf.common.themes.discover_all_theme_dirs", lambda root=None: [d])
    return d


def _seed_cdn_cache(tmp_path: Path) -> Path:
    cache = tmp_path / "xdg" / "pennyfarthing" / "portraits" / "discworld"
    portrait = _png(cache / "medium" / f"{SLUG}.png")
    (cache / ".complete").write_text("", encoding="utf-8")
    return portrait


# --------------------------------------------------------------------------- #
# Resolver wiring
# --------------------------------------------------------------------------- #


def test_resolver_reads_portrait_from_cdn_cache(isolated_env, theme_dir):
    portrait = _seed_cdn_cache(isolated_env)
    from pf.tui.portrait_resolver import resolve_portrait_path

    result = resolve_portrait_path("discworld", "dev", preferred_size="medium")
    assert result == portrait


def test_resolver_override_dir_wins_over_cdn(isolated_env, theme_dir):
    _seed_cdn_cache(isolated_env)
    override = _png(
        isolated_env / "home" / ".pennyfarthing" / "portraits" / "discworld" / "medium" / f"{SLUG}.png"
    )
    from pf.tui.portrait_resolver import resolve_portrait_path

    result = resolve_portrait_path("discworld", "dev", preferred_size="medium")
    assert result == override


def test_resolver_returns_none_when_nothing_cached(isolated_env, theme_dir, monkeypatch):
    # No CDN cache, no override. The resolver's CDN branch calls
    # ensure_portraits -> fetch_manifest -> urlopen; without interception this
    # test would hit the LIVE CDN (flaky offline, non-hermetic — finding C6).
    # Intercept urllib so the manifest fetch fails locally and assert the
    # resolver degrades to None without ever escaping to a real host.
    import urllib.error
    import urllib.request

    calls: list[str] = []

    def _no_network(req, timeout=None):
        url = req.full_url if isinstance(req, urllib.request.Request) else req
        calls.append(url)
        raise urllib.error.URLError("network disabled in test")

    monkeypatch.setattr(urllib.request, "urlopen", _no_network)

    from pf.tui.portrait_resolver import resolve_portrait_path

    assert resolve_portrait_path("discworld", "dev", preferred_size="medium") is None
    # Hermetic AND non-vacuous: the resolver must actually attempt the CDN fetch
    # (else `all([])` would pass without observing anything — Reviewer finding R3),
    # and every attempt must target only the CDN host.
    assert calls, "resolver never attempted the CDN fetch — interception unverified"
    assert all(u.startswith(portrait_cdn.CDN_BASE_URL) for u in calls), (
        f"resolver attempted a non-CDN/live request: {calls}"
    )


# --------------------------------------------------------------------------- #
# CLI surface
# --------------------------------------------------------------------------- #


def test_cli_portraits_status_json(isolated_env):
    cache = isolated_env / "xdg" / "pennyfarthing" / "portraits" / "discworld"
    _png(cache / "medium" / "x.png")
    (cache / ".complete").write_text("", encoding="utf-8")
    from pf.package.cli import portraits

    result = CliRunner().invoke(portraits, ["status", "--json"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["themes"] == 1
    assert data["images"] == 1


def test_cli_portraits_list(isolated_env):
    cache = isolated_env / "xdg" / "pennyfarthing" / "portraits" / "discworld"
    (cache / "medium").mkdir(parents=True)
    (cache / ".complete").write_text("", encoding="utf-8")
    from pf.package.cli import portraits

    result = CliRunner().invoke(portraits, ["list"])
    assert result.exit_code == 0
    assert "discworld" in result.output


def test_cli_portraits_clean_removes_theme(isolated_env):
    cache = isolated_env / "xdg" / "pennyfarthing" / "portraits" / "discworld"
    (cache / "medium").mkdir(parents=True)
    (cache / ".complete").write_text("", encoding="utf-8")
    from pf.package.cli import portraits

    result = CliRunner().invoke(portraits, ["clean", "discworld"])
    assert result.exit_code == 0
    assert not cache.exists()


def test_cli_portraits_clean_missing_errors(isolated_env):
    (isolated_env / "xdg" / "pennyfarthing" / "portraits").mkdir(parents=True)
    from pf.package.cli import portraits

    result = CliRunner().invoke(portraits, ["clean", "never-cached"])
    assert result.exit_code == 1
    assert "never-cached" in result.output
