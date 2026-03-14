"""Pane orchestrator — spawning, lifecycle, and coordination of agent panes.

Manages the creation and teardown of tmux panes for each agent role
(TEA, Dev, Reviewer) during a peloton run.
"""

from __future__ import annotations

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


@dataclass
class PaneOrchestrator:
    """Orchestrates tmux pane lifecycle for peloton runs."""

    project_root: Path
    session_name: str
    story_id: str
    panes: list[ManagedPane] = field(default_factory=list)

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
        raise NotImplementedError("spawn_agent_panes not implemented")

    def spawn_worker_pane(self, title: str, cwd: str | None = None) -> dict[str, Any]:
        """Spawn a utility worker pane.

        Returns:
            {success: True, data: ManagedPane} or {success: False, error: ...}
        """
        raise NotImplementedError("spawn_worker_pane not implemented")

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
        raise NotImplementedError("is_pane_idle not implemented")

    def wait_for_idle(self, pane_id: str, timeout_s: int = 300) -> dict[str, Any]:
        """Wait for a pane to become idle.

        Returns:
            {success: True} or {success: False, error: "timeout"}
        """
        raise NotImplementedError("wait_for_idle not implemented")

    def capture_output(self, pane_id: str) -> dict[str, Any]:
        """Capture the current output of a pane.

        Returns:
            {success: True, data: "output text"} or {success: False, error: ...}
        """
        raise NotImplementedError("capture_output not implemented")

    def teardown(self) -> dict[str, Any]:
        """Kill all non-protected panes created by this orchestrator.

        Returns:
            {success: True, data: {killed: [...], skipped: [...]}}
        """
        raise NotImplementedError("teardown not implemented")

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
