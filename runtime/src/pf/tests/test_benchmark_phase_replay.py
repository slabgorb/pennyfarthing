"""Tests for single-phase replay feature.

Tests the ``pf benchmark replay phase`` command's supporting functions:
- _next_retry_number: finds next retry suffix
- _compute_retry_majority_vote: majority vote across retry judge passes
- run_phase_replay: orchestration (mocked subprocess calls)
"""

from __future__ import annotations

import pytest
import yaml

from pf.benchmark.pipeline_replay import (
    Finding,
    Scenario,
    _compute_retry_majority_vote,
    _next_retry_number,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_run_dir(tmp_path):
    """Create a minimal run directory with pipeline.yaml."""
    run_dir = tmp_path / "dpgd-116" / "control" / "run-19"
    run_dir.mkdir(parents=True)

    pipeline_meta = {
        "scenario_id": "dpgd-116",
        "theme": None,
        "run_id": 19,
        "timestamp": "2026-03-12T15:17:00Z",
        "model_requested": "opus",
        "worktree_path": "/tmp/pf-replay/dpgd-116-control-run-19",
        "phases": {
            "tea": {"duration_s": 800, "exit_code": 0, "token_usage": {}, "cost_usd": 3.0},
            "dev": {"duration_s": 500, "exit_code": 0, "token_usage": {}, "cost_usd": 3.0},
            "reviewer": {"duration_s": 375, "exit_code": 0, "token_usage": {}, "cost_usd": 2.7},
        },
    }
    (run_dir / "pipeline.yaml").write_text(
        yaml.dump(pipeline_meta, default_flow_style=False)
    )
    (run_dir / "reviewer-output.txt").write_text("VERDICT: APPROVE\nLooks good.")
    (run_dir / "tea-output.txt").write_text("Tests written.")
    (run_dir / "dev-output.txt").write_text("Implementation done.")
    return run_dir


@pytest.fixture
def sample_scenario():
    """Create a minimal Scenario for testing."""
    return Scenario(
        id="dpgd-116",
        title="Test scenario",
        story_id="DPGD-116",
        jira="DPGD-116",
        repo_path="/tmp/fake-repo",
        base_commit="abc123",
        branch="main",
        context_epic_path="",
        context_story_path="",
        session_archive_path=None,
        phases=["tea", "dev", "reviewer"],
        ground_truth=[
            Finding(
                id="I1", title="Issue 1", severity="high",
                weight=5, category="security", phase_ideal="reviewer",
                description="A security issue",
            ),
            Finding(
                id="I2", title="Issue 2", severity="medium",
                weight=3, category="quality", phase_ideal="tea",
                description="A quality issue",
            ),
        ],
        total_weight=8,
        phase_prompts={"reviewer": "Review this code."},
        context_type="repo",
    )


# ---------------------------------------------------------------------------
# _next_retry_number
# ---------------------------------------------------------------------------


class TestNextRetryNumber:
    def test_no_existing_retries(self, tmp_run_dir):
        assert _next_retry_number(tmp_run_dir, "reviewer") == 1

    def test_one_existing_retry(self, tmp_run_dir):
        (tmp_run_dir / "reviewer-output-retry-1.txt").write_text("retry 1")
        assert _next_retry_number(tmp_run_dir, "reviewer") == 2

    def test_multiple_existing_retries(self, tmp_run_dir):
        (tmp_run_dir / "reviewer-output-retry-1.txt").write_text("retry 1")
        (tmp_run_dir / "reviewer-output-retry-2.txt").write_text("retry 2")
        (tmp_run_dir / "reviewer-output-retry-3.txt").write_text("retry 3")
        assert _next_retry_number(tmp_run_dir, "reviewer") == 4

    def test_different_phase_not_counted(self, tmp_run_dir):
        (tmp_run_dir / "tea-output-retry-1.txt").write_text("tea retry")
        assert _next_retry_number(tmp_run_dir, "reviewer") == 1

    def test_non_sequential_retries(self, tmp_run_dir):
        (tmp_run_dir / "reviewer-output-retry-1.txt").write_text("retry 1")
        (tmp_run_dir / "reviewer-output-retry-5.txt").write_text("retry 5")
        assert _next_retry_number(tmp_run_dir, "reviewer") == 6


# ---------------------------------------------------------------------------
# _compute_retry_majority_vote
# ---------------------------------------------------------------------------


class TestComputeRetryMajorityVote:
    def test_unanimous_caught(self, sample_scenario):
        scores = [
            {
                "score_pct": 62.5,
                "findings": [
                    {"finding_id": "I1", "caught": True, "caught_by": "reviewer", "evidence": "found it"},
                    {"finding_id": "I2", "caught": True, "caught_by": "tea", "evidence": "tested it"},
                ],
            },
            {
                "score_pct": 62.5,
                "findings": [
                    {"finding_id": "I1", "caught": True, "caught_by": "reviewer", "evidence": "found"},
                    {"finding_id": "I2", "caught": True, "caught_by": "tea", "evidence": "tested"},
                ],
            },
            {
                "score_pct": 62.5,
                "findings": [
                    {"finding_id": "I1", "caught": True, "caught_by": "reviewer", "evidence": "yes"},
                    {"finding_id": "I2", "caught": True, "caught_by": "tea", "evidence": "yes"},
                ],
            },
        ]
        mv = _compute_retry_majority_vote(scores, sample_scenario, retry_num=1)
        assert mv["score_pct"] == 100.0
        assert mv["total_caught"] == 2
        assert mv["retry_num"] == 1
        assert mv["n_judges"] == 3

    def test_split_vote(self, sample_scenario):
        scores = [
            {
                "score_pct": 62.5,
                "findings": [
                    {"finding_id": "I1", "caught": True, "caught_by": "reviewer", "evidence": "yes"},
                    {"finding_id": "I2", "caught": False},
                ],
            },
            {
                "score_pct": 0,
                "findings": [
                    {"finding_id": "I1", "caught": False},
                    {"finding_id": "I2", "caught": False},
                ],
            },
            {
                "score_pct": 62.5,
                "findings": [
                    {"finding_id": "I1", "caught": True, "caught_by": "reviewer", "evidence": "yes"},
                    {"finding_id": "I2", "caught": True, "caught_by": "dev", "evidence": "yes"},
                ],
            },
        ]
        mv = _compute_retry_majority_vote(scores, sample_scenario, retry_num=2)
        # I1: 2/3 caught (majority), I2: 1/3 caught (not majority)
        assert mv["total_caught"] == 1
        assert mv["weighted_caught"] == 5  # Only I1 (weight 5)
        assert mv["score_pct"] == 62.5

    def test_all_missed(self, sample_scenario):
        scores = [
            {"score_pct": 0, "findings": [
                {"finding_id": "I1", "caught": False},
                {"finding_id": "I2", "caught": False},
            ]},
            {"score_pct": 0, "findings": [
                {"finding_id": "I1", "caught": False},
                {"finding_id": "I2", "caught": False},
            ]},
        ]
        mv = _compute_retry_majority_vote(scores, sample_scenario, retry_num=1)
        assert mv["score_pct"] == 0.0
        assert mv["total_caught"] == 0


# ---------------------------------------------------------------------------
# CLI command registration
# ---------------------------------------------------------------------------


class TestPhaseReplayCliRegistered:
    def test_phase_command_exists(self):
        """Verify the phase command is registered in the replay group."""
        from pf.benchmark.cli import replay
        cmd_names = [c.name for c in replay.commands.values()]
        assert "phase" in cmd_names

    def test_phase_command_params(self):
        """Verify the phase command has the expected parameters."""
        from pf.benchmark.cli import replay
        phase_cmd = replay.commands["phase"]
        param_names = [p.name for p in phase_cmd.params]
        assert "scenario_path" in param_names
        assert "run_num" in param_names
        assert "phase_name" in param_names
        assert "rejudge" in param_names
        assert "keep_worktree" in param_names
