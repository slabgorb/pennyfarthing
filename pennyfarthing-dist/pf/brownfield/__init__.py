"""
Brownfield discovery module for Pennyfarthing.

Analyzes existing codebases and generates AI-ready documentation.
"""

from pf.brownfield.discover import (
    DepthLevel,
    DiscoveryResult,
    ProjectType,
    detect_architecture_patterns,
    detect_project_type,
    detect_tech_stack,
    discover,
    generate_ai_guidance_doc,
    generate_project_overview,
    generate_source_tree_doc,
    generate_tech_stack_doc,
    scan_directory_structure,
)

__all__ = [
    "DepthLevel",
    "ProjectType",
    "DiscoveryResult",
    "detect_project_type",
    "detect_tech_stack",
    "scan_directory_structure",
    "detect_architecture_patterns",
    "generate_project_overview",
    "generate_tech_stack_doc",
    "generate_source_tree_doc",
    "generate_ai_guidance_doc",
    "discover",
]
