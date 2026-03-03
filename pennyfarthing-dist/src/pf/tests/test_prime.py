"""Tests for pf.prime module.

Tests context loading for prime command.
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from pf.prime.cli import main, prime
from pf.prime.loader import (
    _extract_session_parts,
    _find_session_file,
    load_agent_definition,
    load_behavior_guide,
    load_domain_docs,
    load_session_context,
    load_sidecars,
    load_sprint_context,
)


class TestLoadAgentDefinition:
    """Tests for load_agent_definition function."""

    def test_load_existing_agent(self, tmp_path: Path) -> None:
        """Test loading an existing agent definition."""
        # Setup
        agents_dir = tmp_path / ".pennyfarthing" / "agents"
        agents_dir.mkdir(parents=True)
        agent_file = agents_dir / "dev.md"
        agent_file.write_text("# Developer Agent\n\nTest content")

        # Test
        result = load_agent_definition("dev", tmp_path)

        # Verify
        assert result is not None
        assert "# Developer Agent" in result
        assert "Test content" in result

    def test_load_nonexistent_agent(self, tmp_path: Path) -> None:
        """Test loading a non-existent agent returns None."""
        # Setup
        agents_dir = tmp_path / ".pennyfarthing" / "agents"
        agents_dir.mkdir(parents=True)

        # Test
        result = load_agent_definition("nonexistent", tmp_path)

        # Verify
        assert result is None


class TestLoadBehaviorGuide:
    """Tests for load_behavior_guide function."""

    def test_load_existing_guide(self, tmp_path: Path) -> None:
        """Test loading an existing behavior guide."""
        # Setup
        guides_dir = tmp_path / ".pennyfarthing" / "guides"
        guides_dir.mkdir(parents=True)
        guide_file = guides_dir / "agent-behavior.md"
        guide_file.write_text("# Agent Behavior Guide\n\nShared protocols")

        # Test
        result = load_behavior_guide(tmp_path)

        # Verify
        assert result is not None
        assert "# Agent Behavior Guide" in result

    def test_load_nonexistent_guide(self, tmp_path: Path) -> None:
        """Test loading a non-existent guide returns None.

        Patches get_dist_root() to return None to suppress the bundled
        _dist fallback, so only project-local guides are searched.
        """
        # Setup
        guides_dir = tmp_path / ".pennyfarthing" / "guides"
        guides_dir.mkdir(parents=True)
        # No agent-behavior.md file created

        # Patch the bundled _dist fallback out so only project-local paths are searched
        with patch("pf.prime.loader.get_dist_root", return_value=None):
            result = load_behavior_guide(tmp_path)

        # Verify
        assert result is None


class TestLoadSprintContext:
    """Tests for load_sprint_context function."""

    def test_load_sprint_context(self, tmp_path: Path, sample_sprint_data: dict) -> None:
        """Test loading sprint context."""
        import yaml

        # Setup
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        sprint_file = sprint_dir / "current-sprint.yaml"
        # Add sprint number for the test
        sample_sprint_data["sprint"]["number"] = 2604
        sample_sprint_data["sprint"]["goal"] = "Test Goal"
        sprint_file.write_text(yaml.dump(sample_sprint_data))

        # Also need .pennyfarthing dir for project root detection
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Test
        with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
            with patch("pf.sprint.loader.get_project_root", return_value=tmp_path):
                result = load_sprint_context(tmp_path)

        # Verify
        assert result is not None
        assert "Sprint 2604" in result

    def test_no_sprint_file(self, tmp_path: Path) -> None:
        """Test when no sprint file exists."""
        # Setup - no sprint file
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Test
        result = load_sprint_context(tmp_path)

        # Verify
        assert result is None


class TestExtractSessionParts:
    """Tests for _extract_session_parts function."""

    def test_extract_header_and_assessment(self) -> None:
        """Test extracting header and assessment from session file."""
        content = """# Session: Test Story

Story: 63-1
Status: in_progress
Agent: dev

## TEA Assessment

Tests written successfully.
Coverage: 85%

## Dev Assessment

Implementation complete.
All tests passing.
"""
        header, assessment = _extract_session_parts(content)

        # Header should be everything before first ##
        assert "# Session: Test Story" in header
        assert "Story: 63-1" in header
        assert "Agent: dev" in header

        # Assessment should be the LAST assessment section
        assert "## Dev Assessment" in assessment
        assert "Implementation complete" in assessment
        # Should NOT include TEA assessment
        assert "TEA Assessment" not in assessment

    def test_extract_no_assessment(self) -> None:
        """Test when no assessment section exists."""
        content = """# Session: Test Story

Story: 63-1
Status: in_progress
"""
        header, assessment = _extract_session_parts(content)

        assert "# Session: Test Story" in header
        assert assessment == ""

    def test_extract_header_only(self) -> None:
        """Test file with only header content."""
        content = "# Session Header\n\nSome metadata"

        header, assessment = _extract_session_parts(content)

        assert "# Session Header" in header
        assert assessment == ""


class TestFindSessionFile:
    """Tests for _find_session_file function."""

    def test_find_session_file(self, tmp_path: Path) -> None:
        """Test finding session file."""
        # Setup
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        session_file = session_dir / "63-1-session.md"
        session_file.write_text("# Session")

        # Test
        result = _find_session_file(tmp_path)

        # Verify
        assert result is not None
        assert result.name == "63-1-session.md"

    def test_no_session_directory(self, tmp_path: Path) -> None:
        """Test when no session directory exists."""
        result = _find_session_file(tmp_path)
        assert result is None

    def test_empty_session_directory(self, tmp_path: Path) -> None:
        """Test when session directory is empty."""
        session_dir = tmp_path / ".session"
        session_dir.mkdir()

        result = _find_session_file(tmp_path)
        assert result is None


class TestLoadSessionContext:
    """Tests for load_session_context function."""

    def test_load_session_context(self, tmp_path: Path) -> None:
        """Test loading full session context."""
        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        session_file = session_dir / "63-1-session.md"
        session_file.write_text("""# Session: Story 63-1

Story: 63-1
Status: in_progress

## Dev Assessment

Work complete.
""")

        # Test
        with patch("pf.prime.loader.get_project_root", return_value=tmp_path):
            result = load_session_context(tmp_path)

        # Verify
        assert result is not None
        filename, header, assessment = result
        assert filename == "63-1-session.md"
        assert "# Session: Story 63-1" in header
        assert "## Dev Assessment" in assessment


class TestLoadSidecars:
    """Tests for load_sidecars function."""

    def test_load_all_sidecars(self, tmp_path: Path) -> None:
        """Test loading all sidecar files."""
        # Setup
        sidecar_dir = tmp_path / ".pennyfarthing" / "sidecars" / "dev"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Patterns")
        (sidecar_dir / "gotchas.md").write_text("# Gotchas")
        (sidecar_dir / "decisions.md").write_text("# Decisions")

        # Test
        result = load_sidecars("dev", tmp_path)

        # Verify
        assert len(result) == 3
        assert "# Patterns" in result["patterns.md"]
        assert "# Gotchas" in result["gotchas.md"]
        assert "# Decisions" in result["decisions.md"]

    def test_load_partial_sidecars(self, tmp_path: Path) -> None:
        """Test loading when only some sidecars exist."""
        # Setup
        sidecar_dir = tmp_path / ".pennyfarthing" / "sidecars" / "dev"
        sidecar_dir.mkdir(parents=True)
        (sidecar_dir / "patterns.md").write_text("# Patterns only")

        # Test
        result = load_sidecars("dev", tmp_path)

        # Verify
        assert len(result) == 1
        assert "patterns.md" in result

    def test_no_sidecar_directory(self, tmp_path: Path) -> None:
        """Test when no sidecar directory exists."""
        result = load_sidecars("dev", tmp_path)
        assert result == {}


class TestLoadDomainDocs:
    """Tests for load_domain_docs function."""

    def test_load_domain_docs(self, tmp_path: Path) -> None:
        """Test loading domain documentation."""
        # Setup
        project_dir = tmp_path / ".claude" / "project"
        project_dir.mkdir(parents=True)
        (project_dir / "CLAUDE-api.md").write_text("# API Docs")
        (project_dir / "CLAUDE-testing.md").write_text("# Testing Docs")
        (project_dir / "other-file.md").write_text("# Not included")

        # Test
        result = load_domain_docs(tmp_path)

        # Verify
        assert len(result) == 2
        filenames = [f for f, _ in result]
        assert "CLAUDE-api.md" in filenames
        assert "CLAUDE-testing.md" in filenames
        assert "other-file.md" not in filenames

    def test_no_domain_docs_directory(self, tmp_path: Path) -> None:
        """Test when no .claude/project directory exists."""
        result = load_domain_docs(tmp_path)
        assert result == []


class TestPrimeFunction:
    """Tests for the prime() function."""

    def test_minimal_mode(self, tmp_path: Path, capsys) -> None:
        """Test minimal mode returns immediately."""
        result = prime(minimal=True, project_root=tmp_path)

        assert result == 0
        captured = capsys.readouterr()
        assert captured.out == ""

    def test_quiet_suppresses_headers(self, tmp_path: Path, capsys) -> None:
        """Test quiet mode suppresses headers but shows content."""
        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("Agent content here")

        # Test
        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = prime(agent_name="dev", quiet=True, project_root=tmp_path)

        # Verify
        assert result == 0
        captured = capsys.readouterr()
        assert "Agent content here" in captured.out
        assert "# Agent Definition" not in captured.out


class TestMainCLI:
    """Tests for CLI main() function."""

    def test_help_flag(self) -> None:
        """Test --help flag."""
        with pytest.raises(SystemExit) as exc_info:
            main(["--help"])
        assert exc_info.value.code == 0

    def test_minimal_flag(self, capsys) -> None:
        """Test --minimal flag."""
        # With minimal, should just return 0 without any output
        with patch("pf.prime.cli.get_project_root") as mock_root:
            mock_root.return_value = Path("/tmp/test")
            result = main(["--minimal"])

        assert result == 0
        captured = capsys.readouterr()
        assert captured.out == ""

    def test_agent_flag(self, tmp_path: Path, capsys) -> None:
        """Test --agent flag."""
        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "tea.md").write_text("# TEA Agent\nTest content")

        # Test
        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "tea"])

        # Verify
        assert result == 0
        captured = capsys.readouterr()
        assert "# TEA Agent" in captured.out

    def test_project_not_found_error(self, capsys) -> None:
        """Test error handling when project root not found."""
        with patch(
            "pf.prime.cli.get_project_root",
            side_effect=FileNotFoundError("No project found"),
        ):
            result = main([])

        assert result == 1
        captured = capsys.readouterr()
        assert "Error" in captured.err


# =============================================================================
# Prime v2 Tests - Workflow State Detection
# =============================================================================


class TestWorkflowStateDetection:
    """Tests for workflow state detection (Prime v2)."""

    def test_detect_finish_state(self, tmp_path: Path) -> None:
        """Test detecting FINISH_STATE when phase is approved."""
        from pf.prime.models import WorkflowState
        from pf.prime.workflow import detect_workflow_state

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        session_file = session_dir / "MSSCI-12345-session.md"
        session_file.write_text("""# MSSCI-12345: Test Story

## Story Context
- **ID:** MSSCI-12345
- **Workflow:** tdd

## Workflow Phase
- **Current Phase:** REVIEW (APPROVED)
""")

        # Test
        result = detect_workflow_state(tmp_path)

        # Verify
        assert result.state == WorkflowState.FINISH_STATE
        assert result.story_id == "MSSCI-12345"
        assert result.phase_owner == "sm"

    def test_detect_in_progress_state(self, tmp_path: Path) -> None:
        """Test detecting IN_PROGRESS_STATE with active phase."""
        import yaml

        from pf.prime.models import WorkflowState
        from pf.prime.workflow import detect_workflow_state

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Create workflow YAML
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True)
        (workflows_dir / "tdd.yaml").write_text(yaml.dump({
            "workflow": {
                "phases": [
                    {"name": "setup", "agent": "sm"},
                    {"name": "red", "agent": "tea"},
                    {"name": "green", "agent": "dev"},
                    {"name": "review", "agent": "reviewer"},
                ]
            }
        }))

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        session_file = session_dir / "63-5-session.md"
        session_file.write_text("""# 63-5: Test Story

## Story Context
- **ID:** 63-5
- **Workflow:** tdd

## Workflow Phase
- **Current Phase:** green
""")

        # Test
        result = detect_workflow_state(tmp_path)

        # Verify
        assert result.state == WorkflowState.IN_PROGRESS_STATE
        assert result.story_id == "63-5"
        assert result.phase == "green"
        assert result.phase_owner == "dev"
        assert result.workflow == "tdd"

    def test_detect_new_work_state(self, tmp_path: Path) -> None:
        """Test detecting NEW_WORK_STATE with backlog stories."""
        import yaml

        from pf.prime.models import WorkflowState
        from pf.prime.workflow import detect_workflow_state

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(yaml.dump({
            "sprint": {"number": 12},
            "epics": [
                {
                    "id": "epic-1",
                    "stories": [
                        {"id": "1-1", "status": "backlog", "points": 3},
                        {"id": "1-2", "status": "ready", "points": 5},
                    ]
                }
            ]
        }))

        # Test
        result = detect_workflow_state(tmp_path)

        # Verify
        assert result.state == WorkflowState.NEW_WORK_STATE
        assert result.backlog_count == 2

    def test_detect_empty_backlog_state(self, tmp_path: Path) -> None:
        """Test detecting EMPTY_BACKLOG_STATE with no backlog."""
        import yaml

        from pf.prime.models import WorkflowState
        from pf.prime.workflow import detect_workflow_state

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(yaml.dump({
            "sprint": {"number": 12},
            "epics": [
                {
                    "id": "epic-1",
                    "stories": [
                        {"id": "1-1", "status": "done", "points": 3},
                    ]
                }
            ]
        }))

        # Test
        result = detect_workflow_state(tmp_path)

        # Verify
        assert result.state == WorkflowState.EMPTY_BACKLOG_STATE


class TestParseSessionHeader:
    """Tests for session header parsing."""

    def test_parse_standard_header(self, tmp_path: Path) -> None:
        """Test parsing a standard session header."""
        from pf.prime.workflow import parse_session_header

        session_file = tmp_path / "MSSCI-12345-session.md"
        session_file.write_text("""# MSSCI-12345: Test Story

## Story Context
- **ID:** MSSCI-12345
- **Workflow:** tdd

## Workflow Phase
- **Current Phase:** green
""")

        result = parse_session_header(session_file)

        assert result["story_id"] == "MSSCI-12345"
        assert result["workflow"] == "tdd"
        assert result["phase"] == "green"

    def test_parse_approved_phase(self, tmp_path: Path) -> None:
        """Test parsing phase with APPROVED status."""
        from pf.prime.workflow import parse_session_header

        session_file = tmp_path / "63-1-session.md"
        session_file.write_text("""# Session

- **Current Phase:** REVIEW (APPROVED)
""")

        result = parse_session_header(session_file)

        assert result["phase"] == "review"
        assert result["phase_status"] == "approved"


class TestCheckRedirect:
    """Tests for redirect detection."""

    def test_redirect_when_wrong_agent(self) -> None:
        """Test redirect is detected when wrong agent is activated."""
        from pf.prime.models import WorkflowState, WorkflowStatus
        from pf.prime.workflow import check_redirect

        status = WorkflowStatus(
            state=WorkflowState.IN_PROGRESS_STATE,
            phase="green",
            phase_owner="dev",
        )

        result = check_redirect(status, "tea")

        assert result is not None
        target, reason = result
        assert target == "dev"
        assert "green" in reason
        assert "dev" in reason

    def test_no_redirect_when_correct_agent(self) -> None:
        """Test no redirect when correct agent is activated."""
        from pf.prime.models import WorkflowState, WorkflowStatus
        from pf.prime.workflow import check_redirect

        status = WorkflowStatus(
            state=WorkflowState.IN_PROGRESS_STATE,
            phase="green",
            phase_owner="dev",
        )

        result = check_redirect(status, "dev")

        assert result is None

    def test_no_redirect_for_new_work(self) -> None:
        """Test no redirect for NEW_WORK_STATE."""
        from pf.prime.models import WorkflowState, WorkflowStatus
        from pf.prime.workflow import check_redirect

        status = WorkflowStatus(
            state=WorkflowState.NEW_WORK_STATE,
            backlog_count=5,
        )

        result = check_redirect(status, "dev")

        assert result is None


# =============================================================================
# Prime v2 Tests - Persona Loading
# =============================================================================


class TestPersonaLoading:
    """Tests for persona loading (Prime v2)."""

    def test_load_persona_from_theme(self, tmp_path: Path) -> None:
        """Test loading persona from theme YAML."""
        import yaml

        from pf.prime.persona import load_persona

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Create config
        (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test-theme"}))

        # Create theme
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test-theme.yaml").write_text(yaml.dump({
            "theme": {"name": "Test Theme"},
            "agents": {
                "dev": {
                    "character": "Test Developer",
                    "style": "Test style",
                    "role": "Test role",
                    "quote": "Test quote",
                }
            }
        }))

        # Test
        persona, theme = load_persona("dev", tmp_path)

        # Verify
        assert persona is not None
        assert persona.character == "Test Developer"
        assert persona.style == "Test style"
        assert persona.role == "Test role"
        assert persona.quote == "Test quote"
        assert theme == "test-theme"

    def test_load_persona_no_theme(self, tmp_path: Path) -> None:
        """Test load_persona returns None when no theme configured."""
        from pf.prime.persona import load_persona

        # Setup - no config
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Test
        persona, theme = load_persona("dev", tmp_path)

        # Verify
        assert persona is None
        assert theme is None

    def test_get_crew_manifest(self, tmp_path: Path) -> None:
        """Test getting crew manifest for handoff reference."""
        import yaml

        from pf.prime.persona import get_crew_manifest

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Create config
        (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test-theme"}))

        # Create theme with multiple agents
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test-theme.yaml").write_text(yaml.dump({
            "agents": {
                "sm": {"character": "Scrum Master"},
                "tea": {"character": "Test Engineer"},
                "dev": {"character": "Developer"},
            }
        }))

        # Test
        crew = get_crew_manifest(tmp_path)

        # Verify
        assert len(crew) == 3
        roles = {c.role for c in crew}
        assert "sm" in roles
        assert "tea" in roles
        assert "dev" in roles

    def test_format_persona_output(self) -> None:
        """Test formatting persona as XML."""
        from pf.prime.models import CrewMember, Persona
        from pf.prime.persona import format_persona_output

        persona = Persona(
            character="Naomi Nagata",
            style="Precise, systematic",
            role="The XO and engineer",
            quote="I can fix this.",
        )
        crew = [
            CrewMember(role="sm", character="Drummer"),
            CrewMember(role="dev", character="Naomi"),
        ]

        result = format_persona_output(persona, "the-expanse", "dev", crew, "Bossmang")

        assert '<persona agent="dev" theme="the-expanse">' in result
        assert "Character: Naomi Nagata" in result
        assert "Quote: I can fix this." in result
        assert "<user-title>Address the user as: Bossmang</user-title>" in result
        assert '<crew theme="the-expanse">' in result


# =============================================================================
# Prime v2 Tests - Session Registration
# =============================================================================


class TestSessionRegistration:
    """Tests for session registration (Prime v2)."""

    def test_register_session(self, tmp_path: Path) -> None:
        """Test registering a new session."""
        from pf.prime.session import register_session

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Test
        result = register_session("dev", session_id="test-123", project_root=tmp_path)

        # Verify
        assert result.session_id == "test-123"
        assert result.agent_name == "dev"

        # Check file was created
        session_file = tmp_path / ".session" / "agents" / "test-123"
        assert session_file.exists()
        assert session_file.read_text() == "dev"

    def test_register_session_generates_id(self, tmp_path: Path) -> None:
        """Test that session ID is generated if not provided."""
        from pf.prime.session import register_session

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        # Test
        result = register_session("tea", project_root=tmp_path)

        # Verify - should have a UUID-like session ID
        assert result.session_id is not None
        assert len(result.session_id) > 0

    def test_cleanup_old_sessions(self, tmp_path: Path) -> None:
        """Test cleanup of old session files."""
        import time

        from pf.prime.session import cleanup_old_sessions

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = tmp_path / ".session" / "agents"
        agents_dir.mkdir(parents=True)

        # Create an old session file
        old_session = agents_dir / "old-session"
        old_session.write_text("sm")
        # Set mtime to 10 days ago
        old_time = time.time() - (10 * 86400)
        import os
        os.utime(old_session, (old_time, old_time))

        # Create a new session file
        new_session = agents_dir / "new-session"
        new_session.write_text("dev")

        # Test
        removed = cleanup_old_sessions(tmp_path, max_age_days=7)

        # Verify
        assert removed == 1
        assert not old_session.exists()
        assert new_session.exists()

    def test_get_session_agent(self, tmp_path: Path) -> None:
        """Test getting agent name for a session."""
        from pf.prime.session import get_session_agent

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = tmp_path / ".session" / "agents"
        agents_dir.mkdir(parents=True)
        (agents_dir / "test-session").write_text("reviewer")

        # Test
        result = get_session_agent("test-session", tmp_path)

        # Verify
        assert result == "reviewer"

    def test_unregister_session(self, tmp_path: Path) -> None:
        """Test unregistering a session."""
        from pf.prime.session import unregister_session

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = tmp_path / ".session" / "agents"
        agents_dir.mkdir(parents=True)
        session_file = agents_dir / "to-remove"
        session_file.write_text("dev")

        # Test
        result = unregister_session("to-remove", tmp_path)

        # Verify
        assert result is True
        assert not session_file.exists()


# =============================================================================
# Prime v2 Tests - JSON Output
# =============================================================================


class TestJSONOutput:
    """Tests for JSON output (Prime v2)."""

    def test_json_output_minimal(self, tmp_path: Path, capsys) -> None:
        """Test JSON output in minimal mode."""
        import json

        result = prime(minimal=True, json_output=True, project_root=tmp_path)

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)
        assert data["minimal"] is True

    def test_json_output_with_workflow(self, tmp_path: Path, capsys) -> None:
        """Test JSON output includes workflow status."""
        import json

        import yaml

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "sm.md").write_text("# SM Agent\nScrum Master")
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text(yaml.dump({
            "sprint": {"number": 12},
            "epics": [
                {
                    "id": "epic-1",
                    "stories": [
                        {"id": "1-1", "status": "backlog", "points": 3},
                    ]
                }
            ]
        }))

        # Test
        result = prime(
            agent_name="sm",
            json_output=True,
            no_persona=True,
            no_register=True,
            project_root=tmp_path,
        )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        assert "workflow_status" in data
        assert data["workflow_status"]["state"] == "NEW_WORK_STATE"
        assert data["workflow_status"]["backlog_count"] == 1

    def test_json_output_with_redirect(self, tmp_path: Path, capsys) -> None:
        """Test JSON output includes redirect info."""
        import json

        import yaml

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "tea.md").write_text("# TEA Agent\nTest Engineer")

        # Create workflow YAML
        workflows_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        workflows_dir.mkdir(parents=True)
        (workflows_dir / "tdd.yaml").write_text(yaml.dump({
            "workflow": {
                "phases": [
                    {"name": "green", "agent": "dev"},
                ]
            }
        }))

        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "test-session.md").write_text("""# Test

- **Workflow:** tdd
- **Current Phase:** green
""")

        # Test - activating TEA when DEV owns the phase
        result = prime(
            agent_name="tea",
            json_output=True,
            no_persona=True,
            no_register=True,
            project_root=tmp_path,
        )

        assert result == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)

        assert data["redirect_to"] == "dev"
        assert "green" in data["redirect_reason"]


# =============================================================================
# Prime v2 Tests - CLI Flags
# =============================================================================


class TestCLIFlagsV2:
    """Tests for new CLI flags in Prime v2."""

    def test_json_flag(self, tmp_path: Path, capsys) -> None:
        """Test --json flag."""
        import json

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--json", "--no-workflow", "--no-register"])

        assert result == 0
        captured = capsys.readouterr()
        # Should be valid JSON
        data = json.loads(captured.out)
        assert "agent_name" in data

    def test_no_persona_flag(self, tmp_path: Path, capsys) -> None:
        """Test --no-persona flag skips persona loading."""
        import yaml

        # Setup
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "dev.md").write_text("# Dev Agent")

        # Create config and theme that would normally load
        (pf_dir / "config.local.yaml").write_text(yaml.dump({"theme": "test"}))
        themes_dir = pf_dir / "personas" / "themes"
        themes_dir.mkdir(parents=True)
        (themes_dir / "test.yaml").write_text(yaml.dump({
            "agents": {"dev": {"character": "Test", "style": "s", "role": "r"}}
        }))

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "dev", "--no-persona", "--no-workflow", "--no-register"])

        assert result == 0
        captured = capsys.readouterr()
        # Should NOT contain persona XML
        assert "<persona" not in captured.out
        # Should contain agent definition
        assert "# Dev Agent" in captured.out

    def test_no_workflow_flag(self, tmp_path: Path, capsys) -> None:
        """Test --no-workflow flag skips workflow detection."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--no-workflow", "--no-register"])

        assert result == 0
        captured = capsys.readouterr()
        # Should NOT contain workflow state header
        assert "# Workflow State" not in captured.out

    def test_session_id_flag(self, tmp_path: Path) -> None:
        """Test --session-id flag uses explicit ID."""
        from pf.prime.session import get_session_agent

        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        agents_dir = pf_dir / "agents"
        agents_dir.mkdir()
        (agents_dir / "sm.md").write_text("# SM Agent\nScrum Master")

        with patch("pf.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "sm", "--session-id", "explicit-123", "--no-workflow"])

        assert result == 0

        # Verify session was created with explicit ID
        agent = get_session_agent("explicit-123", tmp_path)
        assert agent == "sm"
