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

import re
from pathlib import Path

_DEFAULT_FAIL: dict = {
    "status": "fail",
    "message": "Gate evaluation failed or did not return GATE_RESULT",
    "checks": [],
}


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
    path = Path(gate_path)

    if not path.exists():
        return {
            "status": "error",
            "name": None,
            "model": "haiku",
            "content": None,
            "error": f"Gate file not found: {path}",
        }

    content = path.read_text()

    gate_match = re.search(r"<gate\b[^>]*>", content)
    if not gate_match:
        return {
            "status": "error",
            "name": None,
            "model": "haiku",
            "content": None,
            "error": "No <gate> tag found in file",
        }

    gate_tag = gate_match.group(0)

    name_match = re.search(r'name="([^"]+)"', gate_tag)
    name = name_match.group(1) if name_match else None

    model_match = re.search(r'model="([^"]+)"', gate_tag)
    model = model_match.group(1) if model_match else "haiku"

    return {
        "status": "ok",
        "name": name,
        "model": model,
        "content": content,
        "error": None,
    }


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
    if raw_output is None or not raw_output.strip():
        return dict(_DEFAULT_FAIL)

    # Split on GATE_RESULT: and take the last block (AC7: multiple → last wins)
    blocks = raw_output.split("GATE_RESULT:")
    if len(blocks) < 2:
        return dict(_DEFAULT_FAIL)

    block = blocks[-1]

    # Extract status — strict enum: only "pass" or "fail"
    status_match = re.search(r"^\s*status:\s*(pass|fail)\s*$", block, re.MULTILINE)
    if not status_match:
        return dict(_DEFAULT_FAIL)

    status = status_match.group(1)

    # Extract message — double-quoted, single-quoted, or unquoted
    message_match = re.search(
        r"""^\s*message:\s*(?:"([^"]*)"|'([^']*)'|(.+?))\s*$""",
        block,
        re.MULTILINE,
    )
    message = ""
    if message_match:
        message = message_match.group(1) or message_match.group(2) or message_match.group(3) or ""

    # Extract checks list via regex on consecutive name/status/detail lines
    checks: list[dict] = []
    check_pattern = re.compile(
        r"^\s*-\s*name:\s*(?:\"([^\"]*)\"|'([^']*)'|(\S+))\s*\n"
        r"\s*status:\s*(pass|fail)\s*\n"
        r"\s*detail:\s*(?:\"([^\"]*)\"|'([^']*)'|(.+?))\s*$",
        re.MULTILINE,
    )
    for m in check_pattern.finditer(block):
        checks.append({
            "name": m.group(1) or m.group(2) or m.group(3),
            "status": m.group(4),
            "detail": m.group(5) or m.group(6) or m.group(7) or "",
        })

    return {
        "status": status,
        "message": message,
        "checks": checks,
    }


def merge_gate_results(primary: dict, extension: dict) -> dict:
    """Merge an extension GATE_RESULT into a primary result.

    AND semantics: if the extension fails, the combined result fails.
    Checks arrays are concatenated. Messages are joined with '; '.
    """
    if primary["status"] == "fail":
        combined_status = "fail"
    elif extension["status"] == "fail":
        combined_status = "fail"
    else:
        combined_status = "pass"

    primary_msg = primary.get("message", "")
    ext_msg = extension.get("message", "")
    if primary_msg and ext_msg:
        combined_message = f"{primary_msg}; {ext_msg}"
    else:
        combined_message = primary_msg or ext_msg

    combined_checks = list(primary.get("checks", []))
    combined_checks.extend(extension.get("checks", []))

    result: dict = {
        "status": combined_status,
        "message": combined_message,
        "checks": combined_checks,
    }

    # Preserve recovery from either result on failure
    recovery: list = []
    if primary.get("recovery"):
        recovery.extend(primary["recovery"])
    if extension.get("recovery"):
        recovery.extend(extension["recovery"])
    if recovery:
        result["recovery"] = recovery

    return result
