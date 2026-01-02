/**
 * Benchmark Integration Module
 *
 * Story 11-8: Integrate with Benchmark Output
 *
 * Correlates Chernoff faces and OCEAN profiles with benchmark performance data.
 * Reads benchmark results from thunderdome and merges with pennyfarthing OCEAN profiles.
 */
export interface OceanScores {
    O: number;
    C: number;
    E: number;
    A: number;
    N: number;
}
export interface BenchmarkResult {
    theme: string;
    role: string;
    character: string;
    scenario: string;
    mean: number;
    stdDev: number;
    delta: number;
    cohensD?: number;
    n: number;
    scores: number[];
    ocean: OceanScores;
    face: string;
    benchmarkMissing?: boolean;
}
export interface CorrelationResult {
    O: {
        effect: number;
        direction: 'positive' | 'negative' | 'none';
    };
    C: {
        effect: number;
        direction: 'positive' | 'negative' | 'none';
    };
    E: {
        effect: number;
        direction: 'positive' | 'negative' | 'none';
    };
    A: {
        effect: number;
        direction: 'positive' | 'negative' | 'none';
    };
    N: {
        effect: number;
        direction: 'positive' | 'negative' | 'none';
    };
    strongest: {
        dimension: keyof OceanScores;
        effect: number;
    };
}
export interface OptimalProfile {
    ocean: OceanScores;
    reasoning: string;
}
export interface RoleRecommendations {
    role: string;
    topThemes: Array<{
        theme: string;
        character: string;
        score: number;
        ocean: OceanScores;
    }>;
    avoidThemes: Array<{
        theme: string;
        character: string;
        score: number;
    }>;
    insight: string;
}
export interface PerformerResult {
    theme: string;
    character: string;
    score: number;
    delta: number;
    ocean: OceanScores;
    face: string;
}
export interface QueryOptions {
    scenario?: string;
    role?: string;
    filter?: string;
    ocean?: string;
    limit?: number;
    minScore?: number;
    sortBy?: 'score' | 'delta' | 'name';
}
export interface BenchmarkReportResult {
    markdown: string;
    data: {
        performers: PerformerResult[];
        correlation: CorrelationResult;
        recommendations: RoleRecommendations;
    };
}
/**
 * Load benchmark data from thunderdome results
 */
export declare function loadBenchmarkData(scenario: string, role: string): BenchmarkResult[];
/**
 * Get benchmark result with face visualization attached
 */
export declare function getBenchmarkWithFace(theme: string, role: string, scenario: string): BenchmarkResult | null;
/**
 * Calculate OCEAN correlation with benchmark performance
 */
export declare function calculateOceanCorrelation(scenario: string, role: string): CorrelationResult;
/**
 * Generate markdown correlation report
 */
export declare function generateCorrelationReport(scenario: string, role: string): string;
/**
 * Get optimal OCEAN profile for a role based on benchmark data
 */
export declare function getOptimalProfile(role: string): OptimalProfile;
/**
 * Get role recommendations (top themes, themes to avoid)
 */
export declare function getRoleRecommendations(role: string): RoleRecommendations;
/**
 * Find top performers for a scenario/role with optional filters
 */
export declare function findTopPerformers(options: QueryOptions): PerformerResult[];
/**
 * General query interface for benchmark data
 */
export declare function queryBenchmarks(options: QueryOptions): PerformerResult[];
/**
 * Generate complete benchmark report with faces and correlations
 */
export declare function generateBenchmarkReport(options: {
    scenario: string;
    role: string;
}): BenchmarkReportResult;
//# sourceMappingURL=benchmark-integration.d.ts.map