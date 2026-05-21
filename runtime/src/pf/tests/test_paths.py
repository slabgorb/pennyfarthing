"""Tests for pf.paths — the runtime-state path chokepoint."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from pf import paths


class TestProjectHash:
    """sha256-derived per-working-copy identifier (spec §3.4)."""

    def test_deterministic_for_same_path(self, tmp_path: Path) -> None:
        h1 = paths.project_hash(tmp_path)
        h2 = paths.project_hash(tmp_path)
        assert h1 == h2

    def test_length_is_12(self, tmp_path: Path) -> None:
        h = paths.project_hash(tmp_path)
        assert isinstance(h, str)
        assert len(h) == 12
        assert all(c in "0123456789abcdef" for c in h)

    def test_different_paths_yield_different_hashes(self, tmp_path: Path) -> None:
        a = tmp_path / "a"
        b = tmp_path / "b"
        a.mkdir()
        b.mkdir()
        assert paths.project_hash(a) != paths.project_hash(b)

    def test_uses_absolute_path(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        # Hash for a relative-vs-absolute version of the same dir must agree.
        (tmp_path / "sub").mkdir()
        monkeypatch.chdir(tmp_path)
        absolute_hash = paths.project_hash(tmp_path / "sub")
        relative_hash = paths.project_hash(Path("sub"))
        assert absolute_hash == relative_hash


class TestProjectRoot:
    """Resolve the working copy root — git toplevel if available, else cwd."""

    def test_no_git_returns_resolved_path(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        # Belt-and-braces: prevent git's upward walk from finding an enclosing repo
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
        result = paths.project_root(tmp_path)
        assert result == tmp_path.resolve()

    def test_in_git_repo_returns_toplevel(self, tmp_path: Path) -> None:
        subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
        nested = tmp_path / "sub" / "dir"
        nested.mkdir(parents=True)
        result = paths.project_root(nested)
        assert result == tmp_path.resolve()


class TestRuntimeData:
    """${CLAUDE_PLUGIN_DATA} with fallback to ~/.claude/data/pf/."""

    def test_uses_env_when_set(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "plugin-data"))
        assert paths.runtime_data() == tmp_path / "plugin-data"

    def test_falls_back_when_env_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CLAUDE_PLUGIN_DATA", raising=False)
        result = paths.runtime_data()
        assert result == Path.home() / ".claude" / "data" / "pf"

    def test_returns_path_object(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path))
        assert isinstance(paths.runtime_data(), Path)


class TestComposedPaths:
    """session_dir, sidecars_dir, config_path — composed on the primitives."""

    def test_session_dir_uses_project_hash(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
        sd = paths.session_dir(tmp_path)
        assert sd == tmp_path / "projects" / paths.project_hash(tmp_path) / ".session"

    def test_config_path_uses_project_hash(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
        cp = paths.config_path(tmp_path)
        assert cp == (
            tmp_path / "projects" / paths.project_hash(tmp_path) / "config.local.yaml"
        )

    def test_sidecars_dir_uses_project_hash(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        runtime_data_root = tmp_path / "data"
        monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(runtime_data_root))
        monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
        sd = paths.sidecars_dir(tmp_path)
        assert sd == runtime_data_root / "sidecars" / paths.project_hash(tmp_path)
