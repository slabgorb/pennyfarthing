"""Statusline persists the current model id for the advisory hook."""

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest


def test_persist_model_writes_runtime_file(tmp_path: Path) -> None:
    from pf.hooks.statusline import _persist_model

    _persist_model({"model": {"id": "claude-fable-5"}}, tmp_path)
    f = tmp_path / ".pennyfarthing" / ".runtime" / "current-model"
    assert f.read_text() == "claude-fable-5"


def test_persist_model_string_shape(tmp_path: Path) -> None:
    from pf.hooks.statusline import _persist_model

    _persist_model({"model": "claude-opus-4-8"}, tmp_path)
    f = tmp_path / ".pennyfarthing" / ".runtime" / "current-model"
    assert f.read_text() == "claude-opus-4-8"


def test_persist_model_failsoft_on_missing_model(tmp_path: Path) -> None:
    from pf.hooks.statusline import _persist_model

    _persist_model({}, tmp_path)  # must not raise
    assert not (tmp_path / ".pennyfarthing" / ".runtime" / "current-model").exists()


# =============================================================================
# Subagent renders must NOT clobber the main session's model file
# =============================================================================


def test_persist_model_skipped_for_subagent(tmp_path: Path) -> None:
    """PF_SUBAGENT renders skip the write — file holds the MAIN session's model."""
    from pf.hooks.statusline import _persist_model

    with patch.dict(os.environ, {"PF_SUBAGENT": "1"}):
        _persist_model({"model": {"id": "claude-haiku-4-5"}}, tmp_path)

    assert not (tmp_path / ".pennyfarthing" / ".runtime" / "current-model").exists()


def test_render_path_subagent_does_not_write(tmp_path: Path) -> None:
    """Full render path with PF_SUBAGENT set leaves the runtime file untouched."""
    from pf.hooks.statusline import main as statusline_main

    input_data = json.dumps({
        "workspace": {"current_dir": str(tmp_path)},
        "session_id": "sub-session",
        "model": {"id": "claude-haiku-4-5"},
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
    assert not (tmp_path / ".pennyfarthing" / ".runtime" / "current-model").exists()


def test_render_path_writes_when_statusbar_display_disabled(tmp_path: Path) -> None:
    """workflow.statusbar: false suppresses the display but still persists the model."""
    from pf.hooks.statusline import main as statusline_main

    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir(parents=True)
    (pf_dir / "config.local.yaml").write_text("workflow:\n  statusbar: false\n")

    input_data = json.dumps({
        "workspace": {"current_dir": str(tmp_path)},
        "session_id": "main-session",
        "model": {"id": "claude-fable-5"},
        "context_window": {"current_usage": {"input_tokens": 1000}, "context_window_size": 200000},
    })

    # Main session: PF_SUBAGENT not set
    env = {k: v for k, v in os.environ.items() if k != "PF_SUBAGENT"}
    env["CLAUDE_PROJECT_DIR"] = str(tmp_path)

    captured_output: list[tuple] = []
    with (
        patch("sys.stdin") as mock_stdin,
        patch("builtins.print", side_effect=lambda *a, **kw: captured_output.append(a)),
        patch.dict(os.environ, env, clear=True),
        pytest.raises(SystemExit) as exc_info,
    ):
        mock_stdin.read.return_value = input_data
        statusline_main()

    assert exc_info.value.code == 0
    # Display suppressed (nothing printed) ...
    assert not captured_output
    # ... but the model file is still written for the advisory hook.
    f = tmp_path / ".pennyfarthing" / ".runtime" / "current-model"
    assert f.read_text() == "claude-fable-5"
