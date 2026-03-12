"""Tests for pf.benchmark.integration — Benchmark Integration (Python port).

Ported from: packages/core/src/benchmark/benchmark-integration.test.ts
Plus additional coverage for OCEAN correlation, error-type analysis, and queries.
"""

from __future__ import annotations

import pytest

from pf.benchmark.integration import (
    VALID_DIMENSIONS,
    VALID_ROLES,
    CorrelationResult,
    OceanErrorCorrelation,
    OceanScores,
    OptimalProfile,
    RoleRecommendations,
    calculate_error_type_correlation,
    calculate_ocean_correlation,
    find_top_performers,
    generate_correlation_report,
    generate_ocean_error_heat_map,
    get_optimal_profile,
    get_role_recommendations,
    load_benchmark_data,
    parse_ocean_filter,
    query_benchmarks,
)

# ===========================================================================
# parse_ocean_filter
# ===========================================================================


class TestParseOceanFilter:
    def test_basic_gte(self):
        result = parse_ocean_filter("O>=4")
        assert result["dimension"] == "O"
        assert result["operator"] == ">="
        assert result["value"] == 4

    def test_basic_lte(self):
        result = parse_ocean_filter("C<=2")
        assert result["dimension"] == "C"
        assert result["operator"] == "<="
        assert result["value"] == 2

    def test_equals(self):
        result = parse_ocean_filter("E=3")
        assert result["operator"] == "="

    def test_gt(self):
        result = parse_ocean_filter("A>3")
        assert result["operator"] == ">"

    def test_lt(self):
        result = parse_ocean_filter("N<5")
        assert result["operator"] == "<"

    def test_invalid_dimension_raises(self):
        with pytest.raises((ValueError, Exception)):
            parse_ocean_filter("X>=4")

    def test_invalid_format_raises(self):
        with pytest.raises((ValueError, Exception)):
            parse_ocean_filter("gibberish")


# ===========================================================================
# load_benchmark_data
# ===========================================================================


class TestLoadBenchmarkData:
    def test_returns_list(self):
        results = load_benchmark_data("nonexistent-scenario", "dev")
        assert isinstance(results, list)

    def test_empty_for_nonexistent_scenario(self):
        results = load_benchmark_data("nonexistent-scenario", "dev")
        assert results == []


# ===========================================================================
# calculate_ocean_correlation
# ===========================================================================


class TestCalculateOceanCorrelation:
    def test_returns_correlation_result(self):
        result = calculate_ocean_correlation("nonexistent", "dev")
        assert isinstance(result, CorrelationResult)

    def test_has_all_dimensions(self):
        result = calculate_ocean_correlation("nonexistent", "dev")
        for dim in VALID_DIMENSIONS:
            assert hasattr(result, dim)

    def test_has_strongest(self):
        result = calculate_ocean_correlation("nonexistent", "dev")
        assert "dimension" in result.strongest
        assert "effect" in result.strongest


# ===========================================================================
# get_optimal_profile
# ===========================================================================


class TestGetOptimalProfile:
    def test_returns_optimal_profile(self):
        result = get_optimal_profile("dev")
        assert isinstance(result, OptimalProfile)

    def test_has_ocean_scores(self):
        result = get_optimal_profile("dev")
        assert isinstance(result.ocean, OceanScores)

    def test_invalid_role_raises(self):
        with pytest.raises((ValueError, Exception)):
            get_optimal_profile("invalid-role")

    def test_balanced_when_no_data(self):
        result = get_optimal_profile("dev")
        # With no benchmark data, should return balanced profile
        assert result.ocean.O == 3


# ===========================================================================
# get_role_recommendations
# ===========================================================================


class TestGetRoleRecommendations:
    def test_returns_recommendations(self):
        result = get_role_recommendations("dev")
        assert isinstance(result, RoleRecommendations)
        assert result.role == "dev"

    def test_invalid_role_raises(self):
        with pytest.raises((ValueError, Exception)):
            get_role_recommendations("invalid-role")


# ===========================================================================
# find_top_performers
# ===========================================================================


class TestFindTopPerformers:
    def test_empty_without_scenario(self):
        result = find_top_performers()
        assert result == []

    def test_returns_performer_results(self):
        result = find_top_performers(scenario="nonexistent", role="dev")
        assert isinstance(result, list)


# ===========================================================================
# query_benchmarks
# ===========================================================================


class TestQueryBenchmarks:
    def test_empty_without_scenario(self):
        result = query_benchmarks()
        assert result == []

    def test_returns_list(self):
        result = query_benchmarks(scenario="nonexistent", role="dev")
        assert isinstance(result, list)


# ===========================================================================
# calculate_error_type_correlation
# ===========================================================================


class TestCalculateErrorTypeCorrelation:
    def test_returns_correlation_structure(self):
        result = calculate_error_type_correlation([], [])
        assert isinstance(result, OceanErrorCorrelation)

    def test_has_5x3_matrix(self):
        result = calculate_error_type_correlation([], [])
        for dim in VALID_DIMENSIONS:
            assert dim in result.matrix
            for err in ["reasoning", "planning", "execution"]:
                assert err in result.matrix[dim]

    def test_empty_input_zero_correlations(self):
        result = calculate_error_type_correlation([], [])
        for dim in VALID_DIMENSIONS:
            for err in ["reasoning", "planning", "execution"]:
                assert result.matrix[dim][err].correlation == 0

    def test_has_strongest(self):
        result = calculate_error_type_correlation([], [])
        assert "dimension" in result.strongest
        assert "errorType" in result.strongest
        assert "correlation" in result.strongest


# ===========================================================================
# generate_ocean_error_heat_map
# ===========================================================================


class TestGenerateOceanErrorHeatMap:
    def test_returns_markdown(self):
        corr = calculate_error_type_correlation([], [])
        result = generate_ocean_error_heat_map(corr)
        assert "OCEAN" in result
        assert "Reasoning" in result or "reasoning" in result.lower()

    def test_includes_legend(self):
        corr = calculate_error_type_correlation([], [])
        result = generate_ocean_error_heat_map(corr)
        assert "Legend" in result or "↑" in result


# ===========================================================================
# generate_correlation_report
# ===========================================================================


class TestGenerateCorrelationReport:
    def test_returns_markdown_string(self):
        report = generate_correlation_report("nonexistent", "dev")
        assert isinstance(report, str)
        assert "Correlation" in report or "correlation" in report.lower()


# ===========================================================================
# Constants validation
# ===========================================================================


class TestConstants:
    def test_valid_roles(self):
        assert "dev" in VALID_ROLES
        assert "reviewer" in VALID_ROLES
        assert "sm" in VALID_ROLES
        assert "tea" in VALID_ROLES

    def test_valid_dimensions(self):
        assert VALID_DIMENSIONS == ["O", "C", "E", "A", "N"]
