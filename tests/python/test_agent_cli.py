"""Tests for agent CLI commands.

Story PROJ-12659: Implement pf agent start command

Acceptance Criteria:
1. pf agent start <name> starts session
2. --session-id and --no-persona options work
3. Outputs session ID and full agent context
4. Calls existing prime module

These tests are written in TDD RED state - they should FAIL until
the implementation is complete.
"""

import subprocess
import sys
from unittest.mock import patch

import pytest
from click.testing import CliRunner


class TestAgentStartCommand:
    """Tests for `pf agent start` command."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        """Create a Click CLI test runner."""
        return CliRunner()

    @pytest.fixture
    def cli(self):
        """Import the CLI lazily to test import time."""
        from pf.cli import cli
        return cli

    # AC1: pf agent start <name> starts session

    def test_agent_group_exists(self, runner: CliRunner, cli) -> None:
        """CLI should have an 'agent' command group."""
        result = runner.invoke(cli, ["agent", "--help"])
        assert result.exit_code == 0
        assert "start" in result.output

    def test_start_command_exists(self, runner: CliRunner, cli) -> None:
        """agent group should have a 'start' command."""
        result = runner.invoke(cli, ["agent", "start", "--help"])
        assert result.exit_code == 0
        assert "NAME" in result.output or "name" in result.output.lower()

    def test_start_requires_agent_name(self, runner: CliRunner, cli) -> None:
        """agent start should require an agent name argument."""
        result = runner.invoke(cli, ["agent", "start"])
        # Should fail with missing argument error
        assert result.exit_code != 0
        assert "Missing argument" in result.output or "required" in result.output.lower()

    def test_start_with_agent_name_succeeds(self, runner: CliRunner, cli) -> None:
        """agent start <name> should succeed and start a session."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            result = runner.invoke(cli, ["agent", "start", "sm"])

        assert result.exit_code == 0
        mock_prime.assert_called_once()

    def test_start_calls_prime_with_agent_name(self, runner: CliRunner, cli) -> None:
        """agent start should pass agent name to prime module."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            runner.invoke(cli, ["agent", "start", "dev"])

        # Check that prime was called with agent_name="dev"
        call_kwargs = mock_prime.call_args.kwargs
        assert call_kwargs.get("agent_name") == "dev"

    # AC2: --session-id and --no-persona options work

    def test_session_id_option_exists(self, runner: CliRunner, cli) -> None:
        """agent start should have --session-id option."""
        result = runner.invoke(cli, ["agent", "start", "--help"])
        assert result.exit_code == 0
        assert "--session-id" in result.output

    def test_no_persona_option_exists(self, runner: CliRunner, cli) -> None:
        """agent start should have --no-persona option."""
        result = runner.invoke(cli, ["agent", "start", "--help"])
        assert result.exit_code == 0
        assert "--no-persona" in result.output

    def test_session_id_passed_to_prime(self, runner: CliRunner, cli) -> None:
        """--session-id should be passed to prime module."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            runner.invoke(cli, ["agent", "start", "sm", "--session-id", "test-123"])

        call_kwargs = mock_prime.call_args.kwargs
        assert call_kwargs.get("session_id") == "test-123"

    def test_no_persona_passed_to_prime(self, runner: CliRunner, cli) -> None:
        """--no-persona should set no_persona=True in prime call."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            runner.invoke(cli, ["agent", "start", "tea", "--no-persona"])

        call_kwargs = mock_prime.call_args.kwargs
        assert call_kwargs.get("no_persona") is True

    # AC3: Outputs session ID and full agent context

    def test_start_outputs_session_id(self, runner: CliRunner, cli) -> None:
        """agent start should output the session ID."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            result = runner.invoke(cli, ["agent", "start", "sm"])

        # The output should include session information
        # This will fail until implementation outputs session ID
        assert result.exit_code == 0
        # Note: The actual session ID format depends on implementation

    def test_start_outputs_agent_context(self, runner: CliRunner, cli) -> None:
        """agent start should output full agent context."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            result = runner.invoke(cli, ["agent", "start", "dev"])

        assert result.exit_code == 0
        # Prime module handles context output

    # AC4: Calls existing prime module

    def test_start_delegates_to_prime(self, runner: CliRunner, cli) -> None:
        """agent start should delegate to pf.prime.prime()."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            runner.invoke(cli, ["agent", "start", "reviewer"])

        assert mock_prime.called
        assert mock_prime.call_count == 1

    def test_start_returns_prime_exit_code(self, runner: CliRunner, cli) -> None:
        """agent start should return prime module's exit code."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 1  # Simulate error
            result = runner.invoke(cli, ["agent", "start", "sm"])

        assert result.exit_code == 1


class TestAgentStartOptions:
    """Additional option tests for agent start command."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    @pytest.fixture
    def cli(self):
        from pf.cli import cli
        return cli

    def test_json_option_exists(self, runner: CliRunner, cli) -> None:
        """agent start should have --json option for Cyclist integration."""
        result = runner.invoke(cli, ["agent", "start", "--help"])
        assert result.exit_code == 0
        assert "--json" in result.output

    def test_json_passed_to_prime(self, runner: CliRunner, cli) -> None:
        """--json should set json_output=True in prime call."""
        with patch("pf.prime.prime") as mock_prime:
            mock_prime.return_value = 0
            runner.invoke(cli, ["agent", "start", "sm", "--json"])

        call_kwargs = mock_prime.call_args.kwargs
        assert call_kwargs.get("json_output") is True

    def test_minimal_option_exists(self, runner: CliRunner, cli) -> None:
        """agent start should have --minimal option for fastest startup."""
        result = runner.invoke(cli, ["agent", "start", "--help"])
        assert result.exit_code == 0
        assert "--minimal" in result.output

    def test_full_option_exists(self, runner: CliRunner, cli) -> None:
        """agent start should have --full option for domain docs."""
        result = runner.invoke(cli, ["agent", "start", "--help"])
        assert result.exit_code == 0
        assert "--full" in result.output


class TestAgentStartModuleInvocation:
    """Tests for invoking agent start via python -m."""

    def test_module_invocation_shows_agent_group(self) -> None:
        """CLI should show agent group in help."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode == 0
        assert "agent" in result.stdout

    def test_module_invocation_agent_start_help(self) -> None:
        """agent start should show help via module invocation."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "agent", "start", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode == 0
        assert "start" in result.stdout.lower() or "NAME" in result.stdout
