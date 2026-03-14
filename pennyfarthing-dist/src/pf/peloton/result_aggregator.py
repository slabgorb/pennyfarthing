"""Result aggregator — output collection and scoring for peloton runs.

Collects findings from all phases, aggregates into pipeline.yaml,
and scores against ground truth using an LLM judge.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pf.peloton.workflow_driver import PhaseExecution


@dataclass
class PipelineOutput:
    """Aggregated output from all pipeline phases."""

    scenario_id: str
    run_id: int
    phases: dict[str, PhaseExecution] = field(default_factory=dict)
    output_dir: Path | None = None
    timestamp: str = ""


@dataclass
class ScoreResult:
    """Scoring result from LLM judge comparison."""

    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    matched_findings: list[dict[str, Any]] = field(default_factory=list)
    missed_findings: list[dict[str, Any]] = field(default_factory=list)
    false_positives: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ResultAggregator:
    """Aggregates pipeline output and scores against ground truth."""

    output_base_dir: Path
    scenario_id: str

    def aggregate(self, phases: list[PhaseExecution]) -> dict[str, Any]:
        """Aggregate phase results into a PipelineOutput.

        Creates the output directory structure:
            internal/results/pipeline-replay/<scenario-id>/run-N/

        Returns:
            {success: True, data: PipelineOutput} or {success: False, error: ...}
        """
        raise NotImplementedError("aggregate not implemented")

    def write_pipeline_yaml(self, output: PipelineOutput) -> dict[str, Any]:
        """Write the aggregated pipeline.yaml result file.

        Returns:
            {success: True, data: Path} or {success: False, error: ...}
        """
        raise NotImplementedError("write_pipeline_yaml not implemented")

    def score(
        self,
        output: PipelineOutput,
        ground_truth_path: Path,
        judge_model: str = "claude-sonnet-4-20250514",
    ) -> dict[str, Any]:
        """Score pipeline output against ground truth using LLM judge.

        Returns:
            {success: True, data: ScoreResult} or {success: False, error: ...}
        """
        raise NotImplementedError("score not implemented")

    def write_score_yaml(self, score: ScoreResult, output_dir: Path) -> dict[str, Any]:
        """Write score.yaml with precision/recall metrics.

        Returns:
            {success: True, data: Path} or {success: False, error: ...}
        """
        raise NotImplementedError("write_score_yaml not implemented")

    def next_run_id(self) -> int:
        """Determine the next run ID for a scenario.

        Scans existing run directories and returns max + 1.
        """
        raise NotImplementedError("next_run_id not implemented")
