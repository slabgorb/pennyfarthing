"""Tests for pf demo generate CLI command.

Story 146-1: pf demo generate CLI command + dry-run

These tests verify the CLI wrapper around the demo artifact generator
pipeline. The demo subpackage already has collector, classifier,
generator, mermaid, script_generator, and orchestrator modules.
This story adds the Click CLI entry point.
"""

from __future__ import annotations

from unittest.mock import patch

from click.testing import CliRunner

from pf.cli import cli


class TestDemoCommandRegistered:
    """AC1: `pf demo generate` command is registered in the CLI."""

    def test_demo_in_lazy_commands(self) -> None:
        """demo should be registered in the CLI lazy command registry."""
        from pf.cli import _LAZY_COMMANDS

        assert "demo" in _LAZY_COMMANDS, (
            "demo command not found in _LAZY_COMMANDS — "
            "add ('pf.demo.cli', 'demo') to the registry"
        )

    def test_demo_lazy_command_points_to_correct_module(self) -> None:
        """demo lazy command should import from pf.demo.cli."""
        from pf.cli import _LAZY_COMMANDS

        module_path, attr_name = _LAZY_COMMANDS["demo"]
        assert module_path == "pf.demo.cli"
        assert attr_name == "demo"

    def test_demo_group_help(self) -> None:
        """pf demo --help should show the demo group help."""
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "--help"])
        assert result.exit_code == 0
        assert "generate" in result.output.lower(), (
            "demo group help should mention the generate subcommand"
        )

    def test_demo_generate_subcommand_exists(self) -> None:
        """pf demo generate --help should show generate command help."""
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "--help"])
        assert result.exit_code == 0, (
            f"demo generate --help failed with exit code {result.exit_code}: "
            f"{result.output}"
        )


class TestDemoGenerateRequiresStoryId:
    """The generate command must accept a STORY_ID argument."""

    def test_generate_without_story_id_fails(self) -> None:
        """pf demo generate (no args) should fail with usage error."""
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate"])
        assert result.exit_code != 0, (
            "generate without STORY_ID should fail"
        )

    def test_generate_help_shows_story_id_argument(self) -> None:
        """Help text should document the STORY_ID argument."""
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "--help"])
        assert result.exit_code == 0
        assert "story_id" in result.output.lower() or "STORY_ID" in result.output, (
            "generate help should document the STORY_ID argument"
        )


class TestDryRunFlag:
    """AC2: Command accepts --dry-run flag."""

    def test_generate_help_shows_dry_run_option(self) -> None:
        """--help should document the --dry-run flag."""
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "--help"])
        assert result.exit_code == 0
        assert "--dry-run" in result.output, (
            "generate help should document the --dry-run flag"
        )

    @patch("pf.demo.cli.generate")
    def test_dry_run_flag_passed_to_orchestrator(self, mock_generate) -> None:
        """--dry-run should pass dry_run=True to the orchestrator."""
        mock_generate.return_value = {
            "success": True,
            "data": {"output_dir": "/tmp/demo", "files": []},
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "--dry-run", "42-1"])
        assert result.exit_code == 0
        mock_generate.assert_called_once()
        call_kwargs = mock_generate.call_args
        # Check dry_run was passed as True
        assert call_kwargs.kwargs.get("dry_run") is True or (
            len(call_kwargs.args) >= 2 and call_kwargs.args[1] is True
        ), "dry_run=True should be passed to orchestrator.generate()"


class TestDryRunOutput:
    """AC3: Dry-run mode outputs what would be generated without side effects."""

    @patch("pf.demo.cli.generate")
    def test_dry_run_shows_plan(self, mock_generate) -> None:
        """Dry-run should output the plan of what would be generated."""
        mock_generate.return_value = {
            "success": True,
            "data": {
                "output_dir": "sprint/demos/42-1",
                "files": [],
            },
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "--dry-run", "42-1"])
        assert result.exit_code == 0
        # Dry-run output should indicate it's a dry run
        output_lower = result.output.lower()
        assert "dry" in output_lower or "would" in output_lower or "plan" in output_lower, (
            "Dry-run output should indicate no files were written"
        )

    @patch("pf.demo.cli.generate")
    def test_dry_run_shows_output_directory(self, mock_generate) -> None:
        """Dry-run should show where files would be written."""
        mock_generate.return_value = {
            "success": True,
            "data": {
                "output_dir": "sprint/demos/42-1",
                "files": [],
            },
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "--dry-run", "42-1"])
        assert result.exit_code == 0
        assert "sprint/demos/42-1" in result.output, (
            "Dry-run should show the output directory"
        )


class TestActualExecution:
    """AC5: Tests verify actual execution path."""

    @patch("pf.demo.cli.generate")
    def test_generate_calls_orchestrator(self, mock_generate) -> None:
        """Generate should call the orchestrator's generate function."""
        mock_generate.return_value = {
            "success": True,
            "data": {
                "output_dir": "sprint/demos/42-1",
                "files": ["sprint/demos/42-1/narrative.md"],
            },
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "42-1"])
        assert result.exit_code == 0
        mock_generate.assert_called_once()

    @patch("pf.demo.cli.generate")
    def test_generate_without_dry_run_passes_false(self, mock_generate) -> None:
        """Without --dry-run, dry_run=False should be passed."""
        mock_generate.return_value = {
            "success": True,
            "data": {
                "output_dir": "sprint/demos/42-1",
                "files": ["sprint/demos/42-1/narrative.md"],
            },
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "42-1"])
        assert result.exit_code == 0
        call_kwargs = mock_generate.call_args
        # dry_run should be False (or not set, defaulting to False)
        dry_run_value = call_kwargs.kwargs.get("dry_run", False)
        if not dry_run_value and call_kwargs.args:
            # positional: generate(story_id, dry_run=False, ...)
            dry_run_value = call_kwargs.args[1] if len(call_kwargs.args) > 1 else False
        assert dry_run_value is False or dry_run_value is None, (
            "Without --dry-run, dry_run should be False"
        )

    @patch("pf.demo.cli.generate")
    def test_generate_shows_output_files(self, mock_generate) -> None:
        """Successful generation should list the files created."""
        mock_generate.return_value = {
            "success": True,
            "data": {
                "output_dir": "sprint/demos/42-1",
                "files": [
                    "sprint/demos/42-1/narrative.md",
                    "sprint/demos/42-1/demo-script.md",
                    "sprint/demos/42-1/metadata.yaml",
                ],
            },
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "42-1"])
        assert result.exit_code == 0
        # Should show at least some file info
        assert "narrative" in result.output.lower() or "files" in result.output.lower() or "generated" in result.output.lower(), (
            "Successful generation should report what was created"
        )


class TestErrorHandling:
    """Error cases should be handled gracefully."""

    @patch("pf.demo.cli.generate")
    def test_orchestrator_failure_shows_error(self, mock_generate) -> None:
        """When orchestrator returns failure, CLI should show the error."""
        mock_generate.return_value = {
            "success": False,
            "error": "story_id is required",
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "nonexistent"])
        assert result.exit_code != 0, (
            "CLI should exit non-zero when orchestrator fails"
        )
        assert "error" in result.output.lower() or "story_id" in result.output.lower(), (
            "CLI should display the error message from orchestrator"
        )

    @patch("pf.demo.cli.generate")
    def test_orchestrator_warnings_shown(self, mock_generate) -> None:
        """Warnings from orchestrator should be displayed."""
        mock_generate.return_value = {
            "success": True,
            "data": {
                "output_dir": "sprint/demos/42-1",
                "files": ["sprint/demos/42-1/narrative.md"],
                "warnings": ["diagram: mmdc not installed"],
            },
        }
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "42-1"])
        assert result.exit_code == 0
        assert "warning" in result.output.lower() or "diagram" in result.output.lower(), (
            "Warnings from orchestrator should be displayed to user"
        )


class TestCorrectionsFlag:
    """The --corrections flag should pass developer feedback to orchestrator."""

    def test_generate_help_shows_corrections_option(self) -> None:
        """--help should document the --corrections flag."""
        runner = CliRunner()
        result = runner.invoke(cli, ["demo", "generate", "--help"])
        assert result.exit_code == 0
        assert "--corrections" in result.output, (
            "generate help should document the --corrections flag"
        )

    @patch("pf.demo.cli.generate")
    def test_corrections_passed_to_orchestrator(self, mock_generate) -> None:
        """--corrections value should be passed to orchestrator."""
        mock_generate.return_value = {
            "success": True,
            "data": {"output_dir": "/tmp/demo", "files": []},
        }
        runner = CliRunner()
        result = runner.invoke(
            cli, ["demo", "generate", "--corrections", "Fix the diagram", "42-1"]
        )
        assert result.exit_code == 0
        call_kwargs = mock_generate.call_args
        corrections_value = call_kwargs.kwargs.get("corrections")
        assert corrections_value == "Fix the diagram", (
            "corrections should be passed through to orchestrator"
        )
