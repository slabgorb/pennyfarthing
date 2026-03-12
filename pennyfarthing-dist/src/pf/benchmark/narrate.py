"""LLM-narrated trace for pipeline replay runs.

Generates a natural-language narrative answering "what did the agent do,
what did it miss, and why?" by sending event data to an LLM.

Story 142-9.
"""

from __future__ import annotations

from pathlib import Path


def build_narrate_prompt(
    run_dir: Path,
    phases: list[str],
    title: str,
    *,
    finding_id: str | None = None,
    ground_truth: list[dict] | None = None,
) -> str:
    """Build the LLM prompt from OTEL events in a run directory.

    Args:
        run_dir: Path to the run directory containing OTEL JSONL files.
        phases: List of phase names (e.g. ["tea", "dev", "reviewer"]).
        title: Scenario title for context.
        finding_id: Optional finding ID to filter narrative scope.
        ground_truth: Optional list of finding dicts for context.

    Returns:
        The prompt string to send to the LLM.
    """
    return ""


def truncate_events_to_budget(text: str, max_tokens: int = 50_000) -> str:
    """Truncate event text to fit within a token budget.

    Prioritizes reasoning content over tool results.

    Args:
        text: Raw event text to truncate.
        max_tokens: Approximate token budget (1 token ~ 4 chars).

    Returns:
        Truncated text within the budget.
    """
    return ""


def generate_narrative(
    run_dir: Path,
    scenario_id: str,
    phases: list[str],
    title: str,
    *,
    model: str | None = None,
    finding_id: str | None = None,
    force: bool = False,
    project_dir: Path | None = None,
    ground_truth: list[dict] | None = None,
) -> Path:
    """Generate a narrative markdown file from a pipeline run.

    Args:
        run_dir: Path to the run directory.
        scenario_id: Scenario identifier.
        phases: Phase names for the scenario.
        title: Scenario title.
        model: Claude model to use (default: claude-sonnet-4-6).
        finding_id: Optional finding ID to focus narrative on.
        force: If True, regenerate even if cached narrative exists.
        project_dir: Project directory for claude CLI context.
        ground_truth: Optional findings for context.

    Returns:
        Path to the generated narrative.md file.
    """
    raise NotImplementedError("Story 142-9: generate_narrative not yet implemented")
