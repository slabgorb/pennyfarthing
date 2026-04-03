"""Tests for pf agent create CLI command.

Story 150-2: pf agent create CLI — scaffold custom agent from template

Acceptance Criteria:
1. New CLI command: pf agent create <name> [--type tactical|strategic]
2. Scaffolds a properly-structured .md file in agents-local/ from agent template
3. Creates .pennyfarthing/sidecars/{name}/ with empty patterns.md, gotchas.md, decisions.md
4. Validates that the name doesn't conflict with built-in agents
5. Uses agent-template-{type}.md templates (tactical for Haiku-class, strategic for Opus-class)
"""

from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.cli import cli


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def project_root(tmp_path: Path) -> Path:
    """Create a minimal project structure for agent creation."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # agents-local/ (where new agents go)
    (pf_dir / "agents-local").mkdir()

    # Built-in agents directory
    agents_dir = pf_dir / "agents"
    agents_dir.mkdir()
    (agents_dir / "dev.md").write_text("# Dev Agent")
    (agents_dir / "tea.md").write_text("# TEA Agent")
    (agents_dir / "sm.md").write_text("# SM Agent")
    (agents_dir / "reviewer.md").write_text("# Reviewer Agent")
    (agents_dir / "architect.md").write_text("# Architect Agent")

    # Agent templates
    templates_dir = agents_dir / "templates"
    templates_dir.mkdir()
    (templates_dir / "agent-template-tactical.md").write_text(
        "# {NAME} Agent - {Role Title}\n\n<role>\n{ROLE_DESCRIPTION}\n</role>\n"
    )
    (templates_dir / "agent-template-strategic.md").write_text(
        "# {NAME} Agent - {Role Title}\n\n<role>\n{ROLE_DESCRIPTION}\n</role>\n\n"
        "<constraints>\nThis agent does NOT write implementation code.\n</constraints>\n"
    )

    # Sidecars directory
    (pf_dir / "sidecars").mkdir()

    return tmp_path


@pytest.fixture()
def runner() -> CliRunner:
    """Click CLI test runner."""
    return CliRunner()


# ---------------------------------------------------------------------------
# AC 1: CLI command exists with correct signature
# ---------------------------------------------------------------------------


class TestAgentCreateCLI:
    """AC 1: pf agent create <name> [--type tactical|strategic]."""

    def test_create_command_exists(self, runner: CliRunner) -> None:
        """The 'create' subcommand must exist under 'pf agent'."""
        result = runner.invoke(cli, ["agent", "create", "--help"])
        assert result.exit_code == 0, f"Command not found: {result.output}"
        assert "create" in result.output.lower()

    def test_create_requires_name_argument(self, runner: CliRunner) -> None:
        """pf agent create without a name should fail."""
        result = runner.invoke(cli, ["agent", "create"])
        assert result.exit_code != 0

    def test_create_accepts_type_option(self, runner: CliRunner) -> None:
        """--type flag should accept 'tactical' and 'strategic'."""
        result = runner.invoke(cli, ["agent", "create", "--help"])
        assert result.exit_code == 0
        assert "tactical" in result.output
        assert "strategic" in result.output

    def test_create_type_defaults_to_tactical(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Without --type, default should be tactical."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "my-agent"])
        assert result.exit_code == 0
        # Agent file should exist and be based on tactical template
        agent_file = project_root / ".pennyfarthing" / "agents-local" / "my-agent.md"
        assert agent_file.exists()
        content = agent_file.read_text()
        # Tactical template does NOT have <constraints> section
        assert "<constraints>" not in content


# ---------------------------------------------------------------------------
# AC 2: Scaffolds agent definition in agents-local/
# ---------------------------------------------------------------------------


class TestAgentCreateScaffolding:
    """AC 2: Scaffolds .md file in agents-local/ from template."""

    def test_creates_agent_file_in_agents_local(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Agent .md file must be created in agents-local/, not agents/."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        agent_file = project_root / ".pennyfarthing" / "agents-local" / "data-engineer.md"
        assert agent_file.exists(), "Agent file not created in agents-local/"
        # Must NOT be in agents/ (built-in directory)
        builtin_file = project_root / ".pennyfarthing" / "agents" / "data-engineer.md"
        assert not builtin_file.exists(), "Agent file should not be in agents/"

    def test_agent_file_contains_name(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Scaffolded agent file should contain the agent name."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        content = (
            project_root / ".pennyfarthing" / "agents-local" / "data-engineer.md"
        ).read_text()
        assert "data-engineer" in content.lower() or "Data Engineer" in content

    def test_agent_file_has_role_section(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Scaffolded agent must have a <role> section — standard structure."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        content = (
            project_root / ".pennyfarthing" / "agents-local" / "data-engineer.md"
        ).read_text()
        assert "<role>" in content


# ---------------------------------------------------------------------------
# AC 3: Creates sidecar directories
# ---------------------------------------------------------------------------


class TestAgentCreateSidecars:
    """AC 3: Creates sidecars/{name}/ with patterns.md, gotchas.md, decisions.md."""

    def test_creates_sidecar_directory(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Sidecar directory must be created for the new agent."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        sidecar_dir = project_root / ".pennyfarthing" / "sidecars" / "data-engineer"
        assert sidecar_dir.is_dir(), "Sidecar directory not created"

    def test_creates_patterns_file(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """patterns.md must be created in the sidecar directory."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        patterns = (
            project_root / ".pennyfarthing" / "sidecars" / "data-engineer" / "patterns.md"
        )
        assert patterns.exists(), "patterns.md not created"

    def test_creates_gotchas_file(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """gotchas.md must be created in the sidecar directory."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        gotchas = (
            project_root / ".pennyfarthing" / "sidecars" / "data-engineer" / "gotchas.md"
        )
        assert gotchas.exists(), "gotchas.md not created"

    def test_creates_decisions_file(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """decisions.md must be created in the sidecar directory."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        decisions = (
            project_root / ".pennyfarthing" / "sidecars" / "data-engineer" / "decisions.md"
        )
        assert decisions.exists(), "decisions.md not created"

    def test_sidecar_files_have_headers(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Sidecar files should have agent-specific headers, not be completely empty."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        sidecar_dir = project_root / ".pennyfarthing" / "sidecars" / "data-engineer"
        patterns = (sidecar_dir / "patterns.md").read_text()
        assert "data-engineer" in patterns.lower() or "Data Engineer" in patterns


# ---------------------------------------------------------------------------
# AC 4: Name conflict validation
# ---------------------------------------------------------------------------


class TestAgentCreateNameValidation:
    """AC 4: Validates name doesn't conflict with built-in agents."""

    def test_rejects_builtin_agent_name(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Creating an agent with a built-in name must fail."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "dev"])
        assert result.exit_code != 0
        assert "conflict" in result.output.lower() or "exists" in result.output.lower()

    def test_rejects_another_builtin_name(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """All built-in agent names should be rejected."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "reviewer"])
        assert result.exit_code != 0

    def test_rejects_existing_local_agent(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """If an agent already exists in agents-local/, reject the name."""
        # Create an existing local agent
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "my-agent.md").write_text("# Existing agent")
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "my-agent"])
        assert result.exit_code != 0
        assert "exists" in result.output.lower()

    def test_accepts_unique_name(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """A name that doesn't conflict should succeed."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0

    def test_rejects_empty_name(self, runner: CliRunner) -> None:
        """Empty string as name should be rejected."""
        result = runner.invoke(cli, ["agent", "create", ""])
        assert result.exit_code != 0

    def test_rejects_name_with_path_separators(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Names containing path separators must be rejected (CWE-22)."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "../etc/passwd"])
        assert result.exit_code != 0


# ---------------------------------------------------------------------------
# AC 5: Template selection — tactical vs strategic
# ---------------------------------------------------------------------------


class TestAgentCreateTemplates:
    """AC 5: Uses agent-template-{type}.md templates."""

    def test_tactical_template_used_by_default(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Default type is tactical — no <constraints> section."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "my-agent"])
        assert result.exit_code == 0
        content = (
            project_root / ".pennyfarthing" / "agents-local" / "my-agent.md"
        ).read_text()
        assert "<constraints>" not in content

    def test_strategic_template_with_flag(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """--type strategic should use the strategic template."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(
                cli, ["agent", "create", "my-architect", "--type", "strategic"]
            )
        assert result.exit_code == 0
        content = (
            project_root / ".pennyfarthing" / "agents-local" / "my-architect.md"
        ).read_text()
        assert "<constraints>" in content

    def test_tactical_template_explicit(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """--type tactical should work explicitly."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(
                cli, ["agent", "create", "my-worker", "--type", "tactical"]
            )
        assert result.exit_code == 0
        content = (
            project_root / ".pennyfarthing" / "agents-local" / "my-worker.md"
        ).read_text()
        assert "<role>" in content

    def test_invalid_type_rejected(self, runner: CliRunner) -> None:
        """An invalid --type value should be rejected by Click."""
        result = runner.invoke(
            cli, ["agent", "create", "my-agent", "--type", "invalid"]
        )
        assert result.exit_code != 0


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestAgentCreateEdgeCases:
    """Edge cases and boundary conditions."""

    def test_name_with_hyphens(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Agent names with hyphens should work (common pattern)."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "my-custom-agent"])
        assert result.exit_code == 0
        assert (
            project_root / ".pennyfarthing" / "agents-local" / "my-custom-agent.md"
        ).exists()

    def test_success_message_includes_name(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """Successful creation should output a confirmation with the agent name."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        assert "data-engineer" in result.output

    def test_does_not_clobber_existing_sidecars(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """If sidecar files already exist with content, do not overwrite them.
        This protects against re-running create after adding patterns."""
        sidecar_dir = project_root / ".pennyfarthing" / "sidecars" / "data-engineer"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Existing patterns\nDo not overwrite")

        # Create the agent — but sidecar already exists
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        # Agent file doesn't exist yet, so create should succeed
        with patch("pf.common.config.get_project_root", return_value=project_root):
            result = runner.invoke(cli, ["agent", "create", "data-engineer"])
        assert result.exit_code == 0
        # Existing sidecar content must be preserved
        content = (sidecar_dir / "patterns.md").read_text()
        assert "Do not overwrite" in content


# ---------------------------------------------------------------------------
# Rule enforcement: Python lang-review checklist
# ---------------------------------------------------------------------------


class TestRuleEnforcement:
    """Tests derived from Python lang-review rules."""

    def test_create_command_returns_result_not_throws(
        self, runner: CliRunner, project_root: Path
    ) -> None:
        """SOUL #10: Return results, don't throw. CLI should exit cleanly
        with a non-zero code on error, not crash with a traceback."""
        with patch("pf.common.config.get_project_root", return_value=project_root):
            # Name conflict — should fail gracefully
            result = runner.invoke(cli, ["agent", "create", "dev"])
        assert result.exit_code != 0
        # Should not contain Python traceback
        assert "Traceback" not in result.output
