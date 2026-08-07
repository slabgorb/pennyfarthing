"""Phase-chaining orchestration for native subagents.

SM reads handoff documents from completed subagents and chains them
into the next workflow phase. This is the glue between single-subagent
spawning (143-6) and gate enforcement (143-8).

Story: 143-7
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from pf.subagent.spawn import build_spawn_config
from pf.workflow.helpers import find_workflow_file, get_all_workflows_dirs


def extract_handoff_path(
    subagent_result: dict[str, Any],
    project_root: Path,
) -> dict[str, Any]:
    """Extract and resolve handoff document path from a parsed SUBAGENT_RESULT.

    Returns {success: True, data: {path: Path}} or {success: False, error: str}.
    """
    try:
        raw_path = subagent_result.get("handoff_path")
        if not raw_path:
            return {
                "success": False,
                "error": "No handoff_path in subagent result",
            }

        raw_path = str(raw_path)
        if not raw_path.strip():
            return {
                "success": False,
                "error": "No handoff_path in subagent result",
            }

        path = Path(raw_path)
        if not path.is_absolute():
            path = project_root / path

        return {"success": True, "data": {"path": path}}
    except Exception as exc:
        return {"success": False, "error": f"Failed to extract handoff_path: {exc}"}


def validate_handoff_document(handoff_path: Path) -> dict[str, Any]:
    """Validate that a handoff document exists and is non-empty.

    Returns {success: True, data: {}} or {success: False, error: str}.
    """
    try:
        if not handoff_path.exists():
            return {
                "success": False,
                "error": f"Handoff document not found: {handoff_path}",
            }

        content = handoff_path.read_text()
        if not content.strip():
            return {
                "success": False,
                "error": f"Handoff document is empty: {handoff_path}",
            }

        return {"success": True, "data": {}}
    except Exception as exc:
        return {"success": False, "error": f"Failed to validate handoff document: {exc}"}


def resolve_next_phase(
    workflow: str,
    current_phase: str,
    project_root: Path,
) -> dict[str, Any]:
    """Resolve the next phase and agent from workflow YAML.

    Returns {success: True, data: {next_phase: str|None, next_agent: str|None}}
    or {success: False, error: str}.
    """
    try:
        phases = _load_workflow_phases(workflow, project_root)
        if phases is None:
            return {
                "success": False,
                "error": f"Workflow '{workflow}' not found or has no phases",
            }

        phase_names = [p["name"] for p in phases]
        if current_phase not in phase_names:
            return {
                "success": False,
                "error": f"Phase '{current_phase}' not found in workflow '{workflow}'. "
                f"Available phases: {', '.join(phase_names)}",
            }

        idx = phase_names.index(current_phase)
        if idx + 1 >= len(phases):
            # Last phase — workflow complete
            return {
                "success": True,
                "data": {"next_phase": None, "next_agent": None},
            }

        next_phase = phases[idx + 1]
        return {
            "success": True,
            "data": {
                "next_phase": next_phase["name"],
                "next_agent": next_phase.get("agent", next_phase["name"]),
            },
        }
    except Exception as exc:
        return {"success": False, "error": f"Failed to resolve next phase: {exc}"}


def chain_next_phase(
    subagent_result: dict[str, Any],
    story_id: str,
    workflow: str,
    current_phase: str,
    task_description: str,
    project_root: Path,
) -> dict[str, Any]:
    """Full phase chain: extract handoff → validate → resolve next → build spawn config.

    Returns {success: True, data: {next_phase, next_agent, spawn_config, workflow_complete}}
    or {success: False, error: str}.
    """
    try:
        # Step 1: Extract handoff path
        extract_result = extract_handoff_path(subagent_result, project_root)
        if not extract_result["success"]:
            return extract_result

        handoff_path = extract_result["data"]["path"]

        # Step 2: Validate handoff document
        validate_result = validate_handoff_document(handoff_path)
        if not validate_result["success"]:
            return validate_result

        # Step 3: Resolve next phase
        phase_result = resolve_next_phase(workflow, current_phase, project_root)
        if not phase_result["success"]:
            return phase_result

        next_phase = phase_result["data"]["next_phase"]
        next_agent = phase_result["data"]["next_agent"]

        # Workflow complete — no more phases
        if next_phase is None:
            return {
                "success": True,
                "data": {
                    "next_phase": None,
                    "next_agent": None,
                    "spawn_config": None,
                    "workflow_complete": True,
                },
            }

        # Step 4: Build spawn config for next agent
        spawn_config = build_spawn_config(
            agent_name=next_agent,
            story_id=story_id,
            task_description=task_description,
            project_root=project_root,
            prior_handoff_path=handoff_path,
        )

        if spawn_config.get("status") == "error":
            return {
                "success": False,
                "error": spawn_config.get("error", "Failed to build spawn config"),
            }

        return {
            "success": True,
            "data": {
                "next_phase": next_phase,
                "next_agent": next_agent,
                "spawn_config": spawn_config,
                "workflow_complete": False,
            },
        }
    except Exception as exc:
        return {"success": False, "error": f"Failed to chain next phase: {exc}"}


def _load_workflow_phases(workflow: str, project_root: Path) -> list[dict] | None:
    """Load phases list from workflow YAML."""
    path = find_workflow_file(get_all_workflows_dirs(project_root), workflow)
    if path is not None:
        data = yaml.safe_load(path.read_text())
        phases = data.get("workflow", {}).get("phases", [])
        if isinstance(phases, list) and phases:
            return phases
    return None
