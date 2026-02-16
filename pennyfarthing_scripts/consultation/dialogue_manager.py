"""Dialogue file management for tandem agent consultation.

Persistence layer for consultation exchanges between tandem agents.
Port of packages/core/src/consultation/dialogue-manager.ts to Python.

All pure functions use the same markdown format defined in ADR-0012.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

Outcome = Literal["applied", "deferred", "rejected"]


@dataclass
class DialogueHeader:
    story_id: str
    workflow: str
    leader: str
    partner: str
    leader_character: str | None = None
    partner_character: str | None = None
    started_at: str = ""


@dataclass
class DialogueExchange:
    number: int
    timestamp: str  # HH:MM
    leader: str
    partner: str
    question: str
    recommendation: str
    confidence: str
    outcome: Outcome | None = None
    outcome_note: str | None = None


@dataclass
class DialogueResult:
    success: bool
    data: dict | None = None
    error: str | None = None


# =============================================================================
# Pure Functions — STUBS (not implemented)
# =============================================================================


def create_dialogue_content(header: DialogueHeader) -> str:
    """Create initial dialogue file content with header and empty summary."""
    return ""


def format_exchange(exchange: DialogueExchange) -> str:
    """Format a single exchange as markdown block."""
    return ""


def parse_dialogue_exchanges(content: str) -> list[DialogueExchange]:
    """Parse exchanges from dialogue file content."""
    return []


def generate_summary(exchanges: list[DialogueExchange], started_at: str) -> str:
    """Generate summary markdown section from exchanges."""
    return ""


# =============================================================================
# File Operations — STUBS (not implemented)
# =============================================================================


def append_exchange_to_file(
    dialogue_path: Path,
    exchange: DialogueExchange,
    header: DialogueHeader | None = None,
) -> DialogueResult:
    """Append an exchange to a dialogue file. Creates the file if missing."""
    return DialogueResult(success=False, error="Not implemented")


def update_outcome_in_file(
    dialogue_path: Path,
    exchange_num: int,
    outcome: Outcome,
    note: str | None = None,
) -> DialogueResult:
    """Update the outcome of a specific exchange in the dialogue file."""
    return DialogueResult(success=False, error="Not implemented")


def refresh_summary(dialogue_path: Path) -> DialogueResult:
    """Regenerate the summary section in an existing dialogue file."""
    return DialogueResult(success=False, error="Not implemented")


def archive_dialogue(
    dialogue_path: Path,
    archive_dir: Path,
    jira_key: str | None = None,
    story_id: str | None = None,
) -> DialogueResult:
    """Copy dialogue file to archive directory."""
    return DialogueResult(success=False, error="Not implemented")
