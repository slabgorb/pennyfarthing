"""
Core health score analysis engine.

Aggregates lightweight dimension scores into a composite 0-100 score.
Supports caching with a configurable TTL (default 5 minutes).
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from pennyfarthing_scripts.healthscore.models import (
    DEFAULT_WEIGHTS,
    DimensionScore,
    HealthscoreResult,
)


async def analyze_healthscore(
    target_path: Path,
    weights: dict[str, float] | None = None,
    cache_ttl: int = 300,
) -> HealthscoreResult:
    """Analyze codebase health across all dimensions.

    Args:
        target_path: Directory to analyze.
        weights: Custom dimension weights (must sum to 1.0). Uses defaults if None.
        cache_ttl: Cache time-to-live in seconds (default 300 = 5 minutes).

    Returns:
        HealthscoreResult with composite score and per-dimension breakdown.
    """
    w = weights if weights is not None else DEFAULT_WEIGHTS
    resolved = target_path.resolve()

    cache_dir = get_cache_path(resolved)
    any_cached = False
    raw_scores: dict[str, float | None] = {}
    dimensions: list[DimensionScore] = []

    for dim_name, dim_weight in w.items():
        score: float | None = None
        error: str | None = None

        # Try cache if ttl > 0
        if cache_ttl > 0:
            cached = read_cached_score(cache_dir, dim_name, cache_ttl)
            if cached is not None:
                score = cached
                any_cached = True

        # If no cached value, run lightweight probe
        if score is None:
            score = _probe_dimension(dim_name, resolved)
            # Cache result if we got one and caching is enabled
            if score is not None and cache_ttl > 0:
                cache_dir.mkdir(parents=True, exist_ok=True)
                write_cached_score(cache_dir, dim_name, score)

        if score is None:
            error = f"{dim_name} not available"

        raw_scores[dim_name] = score
        dimensions.append(DimensionScore(
            name=dim_name,
            score=score,
            weight=dim_weight,
            error=error,
        ))

    composite = compute_composite_score(raw_scores, w)

    return HealthscoreResult(
        success=True,
        composite_score=composite,
        target_path=str(resolved),
        dimensions=dimensions,
        cached=any_cached,
    )


def _probe_dimension(name: str, target_path: Path) -> float | None:
    """Run a lightweight probe for a single dimension.

    Returns a score 0-100 or None if the dimension cannot be assessed.
    These are intentionally simple heuristics — full analysis is deferred
    to each dimension's own module when available.
    """
    # For now, return None for all dimensions.
    # Each dimension will be wired to its respective analyzer in future stories.
    return None


def compute_composite_score(
    dimension_scores: dict[str, float | None],
    weights: dict[str, float],
) -> float:
    """Compute weighted average from dimension scores.

    Dimensions with None scores are excluded and remaining weights
    are renormalized.

    Args:
        dimension_scores: Map of dimension name to score (0-100 or None).
        weights: Map of dimension name to weight.

    Returns:
        Composite score 0-100.
    """
    total_weight = 0.0
    weighted_sum = 0.0

    for name, score in dimension_scores.items():
        if score is not None:
            w = weights.get(name, 0.0)
            weighted_sum += score * w
            total_weight += w

    if total_weight == 0.0:
        return 0.0

    return weighted_sum / total_weight


def get_cache_path(target_path: Path) -> Path:
    """Return the cache directory for a given target path."""
    path_hash = hashlib.md5(str(target_path).encode()).hexdigest()[:12]
    return target_path / ".pennyfarthing" / ".cache" / "healthscore" / path_hash


def read_cached_score(cache_dir: Path, dimension: str, ttl: int) -> float | None:
    """Read a cached dimension score if still valid.

    Returns None if cache miss or expired.
    """
    cache_file = cache_dir / f"{dimension}.json"
    if not cache_file.exists():
        return None

    try:
        data = json.loads(cache_file.read_text())
    except (json.JSONDecodeError, OSError):
        return None

    ts = data.get("timestamp", 0)
    if ttl <= 0 or (time.time() - ts) > ttl:
        return None

    return data.get("score")


def write_cached_score(cache_dir: Path, dimension: str, score: float) -> None:
    """Write a dimension score to cache."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{dimension}.json"
    data = {"score": score, "timestamp": time.time()}
    cache_file.write_text(json.dumps(data))
