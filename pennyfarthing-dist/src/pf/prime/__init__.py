"""
Prime - Unified agent bootstrap for Pennyfarthing.

This module provides context loading and state detection for Pennyfarthing agents,
consolidating agent-session.sh, prime.sh, and workflow-status-check into a single
Python entry point.

Usage:
    python -m pf.prime [--agent <name>] [--json] [--minimal] [--full]

Public API:
    prime() - Load and print context (main entry point)

    Context Loaders:
        load_agent_definition() - Load agent markdown
        load_behavior_guide() - Load shared behavior guide
        load_sprint_context() - Load sprint summary
        load_session_context() - Load active session header and assessment
        load_sidecars() - Load agent-specific patterns, gotchas, decisions
        load_domain_docs() - Load domain documentation (--full only)

    Workflow Detection:
        detect_workflow_state() - Detect FINISH/IN_PROGRESS/NEW_WORK/EMPTY_BACKLOG state
        check_redirect() - Check if agent should redirect to another

    Persona Loading:
        load_persona() - Load agent persona from theme
        get_crew_manifest() - Get all agent characters for handoff reference
        format_persona_output() - Format persona as XML for Claude
        is_character_voice_enabled() - Check if character voice is enabled

    Session Management:
        register_session() - Register agent session
        cleanup_old_sessions() - Remove stale sessions
        get_session_agent() - Get agent name for session
        unregister_session() - Remove session

    Models:
        WorkflowState - Enum of workflow states
        WorkflowStatus - Workflow detection result
        Persona - Agent persona data
        PrimeResult - Complete prime result for JSON output
"""

from pf.prime.cli import prime
from pf.prime.loader import (
    load_agent_definition,
    load_behavior_guide,
    load_domain_docs,
    load_repos_topology,
    load_session_context,
    load_sidecars,
    load_sprint_context,
)
from pf.prime.models import (
    CrewMember,
    Persona,
    PrimeResult,
    SessionInfo,
    WorkflowState,
    WorkflowStatus,
)
from pf.prime.persona import (
    format_persona_output,
    get_crew_manifest,
    get_current_theme,
    get_user_title,
    is_character_voice_enabled,
    load_persona,
    load_theme,
)
from pf.prime.session import (
    cleanup_old_sessions,
    get_session_agent,
    list_sessions,
    register_session,
    unregister_session,
)
from pf.prime.workflow import (
    check_redirect,
    detect_workflow_state,
    find_active_session,
    get_backlog_count,
    get_phase_owner,
    parse_session_header,
)

__all__ = [
    # Main entry point
    "prime",
    # Context loaders
    "load_agent_definition",
    "load_behavior_guide",
    "load_sprint_context",
    "load_session_context",
    "load_sidecars",
    "load_domain_docs",
    "load_repos_topology",
    # Workflow detection
    "detect_workflow_state",
    "check_redirect",
    "find_active_session",
    "parse_session_header",
    "get_phase_owner",
    "get_backlog_count",
    # Persona loading
    "load_persona",
    "load_theme",
    "get_current_theme",
    "get_crew_manifest",
    "get_user_title",
    "format_persona_output",
    "is_character_voice_enabled",
    # Session management
    "register_session",
    "cleanup_old_sessions",
    "get_session_agent",
    "unregister_session",
    "list_sessions",
    # Models
    "WorkflowState",
    "WorkflowStatus",
    "Persona",
    "PrimeResult",
    "CrewMember",
    "SessionInfo",
]
