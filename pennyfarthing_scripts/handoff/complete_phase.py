"""Complete phase transition with atomic session update.

Atomically updates the session file (temp + mv) with phase transition,
timestamps, and history table entries.

Story: 105-1 (Script-First Handoff)
"""

from __future__ import annotations

import os
import re
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import yaml


def complete_phase(
    story_id: str,
    workflow: str,
    from_phase: str,
    to_phase: str,
    gate_type: str,
    project_root: Path | None = None,
) -> dict:
    """Complete a phase transition with atomic session file update.

    Args:
        story_id: Story identifier (e.g., "105-1")
        workflow: Workflow name (e.g., "tdd", "trivial")
        from_phase: Phase being completed (e.g., "green")
        to_phase: Phase being entered (e.g., "review")
        gate_type: Gate type that was passed (e.g., "tests_pass")
        project_root: Project root path. Auto-detected if None.

    Returns:
        COMPLETE_RESULT dict with keys:
            status: "success" | "error"
            session_file: str (path to session file)
            error: str | None
    """
    if project_root is None:
        project_root = _find_project_root()

    session_path = project_root / ".session" / f"{story_id}-session.md"
    if not session_path.exists():
        return {
            "status": "error",
            "session_file": None,
            "error": "Session file not found",
        }

    content = session_path.read_text()

    # Guard: require assessment section before allowing gated phase transitions.
    # Skip/manual transitions (e.g. setup→implement) don't need assessments.
    if gate_type not in ("skip", "manual", "-", None, "") and not re.search(
        r"^##\s+.*Assessment", content, re.MULTILINE
    ):
        return {
            "status": "error",
            "session_file": str(session_path),
            "error": "No assessment found in session file. Write your assessment before completing the phase.",
        }

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    from_agent = _get_phase_agent(project_root, workflow, from_phase)
    to_agent = _get_phase_agent(project_root, workflow, to_phase)

    # Update all **Phase:** lines to new phase
    content = re.sub(r"(\*\*Phase:\*\*) \S+", rf"\1 {to_phase}", content)

    # Update all **Phase Started:** lines to now
    content = re.sub(r"(\*\*Phase Started:\*\*) \S+", rf"\1 {now}", content)

    # Update Phase History: fill Ended/Duration for from_phase, add new row
    lines = content.splitlines()
    result_lines = []
    for line in lines:
        if line.strip().startswith(f"| {from_phase}"):
            cols = [c.strip() for c in line.split("|") if c.strip()]
            if len(cols) >= 4 and cols[2] == "-":
                started_str = cols[1]
                duration = _calc_duration(started_str, now)
                result_lines.append(
                    f"| {from_phase} | {started_str} | {now} | {duration} |"
                )
                result_lines.append(f"| {to_phase} | {now} | - | - |")
                continue
        result_lines.append(line)
    content = "\n".join(result_lines)

    # Add Handoff History row at end of table
    handoff_row = (
        f"| {from_phase} ({from_agent}) | {to_phase} ({to_agent}) "
        f"| {gate_type} | PASSED | {now} |"
    )
    lines = content.splitlines()
    insert_after = None
    in_handoff = False
    for i, line in enumerate(lines):
        if "### Handoff History" in line:
            in_handoff = True
        if in_handoff and line.strip().startswith("|"):
            insert_after = i
    if insert_after is not None:
        lines.insert(insert_after + 1, handoff_row)
    content = "\n".join(lines)

    # Atomic write: temp file in same directory + rename
    temp_fd, temp_path_str = tempfile.mkstemp(
        dir=str(session_path.parent), suffix=".tmp"
    )
    os.close(temp_fd)
    temp_path = Path(temp_path_str)
    try:
        temp_path.write_text(content)
        temp_path.rename(session_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise

    return {
        "status": "success",
        "session_file": f".session/{story_id}-session.md",
        "error": None,
    }


def _calc_duration(started_str: str, ended_str: str) -> str:
    started = datetime.fromisoformat(started_str.replace("Z", "+00:00"))
    ended = datetime.fromisoformat(ended_str.replace("Z", "+00:00"))
    total_seconds = int((ended - started).total_seconds())
    if total_seconds < 60:
        return f"{total_seconds}s"
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    if total_seconds < 3600:
        return f"{minutes}m {seconds}s" if seconds else f"{minutes}m"
    hours = total_seconds // 3600
    rem_minutes = (total_seconds % 3600) // 60
    return f"{hours}h {rem_minutes}m" if rem_minutes else f"{hours}h"


def _get_phase_agent(project_root: Path, workflow: str, phase: str) -> str:
    for name in [f"{workflow}.yaml", f"{workflow}/workflow.yaml"]:
        path = project_root / ".pennyfarthing" / "workflows" / name
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text())
                for p in data["workflow"]["phases"]:
                    if p["name"] == phase:
                        return p.get("agent", phase)
            except Exception:
                pass
    return phase


def _find_project_root() -> Path:
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        if (parent / ".pennyfarthing").is_dir():
            return parent
    return cwd
