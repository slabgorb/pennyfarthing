"""
Data models for Prime v2.

Provides structured types for workflow state, persona, and session data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class WorkflowState(Enum):
    """Workflow states detected by prime."""

    FINISH_STATE = "FINISH_STATE"
    IN_PROGRESS_STATE = "IN_PROGRESS_STATE"
    NEW_WORK_STATE = "NEW_WORK_STATE"
    EMPTY_BACKLOG_STATE = "EMPTY_BACKLOG_STATE"


@dataclass
class WorkflowStatus:
    """Result of workflow state detection.

    Attributes:
        state: Current workflow state
        story_id: Active story ID if in progress/finish
        phase: Current workflow phase (setup, red, green, review, finish)
        phase_owner: Agent that owns the current phase
        workflow: Workflow name (tdd, trivial, bdd, etc.)
        backlog_count: Number of stories in backlog (for NEW_WORK_STATE)
        session_file: Path to active session file if exists
    """

    state: WorkflowState
    story_id: str | None = None
    phase: str | None = None
    phase_owner: str | None = None
    workflow: str | None = None
    backlog_count: int = 0
    session_file: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "state": self.state.value,
            "story_id": self.story_id,
            "phase": self.phase,
            "phase_owner": self.phase_owner,
            "workflow": self.workflow,
            "backlog_count": self.backlog_count,
            "session_file": self.session_file,
        }


@dataclass
class Persona:
    """Agent persona from theme configuration.

    Attributes:
        character: Character name (e.g., "Camina Drummer")
        style: Communication style description
        role: Role description
        quote: Optional signature quote
        trait: Optional personality trait
        quirk: Optional personality quirk
        motto: Optional character motto
        helper_name: Optional helper/assistant name
        helper_style: Optional helper communication style
    """

    character: str
    style: str
    role: str
    quote: str | None = None
    trait: str | None = None
    quirk: str | None = None
    motto: str | None = None
    helper_name: str | None = None
    helper_style: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "character": self.character,
            "style": self.style,
            "role": self.role,
        }
        if self.quote:
            result["quote"] = self.quote
        if self.trait:
            result["trait"] = self.trait
        if self.quirk:
            result["quirk"] = self.quirk
        if self.motto:
            result["motto"] = self.motto
        if self.helper_name:
            result["helper_name"] = self.helper_name
        if self.helper_style:
            result["helper_style"] = self.helper_style
        return result


@dataclass
class CrewMember:
    """A crew member in the theme manifest.

    Attributes:
        role: Agent role (sm, tea, dev, etc.)
        character: Character name
    """

    role: str
    character: str


@dataclass
class SessionInfo:
    """Session registration information.

    Attributes:
        session_id: Unique session identifier
        agent_name: Name of the registered agent
        file_path: Path to the session file
    """

    session_id: str
    agent_name: str
    file_path: str


@dataclass
class PrimeComponent:
    """A loaded context component with metadata.

    Attributes:
        name: Component identifier (e.g., "agent_definition", "persona")
        tokens: Estimated token count
        source: Relative path to source file, if applicable
    """

    name: str
    tokens: int
    source: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        d: dict[str, Any] = {"name": self.name, "tokens": self.tokens}
        if self.source:
            d["source"] = self.source
        return d


@dataclass
class PrimeResult:
    """Complete result from prime() for JSON output.

    Attributes:
        agent_name: Requested agent name
        workflow_status: Current workflow state
        persona: Loaded persona (if enabled)
        theme: Active theme name
        redirect_to: Agent to redirect to (if wrong agent activated)
        redirect_reason: Reason for redirect
        session_id: Session ID (if registered)
        crew: List of crew members for handoff reference
        tier: Context tier used (FULL, REFRESH, HANDOFF, MINIMAL)
        token_counts: Per-component token estimates
        total_tokens: Sum of all component token counts
        context: Assembled context text for system prompt injection
        components: Per-component metadata with source paths
    """

    agent_name: str
    workflow_status: WorkflowStatus | None = None
    persona: Persona | None = None
    theme: str | None = None
    redirect_to: str | None = None
    redirect_reason: str | None = None
    session_id: str | None = None
    crew: list[CrewMember] = field(default_factory=list)
    tier: str | None = None
    token_counts: dict[str, int] = field(default_factory=dict)
    total_tokens: int = 0
    context: str | None = None
    components: list[PrimeComponent] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "agent_name": self.agent_name,
            "workflow_status": self.workflow_status.to_dict() if self.workflow_status else None,
            "persona": self.persona.to_dict() if self.persona else None,
            "theme": self.theme,
            "redirect_to": self.redirect_to,
            "redirect_reason": self.redirect_reason,
            "session_id": self.session_id,
            "crew": [{"role": c.role, "character": c.character} for c in self.crew],
            "tier": self.tier,
            "token_counts": self.token_counts,
            "total_tokens": self.total_tokens,
            "context": self.context,
            "components": [c.to_dict() for c in self.components],
        }
