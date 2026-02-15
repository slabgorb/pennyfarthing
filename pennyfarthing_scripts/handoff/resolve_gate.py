"""Resolve gate for current workflow phase.

Reads workflow YAML, finds current phase gate, checks for assessment
section in session file, and returns a structured RESOLVE_RESULT.

Story: 105-1 (Script-First Handoff)
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml


def resolve_gate(
    story_id: str,
    workflow: str,
    phase: str,
    project_root: Path | None = None,
) -> dict:
    """Resolve the gate for the current workflow phase.

    Args:
        story_id: Story identifier (e.g., "105-1")
        workflow: Workflow name (e.g., "tdd", "trivial", "patch")
        phase: Current phase name (e.g., "green", "implement", "fix")
        project_root: Project root path. Auto-detected if None.

    Returns:
        RESOLVE_RESULT dict with keys:
            status: "ready" | "blocked" | "skip"
            gate_type: str | None
            gate_file: str | None
            next_agent: str | None
            next_phase: str | None
            assessment_found: bool
            error: str | None
    """
    if project_root is None:
        project_root = _find_project_root()

    workflow_path = _find_workflow_yaml(project_root, workflow)
    if workflow_path is None:
        return _result(status="error", error=f"Workflow '{workflow}' not found")

    try:
        data = yaml.safe_load(workflow_path.read_text())
        phases = data["workflow"]["phases"]
    except Exception as e:
        return _result(status="error", error=f"Failed to parse workflow: {e}")

    current_idx = None
    current_phase = None
    for i, p in enumerate(phases):
        if p["name"] == phase:
            current_idx = i
            current_phase = p
            break

    if current_phase is None:
        return _result(
            status="error",
            error=f"Phase '{phase}' not found in workflow '{workflow}'",
        )

    gate = current_phase.get("gate")

    if current_idx + 1 < len(phases):
        nxt = phases[current_idx + 1]
        next_phase = nxt["name"]
        next_agent = nxt["agent"]
    else:
        next_phase = None
        next_agent = None

    if not gate:
        return _result(
            status="skip",
            next_agent=next_agent,
            next_phase=next_phase,
            assessment_found=True,
        )

    gate_type = gate.get("type")
    gate_file = gate.get("file")

    if gate_type == "manual":
        return _result(
            status="skip",
            gate_type="manual",
            next_agent=next_agent,
            next_phase=next_phase,
            assessment_found=True,
        )

    session_path = project_root / ".session" / f"{story_id}-session.md"
    assessment_found = False
    if session_path.exists():
        content = session_path.read_text()
        assessment_found = bool(
            re.search(r"^##\s+.*Assessment", content, re.MULTILINE)
        )

    status = "ready" if assessment_found else "blocked"
    return _result(
        status=status,
        gate_type=gate_type,
        gate_file=gate_file,
        next_agent=next_agent,
        next_phase=next_phase,
        assessment_found=assessment_found,
    )


def _result(
    status: str,
    gate_type: str | None = None,
    gate_file: str | None = None,
    next_agent: str | None = None,
    next_phase: str | None = None,
    assessment_found: bool = False,
    error: str | None = None,
) -> dict:
    return {
        "status": status,
        "gate_type": gate_type,
        "gate_file": gate_file,
        "next_agent": next_agent,
        "next_phase": next_phase,
        "assessment_found": assessment_found,
        "error": error,
    }


def _find_workflow_yaml(project_root: Path, workflow: str) -> Path | None:
    flat = project_root / ".pennyfarthing" / "workflows" / f"{workflow}.yaml"
    if flat.exists():
        return flat
    subdir = project_root / ".pennyfarthing" / "workflows" / workflow / "workflow.yaml"
    if subdir.exists():
        return subdir
    return None


def _find_project_root() -> Path:
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").is_dir():
            return parent
    return cwd
