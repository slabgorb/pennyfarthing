"""Tests for the models.yaml validate adapter."""

from pathlib import Path
from unittest.mock import patch

import yaml

GOOD_MAP = {
    "tiers": {"judgment": "best", "heavyweight": "opus", "analytical": "sonnet", "mechanical": "haiku"},
    "agents": {"dev": "heavyweight"},
    "subagents": {"reviewer-*": "analytical"},
    "judges": {"benchmark": "heavyweight"},
    "native_agents": "judgment",
}


def _run(map_dict):
    from pf.validate.adapters.models import run

    with patch(
        "pf.validate.adapters.models.load_model_map",
        return_value={"success": True, "data": map_dict},
    ):
        return run(Path("/nonexistent"))


def test_good_map_passes() -> None:
    report = _run(GOOD_MAP)
    assert report.errors == []


def test_tier_alias_must_be_valid() -> None:
    bad = {**GOOD_MAP, "tiers": {**GOOD_MAP["tiers"], "judgment": "gpt-5"}}
    report = _run(bad)
    assert any("gpt-5" in e for e in report.errors)


def test_claude_full_name_allowed_as_tier_alias() -> None:
    ok = {**GOOD_MAP, "tiers": {**GOOD_MAP["tiers"], "judgment": "claude-fable-5"}}
    report = _run(ok)
    assert report.errors == []


def test_assignment_must_reference_known_tier() -> None:
    bad = {**GOOD_MAP, "agents": {"dev": "galactic"}}
    report = _run(bad)
    assert any("galactic" in e for e in report.errors)


def test_native_agents_must_reference_known_tier() -> None:
    bad = {**GOOD_MAP, "native_agents": "galactic"}
    report = _run(bad)
    assert any("native_agents" in e for e in report.errors)


def test_load_failure_is_error() -> None:
    from pf.validate.adapters.models import run

    with patch(
        "pf.validate.adapters.models.load_model_map",
        return_value={"success": False, "error": "models.yaml not found at /x"},
    ):
        report = run(Path("/nonexistent"))
    assert any("not found" in e for e in report.errors)


def test_registered_in_validators() -> None:
    from pf.validate.cli import VALIDATORS

    assert VALIDATORS["models"] == "pf.validate.adapters.models"
