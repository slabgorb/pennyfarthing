"""Tests for pf.model_tiers — central model tier map loader/resolver.

Spec: docs/superpowers/specs/2026-07-02-model-tiering-design.md (orchestrator).
"""

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from pf.model_tiers import (
    VALID_ALIASES,
    judge_alias,
    load_model_map,
    resolve_model,
    resolve_tier_alias,
    subagent_alias,
)

MINIMAL_MAP = {
    "tiers": {"judgment": "best", "heavyweight": "opus", "analytical": "sonnet", "mechanical": "haiku"},
    "agents": {"dev": "heavyweight", "architect": "judgment"},
    "subagents": {"reviewer-*": "analytical", "reviewer-preflight": "mechanical", "sm-*": "mechanical"},
    "judges": {"benchmark": "heavyweight"},
    "native_agents": "judgment",
}


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    """tmp project with a dist root holding models.yaml."""
    dist_root = tmp_path / "pennyfarthing-dist"
    dist_root.mkdir()
    (dist_root / "models.yaml").write_text(yaml.dump(MINIMAL_MAP))
    return tmp_path


def _patched(tmp_root: Path):
    return (
        patch("pf.model_tiers.get_dist_root", return_value=tmp_root / "pennyfarthing-dist"),
        patch("pf.model_tiers.load_pennyfarthing_config", return_value={}),
    )


class TestLoadModelMap:
    def test_loads_dist_models_yaml(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = load_model_map(dist)
        assert result["success"] is True
        assert result["data"]["tiers"]["heavyweight"] == "opus"

    def test_missing_file_fails_loudly(self, dist: Path) -> None:
        (dist / "pennyfarthing-dist" / "models.yaml").unlink()
        p1, p2 = _patched(dist)
        with p1, p2:
            result = load_model_map(dist)
        assert result["success"] is False
        assert "models.yaml" in result["error"]

    def test_config_local_override_merges_per_section(self, dist: Path) -> None:
        override = {"models": {"tiers": {"heavyweight": "sonnet"}}}
        p1 = patch("pf.model_tiers.get_dist_root", return_value=dist / "pennyfarthing-dist")
        p2 = patch("pf.model_tiers.load_pennyfarthing_config", return_value=override)
        with p1, p2:
            result = load_model_map(dist)
        assert result["data"]["tiers"]["heavyweight"] == "sonnet"
        assert result["data"]["tiers"]["judgment"] == "best"  # untouched keys survive

    def test_malformed_yaml_fails_loudly(self, dist: Path) -> None:
        (dist / "pennyfarthing-dist" / "models.yaml").write_text(
            "tiers: [judgment: best\n  - broken\n"
        )
        p1, p2 = _patched(dist)
        with p1, p2:
            result = load_model_map(dist)
        assert result["success"] is False
        assert "not valid YAML" in result["error"]

    def test_malformed_yaml_propagates_through_resolve_model(self, dist: Path) -> None:
        (dist / "pennyfarthing-dist" / "models.yaml").write_text(
            "tiers: [judgment: best\n  - broken\n"
        )
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("judge", "benchmark", dist)
        assert result["success"] is False
        assert "not valid YAML" in result["error"]

    def test_malformed_yaml_judge_alias_falls_back_no_raise(self, dist: Path) -> None:
        (dist / "pennyfarthing-dist" / "models.yaml").write_text(
            "tiers: [judgment: best\n  - broken\n"
        )
        p1, p2 = _patched(dist)
        with p1, p2:
            result = judge_alias("benchmark", dist)
        assert result == "opus"

    def test_yaml_list_payload_fails_with_mapping_error(self, dist: Path) -> None:
        (dist / "pennyfarthing-dist" / "models.yaml").write_text("- one\n- two\n- three\n")
        p1, p2 = _patched(dist)
        with p1, p2:
            result = load_model_map(dist)
        assert result["success"] is False
        assert "must be a YAML mapping" in result["error"]


class TestResolveTierAlias:
    def test_known_tier(self) -> None:
        result = resolve_tier_alias("mechanical", MINIMAL_MAP)
        assert result == {"success": True, "data": "haiku"}

    def test_unknown_tier_lists_valid_set(self) -> None:
        result = resolve_tier_alias("galactic", MINIMAL_MAP)
        assert result["success"] is False
        assert "analytical" in result["error"]


class TestResolveModel:
    def test_agent(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("agent", "dev", dist)
        assert result["data"] == {"tier": "heavyweight", "alias": "opus"}

    def test_subagent_exact_beats_glob(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("subagent", "reviewer-preflight", dist)
        assert result["data"]["alias"] == "haiku"  # exact 'mechanical', not glob 'analytical'

    def test_subagent_glob_match(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("subagent", "reviewer-security", dist)
        assert result["data"]["alias"] == "sonnet"

    def test_subagent_double_glob_is_error(self, dist: Path) -> None:
        bad = dict(MINIMAL_MAP)
        bad["subagents"] = {"reviewer-*": "analytical", "*-security": "mechanical"}
        (dist / "pennyfarthing-dist" / "models.yaml").write_text(yaml.dump(bad))
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("subagent", "reviewer-security", dist)
        assert result["success"] is False
        assert "multiple globs" in result["error"]

    def test_native(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("native", "architect", dist)
        assert result["data"]["alias"] == "best"

    def test_judge(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("judge", "benchmark", dist)
        assert result["data"]["alias"] == "opus"

    def test_unknown_name_fails(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("agent", "nonexistent", dist)
        assert result["success"] is False

    def test_unknown_kind_fails(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            result = resolve_model("wizard", "dev", dist)
        assert result["success"] is False


def test_valid_aliases_constant() -> None:
    assert VALID_ALIASES == {"haiku", "sonnet", "opus", "fable", "best", "inherit"}


class TestJudgeAlias:
    def test_resolves_from_map(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            assert judge_alias("benchmark", dist) == "opus"

    def test_judge_alias_fallback(self) -> None:
        with patch(
            "pf.model_tiers.resolve_model",
            return_value={"success": False, "error": "x"},
        ):
            assert judge_alias("benchmark") == "opus"


class TestSubagentAlias:
    def test_resolves_from_map(self, dist: Path) -> None:
        p1, p2 = _patched(dist)
        with p1, p2:
            assert subagent_alias("reviewer-preflight", dist) == "haiku"

    def test_subagent_alias_fallback(self) -> None:
        with patch(
            "pf.model_tiers.resolve_model",
            return_value={"success": False, "error": "x"},
        ):
            assert subagent_alias("nonexistent") == "sonnet"
