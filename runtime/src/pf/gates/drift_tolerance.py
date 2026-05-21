"""Configurable drift tolerance — adjust spec-drift thresholds per project.

Loads tolerance settings from config.local.yaml and applies them to
drift scores from spec_drift_precheck to determine pass/warn/fail status.

Story: 150-5
"""

from __future__ import annotations

from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore[assignment]

DEFAULT_CONFIG: dict = {
    "max_score": 20,
    "fail_threshold": 10,
    "warn_threshold": 5,
    "severity_weights": {"low": 1, "medium": 2, "high": 3},
}


def load_drift_config(config_path: str | Path) -> dict:
    """Load drift tolerance settings from config file.

    Reads the `drift_tolerance` section from config YAML.
    Returns DEFAULT_CONFIG if file missing, unreadable, or no drift_tolerance section.

    Args:
        config_path: Path to config.local.yaml or similar YAML config file.

    Returns:
        dict with max_score, fail_threshold, warn_threshold, severity_weights
    """
    path = Path(config_path)
    if not path.exists():
        return dict(DEFAULT_CONFIG)

    try:
        if yaml is None:
            return dict(DEFAULT_CONFIG)

        content = path.read_text()
        data = yaml.safe_load(content)
        if not isinstance(data, dict):
            return dict(DEFAULT_CONFIG)

        drift_section = data.get("drift_tolerance")
        if not isinstance(drift_section, dict):
            return dict(DEFAULT_CONFIG)

        # Merge with defaults — config overrides defaults
        result = dict(DEFAULT_CONFIG)
        if "max_score" in drift_section:
            result["max_score"] = int(drift_section["max_score"])
        if "fail_threshold" in drift_section:
            result["fail_threshold"] = int(drift_section["fail_threshold"])
        if "warn_threshold" in drift_section:
            result["warn_threshold"] = int(drift_section["warn_threshold"])
        if "severity_weights" in drift_section and isinstance(
            drift_section["severity_weights"], dict
        ):
            result["severity_weights"] = {
                **DEFAULT_CONFIG["severity_weights"],
                **drift_section["severity_weights"],
            }

        return result

    except Exception:
        return dict(DEFAULT_CONFIG)


def evaluate_drift(drift_score: int, findings: list, config: dict) -> dict:
    """Evaluate a drift score against configured thresholds.

    Args:
        drift_score: Aggregate drift score from findings.
        findings: List of finding dicts (each with 'severity' key).
        config: Tolerance config (from load_drift_config or DEFAULT_CONFIG).

    Returns:
        {success, data: {status, drift_score, fail_threshold, warn_threshold}, error}
    """
    try:
        fail_threshold = config.get("fail_threshold", DEFAULT_CONFIG["fail_threshold"])
        warn_threshold = config.get("warn_threshold", DEFAULT_CONFIG["warn_threshold"])

        if drift_score > fail_threshold:
            status = "fail"
            success = False
        elif drift_score > warn_threshold:
            status = "warn"
            success = True
        else:
            status = "pass"
            success = True

        return {
            "success": success,
            "data": {
                "status": status,
                "drift_score": drift_score,
                "fail_threshold": fail_threshold,
                "warn_threshold": warn_threshold,
            },
            "error": None,
        }

    except Exception as e:
        return {
            "success": False,
            "data": {"status": "error", "drift_score": drift_score,
                     "fail_threshold": 0, "warn_threshold": 0},
            "error": f"Unexpected error: {e}",
        }


def calculate_weighted_score(findings: list, severity_weights: dict) -> int:
    """Calculate drift score using configurable severity weights.

    Args:
        findings: List of finding dicts (each with 'severity' key).
        severity_weights: Map of severity name to integer weight.

    Returns:
        Integer weighted score. Unknown severities default to weight 1.
    """
    score = 0
    for finding in findings:
        severity = finding.get("severity", "unknown")
        weight = severity_weights.get(severity, 1)
        score += weight
    return score
