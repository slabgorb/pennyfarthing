"""
Hotspot detection for git repositories.

Analyzes git history to identify files and directories with high change frequency,
bug fix concentration, and multi-author churn — indicators of code hotspots that
may benefit from refactoring attention.
"""

from pf.hotspots.analyze import (
    analyze_all_repos,
    analyze_repo,
    calculate_hotspot_score,
    is_bug_fix_commit,
)
from pf.hotspots.models import (
    DirectoryHotspot,
    FileHotspot,
    HotspotResult,
    MultiRepoHotspotResult,
)

__all__ = [
    "DirectoryHotspot",
    "FileHotspot",
    "HotspotResult",
    "MultiRepoHotspotResult",
    "analyze_repo",
    "analyze_all_repos",
    "calculate_hotspot_score",
    "is_bug_fix_commit",
]
