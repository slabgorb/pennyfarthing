"""Tests for Story 147-10: Summon agent into saddle from running session.

Covers:
  AC1: `pf saddle summon <agent>` CLI command exists and launches agent in saddle pane
  AC2: Summoned agent receives full `pf agent start` context (not a subagent)
  AC3: Optional `--task` flag to pass task description to the summoned agent
  AC4: Saddle state tracks the summoned agent (reuses existing state management)
  AC5: Works when tmux/Frame is running; clear error when not
  SEC: CWE-78 shell injection — task must be in separate quoting context (Reviewer round 3)
"""

from __future__ import annotations

import json
import shlex
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.saddle.cli import saddle
from pf.saddle.core import VALID_AGENTS, summon_agent


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_project(tmp_path):
    """Create a minimal project root with .pennyfarthing dir."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    return tmp_path


@pytest.fixture
def cli_runner():
    """Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def mock_tmux():
    """Mock tmux panes module so tests don't need a real tmux session."""
    live_panes = [
        {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
    ]

    def list_live_panes_side_effect(session):
        return {"success": True, "data": list(live_panes)}

    def split_pane_side_effect(session, target, direction="v", size_pct=50, cwd=None):
        live_panes.append({"pane_id": "%99", "title": "Saddle", "command": "zsh", "width": 200, "height": 15})
        return {"success": True, "data": "%99\n"}

    with patch("pf.tmux.panes.is_tmux_running", return_value=True), \
         patch("pf.tmux.panes.get_session_name", return_value={"success": True, "data": "pf-test-0"}), \
         patch("pf.tmux.panes.list_live_panes", side_effect=list_live_panes_side_effect), \
         patch("pf.tmux.panes.split_pane", side_effect=split_pane_side_effect), \
         patch("pf.tmux.panes.set_pane_title"), \
         patch("pf.tmux.panes.send_keys", return_value={"success": True, "data": ""}):
        yield


# ===========================================================================
# AC1: `pf saddle summon <agent>` CLI command
# ===========================================================================


class TestSummonCLICommand:
    """pf saddle summon <agent> must exist and launch agent in saddle pane."""

    def test_summon_command_exists_in_saddle_group(self):
        """The summon command must be registered in the saddle CLI group."""
        command_names = [cmd for cmd in saddle.commands]
        assert "summon" in command_names, (
            f"'summon' not in saddle commands: {command_names}"
        )

    def test_summon_requires_agent_argument(self, cli_runner):
        """pf saddle summon with no agent argument should fail."""
        result = cli_runner.invoke(saddle, ["summon"])
        assert result.exit_code != 0

    def test_summon_with_valid_agent_succeeds(self, cli_runner, tmp_project, mock_tmux):
        """pf saddle summon dev should succeed and return agent info."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project):
            result = cli_runner.invoke(saddle, ["summon", "dev"])
            assert result.exit_code == 0, f"Exit {result.exit_code}: {result.output}"
            parsed = json.loads(result.output)
            assert parsed["success"] is True
            assert parsed["data"]["agent"] == "dev"

    def test_summon_with_invalid_agent_fails(self, cli_runner, tmp_project):
        """pf saddle summon nonexistent should fail with clear error."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project):
            result = cli_runner.invoke(saddle, ["summon", "nonexistent"])
            assert result.exit_code != 0

    def test_summon_outputs_json(self, cli_runner, tmp_project, mock_tmux):
        """Summon output must be valid JSON following result dict contract."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project):
            result = cli_runner.invoke(saddle, ["summon", "tea"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert "success" in parsed
            assert "data" in parsed


# ===========================================================================
# AC2: Summoned agent receives full `pf agent start` context
# ===========================================================================


class TestSummonUsesFullPrimeContext:
    """summon_agent must build a command that gives the agent full prime output,
    not a stripped-down /pf-{agent} skill invocation."""

    def test_summon_command_uses_claude_with_prompt(self, tmp_project, mock_tmux):
        """The command sent to the saddle pane should use `claude` with a prompt
        that includes agent activation, not just `/pf-{agent}`."""
        result = summon_agent("dev", project_root=tmp_project)
        assert result["success"] is True
        command = result["data"]["command"]
        # Should use claude with a prompt flag (-p or --prompt), not just /pf-dev
        assert "claude" in command.lower()
        # The command should NOT be just "claude /pf-dev" (that's start_agent's job)
        assert command != "claude /pf-dev"

    def test_summon_command_includes_agent_activation(self, tmp_project, mock_tmux):
        """The prompt/command must include the agent name for activation."""
        result = summon_agent("reviewer", project_root=tmp_project)
        assert result["success"] is True
        command = result["data"]["command"]
        assert "reviewer" in command.lower()

    def test_summon_differs_from_start_agent(self, tmp_project, mock_tmux):
        """summon_agent must produce a different command than start_agent."""
        from pf.saddle.core import start_agent

        summon_result = summon_agent("dev", project_root=tmp_project)
        # Reset state so start_agent works
        from pf.saddle.core import _load_state, _save_state
        state = _load_state(tmp_project)
        state["active"] = False
        state["agent"] = None
        _save_state(tmp_project, state)

        start_result = start_agent("dev", project_root=tmp_project)

        assert summon_result["success"] is True
        assert start_result["success"] is True
        assert summon_result["data"]["command"] != start_result["data"]["command"], (
            "summon_agent should produce a different command than start_agent"
        )


# ===========================================================================
# AC3: Optional `--task` flag
# ===========================================================================


class TestSummonTaskFlag:
    """Optional --task flag passes task description to the summoned agent."""

    def test_summon_without_task_succeeds(self, tmp_project, mock_tmux):
        """summon_agent works without a task — just activates the agent."""
        result = summon_agent("dev", project_root=tmp_project)
        assert result["success"] is True
        assert result["data"]["agent"] == "dev"

    def test_summon_with_task_includes_task_in_command(self, tmp_project, mock_tmux):
        """When task is provided, it must appear in the command sent to saddle,
        in a separate quoting context OUTSIDE the double-quoted $() section."""
        task = "Fix the failing Ruff CI check"
        result = summon_agent("dev", project_root=tmp_project, task=task)
        assert result["success"] is True
        command = result["data"]["command"]
        # The double-quoted section must CLOSE before the task.
        # Safe pattern: ...Your task: "<shlex-quoted-task>
        # shlex.quote wraps in single quotes at the TOP level where they work.
        assert f'Your task: "{shlex.quote(task)}' in command, (
            f"Task not in separate quoting context outside double quotes: {command}"
        )

    def test_summon_with_task_returns_task_in_data(self, tmp_project, mock_tmux):
        """Result data should include the task for visibility."""
        result = summon_agent("dev", project_root=tmp_project, task="Add error handling")
        assert result["success"] is True
        assert result["data"].get("task") == "Add error handling"

    def test_summon_cli_task_flag(self, cli_runner, tmp_project, mock_tmux):
        """CLI: pf saddle summon dev --task 'Fix CI' should pass task through."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project):
            result = cli_runner.invoke(
                saddle, ["summon", "dev", "--task", "Fix CI"]
            )
            assert result.exit_code == 0, f"Exit {result.exit_code}: {result.output}"
            parsed = json.loads(result.output)
            assert parsed["success"] is True
            assert parsed["data"].get("task") == "Fix CI"

    def test_summon_task_with_special_characters(self, tmp_project, mock_tmux):
        """Task descriptions with quotes and special chars must be in separate quoting context."""
        task = "Fix the 'broken' test in `test_foo.py` — it's failing"
        result = summon_agent("dev", project_root=tmp_project, task=task)
        assert result["success"] is True
        # The task should survive round-trip without mangling
        assert result["data"].get("task") == task
        # The task must be OUTSIDE the double-quoted $() section
        command = result["data"]["command"]
        assert f'Your task: "{shlex.quote(task)}' in command, (
            f"Task with shell metacharacters not in separate quoting context: {command}"
        )

    def test_summon_empty_task_treated_as_no_task(self, tmp_project, mock_tmux):
        """Empty string task should behave the same as no task."""
        result = summon_agent("dev", project_root=tmp_project, task="")
        assert result["success"] is True
        # Command should not contain empty task artifacts
        command = result["data"]["command"]
        assert '""' not in command  # No empty string in command


# ===========================================================================
# SEC: CWE-78 — Shell injection via task parameter (Reviewer round 2)
# ===========================================================================


class TestSummonShellSafety:
    """CWE-78: Task parameter reaches tmux send_keys → shell execution.

    shlex.quote() wraps the task in single quotes, BUT single quotes inside
    double quotes are LITERAL — they do NOT prevent shell expansion. Proof:
        $ echo "Your task: '$(echo INJECTED)'"
        Your task: 'INJECTED'
    The $() executed despite the single quotes.

    The fix: close the double-quoted section BEFORE the task so shlex.quote()
    operates at the TOP quoting level where single quotes ARE protective:
        claude -p "$(pf agent start dev)\\n\\nYour task: "'safe-task'"
    Shell sees: "...Your task: " (double-quoted) + 'safe-task' (single-quoted, safe).
    """

    def _assert_task_outside_dquotes(self, command: str, task: str, label: str):
        """Assert the shlex-quoted task appears AFTER the closing double quote.

        Safe:   ...Your task: "<shlex.quote(task)>  (dquote closes before task)
        BROKEN: ...Your task: <shlex.quote(task)>"  (task inside dquotes — useless)
        """
        expected = f'Your task: "{shlex.quote(task)}'
        assert expected in command, (
            f"[{label}] Task is inside the double-quoted $() section — "
            f"single quotes provide NO protection in this context.\n"
            f"Expected pattern: ...Your task: \"<shlex-quoted-task>\n"
            f"Command: {command}"
        )

    def test_task_with_double_quotes_is_shell_safe(self, tmp_project, mock_tmux):
        """A task containing double quotes must be outside the dquoted section."""
        task = 'Fix the "broken" test'
        result = summon_agent("dev", project_root=tmp_project, task=task)
        assert result["success"] is True
        self._assert_task_outside_dquotes(result["data"]["command"], task, "double-quotes")

    def test_task_with_command_substitution_is_shell_safe(self, tmp_project, mock_tmux):
        """$(...) in task must NOT execute — task must be outside dquoted section.

        Bug: shlex.quote("$(rm -rf /)") → '$(rm -rf /)' but inside "..." the
        single quotes are decorative and $() still expands.
        """
        task = "$(echo PWNED)"
        result = summon_agent("dev", project_root=tmp_project, task=task)
        assert result["success"] is True
        self._assert_task_outside_dquotes(result["data"]["command"], task, "cmd-substitution")

    def test_task_with_backtick_expansion_is_shell_safe(self, tmp_project, mock_tmux):
        """Backtick expansion in task must NOT execute."""
        task = "`echo PWNED`"
        result = summon_agent("dev", project_root=tmp_project, task=task)
        assert result["success"] is True
        self._assert_task_outside_dquotes(result["data"]["command"], task, "backticks")

    def test_task_with_semicolon_injection_is_shell_safe(self, tmp_project, mock_tmux):
        """Semicolons in task must not allow command chaining."""
        task = "fix tests; rm -rf /"
        result = summon_agent("dev", project_root=tmp_project, task=task)
        assert result["success"] is True
        self._assert_task_outside_dquotes(result["data"]["command"], task, "semicolons")

    def test_task_with_newline_injection_is_shell_safe(self, tmp_project, mock_tmux):
        """Newlines in task must not inject additional tmux commands."""
        task = "fix tests\nrm -rf /"
        result = summon_agent("dev", project_root=tmp_project, task=task)
        assert result["success"] is True
        self._assert_task_outside_dquotes(result["data"]["command"], task, "newlines")

    def test_send_keys_receives_safe_command(self, tmp_project):
        """Verify send_keys receives a command with the task OUTSIDE double quotes."""
        live_panes = [
            {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
        ]

        def list_live_panes_side_effect(session):
            return {"success": True, "data": list(live_panes)}

        def split_pane_side_effect(session, target, direction="v", size_pct=50, cwd=None):
            live_panes.append({"pane_id": "%99", "title": "Saddle", "command": "zsh", "width": 200, "height": 15})
            return {"success": True, "data": "%99\n"}

        with patch("pf.tmux.panes.is_tmux_running", return_value=True), \
             patch("pf.tmux.panes.get_session_name", return_value={"success": True, "data": "pf-test-0"}), \
             patch("pf.tmux.panes.list_live_panes", side_effect=list_live_panes_side_effect), \
             patch("pf.tmux.panes.split_pane", side_effect=split_pane_side_effect), \
             patch("pf.tmux.panes.set_pane_title"), \
             patch("pf.tmux.panes.send_keys", return_value={"success": True, "data": ""}) as mock_send:

            task = '$(echo PWNED)'
            result = summon_agent("dev", project_root=tmp_project, task=task)
            assert result["success"] is True

            mock_send.assert_called_once()
            sent_command = mock_send.call_args[0][1]
            self._assert_task_outside_dquotes(sent_command, task, "send_keys")

    def test_send_keys_failure_returns_error(self, tmp_project):
        """When send_keys fails, summon_agent must return an error dict."""
        live_panes = [
            {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
        ]

        def list_live_panes_side_effect(session):
            return {"success": True, "data": list(live_panes)}

        def split_pane_side_effect(session, target, direction="v", size_pct=50, cwd=None):
            live_panes.append({"pane_id": "%99", "title": "Saddle", "command": "zsh", "width": 200, "height": 15})
            return {"success": True, "data": "%99\n"}

        with patch("pf.tmux.panes.is_tmux_running", return_value=True), \
             patch("pf.tmux.panes.get_session_name", return_value={"success": True, "data": "pf-test-0"}), \
             patch("pf.tmux.panes.list_live_panes", side_effect=list_live_panes_side_effect), \
             patch("pf.tmux.panes.split_pane", side_effect=split_pane_side_effect), \
             patch("pf.tmux.panes.set_pane_title"), \
             patch("pf.tmux.panes.send_keys", return_value={"success": False, "error": "pane not found"}):

            result = summon_agent("dev", project_root=tmp_project)
            assert result["success"] is False
            assert "pane not found" in result["error"]


# ===========================================================================
# AC4: Saddle state tracks the summoned agent
# ===========================================================================


class TestSummonStateTracking:
    """summon_agent must update saddle state using existing state management."""

    def test_summon_sets_active_state(self, tmp_project, mock_tmux):
        """After summon, saddle state should show active=True with agent name."""
        from pf.saddle.core import status

        summon_agent("dev", project_root=tmp_project)
        state = status(project_root=tmp_project)
        assert state["success"] is True
        assert state["data"]["active"] is True
        assert state["data"]["agent"] == "dev"

    def test_summon_sets_pane_id(self, tmp_project, mock_tmux):
        """After summon, saddle state should have the pane_id."""
        from pf.saddle.core import status

        summon_agent("tea", project_root=tmp_project)
        state = status(project_root=tmp_project)
        assert state["data"]["pane_id"] is not None

    def test_summon_stops_existing_agent_first(self, tmp_project, mock_tmux):
        """If an agent is already running, summon should stop it before starting new one."""
        from pf.saddle.core import start_agent, status

        start_agent("dev", project_root=tmp_project)
        summon_agent("tea", project_root=tmp_project)

        state = status(project_root=tmp_project)
        assert state["data"]["agent"] == "tea"  # New agent replaced old

    def test_summon_reuses_existing_saddle_pane(self, tmp_project, mock_tmux):
        """Summon should reuse the existing saddle pane, not create a new one."""
        from pf.saddle.core import ensure_saddle_pane

        pane_result = ensure_saddle_pane(project_root=tmp_project)
        original_pane = pane_result["data"]["pane_id"]

        result = summon_agent("dev", project_root=tmp_project)
        assert result["data"]["pane_id"] == original_pane

    def test_stop_agent_works_after_summon(self, tmp_project, mock_tmux):
        """stop_agent should work on a summoned agent the same as a started one."""
        from pf.saddle.core import stop_agent

        summon_agent("dev", project_root=tmp_project)
        result = stop_agent(project_root=tmp_project)
        assert result["success"] is True
        assert result["data"]["agent_stopped"] == "dev"


# ===========================================================================
# AC5: Error cases — tmux not running, invalid agents
# ===========================================================================


class TestSummonErrorCases:
    """summon_agent must fail gracefully with clear errors."""

    def test_summon_without_tmux_fails(self, tmp_project):
        """summon_agent fails with clear error when tmux is not running."""
        with patch("pf.tmux.panes.is_tmux_running", return_value=False):
            result = summon_agent("dev", project_root=tmp_project)
            assert result["success"] is False
            assert "tmux" in result["error"].lower()

    def test_summon_invalid_agent_fails(self, tmp_project):
        """summon_agent rejects unknown agent names."""
        result = summon_agent("nonexistent-agent", project_root=tmp_project)
        assert result["success"] is False
        assert "unknown" in result["error"].lower() or "nonexistent" in result["error"].lower()

    def test_summon_empty_agent_fails(self, tmp_project):
        """summon_agent rejects empty agent name."""
        result = summon_agent("", project_root=tmp_project)
        assert result["success"] is False

    def test_summon_all_valid_agents_accepted(self, tmp_project, mock_tmux):
        """Every agent in VALID_AGENTS should be accepted by summon."""
        for agent in sorted(VALID_AGENTS):
            # Reset state between agents
            from pf.saddle.core import _save_state
            _save_state(tmp_project, {"active": False, "agent": None, "pane_id": None})

            result = summon_agent(agent, project_root=tmp_project)
            assert result["success"] is True, (
                f"summon_agent('{agent}') failed: {result.get('error')}"
            )

    def test_summon_returns_result_dict_contract(self, tmp_project, mock_tmux):
        """summon_agent must follow {success, data?, error?} contract."""
        result = summon_agent("dev", project_root=tmp_project)
        assert "success" in result
        if result["success"]:
            assert "data" in result
        else:
            assert "error" in result

    def test_summon_cli_without_tmux_shows_error(self, cli_runner, tmp_project):
        """CLI summon without tmux should exit non-zero with error message."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.tmux.panes.is_tmux_running", return_value=False):
            result = cli_runner.invoke(saddle, ["summon", "dev"])
            assert result.exit_code != 0
