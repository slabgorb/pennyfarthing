"""Tests for 143-7: SM reads handoff documents and chains phases.

Tests the phase-chaining orchestration where SM reads handoff documents
produced by subagents and uses them to spawn the next phase's agent:
- Handoff path extraction from SUBAGENT_RESULT
- Handoff document validation (exists, non-empty)
- Next-phase resolution from workflow YAML
- Full chain: extract → validate → resolve → build spawn config
- Result object contract (never throws)
"""

from pathlib import Path

import pytest
import yaml


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """Create a project with workflow YAML, native agents, session, and sprint."""
    # .pennyfarthing directory
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Workflow definitions
    workflows_dir = pf_dir / "workflows"
    workflows_dir.mkdir()

    (workflows_dir / "tdd.yaml").write_text(
        yaml.dump(
            {
                "workflow": {
                    "name": "tdd",
                    "description": "Test-driven development",
                    "version": "1.0.0",
                    "phases": [
                        {"name": "setup", "agent": "sm"},
                        {"name": "red", "agent": "tea"},
                        {"name": "green", "agent": "dev"},
                        {"name": "verify", "agent": "tea"},
                        {"name": "review", "agent": "reviewer"},
                        {"name": "finish", "agent": "sm"},
                    ],
                }
            }
        )
    )

    (workflows_dir / "trivial.yaml").write_text(
        yaml.dump(
            {
                "workflow": {
                    "name": "trivial",
                    "description": "Quick fixes",
                    "version": "1.0.0",
                    "phases": [
                        {"name": "setup", "agent": "sm"},
                        {"name": "implement", "agent": "dev"},
                        {"name": "review", "agent": "reviewer"},
                        {"name": "finish", "agent": "sm"},
                    ],
                }
            }
        )
    )

    # Native agent definitions
    agents_dir = pf_dir / "agents"
    agents_dir.mkdir()
    native_dir = agents_dir / "native"
    native_dir.mkdir()

    for agent_name, model in [("dev", "opus"), ("tea", "opus"), ("reviewer", "opus"), ("sm", "opus")]:
        tools = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
        if agent_name == "reviewer":
            tools = ["Read", "Glob", "Grep", "Bash"]
        (native_dir / f"{agent_name}.md").write_text(
            f"---\nname: {agent_name}\nmodel: {model}\n"
            f"allowed-tools:\n" + "".join(f"  - {t}\n" for t in tools) +
            f"---\n\n# {agent_name.upper()} Agent\n"
        )

    # Repos topology
    (pf_dir / "repos.yaml").write_text(
        yaml.dump({"repos": {"pennyfarthing": {"path": "pennyfarthing", "type": "framework"}}})
    )

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

    # Session
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "143-7-session.md").write_text(
        "# Session: 143-7\n\n"
        "**Story:** 143-7\n"
        "**Workflow:** tdd\n"
        "**Phase:** red\n"
        "**Repos:** pennyfarthing\n"
    )

    # Sidecars (empty dir to prevent loader warnings)
    sidecars_dir = pf_dir / "sidecars"
    sidecars_dir.mkdir()

    return tmp_path


@pytest.fixture
def handoff_doc(project_root: Path) -> Path:
    """Create a valid handoff document from a completed red phase."""
    session_dir = project_root / ".session"
    handoff_file = session_dir / "143-7-handoff-red.md"
    handoff_file.write_text(
        "<handoff story='143-7' phase='red' agent='tea' timestamp='2026-03-12T10:00:00Z'>\n"
        "  <header>\n"
        "    <workflow>tdd</workflow>\n"
        "    <from_phase>red</from_phase>\n"
        "    <to_phase>green</to_phase>\n"
        "  </header>\n"
        "  <summary>Wrote 8 failing tests for phase chaining.</summary>\n"
        "  <deliverables>\n"
        "    <file path='src/pf/tests/test_143_7_chain_phases.py'>8 failing tests</file>\n"
        "  </deliverables>\n"
        "</handoff>\n"
    )
    return handoff_file


@pytest.fixture
def empty_handoff_doc(project_root: Path) -> Path:
    """Create an empty handoff document (invalid)."""
    session_dir = project_root / ".session"
    handoff_file = session_dir / "143-7-handoff-empty.md"
    handoff_file.write_text("")
    return handoff_file


@pytest.fixture
def successful_result(handoff_doc: Path, project_root: Path) -> dict:
    """A parsed SUBAGENT_RESULT with a valid handoff_path."""
    return {
        "status": "success",
        "handoff_path": str(handoff_doc.relative_to(project_root)),
    }


@pytest.fixture
def result_no_handoff() -> dict:
    """A parsed SUBAGENT_RESULT with no handoff_path field."""
    return {
        "status": "success",
        "message": "Completed without handoff doc",
    }


@pytest.fixture
def result_missing_file(project_root: Path) -> dict:
    """A parsed SUBAGENT_RESULT pointing to a non-existent handoff file."""
    return {
        "status": "success",
        "handoff_path": ".session/does-not-exist.md",
    }


# =============================================================================
# AC1: SM can extract handoff document path from subagent result
# =============================================================================


class TestExtractHandoffPath:
    """Extract and resolve handoff_path from parsed SUBAGENT_RESULT."""

    def test_extracts_relative_path(
        self, successful_result: dict, project_root: Path, handoff_doc: Path
    ) -> None:
        """Extracts handoff_path and resolves it against project root."""
        from pf.subagent.chain import extract_handoff_path

        result = extract_handoff_path(successful_result, project_root)

        assert result["success"] is True
        assert result["data"]["path"] == handoff_doc

    def test_missing_handoff_path_key_returns_error(
        self, result_no_handoff: dict, project_root: Path
    ) -> None:
        """Result with no handoff_path key returns error, not exception."""
        from pf.subagent.chain import extract_handoff_path

        result = extract_handoff_path(result_no_handoff, project_root)

        assert result["success"] is False
        assert "handoff_path" in result["error"].lower()

    def test_absolute_path_used_as_is(
        self, project_root: Path, handoff_doc: Path
    ) -> None:
        """Absolute handoff_path is used directly without project_root resolution."""
        from pf.subagent.chain import extract_handoff_path

        result_dict = {"status": "success", "handoff_path": str(handoff_doc)}
        result = extract_handoff_path(result_dict, project_root)

        assert result["success"] is True
        assert result["data"]["path"] == handoff_doc

    def test_empty_string_handoff_path_returns_error(
        self, project_root: Path
    ) -> None:
        """Empty string handoff_path is treated as missing."""
        from pf.subagent.chain import extract_handoff_path

        result = extract_handoff_path(
            {"status": "success", "handoff_path": ""},
            project_root,
        )

        assert result["success"] is False

    def test_none_handoff_path_returns_error(
        self, project_root: Path
    ) -> None:
        """None handoff_path is treated as missing."""
        from pf.subagent.chain import extract_handoff_path

        result = extract_handoff_path(
            {"status": "success", "handoff_path": None},
            project_root,
        )

        assert result["success"] is False


# =============================================================================
# AC2: SM can validate handoff document exists on disk
# =============================================================================


class TestValidateHandoffDocument:
    """Validate handoff document exists and is non-empty."""

    def test_valid_handoff_document(
        self, project_root: Path, handoff_doc: Path
    ) -> None:
        """Existing, non-empty handoff document passes validation."""
        from pf.subagent.chain import validate_handoff_document

        result = validate_handoff_document(handoff_doc)

        assert result["success"] is True

    def test_missing_handoff_document(self, project_root: Path) -> None:
        """Non-existent handoff document fails validation."""
        from pf.subagent.chain import validate_handoff_document

        result = validate_handoff_document(
            project_root / ".session" / "nonexistent.md"
        )

        assert result["success"] is False
        assert "not found" in result["error"].lower() or "does not exist" in result["error"].lower()

    def test_empty_handoff_document(
        self, project_root: Path, empty_handoff_doc: Path
    ) -> None:
        """Empty handoff document (0 bytes) fails validation."""
        from pf.subagent.chain import validate_handoff_document

        result = validate_handoff_document(empty_handoff_doc)

        assert result["success"] is False
        assert "empty" in result["error"].lower()

    def test_whitespace_only_handoff_document(
        self, project_root: Path
    ) -> None:
        """Whitespace-only handoff document fails validation."""
        from pf.subagent.chain import validate_handoff_document

        ws_file = project_root / ".session" / "whitespace-handoff.md"
        ws_file.write_text("   \n  \n  ")
        result = validate_handoff_document(ws_file)

        assert result["success"] is False


# =============================================================================
# AC3: SM can resolve next phase and agent from workflow definition
# =============================================================================


class TestResolveNextPhase:
    """Resolve next phase and agent from workflow YAML phase ordering."""

    def test_red_to_green_in_tdd(self, project_root: Path) -> None:
        """In TDD workflow, red phase is followed by green (agent: dev)."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("tdd", "red", project_root)

        assert result["success"] is True
        assert result["data"]["next_phase"] == "green"
        assert result["data"]["next_agent"] == "dev"

    def test_green_to_verify_in_tdd(self, project_root: Path) -> None:
        """In TDD workflow, green phase is followed by verify (agent: tea)."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("tdd", "green", project_root)

        assert result["success"] is True
        assert result["data"]["next_phase"] == "verify"
        assert result["data"]["next_agent"] == "tea"

    def test_verify_to_review_in_tdd(self, project_root: Path) -> None:
        """In TDD workflow, verify phase is followed by review (agent: reviewer)."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("tdd", "verify", project_root)

        assert result["success"] is True
        assert result["data"]["next_phase"] == "review"
        assert result["data"]["next_agent"] == "reviewer"

    def test_review_to_finish_in_tdd(self, project_root: Path) -> None:
        """In TDD workflow, review phase is followed by finish (agent: sm)."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("tdd", "review", project_root)

        assert result["success"] is True
        assert result["data"]["next_phase"] == "finish"
        assert result["data"]["next_agent"] == "sm"

    def test_last_phase_returns_none(self, project_root: Path) -> None:
        """Last phase (finish) returns next_phase=None indicating workflow complete."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("tdd", "finish", project_root)

        assert result["success"] is True
        assert result["data"]["next_phase"] is None
        assert result["data"]["next_agent"] is None

    def test_unknown_phase_returns_error(self, project_root: Path) -> None:
        """Unknown phase name returns error result."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("tdd", "nonexistent_phase", project_root)

        assert result["success"] is False
        assert "nonexistent_phase" in result["error"]

    def test_unknown_workflow_returns_error(self, project_root: Path) -> None:
        """Unknown workflow name returns error result."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("nonexistent_workflow", "red", project_root)

        assert result["success"] is False

    def test_trivial_implement_to_review(self, project_root: Path) -> None:
        """In trivial workflow, implement → review (agent: reviewer)."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("trivial", "implement", project_root)

        assert result["success"] is True
        assert result["data"]["next_phase"] == "review"
        assert result["data"]["next_agent"] == "reviewer"

    def test_setup_to_red_in_tdd(self, project_root: Path) -> None:
        """In TDD workflow, setup → red (agent: tea)."""
        from pf.subagent.chain import resolve_next_phase

        result = resolve_next_phase("tdd", "setup", project_root)

        assert result["success"] is True
        assert result["data"]["next_phase"] == "red"
        assert result["data"]["next_agent"] == "tea"


# =============================================================================
# AC4: SM can build spawn config for next phase with prior handoff injected
# =============================================================================


class TestChainNextPhase:
    """Full chain: extract handoff → validate → resolve next → build spawn config."""

    def test_successful_chain_red_to_green(
        self, project_root: Path, successful_result: dict
    ) -> None:
        """Full chain from red→green produces a ready spawn config for dev."""
        from pf.subagent.chain import chain_next_phase

        result = chain_next_phase(
            subagent_result=successful_result,
            story_id="143-7",
            workflow="tdd",
            current_phase="red",
            task_description="Implement the phase chaining feature.",
            project_root=project_root,
        )

        assert result["success"] is True
        data = result["data"]
        assert data["spawn_config"]["status"] == "ready"
        assert data["spawn_config"]["agent_name"] == "dev"
        assert data["next_phase"] == "green"
        assert data["next_agent"] == "dev"
        # Prior handoff content should be in the prompt
        assert "Prior Phase Context" in data["spawn_config"]["prompt"]

    def test_chain_with_missing_handoff_path_fails(
        self, project_root: Path, result_no_handoff: dict
    ) -> None:
        """Chain fails when subagent result has no handoff_path."""
        from pf.subagent.chain import chain_next_phase

        result = chain_next_phase(
            subagent_result=result_no_handoff,
            story_id="143-7",
            workflow="tdd",
            current_phase="red",
            task_description="Implement.",
            project_root=project_root,
        )

        assert result["success"] is False
        assert "handoff_path" in result["error"].lower()

    def test_chain_with_missing_handoff_file_fails(
        self, project_root: Path, result_missing_file: dict
    ) -> None:
        """Chain fails when handoff_path points to non-existent file."""
        from pf.subagent.chain import chain_next_phase

        result = chain_next_phase(
            subagent_result=result_missing_file,
            story_id="143-7",
            workflow="tdd",
            current_phase="red",
            task_description="Implement.",
            project_root=project_root,
        )

        assert result["success"] is False

    def test_chain_at_last_phase_returns_workflow_complete(
        self, project_root: Path, successful_result: dict
    ) -> None:
        """Chain at finish phase returns workflow_complete=True, no spawn config."""
        from pf.subagent.chain import chain_next_phase

        result = chain_next_phase(
            subagent_result=successful_result,
            story_id="143-7",
            workflow="tdd",
            current_phase="finish",
            task_description="N/A",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["workflow_complete"] is True
        assert result["data"]["spawn_config"] is None

    def test_chain_with_nonexistent_agent_returns_error(
        self, project_root: Path, handoff_doc: Path
    ) -> None:
        """Chain fails if next agent has no native definition."""
        from pf.subagent.chain import chain_next_phase

        # Remove the dev native agent definition to simulate missing agent
        native_dev = project_root / ".pennyfarthing" / "agents" / "native" / "dev.md"
        native_dev.unlink()

        result = chain_next_phase(
            subagent_result={
                "status": "success",
                "handoff_path": str(handoff_doc.relative_to(project_root)),
            },
            story_id="143-7",
            workflow="tdd",
            current_phase="red",
            task_description="Implement.",
            project_root=project_root,
        )

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_chain_for_trivial_workflow(
        self, project_root: Path
    ) -> None:
        """Chain works for trivial workflow (implement → review)."""
        from pf.subagent.chain import chain_next_phase

        # Create a handoff for the implement phase
        handoff_file = project_root / ".session" / "143-7-handoff-implement.md"
        handoff_file.write_text(
            "<handoff story='143-7' phase='implement' agent='dev'>\n"
            "  <summary>Implementation complete.</summary>\n"
            "</handoff>\n"
        )

        result = chain_next_phase(
            subagent_result={
                "status": "success",
                "handoff_path": ".session/143-7-handoff-implement.md",
            },
            story_id="143-7",
            workflow="trivial",
            current_phase="implement",
            task_description="Review the implementation.",
            project_root=project_root,
        )

        assert result["success"] is True
        assert result["data"]["next_phase"] == "review"
        assert result["data"]["next_agent"] == "reviewer"
        assert result["data"]["spawn_config"]["status"] == "ready"


# =============================================================================
# AC5: Chain function returns result objects, never throws
# =============================================================================


class TestResultObjectContract:
    """All chain functions return {success, data?, error?} — never throw."""

    def test_extract_handoff_path_never_throws(self, project_root: Path) -> None:
        """extract_handoff_path returns error result for garbage input."""
        from pf.subagent.chain import extract_handoff_path

        # Completely wrong type — should not throw
        result = extract_handoff_path({"handoff_path": 12345}, project_root)

        assert "success" in result
        # Should fail gracefully (integer isn't a valid path)
        # We don't care whether it succeeds or fails — just that it doesn't throw

    def test_validate_handoff_never_throws(self) -> None:
        """validate_handoff_document returns error for Path to impossible location."""
        from pf.subagent.chain import validate_handoff_document

        result = validate_handoff_document(Path("/nonexistent/deep/path/file.md"))

        assert result["success"] is False
        assert "error" in result

    def test_resolve_next_phase_never_throws(self, project_root: Path) -> None:
        """resolve_next_phase returns error for corrupt workflow YAML."""
        from pf.subagent.chain import resolve_next_phase

        # Write corrupt YAML
        corrupt_wf = project_root / ".pennyfarthing" / "workflows" / "corrupt.yaml"
        corrupt_wf.write_text("workflow:\n  phases: not_a_list\n")

        result = resolve_next_phase("corrupt", "red", project_root)

        assert result["success"] is False
        assert "error" in result

    def test_chain_next_phase_never_throws(self, project_root: Path) -> None:
        """chain_next_phase returns error for completely invalid inputs."""
        from pf.subagent.chain import chain_next_phase

        result = chain_next_phase(
            subagent_result={},  # empty result
            story_id="",
            workflow="nonexistent",
            current_phase="nonexistent",
            task_description="",
            project_root=project_root,
        )

        assert result["success"] is False
        assert "error" in result

    def test_all_results_have_consistent_shape(
        self, project_root: Path, successful_result: dict
    ) -> None:
        """Every result dict has 'success' key, plus 'data' or 'error'."""
        from pf.subagent.chain import (
            chain_next_phase,
            extract_handoff_path,
            resolve_next_phase,
            validate_handoff_document,
        )

        results = [
            extract_handoff_path(successful_result, project_root),
            extract_handoff_path({}, project_root),
            validate_handoff_document(Path("/nope")),
            resolve_next_phase("tdd", "red", project_root),
            resolve_next_phase("tdd", "bogus", project_root),
            chain_next_phase(
                subagent_result=successful_result,
                story_id="143-7",
                workflow="tdd",
                current_phase="red",
                task_description="test",
                project_root=project_root,
            ),
        ]

        for i, result in enumerate(results):
            assert "success" in result, f"Result {i} missing 'success' key"
            if result["success"]:
                assert "data" in result, f"Result {i} success=True but missing 'data'"
            else:
                assert "error" in result, f"Result {i} success=False but missing 'error'"
