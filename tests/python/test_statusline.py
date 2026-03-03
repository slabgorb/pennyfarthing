"""Tests for statusline hook — story ID and relative cwd segments."""

from __future__ import annotations

from pathlib import Path

from pf.hooks.statusline import _get_relative_cwd, _get_story_id


class TestGetStoryId:
    """Tests for _get_story_id."""

    def test_returns_story_id_from_session_file(self, tmp_path: Path) -> None:
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "120-12-session.md").write_text("# Story 120-12")
        assert _get_story_id(str(tmp_path)) == "120-12"

    def test_returns_empty_when_no_session_dir(self, tmp_path: Path) -> None:
        assert _get_story_id(str(tmp_path)) == ""

    def test_returns_empty_when_no_session_files(self, tmp_path: Path) -> None:
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        assert _get_story_id(str(tmp_path)) == ""

    def test_ignores_non_session_files(self, tmp_path: Path) -> None:
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "agents").mkdir()
        (session_dir / "notes.md").write_text("not a session")
        assert _get_story_id(str(tmp_path)) == ""

    def test_handles_complex_story_id(self, tmp_path: Path) -> None:
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "91-5-session.md").write_text("# Story 91-5")
        assert _get_story_id(str(tmp_path)) == "91-5"


class TestGetRelativeCwd:
    """Tests for _get_relative_cwd."""

    def test_returns_relative_path(self) -> None:
        result = _get_relative_cwd("/home/user/project/src/lib", "/home/user/project")
        assert result == "src/lib"

    def test_returns_project_name_when_at_root(self) -> None:
        result = _get_relative_cwd("/home/user/project", "/home/user/project")
        assert result == "project"

    def test_returns_dir_name_when_outside_project(self) -> None:
        result = _get_relative_cwd("/other/path/foo", "/home/user/project")
        assert result == "foo"

    def test_returns_question_mark_when_cwd_empty(self) -> None:
        assert _get_relative_cwd("", "/home/user/project") == "?"

    def test_returns_dir_name_when_project_root_empty(self) -> None:
        result = _get_relative_cwd("/home/user/project/src", "")
        assert result == "src"

    def test_both_empty(self) -> None:
        assert _get_relative_cwd("", "") == "?"
