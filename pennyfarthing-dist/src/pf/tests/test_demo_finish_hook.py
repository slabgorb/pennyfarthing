"""Tests for story_finish → demo generation hook.

Story 146-3: Hook into story_finish pipeline — auto-trigger on completion

These tests verify that completing a story via finish_story() automatically
triggers demo artifact generation, and that demo failures are non-fatal
(they must never block story completion).
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest  # noqa: F401


def _create_session_file(tmp_path: Path, story_id: str = "42-1") -> Path:
    """Create a minimal session file for testing."""
    session_dir = tmp_path / ".session"
    session_dir.mkdir(parents=True, exist_ok=True)
    session_file = session_dir / f"{story_id}-session.md"
    session_file.write_text(
        textwrap.dedent(f"""\
        ---
        story_id: "{story_id}"
        jira_key: "PROJ-99999"
        workflow: "tdd"
        ---
        # Story {story_id}: Test story

        ## Story Details
        - **ID:** {story_id}
        - **Jira Key:** PROJ-99999
        - **Branch:** feat/{story_id}-test
        - **PR:** #999 - test PR
        """),
        encoding="utf-8",
    )
    return session_file


def _create_sprint_yaml(tmp_path: Path, story_id: str = "42-1") -> Path:
    """Create a minimal sprint YAML for testing."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir(parents=True, exist_ok=True)
    sprint_file = sprint_dir / "current-sprint.yaml"
    epic_id = story_id.split("-")[0]
    sprint_file.write_text(
        textwrap.dedent(f"""\
        name: "Test Sprint"
        sprint_id: "2699"
        epics:
          - id: "{epic_id}"
            title: "Test Epic"
            jira: "PROJ-99990"
            stories:
              - id: "{story_id}"
                title: "Test story"
                points: 2
                status: "in_review"
                jira: "PROJ-99999"
        """),
        encoding="utf-8",
    )
    return sprint_file


def _setup_finish_env(tmp_path: Path, story_id: str = "42-1") -> Path:
    """Set up a complete environment for finish_story() testing."""
    _create_session_file(tmp_path, story_id)
    _create_sprint_yaml(tmp_path, story_id)
    # Create archive directory
    (tmp_path / "sprint" / "archive").mkdir(parents=True, exist_ok=True)
    return tmp_path


class TestDemoHookTriggered:
    """AC1: story_finish hook detects story completion and triggers demo generation."""

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_finish_story_calls_demo_generate(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """finish_story() must call demo.orchestrator.generate() on success."""
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        mock_demo_generate.return_value = {"success": True, "data": {"files": []}}

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        assert result["success"] is True
        mock_demo_generate.assert_called_once()

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_not_triggered_when_session_missing(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """If session file doesn't exist, finish_story fails before demo hook."""
        # Don't create session file — finish_story should fail early
        (tmp_path / "sprint" / "archive").mkdir(parents=True, exist_ok=True)

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        assert result["success"] is False
        mock_demo_generate.assert_not_called()

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_triggered_with_correct_story_id(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Demo generation must receive the correct story_id."""
        _setup_finish_env(tmp_path, "99-5")
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        mock_demo_generate.return_value = {"success": True, "data": {"files": []}}

        from pf.sprint.story_finish import finish_story

        finish_story(tmp_path, "99-5")

        call_args = mock_demo_generate.call_args
        # story_id should be the first positional arg or a kwarg
        story_id_arg = (
            call_args.kwargs.get("story_id")
            or (call_args.args[0] if call_args.args else None)
        )
        assert story_id_arg == "99-5", (
            f"Demo generate should receive story_id='99-5', got '{story_id_arg}'"
        )


class TestDemoHookConfiguration:
    """AC2: Invoke demo generation with correct configuration."""

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_receives_project_root(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Demo generate must receive the project_root for config discovery."""
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        mock_demo_generate.return_value = {"success": True, "data": {"files": []}}

        from pf.sprint.story_finish import finish_story

        finish_story(tmp_path, "42-1")

        call_kwargs = mock_demo_generate.call_args.kwargs
        call_args = mock_demo_generate.call_args.args
        # project_root must be passed — either as kwarg or positional
        project_root_value = call_kwargs.get("project_root")
        if project_root_value is None and len(call_args) >= 2:
            project_root_value = call_args[1]
        assert project_root_value is not None, (
            "Demo generate must receive project_root"
        )
        assert Path(project_root_value) == tmp_path, (
            f"project_root should be {tmp_path}, got {project_root_value}"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_not_called_in_dry_run(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Dry-run mode should NOT trigger demo generation."""
        _setup_finish_env(tmp_path)

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1", dry_run=True)

        assert result["success"] is True
        mock_demo_generate.assert_not_called()

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_dry_run_mentions_demo_step(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Dry-run output should mention demo generation as a planned step."""
        _setup_finish_env(tmp_path)

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1", dry_run=True)

        # Dry-run steps should include a demo generation step
        steps = result.get("steps", [])
        step_actions = [str(s.get("action", "")) for s in steps]
        has_demo_step = any("demo" in a.lower() for a in step_actions)
        assert has_demo_step, (
            f"Dry-run steps should include a demo generation step, "
            f"got actions: {step_actions}"
        )


class TestDemoHookErrorHandling:
    """AC3: Handle errors gracefully without blocking story completion."""

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_failure_does_not_block_finish(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """When demo generation fails, finish_story() must still succeed."""
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        # Demo generation returns failure
        mock_demo_generate.return_value = {
            "success": False,
            "error": "No PR diff available",
        }

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        assert result["success"] is True, (
            "finish_story() must succeed even when demo generation fails"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_exception_does_not_block_finish(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """When demo generation raises an exception, finish_story() must still succeed."""
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        # Demo generation raises an unexpected exception
        mock_demo_generate.side_effect = RuntimeError("Unexpected crash in demo pipeline")

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        assert result["success"] is True, (
            "finish_story() must succeed even when demo generation raises an exception"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_failure_recorded_in_steps(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Demo generation failure should be recorded as a step with a warning."""
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        mock_demo_generate.return_value = {
            "success": False,
            "error": "No PR diff available",
        }

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        steps = result.get("steps", [])
        demo_steps = [s for s in steps if "demo" in str(s.get("action", "")).lower()]
        assert len(demo_steps) >= 1, (
            f"Should have a demo step in the results, got steps: {steps}"
        )
        demo_step = demo_steps[0]
        assert "warning" in demo_step, (
            f"Demo failure step should include a 'warning' field, got: {demo_step}"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_exception_recorded_in_steps(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Demo generation exception should be recorded as a step with a warning."""
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        mock_demo_generate.side_effect = RuntimeError("Boom")

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        steps = result.get("steps", [])
        demo_steps = [s for s in steps if "demo" in str(s.get("action", "")).lower()]
        assert len(demo_steps) >= 1, (
            "Should have a demo step even when it throws an exception"
        )
        demo_step = demo_steps[0]
        assert "warning" in demo_step, (
            f"Demo exception step should include a 'warning' field, got: {demo_step}"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_success_recorded_in_steps(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Successful demo generation should be recorded as a step without warning."""
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        mock_demo_generate.return_value = {
            "success": True,
            "data": {
                "output_dir": "sprint/demos/42-1",
                "files": ["sprint/demos/42-1/narrative.md"],
            },
        }

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        steps = result.get("steps", [])
        demo_steps = [s for s in steps if "demo" in str(s.get("action", "")).lower()]
        assert len(demo_steps) >= 1, (
            f"Should have a demo step in the results, got steps: {steps}"
        )
        demo_step = demo_steps[0]
        assert "warning" not in demo_step, (
            f"Successful demo step should NOT have a warning, got: {demo_step}"
        )


class TestDemoHookStepOrdering:
    """Demo generation should happen at the right point in the finish pipeline."""

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_runs_before_session_removal(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Demo generation must run before the session file is deleted.

        The demo collector reads the session file for signals. If it runs
        after session removal, signal collection will fail.
        """
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )
        mock_demo_generate.return_value = {"success": True, "data": {"files": []}}

        call_order: list[str] = []

        def track_demo_call(*args, **kwargs):
            call_order.append("demo_generate")
            return {"success": True, "data": {"files": []}}

        mock_demo_generate.side_effect = track_demo_call

        # Session file is created in _setup_finish_env

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        assert result["success"] is True
        # Demo must have been called (tracked in call_order)
        assert "demo_generate" in call_order, (
            "Demo generate should have been called during finish"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish.read_sprint")
    @patch("pf.demo.orchestrator.generate")
    def test_demo_runs_after_session_archive(
        self,
        mock_demo_generate: MagicMock,
        mock_read_sprint: MagicMock,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Demo generation should run after session is archived.

        This ensures the archived session is available as a fallback
        if the collector needs it.
        """
        _setup_finish_env(tmp_path)
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_read_sprint.return_value = {"epics": []}
        # Story 155-1: finish now verifies the PR merged via `gh pr view --json
        # state`. The session carries PR #999, so the verify call must see a
        # MERGED state; one JSON stdout satisfies both `gh pr merge` (ignores
        # stdout) and `gh pr view` (parsed). Demo behavior under test is unchanged.
        mock_run.return_value = MagicMock(
            returncode=0, stdout='{"state": "MERGED"}', stderr=""
        )

        def verify_archive_exists(*args, **kwargs):
            archive_path = tmp_path / "sprint" / "archive" / "PROJ-99999-session.md"
            assert archive_path.exists(), (
                "Session should be archived before demo generation runs"
            )
            return {"success": True, "data": {"files": []}}

        mock_demo_generate.side_effect = verify_archive_exists

        from pf.sprint.story_finish import finish_story

        result = finish_story(tmp_path, "42-1")

        assert result["success"] is True
        mock_demo_generate.assert_called_once()
