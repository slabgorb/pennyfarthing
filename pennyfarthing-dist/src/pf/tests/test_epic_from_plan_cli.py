from click.testing import CliRunner

from pf.epic.cli import epic


def test_from_plan_is_registered():
    assert "from-plan" in epic.commands


def test_from_plan_help_runs():
    result = CliRunner().invoke(epic, ["from-plan", "--help"])
    assert result.exit_code == 0
    assert "1 story per" in result.output or "plan" in result.output.lower()
