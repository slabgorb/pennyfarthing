"""Tests for pennyfarthing_scripts.prime module.

Tests context loading for prime command.
"""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from pennyfarthing_scripts.prime.loader import (
    load_agent_definition,
    load_behavior_guide,
    load_sprint_context,
    load_session_context,
    load_sidecars,
    load_domain_docs,
    _extract_session_parts,
    _find_session_file,
)
from pennyfarthing_scripts.prime.cli import prime, main


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
        """Test loading a non-existent guide returns None."""
        # Setup
        guides_dir = tmp_path / ".pennyfarthing" / "guides"
        guides_dir.mkdir(parents=True)

        # Test
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
        with patch("pennyfarthing_scripts.prime.loader.get_project_root", return_value=tmp_path):
            with patch("pennyfarthing_scripts.sprint.loader.get_project_root", return_value=tmp_path):
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
        with patch("pennyfarthing_scripts.prime.loader.get_project_root", return_value=tmp_path):
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
        with patch("pennyfarthing_scripts.prime.cli.get_project_root", return_value=tmp_path):
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
        with patch("pennyfarthing_scripts.prime.cli.get_project_root") as mock_root:
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
        with patch("pennyfarthing_scripts.prime.cli.get_project_root", return_value=tmp_path):
            result = main(["--agent", "tea"])

        # Verify
        assert result == 0
        captured = capsys.readouterr()
        assert "# TEA Agent" in captured.out

    def test_project_not_found_error(self, capsys) -> None:
        """Test error handling when project root not found."""
        with patch(
            "pennyfarthing_scripts.prime.cli.get_project_root",
            side_effect=FileNotFoundError("No project found"),
        ):
            result = main([])

        assert result == 1
        captured = capsys.readouterr()
        assert "Error" in captured.err
