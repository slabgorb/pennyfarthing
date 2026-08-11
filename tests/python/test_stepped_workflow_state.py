"""
Tests for stepped workflow state detection (Story 137-4).

Verifies that detect_workflow_state() correctly identifies stepped workflow
sessions and returns step-aware context including current step, step name,
total steps, and completion status.

Integration tests (added after reviewer rejection) verify wiring:
- step_name population from session data
- load_tier_components() includes step content for FULL/REFRESH tiers
- _format_workflow_state_text() renders step fields
"""

import textwrap
from pathlib import Path

from pf.prime.models import WorkflowState, WorkflowStatus
from pf.prime.workflow import detect_workflow_state, parse_session_header

# --- AC1: detect_workflow_state() parses stepped workflow sessions ---


class TestSteppedSessionParsing:
    """detect_workflow_state() must parse stepped workflow sessions
    and return step-aware context."""

    def _write_stepped_session(self, tmp_path: Path, content: str) -> Path:
        """Helper to create a stepped workflow session file."""
        session_dir = tmp_path / ".session"
        session_dir.mkdir(parents=True, exist_ok=True)
        session_file = session_dir / "architecture-workflow-session.md"
        session_file.write_text(textwrap.dedent(content))
        return session_file

    def test_detects_stepped_in_progress(self, tmp_path):
        """A stepped session with incomplete steps returns STEPPED_IN_PROGRESS_STATE."""
        self._write_stepped_session(tmp_path, """\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped
            **Agent:** architect
            **Started:** 2026-03-02T10:00:00Z

            ## Workflow State
            - **Workflow Name:** architecture
            - **Type:** stepped
            - **Current Step:** 3
            - **Steps Completed:** [1, 2]
            - **Status:** in_progress
        """)

        # Need sprint file for backlog check fallback
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir(parents=True, exist_ok=True)
        (sprint_dir / "current-sprint.yaml").write_text("sprint:\n  name: test\nepics: []\n")

        status = detect_workflow_state(project_root=tmp_path)
        assert status.state == WorkflowState.STEPPED_IN_PROGRESS_STATE

    def test_stepped_session_returns_step_fields(self, tmp_path):
        """Stepped session status includes current_step, total_steps, step_name."""
        self._write_stepped_session(tmp_path, """\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped
            **Agent:** architect

            ## Workflow State
            - **Workflow Name:** architecture
            - **Type:** stepped
            - **Current Step:** 4
            - **Total Steps:** 7
            - **Steps Completed:** [1, 2, 3]
            - **Status:** in_progress
        """)

        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir(parents=True, exist_ok=True)
        (sprint_dir / "current-sprint.yaml").write_text("sprint:\n  name: test\nepics: []\n")

        status = detect_workflow_state(project_root=tmp_path)
        assert status.current_step == 4
        assert status.total_steps == 7

    def test_stepped_completed_returns_finish_state(self, tmp_path):
        """A stepped session with status=completed returns FINISH_STATE."""
        self._write_stepped_session(tmp_path, """\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped
            **Agent:** architect

            ## Workflow State
            - **Workflow Name:** architecture
            - **Type:** stepped
            - **Current Step:** 8
            - **Steps Completed:** [1, 2, 3, 4, 5, 6, 7]
            - **Status:** completed
        """)

        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir(parents=True, exist_ok=True)
        (sprint_dir / "current-sprint.yaml").write_text("sprint:\n  name: test\nepics: []\n")

        status = detect_workflow_state(project_root=tmp_path)
        assert status.state == WorkflowState.FINISH_STATE

    def test_stepped_session_includes_workflow_name(self, tmp_path):
        """Stepped session returns the workflow name (e.g., 'architecture')."""
        self._write_stepped_session(tmp_path, """\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped
            **Agent:** architect

            ## Workflow State
            - **Workflow Name:** architecture
            - **Type:** stepped
            - **Current Step:** 2
            - **Steps Completed:** [1]
            - **Status:** in_progress
        """)

        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir(parents=True, exist_ok=True)
        (sprint_dir / "current-sprint.yaml").write_text("sprint:\n  name: test\nepics: []\n")

        status = detect_workflow_state(project_root=tmp_path)
        assert status.workflow == "architecture"


# --- AC2: STEPPED_IN_PROGRESS_STATE enum value ---


class TestSteppedState:
    """WorkflowState must include STEPPED_IN_PROGRESS_STATE."""

    def test_stepped_state_exists(self):
        """STEPPED_IN_PROGRESS_STATE is a valid WorkflowState value."""
        assert hasattr(WorkflowState, "STEPPED_IN_PROGRESS_STATE")
        assert WorkflowState.STEPPED_IN_PROGRESS_STATE.value == "STEPPED_IN_PROGRESS_STATE"


# --- AC3: WorkflowStatus extended with step fields ---


class TestWorkflowStatusStepFields:
    """WorkflowStatus must have optional step fields."""

    def test_current_step_field(self):
        """WorkflowStatus accepts current_step."""
        status = WorkflowStatus(
            state=WorkflowState.IN_PROGRESS_STATE,
            current_step=3,
        )
        assert status.current_step == 3

    def test_total_steps_field(self):
        """WorkflowStatus accepts total_steps."""
        status = WorkflowStatus(
            state=WorkflowState.IN_PROGRESS_STATE,
            total_steps=7,
        )
        assert status.total_steps == 7

    def test_step_name_field(self):
        """WorkflowStatus accepts step_name."""
        status = WorkflowStatus(
            state=WorkflowState.IN_PROGRESS_STATE,
            step_name="context",
        )
        assert status.step_name == "context"

    def test_completion_status_field(self):
        """WorkflowStatus accepts completion_status."""
        status = WorkflowStatus(
            state=WorkflowState.IN_PROGRESS_STATE,
            completion_status="in_progress",
        )
        assert status.completion_status == "in_progress"

    def test_step_fields_default_none(self):
        """Step fields default to None when not provided."""
        status = WorkflowStatus(state=WorkflowState.IN_PROGRESS_STATE)
        assert status.current_step is None
        assert status.total_steps is None
        assert status.step_name is None
        assert status.completion_status is None

    def test_to_dict_includes_step_fields(self):
        """to_dict() includes step fields when set."""
        status = WorkflowStatus(
            state=WorkflowState.STEPPED_IN_PROGRESS_STATE,
            workflow="architecture",
            current_step=3,
            total_steps=7,
            step_name="patterns",
            completion_status="in_progress",
        )
        d = status.to_dict()
        assert d["current_step"] == 3
        assert d["total_steps"] == 7
        assert d["step_name"] == "patterns"
        assert d["completion_status"] == "in_progress"


# --- AC4: parse_session_header handles stepped format ---


class TestParseSteppedSessionHeader:
    """parse_session_header must extract stepped workflow metadata."""

    def test_extracts_type_stepped(self, tmp_path):
        """Parses **Type:** stepped from session header."""
        session = tmp_path / "arch-workflow-session.md"
        session.write_text(textwrap.dedent("""\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped
            **Agent:** architect

            ## Workflow State
            - **Type:** stepped
            - **Current Step:** 3
            - **Steps Completed:** [1, 2]
            - **Status:** in_progress
        """))

        result = parse_session_header(session)
        assert result.get("workflow_type") == "stepped"

    def test_extracts_current_step(self, tmp_path):
        """Parses **Current Step:** N from Workflow State section."""
        session = tmp_path / "arch-workflow-session.md"
        session.write_text(textwrap.dedent("""\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped

            ## Workflow State
            - **Current Step:** 5
            - **Status:** in_progress
        """))

        result = parse_session_header(session)
        assert result.get("current_step") == 5

    def test_extracts_total_steps(self, tmp_path):
        """Parses **Total Steps:** N from session."""
        session = tmp_path / "arch-workflow-session.md"
        session.write_text(textwrap.dedent("""\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped

            ## Workflow State
            - **Total Steps:** 8
            - **Current Step:** 3
            - **Status:** in_progress
        """))

        result = parse_session_header(session)
        assert result.get("total_steps") == 8

    def test_extracts_stepped_status(self, tmp_path):
        """Parses **Status:** from stepped session Workflow State section."""
        session = tmp_path / "arch-workflow-session.md"
        session.write_text(textwrap.dedent("""\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped

            ## Workflow State
            - **Status:** completed
        """))

        result = parse_session_header(session)
        assert result.get("status") == "completed"


# --- AC5: loader.py auto-loads step file content ---


class TestStepContentLoading:
    """loader.py must auto-load current step file content for stepped workflows."""

    def test_load_current_step_content(self, tmp_path):
        """load_step_content() returns the content of the current step file."""
        from pf.prime.loader import load_step_content

        # Create workflow step files
        steps_dir = tmp_path / ".pennyfarthing" / "workflows" / "architecture" / "steps"
        steps_dir.mkdir(parents=True, exist_ok=True)
        step_file = steps_dir / "step-03-patterns.md"
        step_file.write_text("# Step 3: Patterns\n\nAnalyze architectural patterns.")

        content = load_step_content(
            workflow_name="architecture",
            current_step=3,
            project_root=tmp_path,
        )
        assert content is not None
        assert "Patterns" in content
        assert "architectural patterns" in content

    def test_load_step_content_returns_none_for_missing(self, tmp_path):
        """load_step_content() returns None when step file doesn't exist."""
        from pf.prime.loader import load_step_content

        content = load_step_content(
            workflow_name="architecture",
            current_step=99,
            project_root=tmp_path,
        )
        assert content is None

    def test_load_step_content_matches_step_pattern(self, tmp_path):
        """load_step_content() finds step file by step-{NN}-*.md pattern."""
        from pf.prime.loader import load_step_content

        steps_dir = tmp_path / ".pennyfarthing" / "workflows" / "architecture" / "steps"
        steps_dir.mkdir(parents=True, exist_ok=True)
        # Step file with arbitrary suffix
        (steps_dir / "step-05-interfaces.md").write_text("# Interfaces")

        content = load_step_content(
            workflow_name="architecture",
            current_step=5,
            project_root=tmp_path,
        )
        assert content is not None
        assert "Interfaces" in content


# --- Integration: step_name population (reviewer finding #2) ---


class TestStepNamePopulation:
    """step_name must be populated from session data, not left as None."""

    def test_parse_session_header_extracts_step_name(self, tmp_path):
        """parse_session_header() extracts **Step Name:** from session."""
        session = tmp_path / "arch-workflow-session.md"
        session.write_text(textwrap.dedent("""\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped

            ## Workflow State
            - **Type:** stepped
            - **Current Step:** 3
            - **Step Name:** patterns
            - **Total Steps:** 7
            - **Status:** in_progress
        """))

        result = parse_session_header(session)
        assert result.get("step_name") == "patterns"

    def test_detect_workflow_state_populates_step_name(self, tmp_path):
        """detect_workflow_state() sets step_name on WorkflowStatus."""
        session_dir = tmp_path / ".session"
        session_dir.mkdir(parents=True, exist_ok=True)
        session_file = session_dir / "architecture-workflow-session.md"
        session_file.write_text(textwrap.dedent("""\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped
            **Agent:** architect

            ## Workflow State
            - **Workflow Name:** architecture
            - **Type:** stepped
            - **Current Step:** 3
            - **Step Name:** patterns
            - **Total Steps:** 7
            - **Status:** in_progress
        """))

        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir(parents=True, exist_ok=True)
        (sprint_dir / "current-sprint.yaml").write_text(
            "sprint:\n  name: test\nepics: []\n"
        )

        status = detect_workflow_state(project_root=tmp_path)
        assert status.step_name == "patterns"


# --- Integration: tier step content wiring (reviewer finding #1) ---


class TestTierStepContentIntegration:
    """load_tier_components() must include step content for FULL and REFRESH
    tiers when workflow state is STEPPED_IN_PROGRESS_STATE."""

    def _setup_stepped_env(self, tmp_path, step_num=3, step_name="patterns"):
        """Create a minimal stepped workflow environment in tmp_path."""
        # Stepped session file
        session_dir = tmp_path / ".session"
        session_dir.mkdir(parents=True, exist_ok=True)
        session_file = session_dir / "architecture-workflow-session.md"
        session_file.write_text(textwrap.dedent(f"""\
            # Workflow Session: architecture

            **Workflow:** architecture
            **Type:** stepped
            **Agent:** architect

            ## Workflow State
            - **Workflow Name:** architecture
            - **Type:** stepped
            - **Current Step:** {step_num}
            - **Total Steps:** 7
            - **Status:** in_progress
        """))

        # Step file
        steps_dir = (
            tmp_path / ".pennyfarthing" / "workflows" / "architecture" / "steps"
        )
        steps_dir.mkdir(parents=True, exist_ok=True)
        (steps_dir / f"step-{step_num:02d}-{step_name}.md").write_text(
            f"# Step {step_num}: {step_name.title()}\n\nDo the {step_name} work."
        )

        # Sprint (for backlog fallback)
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir(parents=True, exist_ok=True)
        (sprint_dir / "current-sprint.yaml").write_text(
            "sprint:\n  name: test\nepics: []\n"
        )

    def test_full_tier_includes_step_content(self, tmp_path):
        """FULL tier adds step_content component for stepped workflows."""
        from pf.prime.tiers import ContextTier, load_tier_components

        self._setup_stepped_env(tmp_path, step_num=3, step_name="patterns")

        components = load_tier_components(
            tier=ContextTier.FULL,
            agent_name="architect",
            project_root=tmp_path,
        )
        assert "step_content" in components
        assert "Patterns" in components["step_content"]

    def test_refresh_tier_includes_step_content(self, tmp_path):
        """REFRESH tier adds step_content component for stepped workflows."""
        from pf.prime.tiers import ContextTier, load_tier_components

        self._setup_stepped_env(tmp_path, step_num=2, step_name="context")

        components = load_tier_components(
            tier=ContextTier.REFRESH,
            agent_name="architect",
            project_root=tmp_path,
        )
        assert "step_content" in components
        assert "Context" in components["step_content"]


# --- Integration: text output rendering (reviewer finding #3) ---


class TestFormatWorkflowStateStepFields:
    """_format_workflow_state_text() must include step fields for stepped
    workflows so agents see step context on activation."""

    def test_text_output_includes_current_step(self):
        """Text output shows current_step for STEPPED state."""
        from pf.prime.cli import _format_workflow_state_text
        from pf.prime.models import PrimeResult

        status = WorkflowStatus(
            state=WorkflowState.STEPPED_IN_PROGRESS_STATE,
            workflow="architecture",
            current_step=3,
            total_steps=7,
            step_name="patterns",
        )
        result = PrimeResult(agent_name="architect", workflow_status=status)
        text = _format_workflow_state_text(result)
        assert "current_step: 3" in text

    def test_text_output_includes_total_steps(self):
        """Text output shows total_steps for STEPPED state."""
        from pf.prime.cli import _format_workflow_state_text
        from pf.prime.models import PrimeResult

        status = WorkflowStatus(
            state=WorkflowState.STEPPED_IN_PROGRESS_STATE,
            workflow="architecture",
            current_step=3,
            total_steps=7,
        )
        result = PrimeResult(agent_name="architect", workflow_status=status)
        text = _format_workflow_state_text(result)
        assert "total_steps: 7" in text

    def test_text_output_includes_step_name(self):
        """Text output shows step_name for STEPPED state."""
        from pf.prime.cli import _format_workflow_state_text
        from pf.prime.models import PrimeResult

        status = WorkflowStatus(
            state=WorkflowState.STEPPED_IN_PROGRESS_STATE,
            workflow="architecture",
            current_step=3,
            total_steps=7,
            step_name="patterns",
        )
        result = PrimeResult(agent_name="architect", workflow_status=status)
        text = _format_workflow_state_text(result)
        assert "step_name: patterns" in text
