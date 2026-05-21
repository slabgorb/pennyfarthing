"""Tests for pf CLI --json output commands (Story 141-16).

Story: PROJ-16150 - Add --json Output to pf CLI for GUI Consumption
Epic: 141 (Tech Debt Audit)

These tests verify structured JSON output from five pf CLI commands,
enabling the TypeScript layer to replace direct file parsing with
subprocess calls.

Acceptance Criteria:
- [AC1] Five commands support --json and return structured data
- [AC2] Output schema documented with consistent error contract
- [AC3] pf binary resolution strategy for non-PATH contexts
- [AC4] TypeScript layer can replace direct file parsing (integration)

Tests should fail until the implementation is complete.
"""

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import yaml
from click.testing import CliRunner

from pf.cli import cli

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _subprocess_env() -> dict:
    """Build env for subprocess calls with pf on sys.path."""
    src_dir = str(Path(__file__).resolve().parents[3] / "src")
    env = os.environ.copy()
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{src_dir}:{existing}" if existing else src_dir
    return env


SAMPLE_STORY = {
    "id": "141-16",
    "title": "Add --json Output to pf CLI for GUI Consumption",
    "points": 3,
    "status": "in_progress",
    "priority": "p1",
    "workflow": "tdd",
    "jira": "PROJ-16150",
    "description": "Add --json flags to five pf CLI commands",
}

SAMPLE_STORY_WITH_SESSION = {
    **SAMPLE_STORY,
    "phase": "red",
    "phase_owner": "tea",
    "branch": "story/141-16/add-json-output-pf-cli",
    "pr": None,
}

SAMPLE_WORKFLOW_PHASES = [
    {"name": "setup", "agent": "sm", "label": "Setup", "status": "done"},
    {"name": "red", "agent": "tea", "label": "Test Design", "status": "current"},
    {"name": "green", "agent": "dev", "label": "Implementation", "status": "pending"},
    {"name": "review", "agent": "reviewer", "label": "Code Review", "status": "pending"},
    {"name": "approved", "agent": "sm", "label": "Approved", "status": "pending"},
    {"name": "finish", "agent": "sm", "label": "Finish", "status": "pending"},
]

SAMPLE_PERSONA = {
    "agent": "sm",
    "character": "Leo McGarry",
    "theme": "west-wing",
    "style": "Chief of Staff who runs the White House through sheer will",
    "crew": [
        {"agent": "sm", "character": "Leo McGarry", "displayName": "Leo McGarry (SM)"},
        {"agent": "tea", "character": "Sam Seaborn", "displayName": "Sam Seaborn (TEA)"},
        {"agent": "dev", "character": "Toby Ziegler", "displayName": "Toby Ziegler (Dev)"},
    ],
}

SAMPLE_THEME_DATA = {
    "name": "west-wing",
    "theme": {
        "description": "The West Wing political drama",
        "tier": "prestige-tv",
    },
    "agents": {
        "sm": {"character": "Leo McGarry", "style": "Chief of Staff"},
        "tea": {"character": "Sam Seaborn", "style": "Deputy Communications Director"},
        "dev": {"character": "Toby Ziegler", "style": "Communications Director"},
    },
}

SAMPLE_HANDOFF_STATUS = {
    "story_id": "141-16",
    "phase": "red",
    "workflow": "tdd",
    "gate_type": "tests_fail",
    "next_phase": "green",
    "next_agent": "dev",
    "status": "active",
}


# ===========================================================================
# AC1: pf sprint story show STORY_ID --json
# ===========================================================================


class TestStoryShowJson:
    """AC1: pf sprint story show STORY_ID --json returns structured data."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_story_show_json_produces_valid_json(self, runner: CliRunner) -> None:
        """--json flag should output valid JSON."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = SAMPLE_STORY
            result = runner.invoke(cli, ["sprint", "story", "show", "141-16", "--json"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert isinstance(parsed, dict)

    def test_story_show_json_contains_required_fields(self, runner: CliRunner) -> None:
        """JSON output must contain all required top-level keys."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = SAMPLE_STORY
            result = runner.invoke(cli, ["sprint", "story", "show", "141-16", "--json"])
            parsed = json.loads(result.output)
            required_keys = {"id", "title", "points", "status", "priority", "workflow", "jira"}
            assert required_keys.issubset(parsed.keys()), (
                f"Missing keys: {required_keys - set(parsed.keys())}"
            )

    def test_story_show_json_includes_session_data_when_active(self, runner: CliRunner) -> None:
        """When a session file exists, JSON includes phase, phase_owner, branch, pr."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = SAMPLE_STORY_WITH_SESSION
            result = runner.invoke(cli, ["sprint", "story", "show", "141-16", "--json"])
            parsed = json.loads(result.output)
            session_keys = {"phase", "phase_owner", "branch"}
            assert session_keys.issubset(parsed.keys()), (
                f"Missing session keys: {session_keys - set(parsed.keys())}"
            )

    def test_story_show_json_error_returns_json_to_stdout(self, runner: CliRunner) -> None:
        """Story not found → exit 1 with JSON error to stdout (not stderr)."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = None
            result = runner.invoke(cli, ["sprint", "story", "show", "999-99", "--json"])
            assert result.exit_code == 1
            # Error MUST be JSON to stdout, not a ClickException to stderr
            parsed = json.loads(result.output)
            assert "error" in parsed
            assert "code" in parsed
            assert parsed["code"] == "STORY_NOT_FOUND"

    def test_story_show_json_points_is_int(self, runner: CliRunner) -> None:
        """Points field should be integer, not string."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = SAMPLE_STORY
            result = runner.invoke(cli, ["sprint", "story", "show", "141-16", "--json"])
            parsed = json.loads(result.output)
            assert isinstance(parsed["points"], int)


# ===========================================================================
# AC1: pf workflow phases [STORY_ID] --json
# ===========================================================================


class TestWorkflowPhasesJson:
    """AC1: pf workflow phases [STORY_ID] --json returns ordered phase list."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_workflow_phases_command_exists(self, runner: CliRunner) -> None:
        """workflow phases subcommand should exist and be invokable."""
        result = runner.invoke(cli, ["workflow", "phases", "--help"])
        assert result.exit_code == 0
        assert "phases" in result.output.lower()

    def test_workflow_phases_json_produces_valid_json(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """--json flag should output valid JSON."""
        # Mock: workflow YAML with phases, session file with current phase
        wf_data = {
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "setup", "agent": "sm", "label": "Setup"},
                    {"name": "red", "agent": "tea", "label": "Test Design"},
                    {"name": "green", "agent": "dev", "label": "Implementation"},
                    {"name": "review", "agent": "reviewer", "label": "Code Review"},
                    {"name": "approved", "agent": "sm", "label": "Approved"},
                    {"name": "finish", "agent": "sm", "label": "Finish"},
                ],
            }
        }
        with (
            patch("pf.workflow.helpers.get_workflows_dir") as mock_dir,
            patch("pf.workflow.helpers.find_workflow_file") as mock_find,
            patch("pf.workflow.helpers.load_workflow_data") as mock_load,
        ):
            mock_dir.return_value = tmp_path
            mock_find.return_value = tmp_path / "tdd.yaml"
            mock_load.return_value = wf_data
            result = runner.invoke(cli, ["workflow", "phases", "--json"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert isinstance(parsed, dict)

    def test_workflow_phases_json_has_required_top_level_keys(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """JSON output must have workflow, story_id, and phases keys."""
        wf_data = {
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "setup", "agent": "sm", "label": "Setup"},
                ],
            }
        }
        with (
            patch("pf.workflow.helpers.get_workflows_dir") as mock_dir,
            patch("pf.workflow.helpers.find_workflow_file") as mock_find,
            patch("pf.workflow.helpers.load_workflow_data") as mock_load,
        ):
            mock_dir.return_value = tmp_path
            mock_find.return_value = tmp_path / "tdd.yaml"
            mock_load.return_value = wf_data
            result = runner.invoke(cli, ["workflow", "phases", "--json"])
            parsed = json.loads(result.output)
            assert "workflow" in parsed
            assert "story_id" in parsed
            assert "phases" in parsed

    def test_workflow_phases_json_phase_objects_have_required_fields(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """Each phase object must have name, agent, label, status."""
        wf_data = {
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "setup", "agent": "sm", "label": "Setup"},
                    {"name": "red", "agent": "tea", "label": "Test Design"},
                ],
            }
        }
        with (
            patch("pf.workflow.helpers.get_workflows_dir") as mock_dir,
            patch("pf.workflow.helpers.find_workflow_file") as mock_find,
            patch("pf.workflow.helpers.load_workflow_data") as mock_load,
        ):
            mock_dir.return_value = tmp_path
            mock_find.return_value = tmp_path / "tdd.yaml"
            mock_load.return_value = wf_data
            result = runner.invoke(cli, ["workflow", "phases", "--json"])
            parsed = json.loads(result.output)
            for phase in parsed["phases"]:
                assert "name" in phase
                assert "agent" in phase
                assert "label" in phase
                assert "status" in phase
                assert phase["status"] in ("done", "current", "pending")

    def test_workflow_phases_json_status_annotation(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """Phase status must be correctly set: before current=done, at=current, after=pending."""
        wf_data = {
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "setup", "agent": "sm", "label": "Setup"},
                    {"name": "red", "agent": "tea", "label": "Test Design"},
                    {"name": "green", "agent": "dev", "label": "Implementation"},
                ],
            }
        }
        # Create mock session with phase "red" for this story
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        (session_dir / "141-16-session.md").write_text(
            "# Story 141-16\n\n**Workflow:** tdd\n**Phase:** red\n"
        )
        with (
            patch("pf.common.config.get_project_root") as mock_root,
            patch("pf.workflow.helpers.find_workflow_file") as mock_find,
            patch("pf.workflow.helpers.load_workflow_data") as mock_load,
        ):
            mock_root.return_value = tmp_path
            mock_find.return_value = tmp_path / "tdd.yaml"
            mock_load.return_value = wf_data
            # Pass story ID to trigger session lookup
            result = runner.invoke(cli, ["workflow", "phases", "141-16", "--json"])
            parsed = json.loads(result.output)
            phases = parsed["phases"]
            # With session at "red": setup=done, red=current, green=pending
            statuses = {p["name"]: p["status"] for p in phases}
            assert statuses["setup"] == "done"
            assert statuses["red"] == "current"
            assert statuses["green"] == "pending"

    def test_workflow_phases_json_no_session_all_pending(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """Without active session, all phases should be 'pending'."""
        wf_data = {
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "setup", "agent": "sm", "label": "Setup"},
                    {"name": "red", "agent": "tea", "label": "Test Design"},
                ],
            }
        }
        with (
            patch("pf.common.config.get_project_root") as mock_root,
            patch("pf.workflow.helpers.find_workflow_file") as mock_find,
            patch("pf.workflow.helpers.load_workflow_data") as mock_load,
        ):
            mock_root.return_value = tmp_path  # No .session/ dir here
            mock_find.return_value = tmp_path / "tdd.yaml"
            mock_load.return_value = wf_data
            result = runner.invoke(cli, ["workflow", "phases", "--json"])
            parsed = json.loads(result.output)
            for phase in parsed["phases"]:
                assert phase["status"] == "pending"


# ===========================================================================
# AC1: pf persona current [AGENT] --json
# ===========================================================================


class TestPersonaCurrentJson:
    """AC1: pf persona current [AGENT] --json returns agent persona data."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_persona_current_command_exists(self, runner: CliRunner) -> None:
        """persona current subcommand should exist and be invokable."""
        result = runner.invoke(cli, ["persona", "current", "--help"])
        assert result.exit_code == 0

    def test_persona_current_json_produces_valid_json(self, runner: CliRunner) -> None:
        """--json flag should output valid JSON."""
        with (
            patch("pf.prime.persona.load_persona") as mock_load,
            patch("pf.prime.persona.get_crew_manifest") as mock_crew,
        ):
            persona = MagicMock()
            persona.character = "Leo McGarry"
            persona.style = "Chief of Staff"
            persona.agent = "sm"
            mock_load.return_value = (persona, "west-wing")
            mock_crew.return_value = []
            result = runner.invoke(cli, ["persona", "current", "sm", "--json"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert isinstance(parsed, dict)

    def test_persona_current_json_has_required_fields(self, runner: CliRunner) -> None:
        """JSON output must have agent, character, theme, style, crew."""
        with (
            patch("pf.prime.persona.load_persona") as mock_load,
            patch("pf.prime.persona.get_crew_manifest") as mock_crew,
        ):
            persona = MagicMock()
            persona.character = "Leo McGarry"
            persona.style = "Chief of Staff"
            persona.agent = "sm"
            mock_load.return_value = (persona, "west-wing")
            mock_crew.return_value = []
            result = runner.invoke(cli, ["persona", "current", "sm", "--json"])
            parsed = json.loads(result.output)
            required_keys = {"agent", "character", "theme", "style", "crew"}
            assert required_keys.issubset(parsed.keys()), (
                f"Missing keys: {required_keys - set(parsed.keys())}"
            )

    def test_persona_current_json_crew_is_list(self, runner: CliRunner) -> None:
        """Crew field must be a list of objects with agent, character, displayName."""
        with (
            patch("pf.prime.persona.load_persona") as mock_load,
            patch("pf.prime.persona.get_crew_manifest") as mock_crew,
        ):
            persona = MagicMock()
            persona.character = "Leo McGarry"
            persona.style = "Chief of Staff"
            persona.agent = "sm"
            mock_load.return_value = (persona, "west-wing")

            crew_member = MagicMock()
            crew_member.agent = "tea"
            crew_member.character = "Sam Seaborn"
            crew_member.display_name = "Sam Seaborn (TEA)"
            mock_crew.return_value = [crew_member]

            result = runner.invoke(cli, ["persona", "current", "sm", "--json"])
            parsed = json.loads(result.output)
            assert isinstance(parsed["crew"], list)
            if parsed["crew"]:
                member = parsed["crew"][0]
                assert "agent" in member
                assert "character" in member
                assert "displayName" in member

    def test_persona_current_json_no_theme_returns_error(self, runner: CliRunner) -> None:
        """No theme configured → exit 1 with JSON error."""
        with patch("pf.prime.persona.load_persona") as mock_load:
            mock_load.return_value = (None, None)
            result = runner.invoke(cli, ["persona", "current", "sm", "--json"])
            assert result.exit_code == 1
            parsed = json.loads(result.output)
            assert "error" in parsed
            assert "code" in parsed
            assert parsed["code"] == "NO_THEME"


# ===========================================================================
# AC1: pf theme show [NAME] --json
# ===========================================================================


class TestThemeShowJson:
    """AC1: pf theme show [NAME] --json returns full parsed theme YAML."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_theme_show_json_flag_exists(self, runner: CliRunner) -> None:
        """theme show should accept --json flag."""
        result = runner.invoke(cli, ["theme", "show", "--help"])
        assert result.exit_code == 0
        assert "--json" in result.output

    def test_theme_show_json_produces_valid_json(self, runner: CliRunner, tmp_path: Path) -> None:
        """--json flag should output valid JSON."""
        theme_yaml = tmp_path / "west-wing.yaml"
        theme_yaml.write_text(yaml.dump(SAMPLE_THEME_DATA))

        with (
            patch("pf.common.themes.get_current_theme") as mock_theme,
            patch("pf.common.themes.resolve_theme_path") as mock_resolve,
        ):
            mock_theme.return_value = "west-wing"
            mock_resolve.return_value = theme_yaml
            result = runner.invoke(cli, ["theme", "show", "--json"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert isinstance(parsed, dict)

    def test_theme_show_json_has_required_fields(self, runner: CliRunner, tmp_path: Path) -> None:
        """JSON output must have name, theme, agents keys."""
        theme_yaml = tmp_path / "west-wing.yaml"
        theme_yaml.write_text(yaml.dump(SAMPLE_THEME_DATA))

        with (
            patch("pf.common.themes.get_current_theme") as mock_theme,
            patch("pf.common.themes.resolve_theme_path") as mock_resolve,
        ):
            mock_theme.return_value = "west-wing"
            mock_resolve.return_value = theme_yaml
            result = runner.invoke(cli, ["theme", "show", "--json"])
            parsed = json.loads(result.output)
            assert "name" in parsed
            assert "theme" in parsed
            assert "agents" in parsed

    def test_theme_show_json_agents_have_character(self, runner: CliRunner, tmp_path: Path) -> None:
        """Each agent in the agents dict must have a character field."""
        theme_yaml = tmp_path / "west-wing.yaml"
        theme_yaml.write_text(yaml.dump(SAMPLE_THEME_DATA))

        with (
            patch("pf.common.themes.get_current_theme") as mock_theme,
            patch("pf.common.themes.resolve_theme_path") as mock_resolve,
        ):
            mock_theme.return_value = "west-wing"
            mock_resolve.return_value = theme_yaml
            result = runner.invoke(cli, ["theme", "show", "--json"])
            parsed = json.loads(result.output)
            for agent_name, agent_data in parsed["agents"].items():
                assert "character" in agent_data, f"Agent {agent_name} missing character"

    def test_theme_show_json_explicit_name(self, runner: CliRunner, tmp_path: Path) -> None:
        """theme show THEME_NAME --json should work with explicit name."""
        theme_yaml = tmp_path / "west-wing.yaml"
        theme_yaml.write_text(yaml.dump(SAMPLE_THEME_DATA))

        with patch("pf.common.themes.resolve_theme_path") as mock_resolve:
            mock_resolve.return_value = theme_yaml
            result = runner.invoke(cli, ["theme", "show", "west-wing", "--json"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert parsed["name"] == "west-wing"

    def test_theme_show_json_not_found_returns_error(self, runner: CliRunner) -> None:
        """Theme not found → exit 1 with JSON error to stdout."""
        with (
            patch("pf.common.themes.resolve_theme_path") as mock_resolve,
            patch("pf.common.themes.list_themes") as mock_list,
        ):
            mock_resolve.return_value = None
            mock_list.return_value = ["blade-runner", "west-wing"]
            result = runner.invoke(cli, ["theme", "show", "nonexistent", "--json"])
            assert result.exit_code == 1
            parsed = json.loads(result.output)
            assert "error" in parsed
            assert "code" in parsed
            assert parsed["code"] == "THEME_NOT_FOUND"

    def test_theme_show_json_no_theme_configured_returns_error(self, runner: CliRunner) -> None:
        """No theme configured and no name given → exit 1 with JSON error."""
        with patch("pf.common.themes.get_current_theme") as mock_theme:
            mock_theme.return_value = None
            result = runner.invoke(cli, ["theme", "show", "--json"])
            assert result.exit_code == 1
            parsed = json.loads(result.output)
            assert "error" in parsed


# ===========================================================================
# AC1: pf handoff status --json
# ===========================================================================


class TestHandoffStatusJson:
    """AC1: pf handoff status --json returns current gate/handoff state."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_handoff_status_command_exists(self, runner: CliRunner) -> None:
        """handoff status subcommand should exist and be invokable."""
        result = runner.invoke(cli, ["handoff", "status", "--help"])
        assert result.exit_code == 0

    def test_handoff_status_json_produces_valid_json(self, runner: CliRunner) -> None:
        """--json flag should output valid JSON."""
        result = runner.invoke(cli, ["handoff", "status", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert isinstance(parsed, dict)

    def test_handoff_status_json_has_required_fields(self, runner: CliRunner) -> None:
        """JSON output must have all required keys."""
        result = runner.invoke(cli, ["handoff", "status", "--json"])
        parsed = json.loads(result.output)
        required_keys = {
            "story_id",
            "phase",
            "workflow",
            "gate_type",
            "next_phase",
            "next_agent",
            "status",
        }
        assert required_keys.issubset(parsed.keys()), (
            f"Missing keys: {required_keys - set(parsed.keys())}"
        )

    def test_handoff_status_json_no_session(self, runner: CliRunner) -> None:
        """Without active session → status is 'no_session', other fields null."""
        # Run in a temp dir with no .session/
        result = runner.invoke(cli, ["handoff", "status", "--json"])
        parsed = json.loads(result.output)
        # Even without a session, it should return the full shape
        assert parsed["status"] in ("active", "no_session")

    def test_handoff_status_json_active_session(self, runner: CliRunner, tmp_path: Path) -> None:
        """With active session → status is 'active' and fields populated."""
        # Create mock session
        session_dir = tmp_path / ".session"
        session_dir.mkdir()
        session_file = session_dir / "141-16-session.md"
        session_file.write_text("# Story 141-16\n\n**Workflow:** tdd\n**Phase:** red\n")

        with patch("pf.common.config.get_project_root") as mock_root:
            mock_root.return_value = tmp_path
            result = runner.invoke(cli, ["handoff", "status", "--json"])
            parsed = json.loads(result.output)
            assert parsed["status"] == "active"
            assert parsed["story_id"] is not None
            assert parsed["phase"] is not None
            assert parsed["workflow"] is not None

    def test_handoff_status_json_no_session_all_null(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """No session → story_id, phase, workflow etc. are all null."""
        with patch("pf.common.config.get_project_root") as mock_root:
            mock_root.return_value = tmp_path
            result = runner.invoke(cli, ["handoff", "status", "--json"])
            parsed = json.loads(result.output)
            assert parsed["status"] == "no_session"
            assert parsed["story_id"] is None
            assert parsed["phase"] is None
            assert parsed["workflow"] is None
            assert parsed["gate_type"] is None
            assert parsed["next_phase"] is None
            assert parsed["next_agent"] is None


# ===========================================================================
# AC2: Error Response Contract
# ===========================================================================


class TestErrorContract:
    """AC2: Consistent error response shape across all --json commands."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_story_not_found_error_shape(self, runner: CliRunner) -> None:
        """Story not found error must have {error, code, detail} shape."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = None
            result = runner.invoke(cli, ["sprint", "story", "show", "999-99", "--json"])
            assert result.exit_code == 1
            parsed = json.loads(result.output)
            assert "error" in parsed
            assert "code" in parsed
            assert "detail" in parsed  # may be null but key must exist

    def test_theme_not_found_error_shape(self, runner: CliRunner) -> None:
        """Theme not found error must have {error, code, detail} shape."""
        with (
            patch("pf.common.themes.resolve_theme_path") as mock_resolve,
            patch("pf.common.themes.list_themes") as mock_list,
        ):
            mock_resolve.return_value = None
            mock_list.return_value = []
            result = runner.invoke(cli, ["theme", "show", "nonexistent", "--json"])
            assert result.exit_code == 1
            parsed = json.loads(result.output)
            assert "error" in parsed
            assert "code" in parsed
            assert "detail" in parsed

    def test_error_json_goes_to_stdout_not_stderr(self, runner: CliRunner) -> None:
        """Error JSON must be written to stdout, not stderr."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = None
            result = runner.invoke(cli, ["sprint", "story", "show", "999-99", "--json"])
            # The output (stdout) must contain the JSON error
            assert result.output.strip().startswith("{")
            parsed = json.loads(result.output)
            assert "error" in parsed

    def test_exit_code_1_for_expected_errors(self, runner: CliRunner) -> None:
        """Expected errors (not found, no config) must use exit code 1."""
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = None
            result = runner.invoke(cli, ["sprint", "story", "show", "999-99", "--json"])
            assert result.exit_code == 1

    def test_persona_no_theme_error_shape(self, runner: CliRunner) -> None:
        """persona current with no theme must return proper error shape."""
        with patch("pf.prime.persona.load_persona") as mock_load:
            mock_load.return_value = (None, None)
            result = runner.invoke(cli, ["persona", "current", "sm", "--json"])
            assert result.exit_code == 1
            parsed = json.loads(result.output)
            assert "error" in parsed
            assert "code" in parsed
            assert "detail" in parsed


# ===========================================================================
# AC3: Binary Resolution Strategy
# ===========================================================================


class TestBinaryResolution:
    """AC3: pf binary resolution for non-PATH contexts (IDE, GUI)."""

    def test_pf_bin_env_var_takes_precedence(self) -> None:
        """PF_BIN environment variable should be checked first."""
        # This tests the resolution strategy that TypeScript will use.
        # The Python side documents the strategy; testing the documented contract.

        # Verify the strategy is documented in the CLI (implementation will add this)
        # For now, test that the resolution module exists and works
        try:
            from pf.common.binary_resolution import resolve_pf_binary

            # With PF_BIN set
            with patch.dict(os.environ, {"PF_BIN": "/custom/path/pf"}):
                result = resolve_pf_binary()
                assert result == "/custom/path/pf"
        except ImportError:
            # Module doesn't exist yet - this is the expected RED state
            pytest.fail("pf.common.binary_resolution module not found")

    def test_local_bin_fallback(self) -> None:
        """~/.local/bin/pf should be checked after PF_BIN."""
        try:
            from pf.common.binary_resolution import resolve_pf_binary

            with (
                patch.dict(os.environ, {}, clear=True),
                patch("pathlib.Path.exists") as mock_exists,
            ):
                # ~/.local/bin/pf exists
                mock_exists.return_value = True
                result = resolve_pf_binary()
                assert ".local/bin/pf" in result
        except ImportError:
            pytest.fail("pf.common.binary_resolution module not found")

    def test_path_fallback(self) -> None:
        """Bare 'pf' on PATH should be the last resort."""
        try:
            from pf.common.binary_resolution import resolve_pf_binary

            with (
                patch.dict(os.environ, {}, clear=True),
                patch("pathlib.Path.exists") as mock_exists,
            ):
                # ~/.local/bin/pf does NOT exist
                mock_exists.return_value = False
                result = resolve_pf_binary()
                assert result == "pf"
        except ImportError:
            pytest.fail("pf.common.binary_resolution module not found")


# ===========================================================================
# AC4: Integration - TypeScript replacement validation
# ===========================================================================


class TestTypescriptReplacementValidation:
    """AC4: Verify CLI output contains all fields TypeScript currently parses."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        return CliRunner()

    def test_story_show_json_covers_story_info_interface(self, runner: CliRunner) -> None:
        """pf sprint story show --json must cover StoryInfo fields."""
        story = {
            "id": "141-1",
            "title": "Test Story",
            "points": 3,
            "status": "in_progress",
            "priority": "p1",
            "workflow": "tdd",
            "jira": "PROJ-16100",
            "description": "A test story",
            "phase": "red",
            "phase_owner": "tea",
            "branch": "story/141-1/test",
            "pr": None,
        }
        with patch("pf.sprint.loader.get_story_by_id") as mock:
            mock.return_value = story
            result = runner.invoke(cli, ["sprint", "story", "show", "141-1", "--json"])
            parsed = json.loads(result.output)
            # StoryInfo interface fields that TS currently computes
            story_info_fields = {
                "id",
                "title",
                "points",
                "status",
                "workflow",
                "jira",
            }
            assert story_info_fields.issubset(parsed.keys())

    def test_workflow_phases_json_covers_workflow_phase_interface(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        """pf workflow phases --json must produce WorkflowPhase[] shape."""
        wf_data = {
            "workflow": {
                "name": "tdd",
                "phases": [
                    {"name": "setup", "agent": "sm", "label": "Setup"},
                    {"name": "red", "agent": "tea", "label": "Test Design"},
                ],
            }
        }
        with (
            patch("pf.workflow.helpers.get_workflows_dir") as mock_dir,
            patch("pf.workflow.helpers.find_workflow_file") as mock_find,
            patch("pf.workflow.helpers.load_workflow_data") as mock_load,
        ):
            mock_dir.return_value = tmp_path
            mock_find.return_value = tmp_path / "tdd.yaml"
            mock_load.return_value = wf_data
            result = runner.invoke(cli, ["workflow", "phases", "--json"])
            parsed = json.loads(result.output)
            # WorkflowPhase interface: name, agent, label, status
            for phase in parsed["phases"]:
                assert all(k in phase for k in ("name", "agent", "label", "status"))

    def test_theme_show_json_covers_agent_map(self, runner: CliRunner, tmp_path: Path) -> None:
        """pf theme show --json must produce the full agent map."""
        theme_yaml = tmp_path / "west-wing.yaml"
        theme_yaml.write_text(yaml.dump(SAMPLE_THEME_DATA))

        with (
            patch("pf.common.themes.get_current_theme") as mock_theme,
            patch("pf.common.themes.resolve_theme_path") as mock_resolve,
        ):
            mock_theme.return_value = "west-wing"
            mock_resolve.return_value = theme_yaml
            result = runner.invoke(cli, ["theme", "show", "--json"])
            parsed = json.loads(result.output)
            # loadThemeYaml() returns {theme: {...}, agents: {...}}
            assert "agents" in parsed
            assert isinstance(parsed["agents"], dict)
            # Each agent should have at least 'character'
            for agent_data in parsed["agents"].values():
                assert "character" in agent_data
