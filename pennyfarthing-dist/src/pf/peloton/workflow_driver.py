"""Workflow driver — phase execution and gate resolution for peloton runs.

Drives the TDD workflow through each phase: TEA (red) → Dev (green) →
Reviewer (review), coordinating handoffs via gate resolution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pf.peloton.pane_orchestrator import PaneOrchestrator


@dataclass
class PhaseConfig:
    """Configuration for a single phase execution."""

    role: str  # "tea", "dev", "reviewer"
    prompt: str  # The agent prompt to inject
    timeout_s: int = 600
    gate_type: str | None = None  # Gate to resolve after phase


@dataclass
class PhaseExecution:
    """Result of executing a single phase."""

    role: str
    output: str
    duration_s: float
    exit_code: int
    gate_passed: bool | None = None


@dataclass
class WorkflowDriver:
    """Drives the TDD workflow through tmux panes."""

    orchestrator: PaneOrchestrator
    session_file: Path
    phases: list[PhaseConfig] = field(default_factory=list)
    results: list[PhaseExecution] = field(default_factory=list)

    def load_scenario(self, scenario_path: Path) -> dict[str, Any]:
        """Load a peloton scenario YAML and configure phases.

        Args:
            scenario_path: Path to scenario YAML file

        Returns:
            {success: True, data: {phases: [...], story_id: ...}} or {success: False, error: ...}
        """
        raise NotImplementedError("load_scenario not implemented")

    def inject_prompt(self, role: str, prompt: str) -> dict[str, Any]:
        """Inject an agent prompt into the role's pane.

        Uses `pf tmux send` to deliver the prompt.

        Returns:
            {success: True} or {success: False, error: ...}
        """
        raise NotImplementedError("inject_prompt not implemented")

    def execute_phase(self, config: PhaseConfig) -> dict[str, Any]:
        """Execute a single phase in its designated pane.

        1. Inject prompt into pane
        2. Wait for pane to become idle
        3. Capture output
        4. Run gate resolution if configured

        Returns:
            {success: True, data: PhaseExecution} or {success: False, error: ...}
        """
        raise NotImplementedError("execute_phase not implemented")

    def resolve_gate(self, phase: PhaseConfig) -> dict[str, Any]:
        """Resolve the gate for a completed phase.

        Uses `pf handoff resolve-gate` and `pf handoff complete-phase`.

        Returns:
            {success: True, data: {gate_passed: True}} or {success: False, error: ...}
        """
        raise NotImplementedError("resolve_gate not implemented")

    def write_phase_marker(self, role: str) -> dict[str, Any]:
        """Write a BikeLane phase marker to the session file.

        Returns:
            {success: True} or {success: False, error: ...}
        """
        raise NotImplementedError("write_phase_marker not implemented")

    def run_all(self) -> dict[str, Any]:
        """Run all configured phases sequentially.

        Returns:
            {success: True, data: [PhaseExecution, ...]} or {success: False, error: ...}
        """
        raise NotImplementedError("run_all not implemented")

    def prepare_next_phase_context(
        self, completed: PhaseExecution, next_phase: PhaseConfig
    ) -> dict[str, Any]:
        """Prepare context for the next phase based on completed phase output.

        E.g., extract test failures from TEA output for Dev phase.

        Returns:
            {success: True, data: "context string"} or {success: False, error: ...}
        """
        raise NotImplementedError("prepare_next_phase_context not implemented")
