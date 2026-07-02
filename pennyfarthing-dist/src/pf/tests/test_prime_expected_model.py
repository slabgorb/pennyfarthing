"""pf agent start emits expected_model and writes .session/.expected-model."""

import json
from pathlib import Path
from unittest.mock import patch


def test_expected_model_line_and_state_file(tmp_path: Path) -> None:
    from pf.prime.cli import main

    pf_dir = tmp_path / ".pennyfarthing"
    (pf_dir / "agents").mkdir(parents=True)
    (pf_dir / "agents" / "dev.md").write_text("# Dev Agent")

    with (
        patch("pf.prime.cli.get_project_root", return_value=tmp_path),
        patch(
            "pf.prime.cli.resolve_model",
            return_value={"success": True, "data": {"tier": "heavyweight", "alias": "opus"}},
        ),
    ):
        main(["--agent", "dev", "--no-workflow", "--no-register"])

    state_file = tmp_path / ".session" / ".expected-model"
    assert state_file.exists()
    state = json.loads(state_file.read_text())
    assert state["agent"] == "dev"
    assert state["alias"] == "opus"


def test_resolution_failure_is_silent(tmp_path: Path) -> None:
    from pf.prime.cli import main

    pf_dir = tmp_path / ".pennyfarthing"
    (pf_dir / "agents").mkdir(parents=True)
    (pf_dir / "agents" / "dev.md").write_text("# Dev Agent")

    with (
        patch("pf.prime.cli.get_project_root", return_value=tmp_path),
        patch(
            "pf.prime.cli.resolve_model",
            return_value={"success": False, "error": "models.yaml not found"},
        ),
    ):
        rc = main(["--agent", "dev", "--no-workflow", "--no-register"])

    assert rc == 0
    assert not (tmp_path / ".session" / ".expected-model").exists()


def test_expected_model_line_in_workflow_state_section(tmp_path: Path, capsys) -> None:
    """With workflow detection enabled, the Workflow State section prints the alias."""
    from pf.prime.cli import main

    pf_dir = tmp_path / ".pennyfarthing"
    (pf_dir / "agents").mkdir(parents=True)
    (pf_dir / "agents" / "dev.md").write_text("# Dev Agent")

    with (
        patch("pf.prime.cli.get_project_root", return_value=tmp_path),
        patch(
            "pf.prime.cli.resolve_model",
            return_value={"success": True, "data": {"tier": "heavyweight", "alias": "opus"}},
        ),
    ):
        rc = main(["--agent", "dev", "--no-register"])

    assert rc == 0
    captured = capsys.readouterr()
    assert "expected_model: opus" in captured.out
