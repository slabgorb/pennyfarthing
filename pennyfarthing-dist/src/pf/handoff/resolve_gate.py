"""Resolve gate for current workflow phase.

Reads workflow YAML, finds current phase gate, and returns gate info.

Enforces the same assessment precondition as complete_phase (via the shared
``pf.handoff.session_assessment`` module) so the two exit-protocol steps can
never disagree: a gated transition with no ``## … Assessment`` heading in the
session file is ``blocked`` here, with the same actionable error
complete_phase would raise one step later (gh #49). Agents write their
assessment BEFORE starting the exit protocol, so a missing heading at
resolve-gate time is a real precondition failure, not a race.

Stories: 105-1 (Script-First Handoff), 158-4 (assessment agreement)
"""

from __future__ import annotations

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
        available = _list_available_workflows(project_root)
        hint = f" To fix: Use one of: {', '.join(available)}" if available else ""
        return _result(status="error", error=f"Workflow '{workflow}' not found.{hint}")

    try:
        data = yaml.safe_load(workflow_path.read_text())
        phases = data["workflow"]["phases"]
    except Exception as e:
        return _result(
            status="error",
            error=(
                f"Failed to parse workflow: {e}. "
                f"To fix: Check `{workflow_path}` for valid YAML with a `workflow.phases` array"
            ),
        )

    current_idx = None
    current_phase = None
    for i, p in enumerate(phases):
        if p["name"] == phase:
            current_idx = i
            current_phase = p
            break

    if current_phase is None:
        valid_phases = [p["name"] for p in phases]
        hint = f" To fix: Use one of: {', '.join(valid_phases)}" if valid_phases else ""
        return _result(
            status="error",
            error=f"Phase '{phase}' not found in workflow '{workflow}'.{hint}",
        )

    gate = current_phase.get("gate")

    # Truthful assessment state: read the session file the way complete_phase
    # will. A missing session file means an assessment cannot exist.
    from pf.handoff.session_assessment import (
        has_assessment,
        missing_assessment_error,
        requires_assessment,
    )

    session_path = project_root / ".session" / f"{story_id}-session.md"
    try:
        session_content = session_path.read_text()
    except OSError:
        session_content = ""
    assessment_found = has_assessment(session_content)

    # Support explicit next: directive for non-linear phase routing
    explicit_next = current_phase.get("next")
    if explicit_next:
        nxt = next((p for p in phases if p["name"] == explicit_next), None)
        if nxt:
            next_phase = nxt["name"]
            next_agent = nxt["agent"]
        else:
            return _result(
                status="error",
                error=f"Phase '{explicit_next}' referenced by next: not found in workflow '{workflow}'",
            )
    elif current_idx + 1 < len(phases):
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
            assessment_found=assessment_found,
        )

    gate_type = gate.get("type")
    gate_file = gate.get("file")

    if gate_type == "manual":
        return _result(
            status="skip",
            gate_type="manual",
            next_agent=next_agent,
            next_phase=next_phase,
            assessment_found=assessment_found,
        )

    # Assessment precondition — the exact check complete_phase enforces,
    # surfaced one step earlier with the same actionable error (gh #49).
    if requires_assessment(gate_type) and not assessment_found:
        error = missing_assessment_error(current_phase.get("agent", phase))
        if not session_path.exists():
            error = (
                f"Session file not found at `.session/{story_id}-session.md`. " + error
            )
        return _result(
            status="blocked",
            gate_type=gate_type,
            gate_file=gate_file,
            next_agent=next_agent,
            next_phase=next_phase,
            assessment_found=False,
            error=error,
        )

    # Extract recovery config if present on the gate
    recovery_config = gate.get("recovery") or None

    # Resolve consumer gate extensions from repos.yaml
    gate_extensions: list[str] | None = None
    if gate_file:
        from pf.handoff.gate_file import resolve_gate_extensions, resolve_lang_review_extensions

        gate_name_for_ext = gate_file
        if gate_name_for_ext.startswith("gates/"):
            gate_name_for_ext = gate_name_for_ext[len("gates/") :]
        ext_result = resolve_gate_extensions(gate_name_for_ext, project_root=project_root)
        if not ext_result["success"]:
            return _result(
                status="error",
                error=ext_result["error"],
            )
        all_extensions = list(ext_result["data"]) if ext_result["data"] else []

        # Auto-discover language-based review gates for dev-exit
        if gate_name_for_ext == "dev-exit":
            from pf.handoff.gate_file import resolve_gate_file

            lang_result = resolve_lang_review_extensions(project_root=project_root)
            if lang_result["success"] and lang_result["data"]:
                for lang_ext in lang_result["data"]:
                    if lang_ext not in all_extensions:
                        all_extensions.append(lang_ext)

            # Always include review-correlation on dev-exit —
            # the gate itself checks whether review findings exist
            corr_ref = "gates/review-correlation"
            corr_result = resolve_gate_file("review-correlation", project_root=project_root)
            if corr_result["status"] == "found" and corr_ref not in all_extensions:
                all_extensions.append(corr_ref)

        if all_extensions:
            gate_extensions = all_extensions

    # Emit gate_check event to Frame TUI (Story 143-16)
    try:
        from pf.frame.subagent_events import emit_subagent_event

        emit_subagent_event(
            "gate_check",
            story_id=story_id,
            workflow=workflow,
            phase=phase,
            gate_type=gate_type or "",
            gate_passed=True,
            next_agent=next_agent or "",
        )
    except Exception:
        pass

    return _result(
        status="ready",
        gate_type=gate_type,
        gate_file=gate_file,
        gate_extensions=gate_extensions,
        recovery_config=recovery_config,
        next_agent=next_agent,
        next_phase=next_phase,
        assessment_found=True,
    )


def _result(
    status: str,
    gate_type: str | None = None,
    gate_file: str | None = None,
    gate_extensions: list[str] | None = None,
    recovery_config: dict | None = None,
    next_agent: str | None = None,
    next_phase: str | None = None,
    assessment_found: bool = False,
    error: str | None = None,
) -> dict:
    result = {
        "status": status,
        "gate_type": gate_type,
        "gate_file": gate_file,
        "gate_extensions": gate_extensions,
        "next_agent": next_agent,
        "next_phase": next_phase,
        "assessment_found": assessment_found,
        "error": error,
    }
    if recovery_config:
        result["recovery_config"] = recovery_config
    return result


def _find_workflow_yaml(project_root: Path, workflow: str) -> Path | None:
    flat = project_root / ".pennyfarthing" / "workflows" / f"{workflow}.yaml"
    if flat.exists():
        return flat
    subdir = project_root / ".pennyfarthing" / "workflows" / workflow / "workflow.yaml"
    if subdir.exists():
        return subdir
    return None


def _list_available_workflows(project_root: Path) -> list[str]:
    """List available workflow names by scanning the workflows directory."""
    workflows_dir = project_root / ".pennyfarthing" / "workflows"
    if not workflows_dir.is_dir():
        return []
    names: set[str] = set()
    for path in workflows_dir.iterdir():
        if path.is_file() and path.suffix == ".yaml":
            names.add(path.stem)
        elif path.is_dir() and (path / "workflow.yaml").exists():
            names.add(path.name)
    return sorted(names)


def _find_project_root() -> Path:
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").is_dir():
            return parent
    return cwd
