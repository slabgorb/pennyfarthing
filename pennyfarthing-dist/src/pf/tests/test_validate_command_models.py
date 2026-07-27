"""Command frontmatter model must match the tier map."""

from pathlib import Path
from unittest.mock import patch


def _cmd(tmp_path: Path, name: str, frontmatter: str) -> Path:
    p = tmp_path / f"{name}.md"
    p.write_text(f"---\n{frontmatter}\n---\nbody\n")
    return p


def _resolve(kind, name, root=None):
    mapping = {"dev": {"tier": "heavyweight", "alias": "opus"}}
    if name in mapping:
        return {"success": True, "data": mapping[name]}
    return {"success": False, "error": f"No {kind} tier mapping for '{name}'"}


def test_agent_command_missing_model_is_error(tmp_path: Path) -> None:
    from pf.validate.adapters.skill_command import validate_command_model

    p = _cmd(tmp_path, "pf-dev", "description: Developer")
    with patch("pf.validate.adapters.skill_command.resolve_model", side_effect=_resolve):
        errors = validate_command_model(p)
    assert any("model" in e for e in errors)


def test_agent_command_drifted_model_is_error(tmp_path: Path) -> None:
    from pf.validate.adapters.skill_command import validate_command_model

    p = _cmd(tmp_path, "pf-dev", "description: Developer\nmodel: sonnet")
    with patch("pf.validate.adapters.skill_command.resolve_model", side_effect=_resolve):
        errors = validate_command_model(p)
    assert any("opus" in e for e in errors)


def test_agent_command_matching_model_passes(tmp_path: Path) -> None:
    from pf.validate.adapters.skill_command import validate_command_model

    p = _cmd(tmp_path, "pf-dev", "description: Developer\nmodel: opus")
    with patch("pf.validate.adapters.skill_command.resolve_model", side_effect=_resolve):
        errors = validate_command_model(p)
    assert errors == []


def test_non_agent_command_is_ignored(tmp_path: Path) -> None:
    from pf.validate.adapters.skill_command import validate_command_model

    p = _cmd(tmp_path, "pf-sprint", "description: Sprint management")
    with patch("pf.validate.adapters.skill_command.resolve_model", side_effect=_resolve):
        errors = validate_command_model(p)
    assert errors == []
