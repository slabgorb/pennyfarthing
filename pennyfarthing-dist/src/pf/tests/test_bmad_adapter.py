"""Tests for pf.benchmark.bmad_adapter — BMAD Simulator Templates.

Story 142-2: BMAD Simulator CLAUDE.md Template and Story File.

Tests verify:
- AC1: BMAD dev CLAUDE.md contains verbatim BMAD source content, no PF contamination
- AC2: BMAD reviewer CLAUDE.md contains verbatim review workflow + checklist, no PF content
- AC3: Story file translator produces BMAD-format story file from PF context docs
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from pf.benchmark.bmad_adapter import (
    BmadConfig,
    build_bmad_dev_claude_md,
    build_bmad_reviewer_claude_md,
    translate_story_file,
)


# ---------------------------------------------------------------------------
# Fixtures — minimal BMAD source content for testing
# ---------------------------------------------------------------------------

SAMPLE_DEV_AGENT_YAML = textwrap.dedent("""\
    # Dev Implementation Agent Definition (v6)

    agent:
      metadata:
        id: "_bmad/bmm/agents/dev.md"
        name: Amelia
        title: Developer Agent
        icon: 💻

      persona:
        role: Senior Software Engineer
        identity: Executes approved stories with strict adherence to story details.
        communication_style: "Ultra-succinct. Speaks in file paths and AC IDs."
        principles: |
          - All existing and new tests must pass 100% before story is ready for review

      critical_actions:
        - "READ the entire story file BEFORE any implementation"
        - "Execute tasks/subtasks IN ORDER as written in story file"
        - "NEVER lie about tests being written or passing"
""")

SAMPLE_DEV_WORKFLOW = textwrap.dedent("""\
    ---
    name: dev-story
    description: 'Execute story implementation'
    ---

    # Dev Story Workflow

    <workflow>
      <step n="1" goal="Find next ready story">
        <action>Use story_path directly</action>
      </step>
      <step n="5" goal="Implement task following red-green-refactor cycle">
        <action>Write FAILING tests first</action>
      </step>
    </workflow>
""")

SAMPLE_DEV_CHECKLIST = textwrap.dedent("""\
    # 🎯 Enhanced Definition of Done Checklist

    ## ✅ Implementation Completion

    - [ ] **All Tasks Complete:** Every task and subtask marked complete with [x]
    - [ ] **Acceptance Criteria Satisfaction:** Implementation satisfies EVERY AC

    ## 🧪 Testing & Quality Assurance

    - [ ] **Unit Tests:** Unit tests added/updated for ALL core functionality
""")

SAMPLE_REVIEW_WORKFLOW = textwrap.dedent("""\
    ---
    name: code-review
    description: 'Perform adversarial code review'
    ---

    # Code Review Workflow

    **Your Role:** Adversarial Code Reviewer.
    - YOU ARE AN ADVERSARIAL CODE REVIEWER - Find what's wrong or missing!
    - Find 3-10 specific issues in every review minimum

    <workflow>
      <step n="1" goal="Load story and discover changes">
        <action>Read COMPLETE story file</action>
      </step>
    </workflow>
""")

SAMPLE_REVIEW_CHECKLIST = textwrap.dedent("""\
    # Senior Developer Review - Validation Checklist

    - [ ] Story file loaded from `{{story_path}}`
    - [ ] Acceptance Criteria cross-checked against implementation
    - [ ] Code quality review performed on changed files
""")

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

SAMPLE_PROJECT_CONTEXT = "# Project Context\n\nUse Rust. Run tests with `cargo test`.\n"


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
    """Create a BmadConfig pointing at the test BMAD source dir."""
    return BmadConfig(bmad_root=bmad_source_dir)


# ===========================================================================
# AC1: BMAD Dev CLAUDE.md Template
# ===========================================================================


class TestBmadDevClaudeMd:
    """AC1: Dev template contains verbatim BMAD content, no PF contamination."""

    def test_contains_persona_role(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest story",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "Senior Software Engineer" in result

    def test_contains_persona_identity(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest story",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "Executes approved stories with strict adherence" in result

    def test_contains_communication_style(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest story",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "Ultra-succinct. Speaks in file paths and AC IDs." in result

    def test_contains_critical_actions(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest story",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "READ the entire story file BEFORE any implementation" in result
        assert "Execute tasks/subtasks IN ORDER" in result
        assert "NEVER lie about tests being written or passing" in result

    def test_contains_workflow_verbatim(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest story",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        # Key XML tags from workflow should be present verbatim
        assert "<workflow>" in result
        assert '<step n="1"' in result
        assert '<step n="5"' in result
        assert "red-green-refactor" in result

    def test_contains_checklist_verbatim(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest story",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "Enhanced Definition of Done Checklist" in result
        assert "All Tasks Complete" in result
        assert "Acceptance Criteria Satisfaction" in result

    def test_contains_story_content(self, bmad_config: BmadConfig):
        story = "## Story\n\nAs a developer, I want tests."
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content=story,
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "As a developer, I want tests." in result

    def test_contains_project_context(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "Use Rust. Run tests with `cargo test`." in result

    def test_no_pennyfarthing_persona(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        # PF-specific terms that must NOT appear
        assert "pennyfarthing" not in result.lower()
        assert "BikeLane" not in result
        assert "sidecar" not in result.lower()
        assert "tandem" not in result.lower()
        assert "bell mode" not in result.lower()
        assert "relay mode" not in result.lower()

    def test_no_session_metadata(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "**Phase:**" not in result
        assert "**Workflow:**" not in result
        assert ".session/" not in result

    def test_no_pf_workflow_engine(self, bmad_config: BmadConfig):
        result = build_bmad_dev_claude_md(
            bmad_config,
            story_content="## Story\nTest",
            project_context=SAMPLE_PROJECT_CONTEXT,
        )
        assert "handoff" not in result.lower()
        assert "resolve-gate" not in result
        assert "complete-phase" not in result


# ===========================================================================
# AC2: BMAD Reviewer CLAUDE.md Template
# ===========================================================================


class TestBmadReviewerClaudeMd:
    """AC2: Reviewer template contains verbatim review workflow + checklist."""

    def test_contains_adversarial_role(self, bmad_config: BmadConfig):
        result = build_bmad_reviewer_claude_md(
            bmad_config,
            dev_output="Dev completed implementation.",
        )
        assert "ADVERSARIAL CODE REVIEWER" in result

    def test_contains_review_workflow_verbatim(self, bmad_config: BmadConfig):
        result = build_bmad_reviewer_claude_md(
            bmad_config,
            dev_output="Dev completed implementation.",
        )
        assert "<workflow>" in result
        assert '<step n="1"' in result
        assert "Find 3-10 specific issues" in result

    def test_contains_review_checklist_verbatim(self, bmad_config: BmadConfig):
        result = build_bmad_reviewer_claude_md(
            bmad_config,
            dev_output="Dev completed implementation.",
        )
        assert "Senior Developer Review - Validation Checklist" in result
        assert "Acceptance Criteria cross-checked" in result

    def test_contains_dev_output(self, bmad_config: BmadConfig):
        dev_output = "I implemented the feature and all tests pass."
        result = build_bmad_reviewer_claude_md(
            bmad_config,
            dev_output=dev_output,
        )
        assert "I implemented the feature and all tests pass." in result

    def test_no_pf_reviewer_content(self, bmad_config: BmadConfig):
        result = build_bmad_reviewer_claude_md(
            bmad_config,
            dev_output="Dev output here.",
        )
        assert "pennyfarthing" not in result.lower()
        assert "Leto II" not in result
        assert "God Emperor" not in result
        assert "sidecar" not in result.lower()
        assert "BikeLane" not in result


# ===========================================================================
# AC3: Story File Translator
# ===========================================================================


class TestStoryFileTranslator:
    """AC3: PF context → BMAD story file format."""

    def test_follows_bmad_template_structure(self, bmad_config: BmadConfig):
        result = translate_story_file(
            bmad_config,
            epic_context="## Overview\nBuild a comparison pipeline.",
            story_context="## Business Context\nCompare frameworks.",
            story_title="ADR and Methodology",
            acceptance_criteria="**Given** X **When** Y **Then** Z",
        )
        # Must have all BMAD template sections
        assert "## Story" in result
        assert "## Acceptance Criteria" in result
        assert "## Tasks / Subtasks" in result
        assert "## Dev Notes" in result
        assert "## Dev Agent Record" in result
        assert "## File List" in result or "### File List" in result

    def test_story_section_has_user_story_format(self, bmad_config: BmadConfig):
        result = translate_story_file(
            bmad_config,
            epic_context="## Overview\nPipeline comparison.",
            story_context="## Business Context\nCompare frameworks.",
            story_title="Test Story",
            acceptance_criteria="**Given** X **When** Y **Then** Z",
        )
        # Should contain "As a" user story format
        assert "As a" in result or "as a" in result

    def test_acceptance_criteria_preserved_verbatim(self, bmad_config: BmadConfig):
        ac = "**Given** the BMAD repo\n**When** the template is built\n**Then** it contains verbatim content"
        result = translate_story_file(
            bmad_config,
            epic_context="## Overview\nPipeline comparison.",
            story_context="## Business Context\nCompare.",
            story_title="Test Story",
            acceptance_criteria=ac,
        )
        assert "**Given** the BMAD repo" in result
        assert "**When** the template is built" in result
        assert "**Then** it contains verbatim content" in result

    def test_tasks_subtasks_empty(self, bmad_config: BmadConfig):
        """Per ADR-0035: Tasks/Subtasks left empty to avoid bias."""
        result = translate_story_file(
            bmad_config,
            epic_context="## Overview\nPipeline comparison.",
            story_context="## Business Context\nCompare.",
            story_title="Test Story",
            acceptance_criteria="AC here",
        )
        # Find the Tasks section and verify it has no task items
        lines = result.split("\n")
        in_tasks = False
        task_content = []
        for line in lines:
            if "## Tasks" in line:
                in_tasks = True
                continue
            if in_tasks and line.startswith("## "):
                break
            if in_tasks:
                task_content.append(line.strip())
        # Should have no checkbox items
        task_text = "\n".join(task_content).strip()
        assert "- [ ]" not in task_text, "Tasks/Subtasks should be empty per ADR-0035"

    def test_dev_notes_populated_from_context(self, bmad_config: BmadConfig):
        result = translate_story_file(
            bmad_config,
            epic_context="## Technical Architecture\nUse microservices pattern.",
            story_context="## Technical Guardrails\nMust use Rust async.",
            story_title="Test Story",
            acceptance_criteria="AC here",
        )
        # Dev Notes should contain content from epic/story context
        lines = result.split("\n")
        in_dev_notes = False
        dev_notes_content = []
        for line in lines:
            if "## Dev Notes" in line:
                in_dev_notes = True
                continue
            if in_dev_notes and line.startswith("## "):
                break
            if in_dev_notes:
                dev_notes_content.append(line)
        dev_notes_text = "\n".join(dev_notes_content)
        assert len(dev_notes_text.strip()) > 0, "Dev Notes should be populated from context"

    def test_dev_agent_record_empty(self, bmad_config: BmadConfig):
        """Dev Agent Record should be present but empty (populated by BMAD agent)."""
        result = translate_story_file(
            bmad_config,
            epic_context="## Overview\nTest.",
            story_context="## Business Context\nTest.",
            story_title="Test Story",
            acceptance_criteria="AC here",
        )
        assert "## Dev Agent Record" in result

    def test_returns_string(self, bmad_config: BmadConfig):
        result = translate_story_file(
            bmad_config,
            epic_context="Test epic",
            story_context="Test story",
            story_title="Test",
            acceptance_criteria="AC",
        )
        assert isinstance(result, str)
        assert len(result) > 0


# ===========================================================================
# BmadConfig validation
# ===========================================================================


class TestBmadConfig:
    """BmadConfig should validate that required BMAD source files exist."""

    def test_valid_config(self, bmad_source_dir: Path):
        config = BmadConfig(bmad_root=bmad_source_dir)
        assert config.bmad_root == bmad_source_dir

    def test_invalid_root_raises(self, tmp_path: Path):
        with pytest.raises((FileNotFoundError, ValueError)):
            BmadConfig(bmad_root=tmp_path / "nonexistent")

    def test_missing_dev_agent_raises(self, tmp_path: Path):
        # Create partial structure missing dev.agent.yaml
        (tmp_path / "src" / "bmm" / "agents").mkdir(parents=True)
        wf = tmp_path / "src" / "bmm" / "workflows" / "4-implementation" / "dev-story"
        wf.mkdir(parents=True)
        (wf / "workflow.md").write_text("test")
        (wf / "checklist.md").write_text("test")
        cr = tmp_path / "src" / "bmm" / "workflows" / "4-implementation" / "code-review"
        cr.mkdir(parents=True)
        (cr / "workflow.md").write_text("test")
        (cr / "checklist.md").write_text("test")
        cs = tmp_path / "src" / "bmm" / "workflows" / "4-implementation" / "create-story"
        cs.mkdir(parents=True)
        (cs / "template.md").write_text("test")

        with pytest.raises((FileNotFoundError, ValueError)):
            BmadConfig(bmad_root=tmp_path)
