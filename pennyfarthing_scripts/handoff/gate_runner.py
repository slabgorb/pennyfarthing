"""Gate subagent runner — parse gate files and extract GATE_RESULT.

Provides two core functions for the agent exit protocol (step 6):
  1. parse_gate_file(path) — read gate file, extract model/name/content
  2. extract_gate_result(raw_output) — regex-extract GATE_RESULT from subagent output

The actual subagent spawning is handled by the Claude agent via Task tool.
These functions provide the parsing layer around that interaction.

Default-deny: missing or unparseable GATE_RESULT always returns fail.
Gate files are read-only at runtime — never written to.

Story: 106-2 (Gate subagent runner with GATE_RESULT contract)
"""

from __future__ import annotations

from pathlib import Path


def parse_gate_file(
    gate_path: str | Path,
) -> dict:
    """Parse a gate file and extract its metadata and content.

    Reads the gate file (read-only), extracts the model attribute and gate name
    from the <gate> tag, and returns the full content for subagent prompting.

    Args:
        gate_path: Absolute path to the gate file.

    Returns:
        dict with keys:
            status: "ok" | "error"
            name: str | None (gate name from <gate name="...">)
            model: str (model from <gate model="..."> or "haiku")
            content: str | None (full gate file content)
            error: str | None
    """
    raise NotImplementedError("parse_gate_file not yet implemented")


def extract_gate_result(
    raw_output: str | None,
) -> dict:
    """Extract GATE_RESULT from raw subagent output via regex.

    Parses the subagent's text output to find a GATE_RESULT YAML block.
    Uses regex/grep patterns — NOT a full YAML parser.

    Default-deny: if GATE_RESULT cannot be extracted, returns fail.

    Args:
        raw_output: Raw text output from the gate subagent.

    Returns:
        dict with keys:
            status: "pass" | "fail"
            message: str
            checks: list[dict] (each with name, status, detail)
    """
    raise NotImplementedError("extract_gate_result not yet implemented")
