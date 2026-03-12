"""BMAD Pipeline Adapter — integrate BMAD templates into replay harness.

Story 142-3: Wires BMAD templates (from 142-2) into the Peloton pipeline
replay harness via `--pipeline bmad`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from pf.benchmark.bmad_adapter import (
    BmadConfig,
    build_bmad_dev_claude_md,
    build_bmad_reviewer_claude_md,
    translate_story_file,
)

VALID_PIPELINES = ("default", "bmad")


@dataclass
class PipelineConfig:
    """Configuration for a pipeline variant (default PF or BMAD)."""

    pipeline_name: str
    phases: list[str]
    result_subdir: str
    build_claude_md: Callable[..., str] | None = None
    setup_worktree: Callable[..., dict[str, str]] | None = None

    def pipeline_metadata(self) -> dict[str, Any]:
        return {"pipeline": self.pipeline_name}


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
    if pipeline_name not in VALID_PIPELINES:
        raise ValueError(
            f"Invalid pipeline '{pipeline_name}'. "
            f"Valid options: {', '.join(VALID_PIPELINES)} (default, bmad)"
        )

    if pipeline_name == "default":
        return PipelineConfig(
            pipeline_name="default",
            phases=["tea", "dev", "reviewer"],
            result_subdir="default",
        )

    # bmad pipeline
    if bmad_root is None:
        raise ValueError("bmad_root is required for the 'bmad' pipeline")

    bmad_config = BmadConfig(bmad_root=bmad_root)

    return PipelineConfig(
        pipeline_name="bmad",
        phases=["dev", "reviewer"],
        result_subdir="bmad",
        build_claude_md=lambda **kw: build_bmad_phase_claude_md(bmad_config=bmad_config, **kw),
        setup_worktree=lambda **kw: setup_bmad_worktree(bmad_config=bmad_config, **kw),
    )


def build_bmad_phase_claude_md(
    *,
    role: str,
    bmad_config: BmadConfig,
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
    if role not in ("dev", "reviewer"):
        raise ValueError(
            f"Invalid BMAD role '{role}'. Valid roles: dev, reviewer"
        )

    epic_context = epic_context_path.read_text()
    story_context = story_context_path.read_text()

    if role == "dev":
        return build_bmad_dev_claude_md(
            bmad_config,
            story_content=story_context,
            project_context=epic_context,
        )

    # reviewer
    return build_bmad_reviewer_claude_md(
        bmad_config,
        dev_output=dev_output,
    )


def setup_bmad_worktree(
    *,
    bmad_config: BmadConfig,
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

    Does NOT create _bmad/, sprint-status.yaml, or config.yaml.

    Returns:
        Dict with 'story_path' key pointing to the created story file.
    """
    epic_context = epic_context_path.read_text()
    story_context = story_context_path.read_text()

    # Create BMAD-format story file
    story_content = translate_story_file(
        bmad_config,
        epic_context=epic_context,
        story_context=story_context,
        story_title=story_title,
        acceptance_criteria=acceptance_criteria,
    )

    artifacts_dir = worktree_path / "implementation_artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    story_file = artifacts_dir / f"{story_key}.md"
    story_file.write_text(story_content)

    # Create project-context.md
    if project_context:
        (worktree_path / "project-context.md").write_text(project_context)

    story_path = f"implementation_artifacts/{story_key}.md"
    return {"story_path": story_path}
