"""
Pane registry — CRUD, reconciliation, and idle detection.

The registry lives at `.pennyfarthing/tmux-panes.json` and is reconciled
against live tmux state on every load.
"""

from __future__ import annotations

import fcntl
import json
from pathlib import Path

from pf.tmux.panes import is_pane_idle, list_live_panes

PROTECTED_ROLES = {"claude", "tui", "saddle"}
AGENT_ROLES = {"tea", "dev", "reviewer", "architect", "sm", "ba", "devops", "tech-writer", "ux-designer", "orchestrator"}
DEFAULT_MAX_PANES = 5

# Title patterns for auto-classification
_TITLE_CLASSIFIERS = {
    "Claude Code": ("claude", True),
    "TUI": ("tui", True),
    "Saddle": ("saddle", True),
}


def registry_path(project_root: Path) -> Path:
    """Return the path to the pane registry file."""
    return project_root / ".pennyfarthing" / "tmux-panes.json"


def _empty_registry(session: str) -> dict:
    return {
        "session": session,
        "socket": "pf",
        "max_panes": DEFAULT_MAX_PANES,
        "panes": [],
    }


def load_registry(project_root: Path, session: str) -> dict:
    """Load registry from disk and reconcile against live tmux state.

    Returns:
        {success: True, data: <registry dict>} or {success: False, error: ...}
    """
    rpath = registry_path(project_root)

    # Get live panes for reconciliation
    live_result = list_live_panes(session)
    if not live_result["success"]:
        return live_result
    live_panes = live_result["data"]

    # Load existing registry or create empty
    if rpath.is_file():
        try:
            rpath.parent.mkdir(parents=True, exist_ok=True)
            with open(rpath) as f:
                fcntl.flock(f, fcntl.LOCK_SH)
                try:
                    reg = json.load(f)
                finally:
                    fcntl.flock(f, fcntl.LOCK_UN)
        except (json.JSONDecodeError, OSError):
            reg = _empty_registry(session)
    else:
        reg = _empty_registry(session)

    # Update session name
    reg["session"] = session

    # Reconcile
    reg = reconcile(reg, live_panes)

    # Save reconciled state
    save_result = save_registry(project_root, reg)
    if not save_result["success"]:
        return save_result

    return {"success": True, "data": reg}


def save_registry(project_root: Path, reg: dict) -> dict:
    """Write registry to disk with file locking."""
    rpath = registry_path(project_root)
    try:
        rpath.parent.mkdir(parents=True, exist_ok=True)
        with open(rpath, "w") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                json.dump(reg, f, indent=2)
                f.write("\n")
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
        return {"success": True}
    except OSError as e:
        return {"success": False, "error": f"Failed to save registry: {e}"}


def reconcile(registry: dict, live_panes: list[dict]) -> dict:
    """Reconcile registry against live tmux pane state.

    1. Remove registry entries whose pane_id is not live (stale)
    2. Add live panes not in registry (auto-classify by title)
    3. Update dimensions from live data
    """
    live_ids = {p["pane_id"] for p in live_panes}

    # Remove stale entries
    registry["panes"] = [p for p in registry["panes"] if p["pane_id"] in live_ids]

    # Track known IDs
    known_ids = {p["pane_id"] for p in registry["panes"]}

    # Add unknown live panes
    for lp in live_panes:
        if lp["pane_id"] not in known_ids:
            role, protected = _classify_pane(lp["title"])
            registry["panes"].append({
                "pane_id": lp["pane_id"],
                "role": role,
                "title": lp["title"],
                "protected": protected,
                "owner": None,
            })

    return registry


def _classify_pane(title: str) -> tuple[str, bool]:
    """Classify a pane by its title into (role, protected)."""
    for pattern, (role, protected) in _TITLE_CLASSIFIERS.items():
        if pattern.lower() in title.lower():
            return role, protected
    # Recognize agent role names (e.g. panes created by TeamCreate)
    title_lower = title.lower().strip()
    for role in AGENT_ROLES:
        if title_lower == role or title_lower.endswith(f"-{role}"):
            return role, False
    return "worker", False


def find_idle_worker(registry: dict, live_panes: list[dict]) -> str | None:
    """Find the first idle, non-protected worker pane.

    Returns pane_id or None.
    """
    live_by_id = {p["pane_id"]: p for p in live_panes}

    # Sort by pane_id for predictable ordering
    candidates = sorted(
        [p for p in registry["panes"] if not p["protected"]],
        key=lambda p: p["pane_id"],
    )

    for entry in candidates:
        live = live_by_id.get(entry["pane_id"])
        if live and is_pane_idle(live["command"]):
            return entry["pane_id"]

    return None


def find_split_target(registry: dict, live_panes: list[dict]) -> str | None:
    """Find the best pane to split for a new worker.

    Strategy:
    - Prefer largest non-protected pane by area
    - Bootstrap: if only protected panes exist, split the claude pane
    """
    live_by_id = {p["pane_id"]: p for p in live_panes}

    non_protected = [
        p for p in registry["panes"]
        if not p["protected"] and p["pane_id"] in live_by_id
    ]

    if non_protected:
        # Pick largest by area
        return max(
            non_protected,
            key=lambda p: live_by_id[p["pane_id"]]["width"] * live_by_id[p["pane_id"]]["height"],
        )["pane_id"]

    # Bootstrap: split claude pane
    for p in registry["panes"]:
        if p["role"] == "claude" and p["pane_id"] in live_by_id:
            return p["pane_id"]

    # Fallback: first live pane
    if live_panes:
        return live_panes[0]["pane_id"]

    return None


def choose_direction(width: int, height: int) -> str:
    """Choose split direction based on pane dimensions.

    Returns 'h' for horizontal, 'v' for vertical.
    """
    return "h" if width >= height * 2 else "v"


def resolve_pane_ref(registry: dict, ref: str) -> dict | None:
    """Resolve a pane reference to a registry entry.

    Ref can be:
    - pane_id: '%5'
    - role: 'worker', 'claude', 'tui'
    - title: 'Worker 1'
    """
    for p in registry["panes"]:
        if p["pane_id"] == ref:
            return p
        if p["role"] == ref:
            return p
        if p["title"].lower() == ref.lower():
            return p
    return None


def next_worker_number(registry: dict) -> int:
    """Return the next available worker number."""
    existing = []
    for p in registry["panes"]:
        if p["role"] == "worker" and p["title"].startswith("Worker "):
            try:
                num = int(p["title"].split(" ", 1)[1])
                existing.append(num)
            except (ValueError, IndexError):
                pass
    return max(existing, default=0) + 1
