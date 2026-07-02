"""Statusline persists the current model id for the advisory hook."""

from pathlib import Path


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
