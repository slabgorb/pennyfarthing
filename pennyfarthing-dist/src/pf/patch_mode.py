"""Patch Mode - Interrupt-Driven Bug Fix Workflow.

Story: 74-1 - Implement Patch Mode
Epic: epic-74 (Patch Mode Workflow)

This module provides the core functionality for Patch Mode, allowing developers
to interrupt their current workflow to fix blocking bugs and then resume work
with full context preserved.
"""

from __future__ import annotations

import re
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from pf.common.config import get_project_root


@dataclass
class PatchState:
    """State preserved when entering patch mode."""

    story_id: str
    workflow: str
    phase: str
    agent: str
    feature_branch: str

    def to_yaml(self) -> str:
        """Serialize state to YAML string."""
        return yaml.dump(asdict(self), default_flow_style=False)

    @classmethod
    def from_yaml(cls, yaml_str: str) -> PatchState:
        """Deserialize state from YAML string."""
        data = yaml.safe_load(yaml_str)
        return cls(**data)


class PatchStack:
    """Stack of patch states for nested patch support."""

    def __init__(self, stack_file: Path | None = None) -> None:
        """Initialize patch stack.

        Args:
            stack_file: Path to patch-stack.yaml file
        """
        if stack_file is None:
            root = get_project_root()
            stack_file = root / ".session" / "patch-stack.yaml"

        self.stack_file = stack_file
        self._stack: list[PatchState] = []

        # Load existing stack from file if it exists
        if self.stack_file.exists():
            self._load()

    def _load(self) -> None:
        """Load stack from file."""
        content = yaml.safe_load(self.stack_file.read_text())
        if content and "stack" in content:
            self._stack = [PatchState(**item) for item in content["stack"]]

    def _save(self) -> None:
        """Save stack to file."""
        # Ensure parent directory exists
        self.stack_file.parent.mkdir(parents=True, exist_ok=True)

        content = {"stack": [asdict(state) for state in self._stack]}
        self.stack_file.write_text(yaml.dump(content, default_flow_style=False))

    def push(self, state: PatchState) -> None:
        """Push state onto stack."""
        self._stack.append(state)
        self._save()

    def pop(self) -> PatchState:
        """Pop state from stack."""
        if not self._stack:
            raise IndexError("Cannot pop from empty patch stack")
        state = self._stack.pop()
        self._save()
        return state

    def depth(self) -> int:
        """Return current stack depth."""
        return len(self._stack)

    def peek(self) -> PatchState | None:
        """Peek at top of stack without popping."""
        return self._stack[-1] if self._stack else None


def get_patch_stack(stack_file: Path | None = None) -> PatchStack:
    """Get the patch stack instance.

    Args:
        stack_file: Optional path to stack file

    Returns:
        PatchStack instance
    """
    return PatchStack(stack_file=stack_file)


def _sanitize_branch_name(description: str) -> str:
    """Sanitize description for use in branch name.

    Args:
        description: Raw description string

    Returns:
        Sanitized string safe for git branch names
    """
    # Replace special characters with dashes
    sanitized = re.sub(r"[^a-zA-Z0-9\s-]", "", description)
    # Replace spaces with dashes
    sanitized = re.sub(r"\s+", "-", sanitized)
    # Remove multiple consecutive dashes
    sanitized = re.sub(r"-+", "-", sanitized)
    # Lowercase and strip
    sanitized = sanitized.lower().strip("-")
    # Truncate if too long
    return sanitized[:50]


def create_patch_branch(
    description: str,
    feature_branch: str,
    repo_path: Path | None = None,
) -> str:
    """Create a patch branch from the current feature branch.

    Args:
        description: Description for branch name
        feature_branch: Current feature branch
        repo_path: Path to git repository

    Returns:
        Name of created patch branch

    Raises:
        ValueError: If description is empty or produces empty branch name
    """
    if not description or not description.strip():
        raise ValueError("Patch description cannot be empty")

    timestamp = int(time.time())
    sanitized_desc = _sanitize_branch_name(description)

    if not sanitized_desc:
        raise ValueError(
            f"Patch description '{description}' produces empty branch name after sanitization"
        )

    branch_name = f"patch/{sanitized_desc}-{timestamp}"

    cwd = str(repo_path) if repo_path else None

    # Create and checkout the new branch from current HEAD (feature branch)
    result = subprocess.run(
        ["git", "checkout", "-b", branch_name],
        capture_output=True,
        text=True,
        cwd=cwd,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Git branch creation failed: {result.stderr}")

    return branch_name


def merge_patch_branch(
    patch_branch: str,
    feature_branch: str,
    repo_path: Path | None = None,
) -> None:
    """Merge patch branch back to feature branch and delete it.

    Args:
        patch_branch: Name of patch branch
        feature_branch: Target feature branch
        repo_path: Path to git repository
    """
    cwd = str(repo_path) if repo_path else None

    # Checkout feature branch
    result = subprocess.run(
        ["git", "checkout", feature_branch],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Git checkout failed: {result.stderr}")

    # Merge patch branch
    result = subprocess.run(
        ["git", "merge", patch_branch],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Git merge failed: {result.stderr}")

    # Delete patch branch
    result = subprocess.run(
        ["git", "branch", "-d", patch_branch],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Git branch delete failed: {result.stderr}")


def enter_patch_mode(
    description: str,
    story_id: str,
    workflow: str,
    phase: str,
    agent: str,
    feature_branch: str,
    repo_path: Path | None = None,
    stack_file: Path | None = None,
) -> dict[str, Any]:
    """Enter patch mode by saving state and creating patch branch.

    Args:
        description: Description of the patch/fix
        story_id: Current story ID
        workflow: Current workflow type
        phase: Current workflow phase
        agent: Current agent
        feature_branch: Current feature branch name
        repo_path: Path to git repository
        stack_file: Path to patch-stack.yaml

    Returns:
        Dict with patch_branch and other metadata
    """
    # Save current state to stack
    state = PatchState(
        story_id=story_id,
        workflow=workflow,
        phase=phase,
        agent=agent,
        feature_branch=feature_branch,
    )

    stack = get_patch_stack(stack_file)
    stack.push(state)

    # Create patch branch
    try:
        patch_branch = create_patch_branch(
            description=description,
            feature_branch=feature_branch,
            repo_path=repo_path,
        )
    except Exception as e:
        # Rollback stack on failure
        stack.pop()
        raise RuntimeError(f"Git error: {e}") from e

    return {
        "patch_branch": patch_branch,
        "agent": "dev",  # Patch mode is always dev
        "story_id": story_id,
        "description": description,
    }


def exit_patch_mode(
    patch_branch: str | None = None,
    repo_path: Path | None = None,
    stack_file: Path | None = None,
) -> dict[str, Any]:
    """Exit patch mode by merging and restoring state.

    Args:
        patch_branch: Name of patch branch to merge
        repo_path: Path to git repository
        stack_file: Path to patch-stack.yaml

    Returns:
        Dict with restored state and handoff_marker
    """
    stack = get_patch_stack(stack_file)

    # Peek at state first - don't pop until operations succeed
    state = stack.peek()
    if state is None:
        raise RuntimeError("Cannot exit patch mode: stack is empty")

    # Merge patch branch back to feature branch if provided
    # Do this BEFORE popping state so we can recover on failure
    if patch_branch:
        merge_patch_branch(
            patch_branch=patch_branch,
            feature_branch=state.feature_branch,
            repo_path=repo_path,
        )

    # Only pop after successful merge
    stack.pop()

    return {
        "story_id": state.story_id,
        "workflow": state.workflow,
        "phase": state.phase,
        "agent": state.agent,
        "feature_branch": state.feature_branch,
        "relay_mode_disabled": False,
    }


def restore_workflow_state(
    repo_path: Path | None = None,
    stack_file: Path | None = None,
) -> dict[str, Any]:
    """Restore workflow state from patch stack.

    Args:
        repo_path: Path to git repository
        stack_file: Path to patch-stack.yaml

    Returns:
        Dict with restored state
    """
    stack = get_patch_stack(stack_file)

    # Peek at state first - don't pop until checkout succeeds
    state = stack.peek()
    if state is None:
        raise RuntimeError("Cannot restore workflow state: stack is empty")

    cwd = str(repo_path) if repo_path else None

    # Checkout the original feature branch
    result = subprocess.run(
        ["git", "checkout", state.feature_branch],
        capture_output=True,
        text=True,
        cwd=cwd,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Git checkout failed: {result.stderr}")

    # Only pop after successful checkout
    stack.pop()

    return {
        "story_id": state.story_id,
        "workflow": state.workflow,
        "phase": state.phase,
        "agent": state.agent,
        "feature_branch": state.feature_branch,
    }


def log_patch_to_session(
    session_file: Path,
    description: str,
    commit_sha: str,
) -> None:
    """Log completed patch to session file.

    Args:
        session_file: Path to session markdown file
        description: Patch description
        commit_sha: Git commit SHA
    """
    content = session_file.read_text()

    # Find the Patches section and add entry
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    patch_entry = f"- **{timestamp}**: {description} (`{commit_sha}`)\n"

    # Look for the marker comment or Patches header
    if "<!-- Patches applied during this story will be logged here -->" in content:
        content = content.replace(
            "<!-- Patches applied during this story will be logged here -->",
            f"<!-- Patches applied during this story will be logged here -->\n{patch_entry}",
        )
    elif "## Patches" in content:
        # Insert after the Patches header
        idx = content.find("## Patches")
        next_newline = content.find("\n", idx)
        content = content[: next_newline + 1] + "\n" + patch_entry + content[next_newline + 1 :]
    else:
        # Append at end
        content += f"\n## Patches\n\n{patch_entry}"

    session_file.write_text(content)


def generate_patch_commit_message(
    description: str,
    story_id: str,
) -> str:
    """Generate commit message for patch.

    Format: fix(patch): description [from:STORY-ID]

    Args:
        description: Patch description
        story_id: Story ID the patch is from

    Returns:
        Formatted commit message
    """
    return f"""fix(patch): {description} [from:{story_id}]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
"""


def is_in_patch_mode(stack_file: Path | None = None) -> bool:
    """Check if currently in patch mode.

    Args:
        stack_file: Path to patch-stack.yaml

    Returns:
        True if patch stack is non-empty
    """
    stack = get_patch_stack(stack_file)
    return stack.depth() > 0
