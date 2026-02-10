"""
Git utilities for Pennyfarthing.

Story: MSSCI-12402 - Port git utility scripts to Python

This package provides async git operations for multi-repo management:
- status_all: Check git status across all repos in parallel
- create_branches: Create feature branches across repos in parallel
"""

from pennyfarthing_scripts.git.create_branches import (
    BranchResult,
    create_feature_branches,
)
from pennyfarthing_scripts.git.status_all import (
    RepoStatus,
    format_status_brief,
    format_status_full,
    get_all_repo_status,
)

__all__ = [
    "RepoStatus",
    "get_all_repo_status",
    "format_status_brief",
    "format_status_full",
    "BranchResult",
    "create_feature_branches",
]
