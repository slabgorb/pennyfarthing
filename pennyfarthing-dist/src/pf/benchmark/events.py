"""Event parsing and summary generation for pipeline replay benchmarks.

Parses OTEL JSONL files captured during pipeline runs and generates
structured summaries (tool counts, files touched, reasoning word count)
at write time inside save_result().
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def generate_events_summary(run_dir: Path, phases: list[str]) -> dict[str, Any]:
    """Generate a structured summary from OTEL event files in a run directory.

    For each phase, parses ``{phase}-otel.jsonl`` and produces:
    - tool_counts: Counter of tool names used
    - files_touched: list of unique file paths from tool_result events
    - reasoning_word_count: approximate word count from assistant text

    If no OTEL file exists for a phase, returns a fallback with
    ``has_events: false`` and zero counts.

    Args:
        run_dir: Path to the run directory containing OTEL JSONL files.
        phases: List of phase names (e.g. ["tea", "dev", "reviewer"]).

    Returns:
        Dict with per-phase summaries and top-level ``has_events`` flag.
    """
    raise NotImplementedError("generate_events_summary not yet implemented")
