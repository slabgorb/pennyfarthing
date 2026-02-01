"""Tiered context injection for Prime.

Implements four context tiers based on session state:
- FULL (~4000 tokens): First turn of new session
- REFRESH (~600 tokens): Resumed session, same agent
- HANDOFF (~700 tokens): Resumed session, different agent
- MINIMAL (~200 tokens): Deep conversation (turn 3+), same agent

Story: MSSCI-12797 - Python Prime Tier Support
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any

from pennyfarthing_scripts.prime.loader import (
    load_agent_definition,
    load_behavior_guide,
    load_session_context,
    load_sidecars,
    load_sprint_context,
)
from pennyfarthing_scripts.prime.persona import (
    format_persona_compressed,
    get_crew_manifest,
    get_user_title,
    is_character_voice_enabled,
    load_persona,
)
from pennyfarthing_scripts.prime.workflow import detect_workflow_state


class ContextTier(Enum):
    """Context tier levels for session-aware injection."""

    FULL = "FULL"
    REFRESH = "REFRESH"
    HANDOFF = "HANDOFF"
    MINIMAL = "MINIMAL"


def tier_from_string(value: str) -> ContextTier:
    """Convert string to ContextTier enum.

    Args:
        value: Tier name (case-insensitive)

    Returns:
        ContextTier enum value

    Raises:
        ValueError: If value is not a valid tier name
    """
    normalized = value.upper()
    try:
        return ContextTier(normalized)
    except ValueError:
        valid = ", ".join(t.value for t in ContextTier)
        raise ValueError(f"Invalid tier '{value}'. Must be one of: {valid}")


def load_tier_components(
    tier: ContextTier,
    agent_name: str,
    project_root: Path,
) -> dict[str, Any]:
    """Load components for the specified tier.

    Component sets by tier:
    - FULL: All components (workflow, agent, persona, guide, sprint, session, sidecars)
    - REFRESH: Dynamic state only (workflow, sprint, session_header)
    - HANDOFF: Agent essentials (workflow, agent, persona_compressed)
    - MINIMAL: Routing only (workflow)

    Args:
        tier: Context tier level
        agent_name: Name of the agent to load context for
        project_root: Project root path

    Returns:
        Dict mapping component name to content
    """
    components: dict[str, Any] = {}

    # All tiers include workflow state
    workflow_status = detect_workflow_state(project_root)
    components["workflow_state"] = workflow_status

    if tier == ContextTier.MINIMAL:
        # MINIMAL: Just workflow state
        return components

    if tier == ContextTier.REFRESH:
        # REFRESH: Dynamic state only
        sprint_content = load_sprint_context(project_root)
        if sprint_content:
            components["sprint_context"] = sprint_content

        session_result = load_session_context(project_root)
        if session_result:
            filename, header, _ = session_result
            components["session_header"] = header

        return components

    if tier == ContextTier.HANDOFF:
        # HANDOFF: Agent essentials for new agent
        agent_content = load_agent_definition(agent_name, project_root)
        if agent_content:
            components["agent_definition"] = agent_content

        # Load compressed persona
        if is_character_voice_enabled(project_root):
            persona, theme = load_persona(agent_name, project_root)
            if persona and theme:
                compressed = format_persona_compressed(persona, theme, agent_name)
                components["persona_compressed"] = compressed

        return components

    # FULL tier: Everything
    agent_content = load_agent_definition(agent_name, project_root)
    if agent_content:
        components["agent_definition"] = agent_content

    if is_character_voice_enabled(project_root):
        persona, theme = load_persona(agent_name, project_root)
        if persona and theme:
            from pennyfarthing_scripts.prime.persona import format_persona_output

            crew = get_crew_manifest(project_root)
            user_title = get_user_title(project_root)
            components["persona"] = format_persona_output(
                persona, theme, agent_name, crew, user_title
            )

    guide_content = load_behavior_guide(project_root)
    if guide_content:
        components["behavior_guide"] = guide_content

    sprint_content = load_sprint_context(project_root)
    if sprint_content:
        components["sprint_context"] = sprint_content

    session_result = load_session_context(project_root)
    if session_result:
        filename, header, assessment = session_result
        components["session_header"] = header
        if assessment:
            components["session_assessment"] = assessment

    sidecars = load_sidecars(agent_name, project_root)
    if sidecars:
        components["sidecars"] = sidecars

    return components
