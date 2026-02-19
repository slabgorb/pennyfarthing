"""
Tests for phase_check_start() — the Python port of phase-check-start.sh.

Story: 110-8 (CLI Relay Handoff Fix)

Tests:
1. No session → action: "start"
2. Agent owns phase → action: "start"
3. Agent doesn't own phase → action: "redirect" with correct owner

Run with: python -m pytest tests/python/test_phase_check.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.handoff.phase_check import phase_check_start


WORKFLOW_TDD = {
    "workflow": {
        "name": "tdd",
        "phases": [
            {"name": "setup", "agent": "sm"},
            {"name": "red", "agent": "tea", "gate": {"type": "tests_fail"}},
            {"name": "green", "agent": "dev", "gate": {"type": "tests_pass"}},
            {"name": "review", "agent": "reviewer", "gate": {"type": "approval"}},
            {"name": "finish", "agent": "sm"},
        ],
    }
}

SESSION_TEMPLATE = """\
# Story 99-1: Test story

**Status:** in_progress
**Phase:** {phase}
**Workflow:** tdd
**Jira:** MSSCI-99999
**Branch:** fix/test-branch
**Repos:** pennyfarthing
**Points:** 5
**Epic:** 99 — Test Epic

## Story Context

Test story context.

## Acceptance Criteria

- [ ] AC1: First acceptance criterion
"""


@pytest.fixture()
def tmp_project(tmp_path):
    """Create a temporary project with required structure."""
    # .pennyfarthing/workflows/
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    workflows_dir = pf_dir / "workflows"
    workflows_dir.mkdir()

    # pennyfarthing-dist/workflows/ (used by prime/workflow.py get_phase_owner)
    dist_wf = tmp_path / "pennyfarthing-dist" / "workflows"
    dist_wf.mkdir(parents=True)
    (dist_wf / "tdd.yaml").write_text(
        yaml.dump(WORKFLOW_TDD, default_flow_style=False)
    )

    # .session/
    session_dir = tmp_path / ".session"
    session_dir.mkdir()

    return tmp_path


def _create_session(project: Path, phase: str) -> Path:
    """Create a session file at the expected location."""
    session_path = project / ".session" / "99-1-session.md"
    session_path.write_text(SESSION_TEMPLATE.format(phase=phase))
    return session_path


# =============================================================================
# 1. No session → action: "start"
# =============================================================================


class TestNoSession:
    """When there's no active session, any agent should start."""

    def test_no_session_returns_start(self, tmp_project):
        # Remove session dir contents (keep dir empty)
        result = phase_check_start("dev", project_root=tmp_project)

        assert result["action"] == "start"
        assert result["agent"] == "dev"
        assert result["story_id"] is None

    def test_no_session_dir_returns_start(self, tmp_path):
        """Even without .session/ directory, should return start."""
        # Create minimal project without session dir
        pf_dir = tmp_path / "pennyfarthing-dist" / "workflows"
        pf_dir.mkdir(parents=True)

        result = phase_check_start("tea", project_root=tmp_path)

        assert result["action"] == "start"
        assert result["agent"] == "tea"


# =============================================================================
# 2. Agent owns phase → action: "start"
# =============================================================================


class TestAgentOwnsPhase:
    """When the requested agent owns the current phase."""

    def test_dev_owns_green_phase(self, tmp_project):
        _create_session(tmp_project, "green")

        result = phase_check_start("dev", project_root=tmp_project)

        assert result["action"] == "start"
        assert result["agent"] == "dev"
        assert result["phase"] == "green"
        assert result["story_id"] == "99-1"

    def test_tea_owns_red_phase(self, tmp_project):
        _create_session(tmp_project, "red")

        result = phase_check_start("tea", project_root=tmp_project)

        assert result["action"] == "start"
        assert result["agent"] == "tea"
        assert result["phase"] == "red"

    def test_reviewer_owns_review_phase(self, tmp_project):
        _create_session(tmp_project, "review")

        result = phase_check_start("reviewer", project_root=tmp_project)

        assert result["action"] == "start"
        assert result["agent"] == "reviewer"
        assert result["phase"] == "review"

    def test_sm_owns_setup_phase(self, tmp_project):
        _create_session(tmp_project, "setup")

        result = phase_check_start("sm", project_root=tmp_project)

        assert result["action"] == "start"
        assert result["agent"] == "sm"


# =============================================================================
# 3. Agent doesn't own phase → action: "redirect"
# =============================================================================


class TestAgentDoesNotOwnPhase:
    """When the requested agent does NOT own the current phase."""

    def test_dev_during_red_phase_redirects_to_tea(self, tmp_project):
        _create_session(tmp_project, "red")

        result = phase_check_start("dev", project_root=tmp_project)

        assert result["action"] == "redirect"
        assert result["agent"] == "tea"
        assert result["phase_owner"] == "tea"
        assert result["story_id"] == "99-1"

    def test_tea_during_green_phase_redirects_to_dev(self, tmp_project):
        _create_session(tmp_project, "green")

        result = phase_check_start("tea", project_root=tmp_project)

        assert result["action"] == "redirect"
        assert result["agent"] == "dev"

    def test_dev_during_review_phase_redirects_to_reviewer(self, tmp_project):
        _create_session(tmp_project, "review")

        result = phase_check_start("dev", project_root=tmp_project)

        assert result["action"] == "redirect"
        assert result["agent"] == "reviewer"

    def test_redirect_message_includes_phase_info(self, tmp_project):
        _create_session(tmp_project, "red")

        result = phase_check_start("dev", project_root=tmp_project)

        assert "red" in result["message"]
        assert "tea" in result["message"]
        assert "99-1" in result["message"]

    def test_sm_during_green_redirects_to_dev(self, tmp_project):
        _create_session(tmp_project, "green")

        result = phase_check_start("sm", project_root=tmp_project)

        assert result["action"] == "redirect"
        assert result["agent"] == "dev"


# =============================================================================
# Result format
# =============================================================================


class TestResultFormat:
    """Verify the result dict always has the expected keys."""

    def test_start_result_has_all_keys(self, tmp_project):
        result = phase_check_start("dev", project_root=tmp_project)

        assert "action" in result
        assert "agent" in result
        assert "story_id" in result
        assert "phase" in result
        assert "phase_owner" in result
        assert "message" in result

    def test_redirect_result_has_all_keys(self, tmp_project):
        _create_session(tmp_project, "red")

        result = phase_check_start("dev", project_root=tmp_project)

        assert "action" in result
        assert "agent" in result
        assert "story_id" in result
        assert "phase" in result
        assert "phase_owner" in result
        assert "message" in result
