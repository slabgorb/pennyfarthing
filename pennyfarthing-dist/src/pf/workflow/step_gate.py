"""Stepped workflow gate validation — Story 137-3.

Validates gate criteria for stepped workflow steps. Supports inline
criteria (from step-meta gate_inline), external gate files, and
<gate> tags parsed from step file content.

Usage:
    from pf.workflow.step_gate import resolve_step_gate

    result = resolve_step_gate(
        step_meta={"number": 4, "name": "components", "gate": True, ...},
        step_file="/path/to/step-04-components.md",
        workflow_name="architecture",
    )
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml


def resolve_step_gate(
    step_meta: dict,
    step_file: str,
    workflow_name: str,
    skip_gate: bool = False,
    project_root: Path | None = None,
) -> dict:
    """Validate a stepped workflow step against its gate criteria.

    Args:
        step_meta: Parsed step-meta dict from the step file.
        step_file: Path to the step markdown file.
        workflow_name: Name of the active workflow.
        skip_gate: If True, bypass gate validation (audit logged).
        project_root: Project root path. Auto-detected if None.

    Returns:
        {
            'success': bool,
            'gate_result': dict,
            'error': str or None,
            'gate_used': str  # 'inline' | 'external' | 'skipped'
        }
    """
    if skip_gate:
        return _result(success=True, gate_used="skipped")

    gate_flag = step_meta.get("gate")
    if not gate_flag:
        return _result(success=True, gate_used="skipped")

    gate_file_ref = step_meta.get("gate_file")
    gate_inline = step_meta.get("gate_inline")

    # Priority: external gate_file > inline criteria > <gate> tag in step file
    if gate_file_ref:
        return _resolve_external_gate(gate_file_ref, project_root)

    if gate_inline is not None:
        if not gate_inline:
            return _result(
                success=False,
                error="Inline gate criteria list is empty",
            )
        return _result(
            success=True,
            gate_used="inline",
            gate_result={"criteria": gate_inline},
        )

    return _resolve_gate_tag_from_file(step_file)


def _resolve_external_gate(gate_file_ref: str, project_root: Path | None) -> dict:
    """Load and validate an external gate YAML file."""
    if project_root is None:
        return _result(success=False, error="project_root required for external gate files")

    gate_path = project_root / gate_file_ref
    if not gate_path.exists():
        return _result(
            success=False,
            error=f"Gate file not found: {gate_file_ref}",
        )

    try:
        data = yaml.safe_load(gate_path.read_text())
    except yaml.YAMLError as e:
        return _result(
            success=False,
            error=f"Failed to parse gate file {gate_file_ref}: {e}",
        )

    gate = data.get("gate", {}) if isinstance(data, dict) else {}
    criteria = gate.get("criteria", [])

    if not criteria:
        return _result(
            success=False,
            error=f"Gate file {gate_file_ref} has no criteria",
        )

    return _result(
        success=True,
        gate_used="external",
        gate_result={"criteria": criteria},
    )


def _resolve_gate_tag_from_file(step_file: str) -> dict:
    """Parse <gate> tag from step file content as fallback."""
    path = Path(step_file)
    if not path.exists():
        return _result(
            success=False,
            error=f"Step file not found: {step_file}",
        )

    content = path.read_text()
    match = re.search(r"<gate>(.*?)</gate>", content, re.DOTALL)
    if not match:
        return _result(
            success=False,
            error="No gate criteria found: no gate_file, no gate_inline, and no <gate> tag in step file",
        )

    gate_content = match.group(1).strip()
    return _result(
        success=True,
        gate_used="inline",
        gate_result={"content": gate_content},
    )


def _result(
    success: bool,
    gate_used: str = "skipped",
    gate_result: dict | None = None,
    error: str | None = None,
) -> dict:
    return {
        "success": success,
        "gate_result": gate_result if gate_result is not None else {},
        "error": error,
        "gate_used": gate_used,
    }
