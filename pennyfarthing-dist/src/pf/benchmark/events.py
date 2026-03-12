"""Event parsing and summary generation for pipeline replay benchmarks.

Parses OTEL JSONL files captured during pipeline runs and generates
structured summaries (tool counts, files touched) at write time
inside save_result().
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any


def _parse_phase_otel(otel_path: Path) -> dict[str, Any]:
    """Parse a single phase OTEL JSONL file into a phase summary.

    Returns a dict with has_events, tool_counts, and files_touched.
    """
    tool_counts: Counter[str] = Counter()
    files_touched: set[str] = set()
    found_any = False

    for line in otel_path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue

        if record.get("signal") != "logs":
            continue

        for rl in record.get("data", {}).get("resourceLogs", []):
            for sl in rl.get("scopeLogs", []):
                for lr in sl.get("logRecords", []):
                    body = lr.get("body", {}).get("stringValue", "")
                    attrs = {
                        a["key"]: a.get("value", {}).get(
                            "stringValue", a.get("value", {}).get("intValue", "")
                        )
                        for a in lr.get("attributes", [])
                    }

                    if body == "claude_code.tool_decision":
                        tool_name = attrs.get("tool_name", "")
                        if tool_name:
                            tool_counts[tool_name] += 1
                            found_any = True

                    elif body == "claude_code.tool_result":
                        file_path = attrs.get("file_path", "")
                        if file_path:
                            files_touched.add(file_path)
                        found_any = True

    if not found_any:
        return _empty_phase_summary()

    return {
        "has_events": True,
        "tool_counts": dict(tool_counts),
        "files_touched": sorted(files_touched),
    }


def _empty_phase_summary() -> dict[str, Any]:
    """Return a fallback summary for phases with no OTEL data."""
    return {
        "has_events": False,
        "tool_counts": {},
        "files_touched": [],
    }


def generate_events_summary(run_dir: Path, phases: list[str]) -> dict[str, Any]:
    """Generate a structured summary from OTEL event files in a run directory.

    For each phase, parses ``{phase}-otel.jsonl`` and produces:
    - tool_counts: Counter of tool names used
    - files_touched: list of unique file paths from tool_result events

    If no OTEL file exists for a phase, returns a fallback with
    ``has_events: false`` and zero counts.

    Args:
        run_dir: Path to the run directory containing OTEL JSONL files.
        phases: List of phase names (e.g. ["tea", "dev", "reviewer"]).

    Returns:
        Dict with per-phase summaries and top-level ``has_events`` flag.
    """
    phase_summaries: dict[str, dict[str, Any]] = {}
    any_events = False

    for phase in phases:
        otel_path = run_dir / f"{phase}-otel.jsonl"
        if otel_path.exists() and otel_path.stat().st_size > 0:
            summary = _parse_phase_otel(otel_path)
        else:
            summary = _empty_phase_summary()

        phase_summaries[phase] = summary
        if summary["has_events"]:
            any_events = True

    return {
        "has_events": any_events,
        "phases": phase_summaries,
    }
