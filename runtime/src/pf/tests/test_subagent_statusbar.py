"""Tests for subagent statusbar suppression.

Story 148-16: Disable CLI statusbar for subagents — prevent status line noise
in agent panes.

Tests verify:
- Main pane is recorded on first SessionStart
- Subsequent sessions in different tmux panes get PF_SUBAGENT=1
- Statusline hook exits early when PF_SUBAGENT is set
- main-pane file is cleaned up on main session stop
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest


# =============================================================================
# Session Start — subagent detection
# =============================================================================


def _setup_project(tmp_path: Path) -> Path:
    """Create minimal project structure for testing."""
    session_dir = tmp_path / ".session"
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "agents").mkdir(exist_ok=True)
    return tmp_path


def test_main_pane_recorded_on_first_start(tmp_path: Path) -> None:
    """First SessionStart in tmux records main-pane file."""
    project_dir = _setup_project(tmp_path)

    from pf.hooks.session_start import _detect_and_mark_subagent

    env_file = tmp_path / "claude_env"
    env_file.write_text("")

    with patch.dict(os.environ, {"TMUX_PANE": "%0", "CLAUDE_ENV_FILE": str(env_file)}):
        _detect_and_mark_subagent(project_dir)

    main_pane = project_dir / ".session" / "main-pane"
    assert main_pane.exists()
    assert main_pane.read_text().strip() == "%0"
    # No PF_SUBAGENT written for main pane
    assert "PF_SUBAGENT" not in env_file.read_text()


def test_different_pane_marked_as_subagent(tmp_path: Path) -> None:
    """SessionStart in a different tmux pane writes PF_SUBAGENT to env file."""
    project_dir = _setup_project(tmp_path)

    from pf.hooks.session_start import _detect_and_mark_subagent

    # Record main pane
    main_pane = project_dir / ".session" / "main-pane"
    main_pane.write_text("%0")

    env_file = tmp_path / "claude_env"
    env_file.write_text("")

    with patch.dict(os.environ, {"TMUX_PANE": "%5", "CLAUDE_ENV_FILE": str(env_file)}):
        _detect_and_mark_subagent(project_dir)

    content = env_file.read_text()
    assert 'PF_SUBAGENT="1"' in content


def test_same_pane_not_marked_as_subagent(tmp_path: Path) -> None:
    """SessionStart in the same tmux pane as main does NOT set PF_SUBAGENT."""
    project_dir = _setup_project(tmp_path)

    from pf.hooks.session_start import _detect_and_mark_subagent

    main_pane = project_dir / ".session" / "main-pane"
    main_pane.write_text("%0")

    env_file = tmp_path / "claude_env"
    env_file.write_text("")

    with patch.dict(os.environ, {"TMUX_PANE": "%0", "CLAUDE_ENV_FILE": str(env_file)}):
        _detect_and_mark_subagent(project_dir)

    assert "PF_SUBAGENT" not in env_file.read_text()


def test_no_tmux_pane_skips_detection(tmp_path: Path) -> None:
    """Without TMUX_PANE, detection is skipped entirely."""
    project_dir = _setup_project(tmp_path)

    from pf.hooks.session_start import _detect_and_mark_subagent

    env = {k: v for k, v in os.environ.items() if k != "TMUX_PANE"}
    with patch.dict(os.environ, env, clear=True):
        _detect_and_mark_subagent(project_dir)

    assert not (project_dir / ".session" / "main-pane").exists()


# =============================================================================
# Statusline — PF_SUBAGENT suppression
# =============================================================================


def test_statusline_suppressed_with_pf_subagent(tmp_path: Path) -> None:
    """Statusline hook exits early when PF_SUBAGENT is set."""
    from pf.hooks.statusline import main as statusline_main

    input_data = json.dumps({
        "workspace": {"current_dir": str(tmp_path)},
        "session_id": "test-session",
        "model": "claude-sonnet-4-20250514",
        "context_window": {"current_usage": {"input_tokens": 1000}, "context_window_size": 200000},
    })

    with (
        patch("sys.stdin") as mock_stdin,
        patch.dict(os.environ, {"PF_SUBAGENT": "1", "CLAUDE_PROJECT_DIR": str(tmp_path)}),
        pytest.raises(SystemExit) as exc_info,
    ):
        mock_stdin.read.return_value = input_data
        statusline_main()

    assert exc_info.value.code == 0


def test_statusline_not_suppressed_without_pf_subagent(tmp_path: Path) -> None:
    """Statusline hook renders output when PF_SUBAGENT is not set."""
    from pf.hooks.statusline import main as statusline_main

    input_data = json.dumps({
        "workspace": {"current_dir": str(tmp_path)},
        "session_id": "test-session",
        "model": "claude-sonnet-4-20250514",
        "context_window": {"current_usage": {"input_tokens": 1000}, "context_window_size": 200000},
    })

    # Ensure PF_SUBAGENT is NOT set
    env = {k: v for k, v in os.environ.items() if k != "PF_SUBAGENT"}
    env["CLAUDE_PROJECT_DIR"] = str(tmp_path)

    captured_output = []
    with (
        patch("sys.stdin") as mock_stdin,
        patch("builtins.print", side_effect=lambda *a, **kw: captured_output.append(a)),
        patch.dict(os.environ, env, clear=True),
        pytest.raises(SystemExit) as exc_info,
    ):
        mock_stdin.read.return_value = input_data
        statusline_main()

    assert exc_info.value.code == 0
    # Should have printed something (the statusline output)
    assert len(captured_output) > 0


# =============================================================================
# Session Stop — main-pane cleanup
# =============================================================================


def test_main_session_stop_cleans_main_pane(tmp_path: Path) -> None:
    """Main session stop removes .session/main-pane file."""
    project_dir = _setup_project(tmp_path)
    main_pane = project_dir / ".session" / "main-pane"
    main_pane.write_text("%0")

    from pf.hooks.session_stop import main as stop_main

    input_data = json.dumps({"session_id": "test-session"})

    # Main session: PF_SUBAGENT not set
    env = {k: v for k, v in os.environ.items() if k != "PF_SUBAGENT"}
    env["CLAUDE_PROJECT_DIR"] = str(project_dir)

    with (
        patch("sys.stdin") as mock_stdin,
        patch.dict(os.environ, env, clear=True),
        pytest.raises(SystemExit),
    ):
        mock_stdin.read.return_value = input_data
        stop_main()

    assert not main_pane.exists()


def test_subagent_stop_preserves_main_pane(tmp_path: Path) -> None:
    """Subagent session stop does NOT remove .session/main-pane."""
    project_dir = _setup_project(tmp_path)
    main_pane = project_dir / ".session" / "main-pane"
    main_pane.write_text("%0")

    from pf.hooks.session_stop import main as stop_main

    input_data = json.dumps({"session_id": "test-session"})

    with (
        patch("sys.stdin") as mock_stdin,
        patch.dict(os.environ, {"PF_SUBAGENT": "1", "CLAUDE_PROJECT_DIR": str(project_dir)}),
        pytest.raises(SystemExit),
    ):
        mock_stdin.read.return_value = input_data
        stop_main()

    assert main_pane.exists()
    assert main_pane.read_text().strip() == "%0"
