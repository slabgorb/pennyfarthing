"""Tests for Story 110-9: TUI portrait resolution for consumer installs.

Verifies:
  AC1: Theme-pack portraits resolve in consumer npm installs
  AC2: Dogfooding mode continues to work with symlinked paths taking priority
  AC3: portrait_resolver.py discovers portraits from core, npm, and monorepo
  AC4: Core-only themes degrade gracefully when portraits unavailable

Run with: python -m pytest tests/python/test_portrait_consumer_resolution.py -v
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# Fixtures — mock directory structures
# ---------------------------------------------------------------------------

MOCK_OCEAN = {"O": 4, "C": 4, "E": 5, "A": 4, "N": 1}


def _write_theme_yaml(themes_dir: Path, theme_name: str, agent: str = "sm") -> None:
    """Create a minimal theme YAML with one agent."""
    themes_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "theme": {"name": theme_name},
        "agents": {
            agent: {
                "character": "Test Leader",
                "shortName": "Leader",
                "ocean": MOCK_OCEAN,
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
    """AC1: resolve_portrait_path() finds portraits from npm theme packs."""

    def test_resolve_finds_portrait_in_npm_theme_pack(self, consumer_install: Path):
        """Theme-pack theme should resolve portrait via node_modules sibling path."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)
        assert result is not None, (
            "Should find portrait for theme-pack theme in consumer npm install"
        )
        assert result.exists(), f"Portrait file should exist at {result}"
        assert result.suffix == ".png"

    def test_discover_includes_npm_theme_dirs(self, consumer_install: Path):
        """discover_all_theme_dirs should include node_modules theme-pack paths."""
        from pf.common.themes import discover_all_theme_dirs

        dirs = discover_all_theme_dirs(project_root=consumer_install)
        npm_dirs = [d for d in dirs if "node_modules" in str(d)]
        assert len(npm_dirs) > 0, (
            "discover_all_theme_dirs should find node_modules/@pennyfarthing/themes-* dirs"
        )

    def test_npm_portrait_found_via_sibling_path(self, consumer_install: Path):
        """Portrait should be found as sibling of the npm themes/ directory."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)
        assert result is not None
        # Verify the portrait came from the npm location
        assert "node_modules" in str(result), (
            f"Portrait should come from node_modules path, got {result}"
        )

    def test_npm_portrait_prefers_medium_size(self, consumer_install: Path):
        """npm-resolved portrait should prefer medium size bucket."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)
        assert result is not None
        assert "medium" in str(result), f"Should prefer medium size, got {result}"


# ===========================================================================
# AC2: Dogfooding mode continues to work
# ===========================================================================


class TestDogfoodingPriority:
    """AC2: Symlinked .pennyfarthing/ paths take priority."""

    def test_dogfooding_resolves_core_theme_portrait(self, dogfooding_install: Path):
        """Core theme portrait should resolve in dogfooding mode."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("core-theme", "sm", project_root=dogfooding_install)
        assert result is not None, "Core theme portrait should resolve in dogfooding"
        assert result.exists()

    def test_pennyfarthing_dir_takes_priority_over_npm(self, dogfooding_install: Path):
        """When theme exists in both .pennyfarthing/ and npm, .pennyfarthing/ wins."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        # Add the same theme to the npm pack so both locations have it
        pack_dir = dogfooding_install / "node_modules" / "@pennyfarthing" / "themes-mock"
        _write_theme_yaml(pack_dir / "themes", "core-theme")
        _write_portrait(pack_dir / "portraits", "core-theme", LEADER_SLUG)

        result = resolve_portrait_path("core-theme", "sm", project_root=dogfooding_install)
        assert result is not None
        # .pennyfarthing/ is first in discovery order
        assert ".pennyfarthing" in str(result), (
            f"Dogfooding .pennyfarthing/ should take priority over npm, got {result}"
        )

    def test_dogfooding_also_resolves_npm_theme_pack(self, dogfooding_install: Path):
        """Theme-pack themes should still resolve alongside core themes in dogfooding."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("pack-theme", "sm", project_root=dogfooding_install)
        assert result is not None, "Theme-pack portrait should resolve in dogfooding mode too"


# ===========================================================================
# AC3: Discovers portraits from core, npm, and monorepo
# ===========================================================================


class TestMultiSourceDiscovery:
    """AC3: Resolver searches core, npm theme packs, and monorepo workspace."""

    def test_discovers_core_pennyfarthing_dist_portraits(self, monorepo_install: Path):
        """Should find portraits via pennyfarthing-dist/personas/portraits/."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("core-theme", "sm", project_root=monorepo_install)
        assert result is not None, (
            "Should resolve core theme portrait via pennyfarthing-dist"
        )
        assert "pennyfarthing-dist" in str(result)

    def test_discovers_monorepo_workspace_portraits(self, monorepo_install: Path):
        """Should find portraits via packages/themes-*/portraits/."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("pack-theme", "sm", project_root=monorepo_install)
        assert result is not None, (
            "Should resolve theme-pack portrait via monorepo workspace packages/"
        )
        assert "packages" in str(result)

    def test_discovers_npm_portraits(self, consumer_install: Path):
        """Should find portraits via node_modules/@pennyfarthing/themes-*/portraits/."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("pack-theme", "sm", project_root=consumer_install)
        assert result is not None, (
            "Should resolve theme-pack portrait via npm node_modules"
        )
        assert "node_modules" in str(result)

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
    """AC4: Core-only themes return None without error when portraits unavailable."""

    def test_core_theme_returns_none_in_consumer_install(self, consumer_install: Path):
        """Core-only theme should return None when no portraits available."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("core-theme", "sm", project_root=consumer_install)
        assert result is None, (
            "Core-only theme should return None in consumer install without portraits"
        )

    def test_core_theme_no_exception_on_missing_portraits(self, consumer_install: Path):
        """resolve_portrait_path should not raise for core themes without portraits."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        # Should not raise any exception
        try:
            result = resolve_portrait_path("core-theme", "sm", project_root=consumer_install)
        except Exception as exc:
            pytest.fail(f"Should not raise for missing portraits, got: {exc}")

        assert result is None

    def test_completely_unknown_theme_returns_none(self, consumer_install: Path):
        """Theme that exists nowhere should return None cleanly."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        result = resolve_portrait_path("nonexistent-theme", "sm", project_root=consumer_install)
        assert result is None

    def test_core_theme_resolves_when_pennyfarthing_dist_has_portraits(self, tmp_path: Path):
        """Core theme should resolve when pennyfarthing-dist/personas/portraits/ exists."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        # Consumer-like but with pennyfarthing-dist available (monorepo/dogfood)
        _write_theme_yaml(tmp_path / ".pennyfarthing" / "personas" / "themes", "core-theme")
        _write_theme_yaml(tmp_path / "pennyfarthing-dist" / "personas" / "themes", "core-theme")
        _write_portrait(tmp_path / "pennyfarthing-dist" / "personas" / "portraits", "core-theme", LEADER_SLUG)

        result = resolve_portrait_path("core-theme", "sm", project_root=tmp_path)
        assert result is not None, (
            "Core theme should resolve when pennyfarthing-dist has portraits"
        )

    def test_empty_portraits_dir_returns_none(self, tmp_path: Path):
        """Empty portraits directory should return None, not crash."""
        from pf.bikerack.portrait_resolver import resolve_portrait_path

        _write_theme_yaml(tmp_path / ".pennyfarthing" / "personas" / "themes", "core-theme")
        # Create portraits dir but leave it empty (no theme subdir)
        (tmp_path / ".pennyfarthing" / "personas" / "portraits").mkdir(parents=True)

        result = resolve_portrait_path("core-theme", "sm", project_root=tmp_path)
        assert result is None, "Empty portraits dir should result in None"
