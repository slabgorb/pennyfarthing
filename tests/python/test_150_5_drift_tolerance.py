"""Tests for configurable drift tolerance.

Story: 150-5 (Configurable drift tolerance — adjust spec-drift thresholds per project)

Tests the drift tolerance configuration that:
1. Loads tolerance settings from config
2. Applies thresholds to drift scores to determine pass/warn/fail
3. Supports per-severity weight overrides
4. Uses sensible defaults when no config exists
5. Integrates with spec_drift_precheck via evaluate_drift()

Run with: python -m pytest tests/python/test_150_5_drift_tolerance.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_config(tmp_path):
    """Factory: write config YAML to a temp file and return its path."""

    def _write(content: str, name: str = "config.local.yaml") -> Path:
        p = tmp_path / name
        p.write_text(textwrap.dedent(content))
        return p

    return _write


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

MINIMAL_CONFIG = """\
theme: dune
"""

CONFIG_WITH_DRIFT = """\
theme: dune
drift_tolerance:
  max_score: 10
  fail_threshold: 8
  warn_threshold: 4
"""

CONFIG_WITH_WEIGHTS = """\
theme: dune
drift_tolerance:
  max_score: 15
  severity_weights:
    low: 1
    medium: 3
    high: 5
"""

CONFIG_ZERO_TOLERANCE = """\
theme: dune
drift_tolerance:
  max_score: 0
  fail_threshold: 0
  warn_threshold: 0
"""


# =============================================================================
# AC-1: load_drift_config() reads tolerance settings from config
# =============================================================================


class TestLoadDriftConfig:
    """AC-1: Load drift tolerance settings from config file."""

    def test_import(self):
        from pf.gates.drift_tolerance import load_drift_config
        assert callable(load_drift_config)

    def test_returns_dict(self, tmp_config):
        from pf.gates.drift_tolerance import load_drift_config
        config_path = tmp_config(CONFIG_WITH_DRIFT)
        result = load_drift_config(config_path)
        assert isinstance(result, dict)

    def test_has_max_score(self, tmp_config):
        from pf.gates.drift_tolerance import load_drift_config
        config_path = tmp_config(CONFIG_WITH_DRIFT)
        result = load_drift_config(config_path)
        assert result["max_score"] == 10

    def test_has_fail_threshold(self, tmp_config):
        from pf.gates.drift_tolerance import load_drift_config
        config_path = tmp_config(CONFIG_WITH_DRIFT)
        result = load_drift_config(config_path)
        assert result["fail_threshold"] == 8

    def test_has_warn_threshold(self, tmp_config):
        from pf.gates.drift_tolerance import load_drift_config
        config_path = tmp_config(CONFIG_WITH_DRIFT)
        result = load_drift_config(config_path)
        assert result["warn_threshold"] == 4

    def test_defaults_when_no_drift_section(self, tmp_config):
        from pf.gates.drift_tolerance import load_drift_config, DEFAULT_CONFIG
        config_path = tmp_config(MINIMAL_CONFIG)
        result = load_drift_config(config_path)
        assert result == DEFAULT_CONFIG

    def test_defaults_when_file_missing(self):
        from pf.gates.drift_tolerance import load_drift_config, DEFAULT_CONFIG
        result = load_drift_config("/nonexistent/config.yaml")
        assert result == DEFAULT_CONFIG

    def test_custom_severity_weights(self, tmp_config):
        from pf.gates.drift_tolerance import load_drift_config
        config_path = tmp_config(CONFIG_WITH_WEIGHTS)
        result = load_drift_config(config_path)
        assert result["severity_weights"]["high"] == 5
        assert result["severity_weights"]["medium"] == 3


# =============================================================================
# AC-2: evaluate_drift() applies thresholds to drift score
# =============================================================================


class TestEvaluateDrift:
    """AC-2: Evaluate a drift score against configured thresholds."""

    def test_import(self):
        from pf.gates.drift_tolerance import evaluate_drift
        assert callable(evaluate_drift)

    def test_returns_result_dict(self):
        from pf.gates.drift_tolerance import evaluate_drift, DEFAULT_CONFIG
        result = evaluate_drift(0, [], DEFAULT_CONFIG)
        assert "success" in result
        assert "data" in result
        assert "error" in result

    def test_zero_score_passes(self):
        from pf.gates.drift_tolerance import evaluate_drift, DEFAULT_CONFIG
        result = evaluate_drift(0, [], DEFAULT_CONFIG)
        assert result["success"] is True
        assert result["data"]["status"] == "pass"

    def test_score_above_fail_threshold(self):
        from pf.gates.drift_tolerance import evaluate_drift
        config = {"max_score": 10, "fail_threshold": 8, "warn_threshold": 4,
                  "severity_weights": {"low": 1, "medium": 2, "high": 3}}
        result = evaluate_drift(9, [{"severity": "high"}], config)
        assert result["success"] is False
        assert result["data"]["status"] == "fail"

    def test_score_in_warn_range(self):
        from pf.gates.drift_tolerance import evaluate_drift
        config = {"max_score": 10, "fail_threshold": 8, "warn_threshold": 4,
                  "severity_weights": {"low": 1, "medium": 2, "high": 3}}
        result = evaluate_drift(5, [{"severity": "medium"}], config)
        assert result["success"] is True
        assert result["data"]["status"] == "warn"

    def test_score_below_warn_passes(self):
        from pf.gates.drift_tolerance import evaluate_drift
        config = {"max_score": 10, "fail_threshold": 8, "warn_threshold": 4,
                  "severity_weights": {"low": 1, "medium": 2, "high": 3}}
        result = evaluate_drift(2, [{"severity": "low"}], config)
        assert result["success"] is True
        assert result["data"]["status"] == "pass"

    def test_result_includes_score(self):
        from pf.gates.drift_tolerance import evaluate_drift, DEFAULT_CONFIG
        result = evaluate_drift(5, [], DEFAULT_CONFIG)
        assert result["data"]["drift_score"] == 5

    def test_result_includes_thresholds(self):
        from pf.gates.drift_tolerance import evaluate_drift
        config = {"max_score": 10, "fail_threshold": 8, "warn_threshold": 4,
                  "severity_weights": {"low": 1, "medium": 2, "high": 3}}
        result = evaluate_drift(5, [], config)
        assert result["data"]["fail_threshold"] == 8
        assert result["data"]["warn_threshold"] == 4


# =============================================================================
# AC-3: DEFAULT_CONFIG provides sensible defaults
# =============================================================================


class TestDefaultConfig:
    """AC-3: DEFAULT_CONFIG constant has sensible defaults for all fields."""

    def test_default_exists(self):
        from pf.gates.drift_tolerance import DEFAULT_CONFIG
        assert isinstance(DEFAULT_CONFIG, dict)

    def test_default_has_max_score(self):
        from pf.gates.drift_tolerance import DEFAULT_CONFIG
        assert "max_score" in DEFAULT_CONFIG
        assert isinstance(DEFAULT_CONFIG["max_score"], int)
        assert DEFAULT_CONFIG["max_score"] > 0

    def test_default_has_fail_threshold(self):
        from pf.gates.drift_tolerance import DEFAULT_CONFIG
        assert "fail_threshold" in DEFAULT_CONFIG
        assert isinstance(DEFAULT_CONFIG["fail_threshold"], int)

    def test_default_has_warn_threshold(self):
        from pf.gates.drift_tolerance import DEFAULT_CONFIG
        assert "warn_threshold" in DEFAULT_CONFIG
        assert isinstance(DEFAULT_CONFIG["warn_threshold"], int)

    def test_default_has_severity_weights(self):
        from pf.gates.drift_tolerance import DEFAULT_CONFIG
        assert "severity_weights" in DEFAULT_CONFIG
        weights = DEFAULT_CONFIG["severity_weights"]
        assert "low" in weights
        assert "medium" in weights
        assert "high" in weights

    def test_fail_threshold_gte_warn(self):
        from pf.gates.drift_tolerance import DEFAULT_CONFIG
        assert DEFAULT_CONFIG["fail_threshold"] >= DEFAULT_CONFIG["warn_threshold"]


# =============================================================================
# AC-4: calculate_weighted_score() uses configurable weights
# =============================================================================


class TestCalculateWeightedScore:
    """AC-4: Calculate drift score using configurable severity weights."""

    def test_import(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        assert callable(calculate_weighted_score)

    def test_empty_findings(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        weights = {"low": 1, "medium": 2, "high": 3}
        assert calculate_weighted_score([], weights) == 0

    def test_single_low(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        weights = {"low": 1, "medium": 2, "high": 3}
        findings = [{"severity": "low"}]
        assert calculate_weighted_score(findings, weights) == 1

    def test_single_high(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        weights = {"low": 1, "medium": 2, "high": 3}
        findings = [{"severity": "high"}]
        assert calculate_weighted_score(findings, weights) == 3

    def test_custom_weights(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        weights = {"low": 1, "medium": 3, "high": 5}
        findings = [{"severity": "high"}, {"severity": "medium"}]
        assert calculate_weighted_score(findings, weights) == 8

    def test_mixed_severities(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        weights = {"low": 1, "medium": 2, "high": 3}
        findings = [{"severity": "low"}, {"severity": "medium"}, {"severity": "high"}]
        assert calculate_weighted_score(findings, weights) == 6

    def test_unknown_severity_uses_default(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        weights = {"low": 1, "medium": 2, "high": 3}
        findings = [{"severity": "critical"}]
        # Unknown severity should default to 1
        assert calculate_weighted_score(findings, weights) == 1


# =============================================================================
# AC-5: Zero-tolerance mode
# =============================================================================


class TestZeroTolerance:
    """AC-5: Zero-tolerance config fails on any findings."""

    def test_zero_tolerance_fails_on_any_score(self):
        from pf.gates.drift_tolerance import evaluate_drift
        config = {"max_score": 0, "fail_threshold": 0, "warn_threshold": 0,
                  "severity_weights": {"low": 1, "medium": 2, "high": 3}}
        result = evaluate_drift(1, [{"severity": "low"}], config)
        assert result["success"] is False
        assert result["data"]["status"] == "fail"

    def test_zero_tolerance_passes_on_zero(self):
        from pf.gates.drift_tolerance import evaluate_drift
        config = {"max_score": 0, "fail_threshold": 0, "warn_threshold": 0,
                  "severity_weights": {"low": 1, "medium": 2, "high": 3}}
        result = evaluate_drift(0, [], config)
        assert result["success"] is True

    def test_load_zero_tolerance_config(self, tmp_config):
        from pf.gates.drift_tolerance import load_drift_config
        config_path = tmp_config(CONFIG_ZERO_TOLERANCE)
        result = load_drift_config(config_path)
        assert result["fail_threshold"] == 0


# =============================================================================
# AC-6: Never throws — return-results pattern
# =============================================================================


class TestNeverThrows:
    """AC-6: All functions follow return-results pattern."""

    def test_evaluate_drift_never_throws(self):
        from pf.gates.drift_tolerance import evaluate_drift
        # Garbage inputs should not raise
        result = evaluate_drift(-1, [], {})
        assert isinstance(result, dict)
        assert "success" in result

    def test_load_config_never_throws(self):
        from pf.gates.drift_tolerance import load_drift_config
        result = load_drift_config("/nonexistent/path")
        assert isinstance(result, dict)

    def test_calculate_weighted_score_never_throws(self):
        from pf.gates.drift_tolerance import calculate_weighted_score
        # Empty weights dict
        result = calculate_weighted_score([{"severity": "high"}], {})
        assert isinstance(result, int)

    def test_evaluate_with_missing_config_keys(self):
        from pf.gates.drift_tolerance import evaluate_drift
        # Partial config — should use defaults for missing keys
        result = evaluate_drift(5, [], {"max_score": 10})
        assert isinstance(result, dict)
        assert "success" in result
