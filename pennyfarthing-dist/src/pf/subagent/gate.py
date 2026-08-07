"""Gate enforcement for native subagent phase transitions.

SM enforces exit and entry gates between phases when orchestrating
native subagents. This module resolves gate configurations from workflow
YAML, interprets gate subagent results, validates handoff document content,
and composes gate enforcement into the phase chain.

Story: 143-8
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from pf.subagent.chain import (
    extract_handoff_path,
    resolve_next_phase,
    validate_handoff_document,
)
from pf.subagent.spawn import build_spawn_config
from pf.workflow.helpers import find_workflow_file, get_all_workflows_dirs


def _load_workflow_phases(
    workflow: str, project_root: Path
) -> list[dict] | None:
    """Load phases list from workflow YAML."""
    path = find_workflow_file(get_all_workflows_dirs(project_root), workflow)
    if path is not None:
        data = yaml.safe_load(path.read_text())
        phases = data.get("workflow", {}).get("phases", [])
        if isinstance(phases, list) and phases:
            return phases
    return None


def _find_phase(
    phases: list[dict], phase_name: str
) -> dict | None:
    """Find a phase by name in a phases list."""
    for p in phases:
        if p["name"] == phase_name:
            return p
    return None


def _resolve_gate_config(
    gate_spec: dict | None,
    project_root: Path,
) -> dict[str, Any]:
    """Resolve a gate spec (from workflow YAML) into a full config.

    Returns {success, data: {gate_file, gate_type, model, content, skip}}.
    """
    if not gate_spec:
        return {"success": True, "data": {"skip": True}}

    gate_type = gate_spec.get("type")
    if gate_type == "manual":
        return {"success": True, "data": {"skip": True}}

    gate_file = gate_spec.get("file", "")

    # Resolve the gate file to an absolute path
    gate_name = gate_file
    if gate_name.startswith("gates/"):
        gate_name = gate_name[len("gates/"):]

    # Search for the gate file
    candidates = [
        project_root / ".pennyfarthing" / "gates" / f"{gate_name}.md",
    ]
    resolved_path = None
    for candidate in candidates:
        if candidate.is_file():
            resolved_path = candidate
            break

    if resolved_path is None:
        return {
            "success": False,
            "error": f"Gate file not found: {gate_file}",
        }

    # Parse the gate file for model
    content = resolved_path.read_text()
    model = "haiku"
    model_match = re.search(r'model="([^"]+)"', content)
    if model_match:
        model = model_match.group(1)

    return {
        "success": True,
        "data": {
            "gate_file": gate_file,
            "gate_type": gate_type,
            "model": model,
            "content": content,
            "skip": False,
        },
    }


def resolve_exit_gate(
    workflow: str,
    phase: str,
    project_root: Path,
) -> dict[str, Any]:
    """Resolve the exit gate configuration for a completed phase.

    Returns {success: True, data: {gate_file, gate_type, model, content, skip}}
    or {success: False, error: str}.
    """
    phases = _load_workflow_phases(workflow, project_root)
    if phases is None:
        return {
            "success": False,
            "error": f"Workflow '{workflow}' not found or has no phases",
        }

    phase_def = _find_phase(phases, phase)
    if phase_def is None:
        phase_names = [p["name"] for p in phases]
        return {
            "success": False,
            "error": (
                f"Phase '{phase}' not found in workflow '{workflow}'. "
                f"Available: {', '.join(phase_names)}"
            ),
        }

    return _resolve_gate_config(phase_def.get("gate"), project_root)


def resolve_entry_gate(
    workflow: str,
    phase: str,
    project_root: Path,
) -> dict[str, Any]:
    """Resolve the entry gate configuration for a target phase.

    Returns {success: True, data: {gate_file, gate_type, model, content, skip}}
    or {success: False, error: str}.
    """
    phases = _load_workflow_phases(workflow, project_root)
    if phases is None:
        return {
            "success": False,
            "error": f"Workflow '{workflow}' not found or has no phases",
        }

    phase_def = _find_phase(phases, phase)
    if phase_def is None:
        phase_names = [p["name"] for p in phases]
        return {
            "success": False,
            "error": (
                f"Phase '{phase}' not found in workflow '{workflow}'. "
                f"Available: {', '.join(phase_names)}"
            ),
        }

    return _resolve_gate_config(phase_def.get("entry_gate"), project_root)


def interpret_gate_result(
    gate_result: dict[str, Any],
) -> dict[str, Any]:
    """Interpret a GATE_RESULT dict from a gate subagent.

    Default-deny: missing or invalid status → fail.

    Returns {success: True, data: {passed, message, checks, recovery}}.
    """
    if not gate_result or not isinstance(gate_result, dict):
        return {
            "success": True,
            "data": {
                "passed": False,
                "message": "No gate result provided",
                "checks": [],
                "recovery": None,
            },
        }

    status = gate_result.get("status")
    if status not in ("pass", "fail"):
        return {
            "success": True,
            "data": {
                "passed": False,
                "message": gate_result.get("message", "Invalid gate result (no status)"),
                "checks": gate_result.get("checks", []),
                "recovery": gate_result.get("recovery"),
            },
        }

    passed = status == "pass"
    return {
        "success": True,
        "data": {
            "passed": passed,
            "message": gate_result.get("message", ""),
            "checks": gate_result.get("checks", []),
            "recovery": gate_result.get("recovery"),
        },
    }


def enforce_gate(
    workflow: str,
    phase: str,
    gate_result: dict[str, Any] | None,
    project_root: Path,
) -> dict[str, Any]:
    """Enforce a gate: resolve config + interpret result.

    Returns {success: True, data: {passed, gate_type, skipped, ...}}
    or {success: False, error: str}.
    """
    resolve = resolve_exit_gate(workflow, phase, project_root)
    if not resolve["success"]:
        return resolve

    if resolve["data"].get("skip"):
        return {
            "success": True,
            "data": {
                "passed": True,
                "gate_type": None,
                "skipped": True,
            },
        }

    gate_type = resolve["data"]["gate_type"]

    if gate_result is None:
        return {
            "success": True,
            "data": {
                "passed": False,
                "gate_type": gate_type,
                "skipped": False,
                "message": "Gate requires evaluation but no result provided",
            },
        }

    interp = interpret_gate_result(gate_result)
    data = interp["data"]
    return {
        "success": True,
        "data": {
            "passed": data["passed"],
            "gate_type": gate_type,
            "skipped": False,
            "message": data.get("message", ""),
            "checks": data.get("checks", []),
            "recovery": data.get("recovery"),
        },
    }


def validate_handoff_content(
    handoff_path: Path,
) -> dict[str, Any]:
    """Validate handoff document content (structure, required sections).

    Checks for required sections (Summary, Deliverables) and parses
    metadata (Story, Agent, Workflow) from the header.

    Returns {success: True, data: {agent, story, workflow}}
    or {success: False, error: str}.
    """
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

    # Check required sections
    if "## Summary" not in content:
        return {
            "success": False,
            "error": "Handoff document missing required '## Summary' section",
        }

    # Parse metadata from header line:
    # **Story:** 143-8  |  **Agent:** tea  |  **Timestamp:** ...
    story = None
    agent = None
    workflow_val = None

    story_match = re.search(r"\*\*Story:\*\*\s*(\S+)", content)
    if story_match:
        story = story_match.group(1)

    agent_match = re.search(r"\*\*Agent:\*\*\s*(\S+)", content)
    if agent_match:
        agent = agent_match.group(1)

    workflow_match = re.search(r"\*\*Workflow:\*\*\s*(\S+)", content)
    if workflow_match:
        workflow_val = workflow_match.group(1)

    return {
        "success": True,
        "data": {
            "agent": agent,
            "story": story,
            "workflow": workflow_val,
        },
    }


def build_gate_eval_config(
    workflow: str,
    phase: str,
    story_id: str,
    project_root: Path,
    gate_position: str = "exit",
) -> dict[str, Any]:
    """Build a gate evaluation config for SM to spawn a gate subagent.

    Returns {success: True, data: {prompt, model, skip}}
    or {success: False, error: str}.
    """
    if gate_position == "entry":
        resolve = resolve_entry_gate(workflow, phase, project_root)
    else:
        resolve = resolve_exit_gate(workflow, phase, project_root)

    if not resolve["success"]:
        return resolve

    if resolve["data"].get("skip"):
        return {"success": True, "data": {"skip": True}}

    gate_content = resolve["data"]["content"]
    model = resolve["data"]["model"]

    prompt = (
        f"Evaluate this gate for story {story_id}.\n\n"
        f"{gate_content}\n\n"
        "Return a GATE_RESULT with status: pass or fail."
    )

    return {
        "success": True,
        "data": {
            "prompt": prompt,
            "model": model,
            "skip": False,
        },
    }


def chain_next_phase_with_gates(
    subagent_result: dict[str, Any],
    story_id: str,
    workflow: str,
    current_phase: str,
    task_description: str,
    project_root: Path,
    exit_gate_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Gate-aware phase chain: handoff validation + gate enforcement + spawn config.

    Enhanced version of chain.chain_next_phase() that inserts gate
    enforcement between handoff validation and next-phase spawning.

    Returns {success: True, data: {next_phase, next_agent, spawn_config, workflow_complete}}
    or {success: False, error: str}.
    """
    try:
        # Step 1: Extract handoff path
        extract_result = extract_handoff_path(subagent_result, project_root)
        if not extract_result["success"]:
            return extract_result

        handoff_path = extract_result["data"]["path"]

        # Step 2: Validate handoff document exists
        validate_result = validate_handoff_document(handoff_path)
        if not validate_result["success"]:
            return validate_result

        # Step 3: Validate handoff content (structure check — new for 143-8)
        content_result = validate_handoff_content(handoff_path)
        if not content_result["success"]:
            return content_result

        # Step 4: Enforce exit gate
        gate_enforcement = enforce_gate(
            workflow, current_phase, exit_gate_result, project_root
        )
        if not gate_enforcement["success"]:
            return gate_enforcement

        if not gate_enforcement["data"]["passed"]:
            gate_msg = gate_enforcement["data"].get("message", "Gate failed")
            gate_type = gate_enforcement["data"].get("gate_type", "unknown")
            return {
                "success": False,
                "error": f"Exit gate '{gate_type}' failed: {gate_msg}",
            }

        # Step 5: Resolve next phase
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

        # Step 6: Build spawn config for next agent
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
        return {
            "success": False,
            "error": f"Failed to chain next phase with gates: {exc}",
        }
