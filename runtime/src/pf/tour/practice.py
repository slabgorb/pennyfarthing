"""Practice story lifecycle for the guided tour.

Creates, manages, and cleans up practice epic/story artifacts
used during the guided tour's sprint exercise (step 04).
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import yaml

PRACTICE_EPIC_ID = "epic-tour-practice"
PRACTICE_EPIC_REF = "tour-practice"  # shard_merge uses f"epic-{ref}.yaml"
PRACTICE_STORY_ID = "tour-practice-1"
PRACTICE_SHARD_NAME = "epic-tour-practice.yaml"
TEMPLATE_REL = "workflows/guided-tour/templates/epic-tour-practice.yaml"


def _find_dist_root() -> Path:
    """Find the pennyfarthing-dist root from this module's location."""
    # tour/ -> pf/ -> src/ -> pennyfarthing-dist/
    return Path(__file__).resolve().parent.parent.parent.parent


def _register_epic_in_index(sprint_dir: Path) -> None:
    """Add the practice epic ref to current-sprint.yaml epics list."""
    index_path = sprint_dir / "current-sprint.yaml"
    if not index_path.exists():
        return

    data = yaml.safe_load(index_path.read_text())
    if data is None:
        return

    epics = data.get("epics", [])
    if PRACTICE_EPIC_REF not in epics:
        epics.append(PRACTICE_EPIC_REF)
        data["epics"] = epics
        index_path.write_text(yaml.dump(data, default_flow_style=False))


def _unregister_epic_from_index(sprint_dir: Path) -> None:
    """Remove the practice epic ref from current-sprint.yaml epics list."""
    index_path = sprint_dir / "current-sprint.yaml"
    if not index_path.exists():
        return

    data = yaml.safe_load(index_path.read_text())
    if data is None:
        return

    epics = data.get("epics", [])
    if PRACTICE_EPIC_REF in epics:
        epics.remove(PRACTICE_EPIC_REF)
        data["epics"] = epics
        index_path.write_text(yaml.dump(data, default_flow_style=False))


def create_practice_epic(project_root: Path) -> dict[str, Any]:
    """Create the practice epic shard in the project's sprint directory.

    Copies the practice epic template into sprint/ and registers the epic
    ref in current-sprint.yaml.

    Args:
        project_root: Path to the project root (where sprint/ lives).

    Returns:
        Result dict with {success, shard_path?, error?}.
    """
    sprint_dir = project_root / "sprint"
    if not sprint_dir.exists():
        return {"success": False, "error": "sprint/ directory not found"}

    shard_path = sprint_dir / PRACTICE_SHARD_NAME

    # If shard already exists, reuse it (idempotent)
    if shard_path.exists():
        return {"success": True, "shard_path": str(shard_path), "reused": True}

    # Copy template
    dist_root = _find_dist_root()
    template_path = dist_root / TEMPLATE_REL
    if not template_path.exists():
        return {"success": False, "error": f"Template not found at {template_path}"}

    try:
        shutil.copy2(template_path, shard_path)
    except OSError as e:
        return {"success": False, "error": f"Failed to copy template: {e}"}

    # Register epic ref in sprint index so the sprint system can discover it
    _register_epic_in_index(sprint_dir)

    return {"success": True, "shard_path": str(shard_path)}


def cleanup_practice(project_root: Path) -> dict[str, Any]:
    """Remove all practice artifacts from the project.

    Removes:
    - sprint/epic-tour-practice.yaml (shard file)
    - .session/tour-practice-1-session.md (session file)
    - sprint/archive/tour-practice-1-session.md (archive artifact)

    Args:
        project_root: Path to the project root.

    Returns:
        Result dict with {success, removed: list[str], errors: list[str]}.
    """
    removed: list[str] = []
    errors: list[str] = []

    targets = [
        project_root / "sprint" / PRACTICE_SHARD_NAME,
        project_root / ".session" / f"{PRACTICE_STORY_ID}-session.md",
        project_root / "sprint" / "archive" / f"{PRACTICE_STORY_ID}-session.md",
    ]

    for target in targets:
        if target.exists():
            try:
                target.unlink()
                removed.append(str(target))
            except OSError as e:
                errors.append(f"Failed to remove {target}: {e}")

    # Remove epic ref from sprint index
    _unregister_epic_from_index(project_root / "sprint")

    return {"success": len(errors) == 0, "removed": removed, "errors": errors}


def detect_orphaned_practice(project_root: Path) -> dict[str, Any]:
    """Detect orphaned practice artifacts from an interrupted tour.

    Checks for leftover practice files that indicate the tour was
    interrupted mid-practice.

    Args:
        project_root: Path to the project root.

    Returns:
        Result dict with {found: bool, artifacts: list[str]}.
    """
    artifacts: list[str] = []

    candidates = [
        project_root / "sprint" / PRACTICE_SHARD_NAME,
        project_root / ".session" / f"{PRACTICE_STORY_ID}-session.md",
        project_root / "sprint" / "archive" / f"{PRACTICE_STORY_ID}-session.md",
    ]

    for candidate in candidates:
        if candidate.exists():
            artifacts.append(str(candidate))

    return {"found": len(artifacts) > 0, "artifacts": artifacts}
