"""Tests for Story 148-8: Peloton result aggregator.

Covers AC-7 (output aggregation into pipeline.yaml) and AC-8 (LLM judge scoring).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.peloton.result_aggregator import PipelineOutput, ResultAggregator, ScoreResult
from pf.peloton.workflow_driver import PhaseExecution


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def output_dir(tmp_path: Path) -> Path:
    """Create a temp output directory."""
    d = tmp_path / "internal" / "results" / "pipeline-replay"
    d.mkdir(parents=True)
    return d


@pytest.fixture
def aggregator(output_dir: Path) -> ResultAggregator:
    """Create a ResultAggregator."""
    return ResultAggregator(
        output_base_dir=output_dir,
        scenario_id="test-scenario",
    )


@pytest.fixture
def sample_phases() -> list[PhaseExecution]:
    """Sample phase results for aggregation."""
    return [
        PhaseExecution(
            role="tea",
            output="## TEA Assessment\n**Tests Written:** 5 tests covering 3 ACs\n**Status:** RED",
            duration_s=45.2,
            exit_code=0,
            gate_passed=True,
        ),
        PhaseExecution(
            role="dev",
            output="## Dev Assessment\nAll 5 tests passing.\nImplementation complete.",
            duration_s=120.5,
            exit_code=0,
            gate_passed=True,
        ),
        PhaseExecution(
            role="reviewer",
            output="## Reviewer Assessment\n**Verdict:** approved\n3 findings, 0 blocking.",
            duration_s=60.0,
            exit_code=0,
            gate_passed=True,
        ),
    ]


@pytest.fixture
def ground_truth_file(tmp_path: Path) -> Path:
    """Create a ground truth YAML file."""
    gt = tmp_path / "ground-truth.yaml"
    gt.write_text(
        "findings:\n"
        "  - id: F1\n"
        "    title: Missing null check\n"
        "    severity: medium\n"
        "    weight: 2\n"
        "    category: safety\n"
        "    phase_ideal: reviewer\n"
        "    description: No null check on user input\n"
        "  - id: F2\n"
        "    title: Unclosed file handle\n"
        "    severity: high\n"
        "    weight: 3\n"
        "    category: resource-leak\n"
        "    phase_ideal: reviewer\n"
        "    description: File opened but never closed\n"
    )
    return gt


# ---------------------------------------------------------------------------
# AC-7: Output aggregated into pipeline.yaml
# ---------------------------------------------------------------------------


class TestAggregation:
    """AC-7: Phase results collected into PipelineOutput and pipeline.yaml."""

    def test_aggregate_returns_pipeline_output(
        self, aggregator: ResultAggregator, sample_phases: list[PhaseExecution]
    ):
        """aggregate should return a PipelineOutput with all phases."""
        result = aggregator.aggregate(sample_phases)
        assert result["success"] is True
        output = result["data"]
        assert isinstance(output, PipelineOutput)
        assert output.scenario_id == "test-scenario"
        assert "tea" in output.phases
        assert "dev" in output.phases
        assert "reviewer" in output.phases

    def test_aggregate_assigns_run_id(
        self, aggregator: ResultAggregator, sample_phases: list[PhaseExecution]
    ):
        """Each aggregation should get a unique run_id."""
        result = aggregator.aggregate(sample_phases)
        assert result["success"] is True
        assert result["data"].run_id >= 1

    def test_aggregate_creates_output_directory(
        self, aggregator: ResultAggregator, sample_phases: list[PhaseExecution]
    ):
        """Output directory should be created at the expected path."""
        result = aggregator.aggregate(sample_phases)
        assert result["success"] is True
        output = result["data"]
        assert output.output_dir is not None
        # Directory should be under output_base_dir/scenario_id/run-N/
        assert aggregator.scenario_id in str(output.output_dir)

    def test_aggregate_sets_timestamp(
        self, aggregator: ResultAggregator, sample_phases: list[PhaseExecution]
    ):
        """Aggregated output should have a timestamp."""
        result = aggregator.aggregate(sample_phases)
        assert result["success"] is True
        assert result["data"].timestamp != ""

    def test_aggregate_empty_phases_fails(self, aggregator: ResultAggregator):
        """Aggregating with no phases should fail."""
        result = aggregator.aggregate([])
        assert result["success"] is False

    def test_write_pipeline_yaml(
        self, aggregator: ResultAggregator, sample_phases: list[PhaseExecution], tmp_path: Path
    ):
        """write_pipeline_yaml should create the YAML file."""
        output = PipelineOutput(
            scenario_id="test-scenario",
            run_id=1,
            phases={p.role: p for p in sample_phases},
            output_dir=tmp_path / "run-1",
            timestamp="2026-03-14T00:00:00Z",
        )
        (tmp_path / "run-1").mkdir()
        result = aggregator.write_pipeline_yaml(output)
        assert result["success"] is True
        assert isinstance(result["data"], Path)
        assert result["data"].name == "pipeline.yaml"

    def test_next_run_id_increments(self, aggregator: ResultAggregator, output_dir: Path):
        """next_run_id should return max existing + 1."""
        scenario_dir = output_dir / "test-scenario"
        scenario_dir.mkdir()
        (scenario_dir / "run-1").mkdir()
        (scenario_dir / "run-2").mkdir()
        run_id = aggregator.next_run_id()
        assert run_id == 3

    def test_next_run_id_starts_at_one(self, aggregator: ResultAggregator):
        """With no existing runs, next_run_id should return 1."""
        run_id = aggregator.next_run_id()
        assert run_id == 1


# ---------------------------------------------------------------------------
# AC-8: Scoring with LLM judge
# ---------------------------------------------------------------------------


class TestScoring:
    """AC-8: LLM judge compares findings against ground truth."""

    def test_score_returns_score_result(
        self,
        aggregator: ResultAggregator,
        sample_phases: list[PhaseExecution],
        ground_truth_file: Path,
        tmp_path: Path,
    ):
        """score should return a ScoreResult with precision/recall."""
        output = PipelineOutput(
            scenario_id="test-scenario",
            run_id=1,
            phases={p.role: p for p in sample_phases},
            output_dir=tmp_path / "run-1",
            timestamp="2026-03-14T00:00:00Z",
        )
        result = aggregator.score(output, ground_truth_file)
        assert result["success"] is True
        score = result["data"]
        assert isinstance(score, ScoreResult)
        assert 0.0 <= score.precision <= 1.0
        assert 0.0 <= score.recall <= 1.0
        assert 0.0 <= score.f1 <= 1.0

    def test_score_identifies_matched_findings(
        self,
        aggregator: ResultAggregator,
        sample_phases: list[PhaseExecution],
        ground_truth_file: Path,
        tmp_path: Path,
    ):
        """ScoreResult should list which ground truth findings were matched."""
        output = PipelineOutput(
            scenario_id="test-scenario",
            run_id=1,
            phases={p.role: p for p in sample_phases},
            output_dir=tmp_path / "run-1",
            timestamp="2026-03-14T00:00:00Z",
        )
        result = aggregator.score(output, ground_truth_file)
        assert result["success"] is True
        score = result["data"]
        assert isinstance(score.matched_findings, list)
        assert isinstance(score.missed_findings, list)

    def test_write_score_yaml(self, aggregator: ResultAggregator, tmp_path: Path):
        """write_score_yaml should create score.yaml in output dir."""
        score = ScoreResult(
            precision=0.75,
            recall=0.50,
            f1=0.60,
            matched_findings=[{"id": "F1", "title": "Missing null check"}],
            missed_findings=[{"id": "F2", "title": "Unclosed file handle"}],
            false_positives=[],
        )
        out_dir = tmp_path / "run-1"
        out_dir.mkdir()
        result = aggregator.write_score_yaml(score, out_dir)
        assert result["success"] is True
        assert isinstance(result["data"], Path)
        assert result["data"].name == "score.yaml"

    def test_score_with_nonexistent_ground_truth(
        self, aggregator: ResultAggregator, sample_phases: list[PhaseExecution], tmp_path: Path
    ):
        """Should fail gracefully if ground truth file doesn't exist."""
        output = PipelineOutput(
            scenario_id="test-scenario",
            run_id=1,
            phases={p.role: p for p in sample_phases},
            output_dir=tmp_path / "run-1",
        )
        result = aggregator.score(output, tmp_path / "nonexistent.yaml")
        assert result["success"] is False

    def test_perfect_recall_when_all_found(
        self,
        aggregator: ResultAggregator,
        sample_phases: list[PhaseExecution],
        ground_truth_file: Path,
        tmp_path: Path,
    ):
        """If pipeline catches all ground truth findings, recall should be 1.0."""
        # This test validates the scoring logic once implemented
        output = PipelineOutput(
            scenario_id="test-scenario",
            run_id=1,
            phases={p.role: p for p in sample_phases},
            output_dir=tmp_path / "run-1",
        )
        result = aggregator.score(output, ground_truth_file)
        assert result["success"] is True
        score = result["data"]
        if len(score.missed_findings) == 0:
            assert score.recall == 1.0
