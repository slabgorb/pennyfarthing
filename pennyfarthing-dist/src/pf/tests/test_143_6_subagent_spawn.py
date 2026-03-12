"""Tests for 143-6: SM spawns single subagent via Agent tool.

Tests the infrastructure for SM to spawn native Claude Code subagents:
- Native agent definition loading and validation
- SUBAGENT context tier in prime
- Subagent prompt construction
- Tool restriction extraction from frontmatter
- Subagent result parsing
"""

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def native_agents_dir(tmp_path: Path) -> Path:
    """Create a tmp dir with native agent definitions."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    agents_dir = pf_dir / "agents"
    agents_dir.mkdir()
    native_dir = agents_dir / "native"
    native_dir.mkdir()

    # Dev agent with tool restrictions
    (native_dir / "dev.md").write_text(
        "---\n"
        "name: Dev\n"
        "description: Developer agent\n"
        "model: opus\n"
        "allowed-tools:\n"
        "  - Read\n"
        "  - Write\n"
        "  - Edit\n"
        "  - Bash\n"
        "  - Glob\n"
        "  - Grep\n"
        "  - Agent\n"
        "  - Skill\n"
        "---\n"
        "\n"
        "# Dev Agent\n"
        "\n"
        "Implementation agent.\n"
    )

    # TEA agent with different restrictions
    (native_dir / "tea.md").write_text(
        "---\n"
        "name: TEA\n"
        "description: Test Engineer agent\n"
        "model: opus\n"
        "allowed-tools:\n"
        "  - Read\n"
        "  - Write\n"
        "  - Edit\n"
        "  - Bash\n"
        "  - Glob\n"
        "  - Grep\n"
        "  - Agent\n"
        "  - Skill\n"
        "---\n"
        "\n"
        "# TEA Agent\n"
        "\n"
        "Test engineer agent.\n"
    )

    # Reviewer agent
    (native_dir / "reviewer.md").write_text(
        "---\n"
        "name: Reviewer\n"
        "description: Code review agent\n"
        "model: opus\n"
        "allowed-tools:\n"
        "  - Read\n"
        "  - Glob\n"
        "  - Grep\n"
        "  - Bash\n"
        "---\n"
        "\n"
        "# Reviewer Agent\n"
        "\n"
        "Code review agent.\n"
    )

    # Also create the regular (non-native) agent def for sm
    (agents_dir / "sm.md").write_text("# SM Agent\nScrum Master")

    return native_dir


@pytest.fixture
def project_with_session(tmp_path: Path, native_agents_dir: Path) -> Path:
    """Create a project with session, sprint, and native agents."""
    # Sprint
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(
        yaml.dump(
            {
                "sprint": {"number": 2610, "goal": "Test sprint"},
                "epics": [],
                "stories": [],
            }
        )
    )

    # Session file
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "143-6-session.md").write_text(
        "# Session: 143-6\n\n"
        "**Story:** 143-6\n"
        "**Workflow:** tdd\n"
        "**Phase:** red\n"
        "**Repos:** pennyfarthing\n"
    )

    # Repos topology
    pf_dir = tmp_path / ".pennyfarthing"
    (pf_dir / "repos.yaml").write_text(
        yaml.dump({"repos": {"pennyfarthing": {"path": "pennyfarthing", "type": "framework"}}})
    )

    return tmp_path


@pytest.fixture
def handoff_doc(tmp_path: Path) -> Path:
    """Create a sample handoff document from a prior phase."""
    session_dir = tmp_path / ".session"
    session_dir.mkdir(exist_ok=True)
    handoff_file = session_dir / "143-6-handoff-red.md"
    handoff_file.write_text(
        "# Handoff: red -> green\n"
        "**Story:** 143-6  |  **Agent:** tea  |  **Timestamp:** 2026-03-12T10:00:00Z\n"
        "**Workflow:** tdd\n"
        "\n"
        "## Summary\n"
        "Wrote 5 failing tests for subagent spawning.\n"
        "\n"
        "## Deliverables\n"
        "- `src/pf/tests/test_subagent.py`: 5 failing tests\n"
        "\n"
        "## Test Status\n"
        "- Passing: 0\n"
        "- Failing: 5\n"
    )
    return handoff_file


# =============================================================================
# AC1: SM can spawn a native subagent using the Agent tool
# =============================================================================


class TestLoadNativeAgentDefinition:
    """Test loading native agent definitions from agents/native/."""

    def test_load_existing_native_agent(self, native_agents_dir: Path) -> None:
        """Loading a native agent definition returns its content."""
        from pf.subagent.loader import load_native_agent_definition

        project_root = native_agents_dir.parent.parent.parent
        result = load_native_agent_definition("dev", project_root)

        assert result is not None
        assert "# Dev Agent" in result["content"]
        assert result["path"].name == "dev.md"

    def test_load_nonexistent_native_agent(self, native_agents_dir: Path) -> None:
        """Loading a non-existent native agent returns None."""
        from pf.subagent.loader import load_native_agent_definition

        project_root = native_agents_dir.parent.parent.parent
        result = load_native_agent_definition("nonexistent", project_root)

        assert result is None

    def test_list_available_native_agents(self, native_agents_dir: Path) -> None:
        """Listing native agents returns all .md files in agents/native/."""
        from pf.subagent.loader import list_native_agents

        project_root = native_agents_dir.parent.parent.parent
        agents = list_native_agents(project_root)

        assert len(agents) == 3
        names = {a["name"] for a in agents}
        assert names == {"dev", "tea", "reviewer"}

    def test_native_agent_path_resolution(self, native_agents_dir: Path) -> None:
        """Native agent path resolves to .pennyfarthing/agents/native/{name}.md."""
        from pf.subagent.loader import get_native_agent_path

        project_root = native_agents_dir.parent.parent.parent
        path = get_native_agent_path("tea", project_root)

        assert path is not None
        assert path.name == "tea.md"
        assert "native" in str(path)


# =============================================================================
# AC2: Subagent receives correct context from pf prime
# =============================================================================


class TestSubagentContextTier:
    """Test the SUBAGENT context tier for prime output."""

    def test_subagent_tier_exists(self) -> None:
        """SUBAGENT is a valid context tier."""
        from pf.prime.tiers import ContextTier, tier_from_string

        tier = tier_from_string("SUBAGENT")
        assert tier == ContextTier.SUBAGENT

    def test_subagent_tier_excludes_agent_definition(
        self, project_with_session: Path
    ) -> None:
        """SUBAGENT tier should NOT include agent definition (it comes from the .md file)."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            ContextTier.SUBAGENT, "dev", project_with_session
        )

        assert "agent_definition" not in components

    def test_subagent_tier_includes_session(
        self, project_with_session: Path
    ) -> None:
        """SUBAGENT tier includes session context."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            ContextTier.SUBAGENT, "dev", project_with_session
        )

        assert "session_header" in components

    def test_subagent_tier_includes_sprint(
        self, project_with_session: Path
    ) -> None:
        """SUBAGENT tier includes sprint context."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            ContextTier.SUBAGENT, "dev", project_with_session
        )

        assert "sprint_context" in components

    def test_subagent_tier_includes_repos_topology(
        self, project_with_session: Path
    ) -> None:
        """SUBAGENT tier includes repos topology."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            ContextTier.SUBAGENT, "dev", project_with_session
        )

        assert "repos_topology" in components

    def test_subagent_tier_excludes_behavior_guide(
        self, project_with_session: Path
    ) -> None:
        """SUBAGENT tier excludes behavior guide (native agent has its own)."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            ContextTier.SUBAGENT, "dev", project_with_session
        )

        assert "behavior_guide" not in components

    def test_subagent_tier_excludes_persona(
        self, project_with_session: Path
    ) -> None:
        """SUBAGENT tier excludes persona (native agent definition handles persona)."""
        from pf.prime.tiers import ContextTier, load_tier_components

        components = load_tier_components(
            ContextTier.SUBAGENT, "dev", project_with_session
        )

        assert "persona" not in components
        assert "persona_compressed" not in components


class TestBuildSubagentPrompt:
    """Test prompt construction for spawning a subagent."""

    def test_build_prompt_includes_context(
        self, project_with_session: Path
    ) -> None:
        """Built prompt includes prime context sections."""
        from pf.subagent.prompt import build_subagent_prompt

        prompt = build_subagent_prompt(
            agent_name="dev",
            story_id="143-6",
            task_description="Implement the subagent spawning feature.",
            project_root=project_with_session,
        )

        assert "143-6" in prompt
        assert "Implement the subagent spawning feature." in prompt

    def test_build_prompt_includes_handoff(
        self, project_with_session: Path, handoff_doc: Path
    ) -> None:
        """Built prompt includes prior phase handoff document when available."""
        from pf.subagent.prompt import build_subagent_prompt

        prompt = build_subagent_prompt(
            agent_name="dev",
            story_id="143-6",
            task_description="Make the tests pass.",
            project_root=project_with_session,
            prior_handoff_path=handoff_doc,
        )

        assert "Prior Phase Context" in prompt
        assert "Wrote 5 failing tests" in prompt

    def test_build_prompt_without_handoff(
        self, project_with_session: Path
    ) -> None:
        """Built prompt works without a prior handoff document."""
        from pf.subagent.prompt import build_subagent_prompt

        prompt = build_subagent_prompt(
            agent_name="tea",
            story_id="143-6",
            task_description="Write failing tests for subagent spawn.",
            project_root=project_with_session,
        )

        # Should not contain prior phase section
        assert "Prior Phase Context" not in prompt
        # Should contain the task
        assert "Write failing tests" in prompt

    def test_build_prompt_has_task_section(
        self, project_with_session: Path
    ) -> None:
        """Built prompt has a clearly demarcated task section."""
        from pf.subagent.prompt import build_subagent_prompt

        prompt = build_subagent_prompt(
            agent_name="dev",
            story_id="143-6",
            task_description="Make the failing tests pass.",
            project_root=project_with_session,
        )

        # Task section should be clearly marked
        assert "## Task" in prompt or "# Task" in prompt


# =============================================================================
# AC3: Subagent runs in isolated context with role-specific tool restrictions
# =============================================================================


class TestToolRestrictions:
    """Test tool restriction extraction from native agent frontmatter."""

    def test_extract_allowed_tools(self, native_agents_dir: Path) -> None:
        """Extract allowed-tools from native agent frontmatter."""
        from pf.subagent.loader import get_agent_tool_restrictions

        project_root = native_agents_dir.parent.parent.parent
        tools = get_agent_tool_restrictions("dev", project_root)

        assert tools is not None
        assert "Read" in tools
        assert "Write" in tools
        assert "Edit" in tools
        assert "Bash" in tools

    def test_reviewer_has_restricted_tools(self, native_agents_dir: Path) -> None:
        """Reviewer has fewer tools than Dev (no Write, Edit)."""
        from pf.subagent.loader import get_agent_tool_restrictions

        project_root = native_agents_dir.parent.parent.parent
        reviewer_tools = get_agent_tool_restrictions("reviewer", project_root)
        dev_tools = get_agent_tool_restrictions("dev", project_root)

        assert reviewer_tools is not None
        assert dev_tools is not None
        assert len(reviewer_tools) < len(dev_tools)
        assert "Write" not in reviewer_tools
        assert "Edit" not in reviewer_tools

    def test_nonexistent_agent_returns_none(self, native_agents_dir: Path) -> None:
        """Tool restrictions for nonexistent agent returns None."""
        from pf.subagent.loader import get_agent_tool_restrictions

        project_root = native_agents_dir.parent.parent.parent
        tools = get_agent_tool_restrictions("nonexistent", project_root)

        assert tools is None

    def test_extract_model_from_frontmatter(self, native_agents_dir: Path) -> None:
        """Extract model specification from native agent frontmatter."""
        from pf.subagent.loader import get_agent_model

        project_root = native_agents_dir.parent.parent.parent
        model = get_agent_model("dev", project_root)

        assert model == "opus"


# =============================================================================
# AC4: Subagent returns results to SM when complete
# =============================================================================


class TestSubagentResultParsing:
    """Test parsing of subagent return values."""

    def test_parse_successful_result(self) -> None:
        """Parse a successful subagent result with handoff document path."""
        from pf.subagent.result import parse_subagent_result

        raw_result = (
            "I completed the implementation.\n\n"
            "SUBAGENT_RESULT:\n"
            "  status: success\n"
            "  handoff_document: .session/143-6-handoff-green.md\n"
            "  tests_passing: 5\n"
            "  tests_failing: 0\n"
        )

        result = parse_subagent_result(raw_result)

        assert result["status"] == "success"
        assert result["handoff_document"] == ".session/143-6-handoff-green.md"

    def test_parse_failed_result(self) -> None:
        """Parse a failed subagent result."""
        from pf.subagent.result import parse_subagent_result

        raw_result = (
            "I encountered an error.\n\n"
            "SUBAGENT_RESULT:\n"
            "  status: error\n"
            "  error: Could not find test files\n"
        )

        result = parse_subagent_result(raw_result)

        assert result["status"] == "error"
        assert "Could not find test files" in result["error"]

    def test_parse_result_without_marker(self) -> None:
        """Result without SUBAGENT_RESULT marker returns raw text."""
        from pf.subagent.result import parse_subagent_result

        raw_result = "Just some text output without structured result."

        result = parse_subagent_result(raw_result)

        assert result["status"] == "unknown"
        assert result["raw"] == raw_result

    def test_validate_handoff_document_exists(
        self, project_with_session: Path, handoff_doc: Path
    ) -> None:
        """Validate that a referenced handoff document actually exists."""
        from pf.subagent.result import validate_handoff_reference

        is_valid = validate_handoff_reference(
            str(handoff_doc.relative_to(project_with_session)),
            project_with_session,
        )

        assert is_valid is True

    def test_validate_missing_handoff_document(
        self, project_with_session: Path
    ) -> None:
        """Validate returns False for missing handoff document."""
        from pf.subagent.result import validate_handoff_reference

        is_valid = validate_handoff_reference(
            ".session/nonexistent-handoff.md",
            project_with_session,
        )

        assert is_valid is False


# =============================================================================
# Integration: End-to-end subagent spawn flow
# =============================================================================


class TestSubagentSpawnFlow:
    """Integration tests for the full spawn flow."""

    def test_spawn_config_assembly(
        self, project_with_session: Path, native_agents_dir: Path
    ) -> None:
        """Assemble a complete spawn configuration for the Agent tool."""
        from pf.subagent.spawn import build_spawn_config

        config = build_spawn_config(
            agent_name="dev",
            story_id="143-6",
            task_description="Implement subagent spawning.",
            project_root=project_with_session,
        )

        assert config["agent_name"] == "dev"
        assert config["model"] == "opus"
        assert "prompt" in config
        assert len(config["prompt"]) > 0
        assert "allowed_tools" in config
        assert "Read" in config["allowed_tools"]

    def test_spawn_config_for_reviewer(
        self, project_with_session: Path, native_agents_dir: Path
    ) -> None:
        """Reviewer spawn config has restricted tools."""
        from pf.subagent.spawn import build_spawn_config

        config = build_spawn_config(
            agent_name="reviewer",
            story_id="143-6",
            task_description="Review the implementation.",
            project_root=project_with_session,
        )

        assert "Write" not in config["allowed_tools"]
        assert "Edit" not in config["allowed_tools"]
        assert "Read" in config["allowed_tools"]

    def test_spawn_config_includes_native_agent_path(
        self, project_with_session: Path, native_agents_dir: Path
    ) -> None:
        """Spawn config includes the path to the native agent definition."""
        from pf.subagent.spawn import build_spawn_config

        config = build_spawn_config(
            agent_name="tea",
            story_id="143-6",
            task_description="Write failing tests.",
            project_root=project_with_session,
        )

        assert "native_agent_path" in config
        assert config["native_agent_path"].name == "tea.md"

    def test_spawn_config_nonexistent_agent_fails(
        self, project_with_session: Path
    ) -> None:
        """Building spawn config for nonexistent agent returns error."""
        from pf.subagent.spawn import build_spawn_config

        config = build_spawn_config(
            agent_name="nonexistent",
            story_id="143-6",
            task_description="Do something.",
            project_root=project_with_session,
        )

        assert config["status"] == "error"
        assert "not found" in config["error"].lower()
