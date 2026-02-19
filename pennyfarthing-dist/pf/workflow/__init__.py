"""
Workflow package — scale levels, phase ownership, and workflow CLI commands.

Re-exports all public symbols for backward compatibility with
`from pf.workflow import ...`.
"""

from pf.workflow.scale import (
    SCALE_LEVELS,
    detect_scale_level,
    determine_scale_level,
    get_required_artifacts,
    get_scale_level_info,
    get_workflow_for_scale_level,
    scale_level_from_story_count,
)
from pf.workflow.state import (
    TDD_PHASE_OWNERS,
    TRIVIAL_PHASE_OWNERS,
    WORKFLOW_PHASES,
    get_phase_owner,
    get_workflow_state,
)

__all__ = [
    # Scale
    "SCALE_LEVELS",
    "detect_scale_level",
    "determine_scale_level",
    "get_required_artifacts",
    "get_scale_level_info",
    "get_workflow_for_scale_level",
    "scale_level_from_story_count",
    # State
    "TDD_PHASE_OWNERS",
    "TRIVIAL_PHASE_OWNERS",
    "WORKFLOW_PHASES",
    "get_phase_owner",
    "get_workflow_state",
]
