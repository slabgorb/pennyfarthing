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


def estimate_tokens(text: str) -> int:
    """Estimate token count for a text string.

    Uses character-based approximation (~4 characters per token) which is
    reasonably accurate for English text with mixed code/prose content.

    Args:
        text: Text to estimate tokens for

    Returns:
        Estimated token count (0 for empty string)
    """
    if not text:
        return 0
    # Approximate: ~4 characters per token for cl100k_base encoding
    # This is within 10% for typical agent context content
    return max(1, len(text) // 4)


from pf.prime.loader import (  # noqa: E402
    load_agent_definition,
    load_behavior_guide,
    load_output_style,
    load_repos_topology,
    load_soul,
    load_session_context,
    load_sidecars,
    load_sprint_context,
    load_step_content,
)
from pf.prime.models import WorkflowState  # noqa: E402
from pf.prime.persona import (  # noqa: E402
    format_persona_compressed,
    get_crew_manifest,
    get_user_title,
    is_character_voice_enabled,
    load_persona,
)
from pf.prime.workflow import detect_workflow_state  # noqa: E402


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
        raise ValueError(f"Invalid tier '{value}'. Must be one of: {valid}") from None


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
        Dict with:
        - Component name -> content mappings
        - "token_counts": Dict mapping component name to estimated token count
        - "total_tokens": Sum of all component token counts
    """
    components: dict[str, Any] = {}
    token_counts: dict[str, int] = {}

    def add_component(name: str, content: str | Any) -> None:
        """Add a component and track its token count."""
        components[name] = content
        # Estimate tokens for string content, 0 for structured data
        if isinstance(content, str):
            token_counts[name] = estimate_tokens(content)
        else:
            # For structured data (like WorkflowStatus), estimate from string repr
            token_counts[name] = estimate_tokens(str(content))

    # All tiers include workflow state
    workflow_status = detect_workflow_state(project_root)
    add_component("workflow_state", workflow_status)

    # Load step content for stepped workflows (FULL and REFRESH tiers)
    if (
        workflow_status.state == WorkflowState.STEPPED_IN_PROGRESS_STATE
        and workflow_status.current_step
        and workflow_status.workflow
        and tier in (ContextTier.FULL, ContextTier.REFRESH)
    ):
        step_text = load_step_content(
            workflow_name=workflow_status.workflow,
            current_step=workflow_status.current_step,
            project_root=project_root,
        )
        if step_text:
            add_component("step_content", step_text)

    if tier == ContextTier.MINIMAL:
        # MINIMAL: Just workflow state
        components["token_counts"] = token_counts
        components["total_tokens"] = sum(token_counts.values())
        return components

    if tier == ContextTier.REFRESH:
        # REFRESH: Dynamic state only
        sprint_content = load_sprint_context(project_root)
        if sprint_content:
            add_component("sprint_context", sprint_content)

        topology_content = load_repos_topology(project_root)
        if topology_content:
            add_component("repos_topology", topology_content)

        session_result = load_session_context(project_root)
        if session_result:
            filename, header, _ = session_result
            add_component("session_header", header)

        components["token_counts"] = token_counts
        components["total_tokens"] = sum(token_counts.values())
        return components

    if tier == ContextTier.HANDOFF:
        # HANDOFF: Agent essentials for new agent
        agent_content = load_agent_definition(agent_name, project_root)
        if agent_content:
            add_component("agent_definition", agent_content)

        # Load compressed persona
        if is_character_voice_enabled(project_root):
            persona, theme = load_persona(agent_name, project_root)
            if persona and theme:
                compressed = format_persona_compressed(persona, theme, agent_name)
                add_component("persona_compressed", compressed)

        topology_content = load_repos_topology(project_root)
        if topology_content:
            add_component("repos_topology", topology_content)

        components["token_counts"] = token_counts
        components["total_tokens"] = sum(token_counts.values())
        return components

    # FULL tier: Everything
    agent_content = load_agent_definition(agent_name, project_root)
    if agent_content:
        add_component("agent_definition", agent_content)

    soul_content = load_soul(project_root)
    if soul_content:
        add_component("soul", soul_content)

    style_result = load_output_style(project_root)
    if style_result:
        _, style_content = style_result
        add_component("output_style", style_content)

    if is_character_voice_enabled(project_root):
        persona, theme = load_persona(agent_name, project_root)
        if persona and theme:
            from pf.prime.persona import format_persona_output

            crew = get_crew_manifest(project_root)
            user_title = get_user_title(project_root)
            persona_content = format_persona_output(
                persona, theme, agent_name, crew, user_title
            )
            add_component("persona", persona_content)

    guide_content = load_behavior_guide(project_root)
    if guide_content:
        add_component("behavior_guide", guide_content)

    sprint_content = load_sprint_context(project_root)
    if sprint_content:
        add_component("sprint_context", sprint_content)

    topology_content = load_repos_topology(project_root)
    if topology_content:
        add_component("repos_topology", topology_content)

    session_result = load_session_context(project_root)
    if session_result:
        filename, header, assessment = session_result
        add_component("session_header", header)
        if assessment:
            add_component("session_assessment", assessment)

    sidecars = load_sidecars(agent_name, project_root)
    if sidecars:
        add_component("sidecars", sidecars)

    components["token_counts"] = token_counts
    components["total_tokens"] = sum(token_counts.values())
    return components
