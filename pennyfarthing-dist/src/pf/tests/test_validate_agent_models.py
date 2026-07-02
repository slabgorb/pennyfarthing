"""Tests for agent validator model checks against the tier map."""

from pathlib import Path
from unittest.mock import patch


def _write_subagent(tmp_path: Path, name: str, model: str) -> Path:
    p = tmp_path / f"{name}.md"
    p.write_text(
        f"---\nname: {name}\ndescription: x\ntools: Read\nmodel: {model}\n---\n"
        "<arguments>\n| a | b | c |\n</arguments>\n<output>\nx\n</output>\n"
    )
    return p


def test_valid_models_includes_claude5_aliases() -> None:
    from pf.validate.adapters.agent import VALID_MODELS

    assert {"fable", "best", "inherit"} <= VALID_MODELS


def test_subagent_model_drift_from_map_is_error(tmp_path: Path) -> None:
    from pf.validate.adapters.agent import validate_subagent

    p = _write_subagent(tmp_path, "reviewer-preflight", "sonnet")
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors, warnings = validate_subagent(p)
    assert any("haiku" in e and "sonnet" in e for e in errors)


def test_subagent_matching_map_passes(tmp_path: Path) -> None:
    from pf.validate.adapters.agent import validate_subagent

    p = _write_subagent(tmp_path, "reviewer-preflight", "haiku")
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors, warnings = validate_subagent(p)
    assert not any("model" in e.lower() for e in errors)


def test_subagent_without_mapping_is_not_flagged(tmp_path: Path) -> None:
    from pf.validate.adapters.agent import validate_subagent

    p = _write_subagent(tmp_path, "some-new-helper", "sonnet")
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": False, "error": "No subagent tier mapping for 'some-new-helper'"},
    ):
        errors, warnings = validate_subagent(p)
    assert not any("tier map" in e for e in errors)


def test_native_agent_expected_model_comes_from_map(tmp_path: Path) -> None:
    from pf.validate.adapters.agent import validate_native_agent

    p = tmp_path / "architect.md"
    p.write_text(
        "---\nname: architect\ndescription: x\nmodel: opus\nallowed-tools:\n  - Read\n---\nbody\n"
    )
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "judgment", "alias": "best"}},
    ):
        errors, warnings = validate_native_agent(p)
    assert any("best" in w for w in warnings)


def test_spawn_template_matching_map_passes() -> None:
    from pf.validate.adapters.agent import validate_spawn_templates

    body = (
        "```yaml\n"
        "Task tool:\n"
        "  prompt: |\n"
        "    You are the testing-runner subagent.\n"
        "\n"
        '    model: "haiku"\n'
        "```\n"
    )
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors = validate_spawn_templates(body)
    assert errors == []


def test_spawn_template_drift_from_map_is_error() -> None:
    from pf.validate.adapters.agent import validate_spawn_templates

    body = (
        "```yaml\n"
        "Task tool:\n"
        "  prompt: |\n"
        "    You are the testing-runner subagent.\n"
        "\n"
        '    model: "sonnet"\n'
        "```\n"
    )
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors = validate_spawn_templates(body)
    assert any("testing-runner" in e and "haiku" in e for e in errors)
