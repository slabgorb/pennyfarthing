"""Tests for bare-server auto-start sourcing the project tmux config.

Story 164-15 (gh #32): `panes.ensure_server()` auto-starts the bare tmux
server with `new-session -d` but never sources the project's
`tmux.conf.{vert,right,left}`, so the session inherits vanilla tmux
defaults (mouse off, green status bar, no OSC52 passthrough).

Acceptance Criteria covered here:
- [AC1/AC3] ensure_server() calls BOTH `new-session` AND `source-file`,
  in that order, with the resolved project config path and the bare
  session as the target.
- [AC4] Missing config file → warning logged, session creation still
  succeeds (graceful degradation). A failing `source-file` likewise must
  not fail session creation.

Tests use mocks throughout — no real tmux server is required.
"""

from __future__ import annotations

import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.tmux.panes import BARE_SESSION_PREFIX, ensure_server

OK = {"success": True, "data": ""}


def _tmux_calls(mock_run: MagicMock) -> list[tuple[str, ...]]:
    """Positional tmux arg tuples for each _run_tmux call, in order."""
    return [tuple(str(a) for a in call.args) for call in mock_run.call_args_list]


def _find_subcommand(calls: list[tuple[str, ...]], subcommand: str) -> list[int]:
    """Indices of calls whose first positional arg is the given subcommand."""
    return [i for i, args in enumerate(calls) if args and args[0] == subcommand]


@pytest.fixture()
def project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A project root with no tmux config yet, active for path resolution."""
    root = tmp_path / "myproject"
    (root / ".pennyfarthing").mkdir(parents=True)
    monkeypatch.setenv("PROJECT_ROOT", str(root))
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    monkeypatch.chdir(root)
    return root


@pytest.fixture()
def vert_config(project: Path) -> Path:
    """Project root containing a tmux.conf.vert file."""
    config = project / "tmux.conf.vert"
    config.write_text("set -g mouse on\nset -g status-style bg=default\n")
    return config


# ---------------------------------------------------------------------------
# AC1 + AC3: new-session then source-file with the right config path
# ---------------------------------------------------------------------------


class TestEnsureServerSourcesConfig:
    @patch("pf.tmux.panes.is_tmux_running", return_value=False)
    @patch("pf.tmux.panes._run_tmux", return_value=dict(OK))
    def test_calls_source_file_after_new_session(
        self, mock_run: MagicMock, _running: MagicMock, vert_config: Path
    ) -> None:
        """Both new-session and source-file must run, in that order."""
        result = ensure_server()
        assert result["success"] is True

        calls = _tmux_calls(mock_run)
        new_session = _find_subcommand(calls, "new-session")
        source_file = _find_subcommand(calls, "source-file")

        assert new_session, f"expected a new-session call, got {calls}"
        assert source_file, f"expected a source-file call, got {calls}"
        assert new_session[0] < source_file[0], (
            f"source-file must follow new-session, got {calls}"
        )

    @patch("pf.tmux.panes.is_tmux_running", return_value=False)
    @patch("pf.tmux.panes._run_tmux", return_value=dict(OK))
    def test_source_file_uses_project_vert_config_path(
        self, mock_run: MagicMock, _running: MagicMock, vert_config: Path
    ) -> None:
        """source-file must reference the project's tmux.conf.vert by path."""
        ensure_server()

        calls = _tmux_calls(mock_run)
        idx = _find_subcommand(calls, "source-file")
        assert idx, f"expected a source-file call, got {calls}"

        args = calls[idx[0]]
        paths = [Path(a) for a in args[1:] if a.endswith("tmux.conf.vert")]
        assert paths, f"source-file args must include the config path, got {args}"
        assert paths[0].resolve() == vert_config.resolve()

    @patch("pf.tmux.panes.is_tmux_running", return_value=False)
    @patch("pf.tmux.panes._run_tmux", return_value=dict(OK))
    def test_source_file_targets_the_bare_session(
        self, mock_run: MagicMock, _running: MagicMock, vert_config: Path
    ) -> None:
        """source-file must target the session it just created.

        tmux grammar is `source-file [-Fnqv] [-t target-pane] path ...`,
        so `-t <session>` MUST precede the config path — trailing args
        after the path are parsed as additional paths and tmux exits 1.
        """
        result = ensure_server()
        session_name = result["data"]
        assert session_name.startswith(BARE_SESSION_PREFIX)

        calls = _tmux_calls(mock_run)
        idx = _find_subcommand(calls, "source-file")
        assert idx, f"expected a source-file call, got {calls}"

        args = calls[idx[0]]
        assert "-t" in args, f"source-file must use -t <session>, got {args}"
        assert args[args.index("-t") + 1] == session_name

        path_positions = [
            i for i, a in enumerate(args) if a.endswith("tmux.conf.vert")
        ]
        assert path_positions, f"source-file must include the config path, got {args}"
        assert args.index("-t") < path_positions[0], (
            f"-t <session> must precede the config path per tmux grammar, got {args}"
        )
        assert args.index("-t") + 1 < path_positions[0], (
            f"session target must precede the config path, got {args}"
        )

    @patch("pf.tmux.panes.is_tmux_running", return_value=True)
    @patch("pf.tmux.panes._run_tmux", return_value=dict(OK))
    def test_no_config_sourced_when_server_already_running(
        self, mock_run: MagicMock, _running: MagicMock, vert_config: Path
    ) -> None:
        """An already-running server is left alone — no session, no sourcing."""
        result = ensure_server()
        assert result == {"success": True, "data": "already_running"}
        assert _tmux_calls(mock_run) == []

    @patch("pf.tmux.panes.is_tmux_running", return_value=False)
    @patch("pf.tmux.panes._run_tmux")
    def test_no_source_file_when_new_session_fails(
        self, mock_run: MagicMock, _running: MagicMock, vert_config: Path
    ) -> None:
        """If the session can't be created, don't try to source into it."""
        mock_run.return_value = {"success": False, "error": "boom"}
        result = ensure_server()

        assert result["success"] is False
        calls = _tmux_calls(mock_run)
        assert not _find_subcommand(calls, "source-file"), (
            f"must not source-file after a failed new-session, got {calls}"
        )


# ---------------------------------------------------------------------------
# AC4: graceful degradation
# ---------------------------------------------------------------------------


class TestGracefulDegradation:
    @patch("pf.tmux.panes.is_tmux_running", return_value=False)
    @patch("pf.tmux.panes._run_tmux", return_value=dict(OK))
    def test_missing_config_still_creates_session(
        self, mock_run: MagicMock, _running: MagicMock, project: Path
    ) -> None:
        """No tmux.conf.vert → session still created, no source-file attempted."""
        result = ensure_server()

        assert result["success"] is True
        assert result["data"] == f"{BARE_SESSION_PREFIX}{project.name}"

        calls = _tmux_calls(mock_run)
        assert _find_subcommand(calls, "new-session")
        assert not _find_subcommand(calls, "source-file"), (
            f"must not source a nonexistent config, got {calls}"
        )

    @patch("pf.tmux.panes.is_tmux_running", return_value=False)
    @patch("pf.tmux.panes._run_tmux", return_value=dict(OK))
    def test_missing_config_logs_warning(
        self,
        mock_run: MagicMock,
        _running: MagicMock,
        project: Path,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """A missing config is surfaced as a warning, not silence."""
        with caplog.at_level(logging.WARNING, logger="pf.tmux.panes"):
            result = ensure_server()

        assert result["success"] is True
        warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert warnings, "missing tmux config must log a warning"
        assert any("tmux.conf" in r.getMessage() for r in warnings), (
            f"warning must name the missing config, got {[r.getMessage() for r in warnings]}"
        )

    @patch("pf.tmux.panes.is_tmux_running", return_value=False)
    @patch("pf.tmux.panes._run_tmux")
    def test_source_file_failure_does_not_fail_session_creation(
        self, mock_run: MagicMock, _running: MagicMock, vert_config: Path
    ) -> None:
        """A tmux source-file error degrades gracefully to a usable session."""

        def responses(*args: str, **kwargs: object) -> dict:
            if args and args[0] == "source-file":
                return {"success": False, "error": "no such file or directory"}
            return dict(OK)

        mock_run.side_effect = responses
        result = ensure_server()

        assert result["success"] is True, (
            f"source-file failure must not fail session creation, got {result}"
        )
        assert result["data"].startswith(BARE_SESSION_PREFIX)
