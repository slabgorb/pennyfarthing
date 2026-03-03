"""
Tests for Story 137-5: Tandem and team collaboration on stepped workflow steps.

Covers step-level tandem/team YAML schema, get_step_tandem_config(),
get_step_team_config(), and step-scoped team lifecycle.

Run with: python -m pytest tests/python/test_step_tandem_team.py -v
"""

import asyncio
import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.prime.workflow import get_step_tandem_config, get_step_team_config
from pf.workflow.team_lifecycle import (
    _reset_for_testing,
    create_team,
    generate_team_summary,
    spawn_teammates,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture(autouse=True)
def reset_state():
    """Reset in-memory registries before each test."""
    _reset_for_testing()
    yield
    _reset_for_testing()


@pytest.fixture()
def workflow_root(tmp_path):
    """Create a temp project with a stepped workflow that has step-level tandem/team."""
    dist = tmp_path / "pennyfarthing-dist" / "workflows"
    dist.mkdir(parents=True)

    # Workflow YAML with step-level tandem/team config
    (dist / "test-stepped.yaml").write_text(textwrap.dedent("""\
        workflow:
          name: test-stepped
          type: stepped
          steps:
            path: ./steps/
            pattern: step-{nn}-*.md
            config:
              4:
                tandem:
                  partner: pm
                  scope: tool-watch
                  model: haiku
                  token_budget: 2000
              6:
                team:
                  teammates:
                    - agent: devops
                      task: "Review infrastructure implications"
                  model: haiku
          agent: architect
    """))

    # Also create a workflow with NO step config (for negative tests)
    (dist / "test-no-steps.yaml").write_text(textwrap.dedent("""\
        workflow:
          name: test-no-steps
          type: stepped
          steps:
            path: ./steps/
            pattern: step-{nn}-*.md
          agent: architect
    """))

    return tmp_path


@pytest.fixture()
def architecture_root(tmp_path):
    """Create temp project mimicking architecture workflow with step tandem/team."""
    dist = tmp_path / "pennyfarthing-dist" / "workflows" / "architecture"
    dist.mkdir(parents=True)

    (dist / "workflow.yaml").write_text(textwrap.dedent("""\
        workflow:
          name: architecture
          type: stepped
          steps:
            path: ./steps/
            pattern: step-{nn}-*.md
            config:
              4:
                tandem:
                  partner: pm
                  scope: tool-watch
              6:
                team:
                  teammates:
                    - agent: devops
                      task: "Review infrastructure and deployment risks"
                  model: haiku
          agent: architect
    """))

    return tmp_path


# =============================================================================
# AC1: Step-level tandem/team YAML schema
# =============================================================================


class TestStepLevelYamlSchema:
    """Verify workflow YAML can contain step-level tandem/team config."""

    def test_step_config_with_tandem_is_valid_yaml(self, workflow_root):
        """Step 4 tandem config should be parseable from workflow YAML."""
        import yaml
        path = workflow_root / "pennyfarthing-dist" / "workflows" / "test-stepped.yaml"
        data = yaml.safe_load(path.read_text())
        step_config = data["workflow"]["steps"]["config"]
        assert 4 in step_config
        assert "tandem" in step_config[4]
        assert step_config[4]["tandem"]["partner"] == "pm"

    def test_step_config_with_team_is_valid_yaml(self, workflow_root):
        """Step 6 team config should be parseable from workflow YAML."""
        import yaml
        path = workflow_root / "pennyfarthing-dist" / "workflows" / "test-stepped.yaml"
        data = yaml.safe_load(path.read_text())
        step_config = data["workflow"]["steps"]["config"]
        assert 6 in step_config
        assert "team" in step_config[6]
        assert step_config[6]["team"]["teammates"][0]["agent"] == "devops"


# =============================================================================
# AC3: get_step_tandem_config() and get_step_team_config()
# =============================================================================


class TestGetStepTandemConfig:
    """Tests for get_step_tandem_config() function."""

    def test_returns_tandem_config_for_step_with_tandem(self, workflow_root):
        """Step 4 should return tandem config with partner=pm."""
        result = get_step_tandem_config("test-stepped", 4, project_root=workflow_root)
        assert result is not None
        assert result["partner"] == "pm"
        assert result["scope"] == "tool-watch"

    def test_returns_none_for_step_without_tandem(self, workflow_root):
        """Step 1 (no tandem) should return None."""
        result = get_step_tandem_config("test-stepped", 1, project_root=workflow_root)
        assert result is None

    def test_returns_none_for_nonexistent_workflow(self, workflow_root):
        """Non-existent workflow should return None."""
        result = get_step_tandem_config("nonexistent", 4, project_root=workflow_root)
        assert result is None

    def test_returns_none_for_workflow_without_step_config(self, workflow_root):
        """Workflow with no steps.config should return None."""
        result = get_step_tandem_config("test-no-steps", 4, project_root=workflow_root)
        assert result is None

    def test_returns_model_and_token_budget(self, workflow_root):
        """Should include model and token_budget when present."""
        result = get_step_tandem_config("test-stepped", 4, project_root=workflow_root)
        assert result is not None
        assert result["model"] == "haiku"
        assert result["token_budget"] == 2000


class TestGetStepTeamConfig:
    """Tests for get_step_team_config() function."""

    def test_returns_team_config_for_step_with_team(self, workflow_root):
        """Step 6 should return team config with devops teammate."""
        result = get_step_team_config("test-stepped", 6, project_root=workflow_root)
        assert result is not None
        assert result["teammates"][0]["agent"] == "devops"
        assert result["model"] == "haiku"

    def test_returns_none_for_step_without_team(self, workflow_root):
        """Step 1 (no team) should return None."""
        result = get_step_team_config("test-stepped", 1, project_root=workflow_root)
        assert result is None

    def test_returns_none_for_nonexistent_workflow(self, workflow_root):
        """Non-existent workflow should return None."""
        result = get_step_team_config("nonexistent", 6, project_root=workflow_root)
        assert result is None


# =============================================================================
# AC4: Step-scoped team lifecycle
# =============================================================================


class TestStepScopedTeamLifecycle:
    """Tests for step-scoped team creation and management."""

    def test_create_team_with_step_scope(self):
        """create_team with scope='step' should use step name in team name."""
        step = {
            "name": "step-06-risks",
            "team": {
                "teammates": [{"agent": "devops", "task": "Review risks"}],
                "model": "haiku",
            },
        }
        result = asyncio.run(create_team(step, "137-5", scope="step"))
        assert result["success"] is True
        handle = result["data"]
        assert handle["scope"] == "step"
        assert "step" in handle["teamName"].lower() or "step-06" in handle["teamName"]

    def test_create_team_default_scope_is_phase(self):
        """Default scope should be 'phase' for backward compat."""
        phase = {
            "name": "green",
            "team": {
                "teammates": [{"agent": "architect", "task": "Review"}],
            },
        }
        result = asyncio.run(create_team(phase, "137-5"))
        assert result["success"] is True
        handle = result["data"]
        assert handle.get("scope", "phase") == "phase"

    def test_generate_summary_includes_scope(self):
        """Team summary should include scope field (phase or step)."""
        step = {
            "name": "step-06-risks",
            "team": {
                "teammates": [{"agent": "devops", "task": "Review"}],
            },
        }
        result = asyncio.run(create_team(step, "137-5", scope="step"))
        handle = result["data"]
        handle["teammates"] = [
            {"agent": "devops", "task": "Review", "status": "shutdown"}
        ]
        summary = generate_team_summary(handle)
        assert "scope" in summary
        assert summary["scope"] == "step"


# =============================================================================
# AC6: Reference implementation — architecture workflow
# =============================================================================


class TestArchitectureReferenceImpl:
    """Verify architecture workflow has tandem PM on step 4, team DevOps on step 6."""

    def test_architecture_step_04_has_tandem_pm(self, architecture_root):
        """Architecture step 4 (components) should have tandem PM."""
        result = get_step_tandem_config(
            "architecture", 4, project_root=architecture_root
        )
        assert result is not None
        assert result["partner"] == "pm"

    def test_architecture_step_06_has_team_devops(self, architecture_root):
        """Architecture step 6 (risks) should have team with DevOps."""
        result = get_step_team_config(
            "architecture", 6, project_root=architecture_root
        )
        assert result is not None
        assert any(t["agent"] == "devops" for t in result["teammates"])

    def test_architecture_step_01_has_no_tandem(self, architecture_root):
        """Architecture step 1 (initialize) should have no tandem."""
        result = get_step_tandem_config(
            "architecture", 1, project_root=architecture_root
        )
        assert result is None

    def test_architecture_step_01_has_no_team(self, architecture_root):
        """Architecture step 1 (initialize) should have no team."""
        result = get_step_team_config(
            "architecture", 1, project_root=architecture_root
        )
        assert result is None
