/**
 * Job-Fair Aggregator Module
 *
 * Story 7-4: Aggregate Job-Fair Results into Benchmark Statistics
 *
 * Aggregates job-fair results across multiple themes into unified benchmark
 * statistics with historical trend tracking.
 *
 * Design decisions (from brainstorm):
 * - Latest run per theme only (avoids duplicate counting)
 * - Single-pass with pure functions (simple, testable)
 * - Single history file for trends (aggregate/history.yaml)
 * - Self-contained baseline (mean score as baseline reference)
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
//# sourceMappingURL=job-fair-aggregator.d.ts.map