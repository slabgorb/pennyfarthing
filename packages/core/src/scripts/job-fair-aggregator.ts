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

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ============================================================================
// Story 7-5: Dimension Types
// ============================================================================

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
  delta: number;  // value_a mean - value_b mean
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

// ============================================================================
// Story 7-5: Dimension Aggregation Functions
// ============================================================================

/** Default path to themes directory */
const DEFAULT_THEMES_DIR = join(__dirname, '../../../../pennyfarthing-dist/personas/themes');

/**
 * Load dimensions from a theme YAML file
 */
function loadThemeDimensions(themeName: string, themesDir: string = DEFAULT_THEMES_DIR): ThemeDimensions | null {
  const themePath = join(themesDir, `${themeName}.yaml`);
  if (!existsSync(themePath)) return null;

  try {
    const content = readFileSync(themePath, 'utf-8');
    const data = parseYaml(content) as { theme?: { dimensions?: ThemeDimensions } };
    return data.theme?.dimensions || null;
  } catch {
    return null;
  }
}

/**
 * Calculate statistical significance using simplified t-test approximation
 * Returns significance level based on effect size and sample sizes
 */
function calculateSignificance(
  mean1: number,
  mean2: number,
  std1: number,
  std2: number,
  n1: number,
  n2: number
): 'significant' | 'marginal' | 'not_significant' {
  if (n1 < 2 || n2 < 2) return 'not_significant';

  const pooledStd = Math.sqrt(
    ((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2)
  );

  if (pooledStd === 0) return 'not_significant';

  // Calculate effect size (Cohen's d)
  const effectSize = Math.abs(mean1 - mean2) / pooledStd;

  // Effect size thresholds: small=0.2, medium=0.5, large=0.8
  if (effectSize >= 0.8) return 'significant';
  if (effectSize >= 0.5) return 'marginal';
  return 'not_significant';
}

/**
 * Aggregate job-fair results by a specific dimension
 *
 * Story 7-5: AC - Job-fair aggregator groups results by dimension
 */
export async function aggregateByDimension(
  dimension: DimensionName,
  resultsDir: string,
  themesDir: string = DEFAULT_THEMES_DIR
): Promise<DimensionStats> {
  const latestRuns = getLatestRunPerTheme(resultsDir);

  // Group themes by dimension value
  const themesByValue = new Map<string, string[]>();
  const themeScores = new Map<string, Array<{ role: string; score: number }>>();

  for (const [theme] of latestRuns) {
    const dimensions = loadThemeDimensions(theme, themesDir);
    if (!dimensions) continue;

    const value = dimensions[dimension];
    if (!value) continue;

    if (!themesByValue.has(value)) {
      themesByValue.set(value, []);
    }
    themesByValue.get(value)!.push(theme);
  }

  // Parse scores for each theme
  for (const [theme, dirName] of latestRuns) {
    const summaryPath = join(resultsDir, dirName, 'summary.yaml');
    if (!existsSync(summaryPath)) continue;

    const result = parseSummaryYaml(summaryPath, theme);
    if (result && result.scores.length > 0) {
      themeScores.set(theme, result.scores.map(s => ({ role: s.role, score: s.score })));
    }
  }

  // Calculate stats for each dimension value
  const values: DimensionValueStats[] = [];

  for (const [value, themes] of themesByValue) {
    const roleScores = new Map<string, number[]>();
    const totalScores: number[] = [];

    for (const theme of themes) {
      const scores = themeScores.get(theme);
      if (!scores) continue;

      for (const { role, score } of scores) {
        if (!roleScores.has(role)) {
          roleScores.set(role, []);
        }
        roleScores.get(role)!.push(score);
        totalScores.push(score);
      }
    }

    const byRole: Record<string, { mean_score: number; std_dev: number; n: number }> = {};

    for (const [role, scores] of roleScores) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const stdDev = calculateStdDev(scores, mean);
      byRole[role] = { mean_score: mean, std_dev: stdDev, n: scores.length };
    }

    const overallMean = totalScores.length > 0
      ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length
      : 0;

    values.push({
      value,
      themes,
      sample_size: totalScores.length,
      by_role: byRole,
      overall_mean: overallMean,
    });
  }

  // Generate pairwise comparisons
  const comparisons: DimensionComparison[] = [];

  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a = values[i];
      const b = values[j];

      // Get all roles present in both
      const allRoles = new Set([...Object.keys(a.by_role), ...Object.keys(b.by_role)]);
      const roleComparisons: Record<string, { delta: number; significance: 'significant' | 'marginal' | 'not_significant' }> = {};

      for (const role of allRoles) {
        const aRole = a.by_role[role];
        const bRole = b.by_role[role];

        if (aRole && bRole) {
          const delta = aRole.mean_score - bRole.mean_score;
          const significance = calculateSignificance(
            aRole.mean_score, bRole.mean_score,
            aRole.std_dev, bRole.std_dev,
            aRole.n, bRole.n
          );
          roleComparisons[role] = { delta, significance };
        }
      }

      // Overall comparison
      const overallDelta = a.overall_mean - b.overall_mean;
      // For overall significance, use aggregated stats
      const aScores = Object.values(a.by_role);
      const bScores = Object.values(b.by_role);
      const aStd = aScores.length > 0
        ? Math.sqrt(aScores.reduce((sum, r) => sum + r.std_dev * r.std_dev, 0) / aScores.length)
        : 0;
      const bStd = bScores.length > 0
        ? Math.sqrt(bScores.reduce((sum, r) => sum + r.std_dev * r.std_dev, 0) / bScores.length)
        : 0;

      const overallSignificance = calculateSignificance(
        a.overall_mean, b.overall_mean,
        aStd, bStd,
        a.sample_size, b.sample_size
      );

      comparisons.push({
        dimension,
        value_a: a.value,
        value_b: b.value,
        delta: overallDelta,
        significance: overallSignificance,
        by_role: roleComparisons,
      });
    }
  }

  return {
    dimension,
    last_updated: new Date().toISOString(),
    values,
    comparisons,
  };
}

/**
 * Get all available dimension values with theme counts
 *
 * Useful for API endpoints to show available filter options
 */
export async function getDimensionValues(
  dimension: DimensionName,
  themesDir: string = DEFAULT_THEMES_DIR
): Promise<Array<{ value: string; theme_count: number }>> {
  const valueCounts = new Map<string, number>();

  if (!existsSync(themesDir)) return [];

  const entries = readdirSync(themesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;

    const themeName = entry.name.replace('.yaml', '');
    const dimensions = loadThemeDimensions(themeName, themesDir);

    if (dimensions && dimensions[dimension]) {
      const value = dimensions[dimension]!;
      valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    }
  }

  return Array.from(valueCounts.entries())
    .map(([value, theme_count]) => ({ value, theme_count }))
    .sort((a, b) => b.theme_count - a.theme_count);
}

/**
 * Generate a differential report comparing dimension values
 *
 * Story 7-5: AC - Differential report shows performance by dimension value
 */
export async function generateDifferentialReport(
  dimension: DimensionName,
  resultsDir: string,
  themesDir: string = DEFAULT_THEMES_DIR
): Promise<string> {
  const stats = await aggregateByDimension(dimension, resultsDir, themesDir);

  const lines: string[] = [
    `# Differential Report: ${dimension}`,
    '',
    `Generated: ${stats.last_updated}`,
    '',
    '## Summary by Value',
    '',
  ];

  // Sort values by overall mean descending
  const sortedValues = [...stats.values].sort((a, b) => b.overall_mean - a.overall_mean);

  for (const v of sortedValues) {
    lines.push(`### ${v.value}`);
    lines.push(`- Themes: ${v.themes.length} (${v.themes.join(', ')})`);
    lines.push(`- Sample size: ${v.sample_size}`);
    lines.push(`- Overall mean: ${v.overall_mean.toFixed(2)}`);
    lines.push('');
    lines.push('| Role | Mean | Std Dev | N |');
    lines.push('|------|------|---------|---|');
    for (const [role, roleStats] of Object.entries(v.by_role)) {
      lines.push(`| ${role} | ${roleStats.mean_score.toFixed(2)} | ${roleStats.std_dev.toFixed(2)} | ${roleStats.n} |`);
    }
    lines.push('');
  }

  lines.push('## Pairwise Comparisons');
  lines.push('');

  for (const comp of stats.comparisons) {
    const sigLabel = comp.significance === 'significant' ? '**SIGNIFICANT**'
      : comp.significance === 'marginal' ? '*marginal*'
      : 'not significant';

    const direction = comp.delta > 0 ? '>' : comp.delta < 0 ? '<' : '=';
    lines.push(`### ${comp.value_a} ${direction} ${comp.value_b}`);
    lines.push(`- Delta: ${comp.delta > 0 ? '+' : ''}${comp.delta.toFixed(2)} (${sigLabel})`);
    lines.push('');

    if (Object.keys(comp.by_role).length > 0) {
      lines.push('| Role | Delta | Significance |');
      lines.push('|------|-------|--------------|');
      for (const [role, roleComp] of Object.entries(comp.by_role)) {
        lines.push(`| ${role} | ${roleComp.delta > 0 ? '+' : ''}${roleComp.delta.toFixed(2)} | ${roleComp.significance} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
