"""LLM-narrated trace for pipeline replay runs.

Generates a natural-language narrative answering "what did the agent do,
what did it miss, and why?" by sending event data to an LLM.

Story 142-9.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


_CHARS_PER_TOKEN = 4


def _read_otel_events(otel_path: Path) -> str:
    """Read OTEL JSONL and return a human-readable summary of events."""
    if not otel_path.exists() or otel_path.stat().st_size == 0:
        return ""

    lines: list[str] = []
    for raw in otel_path.read_text().splitlines():
        if not raw.strip():
            continue
        try:
            record = json.loads(raw)
        except json.JSONDecodeError:
            continue

        if record.get("signal") != "logs":
            continue

        for rl in record.get("data", {}).get("resourceLogs", []):
            for sl in rl.get("scopeLogs", []):
                for lr in sl.get("logRecords", []):
                    body = lr.get("body", {}).get("stringValue", "")
                    attrs = {
                        a.get("key", ""): (
                            a.get("value", {}).get("stringValue")
                            or a.get("value", {}).get("intValue", "")
                        )
                        for a in lr.get("attributes", [])
                    }
                    if body == "claude_code.tool_decision":
                        tool = attrs.get("tool_name", "?")
                        lines.append(f"[tool] {tool}")
                    elif body == "claude_code.tool_result":
                        fp = attrs.get("file_path", "")
                        tool = attrs.get("tool_name", "?")
                        if fp:
                            lines.append(f"[result] {tool} -> {fp}")
                        else:
                            lines.append(f"[result] {tool}")
                    elif body == "claude_code.assistant_message":
                        text = attrs.get("text", "")
                        if text:
                            lines.append(f"[reasoning] {text}")

    return "\n".join(lines)


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
    parts: list[str] = []
    parts.append(f"# Narrative Request: {title}")
    parts.append("")
    parts.append(
        "Analyze the following pipeline replay events and write a narrative "
        "explaining what the agent did, what it missed, and why."
    )
    parts.append("")

    # Ground truth context
    findings_to_show = ground_truth or []
    if finding_id and findings_to_show:
        findings_to_show = [f for f in findings_to_show if f.get("id") == finding_id]

    if findings_to_show:
        parts.append("## Ground Truth Findings")
        parts.append("")
        for f in findings_to_show:
            fid = f.get("id", "?")
            ftitle = f.get("title", "")
            severity = f.get("severity", "")
            files = ", ".join(f.get("files", []))
            parts.append(f"- **{fid}**: {ftitle} ({severity})")
            if files:
                parts.append(f"  Files: {files}")
        parts.append("")

    if finding_id:
        parts.append(f"**Focus:** Narrate specifically around finding {finding_id}.")
        parts.append("")

    # Phase events
    parts.append("## Agent Events by Phase")
    parts.append("")
    for phase in phases:
        otel_path = run_dir / f"{phase}-otel.jsonl"
        events_text = _read_otel_events(otel_path)
        parts.append(f"### {phase}")
        parts.append("")
        if events_text:
            events_text = truncate_events_to_budget(events_text)
            parts.append(events_text)
        else:
            parts.append("(no events captured)")
        parts.append("")

    parts.append("## Instructions")
    parts.append("")
    parts.append(
        "Write a clear, structured narrative in markdown. Cover:\n"
        "1. What the agent did in each phase\n"
        "2. Key decisions and tool usage patterns\n"
        "3. What was missed and potential reasons why\n"
        "4. Overall assessment of the pipeline run"
    )

    return "\n".join(parts)


def truncate_events_to_budget(text: str, max_tokens: int = 50_000) -> str:
    """Truncate event text to fit within a token budget.

    Prioritizes reasoning content over tool results.

    Args:
        text: Raw event text to truncate.
        max_tokens: Approximate token budget (1 token ~ 4 chars).

    Returns:
        Truncated text within the budget.
    """
    if not text:
        return ""

    max_chars = max_tokens * _CHARS_PER_TOKEN
    if len(text) <= max_chars:
        return text

    return text[:max_chars]


def _invoke_llm(
    prompt: str,
    *,
    model: str | None = None,
    project_dir: Path | None = None,
) -> str:
    """Call Claude CLI and return the response text."""
    cmd = ["claude", "-p", prompt, "--output-format", "json", "--tools", ""]
    if model:
        cmd.extend(["--model", model])

    result = subprocess.run(
        cmd,
        cwd=str(project_dir or Path.cwd()),
        capture_output=True,
        text=True,
        timeout=300,
    )

    response_text = ""
    if result.stdout.strip():
        try:
            data = json.loads(result.stdout)
            response_text = data.get("result", "")
        except json.JSONDecodeError:
            response_text = result.stdout

    if not response_text.strip():
        print("  [NARRATE] WARNING: Empty LLM response", file=sys.stderr)
        if result.stderr.strip():
            print(f"  [NARRATE] stderr: {result.stderr[:500]}", file=sys.stderr)

    return response_text


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
    if not run_dir.exists():
        raise FileNotFoundError(f"Run directory does not exist: {run_dir}")

    narrative_path = run_dir / "narrative.md"

    # Cache check
    if narrative_path.exists() and not force:
        return narrative_path

    use_model = model or "claude-sonnet-4-6"

    prompt = build_narrate_prompt(
        run_dir,
        phases,
        title,
        finding_id=finding_id,
        ground_truth=ground_truth,
    )

    response = _invoke_llm(prompt, model=use_model, project_dir=project_dir)

    narrative_path.write_text(response)

    return narrative_path
