"""BMAD Pipeline Adapter — integrate BMAD templates into replay harness.

Story 142-3: Wires BMAD templates (from 142-2) into the Peloton pipeline
replay harness via `--pipeline bmad`.

STUB: Functions raise NotImplementedError — implementation in GREEN phase.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


@dataclass
class PipelineConfig:
    """Configuration for a pipeline variant (default PF or BMAD)."""

    pipeline_name: str
    phases: list[str]
    result_subdir: str
    build_claude_md: Callable[..., str] | None = None
    setup_worktree: Callable[..., dict[str, str]] | None = None

    def pipeline_metadata(self) -> dict[str, Any]:
        raise NotImplementedError("pipeline_metadata not implemented")


def get_pipeline_config(
    pipeline_name: str,
    *,
    bmad_root: Path | None = None,
) -> PipelineConfig:
    """Get pipeline configuration by name.

    Args:
        pipeline_name: 'default' or 'bmad'
        bmad_root: Path to BMAD-METHOD repo (required for 'bmad')

    Returns:
        PipelineConfig with phases, builders, and storage config.

    Raises:
        ValueError: If pipeline_name is not 'default' or 'bmad'.
    """
    raise NotImplementedError("get_pipeline_config not implemented")


def build_bmad_phase_claude_md(
    *,
    role: str,
    bmad_config: Any,
    epic_context_path: Path,
    story_context_path: Path,
    worktree_path: Path,
    dev_output: str = "",
) -> str:
    """Build a CLAUDE.md for a BMAD pipeline phase.

    Args:
        role: 'dev' or 'reviewer'
        bmad_config: BmadConfig instance
        epic_context_path: Path to epic context doc
        story_context_path: Path to story context doc
        worktree_path: Path to the git worktree
        dev_output: Dev phase output (for reviewer phase)

    Returns:
        CLAUDE.md content string.

    Raises:
        ValueError: If role is not 'dev' or 'reviewer'.
    """
    raise NotImplementedError("build_bmad_phase_claude_md not implemented")


def setup_bmad_worktree(
    *,
    bmad_config: Any,
    worktree_path: Path,
    story_key: str,
    story_title: str,
    epic_context_path: Path,
    story_context_path: Path,
    acceptance_criteria: str,
    project_context: str = "",
) -> dict[str, str]:
    """Set up BMAD-specific files in the worktree.

    Creates:
    - implementation_artifacts/{story_key}.md (BMAD-format story file)
    - project-context.md (from target project coding standards)

    Does NOT create:
    - _bmad/ directory
    - sprint-status.yaml
    - config.yaml

    Args:
        bmad_config: BmadConfig instance
        worktree_path: Path to the git worktree
        story_key: Story identifier (e.g., 'DPGD-116')
        story_title: Human-readable story title
        epic_context_path: Path to epic context doc
        story_context_path: Path to story context doc
        acceptance_criteria: Acceptance criteria text
        project_context: Project coding standards text

    Returns:
        Dict with 'story_path' key pointing to the created story file.
    """
    raise NotImplementedError("setup_bmad_worktree not implemented")
