"""Tests for the ``python -m pf.session.test_cache`` entrypoint — Story 158-2.

GREEN-phase coverage (added by Dev): the ``testing-runner`` agent invokes the
cache through this CLI, so the entrypoint that bridges bash → the helper needs
its own coverage. The path/guard logic itself is covered by
``test_158_2_testrun_cache_isolation.py``.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest

from pf.session import test_cache


@pytest.fixture
def root(tmp_path: Path) -> Path:
    (tmp_path / ".pennyfarthing").mkdir()
    (tmp_path / ".session").mkdir()
    return tmp_path


def test_main_writes_stdin_to_namespaced_cache(
    root: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(test_cache, "get_project_root", lambda: root)
    monkeypatch.setattr("sys.stdin", io.StringIO("# Test Session: r1\nGREEN\n"))

    rc = test_cache.main(["67-1-dev-green-rework2"])

    assert rc == 0
    expected = test_cache.test_run_cache_path(root, "67-1-dev-green-rework2")
    assert expected.read_text(encoding="utf-8") == "# Test Session: r1\nGREEN\n"
    # On success the path is printed for the caller.
    assert str(expected) in capsys.readouterr().out


def test_main_does_not_clobber_live_session(
    root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Even driven via the CLI, a live session is never touched (gh #53)."""
    session = root / ".session" / "67-1-session.md"
    session.write_text(
        '---\nstory_id: "67-1"\n---\n## Sm Assessment\nrouted\n', encoding="utf-8"
    )
    before = session.read_bytes()

    monkeypatch.setattr(test_cache, "get_project_root", lambda: root)
    monkeypatch.setattr("sys.stdin", io.StringIO("# Test Session: r1\n"))

    # RUN_ID embeds the active STORY_ID — the original collision case.
    rc = test_cache.main(["67-1-dev-green-rework2"])

    assert rc == 0
    assert session.read_bytes() == before


def test_main_returns_nonzero_on_invalid_run_id(
    root: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(test_cache, "get_project_root", lambda: root)
    monkeypatch.setattr("sys.stdin", io.StringIO("data"))

    rc = test_cache.main(["../escape"])

    assert rc == 1
    assert "error" in capsys.readouterr().err.lower()
