"""Advisory model-tier hook — nudges once per phase on model/tier mismatch."""

import json
from pathlib import Path


def _setup(tmp_path: Path, expected_alias: str, current_id: str) -> None:
    session = tmp_path / ".session"
    session.mkdir()
    (session / ".expected-model").write_text(
        json.dumps({"agent": "dev", "alias": expected_alias, "story_id": "1-1", "phase": "green"})
    )
    runtime = tmp_path / ".pennyfarthing" / ".runtime"
    runtime.mkdir(parents=True)
    (runtime / "current-model").write_text(current_id)


def test_alias_satisfied_by_model_id() -> None:
    from pf.hooks.advisory_model_tier import _alias_satisfied

    assert _alias_satisfied("opus", "claude-opus-4-8")
    assert _alias_satisfied("sonnet", "claude-sonnet-5")
    assert _alias_satisfied("haiku", "claude-haiku-4-5-20251001")
    assert _alias_satisfied("fable", "claude-fable-5")
    assert _alias_satisfied("best", "claude-fable-5")
    assert _alias_satisfied("best", "claude-opus-4-8")  # best = fable-or-opus
    assert not _alias_satisfied("opus", "claude-fable-5")
    assert not _alias_satisfied("best", "claude-sonnet-5")
    assert _alias_satisfied("inherit", "claude-anything")  # inherit never nags


def test_mismatch_emits_advisory_once(tmp_path: Path) -> None:
    from pf.hooks.advisory_model_tier import check

    _setup(tmp_path, "opus", "claude-fable-5")
    out1 = check(tmp_path)
    assert out1 is not None
    assert "opus" in out1 and "fable" in out1
    out2 = check(tmp_path)  # same key — already advised
    assert out2 is None


def test_model_switch_rearms_advisory(tmp_path: Path) -> None:
    """Key includes the current model — a /model switch re-arms the nudge."""
    from pf.hooks.advisory_model_tier import check

    _setup(tmp_path, "opus", "claude-fable-5")
    out1 = check(tmp_path)
    assert out1 is not None and "claude-fable-5" in out1
    assert check(tmp_path) is None  # same key — already advised

    # Session switches to a DIFFERENT still-mismatching model.
    (tmp_path / ".pennyfarthing" / ".runtime" / "current-model").write_text("claude-haiku-4-5")
    out2 = check(tmp_path)
    assert out2 is not None
    assert "claude-haiku-4-5" in out2  # new model named in the new advisory
    assert check(tmp_path) is None  # and the new key sticks


def test_match_is_silent(tmp_path: Path) -> None:
    from pf.hooks.advisory_model_tier import check

    _setup(tmp_path, "opus", "claude-opus-4-8")
    assert check(tmp_path) is None


def test_missing_state_files_are_silent(tmp_path: Path) -> None:
    from pf.hooks.advisory_model_tier import check

    assert check(tmp_path) is None


def test_registered_in_dispatch() -> None:
    from pf.hooks.dispatch import DISPATCH_REGISTRY

    names = [entry[0] for entry in DISPATCH_REGISTRY["PreToolUse"]]
    assert "advisory-model-tier" in names
