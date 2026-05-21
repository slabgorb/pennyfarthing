"""Tests for auto-generating command/skill files for custom agents on pf init.

Story 150-4: Auto-generate command files for custom agents on pf init

Acceptance Criteria:
1. On pf init, detect all custom agents in .pennyfarthing/agents-local/
2. For each agent {name}, create or update .claude/commands/pf-{name}.md with proper activation syntax
3. Generate .claude/skills/pf-{name}/ directory if skills template exists for the agent
4. Do not overwrite existing custom command files (preserve user modifications)
5. Log generation results to pf init output
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def dist_root(tmp_path: Path) -> Path:
    """Create a minimal dist_root for init."""
    dist = tmp_path / "pennyfarthing-dist"
    dist.mkdir()
    (dist / "agents").mkdir()
    (dist / "commands").mkdir()
    (dist / "skills").mkdir()
    return dist


@pytest.fixture()
def project_root(tmp_path: Path, dist_root: Path) -> Path:
    """Create a project with agents-local/ containing custom agents."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "agents-local").mkdir()
    (tmp_path / ".claude").mkdir()
    (tmp_path / ".claude" / "commands").mkdir()
    (tmp_path / ".claude" / "skills").mkdir()
    return tmp_path


@pytest.fixture()
def project_with_custom_agents(project_root: Path) -> Path:
    """Project with two custom agents in agents-local/."""
    local_dir = project_root / ".pennyfarthing" / "agents-local"
    (local_dir / "data-engineer.md").write_text(
        "# Data Engineer Agent\n<role>Data pipeline management</role>\n"
    )
    (local_dir / "game-master.md").write_text(
        "# Game Master Agent\n<role>RPG session orchestration</role>\n"
    )
    return project_root


# ---------------------------------------------------------------------------
# AC 1: Detect all custom agents in .pennyfarthing/agents-local/
# ---------------------------------------------------------------------------


class TestDetectCustomAgents:
    """AC 1: pf init scans agents-local/ for all .md files."""

    def test_detects_custom_agents_in_agents_local(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """init_project must scan agents-local/ and find custom agent .md files."""
        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_with_custom_agents)
        assert result["success"] is True
        assert len(result["data"]["generated_commands"]) >= 2

    def test_ignores_non_md_files(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Only .md files should be treated as agent definitions."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "my-agent.md").write_text("# My Agent\n<role>Test</role>\n")
        (local_dir / "notes.txt").write_text("This is not an agent")
        (local_dir / "config.yaml").write_text("key: value")

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert result["success"] is True
        generated = result["data"]["generated_commands"]
        names = [g["agent_name"] for g in generated]
        assert "my-agent" in names
        assert "notes" not in names
        assert "config" not in names

    def test_empty_agents_local_is_noop(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Empty agents-local/ should succeed with no commands generated."""
        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert result["success"] is True
        assert result["data"]["generated_commands"] == []

    def test_missing_agents_local_is_noop(
        self, tmp_path: Path, dist_root: Path
    ) -> None:
        """If agents-local/ doesn't exist, succeed with no commands generated."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".claude" / "commands").mkdir(parents=True)

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(tmp_path)
        assert result["success"] is True
        assert result["data"]["generated_commands"] == []

    def test_ignores_subdirectories_in_agents_local(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Subdirectories in agents-local/ (e.g., templates/) should not be
        treated as agent definitions."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "templates").mkdir()
        (local_dir / "my-agent.md").write_text("# My Agent\n<role>Test</role>\n")

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert result["success"] is True
        generated = result["data"]["generated_commands"]
        names = [g["agent_name"] for g in generated]
        assert "my-agent" in names
        assert "templates" not in names


# ---------------------------------------------------------------------------
# AC 2: Generate .claude/commands/pf-{name}.md with activation syntax
# ---------------------------------------------------------------------------


class TestGenerateCommandFiles:
    """AC 2: Create command files with proper pf agent start activation."""

    def test_generates_command_file_for_each_agent(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Each custom agent should get a .claude/commands/pf-{name}.md file."""
        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_with_custom_agents)

        cmd_dir = project_with_custom_agents / ".claude" / "commands"
        assert (cmd_dir / "pf-data-engineer.md").exists()
        assert (cmd_dir / "pf-game-master.md").exists()

    def test_command_file_has_frontmatter(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Generated command file must have YAML frontmatter with description."""
        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_with_custom_agents)

        content = (
            project_with_custom_agents / ".claude" / "commands" / "pf-data-engineer.md"
        ).read_text()
        assert content.startswith("---\n")
        assert "description:" in content

    def test_command_file_has_activation_syntax(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Generated command must include pf agent start activation block."""
        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_with_custom_agents)

        content = (
            project_with_custom_agents / ".claude" / "commands" / "pf-data-engineer.md"
        ).read_text()
        assert "pf agent start" in content
        assert "data-engineer" in content

    def test_command_file_has_agent_activation_tag(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Generated command must use <agent-activation> XML tag like built-in commands."""
        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_with_custom_agents)

        content = (
            project_with_custom_agents / ".claude" / "commands" / "pf-data-engineer.md"
        ).read_text()
        assert "<agent-activation>" in content
        assert "</agent-activation>" in content

    def test_command_file_contains_agent_name_in_start_command(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """The pf agent start command must reference the correct agent name."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "my-custom-agent.md").write_text(
            "# My Custom Agent\n<role>Custom work</role>\n"
        )

        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_root)

        content = (
            project_root / ".claude" / "commands" / "pf-my-custom-agent.md"
        ).read_text()
        assert 'pf agent start "my-custom-agent"' in content


# ---------------------------------------------------------------------------
# AC 3: Generate .claude/skills/pf-{name}/ if skill template exists
# ---------------------------------------------------------------------------


class TestGenerateSkillDirectories:
    """AC 3: Create skill directories when a skill template exists for the agent."""

    def test_generates_skill_dir_when_template_exists(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """If a skill template file exists for a custom agent, create the skill dir."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "data-engineer.md").write_text(
            "# Data Engineer Agent\n<role>Data pipelines</role>\n"
        )
        # Create a skill template for this agent
        templates_dir = project_root / ".pennyfarthing" / "templates" / "skills"
        templates_dir.mkdir(parents=True)
        (templates_dir / "pf-data-engineer.md").write_text(
            "---\nname: data-engineer\ndescription: Data engineering skill\n---\n\n# Data Engineer Skill\n"
        )

        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_root)

        skill_dir = project_root / ".claude" / "skills" / "pf-data-engineer"
        assert skill_dir.is_dir(), "Skill directory not created"

    def test_skill_dir_not_created_without_template(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """If no skill template exists, don't create the skill directory."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "data-engineer.md").write_text(
            "# Data Engineer Agent\n<role>Data pipelines</role>\n"
        )
        # No skill template created

        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_root)

        skill_dir = project_root / ".claude" / "skills" / "pf-data-engineer"
        assert not skill_dir.exists(), "Skill directory created without template"

    def test_skill_dir_contains_skill_file(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Generated skill directory should contain a skill .md file."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "data-engineer.md").write_text(
            "# Data Engineer Agent\n<role>Data pipelines</role>\n"
        )
        templates_dir = project_root / ".pennyfarthing" / "templates" / "skills"
        templates_dir.mkdir(parents=True)
        (templates_dir / "pf-data-engineer.md").write_text(
            "---\nname: data-engineer\ndescription: Data engineering skill\n---\n\n# Skill\n"
        )

        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_root)

        skill_dir = project_root / ".claude" / "skills" / "pf-data-engineer"
        skill_files = list(skill_dir.glob("*.md"))
        assert len(skill_files) >= 1, "Skill directory should contain at least one .md file"

    def test_result_reports_generated_skills(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Result data must include the list of generated skill directories."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "data-engineer.md").write_text(
            "# Data Engineer Agent\n<role>Data pipelines</role>\n"
        )
        templates_dir = project_root / ".pennyfarthing" / "templates" / "skills"
        templates_dir.mkdir(parents=True)
        (templates_dir / "pf-data-engineer.md").write_text(
            "---\nname: data-engineer\n---\n\n# Skill\n"
        )

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert result["success"] is True
        assert len(result["data"]["generated_skills"]) >= 1


# ---------------------------------------------------------------------------
# AC 4: Preserve existing custom command files (no clobber)
# ---------------------------------------------------------------------------


class TestPreserveExistingCommands:
    """AC 4: Do not overwrite existing custom command files."""

    def test_does_not_overwrite_existing_command_file(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """If .claude/commands/pf-{name}.md already exists, preserve it."""
        cmd_dir = project_with_custom_agents / ".claude" / "commands"
        existing = cmd_dir / "pf-data-engineer.md"
        existing.write_text("# My custom activation\nDo not overwrite me")

        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_with_custom_agents)

        content = existing.read_text()
        assert "Do not overwrite me" in content

    def test_tracks_preserved_files_in_result(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Result data must report which files were preserved (not overwritten)."""
        cmd_dir = project_with_custom_agents / ".claude" / "commands"
        (cmd_dir / "pf-data-engineer.md").write_text("# Existing custom command")

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_with_custom_agents)
        assert result["success"] is True
        assert len(result["data"]["preserved_commands"]) >= 1
        preserved_names = [p["agent_name"] for p in result["data"]["preserved_commands"]]
        assert "data-engineer" in preserved_names

    def test_generates_new_command_while_preserving_existing(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Should generate pf-game-master.md but preserve existing pf-data-engineer.md."""
        cmd_dir = project_with_custom_agents / ".claude" / "commands"
        (cmd_dir / "pf-data-engineer.md").write_text("# Existing custom command")

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_with_custom_agents)
        assert result["success"] is True

        # game-master should be generated
        assert (cmd_dir / "pf-game-master.md").exists()
        gm_content = (cmd_dir / "pf-game-master.md").read_text()
        assert "pf agent start" in gm_content

        # data-engineer should be preserved
        de_content = (cmd_dir / "pf-data-engineer.md").read_text()
        assert "Existing custom command" in de_content

    def test_does_not_overwrite_existing_skill_dir(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Existing skill directories with user modifications must be preserved."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "data-engineer.md").write_text(
            "# Data Engineer Agent\n<role>Data pipelines</role>\n"
        )
        templates_dir = project_root / ".pennyfarthing" / "templates" / "skills"
        templates_dir.mkdir(parents=True)
        (templates_dir / "pf-data-engineer.md").write_text(
            "---\nname: data-engineer\n---\n\n# Template Skill\n"
        )

        # Pre-create skill dir with user content
        skill_dir = project_root / ".claude" / "skills" / "pf-data-engineer"
        skill_dir.mkdir(parents=True)
        user_file = skill_dir / "custom-reference.md"
        user_file.write_text("# User's custom reference\nDo not delete")

        from pf.init.core import generate_custom_agent_commands

        generate_custom_agent_commands(project_root)

        assert user_file.exists()
        assert "Do not delete" in user_file.read_text()


# ---------------------------------------------------------------------------
# AC 5: Log generation results to pf init output
# ---------------------------------------------------------------------------


class TestLogGenerationResults:
    """AC 5: Result dict includes counts and details for logging."""

    def test_result_has_generated_commands_list(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Result must include list of generated command files."""
        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_with_custom_agents)
        assert "generated_commands" in result["data"]
        assert isinstance(result["data"]["generated_commands"], list)

    def test_result_has_preserved_commands_list(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Result must include list of preserved (not overwritten) files."""
        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert "preserved_commands" in result["data"]
        assert isinstance(result["data"]["preserved_commands"], list)

    def test_result_has_generated_skills_list(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Result must include list of generated skill directories."""
        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert "generated_skills" in result["data"]
        assert isinstance(result["data"]["generated_skills"], list)

    def test_generated_command_entry_has_agent_name(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Each generated command entry should include the agent name."""
        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_with_custom_agents)
        for entry in result["data"]["generated_commands"]:
            assert "agent_name" in entry
            assert "command_file" in entry

    def test_init_project_includes_custom_agent_data(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """init_project() result should include custom agent generation data."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "1.0.0", "install_method": "pipx", "path": "/usr/bin/pf"}):
            with patch("pf.init.core._install_portraits", return_value={"success": True}):
                with patch("pf.init.core._symlink_portraits", return_value=True):
                    with patch("pf.init.setup.run_setup", return_value={"success": True, "data": {}}):
                        result = init_project(project_with_custom_agents, dist_root)

        assert result["success"] is True
        data = result["data"]
        # init_project must report custom agent generation in its output
        assert "custom_agents" in data or "custom_commands_generated" in data


# ---------------------------------------------------------------------------
# Integration: generate_custom_agent_commands called during init
# ---------------------------------------------------------------------------


class TestInitIntegration:
    """Verify generate_custom_agent_commands is wired into init_project."""

    def test_init_generates_command_files_for_custom_agents(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Running init_project on a project with agents-local/ agents
        must produce command files in .claude/commands/."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "1.0.0", "install_method": "pipx", "path": "/usr/bin/pf"}):
            with patch("pf.init.core._install_portraits", return_value={"success": True}):
                with patch("pf.init.core._symlink_portraits", return_value=True):
                    with patch("pf.init.setup.run_setup", return_value={"success": True, "data": {}}):
                        result = init_project(project_with_custom_agents, dist_root)

        assert result["success"] is True
        cmd_dir = project_with_custom_agents / ".claude" / "commands"
        assert (cmd_dir / "pf-data-engineer.md").exists()
        assert (cmd_dir / "pf-game-master.md").exists()

    def test_init_preserves_custom_commands_on_rerun(
        self, project_with_custom_agents: Path, dist_root: Path
    ) -> None:
        """Running init twice must not clobber custom command files created
        or modified by the user between runs."""
        from pf.init.core import init_project

        mock_ctx = {
            "pf_cli": {"success": True, "version": "1.0.0", "install_method": "pipx", "path": "/usr/bin/pf"},
        }

        def run_init():
            with patch("pf.init.core.verify_pf_cli", return_value=mock_ctx["pf_cli"]):
                with patch("pf.init.core._install_portraits", return_value={"success": True}):
                    with patch("pf.init.core._symlink_portraits", return_value=True):
                        with patch("pf.init.setup.run_setup", return_value={"success": True, "data": {}}):
                            return init_project(project_with_custom_agents, dist_root)

        # First run — generates command files
        result1 = run_init()
        assert result1["success"] is True

        # User modifies a command file
        cmd_file = (
            project_with_custom_agents / ".claude" / "commands" / "pf-data-engineer.md"
        )
        cmd_file.write_text("# User-modified activation\nCustom workflow for my team")

        # Second run — should NOT overwrite the user's modification
        result2 = run_init()
        assert result2["success"] is True

        content = cmd_file.read_text()
        assert "Custom workflow for my team" in content


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_agent_name_with_dots(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Agent names with dots (e.g., 'v2.agent') should work."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "v2.agent.md").write_text("# V2 Agent\n<role>Test</role>\n")

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert result["success"] is True

        cmd_file = project_root / ".claude" / "commands" / "pf-v2.agent.md"
        assert cmd_file.exists()

    def test_agent_name_with_underscores(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Agent names with underscores should work."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        (local_dir / "my_agent.md").write_text("# My Agent\n<role>Test</role>\n")

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert result["success"] is True
        assert (project_root / ".claude" / "commands" / "pf-my_agent.md").exists()

    def test_many_agents(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """Handles a project with many custom agents."""
        local_dir = project_root / ".pennyfarthing" / "agents-local"
        for i in range(10):
            (local_dir / f"agent-{i}.md").write_text(
                f"# Agent {i}\n<role>Role {i}</role>\n"
            )

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert result["success"] is True
        assert len(result["data"]["generated_commands"]) == 10

    def test_claude_commands_dir_created_if_missing(
        self, tmp_path: Path, dist_root: Path
    ) -> None:
        """If .claude/commands/ doesn't exist yet, it should be created."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        local_dir = pf_dir / "agents-local"
        local_dir.mkdir()
        (local_dir / "my-agent.md").write_text("# My Agent\n<role>Test</role>\n")
        # Deliberately NOT creating .claude/commands/

        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(tmp_path)
        assert result["success"] is True

        cmd_file = tmp_path / ".claude" / "commands" / "pf-my-agent.md"
        assert cmd_file.exists()


# ---------------------------------------------------------------------------
# Rule enforcement: Return Results, Don't Throw (SOUL #10)
# ---------------------------------------------------------------------------


class TestRuleEnforcement:
    """Tests derived from project principles and Python rules."""

    def test_returns_result_dict_not_throws(
        self, project_root: Path, dist_root: Path
    ) -> None:
        """SOUL #10: generate_custom_agent_commands must return a result dict,
        not raise exceptions."""
        from pf.init.core import generate_custom_agent_commands

        result = generate_custom_agent_commands(project_root)
        assert isinstance(result, dict)
        assert "success" in result

    def test_function_has_type_annotations(self) -> None:
        """Public functions must have type annotations."""
        import inspect

        from pf.init.core import generate_custom_agent_commands

        sig = inspect.signature(generate_custom_agent_commands)
        assert sig.return_annotation is not inspect.Parameter.empty, (
            "generate_custom_agent_commands() must have a return type annotation"
        )

    def test_uses_pathlib_not_string_paths(self) -> None:
        """Path handling must use pathlib, not string concatenation."""
        import inspect

        from pf.init.core import generate_custom_agent_commands

        source = inspect.getsource(generate_custom_agent_commands)
        assert "os.path.join" not in source, (
            "generate_custom_agent_commands() should use pathlib, not os.path.join"
        )
