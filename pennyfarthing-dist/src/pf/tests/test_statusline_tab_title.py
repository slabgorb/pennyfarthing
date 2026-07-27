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
