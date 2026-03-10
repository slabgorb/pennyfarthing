"""Tests for BMAD Pipeline Replay Adapter — Story 142-3.

Tests verify:
- AC1: --pipeline CLI option on `pf benchmark replay run` routes to BMAD adapter
- AC2: BMAD pipeline adapter configures 2-phase pipeline with correct builders
- AC3: Worktree setup creates BMAD-specific files (story file + project-context.md)
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import yaml

from pf.benchmark.bmad_adapter import (
    BmadConfig,
    build_bmad_dev_claude_md,
    build_bmad_reviewer_claude_md,
    translate_story_file,
)


# ---------------------------------------------------------------------------
# Fixtures — reuse BMAD source fixtures from test_bmad_adapter
# ---------------------------------------------------------------------------

SAMPLE_DEV_AGENT_YAML = textwrap.dedent("""\
    agent:
      metadata:
        id: "_bmad/bmm/agents/dev.md"
        name: Amelia
        title: Developer Agent
        icon: "\U0001f4bb"
      persona:
        role: Senior Software Engineer
        identity: Executes approved stories with strict adherence.
        communication_style: "Ultra-succinct."
        principles: |
          - All tests must pass
      critical_actions:
        - "READ the entire story file BEFORE any implementation"
        - "NEVER lie about tests"
""")

SAMPLE_DEV_WORKFLOW = "# Dev Story Workflow\n\n<workflow>\n  <step n=\"1\">Implement</step>\n</workflow>\n"
SAMPLE_DEV_CHECKLIST = "# Definition of Done\n\n- [ ] All tests pass\n"
SAMPLE_REVIEW_WORKFLOW = "# Code Review Workflow\n\n<workflow>\n  <step n=\"1\">Review</step>\n</workflow>\n"
SAMPLE_REVIEW_CHECKLIST = "# Review Checklist\n\n- [ ] AC verified\n"
SAMPLE_STORY_TEMPLATE = textwrap.dedent("""\
    # Story {{epic_num}}.{{story_num}}: {{story_title}}

    Status: ready-for-dev

    ## Story

    As a {{role}},
    I want {{action}},
    so that {{benefit}}.

    ## Acceptance Criteria

    ## Tasks / Subtasks

    ## Dev Notes

    ## Dev Agent Record

    ### File List
""")


@pytest.fixture
def bmad_source_dir(tmp_path: Path) -> Path:
    """Create a minimal BMAD source directory structure."""
    agents = tmp_path / "src" / "bmm" / "agents"
    agents.mkdir(parents=True)
    (agents / "dev.agent.yaml").write_text(SAMPLE_DEV_AGENT_YAML)

    dev_story = tmp_path / "src" / "bmm" / "workflows" / "4-implementation" / "dev-story"
    dev_story.mkdir(parents=True)
    (dev_story / "workflow.md").write_text(SAMPLE_DEV_WORKFLOW)
    (dev_story / "checklist.md").write_text(SAMPLE_DEV_CHECKLIST)

    code_review = tmp_path / "src" / "bmm" / "workflows" / "4-implementation" / "code-review"
    code_review.mkdir(parents=True)
    (code_review / "workflow.md").write_text(SAMPLE_REVIEW_WORKFLOW)
    (code_review / "checklist.md").write_text(SAMPLE_REVIEW_CHECKLIST)

    create_story = tmp_path / "src" / "bmm" / "workflows" / "4-implementation" / "create-story"
    create_story.mkdir(parents=True)
    (create_story / "template.md").write_text(SAMPLE_STORY_TEMPLATE)

    return tmp_path


@pytest.fixture
def bmad_config(bmad_source_dir: Path) -> BmadConfig:
    return BmadConfig(bmad_root=bmad_source_dir)


@pytest.fixture
def scenario_yaml(tmp_path: Path) -> Path:
    """Create a minimal scenario YAML file."""
    scenario = {
        "id": "test-scenario",
        "title": "Test Scenario",
        "story_id": "TEST-1",
        "jira": "TEST-1",
        "repo": {
            "path": ".",
            "base_commit": "abc123",
            "branch": "main",
        },
        "context": {
            "epic": "sprint/context/context-epic-test.md",
            "story": "sprint/context/context-story-test.md",
        },
        "phases": ["tea", "dev", "reviewer"],
        "ground_truth": {
            "total_weight": 10,
            "round_1": {
                "findings": [
                    {
                        "id": "F-001",
                        "title": "Test finding",
                        "severity": "high",
                        "weight": 10,
                        "category": "logic",
                        "phase_ideal": "dev",
                        "description": "A test finding",
                    }
                ]
            },
        },
        "phase_prompts": {
            "tea": "Write tests.",
            "dev": "Implement the feature.",
            "reviewer": "Review the code.",
        },
    }
    path = tmp_path / "scenario.yaml"
    path.write_text(yaml.dump(scenario, default_flow_style=False))
    return path


@pytest.fixture
def worktree_dir(tmp_path: Path) -> Path:
    """Create a mock worktree directory."""
    wt = tmp_path / "worktree"
    wt.mkdir()
    return wt


@pytest.fixture
def epic_context_file(tmp_path: Path) -> Path:
    f = tmp_path / "context-epic-test.md"
    f.write_text("# Epic Context\n\n## Technical Architecture\n\nUse microservices.\n")
    return f


@pytest.fixture
def story_context_file(tmp_path: Path) -> Path:
    f = tmp_path / "context-story-test.md"
    f.write_text("# Story Context\n\n## Business Context\n\nCompare frameworks.\n\n## AC Context\n\n### AC1\n\nTest AC.\n")
    return f


# ===========================================================================
# AC1: --pipeline CLI Option
# ===========================================================================


class TestPipelineCLIOption:
    """AC1: `pf benchmark replay run` accepts --pipeline flag."""

    def test_get_pipeline_config_default(self):
        """Default pipeline returns standard PF config (3 phases)."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("default")
        assert config.phases == ["tea", "dev", "reviewer"]
        assert config.pipeline_name == "default"

    def test_get_pipeline_config_bmad(self, bmad_source_dir: Path):
        """BMAD pipeline returns 2-phase config."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("bmad", bmad_root=bmad_source_dir)
        assert config.phases == ["dev", "reviewer"]
        assert config.pipeline_name == "bmad"

    def test_get_pipeline_config_invalid_raises(self):
        """Invalid pipeline name raises ValueError with valid options listed."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        with pytest.raises(ValueError, match="(default|bmad)"):
            get_pipeline_config("nonexistent")

    def test_pipeline_config_has_required_fields(self, bmad_source_dir: Path):
        """PipelineConfig has all required fields."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("bmad", bmad_root=bmad_source_dir)
        assert hasattr(config, "phases")
        assert hasattr(config, "pipeline_name")
        assert hasattr(config, "build_claude_md")
        assert hasattr(config, "setup_worktree")
        assert hasattr(config, "result_subdir")


# ===========================================================================
# AC2: BMAD Pipeline Adapter
# ===========================================================================


class TestBmadPipelineAdapter:
    """AC2: Adapter configures 2-phase pipeline with BMAD builders."""

    def test_bmad_phases_are_dev_and_reviewer(self, bmad_source_dir: Path):
        """BMAD pipeline runs exactly 2 phases: dev, reviewer."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("bmad", bmad_root=bmad_source_dir)
        assert config.phases == ["dev", "reviewer"]
        assert len(config.phases) == 2

    def test_bmad_does_not_include_tea_phase(self, bmad_source_dir: Path):
        """BMAD pipeline must NOT include TEA phase."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("bmad", bmad_root=bmad_source_dir)
        assert "tea" not in config.phases

    def test_bmad_result_subdir_is_bmad(self, bmad_source_dir: Path):
        """BMAD results stored under 'bmad' subdirectory, not theme name."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("bmad", bmad_root=bmad_source_dir)
        assert config.result_subdir == "bmad"

    def test_bmad_build_claude_md_dev_uses_bmad_builder(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """Dev phase CLAUDE.md uses build_bmad_dev_claude_md, not PF agent prompt."""
        from pf.benchmark.bmad_pipeline import build_bmad_phase_claude_md

        result = build_bmad_phase_claude_md(
            role="dev",
            bmad_config=bmad_config,
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            worktree_path=worktree_dir,
        )
        # Must contain BMAD content
        assert "Senior Software Engineer" in result
        # Must NOT contain PF agent content
        assert "pennyfarthing" not in result.lower()
        assert "BikeLane" not in result
        assert "handoff" not in result.lower()

    def test_bmad_build_claude_md_reviewer_uses_bmad_builder(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """Reviewer phase CLAUDE.md uses build_bmad_reviewer_claude_md."""
        from pf.benchmark.bmad_pipeline import build_bmad_phase_claude_md

        result = build_bmad_phase_claude_md(
            role="reviewer",
            bmad_config=bmad_config,
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            worktree_path=worktree_dir,
            dev_output="Dev completed all tasks.",
        )
        # Must contain BMAD review content
        assert "Code Review Workflow" in result or "Review" in result
        assert "Dev completed all tasks." in result

    def test_bmad_pipeline_metadata_includes_pipeline_field(
        self, bmad_source_dir: Path,
    ):
        """Pipeline metadata YAML includes 'pipeline: bmad' field."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("bmad", bmad_root=bmad_source_dir)
        meta = config.pipeline_metadata()
        assert meta["pipeline"] == "bmad"

    def test_default_pipeline_metadata_includes_pipeline_field(self):
        """Default pipeline metadata YAML includes 'pipeline: default'."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        config = get_pipeline_config("default")
        meta = config.pipeline_metadata()
        assert meta["pipeline"] == "default"


# ===========================================================================
# AC3: Worktree Setup
# ===========================================================================


class TestBmadWorktreeSetup:
    """AC3: BMAD worktree has story file + project-context.md, no BMAD infra."""

    def test_story_file_written_to_implementation_artifacts(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """Story file written to implementation_artifacts/{story_key}.md."""
        from pf.benchmark.bmad_pipeline import setup_bmad_worktree

        setup_bmad_worktree(
            bmad_config=bmad_config,
            worktree_path=worktree_dir,
            story_key="DPGD-116",
            story_title="Test Story",
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            acceptance_criteria="**Given** X **When** Y **Then** Z",
        )
        story_file = worktree_dir / "implementation_artifacts" / "DPGD-116.md"
        assert story_file.exists(), f"Expected story file at {story_file}"
        content = story_file.read_text()
        assert len(content) > 0

    def test_story_file_is_bmad_format(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """Story file follows BMAD template structure."""
        from pf.benchmark.bmad_pipeline import setup_bmad_worktree

        setup_bmad_worktree(
            bmad_config=bmad_config,
            worktree_path=worktree_dir,
            story_key="DPGD-116",
            story_title="Test Story",
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            acceptance_criteria="AC content here",
        )
        content = (worktree_dir / "implementation_artifacts" / "DPGD-116.md").read_text()
        assert "## Acceptance Criteria" in content
        assert "AC content here" in content

    def test_project_context_created(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """project-context.md is created in the worktree."""
        from pf.benchmark.bmad_pipeline import setup_bmad_worktree

        setup_bmad_worktree(
            bmad_config=bmad_config,
            worktree_path=worktree_dir,
            story_key="DPGD-116",
            story_title="Test Story",
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            acceptance_criteria="AC here",
            project_context="# Project\n\nUse Rust. Run `cargo test`.",
        )
        ctx_file = worktree_dir / "project-context.md"
        assert ctx_file.exists(), f"Expected project-context.md at {ctx_file}"
        assert "Rust" in ctx_file.read_text()

    def test_story_path_returned_for_prompt(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """setup_bmad_worktree returns story_path for inclusion in prompt."""
        from pf.benchmark.bmad_pipeline import setup_bmad_worktree

        result = setup_bmad_worktree(
            bmad_config=bmad_config,
            worktree_path=worktree_dir,
            story_key="DPGD-116",
            story_title="Test Story",
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            acceptance_criteria="AC here",
        )
        assert "story_path" in result
        assert "implementation_artifacts/DPGD-116.md" in result["story_path"]

    def test_no_bmad_infrastructure_directory(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """No _bmad/ directory created (per ADR-0035)."""
        from pf.benchmark.bmad_pipeline import setup_bmad_worktree

        setup_bmad_worktree(
            bmad_config=bmad_config,
            worktree_path=worktree_dir,
            story_key="DPGD-116",
            story_title="Test Story",
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            acceptance_criteria="AC here",
        )
        assert not (worktree_dir / "_bmad").exists(), "_bmad/ must not be created"

    def test_no_sprint_status_yaml(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """No sprint-status.yaml created (per ADR-0035)."""
        from pf.benchmark.bmad_pipeline import setup_bmad_worktree

        setup_bmad_worktree(
            bmad_config=bmad_config,
            worktree_path=worktree_dir,
            story_key="DPGD-116",
            story_title="Test Story",
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            acceptance_criteria="AC here",
        )
        assert not (worktree_dir / "sprint-status.yaml").exists()

    def test_no_bmad_config_yaml(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """No config.yaml created (per ADR-0035)."""
        from pf.benchmark.bmad_pipeline import setup_bmad_worktree

        setup_bmad_worktree(
            bmad_config=bmad_config,
            worktree_path=worktree_dir,
            story_key="DPGD-116",
            story_title="Test Story",
            epic_context_path=epic_context_file,
            story_context_path=story_context_file,
            acceptance_criteria="AC here",
        )
        assert not (worktree_dir / "config.yaml").exists()


# ===========================================================================
# Edge Cases
# ===========================================================================


class TestBmadPipelineEdgeCases:
    """Edge cases for the BMAD pipeline adapter."""

    def test_bmad_config_required_for_bmad_pipeline(self):
        """get_pipeline_config('bmad') without bmad_root raises."""
        from pf.benchmark.bmad_pipeline import get_pipeline_config

        with pytest.raises((ValueError, TypeError)):
            get_pipeline_config("bmad")  # no bmad_root

    def test_build_claude_md_unknown_role_raises(
        self, bmad_config: BmadConfig, worktree_dir: Path,
        epic_context_file: Path, story_context_file: Path,
    ):
        """Building CLAUDE.md for unknown role raises ValueError."""
        from pf.benchmark.bmad_pipeline import build_bmad_phase_claude_md

        with pytest.raises(ValueError, match="(dev|reviewer)"):
            build_bmad_phase_claude_md(
                role="tea",  # BMAD has no TEA phase
                bmad_config=bmad_config,
                epic_context_path=epic_context_file,
                story_context_path=story_context_file,
                worktree_path=worktree_dir,
            )
