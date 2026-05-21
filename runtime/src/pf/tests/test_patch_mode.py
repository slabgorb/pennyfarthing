"""Tests for Patch Mode - Interrupt-Driven Bug Fix Workflow.

Story: 74-1 - Implement Patch Mode
Epic: epic-74 (Patch Mode Workflow)

Acceptance Criteria:
- [AC1] /patch "description" command triggers Patch Mode
- [AC2] State preserved (story_id, workflow, phase, agent, feature_branch)
- [AC3] Patch branch created from feature branch (not develop)
- [AC4] Dev-only workflow (no TEA handoff)
- [AC5] Commit format fix(patch): desc [from:STORY-ID]
- [AC6] Merge back to feature branch on completion
- [AC7] Original workflow state restored after merge
- [AC8] Session file includes patches: section for archive
- [AC9] Tirepump integration auto-handoff back to original agent
- [AC10] Nested patches supported (patch-stack is a stack)

These tests should FAIL until patch_mode.py is implemented.
"""

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
import yaml

# Import will fail until module exists - this is intentional for RED state
try:
    from pf.patch_mode import (
        PatchStack,
        PatchState,
        create_patch_branch,
        enter_patch_mode,
        exit_patch_mode,
        generate_patch_commit_message,
        get_patch_stack,
        is_in_patch_mode,
        log_patch_to_session,
        merge_patch_branch,
        restore_workflow_state,
    )

    IMPORT_SUCCESS = True
except ImportError:
    IMPORT_SUCCESS = False

    # Stub classes for test compilation
    class PatchState:
        pass

    class PatchStack:
        pass

    def enter_patch_mode(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def exit_patch_mode(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def get_patch_stack(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def create_patch_branch(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def merge_patch_branch(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def restore_workflow_state(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def log_patch_to_session(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def generate_patch_commit_message(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")

    def is_in_patch_mode(*args, **kwargs):
        raise NotImplementedError("patch_mode.py not implemented")


class TestPatchModeModuleExists:
    """Tests that the patch_mode module exists and is importable."""

    def test_module_importable(self) -> None:
        """patch_mode module should be importable."""
        assert IMPORT_SUCCESS, "pf.patch_mode module does not exist"

    def test_patch_state_class_exists(self) -> None:
        """PatchState class should exist."""
        assert IMPORT_SUCCESS, "PatchState class not found"
        # When implemented, PatchState should have these attributes
        assert hasattr(PatchState, "__init__") or not IMPORT_SUCCESS

    def test_patch_stack_class_exists(self) -> None:
        """PatchStack class should exist."""
        assert IMPORT_SUCCESS, "PatchStack class not found"


class TestPatchStatePreservation:
    """Tests for AC2: State preserved (story_id, workflow, phase, agent, feature_branch)."""

    @pytest.fixture
    def mock_session_state(self) -> dict[str, Any]:
        """Sample session state to preserve."""
        return {
            "story_id": "PROJ-12345",
            "workflow": "tdd",
            "phase": "green",
            "agent": "dev",
            "feature_branch": "feat/PROJ-12345-new-feature",
        }

    def test_patch_state_stores_story_id(self, mock_session_state: dict) -> None:
        """AC2: PatchState should store story_id."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        state = PatchState(**mock_session_state)
        assert state.story_id == "PROJ-12345"

    def test_patch_state_stores_workflow(self, mock_session_state: dict) -> None:
        """AC2: PatchState should store workflow type."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        state = PatchState(**mock_session_state)
        assert state.workflow == "tdd"

    def test_patch_state_stores_phase(self, mock_session_state: dict) -> None:
        """AC2: PatchState should store phase."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        state = PatchState(**mock_session_state)
        assert state.phase == "green"

    def test_patch_state_stores_agent(self, mock_session_state: dict) -> None:
        """AC2: PatchState should store agent."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        state = PatchState(**mock_session_state)
        assert state.agent == "dev"

    def test_patch_state_stores_feature_branch(self, mock_session_state: dict) -> None:
        """AC2: PatchState should store feature_branch."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        state = PatchState(**mock_session_state)
        assert state.feature_branch == "feat/PROJ-12345-new-feature"

    def test_patch_state_serializes_to_yaml(self, mock_session_state: dict) -> None:
        """AC2: PatchState should be serializable to YAML."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        state = PatchState(**mock_session_state)
        yaml_str = state.to_yaml()
        parsed = yaml.safe_load(yaml_str)
        assert parsed["story_id"] == "PROJ-12345"
        assert parsed["workflow"] == "tdd"

    def test_patch_state_deserializes_from_yaml(self, mock_session_state: dict) -> None:
        """AC2: PatchState should be deserializable from YAML."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        yaml_str = yaml.dump(mock_session_state)
        state = PatchState.from_yaml(yaml_str)
        assert state.story_id == "PROJ-12345"


class TestPatchBranchCreation:
    """Tests for AC3: Patch branch created from feature branch (not develop)."""

    def test_create_branch_from_feature_not_develop(self, tmp_path: Path) -> None:
        """AC3: Patch branch should be created from feature branch, not develop."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        # Mock git operations
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            branch_name = create_patch_branch(
                description="fix broken script",
                feature_branch="feat/PROJ-12345-feature",
                repo_path=tmp_path,
            )
            # Should NOT checkout develop first
            calls = [str(c) for c in mock_run.call_args_list]
            assert not any("checkout develop" in c for c in calls)
            # Should create branch from current (feature) branch
            assert "patch/" in branch_name

    def test_branch_name_format(self) -> None:
        """AC3: Branch name should follow patch/<desc>-<timestamp> format."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            branch_name = create_patch_branch(
                description="fix broken script",
                feature_branch="feat/PROJ-12345-feature",
            )
            assert branch_name.startswith("patch/")
            assert "fix-broken-script" in branch_name or "fix_broken_script" in branch_name

    def test_branch_name_sanitizes_description(self) -> None:
        """AC3: Branch name should sanitize special characters from description."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            branch_name = create_patch_branch(
                description="fix: broken/script (urgent!)",
                feature_branch="feat/PROJ-12345-feature",
            )
            # Should not contain special characters
            assert ":" not in branch_name
            assert "(" not in branch_name
            assert "!" not in branch_name


class TestDevOnlyWorkflow:
    """Tests for AC4: Dev-only workflow (no TEA handoff)."""

    def test_patch_workflow_has_no_tea_phase(self) -> None:
        """AC4: Patch workflow should not include TEA phase."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        # Read patch.yaml workflow definition
        from pf.common.config import get_dist_root
        workflow_path = get_dist_root() / "workflows" / "patch.yaml"
        if not workflow_path.exists():
            pytest.fail("patch.yaml workflow file does not exist")

        with open(workflow_path) as f:
            workflow = yaml.safe_load(f)

        phases = workflow.get("workflow", {}).get("phases", [])
        phase_agents = [p.get("agent") for p in phases]
        assert "tea" not in phase_agents, "Patch workflow should not include TEA"

    def test_enter_patch_mode_sets_dev_agent(self) -> None:
        """AC4: Entering patch mode should set agent to dev."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            result = enter_patch_mode(
                description="fix broken script",
                story_id="PROJ-12345",
                workflow="tdd",
                phase="green",
                agent="dev",
                feature_branch="feat/PROJ-12345-feature",
            )
            # Should indicate dev agent
            assert result.get("agent") == "dev" or result.agent == "dev"


class TestCommitFormat:
    """Tests for AC5: Commit format fix(patch): desc [from:STORY-ID]."""

    def test_commit_message_format(self) -> None:
        """AC5: Commit message should follow fix(patch): desc [from:STORY-ID] format."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        msg = generate_patch_commit_message(
            description="fix broken script path",
            story_id="PROJ-12345",
        )
        assert msg.startswith("fix(patch):")
        assert "fix broken script path" in msg
        assert "[from:PROJ-12345]" in msg

    def test_commit_message_with_local_story_id(self) -> None:
        """AC5: Commit message should work with local story IDs (no JIRA)."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        msg = generate_patch_commit_message(
            description="fix path error",
            story_id="74-1",
        )
        assert "[from:74-1]" in msg

    def test_commit_message_includes_coauthor(self) -> None:
        """AC5: Commit message should include Co-Authored-By line."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        msg = generate_patch_commit_message(
            description="fix script",
            story_id="PROJ-12345",
        )
        assert "Co-Authored-By:" in msg


class TestMergeBack:
    """Tests for AC6: Merge back to feature branch on completion."""

    def test_merge_patch_to_feature_branch(self, tmp_path: Path) -> None:
        """AC6: merge_patch_branch should merge to feature branch."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            merge_patch_branch(
                patch_branch="patch/fix-script-1234567890",
                feature_branch="feat/PROJ-12345-feature",
                repo_path=tmp_path,
            )
            # Should merge patch into feature branch
            calls = [str(c) for c in mock_run.call_args_list]
            merge_call = [c for c in calls if "merge" in c]
            assert len(merge_call) > 0, "Should call git merge"

    def test_merge_deletes_patch_branch(self, tmp_path: Path) -> None:
        """AC6: merge_patch_branch should delete the patch branch after merge."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            merge_patch_branch(
                patch_branch="patch/fix-script-1234567890",
                feature_branch="feat/PROJ-12345-feature",
                repo_path=tmp_path,
            )
            # Should delete patch branch
            calls = [str(c) for c in mock_run.call_args_list]
            delete_call = [c for c in calls if "branch" in c and "-d" in c]
            assert len(delete_call) > 0, "Should delete patch branch"


class TestStateRestoration:
    """Tests for AC7: Original workflow state restored after merge."""

    @pytest.fixture
    def saved_state(self) -> dict[str, Any]:
        """Sample saved state."""
        return {
            "story_id": "PROJ-12345",
            "workflow": "tdd",
            "phase": "green",
            "agent": "dev",
            "feature_branch": "feat/PROJ-12345-feature",
        }

    def test_restore_returns_original_state(self, saved_state: dict) -> None:
        """AC7: restore_workflow_state should return original state."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.get_patch_stack") as mock_stack:
            state = PatchState(**saved_state)
            mock_stack.return_value.peek.return_value = state
            mock_stack.return_value.pop.return_value = state
            with patch("pf.patch_mode.subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0)
                result = restore_workflow_state()
                assert result["story_id"] == "PROJ-12345"
                assert result["workflow"] == "tdd"
                assert result["phase"] == "green"

    def test_restore_checkouts_feature_branch(self, tmp_path: Path, saved_state: dict) -> None:
        """AC7: restore should checkout the original feature branch."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.get_patch_stack") as mock_stack:
            state = PatchState(**saved_state)
            mock_stack.return_value.peek.return_value = state
            mock_stack.return_value.pop.return_value = state
            with patch("pf.patch_mode.subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0)
                restore_workflow_state(repo_path=tmp_path)
                # Should checkout feature branch
                calls = [str(c) for c in mock_run.call_args_list]
                checkout_call = [c for c in calls if "checkout" in c and "feat/PROJ-12345" in c]
                assert len(checkout_call) > 0


class TestSessionPatches:
    """Tests for AC8: Session file includes patches: section for archive."""

    def test_log_patch_adds_to_session(self, tmp_path: Path) -> None:
        """AC8: log_patch_to_session should add patch to session file."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        session_file = tmp_path / ".session" / "PROJ-12345-session.md"
        session_file.parent.mkdir(parents=True, exist_ok=True)
        session_file.write_text("""# Session: PROJ-12345

## Patches

<!-- Patches applied during this story will be logged here -->
""")

        log_patch_to_session(
            session_file=session_file,
            description="fix broken script",
            commit_sha="abc1234",
        )

        content = session_file.read_text()
        assert "fix broken script" in content
        assert "abc1234" in content

    def test_log_patch_includes_timestamp(self, tmp_path: Path) -> None:
        """AC8: Patch log should include timestamp."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        session_file = tmp_path / ".session" / "PROJ-12345-session.md"
        session_file.parent.mkdir(parents=True, exist_ok=True)
        session_file.write_text("""# Session: PROJ-12345

## Patches

<!-- Patches applied during this story will be logged here -->
""")

        log_patch_to_session(
            session_file=session_file,
            description="fix script",
            commit_sha="abc1234",
        )

        content = session_file.read_text()
        # Should have a date in YYYY-MM-DD format
        import re

        assert re.search(r"\d{4}-\d{2}-\d{2}", content)


class TestTirepumpIntegration:
    """Tests for AC9: Tirepump integration auto-handoff back to original agent."""

    def test_exit_patch_mode_returns_agent(self) -> None:
        """AC9: exit_patch_mode should return original agent for handoff."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.get_patch_stack") as mock_stack:
            mock_state = MagicMock()
            mock_state.agent = "dev"
            mock_state.story_id = "PROJ-12345"
            mock_state.workflow = "tdd"
            mock_state.phase = "green"
            mock_state.feature_branch = "feat/test"
            mock_stack.return_value.peek.return_value = mock_state
            mock_stack.return_value.pop.return_value = mock_state

            with patch("pf.patch_mode.subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0)
                result = exit_patch_mode()

                # Should include agent for handoff (CYCLIST marker deprecated)
                assert result["agent"] == "dev"

    def test_exit_preserves_relay_mode(self) -> None:
        """AC9: Exiting patch mode should preserve relay mode setting."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        # Relay mode should continue after patch completes
        with patch("pf.patch_mode.get_patch_stack") as mock_stack:
            mock_state = MagicMock()
            mock_state.agent = "dev"
            mock_state.story_id = "PROJ-12345"
            mock_state.workflow = "tdd"
            mock_state.phase = "green"
            mock_state.feature_branch = "feat/test"
            mock_stack.return_value.peek.return_value = mock_state
            mock_stack.return_value.pop.return_value = mock_state

            with patch("pf.patch_mode.subprocess.run") as mock_run:
                mock_run.return_value = MagicMock(returncode=0)
                result = exit_patch_mode()
                # Should not disable relay mode
                assert result.get("relay_mode_disabled") is not True


class TestNestedPatches:
    """Tests for AC10: Nested patches supported (patch-stack is a stack)."""

    def test_patch_stack_supports_push(self, tmp_path: Path) -> None:
        """AC10: PatchStack should support push operation."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        stack = PatchStack(stack_file=tmp_path / ".session" / "patch-stack.yaml")
        state1 = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/PROJ-12345-feature",
        )
        stack.push(state1)
        assert stack.depth() == 1

    def test_patch_stack_supports_pop(self, tmp_path: Path) -> None:
        """AC10: PatchStack should support pop operation."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        stack = PatchStack(stack_file=tmp_path / ".session" / "patch-stack.yaml")
        state1 = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/PROJ-12345-feature",
        )
        stack.push(state1)
        popped = stack.pop()
        assert popped.story_id == "PROJ-12345"
        assert stack.depth() == 0

    def test_patch_stack_is_lifo(self, tmp_path: Path) -> None:
        """AC10: PatchStack should be LIFO (last in, first out)."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        stack = PatchStack(stack_file=tmp_path / ".session" / "patch-stack.yaml")
        state1 = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/feature-1",
        )
        state2 = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="patch/fix-1",  # Nested patch
        )
        stack.push(state1)
        stack.push(state2)

        # Pop should return state2 first (LIFO)
        popped = stack.pop()
        assert popped.feature_branch == "patch/fix-1"

        # Then state1
        popped = stack.pop()
        assert popped.feature_branch == "feat/feature-1"

    def test_nested_patch_preserves_parent_state(self, tmp_path: Path) -> None:
        """AC10: Entering nested patch should preserve parent patch state."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            # Enter first patch
            enter_patch_mode(
                description="fix first bug",
                story_id="PROJ-12345",
                workflow="tdd",
                phase="green",
                agent="dev",
                feature_branch="feat/PROJ-12345-feature",
                stack_file=tmp_path / ".session" / "patch-stack.yaml",
            )

            # Enter nested patch
            enter_patch_mode(
                description="fix second bug during first fix",
                story_id="PROJ-12345",
                workflow="tdd",
                phase="green",
                agent="dev",
                feature_branch="patch/fix-first-bug-1234567890",
                stack_file=tmp_path / ".session" / "patch-stack.yaml",
            )

            stack = get_patch_stack(tmp_path / ".session" / "patch-stack.yaml")
            assert stack.depth() == 2

    def test_patch_stack_persists_to_file(self, tmp_path: Path) -> None:
        """AC10: PatchStack should persist state to patch-stack.yaml."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        stack_file = tmp_path / ".session" / "patch-stack.yaml"
        stack_file.parent.mkdir(parents=True, exist_ok=True)

        stack = PatchStack(stack_file=stack_file)
        state = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/feature-1",
        )
        stack.push(state)

        # File should exist with state
        assert stack_file.exists()
        content = yaml.safe_load(stack_file.read_text())
        assert len(content.get("stack", [])) == 1

    def test_is_in_patch_mode_detects_active_patch(self, tmp_path: Path) -> None:
        """AC10: is_in_patch_mode should return True when stack is non-empty."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        stack_file = tmp_path / ".session" / "patch-stack.yaml"
        stack_file.parent.mkdir(parents=True, exist_ok=True)

        # Initially not in patch mode
        assert not is_in_patch_mode(stack_file=stack_file)

        # After pushing, should be in patch mode
        stack = PatchStack(stack_file=stack_file)
        state = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/feature-1",
        )
        stack.push(state)

        assert is_in_patch_mode(stack_file=stack_file)


class TestPatchStackFileLocation:
    """Tests for patch-stack.yaml file location."""

    def test_default_stack_file_in_session_dir(self) -> None:
        """Stack file should default to .session/patch-stack.yaml."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        stack = get_patch_stack()
        expected_suffix = Path(".session") / "patch-stack.yaml"
        assert str(stack.stack_file).endswith(str(expected_suffix))


class TestEnterPatchModeIntegration:
    """Integration tests for enter_patch_mode function."""

    def test_enter_creates_branch_and_saves_state(self, tmp_path: Path) -> None:
        """enter_patch_mode should create branch and save state atomically."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="patch/fix-bug-123")

            stack_file = tmp_path / ".session" / "patch-stack.yaml"
            result = enter_patch_mode(
                description="fix bug",
                story_id="PROJ-12345",
                workflow="tdd",
                phase="green",
                agent="dev",
                feature_branch="feat/PROJ-12345-feature",
                repo_path=tmp_path,
                stack_file=stack_file,
            )

            # Should have created branch
            assert "patch_branch" in result or hasattr(result, "patch_branch")

            # Should have saved state
            assert stack_file.exists()

    def test_enter_fails_gracefully_on_git_error(self, tmp_path: Path) -> None:
        """enter_patch_mode should fail gracefully if git fails."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")
        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="git error")

            with pytest.raises(Exception) as exc_info:
                enter_patch_mode(
                    description="fix bug",
                    story_id="PROJ-12345",
                    workflow="tdd",
                    phase="green",
                    agent="dev",
                    feature_branch="feat/PROJ-12345-feature",
                    repo_path=tmp_path,
                )

            assert "git" in str(exc_info.value).lower()


class TestExitPatchModeIntegration:
    """Integration tests for exit_patch_mode function."""

    def test_exit_merges_restores_and_cleans_up(self, tmp_path: Path) -> None:
        """exit_patch_mode should merge, restore state, and clean up."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")

        # Setup: create stack with saved state
        stack_file = tmp_path / ".session" / "patch-stack.yaml"
        stack_file.parent.mkdir(parents=True, exist_ok=True)
        stack = PatchStack(stack_file=stack_file)
        state = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/PROJ-12345-feature",
        )
        stack.push(state)

        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)

            result = exit_patch_mode(
                patch_branch="patch/fix-bug-123",
                repo_path=tmp_path,
                stack_file=stack_file,
            )

            # Should have merged
            calls = [str(c) for c in mock_run.call_args_list]
            assert any("merge" in c for c in calls)

            # Should have returned original state
            assert result["story_id"] == "PROJ-12345"

            # Stack should be empty (reload from file to check)
            reloaded_stack = PatchStack(stack_file=stack_file)
            assert reloaded_stack.depth() == 0

    def test_exit_preserves_state_on_merge_failure(self, tmp_path: Path) -> None:
        """exit_patch_mode should preserve state if git merge fails."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")

        # Setup: create stack with saved state
        stack_file = tmp_path / ".session" / "patch-stack.yaml"
        stack_file.parent.mkdir(parents=True, exist_ok=True)
        stack = PatchStack(stack_file=stack_file)
        state = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/PROJ-12345-feature",
        )
        stack.push(state)

        # Mock git to fail on merge (second call)
        call_count = [0]

        def mock_run_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:  # checkout succeeds
                return MagicMock(returncode=0)
            else:  # merge fails
                return MagicMock(returncode=1, stderr="merge conflict")

        with patch("pf.patch_mode.subprocess.run", side_effect=mock_run_side_effect):
            with pytest.raises(RuntimeError) as exc_info:
                exit_patch_mode(
                    patch_branch="patch/fix-bug-123",
                    repo_path=tmp_path,
                    stack_file=stack_file,
                )

            assert "merge" in str(exc_info.value).lower()

            # State should be PRESERVED (not lost)
            reloaded_stack = PatchStack(stack_file=stack_file)
            assert reloaded_stack.depth() == 1, "State should be preserved on merge failure"
            preserved = reloaded_stack.peek()
            assert preserved.story_id == "PROJ-12345"

    def test_restore_preserves_state_on_checkout_failure(self, tmp_path: Path) -> None:
        """restore_workflow_state should preserve state if git checkout fails."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")

        # Setup: create stack with saved state
        stack_file = tmp_path / ".session" / "patch-stack.yaml"
        stack_file.parent.mkdir(parents=True, exist_ok=True)
        stack = PatchStack(stack_file=stack_file)
        state = PatchState(
            story_id="PROJ-12345",
            workflow="tdd",
            phase="green",
            agent="dev",
            feature_branch="feat/PROJ-12345-feature",
        )
        stack.push(state)

        with patch("pf.patch_mode.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="branch does not exist")

            with pytest.raises(RuntimeError) as exc_info:
                restore_workflow_state(
                    repo_path=tmp_path,
                    stack_file=stack_file,
                )

            assert "checkout" in str(exc_info.value).lower()

            # State should be PRESERVED (not lost)
            reloaded_stack = PatchStack(stack_file=stack_file)
            assert reloaded_stack.depth() == 1, "State should be preserved on checkout failure"
            preserved = reloaded_stack.peek()
            assert preserved.story_id == "PROJ-12345"


class TestDescriptionValidation:
    """Tests for description validation in create_patch_branch."""

    def test_empty_description_raises_error(self) -> None:
        """create_patch_branch should reject empty description."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")

        with pytest.raises(ValueError) as exc_info:
            create_patch_branch(
                description="",
                feature_branch="feat/test",
            )

        assert "empty" in str(exc_info.value).lower()

    def test_whitespace_only_description_raises_error(self) -> None:
        """create_patch_branch should reject whitespace-only description."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")

        with pytest.raises(ValueError) as exc_info:
            create_patch_branch(
                description="   ",
                feature_branch="feat/test",
            )

        assert "empty" in str(exc_info.value).lower()

    def test_special_chars_only_description_raises_error(self) -> None:
        """create_patch_branch should reject description that sanitizes to empty."""
        if not IMPORT_SUCCESS:
            pytest.skip("Module not implemented")

        with pytest.raises(ValueError) as exc_info:
            create_patch_branch(
                description="!!!",
                feature_branch="feat/test",
            )

        assert "empty" in str(exc_info.value).lower()
