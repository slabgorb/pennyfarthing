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


def _spawn_stanza(name: str, model: str) -> str:
    """Realistic stanza shape (from tea.md): model precedes the prompt line."""
    return (
        "Agent:\n"
        '  subagent_type: "general-purpose"\n'
        f'  model: "{model}"\n'
        "  run_in_background: true\n"
        f'  description: "{name} analysis"\n'
        "  prompt: |\n"
        f"    You are the {name} subagent.\n"
        "\n"
        f"    Read .pennyfarthing/agents/{name}.md for your instructions.\n"
        "\n"
        '    FILE_LIST: "{files}"\n'
    )


def test_spawn_template_model_before_name_drift_is_error() -> None:
    from pf.validate.adapters.agent import validate_spawn_templates

    body = "```yaml\n" + _spawn_stanza("testing-runner", "sonnet") + "```\n"
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors = validate_spawn_templates(body)
    assert any("testing-runner" in e and "sonnet" in e and "haiku" in e for e in errors)


def test_spawn_template_model_before_name_matching_passes() -> None:
    from pf.validate.adapters.agent import validate_spawn_templates

    body = "```yaml\n" + _spawn_stanza("testing-runner", "haiku") + "```\n"
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors = validate_spawn_templates(body)
    assert errors == []


def test_spawn_template_multi_stanza_block_pairs_per_stanza() -> None:
    """tea.md shape: one fenced block, three stanzas — only the drifted one flags."""
    from pf.validate.adapters.agent import validate_spawn_templates

    body = (
        "```yaml\n"
        + _spawn_stanza("simplify-reuse", "haiku")
        + "\n"
        + _spawn_stanza("simplify-quality", "sonnet")  # the drift
        + "\n"
        + _spawn_stanza("simplify-efficiency", "haiku")
        + "```\n"
    )
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors = validate_spawn_templates(body)
    assert len(errors) == 1
    assert "simplify-quality" in errors[0] and "sonnet" in errors[0]


def test_spawn_template_never_pairs_across_fenced_blocks() -> None:
    """A name in one block and a model: in another block must not pair."""
    from pf.validate.adapters.agent import validate_spawn_templates

    body = (
        "```yaml\n"
        "  prompt: |\n"
        "    You are the testing-runner subagent.\n"
        "```\n"
        "Some prose between blocks.\n"
        "```yaml\n"
        'model: "sonnet"\n'
        "```\n"
    )
    with patch(
        "pf.validate.adapters.agent.resolve_model",
        return_value={"success": True, "data": {"tier": "mechanical", "alias": "haiku"}},
    ):
        errors = validate_spawn_templates(body)
    assert errors == []
