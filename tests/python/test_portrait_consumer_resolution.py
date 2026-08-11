"""Tests for Story 110-9: TUI portrait resolution for consumer installs.

Verifies:
  AC1: Theme-pack theme YAMLs resolve in consumer npm installs
  AC2: Dogfooding mode continues to work with symlinked paths taking priority
  AC3: portrait_resolver.py discovers themes from core, npm, and monorepo
  AC4: Themes degrade gracefully when no portrait is available

CONTRACT CHANGE (story 153-12): `resolve_portrait_path` no longer searches for
portrait *image files* on disk. Local install / `~/.pennyfarthing` override /
theme-sibling `portraits/` / Git-LFS / Cyclist-package fallbacks were all
removed; the R2 CDN (`pf.package.portrait_cdn.fetch_portrait`) is the single
source of truth for images. What survives — and what this file now pins — is:

  1. the portrait *slug* (`shortName-OCEAN`) is computed from the theme YAML
     found via `pf.common.themes.discover_all_theme_dirs`, which still spans
     `.pennyfarthing/`, `pennyfarthing-dist/`, `node_modules/@pennyfarthing/
     themes-*`, and monorepo `packages/themes-*` in that priority order; and
  2. the resolver delegates to the CDN with `(theme, slug, preferred_size)`.

So the multi-source / dogfooding-priority ACs are re-derived onto the SLUG
source rather than the image path, and every test stubs `fetch_portrait` so it
asserts the resolver's own behavior instead of making a live network call.

Run with: python -m pytest tests/python/test_portrait_consumer_resolution.py -v
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

# ---------------------------------------------------------------------------
# Fixtures — mock directory structures
# ---------------------------------------------------------------------------

MOCK_OCEAN = {"O": 4, "C": 4, "E": 5, "A": 4, "N": 1}


def _write_theme_yaml(
    themes_dir: Path,
    theme_name: str,
    agent: str = "sm",
    *,
    short_name: str = "Leader",
    ocean: dict[str, int] | None = None,
) -> None:
    """Create a minimal theme YAML with one agent.

    `short_name` / `ocean` are overridable so a test can tell WHICH theme dir a
    slug came from: the slug is `shortName-OCEAN`, so giving each source a
    distinct persona makes the resolution order observable.
    """
    themes_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "theme": {"name": theme_name},
        "agents": {
            agent: {
                "character": f"Test {short_name}",
                "shortName": short_name,
                "ocean": ocean or MOCK_OCEAN,
            }
        },
    }
    (themes_dir / f"{theme_name}.yaml").write_text(yaml.dump(data))


def _write_portrait(portraits_dir: Path, theme_name: str, slug: str, size: str = "medium") -> Path:
    """Create a dummy portrait PNG file. Returns the file path."""
    target = portraits_dir / theme_name / size
    target.mkdir(parents=True, exist_ok=True)
    portrait_file = target / f"{slug}.png"
    portrait_file.write_bytes(b"\x89PNG\r\n")  # minimal PNG header
    return portrait_file


def _write_package_json(pkg_dir: Path, name: str, *, theme_pack: bool = True) -> None:
    """Create a package.json for a theme pack."""
    pkg_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "name": name,
        "version": "1.0.0",
        "pennyfarthing-theme-pack": theme_pack,
        "files": ["themes/", "portraits/"],
    }
    (pkg_dir / "package.json").write_text(json.dumps(data))


# The expected slug for shortName="Leader" with OCEAN {4,4,5,4,1}
LEADER_SLUG = "leader-44541"


def _stub_cdn(tmp_path: Path, *, hit: bool = True):
    """Patch the CDN fetch so tests exercise the resolver, not the network.

    Returns the patcher's mock. On `hit` the stub writes and returns a fake
    cached PNG so callers can assert on a real, existing `Path`; otherwise it
    returns None (the offline / all-404 case).
    """
    cache = tmp_path / "_cdn_cache"

    def _fake_fetch(theme: str, slug: str, preferred_size: str = "medium", cache_dir=None):
        if not hit:
            return None
        target = cache / theme / preferred_size
        target.mkdir(parents=True, exist_ok=True)
        path = target / f"{slug}.png"
        path.write_bytes(b"\x89PNG\r\n")
        return path

    return patch("pf.package.portrait_cdn.fetch_portrait", side_effect=_fake_fetch)


@pytest.fixture
def consumer_install(tmp_path: Path) -> Path:
    """Simulate a consumer npm install (no pennyfarthing-dist/, no packages/).

    Structure:
        tmp_path/
        ├── .pennyfarthing/
        │   └── personas/
        │       └── themes/
        │           └── core-theme.yaml          ← core-only theme (no portraits)
        └── node_modules/
            └── @pennyfarthing/
                └── themes-mock/
                    ├── package.json
                    ├── themes/
                    │   └── pack-theme.yaml       ← theme-pack theme
                    └── portraits/
                        └── pack-theme/
                            └── medium/
                                └── leader-44541.png
    """
    # Core theme — in .pennyfarthing but no sibling portraits
    _write_theme_yaml(tmp_path / ".pennyfarthing" / "personas" / "themes", "core-theme")

    # Theme pack via npm
    pack_dir = tmp_path / "node_modules" / "@pennyfarthing" / "themes-mock"
    _write_package_json(pack_dir, "@pennyfarthing/themes-mock")
    _write_theme_yaml(pack_dir / "themes", "pack-theme")
    _write_portrait(pack_dir / "portraits", "pack-theme", LEADER_SLUG)

    return tmp_path


@pytest.fixture
def dogfooding_install(tmp_path: Path) -> Path:
    """Simulate a dogfooding install with symlinked .pennyfarthing/.

    Structure:
        tmp_path/
        ├── .pennyfarthing/
        │   └── personas/
        │       ├── themes/
        │       │   └── core-theme.yaml
        │       └── portraits/
        │           └── core-theme/
        │               └── medium/
        │                   └── leader-44541.png
        ├── pennyfarthing-dist/
        │   └── personas/
        │       ├── themes/
        │       │   └── core-theme.yaml
        │       └── portraits/
        │           └── core-theme/
        │               └── medium/
        │                   └── leader-44541.png
        └── node_modules/
            └── @pennyfarthing/
                └── themes-mock/
                    ├── package.json
                    ├── themes/
                    │   └── pack-theme.yaml
                    └── portraits/
                        └── pack-theme/
                            └── medium/
                                └── leader-44541.png
    """
    # Core theme via .pennyfarthing (dogfooding — has portraits)
    _write_theme_yaml(tmp_path / ".pennyfarthing" / "personas" / "themes", "core-theme")
    _write_portrait(tmp_path / ".pennyfarthing" / "personas" / "portraits", "core-theme", LEADER_SLUG)

    # Core theme via pennyfarthing-dist (development)
    _write_theme_yaml(tmp_path / "pennyfarthing-dist" / "personas" / "themes", "core-theme")
    _write_portrait(tmp_path / "pennyfarthing-dist" / "personas" / "portraits", "core-theme", LEADER_SLUG)

    # Theme pack via npm
    pack_dir = tmp_path / "node_modules" / "@pennyfarthing" / "themes-mock"
    _write_package_json(pack_dir, "@pennyfarthing/themes-mock")
    _write_theme_yaml(pack_dir / "themes", "pack-theme")
    _write_portrait(pack_dir / "portraits", "pack-theme", LEADER_SLUG)

    return tmp_path


@pytest.fixture
def monorepo_install(tmp_path: Path) -> Path:
    """Simulate a monorepo workspace with packages/themes-*.

    Structure:
        tmp_path/
        ├── pennyfarthing-dist/
        │   └── personas/
        │       ├── themes/
        │       │   └── core-theme.yaml
        │       └── portraits/
        │           └── core-theme/
        │               └── medium/
        │                   └── leader-44541.png
        └── packages/
            └── themes-mock/
                ├── package.json
                ├── themes/
                │   └── pack-theme.yaml
                └── portraits/
                    └── pack-theme/
                        └── medium/
                            └── leader-44541.png
    """
    # Core theme via pennyfarthing-dist
    _write_theme_yaml(tmp_path / "pennyfarthing-dist" / "personas" / "themes", "core-theme")
    _write_portrait(tmp_path / "pennyfarthing-dist" / "personas" / "portraits", "core-theme", LEADER_SLUG)

    # Monorepo workspace package
    ws_dir = tmp_path / "packages" / "themes-mock"
    _write_package_json(ws_dir, "@pennyfarthing/themes-mock")
    _write_theme_yaml(ws_dir / "themes", "pack-theme")
    _write_portrait(ws_dir / "portraits", "pack-theme", LEADER_SLUG)

    return tmp_path


# ===========================================================================
# AC1: Theme-pack portraits resolve in consumer npm installs
# ===========================================================================


class TestThemePackNpmResolution:
    """AC1: resolve_portrait_path() resolves theme-pack themes from npm."""

    def test_resolve_finds_portrait_in_npm_theme_pack(self, consumer_install: Path):
        """A theme-pack theme in node_modules should resolve to a portrait."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install):
            result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)

        assert result is not None, (
            "Should resolve a portrait for a theme-pack theme in a consumer npm install"
        )
        assert result.exists(), f"Portrait file should exist at {result}"
        assert result.suffix == ".png"

    def test_slug_is_read_from_the_npm_theme_yaml(self, consumer_install: Path):
        """The slug handed to the CDN must come from the npm pack's theme YAML.

        Replaces the old `test_npm_portrait_found_via_sibling_path`, which
        asserted the returned path contained "node_modules". That assertion
        pinned sibling-`portraits/` lookup, deleted in story 153-12 — images now
        come from the CDN cache, so no resolved path can ever name node_modules.
        The surviving observable is that the persona data was read from the npm
        pack, which the slug proves.
        """
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install) as fetch:
            resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)

        fetch.assert_called_once()
        assert fetch.call_args.args[0] == "pack-theme"
        assert fetch.call_args.args[1] == LEADER_SLUG, (
            f"Slug should be derived from the npm pack's theme YAML, got {fetch.call_args.args}"
        )

    def test_local_portrait_files_are_not_consulted(self, consumer_install: Path):
        """Resolution must succeed with NO local portraits dir at all.

        Positive pin on the 153-12 contract: the CDN is the only image source,
        so deleting every on-disk portrait must not affect resolution.
        """
        from pf.tui.portrait_resolver import resolve_portrait_path

        pack_portraits = (
            consumer_install / "node_modules" / "@pennyfarthing" / "themes-mock" / "portraits"
        )
        for png in pack_portraits.rglob("*.png"):
            png.unlink()

        with _stub_cdn(consumer_install):
            result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)

        assert result is not None, (
            "Resolution must not depend on local portrait files (CDN is the only source)"
        )

    def test_discover_includes_npm_theme_dirs(self, consumer_install: Path):
        """discover_all_theme_dirs should include node_modules theme-pack paths."""
        from pf.common.themes import discover_all_theme_dirs

        dirs = discover_all_theme_dirs(project_root=consumer_install)
        npm_dirs = [d for d in dirs if "node_modules" in str(d)]
        assert len(npm_dirs) > 0, (
            "discover_all_theme_dirs should find node_modules/@pennyfarthing/themes-* dirs"
        )

    def test_npm_portrait_prefers_medium_size(self, consumer_install: Path):
        """The resolver must ask the CDN for `medium` when no size is requested."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install) as fetch:
            result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)

        assert fetch.call_args.kwargs["preferred_size"] == "medium", (
            f"Default preferred_size should be 'medium', got {fetch.call_args.kwargs}"
        )
        assert result is not None and "medium" in str(result)

    def test_explicit_preferred_size_is_forwarded(self, consumer_install: Path):
        """Negative leg: an explicit size must not be overwritten by the default."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install) as fetch:
            resolve_portrait_path(
                "pack-theme", "sm", project_root=consumer_install, preferred_size="large"
            )

        assert fetch.call_args.kwargs["preferred_size"] == "large"


# ===========================================================================
# AC2: Dogfooding mode continues to work
# ===========================================================================


class TestDogfoodingPriority:
    """AC2: Symlinked .pennyfarthing/ paths take priority."""

    def test_dogfooding_resolves_core_theme_portrait(self, dogfooding_install: Path):
        """Core theme portrait should resolve in dogfooding mode."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(dogfooding_install):
            result = resolve_portrait_path("core-theme", "sm", project_root=dogfooding_install)

        assert result is not None, "Core theme portrait should resolve in dogfooding"
        assert result.exists()

    def test_pennyfarthing_dir_takes_priority_over_npm(self, dogfooding_install: Path):
        """When a theme exists in both `.pennyfarthing/` and npm, `.pennyfarthing/` wins.

        Re-derived from a path assertion (`".pennyfarthing" in str(result)`) onto
        the slug, because after 153-12 the returned path is a CDN cache path and
        can never name a theme dir. Giving the npm copy a DIFFERENT persona makes
        the winning source observable: whichever YAML was read decides the slug.
        """
        from pf.tui.portrait_resolver import resolve_portrait_path

        # Same theme name in the npm pack, but a distinguishable persona.
        pack_dir = dogfooding_install / "node_modules" / "@pennyfarthing" / "themes-mock"
        _write_theme_yaml(
            pack_dir / "themes",
            "core-theme",
            short_name="Impostor",
            ocean={"O": 1, "C": 1, "E": 1, "A": 1, "N": 1},
        )

        with _stub_cdn(dogfooding_install) as fetch:
            result = resolve_portrait_path("core-theme", "sm", project_root=dogfooding_install)

        assert result is not None
        assert fetch.call_args.args[1] == LEADER_SLUG, (
            "Dogfooding .pennyfarthing/ should take priority over npm, but the slug "
            f"came from the npm copy: {fetch.call_args.args[1]}"
        )

    def test_dogfooding_also_resolves_npm_theme_pack(self, dogfooding_install: Path):
        """Theme-pack themes should still resolve alongside core themes in dogfooding."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(dogfooding_install):
            result = resolve_portrait_path("pack-theme", "sm", project_root=dogfooding_install)

        assert result is not None, "Theme-pack portrait should resolve in dogfooding mode too"


# ===========================================================================
# AC3: Discovers portraits from core, npm, and monorepo
# ===========================================================================


class TestMultiSourceDiscovery:
    """AC3: Resolver reaches themes in core, npm theme packs, and the monorepo.

    All three tests were `"<source>" in str(result)` path assertions before
    153-12. The returned path is now always a CDN cache path, so the source is
    instead proven by the slug: a theme that lives ONLY in that source can only
    contribute a slug if that source was discovered. No slug means the resolver
    returns None before ever calling the CDN.
    """

    def test_discovers_core_pennyfarthing_dist_theme(self, monorepo_install: Path):
        """Should reach a theme that exists only in pennyfarthing-dist/personas/themes/."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(monorepo_install) as fetch:
            result = resolve_portrait_path("core-theme", "sm", project_root=monorepo_install)

        assert result is not None, "Should resolve core theme portrait via pennyfarthing-dist"
        assert fetch.call_args.args == ("core-theme", LEADER_SLUG)

    def test_discovers_monorepo_workspace_theme(self, monorepo_install: Path):
        """Should reach a theme that exists only in packages/themes-*/themes/."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(monorepo_install) as fetch:
            result = resolve_portrait_path("pack-theme", "sm", project_root=monorepo_install)

        assert result is not None, (
            "Should resolve theme-pack portrait via monorepo workspace packages/"
        )
        assert fetch.call_args.args == ("pack-theme", LEADER_SLUG)

    def test_discovers_npm_theme(self, consumer_install: Path):
        """Should reach a theme that exists only in node_modules/@pennyfarthing/themes-*."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install) as fetch:
            result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)

        assert result is not None, "Should resolve theme-pack portrait via npm node_modules"
        assert fetch.call_args.args == ("pack-theme", LEADER_SLUG)

    def test_all_three_sources_in_discovery(self, tmp_path: Path):
        """discover_all_theme_dirs should include dirs from all three source types."""
        from pf.common.themes import discover_all_theme_dirs

        # Set up all three sources
        _write_theme_yaml(tmp_path / "pennyfarthing-dist" / "personas" / "themes", "core-theme")

        pack_dir = tmp_path / "node_modules" / "@pennyfarthing" / "themes-mock"
        _write_package_json(pack_dir, "@pennyfarthing/themes-mock")
        _write_theme_yaml(pack_dir / "themes", "npm-theme")

        ws_dir = tmp_path / "packages" / "themes-mock"
        _write_package_json(ws_dir, "@pennyfarthing/themes-mock")
        _write_theme_yaml(ws_dir / "themes", "ws-theme")

        dirs = discover_all_theme_dirs(project_root=tmp_path)
        dir_strs = [str(d) for d in dirs]

        has_dist = any("pennyfarthing-dist" in s for s in dir_strs)
        has_npm = any("node_modules" in s for s in dir_strs)
        has_ws = any("packages" in s for s in dir_strs)

        assert has_dist, "Should discover pennyfarthing-dist/personas/themes/"
        assert has_npm, "Should discover node_modules/@pennyfarthing/themes-*/themes/"
        assert has_ws, "Should discover packages/themes-*/themes/"

    def test_priority_order_core_before_npm_before_workspace(self, tmp_path: Path):
        """Discovery priority: .pennyfarthing > pennyfarthing-dist > npm > monorepo."""
        from pf.common.themes import discover_all_theme_dirs

        # Set up all sources
        _write_theme_yaml(tmp_path / ".pennyfarthing" / "personas" / "themes", "shared-theme")
        _write_theme_yaml(tmp_path / "pennyfarthing-dist" / "personas" / "themes", "shared-theme")

        pack_dir = tmp_path / "node_modules" / "@pennyfarthing" / "themes-mock"
        _write_package_json(pack_dir, "@pennyfarthing/themes-mock")
        _write_theme_yaml(pack_dir / "themes", "shared-theme")

        ws_dir = tmp_path / "packages" / "themes-mock"
        _write_package_json(ws_dir, "@pennyfarthing/themes-mock")
        _write_theme_yaml(ws_dir / "themes", "shared-theme")

        dirs = discover_all_theme_dirs(project_root=tmp_path)
        dir_strs = [str(d) for d in dirs]

        # Find indices of each source type
        pf_idx = next((i for i, s in enumerate(dir_strs) if ".pennyfarthing" in s), None)
        dist_idx = next((i for i, s in enumerate(dir_strs) if "pennyfarthing-dist" in s), None)
        npm_idx = next((i for i, s in enumerate(dir_strs) if "node_modules" in s), None)
        ws_idx = next((i for i, s in enumerate(dir_strs) if "/packages/" in s), None)

        assert pf_idx is not None, "Should include .pennyfarthing"
        assert dist_idx is not None, "Should include pennyfarthing-dist"
        assert npm_idx is not None, "Should include node_modules"
        assert ws_idx is not None, "Should include packages/"

        assert pf_idx < dist_idx, ".pennyfarthing should come before pennyfarthing-dist"
        assert dist_idx < npm_idx, "pennyfarthing-dist should come before node_modules"
        assert npm_idx < ws_idx, "node_modules should come before packages/"


# ===========================================================================
# AC4: Core-only themes degrade gracefully
# ===========================================================================


class TestCoreThemeGracefulDegradation:
    """AC4: Resolution returns None without error when no portrait is available.

    These four tests previously reached the real CDN (they were green only
    because the fixture theme names happen to 404 upstream) — a live network
    call masquerading as a unit test. Each now stubs `fetch_portrait` so the
    "unavailable" case is the one under test rather than an accident of
    connectivity.
    """

    def test_returns_none_when_cdn_has_no_image(self, consumer_install: Path):
        """A resolvable slug with no CDN image should degrade to None."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install, hit=False):
            result = resolve_portrait_path("core-theme", "sm", project_root=consumer_install)

        assert result is None, "Should return None when the CDN has no image for the slug"

    def test_no_exception_when_cdn_raises(self, consumer_install: Path):
        """A CDN failure must be swallowed into None, not propagated to the TUI."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with patch(
            "pf.package.portrait_cdn.fetch_portrait", side_effect=OSError("network down")
        ):
            try:
                result = resolve_portrait_path("core-theme", "sm", project_root=consumer_install)
            except Exception as exc:
                pytest.fail(f"Should not raise when the CDN fails, got: {exc}")

        assert result is None

    def test_completely_unknown_theme_returns_none(self, consumer_install: Path):
        """A theme that exists nowhere returns None WITHOUT consulting the CDN."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install) as fetch:
            result = resolve_portrait_path(
                "nonexistent-theme", "sm", project_root=consumer_install
            )

        assert result is None
        # No slug means no CDN request should be made.
        fetch.assert_not_called()

    def test_unknown_agent_returns_none(self, consumer_install: Path):
        """A known theme with no entry for the requested agent yields no slug."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        with _stub_cdn(consumer_install) as fetch:
            result = resolve_portrait_path("pack-theme", "no-such-agent", project_root=consumer_install)

        assert result is None
        fetch.assert_not_called()

    def test_core_theme_resolves_via_pennyfarthing_dist_theme_yaml(self, tmp_path: Path):
        """Core theme should resolve when only pennyfarthing-dist holds its YAML."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        # Consumer-like but with pennyfarthing-dist available (monorepo/dogfood).
        # Only the dist copy carries the `sm` persona, so a successful slug
        # proves the dist theme dir was searched.
        (tmp_path / ".pennyfarthing" / "personas" / "themes").mkdir(parents=True)
        _write_theme_yaml(tmp_path / "pennyfarthing-dist" / "personas" / "themes", "core-theme")

        with _stub_cdn(tmp_path) as fetch:
            result = resolve_portrait_path("core-theme", "sm", project_root=tmp_path)

        assert result is not None, (
            "Core theme should resolve when pennyfarthing-dist holds the theme YAML"
        )
        assert fetch.call_args.args == ("core-theme", LEADER_SLUG)

    def test_theme_yaml_without_ocean_returns_none(self, tmp_path: Path):
        """An incomplete persona (no OCEAN scores) cannot produce a slug."""
        from pf.tui.portrait_resolver import resolve_portrait_path

        themes_dir = tmp_path / ".pennyfarthing" / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "core-theme.yaml").write_text(
            yaml.dump({"theme": {"name": "core-theme"}, "agents": {"sm": {"shortName": "Leader"}}})
        )

        with _stub_cdn(tmp_path) as fetch:
            result = resolve_portrait_path("core-theme", "sm", project_root=tmp_path)

        assert result is None, "A persona without OCEAN scores should not yield a slug"
        fetch.assert_not_called()
