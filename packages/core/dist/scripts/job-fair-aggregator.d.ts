/**
 * Job-Fair Aggregator Module
 *
 * Story 7-4: Aggregate Job-Fair Results into Benchmark Statistics
 * Story 7-5: Add Persona Differential Dimensions to Benchmarking
 *
 * Aggregates job-fair results across multiple themes into unified benchmark
 * statistics with historical trend tracking and dimension-based analysis.
 *
 * Design decisions (from brainstorm):
 * - Latest run per theme only (avoids duplicate counting)
 * - Single-pass with pure functions (simple, testable)
 * - Single history file for trends (aggregate/history.yaml)
 * - Self-contained baseline (mean score as baseline reference)
 * - Dimension grouping for comparative analysis (7-5)
 */
export interface Performer {
    character: string;
    theme: string;
    score: number;
}
export interface RoleStats {
    mean_score: number;
    std_dev: number;
    baseline_comparison: number | null;
    top_performers: Performer[];
}
export interface OverallChampion {
    character: string;
    theme: string;
    avg_score: number;
}
export interface TrendPoint {
    date: string;
    mean: number;
    variance: number;
    role?: string;
}
export interface AggregateStats {
    themes_included: string[];
    last_updated: string;
    by_role: Record<string, RoleStats>;
    overall_champions: OverallChampion[];
    historical_trend: TrendPoint[];
}
/** Valid dimension names for theme categorization */
export type DimensionName = 'tone' | 'era' | 'genre' | 'energy';
/** Valid values for each dimension */
export interface DimensionValues {
    tone: 'comedic' | 'serious' | 'satirical' | 'dramatic';
    era: 'historical' | 'contemporary' | 'futuristic' | 'timeless';
    genre: 'action' | 'drama' | 'sci-fi' | 'fantasy' | 'literary' | 'comedy';
    energy: 'high-energy' | 'measured' | 'contemplative';
}
/** Dimensions block in theme YAML */
export interface ThemeDimensions {
    tone?: DimensionValues['tone'];
    era?: DimensionValues['era'];
    genre?: DimensionValues['genre'];
    energy?: DimensionValues['energy'];
}
/** Stats for a specific dimension value (e.g., tone: "comedic") */
export interface DimensionValueStats {
    value: string;
    themes: string[];
    sample_size: number;
    by_role: Record<string, {
        mean_score: number;
        std_dev: number;
        n: number;
    }>;
    overall_mean: number;
}
/** Comparison between two dimension values */
export interface DimensionComparison {
    dimension: DimensionName;
    value_a: string;
    value_b: string;
    delta: number;
    significance: 'significant' | 'marginal' | 'not_significant';
    by_role: Record<string, {
        delta: number;
        significance: 'significant' | 'marginal' | 'not_significant';
    }>;
}
/** Full dimension aggregation result */
export interface DimensionStats {
    dimension: DimensionName;
    last_updated: string;
    values: DimensionValueStats[];
    comparisons: DimensionComparison[];
}
/**
 * Aggregate job-fair results from all themes
 *
 * AC1: Job-fair results contribute to overall benchmark statistics
 */
export declare function aggregateJobFairResults(resultsDir: string): Promise<AggregateStats>;
/**
 * Get baseline comparison for a specific role
 *
 * AC2: Baseline calculations incorporate job-fair control runs
 */
export declare function getBaselineComparison(role: string, resultsDir: string): Promise<number | null>;
/**
 * Get statistics for a specific role
 *
 * AC3: Scenario performance tracked across themes
 */
export declare function getRoleStatistics(role: string, resultsDir: string): Promise<RoleStats>;
/**
 * Get top performers for a specific role
 *
 * AC4: Summary statistics available (mean by role, variance, top performers)
 */
export declare function getTopPerformers(role: string, limit: number, resultsDir: string): Promise<Performer[]>;
/**
 * Get historical trend data, optionally filtered by role
 *
 * AC5: Historical trend tracking for benchmark quality
 */
export declare function getHistoricalTrend(role: string | undefined, resultsDir: string): Promise<TrendPoint[]>;
/**
 * Save a historical snapshot of current aggregate stats
 *
 * AC5: Historical trend tracking for benchmark quality
 */
export declare function saveHistoricalSnapshot(resultsDir: string): Promise<void>;
/**
 * Aggregate job-fair results by a specific dimension
 *
 * Story 7-5: AC - Job-fair aggregator groups results by dimension
 */
export declare function aggregateByDimension(dimension: DimensionName, resultsDir: string, themesDir?: string): Promise<DimensionStats>;
/**
 * Get all available dimension values with theme counts
 *
 * Useful for API endpoints to show available filter options
 */
export declare function getDimensionValues(dimension: DimensionName, themesDir?: string): Promise<Array<{
    value: string;
    theme_count: number;
}>>;
/**
 * Generate a differential report comparing dimension values
 *
 * Story 7-5: AC - Differential report shows performance by dimension value
 */
export declare function generateDifferentialReport(dimension: DimensionName, resultsDir: string, themesDir?: string): Promise<string>;
//# sourceMappingURL=job-fair-aggregator.d.ts.map