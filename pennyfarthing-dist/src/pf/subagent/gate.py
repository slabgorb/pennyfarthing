"""Gate enforcement for native subagent phase transitions.

SM enforces exit and entry gates between phases when orchestrating
native subagents. This module resolves gate configurations from workflow
YAML, interprets gate subagent results, validates handoff document content,
and composes gate enforcement into the phase chain.

Story: 143-8
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def resolve_exit_gate(
    workflow: str,
    phase: str,
    project_root: Path,
) -> dict[str, Any]:
    """Resolve the exit gate configuration for a completed phase.

    Returns {success: True, data: {gate_file, gate_type, model, content, skip}}
    or {success: False, error: str}.
    """
    raise NotImplementedError("143-8: resolve_exit_gate not yet implemented")


def resolve_entry_gate(
    workflow: str,
    phase: str,
    project_root: Path,
) -> dict[str, Any]:
    """Resolve the entry gate configuration for a target phase.

    Returns {success: True, data: {gate_file, gate_type, model, content, skip}}
    or {success: False, error: str}.
    """
    raise NotImplementedError("143-8: resolve_entry_gate not yet implemented")


def interpret_gate_result(
    gate_result: dict[str, Any],
) -> dict[str, Any]:
    """Interpret a GATE_RESULT dict from a gate subagent.

    Returns {success: True, data: {passed, message, checks, recovery}}
    """
    raise NotImplementedError("143-8: interpret_gate_result not yet implemented")


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
    raise NotImplementedError("143-8: enforce_gate not yet implemented")


def validate_handoff_content(
    handoff_path: Path,
) -> dict[str, Any]:
    """Validate handoff document content (structure, required sections).

    Returns {success: True, data: {agent, story, workflow}}
    or {success: False, error: str}.
    """
    raise NotImplementedError("143-8: validate_handoff_content not yet implemented")


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
    raise NotImplementedError("143-8: build_gate_eval_config not yet implemented")


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
    raise NotImplementedError("143-8: chain_next_phase_with_gates not yet implemented")
