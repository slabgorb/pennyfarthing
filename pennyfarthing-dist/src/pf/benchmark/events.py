"""Event parsing for pipeline replay benchmark traces.

Pure functions for parsing OTEL JSONL captured during pipeline runs.
No subprocess calls, no Click. Must be importable independently.

Usage:
    from pf.benchmark.events import parse_phase_events, correlate_finding

    events = parse_phase_events(Path("dev-otel.jsonl"))
    correlation = correlate_finding(events, finding_files, worktree_prefix)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


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


def _extract_attrs(log_record: dict) -> dict[str, Any]:
    """Extract key-value attributes from an OTLP logRecord."""
    attrs: dict[str, Any] = {}
    for attr in log_record.get("attributes", []):
        key = attr.get("key", "")
        val = attr.get("value", {})
        attrs[key] = val.get("stringValue", val.get("intValue", ""))
    return attrs


def _find_enrichment(enrichments: list[dict], tool_name: str) -> dict:
    """Find the enrichment dict matching a tool name, or empty dict."""
    for e in enrichments:
        if e.get("tool_name") == tool_name:
            return e
    return {}


def parse_phase_events(path: Path) -> PhaseEvents:
    """Parse a phase's OTEL JSONL file into structured events.

    Args:
        path: Path to a {phase}-otel.jsonl file.

    Returns:
        PhaseEvents with text_blocks, tool_calls, files_read,
        files_written, and subagents extracted.
    """
    result = PhaseEvents()

    if not path.exists():
        return result

    try:
        text = path.read_text()
    except OSError:
        return result

    if not text.strip():
        return result

    files_read_seen: set[str] = set()
    files_written_seen: set[str] = set()

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue

        if record.get("signal") != "logs":
            continue

        enrichments = record.get("enrichments", [])

        for rl in record.get("data", {}).get("resourceLogs", []):
            for sl in rl.get("scopeLogs", []):
                for lr in sl.get("logRecords", []):
                    body = lr.get("body", {})
                    event_name = body.get("stringValue", "")
                    attrs = _extract_attrs(lr)

                    if event_name == "claude_code.tool_result":
                        tool_name = attrs.get("tool_name", "")
                        success_str = attrs.get("success", "true")
                        success = success_str == "true"
                        duration = int(attrs.get("duration_ms", 0))
                        sequence = int(attrs.get("event.sequence", 0))

                        params_raw = attrs.get("tool_parameters", "")
                        try:
                            params = json.loads(params_raw) if params_raw else {}
                        except (json.JSONDecodeError, TypeError):
                            params = {}

                        enrich = _find_enrichment(enrichments, tool_name)

                        tc = ToolCall(
                            tool_name=tool_name,
                            sequence=sequence,
                            success=success,
                            duration_ms=duration,
                            parameters=params,
                            enrichments=enrich,
                        )
                        result.tool_calls.append(tc)

                        # Track files_read
                        if tool_name == "Read":
                            fp = params.get("file_path", "")
                            if fp and fp not in files_read_seen:
                                files_read_seen.add(fp)
                                result.files_read.append(fp)

                        # Track files_written
                        if tool_name in ("Write", "Edit"):
                            fp = params.get("file_path", "")
                            if fp and fp not in files_written_seen:
                                files_written_seen.add(fp)
                                result.files_written.append(fp)

                        # Track subagents
                        if tool_name == "Agent":
                            desc = params.get("description", "")
                            result.subagents.append(desc)

                    elif event_name == "claude_code.api_request":
                        model = attrs.get("model", "")
                        output_tokens = attrs.get("output_tokens", 0)
                        result.text_blocks.append(
                            f"api_request model={model} output_tokens={output_tokens}"
                        )

    # Sort tool_calls by sequence
    result.tool_calls.sort(key=lambda tc: tc.sequence)

    return result


def normalize_path(absolute_path: str, worktree_prefix: str) -> str:
    """Strip worktree prefix from an absolute path to get repo-relative path.

    Args:
        absolute_path: Absolute file path from OTEL event.
        worktree_prefix: Worktree root path from pipeline.yaml.

    Returns:
        Repo-relative path string.
    """
    if not worktree_prefix:
        return absolute_path

    # Ensure prefix ends with / for proper directory boundary matching
    prefix = worktree_prefix.rstrip("/") + "/"

    if absolute_path.startswith(prefix):
        return absolute_path[len(prefix):]

    return absolute_path


def correlate_finding(
    events: PhaseEvents,
    finding_files: list[str],
    worktree_prefix: str,
) -> FindingCorrelation:
    """Correlate a finding's files with agent trace evidence.

    Determines engagement confidence:
    - High: Agent Read the file
    - Low: Agent Grep/Glob touched the file's directory
    - None: No evidence the agent saw the relevant files

    Args:
        events: Parsed phase events.
        finding_files: Repo-relative file paths from scenario YAML.
        worktree_prefix: Worktree root for path normalization.

    Returns:
        FindingCorrelation with engagement level.
    """
    # Normalize all files_read to repo-relative
    normalized_reads = [normalize_path(f, worktree_prefix) for f in events.files_read]

    # Collect grep/glob paths (normalized)
    grep_glob_paths: list[str] = []
    for tc in events.tool_calls:
        if tc.tool_name in ("Grep", "Glob"):
            # Grep has a 'path' parameter, Glob has 'pattern'
            path = tc.parameters.get("path", "")
            if path:
                grep_glob_paths.append(normalize_path(path, worktree_prefix))

    files_read_matching = []
    files_grepped_matching = []

    for ff in finding_files:
        # Check if file was directly Read
        if ff in normalized_reads:
            files_read_matching.append(ff)

        # Check if file's directory was Grepped/Globbed
        for gp in grep_glob_paths:
            # gp is a directory path — check if finding file is under it
            gp_clean = gp.rstrip("/")
            if ff.startswith(gp_clean + "/") or ff.startswith(gp_clean):
                if ff not in files_grepped_matching:
                    files_grepped_matching.append(ff)

    # Determine engagement level
    if files_read_matching:
        engagement = "high"
    elif files_grepped_matching:
        engagement = "low"
    else:
        engagement = "none"

    return FindingCorrelation(
        finding_files=finding_files,
        files_read_matching=files_read_matching,
        files_grepped_matching=files_grepped_matching,
        engagement=engagement,
    )
