"""Event parsing for pipeline replay benchmark traces.

Pure functions for parsing OTEL JSONL captured during pipeline runs.
No subprocess calls, no Click. Must be importable independently.

Usage:
    from pf.benchmark.events import parse_phase_events, correlate_finding

    events = parse_phase_events(Path("dev-otel.jsonl"))
    correlation = correlate_finding(events, finding_files, worktree_prefix)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ToolCall:
    """A single tool invocation extracted from OTEL events."""

    tool_name: str
    sequence: int
    success: bool
    duration_ms: int
    parameters: dict = field(default_factory=dict)
    enrichments: dict = field(default_factory=dict)


@dataclass
class PhaseEvents:
    """Parsed events from a single phase's OTEL JSONL file."""

    text_blocks: list[str] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)
    files_read: list[str] = field(default_factory=list)
    files_written: list[str] = field(default_factory=list)
    subagents: list[str] = field(default_factory=list)


@dataclass
class FindingCorrelation:
    """Correlation between a finding and agent trace evidence."""

    finding_files: list[str]
    files_read_matching: list[str] = field(default_factory=list)
    files_grepped_matching: list[str] = field(default_factory=list)
    engagement: str = "none"  # "high", "low", "none"


def parse_phase_events(path: Path) -> PhaseEvents:
    """Parse a phase's OTEL JSONL file into structured events.

    Args:
        path: Path to a {phase}-otel.jsonl file.

    Returns:
        PhaseEvents with text_blocks, tool_calls, files_read,
        files_written, and subagents extracted.
    """
    raise NotImplementedError("parse_phase_events not yet implemented")


def normalize_path(absolute_path: str, worktree_prefix: str) -> str:
    """Strip worktree prefix from an absolute path to get repo-relative path.

    Args:
        absolute_path: Absolute file path from OTEL event.
        worktree_prefix: Worktree root path from pipeline.yaml.

    Returns:
        Repo-relative path string.
    """
    raise NotImplementedError("normalize_path not yet implemented")


def correlate_finding(
    events: PhaseEvents,
    finding_files: list[str],
    worktree_prefix: str,
) -> FindingCorrelation:
    """Correlate a finding's files with agent trace evidence.

    Determines engagement confidence:
    - High: Agent Read the file AND reasoning mentions the issue
    - Low: Agent Grep/Glob touched the file
    - None: No evidence the agent saw the relevant files

    Args:
        events: Parsed phase events.
        finding_files: Repo-relative file paths from scenario YAML.
        worktree_prefix: Worktree root for path normalization.

    Returns:
        FindingCorrelation with engagement level.
    """
    raise NotImplementedError("correlate_finding not yet implemented")
