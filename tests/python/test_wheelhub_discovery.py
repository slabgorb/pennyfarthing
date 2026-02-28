"""Tests for WheelHub entry point discovery (Story 136-2).

Verifies multi-strategy resolution for _find_wheelhub_entry():
  AC1: Monorepo path resolution still works (walk-up, env var precedence)
  AC2: Pip-installed WheelHub launches successfully (_dist/server/wheelhub.mjs)
  AC4: Graceful degradation when WheelHub is unavailable (descriptive errors)

Run with: python -m pytest tests/python/test_wheelhub_discovery.py -v
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from pf.bikerack.launcher import _find_wheelhub_entry, start_wheelhub


# ---------------------------------------------------------------------------
# Fixtures: filesystem layouts
# ---------------------------------------------------------------------------


@pytest.fixture
def monorepo_layout(tmp_path):
    """Monorepo layout with WheelHub entry.js at the expected location.

    pennyfarthing/
      pennyfarthing-dist/src/pf/bikerack/launcher.py  <- start_path
      packages/core/dist/server/entry.js               <- entry point
    """
    root = tmp_path / "pennyfarthing"

    launcher_dir = root / "pennyfarthing-dist" / "src" / "pf" / "bikerack"
    launcher_dir.mkdir(parents=True)
    start_path = launcher_dir / "launcher.py"
    start_path.touch()

    entry_dir = root / "packages" / "core" / "dist" / "server"
    entry_dir.mkdir(parents=True)
    entry_js = entry_dir / "entry.js"
    entry_js.write_text("// WheelHub entry")

    return {"root": root, "start_path": start_path, "entry_js": entry_js}


@pytest.fixture
def pip_layout(tmp_path):
    """Pip-installed layout with bundled wheelhub.mjs.

    site-packages/
      pf/
        bikerack/launcher.py  <- start_path
        _dist/server/wheelhub.mjs
    """
    pf_dir = tmp_path / "pf"

    launcher_dir = pf_dir / "bikerack"
    launcher_dir.mkdir(parents=True)
    start_path = launcher_dir / "launcher.py"
    start_path.touch()

    dist_server = pf_dir / "_dist" / "server"
    dist_server.mkdir(parents=True)
    wheelhub_mjs = dist_server / "wheelhub.mjs"
    wheelhub_mjs.write_text("// bundled WheelHub")

    return {"root": tmp_path, "start_path": start_path, "wheelhub_mjs": wheelhub_mjs}


@pytest.fixture
def empty_layout(tmp_path):
    """Directory with no WheelHub entry point anywhere."""
    launcher_dir = tmp_path / "pf" / "bikerack"
    launcher_dir.mkdir(parents=True)
    start_path = launcher_dir / "launcher.py"
    start_path.touch()
    return {"root": tmp_path, "start_path": start_path}


# ---------------------------------------------------------------------------
# AC1: Monorepo path resolution still works
# ---------------------------------------------------------------------------


class TestMonorepoDiscovery:
    """AC1: Monorepo path resolution still works."""

    def test_monorepo_layout_finds_entry_js(self, monorepo_layout):
        """Walk-up from start_path discovers entry.js in monorepo layout."""
        result = _find_wheelhub_entry(start_path=monorepo_layout["start_path"])
        assert result == monorepo_layout["entry_js"]

    def test_env_var_overrides_monorepo(self, monorepo_layout, tmp_path):
        """PENNYFARTHING_DIST env var takes precedence over monorepo walk-up."""
        # Create an alternative dist root with entry.js
        alt_root = tmp_path / "alt-root"
        alt_entry_dir = alt_root / "packages" / "core" / "dist" / "server"
        alt_entry_dir.mkdir(parents=True)
        alt_entry = alt_entry_dir / "entry.js"
        alt_entry.write_text("// alt entry")

        # Also place pennyfarthing-dist marker so env var root is valid
        (alt_root / "pennyfarthing-dist").mkdir(exist_ok=True)

        with patch.dict(os.environ, {"PENNYFARTHING_DIST": str(alt_root / "pennyfarthing-dist")}):
            result = _find_wheelhub_entry(start_path=monorepo_layout["start_path"])
            # Should resolve via env var root, not monorepo walk-up
            assert str(alt_root) in str(result)

    def test_env_var_set_but_path_missing_falls_through(self, monorepo_layout):
        """Stale PENNYFARTHING_DIST env var falls through to monorepo walk-up."""
        with patch.dict(os.environ, {"PENNYFARTHING_DIST": "/nonexistent/path"}):
            result = _find_wheelhub_entry(start_path=monorepo_layout["start_path"])
            # Should fall through and still find monorepo entry.js
            assert result == monorepo_layout["entry_js"]

    def test_monorepo_dist_not_built_falls_through(self, tmp_path):
        """Monorepo without built dist/ falls through to pip strategy."""
        root = tmp_path / "pennyfarthing"
        launcher_dir = root / "pennyfarthing-dist" / "src" / "pf" / "bikerack"
        launcher_dir.mkdir(parents=True)
        start_path = launcher_dir / "launcher.py"
        start_path.touch()

        # No packages/core/dist/server/entry.js — create pip fallback instead
        pf_dir = root / "pennyfarthing-dist" / "src" / "pf"
        dist_server = pf_dir / "_dist" / "server"
        dist_server.mkdir(parents=True)
        wheelhub = dist_server / "wheelhub.mjs"
        wheelhub.write_text("// fallback bundled")

        result = _find_wheelhub_entry(start_path=start_path)
        assert result.name == "wheelhub.mjs"

    def test_walk_up_not_hardcoded_depth(self, tmp_path):
        """Discovery uses walk-up search, not hardcoded parent traversal depth.

        Places start_path at depth 7 (not the hardcoded 5) to prove
        walk-up works regardless of directory depth.
        """
        deep_dir = tmp_path / "a" / "b" / "c" / "d" / "e" / "f" / "g"
        deep_dir.mkdir(parents=True)
        start_path = deep_dir / "launcher.py"
        start_path.touch()

        entry_dir = tmp_path / "packages" / "core" / "dist" / "server"
        entry_dir.mkdir(parents=True)
        entry_js = entry_dir / "entry.js"
        entry_js.write_text("// deep walk-up")

        result = _find_wheelhub_entry(start_path=start_path)
        assert result == entry_js


# ---------------------------------------------------------------------------
# AC2: Pip-installed WheelHub launches successfully
# ---------------------------------------------------------------------------


class TestPipDiscovery:
    """AC2: Pip-installed WheelHub launches successfully."""

    def test_pip_layout_finds_wheelhub_mjs(self, pip_layout):
        """Pip layout discovers wheelhub.mjs in _dist/server/."""
        result = _find_wheelhub_entry(start_path=pip_layout["start_path"])
        assert result == pip_layout["wheelhub_mjs"]

    def test_pip_env_var_override(self, pip_layout, tmp_path):
        """PENNYFARTHING_DIST env var overrides pip layout discovery."""
        custom_dist = tmp_path / "custom-dist"
        custom_server = custom_dist / "server"
        custom_server.mkdir(parents=True)
        custom_entry = custom_server / "wheelhub.mjs"
        custom_entry.write_text("// custom")

        with patch.dict(os.environ, {"PENNYFARTHING_DIST": str(custom_dist)}):
            result = _find_wheelhub_entry(start_path=pip_layout["start_path"])
            assert "custom-dist" in str(result)

    def test_pip_dir_exists_no_mjs_raises(self, tmp_path):
        """Pip _dist/server/ exists but wheelhub.mjs is missing → FileNotFoundError."""
        pf_dir = tmp_path / "pf"
        launcher_dir = pf_dir / "bikerack"
        launcher_dir.mkdir(parents=True)
        start_path = launcher_dir / "launcher.py"
        start_path.touch()

        # Create _dist/server/ directory but NOT wheelhub.mjs
        dist_server = pf_dir / "_dist" / "server"
        dist_server.mkdir(parents=True)

        with pytest.raises(FileNotFoundError):
            _find_wheelhub_entry(start_path=start_path)


# ---------------------------------------------------------------------------
# AC4: Graceful degradation when WheelHub is unavailable
# ---------------------------------------------------------------------------


class TestGracefulDegradation:
    """AC4: Graceful degradation when WheelHub is unavailable."""

    def test_no_entry_point_raises_file_not_found(self, empty_layout):
        """No WheelHub entry point anywhere → FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            _find_wheelhub_entry(start_path=empty_layout["start_path"])

    def test_error_message_lists_attempted_paths(self, empty_layout):
        """FileNotFoundError message includes specific filesystem paths tried."""
        with pytest.raises(FileNotFoundError) as exc_info:
            _find_wheelhub_entry(start_path=empty_layout["start_path"])

        error_msg = str(exc_info.value)
        # Error should include at least one absolute path that was checked,
        # not just generic descriptions like "monorepo" or "pip"
        assert str(empty_layout["root"]) in error_msg or "/" in error_msg.split("\n")[-1]
        # Must mention both strategies that were tried
        assert "entry.js" in error_msg
        assert "wheelhub.mjs" in error_msg

    def test_start_wheelhub_handles_missing_entry_gracefully(self, tmp_path):
        """start_wheelhub() returns error result dict when entry point not found.

        AC4 requires: no Python traceback shown to user. The caller must
        catch FileNotFoundError and return a result dict.
        """
        project_dir = tmp_path / "project"
        project_dir.mkdir()

        with patch("pf.bikerack.launcher._find_wheelhub_entry") as mock_find:
            mock_find.side_effect = FileNotFoundError("No WheelHub entry point")

            result = start_wheelhub(project_dir)

            # Should return result dict, NOT propagate exception
            assert isinstance(result, dict), (
                "start_wheelhub must return a dict, not raise FileNotFoundError"
            )
            assert result["success"] is False
            assert "error" in result


# ---------------------------------------------------------------------------
# General contract
# ---------------------------------------------------------------------------


class TestReturnContract:
    """Result type and contract checks."""

    def test_returns_path_object(self, monorepo_layout):
        """Successful discovery returns a pathlib.Path."""
        result = _find_wheelhub_entry(start_path=monorepo_layout["start_path"])
        assert isinstance(result, Path)

    def test_returned_path_is_file(self, monorepo_layout):
        """Returned path points to an existing file."""
        result = _find_wheelhub_entry(start_path=monorepo_layout["start_path"])
        assert result.is_file()
