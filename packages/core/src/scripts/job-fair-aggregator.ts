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

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// ============================================================================
// Types
// ============================================================================

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

// Internal types for parsing summary.yaml
interface SummaryChampion {
  character: string;
  score: number;
  theme?: string;
  source_role?: string;
}

interface SummaryMatrixRow {
  character: string;
  source_role?: string;
  dev?: number;
  reviewer?: number;
  tea?: number;
  sm?: number;
  average?: number;
  [key: string]: string | number | undefined;
}

interface SummaryYaml {
  theme?: string;
  meta?: { theme: string; timestamp: string };
  timestamp?: string;
  champions?: Record<string, SummaryChampion>;
  matrix?: {
    headers?: string[];
    rows?: SummaryMatrixRow[];
  } | Record<string, Record<string, number>>;
  role_rankings?: Record<string, Array<{ character: string; score: number }>>;
}

interface ThemeResult {
  theme: string;
  timestamp: string;
  champions: Record<string, SummaryChampion>;
  scores: Array<{ character: string; role: string; score: number }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse theme name and timestamp from directory name
 * Format: {theme}-{timestamp} e.g., "1984-20260106T015755Z"
 */
function parseDirectoryName(dirName: string): { theme: string; timestamp: string } | null {
  // Match pattern: anything-YYYYMMDD or anything-YYYYMMDDTHHMMSSz
  const match = dirName.match(/^(.+)-(\d{8}(?:T\d{6}Z?|-\d{6})?)$/);
  if (!match) return null;
  return { theme: match[1], timestamp: match[2] };
}

/**
 * Get latest run directory for each theme
 */
function getLatestRunPerTheme(resultsDir: string): Map<string, string> {
  const themeLatest = new Map<string, { timestamp: string; dirName: string }>();

  if (!existsSync(resultsDir)) return new Map();

  const entries = readdirSync(resultsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const parsed = parseDirectoryName(entry.name);
    if (!parsed) continue;

    const existing = themeLatest.get(parsed.theme);
    if (!existing || parsed.timestamp > existing.timestamp) {
      themeLatest.set(parsed.theme, { timestamp: parsed.timestamp, dirName: entry.name });
    }
  }

  return new Map(
    Array.from(themeLatest.entries()).map(([theme, info]) => [theme, info.dirName])
  );
}

/**
 * Parse a summary.yaml file and extract scores
 */
function parseSummaryYaml(filePath: string, themeName: string): ThemeResult | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = parseYaml(content) as SummaryYaml;

    const theme = data.meta?.theme || data.theme || themeName;
    const timestamp = data.meta?.timestamp || data.timestamp || new Date().toISOString();

    const scores: Array<{ character: string; role: string; score: number }> = [];

    // Extract scores from matrix
    if (data.matrix) {
      if ('rows' in data.matrix && Array.isArray(data.matrix.rows)) {
        // Format: { headers: [...], rows: [...] }
        const roles = ['dev', 'reviewer', 'tea', 'sm'];
        for (const row of data.matrix.rows) {
          for (const role of roles) {
            const score = row[role];
            if (typeof score === 'number') {
              scores.push({ character: row.character, role, score });
            }
          }
        }
      } else {
        // Format: { alice: { dev: 85.5, reviewer: 72.0 }, ... }
        const matrixObj = data.matrix as Record<string, Record<string, number>>;
        for (const [character, roleScores] of Object.entries(matrixObj)) {
          if (character === 'headers' || character === 'rows') continue;
          for (const [role, score] of Object.entries(roleScores)) {
            if (typeof score === 'number') {
              scores.push({ character, role, score });
            }
          }
        }
      }
    }

    // Fallback: extract from role_rankings if matrix didn't yield scores
    if (scores.length === 0 && data.role_rankings) {
      for (const [role, rankings] of Object.entries(data.role_rankings)) {
        for (const entry of rankings) {
          scores.push({ character: entry.character, role, score: entry.score });
        }
      }
    }

    return {
      theme,
      timestamp,
      champions: data.champions || {},
      scores,
    };
  } catch {
    // Skip malformed YAML
    return null;
  }
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate variance
 */
function calculateVariance(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Get path to history file
 */
function getHistoryFilePath(resultsDir: string): string {
  return join(resultsDir, 'aggregate', 'history.yaml');
}

/**
 * Load historical trend data
 */
function loadHistoricalTrend(resultsDir: string): TrendPoint[] {
  const historyPath = getHistoryFilePath(resultsDir);
  if (!existsSync(historyPath)) return [];

  try {
    const content = readFileSync(historyPath, 'utf-8');
    const data = parseYaml(content) as { snapshots?: TrendPoint[] };
    return data.snapshots || [];
  } catch {
    return [];
  }
}

// ============================================================================
// Main Exported Functions
// ============================================================================

/**
 * Aggregate job-fair results from all themes
 *
 * AC1: Job-fair results contribute to overall benchmark statistics
 */
export async function aggregateJobFairResults(resultsDir: string): Promise<AggregateStats> {
  const latestRuns = getLatestRunPerTheme(resultsDir);
  const allResults: ThemeResult[] = [];

  // Parse all theme summaries
  for (const [theme, dirName] of latestRuns) {
    const summaryPath = join(resultsDir, dirName, 'summary.yaml');
    if (!existsSync(summaryPath)) continue;

    const result = parseSummaryYaml(summaryPath, theme);
    if (result && result.scores.length > 0) {
      allResults.push(result);
    }
  }

  // Collect scores by role
  const scoresByRole = new Map<string, Array<{ character: string; theme: string; score: number }>>();

  for (const result of allResults) {
    for (const { character, role, score } of result.scores) {
      if (!scoresByRole.has(role)) {
        scoresByRole.set(role, []);
      }
      scoresByRole.get(role)!.push({ character, theme: result.theme, score });
    }
  }

  // Calculate overall mean for baseline
  const allScores = Array.from(scoresByRole.values()).flat().map(s => s.score);
  const overallMean = allScores.length > 0
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : 0;

  // Build by_role stats
  const byRole: Record<string, RoleStats> = {};

  for (const [role, entries] of scoresByRole) {
    const scores = entries.map(e => e.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = calculateStdDev(scores, mean);

    // Sort by score descending for top performers
    const sorted = [...entries].sort((a, b) => b.score - a.score);

    byRole[role] = {
      mean_score: mean,
      std_dev: stdDev,
      baseline_comparison: mean - overallMean,
      top_performers: sorted.slice(0, 5).map(e => ({
        character: e.character,
        theme: e.theme,
        score: e.score,
      })),
    };
  }

  // Calculate overall champions (best average across roles per character+theme)
  const characterAverages = new Map<string, { theme: string; scores: number[] }>();

  for (const result of allResults) {
    for (const { character, score } of result.scores) {
      const key = `${character}|${result.theme}`;
      if (!characterAverages.has(key)) {
        characterAverages.set(key, { theme: result.theme, scores: [] });
      }
      characterAverages.get(key)!.scores.push(score);
    }
  }

  const overallChampions: OverallChampion[] = Array.from(characterAverages.entries())
    .map(([key, data]) => {
      const character = key.split('|')[0];
      const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      return { character, theme: data.theme, avg_score: avgScore };
    })
    .sort((a, b) => b.avg_score - a.avg_score)
    .slice(0, 10);

  // Load historical trend
  const historicalTrend = loadHistoricalTrend(resultsDir);

  return {
    themes_included: allResults.map(r => r.theme),
    last_updated: new Date().toISOString(),
    by_role: byRole,
    overall_champions: overallChampions,
    historical_trend: historicalTrend,
  };
}

/**
 * Get baseline comparison for a specific role
 *
 * AC2: Baseline calculations incorporate job-fair control runs
 */
export async function getBaselineComparison(
  role: string,
  resultsDir: string
): Promise<number | null> {
  const stats = await aggregateJobFairResults(resultsDir);
  return stats.by_role[role]?.baseline_comparison ?? null;
}

/**
 * Get statistics for a specific role
 *
 * AC3: Scenario performance tracked across themes
 */
export async function getRoleStatistics(
  role: string,
  resultsDir: string
): Promise<RoleStats> {
  const stats = await aggregateJobFairResults(resultsDir);
  return stats.by_role[role] || {
    mean_score: 0,
    std_dev: 0,
    baseline_comparison: null,
    top_performers: [],
  };
}

/**
 * Get top performers for a specific role
 *
 * AC4: Summary statistics available (mean by role, variance, top performers)
 */
export async function getTopPerformers(
  role: string,
  limit: number,
  resultsDir: string
): Promise<Performer[]> {
  const stats = await aggregateJobFairResults(resultsDir);
  const roleStats = stats.by_role[role];
  if (!roleStats) return [];
  return roleStats.top_performers.slice(0, limit);
}

/**
 * Get historical trend data, optionally filtered by role
 *
 * AC5: Historical trend tracking for benchmark quality
 */
export async function getHistoricalTrend(
  role: string | undefined,
  resultsDir: string
): Promise<TrendPoint[]> {
  const trend = loadHistoricalTrend(resultsDir);

  if (!role) return trend;

  // Filter to role-specific points if role is specified
  return trend.filter(point => !point.role || point.role === role);
}

/**
 * Save a historical snapshot of current aggregate stats
 *
 * AC5: Historical trend tracking for benchmark quality
 */
export async function saveHistoricalSnapshot(resultsDir: string): Promise<void> {
  const stats = await aggregateJobFairResults(resultsDir);

  // Calculate overall mean and variance from all role means
  const roleMeans = Object.values(stats.by_role).map(r => r.mean_score);
  const overallMean = roleMeans.length > 0
    ? roleMeans.reduce((a, b) => a + b, 0) / roleMeans.length
    : 0;
  const overallVariance = calculateVariance(roleMeans, overallMean);

  const newPoint: TrendPoint = {
    date: new Date().toISOString().split('T')[0],
    mean: overallMean,
    variance: overallVariance,
  };

  // Load existing history
  const existingTrend = loadHistoricalTrend(resultsDir);
  existingTrend.push(newPoint);

  // Ensure aggregate directory exists
  const aggregateDir = join(resultsDir, 'aggregate');
  if (!existsSync(aggregateDir)) {
    mkdirSync(aggregateDir, { recursive: true });
  }

  // Save updated history
  const historyPath = getHistoryFilePath(resultsDir);
  writeFileSync(historyPath, stringifyYaml({ snapshots: existingTrend }));
}
