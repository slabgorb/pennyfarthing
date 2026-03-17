"""Pane orchestrator — spawning, lifecycle, and coordination of agent panes.

Manages the creation and teardown of tmux panes for each agent role
(TEA, Dev, Reviewer) during a peloton run.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from pf.tmux.panes import kill_pane, set_pane_title, split_pane


def create_peloton_layout(
    session: str,
    registry: dict[str, Any],
    live_panes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Create the peloton layout: TUI pane below CLI.

    TeamCreate spawns its own panes via teammateMode=tmux, so this function
    only handles TUI placement. No agent panes are pre-opened.

    Returns:
        {success: True, data: {cli_pane, tui_pane, registry}}
    """
    # Find CLI and TUI panes
    cli_pane_id = None
    tui_pane_id = None
    for pane in live_panes:
        title = pane.get("title", "")
        if "Claude" in title:
            cli_pane_id = pane["pane_id"]
        elif "TUI" in title:
            tui_pane_id = pane["pane_id"]

    if cli_pane_id is None:
        return {"success": False, "error": "No CLI (Claude Code) pane found in session"}

    # Create TUI pane below CLI if not already present
    if tui_pane_id is None:
        tui_result = split_pane(session, cli_pane_id, "v")
        if not tui_result["success"]:
            return {"success": False, "error": tui_result.get("error", "Failed to create TUI pane")}
        tui_pane_id = tui_result["data"]
        set_pane_title(tui_pane_id, "TUI")

    return {
        "success": True,
        "data": {
            "cli_pane": cli_pane_id,
            "tui_pane": tui_pane_id,
            "registry": registry,
        },
    }


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
    _portrait_info: dict[str, dict[str, Any]] = field(default_factory=dict)

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

            if theme:
                self._try_create_portrait(role, theme, pane)

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

    def get_portrait_pane(self, role: str) -> ManagedPane | None:
        """Get portrait pane for a role, or None if no portrait exists."""
        portrait_role = f"{role}-portrait"
        for p in self.panes:
            if p.role == portrait_role:
                return p
        return None

    def get_portrait_info(self, role: str) -> dict[str, Any] | None:
        """Get portrait metadata for a role (path, theme), or None."""
        return self._portrait_info.get(role)

    def is_pane_idle(self, pane_id: str) -> dict[str, Any]:
        """Check if a pane is idle (at shell prompt).

        Returns:
            {success: True, data: True/False} or {success: False, error: ...}
        """
        if self._use_tmux:
            try:
                from pf.tmux.panes import is_pane_idle as _tmux_idle
                from pf.tmux.panes import list_live_panes

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
        """Create a pane for the given agent role, reusing an existing one if alive."""
        # Check if we already track a pane for this role
        existing = self.get_pane(role)
        if existing is not None:
            return existing

        # Check registry for an alive pane with this role
        reused = self._reuse_registry_pane(role)
        if reused is not None:
            return reused

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

    def _reuse_registry_pane(self, role: str) -> ManagedPane | None:
        """Check the tmux registry for a live pane matching this role."""
        if not self._use_tmux:
            return None
        config = self.project_root / ".pennyfarthing" / "config.local.yaml"
        if not config.exists():
            return None
        try:
            from pf.tmux.panes import list_live_panes
            from pf.tmux.registry import load_registry

            reg_result = load_registry(self.project_root, self.session_name)
            if not reg_result["success"]:
                return None
            live_result = list_live_panes(self.session_name)
            if not live_result["success"]:
                return None
            live_ids = {p["pane_id"] for p in live_result["data"]}
            for entry in reg_result["data"].get("panes", []):
                if entry["role"] == role and entry["pane_id"] in live_ids:
                    pane = ManagedPane(
                        pane_id=entry["pane_id"],
                        role=role,
                        title=entry.get("title", f"{self.story_id}-{role}"),
                        protected=entry.get("protected", False),
                        owner=entry.get("owner", "peloton"),
                    )
                    self.panes.append(pane)
                    return pane
        except Exception:
            logger.debug("Failed to reuse registry pane for role %s", role, exc_info=True)
        return None

    def _try_create_portrait(
        self, role: str, theme: str, agent_pane: ManagedPane
    ) -> None:
        """Attempt to create a portrait pane beside an agent's CLI pane."""
        # Verify agent exists in the project's theme YAML before resolving
        theme_yaml = (
            self.project_root / ".pennyfarthing" / "personas" / "themes" / f"{theme}.yaml"
        )
        if theme_yaml.exists():
            try:
                import yaml

                data = yaml.safe_load(theme_yaml.read_text()) or {}
                if role not in data.get("agents", {}):
                    return
            except Exception:
                return
        else:
            return

        try:
            from pf.tui.portrait_resolver import resolve_portrait_path

            portrait_path = resolve_portrait_path(
                theme=theme,
                agent=role,
                project_root=self.project_root,
                preferred_size="small",
            )
        except Exception:
            return

        if portrait_path is None:
            return

        if self._use_tmux:
            pane_id = self._split_portrait_pane(agent_pane.pane_id)
        else:
            pane_id = _next_pane_id()

        portrait = ManagedPane(
            pane_id=pane_id,
            role=f"{role}-portrait",
            title=f"{self.story_id}-{role}-portrait",
            protected=False,
            owner="peloton",
        )
        self.panes.append(portrait)
        self._portrait_info[role] = {"path": portrait_path, "theme": theme}

    def _split_portrait_pane(self, target_pane_id: str) -> str:
        """Split a pane horizontally for a portrait (<=25% width)."""
        try:
            from pf.tmux.panes import split_pane

            result = split_pane(self.session_name, target_pane_id, "h", 20)
            if result["success"]:
                return result["data"].strip()
        except Exception:
            pass
        return _next_pane_id()

    def _allocate_pane(self, cwd: str | None = None) -> str:
        """Allocate a tmux pane, or generate a mock ID for tests.

        Only creates real tmux panes when running against a real project root
        (has .pennyfarthing/config.local.yaml). Test tmp_paths get mock IDs.
        """
        if self._use_tmux and (self.project_root / ".pennyfarthing" / "config.local.yaml").exists():
            try:
                from pf.tmux.panes import split_pane
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
