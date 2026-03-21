"""Tests for peloton pre-priming — teammates get full agent context.

Story 148-28: Peloton teammates must be pre-primed with the full agent
prompt from `pf agent start <role>` instead of minimal instructional text.

The fix: start_session calls `pf agent start <role> --no-register --quiet`
(not `--minimal`) so the output contains the full agent definition, persona,
and session context. This output is injected into the TeamCreate prompt.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create a minimal project structure for peloton tests."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    wf_dir = pf_dir / "workflows"
    wf_dir.mkdir()
    (wf_dir / "tdd.yaml").write_text(
        "workflow:\n"
        "  name: tdd\n"
        "  type: phased\n"
        "  phases:\n"
        "    - name: setup\n"
        "      agent: sm\n"
        "    - name: red\n"
        "      agent: tea\n"
        "    - name: green\n"
        "      agent: dev\n"
        "    - name: review\n"
        "      agent: reviewer\n"
    )

    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "42-1-session.md").write_text(
        "**Story:** 42-1\n"
        "**Workflow:** tdd\n"
        "**Phase:** setup\n"
    )

    return tmp_path


@pytest.fixture(autouse=True)
def _no_real_tmux():
    """Prevent stop() from calling real tmux commands."""
    with patch("pf.tmux.panes.kill_pane", return_value={"success": True}), \
         patch("pf.tmux.panes._run_tmux", return_value={"success": False, "error": "mocked"}):
        yield


def _mock_subprocess_run(agent_outputs: dict[str, str]):
    """Create a mock subprocess.run that returns agent-specific prime output."""
    def side_effect(cmd, **kwargs):
        result = MagicMock()
        # Extract agent name from command: ["pf", "agent", "start", <name>, ...]
        if len(cmd) >= 4 and cmd[1] == "agent" and cmd[2] == "start":
            agent = cmd[3]
            output = agent_outputs.get(agent, "")
            result.returncode = 0 if output else 1
            result.stdout = output
        else:
            result.returncode = 1
            result.stdout = ""
        return result
    return side_effect


class TestPrePrimeArgs:
    """start_session must call pf agent start with --no-register --quiet, not --minimal."""

    def test_subprocess_uses_no_register_quiet(self, project: Path) -> None:
        from pf.peloton.live import start_session

        with patch("pf.peloton.live.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="# Agent Definition\ntest output")
            start_session(project, "42-1", "tdd")

            # Verify each call uses --no-register --quiet (not --minimal)
            for call in mock_run.call_args_list:
                cmd = call[0][0]
                assert "--minimal" not in cmd, "Must not use --minimal flag"
                assert "--no-register" in cmd, "Must use --no-register flag"
                assert "--quiet" in cmd, "Must use --quiet flag"

    def test_subprocess_called_for_each_agent(self, project: Path) -> None:
        from pf.peloton.live import start_session

        with patch("pf.peloton.live.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="context")
            start_session(project, "42-1", "tdd")

            called_agents = []
            for call in mock_run.call_args_list:
                cmd = call[0][0]
                called_agents.append(cmd[3])  # ["pf", "agent", "start", <agent>, ...]

            assert "tea" in called_agents
            assert "dev" in called_agents
            assert "reviewer" in called_agents


class TestPrePrimePromptInjection:
    """When prime output is available, it must appear in the TeamCreate prompt."""

    def test_primer_injected_into_prompt(self, project: Path) -> None:
        from pf.peloton.live import start_session

        agent_outputs = {
            "tea": "# Agent Definition: tea\nYou are the test engineer.",
            "dev": "# Agent Definition: dev\nYou are the developer.",
            "reviewer": "# Agent Definition: reviewer\nYou are the reviewer.",
        }

        with patch("pf.peloton.live.subprocess.run", side_effect=_mock_subprocess_run(agent_outputs)):
            result = start_session(project, "42-1", "tdd")

        prompt = result["data"]["prompt"]
        # Each agent's pre-loaded context should appear in primer blocks
        assert "Pre-loaded context for tea" in prompt
        assert "You are the test engineer." in prompt
        assert "Pre-loaded context for dev" in prompt
        assert "You are the developer." in prompt
        assert "Pre-loaded context for reviewer" in prompt
        assert "You are the reviewer." in prompt

    def test_primed_agents_told_not_to_reload(self, project: Path) -> None:
        from pf.peloton.live import start_session

        agent_outputs = {
            "tea": "# Agent Definition: tea\nYou are the test engineer.",
            "dev": "# Agent Definition: dev\nYou are the developer.",
            "reviewer": "# Agent Definition: reviewer\nYou are the reviewer.",
        }

        with patch("pf.peloton.live.subprocess.run", side_effect=_mock_subprocess_run(agent_outputs)):
            result = start_session(project, "42-1", "tdd")

        prompt = result["data"]["prompt"]
        # Primed agents should be told NOT to re-load their context
        assert "do NOT run" in prompt
        # Should NOT have fallback "Load agent with" instructions
        assert "Load agent with" not in prompt

    def test_fallback_when_prime_fails(self, project: Path) -> None:
        from pf.peloton.live import start_session

        # All prime calls fail — subprocess returns non-zero
        with patch("pf.peloton.live.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stdout="")
            result = start_session(project, "42-1", "tdd")

        prompt = result["data"]["prompt"]
        # Should fall back to instructional text
        assert "Load agent with" in prompt
        # Should not have primer blocks
        assert "Pre-loaded context" not in prompt

    def test_partial_prime_failure(self, project: Path) -> None:
        from pf.peloton.live import start_session

        # Only tea succeeds
        agent_outputs = {
            "tea": "# Agent Definition: tea\nYou are the test engineer.",
        }

        with patch("pf.peloton.live.subprocess.run", side_effect=_mock_subprocess_run(agent_outputs)):
            result = start_session(project, "42-1", "tdd")

        prompt = result["data"]["prompt"]
        # tea should be pre-primed
        assert "Pre-loaded context for tea" in prompt
        # dev and reviewer should fall back to instructional
        assert "Load agent with `/pf-dev`" in prompt
        assert "Load agent with `/pf-reviewer`" in prompt
