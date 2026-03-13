"""Data models for the demo artifact generator pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SignalBundle:
    """All signals collected from a completed story."""

    story_id: str
    title: str
    jira_key: str | None
    points: int | None
    acceptance_criteria: list[str]
    pr_diff: str
    commit_messages: list[str]
    session_fields: dict[str, str]
    review_findings: str | None
    file_extensions: set[str] = field(default_factory=set)
