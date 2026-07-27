"""Statusline syncs the Ghostty tab title to <dir> <story> <phase>."""

import os
from pathlib import Path
from unittest.mock import patch


# =============================================================================
# Title composition
# =============================================================================


def test_compose_full_title() -> None:
    from pf.hooks.statusline import _compose_tab_title

    assert _compose_tab_title("orc-penny", "160-5", "red") == "orc-penny 160-5 red"


def test_compose_no_phase() -> None:
    from pf.hooks.statusline import _compose_tab_title

    assert _compose_tab_title("orc-penny", "160-5", "") == "orc-penny 160-5"


def test_compose_idle_is_folder_only() -> None:
    from pf.hooks.statusline import _compose_tab_title

    assert _compose_tab_title("orc-penny", "", "") == "orc-penny"


def test_compose_phase_without_story_is_folder_only() -> None:
    """A phase with no story is stale data — never show it."""
    from pf.hooks.statusline import _compose_tab_title

    assert _compose_tab_title("orc-penny", "", "red") == "orc-penny"


# =============================================================================
# Phase parsing from session file
# =============================================================================


def _write_session(tmp_path: Path, story_id: str, body: str) -> None:
    session_dir = tmp_path / ".session"
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{story_id}-session.md").write_text(body)


def test_get_phase_reads_session_file(tmp_path: Path) -> None:
    from pf.hooks.statusline import _get_phase

    _write_session(tmp_path, "160-5", "# Story\n\n**Phase:** red\n**Repos:** all\n")
    assert _get_phase(str(tmp_path), "160-5") == "red"


def test_get_phase_first_match_wins(tmp_path: Path) -> None:
    from pf.hooks.statusline import _get_phase

    _write_session(tmp_path, "160-5", "**Phase:** review\n\nold: **Phase:** red\n")
    assert _get_phase(str(tmp_path), "160-5") == "review"


def test_get_phase_missing_file(tmp_path: Path) -> None:
    from pf.hooks.statusline import _get_phase

    assert _get_phase(str(tmp_path), "160-5") == ""


def test_get_phase_missing_line(tmp_path: Path) -> None:
    from pf.hooks.statusline import _get_phase

    _write_session(tmp_path, "160-5", "# Story with no phase line\n")
    assert _get_phase(str(tmp_path), "160-5") == ""


def test_get_phase_no_story(tmp_path: Path) -> None:
    from pf.hooks.statusline import _get_phase

    assert _get_phase(str(tmp_path), "") == ""


# =============================================================================
# Terminal title write path (tty seam mocked — tests never need a real tty)
# =============================================================================


def test_set_title_writes_and_caches(tmp_path: Path) -> None:
    from pf.hooks import statusline

    _write_session(tmp_path, "160-5", "**Phase:** red\n")
    with patch.object(statusline, "_write_title_to_tty") as tty:
        statusline._set_terminal_title(tmp_path, "orc-penny", "160-5")

    tty.assert_called_once_with("orc-penny 160-5 red")
    cache = tmp_path / ".pennyfarthing" / ".runtime" / "tab-title"
    assert cache.read_text() == "orc-penny 160-5 red"


def test_set_title_skips_when_unchanged(tmp_path: Path) -> None:
    """Same composed title as the cache → tty is never touched."""
    from pf.hooks import statusline

    _write_session(tmp_path, "160-5", "**Phase:** red\n")
    cache = tmp_path / ".pennyfarthing" / ".runtime" / "tab-title"
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text("orc-penny 160-5 red")

    with patch.object(statusline, "_write_title_to_tty") as tty:
        statusline._set_terminal_title(tmp_path, "orc-penny", "160-5")

    tty.assert_not_called()


def test_set_title_rewrites_on_phase_change(tmp_path: Path) -> None:
    from pf.hooks import statusline

    _write_session(tmp_path, "160-5", "**Phase:** review\n")
    cache = tmp_path / ".pennyfarthing" / ".runtime" / "tab-title"
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text("orc-penny 160-5 red")

    with patch.object(statusline, "_write_title_to_tty") as tty:
        statusline._set_terminal_title(tmp_path, "orc-penny", "160-5")

    tty.assert_called_once_with("orc-penny 160-5 review")
    assert cache.read_text() == "orc-penny 160-5 review"


def test_set_title_skipped_for_subagent(tmp_path: Path) -> None:
    """Worker panes must never retitle the main tab."""
    from pf.hooks import statusline

    _write_session(tmp_path, "160-5", "**Phase:** red\n")
    with (
        patch.dict(os.environ, {"PF_SUBAGENT": "1"}),
        patch.object(statusline, "_write_title_to_tty") as tty,
    ):
        statusline._set_terminal_title(tmp_path, "orc-penny", "160-5")

    tty.assert_not_called()
    assert not (tmp_path / ".pennyfarthing" / ".runtime" / "tab-title").exists()


def test_set_title_failsoft_when_tty_unavailable(tmp_path: Path) -> None:
    """No controlling terminal (CI, pipes) must not raise or poison the cache."""
    from pf.hooks import statusline

    _write_session(tmp_path, "160-5", "**Phase:** red\n")
    with patch.object(statusline, "_write_title_to_tty", side_effect=OSError("no tty")):
        statusline._set_terminal_title(tmp_path, "orc-penny", "160-5")  # must not raise

    # Cache must NOT record a title that never reached the terminal
    assert not (tmp_path / ".pennyfarthing" / ".runtime" / "tab-title").exists()


def test_set_title_idle_is_folder_only(tmp_path: Path) -> None:
    from pf.hooks import statusline

    with patch.object(statusline, "_write_title_to_tty") as tty:
        statusline._set_terminal_title(tmp_path, "orc-penny", "")

    tty.assert_called_once_with("orc-penny")


# =============================================================================
# Ancestor-tty fallback (hooks are spawned without a controlling terminal)
# =============================================================================


def test_write_title_falls_back_to_ancestor_tty(tmp_path: Path) -> None:
    """/dev/tty unavailable → resolve ancestor tty and write there."""
    from pf.hooks import statusline

    fake_tty = tmp_path / "ttys000"
    fake_tty.write_text("")
    real_open = open

    def fake_open(path, *args, **kwargs):
        if path == "/dev/tty":
            raise OSError(6, "Device not configured")
        return real_open(path, *args, **kwargs)

    with (
        patch("builtins.open", side_effect=fake_open),
        patch.object(statusline, "_resolve_ancestor_tty", return_value=str(fake_tty)),
    ):
        statusline._write_title_to_tty("orc-penny 160-5 red")

    assert fake_tty.read_text() == "\x1b]2;orc-penny 160-5 red\x07"


def test_write_title_raises_when_no_tty_anywhere() -> None:
    """No controlling tty and no ancestor tty → OSError (caller is fail-soft)."""
    import pytest

    from pf.hooks import statusline

    def fake_open(path, *args, **kwargs):
        raise OSError(6, "Device not configured")

    with (
        patch("builtins.open", side_effect=fake_open),
        patch.object(statusline, "_resolve_ancestor_tty", return_value=""),
    ):
        with pytest.raises(OSError):
            statusline._write_title_to_tty("orc-penny")


def test_resolve_ancestor_tty_finds_first_tty() -> None:
    """Walks ppid chain past tty-less ancestors to the first real tty."""
    from unittest.mock import MagicMock

    from pf.hooks import statusline

    results = [
        MagicMock(stdout="  54075 ??\n"),      # immediate parent: no tty
        MagicMock(stdout="  54018 ttys000\n"), # grandparent: has tty
    ]
    with (
        patch.object(statusline.os, "getppid", return_value=98589),
        patch.object(statusline.subprocess, "run", side_effect=results),
    ):
        assert statusline._resolve_ancestor_tty() == "/dev/ttys000"


def test_resolve_ancestor_tty_gives_up_cleanly() -> None:
    """ps failure → empty string, never an exception."""
    from pf.hooks import statusline

    with (
        patch.object(statusline.os, "getppid", return_value=98589),
        patch.object(statusline.subprocess, "run", side_effect=OSError("no ps")),
    ):
        assert statusline._resolve_ancestor_tty() == ""
