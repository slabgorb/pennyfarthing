"""Tests for story 153-8 item 3: ``pf agent start <name> --brief``.

Story: 153-8 (DX bundle) — a condensed activation mode. The default
``pf agent start`` emits a large block (agent definition, SOUL, output style,
full persona, behavior guide, sprint context, repos topology, session,
sidecars, …). For quick re-activations a ``--brief`` flag should emit only the
essentials.

DESIGN DECISION (TEA): ``--brief`` reuses the already-implemented **HANDOFF**
tier behavior so we don't invent a second, drifting code path. HANDOFF keeps
exactly the brief essentials:

    KEEP:  workflow state, agent definition, compressed persona, repos topology
    DROP:  SOUL.md, output style, full persona, behavior guide, sprint context,
           session header/assessment, sidecars

Concretely: ``prime(..., brief=True)`` is equivalent to
``prime(..., tier="HANDOFF")``. ``--brief`` and ``--tier`` are mutually
redundant; ``--brief`` is the discoverable sugar on ``pf agent start``.

CRITICAL CONSTRAINT (from the story): default output (no ``--brief``) must be
**byte-identical** to today. The flag defaults to False and only short-circuits
to the HANDOFF path when explicitly set.

RED phase: these tests fail on HEAD because there is no ``brief`` parameter on
``prime`` (TypeError) and no ``--brief`` option on ``pf agent start`` / the
``prime_cmd`` Click command ("No such option").
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from click.testing import CliRunner

# =============================================================================
# Shared project fixture (mirrors test_tiers._setup_full_project)
# =============================================================================


def _setup_full_project(tmp_path: Path) -> None:
    """Set up a complete project structure for activation tests."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    agents_dir = pf_dir / "agents"
    agents_dir.mkdir()
    (agents_dir / "dev.md").write_text("# Dev Agent\n\nDeveloper agent definition.")

    guides_dir = pf_dir / "guides"
    guides_dir.mkdir()
    (guides_dir / "agent-behavior.md").write_text("# Agent Behavior Guide\n\nShared protocols.")

    sidecar_dir = pf_dir / "sidecars" / "dev"
    sidecar_dir.mkdir(parents=True)
    (sidecar_dir / "patterns.md").write_text("# Patterns\n\nDev patterns.")

    (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test-theme"}))

    themes_dir = pf_dir / "personas" / "themes"
    themes_dir.mkdir(parents=True)
    (themes_dir / "test-theme.yaml").write_text(
        yaml.dump(
            {
                "theme": {"name": "Test Theme", "user_title": "Developer"},
                "agents": {
                    "dev": {
                        "character": "Test Developer",
                        "style": "Practical and efficient",
                        "role": "Implementation specialist",
                        "quote": "Ship it!",
                    }
                },
            }
        )
    )

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(
        yaml.dump({"sprint": {"number": 12, "goal": "Test sprint"}, "epics": []})
    )

    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "test-session.md").write_text("# Test Session\n\n- **Phase:** green")

    # SOUL.md so we can assert it is dropped in --brief
    (tmp_path / "SOUL.md").write_text("# SOUL\n\nProject principles here.")


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


def _run_brief(tmp_path: Path, **kwargs):
    """Invoke prime with brief=True under a patched project root, return stdout."""
    from pf.prime.cli import prime

    with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
        with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
            code = prime(
                agent_name="dev",
                brief=True,
                no_register=True,
                project_root=tmp_path,
                **kwargs,
            )
    return code


# =============================================================================
# AC3 — --brief keeps the essentials
# =============================================================================


class TestBriefKeepsEssentials:
    def test_brief_includes_agent_definition(self, tmp_path: Path, capsys) -> None:
        _setup_full_project(tmp_path)
        code = _run_brief(tmp_path)
        assert code == 0
        out = capsys.readouterr().out
        assert "# Dev Agent" in out, "brief activation must keep the agent definition"

    def test_brief_includes_workflow_state(self, tmp_path: Path, capsys) -> None:
        _setup_full_project(tmp_path)
        code = _run_brief(tmp_path)
        assert code == 0
        out = capsys.readouterr().out
        assert "Workflow State" in out, "brief activation must keep workflow state"

    def test_brief_includes_compressed_persona(self, tmp_path: Path, capsys) -> None:
        _setup_full_project(tmp_path)
        code = _run_brief(tmp_path)
        assert code == 0
        out = capsys.readouterr().out
        assert "<persona" in out, "brief activation must keep the (compressed) persona"


# =============================================================================
# AC3 — --brief drops the heavyweight sections
# =============================================================================


class TestBriefDropsHeavyweight:
    def test_brief_drops_behavior_guide(self, tmp_path: Path, capsys) -> None:
        _setup_full_project(tmp_path)
        _run_brief(tmp_path)
        out = capsys.readouterr().out
        assert "# Agent Behavior Guide" not in out

    def test_brief_drops_sidecars(self, tmp_path: Path, capsys) -> None:
        _setup_full_project(tmp_path)
        _run_brief(tmp_path)
        out = capsys.readouterr().out
        assert "patterns.md" not in out and "# Patterns" not in out

    def test_brief_drops_soul(self, tmp_path: Path, capsys) -> None:
        _setup_full_project(tmp_path)
        _run_brief(tmp_path)
        out = capsys.readouterr().out
        assert "Project Principles (SOUL.md)" not in out

    def test_brief_drops_sprint_context(self, tmp_path: Path, capsys) -> None:
        _setup_full_project(tmp_path)
        _run_brief(tmp_path)
        out = capsys.readouterr().out
        assert "# Sprint Context" not in out


# =============================================================================
# AC3 — --brief is equivalent to --tier HANDOFF (single code path, no drift)
# =============================================================================


class TestBriefEqualsHandoff:
    def test_brief_output_matches_handoff_tier(self, tmp_path: Path, capsys) -> None:
        """brief=True must produce byte-identical output to tier='HANDOFF'."""
        from pf.prime.cli import prime

        _setup_full_project(tmp_path)

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                prime(agent_name="dev", brief=True, no_register=True, project_root=tmp_path)
        brief_out = capsys.readouterr().out

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                prime(agent_name="dev", tier="HANDOFF", no_register=True, project_root=tmp_path)
        handoff_out = capsys.readouterr().out

        assert brief_out == handoff_out, (
            "--brief must reuse the HANDOFF tier path exactly (no second code path)"
        )


# =============================================================================
# AC3 — default activation is byte-identical to today (no --brief)
# =============================================================================


class TestDefaultUnchanged:
    def test_default_still_includes_everything(self, tmp_path: Path, capsys) -> None:
        """Without --brief, all heavyweight sections must still be present."""
        from pf.prime.cli import prime

        _setup_full_project(tmp_path)
        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
                code = prime(agent_name="dev", no_register=True, project_root=tmp_path)
        out = capsys.readouterr().out
        assert code == 0
        assert "# Dev Agent" in out
        assert "# Agent Behavior Guide" in out  # dropped by brief, present by default
        assert "# Patterns" in out  # sidecar, dropped by brief

    def test_brief_defaults_to_false(self) -> None:
        """The brief parameter must default to False so existing callers and the
        default CLI path are byte-identical to today."""
        import inspect

        from pf.prime.cli import prime

        sig = inspect.signature(prime)
        assert "brief" in sig.parameters, "prime() must accept a `brief` keyword"
        assert sig.parameters["brief"].default is False, (
            "brief must default to False to keep default activation unchanged"
        )


# =============================================================================
# AC3 — CLI: `pf agent start <name> --brief`
# =============================================================================


class TestBriefCLIOption:
    def test_agent_start_has_brief_option(self, runner: CliRunner) -> None:
        """`pf agent start --help` must advertise --brief."""
        from pf.cli import cli

        result = runner.invoke(cli, ["agent", "start", "--help"])
        assert result.exit_code == 0
        assert "--brief" in result.output

    def test_prime_cmd_has_brief_option(self, runner: CliRunner) -> None:
        """`pf prime --help` must advertise --brief too (same entry point)."""
        from pf.prime.cli import prime_cmd

        result = runner.invoke(prime_cmd, ["--help"])
        assert result.exit_code == 0
        assert "--brief" in result.output
