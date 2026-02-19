"""
Git utilities for Pennyfarthing.

Story: MSSCI-12402 - Port git utility scripts to Python

This package provides async git operations for multi-repo management:
- repos: Repository configuration from repos.yaml
- status_all: Check git status across all repos in parallel
- create_branches: Create feature branches across repos in parallel
- worktree: Git worktree management for parallel development
- hooks_installer: Git hooks installation with .d/ dispatcher pattern
"""

from pf.git.create_branches import (
    BranchResult,
    create_feature_branches,
)
from pf.git.repos import (
    RepoConfig,
    get_repo_paths,
    load_repos_config,
)
from pf.git.status_all import (
    RepoStatus,
    format_status_brief,
    format_status_full,
    get_all_repo_status,
)

__all__ = [
    "RepoConfig",
    "RepoStatus",
    "BranchResult",
    "get_all_repo_status",
    "format_status_brief",
    "format_status_full",
    "create_feature_branches",
    "load_repos_config",
    "get_repo_paths",
]
