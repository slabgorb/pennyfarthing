"""Pane orchestrator — spawning, lifecycle, and coordination of agent panes.

Manages the creation and teardown of tmux panes for each agent role
(TEA, Dev, Reviewer) during a peloton run.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PaneSpec:
    """Specification for a pane to create."""

    role: str  # "tea", "dev", "reviewer", "worker"
    title: str
    protected: bool = False
    owner: str | None = None
    cwd: str | None = None


@dataclass
class ManagedPane:
    """A pane that has been created and registered."""

    pane_id: str
    role: str
    title: str
    protected: bool
    owner: str | None


# Counter for generating unique pane IDs when tmux is unavailable (tests)
_pane_counter = 0


def _next_pane_id() -> str:
    """Generate a unique pane ID."""
    global _pane_counter
    _pane_counter += 1
    return f"%{_pane_counter}"


@dataclass
class PaneOrchestrator:
    """Orchestrates tmux pane lifecycle for peloton runs."""

    project_root: Path
    session_name: str
    story_id: str
    panes: list[ManagedPane] = field(default_factory=list)
    _use_tmux: bool = True

    def spawn_agent_panes(
        self,
        scenario_phases: list[str],
        theme: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        """Spawn dedicated panes for each agent role in the scenario.

        Args:
            scenario_phases: List of phase names (e.g. ["tea", "dev", "reviewer"])
            theme: Optional theme override
            model: Optional model override

        Returns:
            {success: True, data: {role: ManagedPane, ...}} or {success: False, error: ...}
        """
        if not scenario_phases:
            return {"success": False, "error": "No phases specified"}

        result: dict[str, ManagedPane] = {}
        for role in scenario_phases:
            pane = self._create_pane(role)
            if pane is None:
                return {"success": False, "error": f"Failed to create pane for {role}"}
            result[role] = pane

        return {"success": True, "data": result}

    def spawn_worker_pane(self, title: str, cwd: str | None = None) -> dict[str, Any]:
        """Spawn a utility worker pane.

        Returns:
            {success: True, data: ManagedPane} or {success: False, error: ...}
        """
        pane_id = self._allocate_pane(cwd)
        pane = ManagedPane(
            pane_id=pane_id,
            role="worker",
            title=title,
            protected=False,
            owner="peloton",
        )
        self.panes.append(pane)
        return {"success": True, "data": pane}

    def get_pane(self, role: str) -> ManagedPane | None:
        """Get managed pane by role."""
        for p in self.panes:
            if p.role == role:
                return p
        return None

    def is_pane_idle(self, pane_id: str) -> dict[str, Any]:
        """Check if a pane is idle (at shell prompt).

        Returns:
            {success: True, data: True/False} or {success: False, error: ...}
        """
        if self._use_tmux:
            try:
                from pf.tmux.panes import is_pane_idle as _tmux_idle, list_live_panes

                live_result = list_live_panes(self.session_name)
                if not live_result["success"]:
                    # Fallback: assume idle in test/non-tmux context
                    return {"success": True, "data": True}
                for lp in live_result["data"]:
                    if lp["pane_id"] == pane_id:
                        return {"success": True, "data": _tmux_idle(lp["command"])}
                return {"success": True, "data": True}
            except Exception:
                return {"success": True, "data": True}
        return {"success": True, "data": True}

    def wait_for_idle(self, pane_id: str, timeout_s: int = 300) -> dict[str, Any]:
        """Wait for a pane to become idle.

        Returns:
            {success: True} or {success: False, error: "timeout"}
        """
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            result = self.is_pane_idle(pane_id)
            if not result["success"]:
                return result
            if result["data"]:
                return {"success": True}
            time.sleep(1)
        return {"success": False, "error": "Timeout waiting for pane to become idle"}

    def capture_output(self, pane_id: str) -> dict[str, Any]:
        """Capture the current output of a pane.

        Returns:
            {success: True, data: "output text"} or {success: False, error: ...}
        """
        if self._use_tmux:
            try:
                from pf.tmux.panes import capture_pane

                result = capture_pane(pane_id)
                if result["success"]:
                    return {"success": True, "data": result.get("data", "")}
                return {"success": True, "data": ""}
            except Exception:
                return {"success": True, "data": ""}
        return {"success": True, "data": ""}

    def teardown(self) -> dict[str, Any]:
        """Kill all non-protected panes created by this orchestrator.

        Returns:
            {success: True, data: {killed: [...], skipped: [...]}}
        """
        killed = []
        skipped = []
        for pane in self.panes:
            if pane.protected:
                skipped.append(pane.pane_id)
                continue
            if self._use_tmux:
                try:
                    from pf.tmux.panes import kill_pane

                    kill_pane(pane.pane_id)
                except Exception:
                    pass
            killed.append(pane.pane_id)

        self.panes = [p for p in self.panes if p.protected]
        return {"success": True, "data": {"killed": killed, "skipped": skipped}}

    def get_registry_entries(self) -> list[dict[str, Any]]:
        """Get registry entries for all managed panes."""
        return [
            {
                "pane_id": p.pane_id,
                "role": p.role,
                "title": p.title,
                "protected": p.protected,
                "owner": p.owner,
            }
            for p in self.panes
        ]

    def _create_pane(self, role: str) -> ManagedPane | None:
        """Create a pane for the given agent role."""
        title = f"{self.story_id}-{role}"
        pane_id = self._allocate_pane()
        pane = ManagedPane(
            pane_id=pane_id,
            role=role,
            title=title,
            protected=False,
            owner="peloton",
        )
        self.panes.append(pane)
        return pane

    def _allocate_pane(self, cwd: str | None = None) -> str:
        """Allocate a tmux pane, or generate a mock ID for tests.

        Only creates real tmux panes when running against a real project root
        (has .pennyfarthing/config.local.yaml). Test tmp_paths get mock IDs.
        """
        if self._use_tmux and (self.project_root / ".pennyfarthing" / "config.local.yaml").exists():
            try:
                from pf.tmux.panes import get_session_name, split_pane
                from pf.tmux.registry import find_split_target, load_registry

                reg_result = load_registry(self.project_root, self.session_name)
                if reg_result["success"]:
                    from pf.tmux.panes import list_live_panes

                    live_result = list_live_panes(self.session_name)
                    if live_result["success"]:
                        target = find_split_target(reg_result["data"], live_result["data"])
                        if target:
                            split_result = split_pane(
                                self.session_name, target, "h", 50, cwd
                            )
                            if split_result["success"]:
                                return split_result["data"].strip()
            except Exception:
                pass
        # Fallback: generate unique ID for test mode
        return _next_pane_id()
