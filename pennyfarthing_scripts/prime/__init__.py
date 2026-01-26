"""
Prime - Load essential project context at agent activation.

This module provides context loading for Pennyfarthing agents, with
priority-based ordering optimized for attention (most important first).

Usage:
    python -m pennyfarthing_scripts.prime [--agent <name>] [--minimal] [--full] [--quiet]

Public API:
    prime() - Load and print context (main entry point)
    load_agent_definition() - Load agent markdown
    load_behavior_guide() - Load shared behavior guide
    load_sprint_context() - Load sprint summary
    load_session_context() - Load active session header and assessment
    load_sidecars() - Load agent-specific patterns, gotchas, decisions
    load_domain_docs() - Load domain documentation (--full only)
"""

from pennyfarthing_scripts.prime.loader import (
    load_agent_definition,
    load_behavior_guide,
    load_domain_docs,
    load_session_context,
    load_sidecars,
    load_sprint_context,
)
from pennyfarthing_scripts.prime.cli import prime

__all__ = [
    "prime",
    "load_agent_definition",
    "load_behavior_guide",
    "load_sprint_context",
    "load_session_context",
    "load_sidecars",
    "load_domain_docs",
]
