/**
 * Benchmark Integration Module
 *
 * Story 11-8: Integrate with Benchmark Output
 * Story 12-6: Update for local results (Epic 12 migration)
 *
 * Correlates Chernoff faces and OCEAN profiles with benchmark performance data.
 * Reads benchmark results from local results/ directory (or BENCHMARK_PATH env var).
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Navigate from dist/scripts/ to project root
const projectRoot = join(__dirname, '..', '..');
const themesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');
const facesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'faces');
// Benchmark results location
// Configurable via BENCHMARK_PATH environment variable
// Defaults to local results/benchmarks/ directory
const benchmarksDir = process.env.BENCHMARK_PATH
    ? join(process.env.BENCHMARK_PATH, 'benchmarks')
    : join(projectRoot, 'results', 'benchmarks');
// ============================================================================
// Constants
// ============================================================================
const VALID_ROLES = [
    'orchestrator', 'sm', 'tea', 'dev', 'reviewer',
    'architect', 'pm', 'tech-writer', 'ux-designer', 'devops',
];
const VALID_DIMENSIONS = ['O', 'C', 'E', 'A', 'N'];
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Load theme YAML data
 */
function loadThemeData(theme) {
    const themePath = join(themesDir, `${theme}.yaml`);
    if (!existsSync(themePath)) {
        return null;
    }
    const content = readFileSync(themePath, 'utf-8');
    return parseYaml(content);
}
/**
 * Get character info from theme data
 */
function getCharacterInfo(theme, role) {
    const data = loadThemeData(theme);
    if (!data)
        return null;
    const agents = data.agents;
    if (!agents || !agents[role])
        return null;
    const agentData = agents[role];
    const ocean = agentData.ocean;
    if (!ocean)
        return null;
    return {
        character: agentData.character || role,
        ocean: {
            O: ocean.O,
            C: ocean.C,
            E: ocean.E,
            A: ocean.A,
            N: ocean.N,
        },
    };
}
/**
 * Get face SVG path for a character
 */
function getFacePath(theme, role) {
    return `by-theme/${theme}/${role}.svg`;
}
/**
 * Load benchmark summary from thunderdome
 */
function loadBenchmarkSummary(scenario, theme, role) {
    const benchmarkPath = join(benchmarksDir, scenario, `${theme}-${role}`, 'summary.yaml');
    if (!existsSync(benchmarkPath)) {
        return null;
    }
    try {
        const content = readFileSync(benchmarkPath, 'utf-8');
        const data = parseYaml(content);
        const stats = data.statistics;
        const baseline = data.baseline_comparison;
        return {
            mean: stats.mean,
            stdDev: stats.std_dev,
            delta: baseline ? parseFloat(String(baseline.delta).replace('+', '')) : 0,
            n: stats.n,
            scores: stats.scores || [],
        };
    }
    catch {
        return null;
    }
}
/**
 * Get all available scenarios
 */
function getAvailableScenarios() {
    if (!existsSync(benchmarksDir)) {
        return [];
    }
    return readdirSync(benchmarksDir).filter(f => {
        // Skip hidden files and .gitkeep
        if (f.startsWith('.'))
            return false;
        const fullPath = join(benchmarksDir, f);
        try {
            const entries = readdirSync(fullPath);
            return entries.length > 0;
        }
        catch {
            // Not a directory
            return false;
        }
    });
}
/**
 * Get all benchmarked themes for a scenario/role
 */
function getBenchmarkedThemes(scenario, role) {
    const scenarioPath = join(benchmarksDir, scenario);
    if (!existsSync(scenarioPath)) {
        return [];
    }
    const dirs = readdirSync(scenarioPath);
    return dirs
        .filter(d => d.endsWith(`-${role}`))
        .map(d => d.replace(`-${role}`, ''));
}
/**
 * Parse OCEAN filter expression
 */
function parseOceanFilter(expr) {
    const match = expr.match(/^([OCEAN])(>=|<=|=|>|<)(\d+)$/);
    if (!match) {
        const dimMatch = expr.match(/^([A-Z])/);
        if (dimMatch && !VALID_DIMENSIONS.includes(dimMatch[1])) {
            throw new Error(`Invalid OCEAN dimension: ${dimMatch[1]}. Valid dimensions are O, C, E, A, N`);
        }
        throw new Error(`Invalid OCEAN filter format: ${expr}`);
    }
    return {
        dimension: match[1],
        operator: match[2],
        value: parseInt(match[3], 10),
    };
}
/**
 * Check if OCEAN scores match filter
 */
function matchesOceanFilter(ocean, filter) {
    const score = ocean[filter.dimension];
    switch (filter.operator) {
        case '>=': return score >= filter.value;
        case '<=': return score <= filter.value;
        case '=': return score === filter.value;
        case '>': return score > filter.value;
        case '<': return score < filter.value;
        default: return false;
    }
}
/**
 * Calculate average OCEAN scores from a set of results
 */
function calculateAverageOcean(results) {
    if (results.length === 0) {
        return { O: 3, C: 3, E: 3, A: 3, N: 3 };
    }
    const sum = { O: 0, C: 0, E: 0, A: 0, N: 0 };
    for (const r of results) {
        sum.O += r.ocean.O;
        sum.C += r.ocean.C;
        sum.E += r.ocean.E;
        sum.A += r.ocean.A;
        sum.N += r.ocean.N;
    }
    return {
        O: Math.round(sum.O / results.length),
        C: Math.round(sum.C / results.length),
        E: Math.round(sum.E / results.length),
        A: Math.round(sum.A / results.length),
        N: Math.round(sum.N / results.length),
    };
}
/**
 * Calculate correlation effect between OCEAN dimension and performance
 */
function calculateDimensionEffect(results, dimension) {
    if (results.length < 2) {
        return { effect: 0, direction: 'none' };
    }
    // Group by low (1-2), medium (3), high (4-5)
    const low = results.filter(r => r.ocean[dimension] <= 2);
    const high = results.filter(r => r.ocean[dimension] >= 4);
    if (low.length === 0 || high.length === 0) {
        return { effect: 0, direction: 'none' };
    }
    const lowMean = low.reduce((sum, r) => sum + r.mean, 0) / low.length;
    const highMean = high.reduce((sum, r) => sum + r.mean, 0) / high.length;
    const effect = Math.abs(highMean - lowMean);
    const direction = highMean > lowMean ? 'positive' : highMean < lowMean ? 'negative' : 'none';
    return { effect: Math.round(effect * 100) / 100, direction };
}
// ============================================================================
// Exported Functions
// ============================================================================
/**
 * Load benchmark data from thunderdome results
 */
export function loadBenchmarkData(scenario, role) {
    const themes = getBenchmarkedThemes(scenario, role);
    const results = [];
    for (const theme of themes) {
        const benchmark = loadBenchmarkSummary(scenario, theme, role);
        const charInfo = getCharacterInfo(theme, role);
        if (benchmark && charInfo) {
            results.push({
                theme,
                role,
                character: charInfo.character,
                scenario,
                mean: benchmark.mean,
                stdDev: benchmark.stdDev,
                delta: benchmark.delta,
                n: benchmark.n,
                scores: benchmark.scores,
                ocean: charInfo.ocean,
                face: getFacePath(theme, role),
            });
        }
    }
    return results.sort((a, b) => b.mean - a.mean);
}
/**
 * Get benchmark result with face visualization attached
 */
export function getBenchmarkWithFace(theme, role, scenario) {
    const benchmark = loadBenchmarkSummary(scenario, theme, role);
    const charInfo = getCharacterInfo(theme, role);
    if (!benchmark) {
        if (charInfo) {
            // Theme exists but no benchmark data
            return {
                theme,
                role,
                character: charInfo.character,
                scenario,
                mean: 0,
                stdDev: 0,
                delta: 0,
                n: 0,
                scores: [],
                ocean: charInfo.ocean,
                face: getFacePath(theme, role),
                benchmarkMissing: true,
            };
        }
        return null;
    }
    if (!charInfo) {
        return null;
    }
    return {
        theme,
        role,
        character: charInfo.character,
        scenario,
        mean: benchmark.mean,
        stdDev: benchmark.stdDev,
        delta: benchmark.delta,
        n: benchmark.n,
        scores: benchmark.scores,
        ocean: charInfo.ocean,
        face: getFacePath(theme, role),
    };
}
/**
 * Calculate OCEAN correlation with benchmark performance
 */
export function calculateOceanCorrelation(scenario, role) {
    const results = loadBenchmarkData(scenario, role);
    const correlations = {
        O: calculateDimensionEffect(results, 'O'),
        C: calculateDimensionEffect(results, 'C'),
        E: calculateDimensionEffect(results, 'E'),
        A: calculateDimensionEffect(results, 'A'),
        N: calculateDimensionEffect(results, 'N'),
        strongest: { dimension: 'O', effect: 0 },
    };
    // Find strongest correlation
    let maxEffect = 0;
    let strongestDim = 'O';
    for (const dim of VALID_DIMENSIONS) {
        if (correlations[dim].effect > maxEffect) {
            maxEffect = correlations[dim].effect;
            strongestDim = dim;
        }
    }
    correlations.strongest = { dimension: strongestDim, effect: maxEffect };
    return correlations;
}
/**
 * Generate markdown correlation report
 */
export function generateCorrelationReport(scenario, role) {
    const correlation = calculateOceanCorrelation(scenario, role);
    const results = loadBenchmarkData(scenario, role);
    let md = `# OCEAN Correlation Report: ${role} on ${scenario}\n\n`;
    md += '## Dimension Effects\n\n';
    md += '| Dimension | Effect Size | Direction | Delta Impact |\n';
    md += '|:----------|:-----------:|:---------:|:------------:|\n';
    for (const dim of VALID_DIMENSIONS) {
        const c = correlation[dim];
        const arrow = c.direction === 'positive' ? '↑' : c.direction === 'negative' ? '↓' : '—';
        const deltaStr = c.direction === 'positive' ? `+${c.effect}` : c.direction === 'negative' ? `-${c.effect}` : '0';
        md += `| **${dim}** | ${c.effect.toFixed(2)} | ${arrow} ${c.direction} | ${deltaStr} pts |\n`;
    }
    md += `\n## Strongest Correlation\n\n`;
    md += `**${correlation.strongest.dimension}** has the largest effect (${correlation.strongest.effect.toFixed(2)} points).\n\n`;
    if (results.length > 0) {
        md += `## Top Performers\n\n`;
        const top3 = results.slice(0, 3);
        for (const r of top3) {
            md += `- **${r.character}** (${r.theme}): ${r.mean} pts (delta: +${r.delta})\n`;
        }
    }
    return md;
}
/**
 * Get optimal OCEAN profile for a role based on benchmark data
 */
export function getOptimalProfile(role) {
    if (!VALID_ROLES.includes(role)) {
        throw new Error(`Invalid role: ${role}. Valid roles are: ${VALID_ROLES.join(', ')}`);
    }
    // Find scenarios that have this role benchmarked
    const scenarios = getAvailableScenarios();
    const allResults = [];
    for (const scenario of scenarios) {
        const results = loadBenchmarkData(scenario, role);
        allResults.push(...results);
    }
    if (allResults.length === 0) {
        // Return balanced profile if no data
        return {
            ocean: { O: 3, C: 3, E: 3, A: 3, N: 3 },
            reasoning: `No benchmark data available for ${role} role. Returning balanced profile.`,
        };
    }
    // Get top performers (top 25%)
    allResults.sort((a, b) => b.mean - a.mean);
    const topCount = Math.max(1, Math.floor(allResults.length * 0.25));
    const topPerformers = allResults.slice(0, topCount);
    const optimalOcean = calculateAverageOcean(topPerformers);
    const topNames = topPerformers.slice(0, 3).map(r => r.character).join(', ');
    return {
        ocean: optimalOcean,
        reasoning: `Based on ${topCount} top performers (${topNames}). Profile reflects OCEAN averages of highest-scoring personas.`,
    };
}
/**
 * Get role recommendations (top themes, themes to avoid)
 */
export function getRoleRecommendations(role) {
    if (!VALID_ROLES.includes(role)) {
        throw new Error(`Invalid role: ${role}. Valid roles are: ${VALID_ROLES.join(', ')}`);
    }
    const scenarios = getAvailableScenarios();
    const allResults = [];
    for (const scenario of scenarios) {
        const results = loadBenchmarkData(scenario, role);
        allResults.push(...results);
    }
    if (allResults.length === 0) {
        return {
            role,
            topThemes: [],
            avoidThemes: [],
            insight: `No benchmark data available for ${role} role.`,
        };
    }
    // Sort by score
    allResults.sort((a, b) => b.mean - a.mean);
    // Top themes (top 3)
    const topThemes = allResults.slice(0, 3).map(r => ({
        theme: r.theme,
        character: r.character,
        score: r.mean,
        ocean: r.ocean,
    }));
    // Avoid themes (bottom 3)
    const avoidThemes = allResults.slice(-3).reverse().map(r => ({
        theme: r.theme,
        character: r.character,
        score: r.mean,
    }));
    // Generate insight based on correlation
    const correlation = calculateOceanCorrelation(scenarios[0] || 'race-condition-cache', role);
    let insight = `For ${role} role: `;
    if (correlation.strongest.effect > 0) {
        const dir = correlation[correlation.strongest.dimension].direction;
        insight += `${dir === 'negative' ? 'Low' : 'High'} ${correlation.strongest.dimension} correlates with +${correlation.strongest.effect.toFixed(1)} points improvement. `;
    }
    if (topThemes.length > 0) {
        insight += `Top performer: ${topThemes[0].character} (${topThemes[0].theme}) at ${topThemes[0].score} pts.`;
    }
    return {
        role,
        topThemes,
        avoidThemes,
        insight,
    };
}
/**
 * Find top performers for a scenario/role with optional filters
 */
export function findTopPerformers(options) {
    const { scenario, role, ocean, limit, minScore } = options;
    if (!scenario || !role) {
        return [];
    }
    let results = loadBenchmarkData(scenario, role);
    // Apply OCEAN filter if provided
    if (ocean) {
        const filter = parseOceanFilter(ocean);
        results = results.filter(r => matchesOceanFilter(r.ocean, filter));
    }
    // Apply minimum score filter
    if (minScore !== undefined) {
        results = results.filter(r => r.mean >= minScore);
    }
    // Convert to PerformerResult format
    let performers = results.map(r => ({
        theme: r.theme,
        character: r.character,
        score: r.mean,
        delta: r.delta,
        ocean: r.ocean,
        face: r.face,
    }));
    // Sort by score (already sorted, but ensure)
    performers.sort((a, b) => b.score - a.score);
    // Apply limit
    if (limit !== undefined && limit > 0) {
        performers = performers.slice(0, limit);
    }
    return performers;
}
/**
 * General query interface for benchmark data
 */
export function queryBenchmarks(options) {
    const { scenario, role, filter, ocean, limit, sortBy } = options;
    if (!scenario || !role) {
        return [];
    }
    let results = loadBenchmarkData(scenario, role);
    // Apply OCEAN filter from 'ocean' or 'filter' option
    const oceanFilter = ocean || filter;
    if (oceanFilter) {
        const parsed = parseOceanFilter(oceanFilter);
        results = results.filter(r => matchesOceanFilter(r.ocean, parsed));
    }
    // Convert to PerformerResult
    let performers = results.map(r => ({
        theme: r.theme,
        character: r.character,
        score: r.mean,
        delta: r.delta,
        ocean: r.ocean,
        face: r.face,
    }));
    // Sort
    switch (sortBy) {
        case 'delta':
            performers.sort((a, b) => b.delta - a.delta);
            break;
        case 'name':
            performers.sort((a, b) => a.theme.localeCompare(b.theme));
            break;
        case 'score':
        default:
            performers.sort((a, b) => b.score - a.score);
    }
    // Apply limit
    if (limit !== undefined && limit > 0) {
        performers = performers.slice(0, limit);
    }
    return performers;
}
/**
 * Generate complete benchmark report with faces and correlations
 */
export function generateBenchmarkReport(options) {
    const { scenario, role } = options;
    const performers = findTopPerformers({ scenario, role });
    const correlation = calculateOceanCorrelation(scenario, role);
    const recommendations = getRoleRecommendations(role);
    let md = `# Benchmark Report: ${role} on ${scenario}\n\n`;
    // Top performers with faces
    md += '## Top Performers\n\n';
    md += '| Rank | Theme | Character | Face | Score | Delta | O | C | E | A | N |\n';
    md += '|:----:|:------|:----------|:----:|:-----:|:-----:|:-:|:-:|:-:|:-:|:-:|\n';
    performers.slice(0, 5).forEach((p, i) => {
        md += `| ${i + 1} | ${p.theme} | ${p.character} `;
        md += `| <img src="${p.face}" width="40"> `;
        md += `| ${p.score} | +${p.delta} `;
        md += `| ${p.ocean.O} | ${p.ocean.C} | ${p.ocean.E} | ${p.ocean.A} | ${p.ocean.N} |\n`;
    });
    // Correlation summary
    md += '\n## OCEAN Correlation\n\n';
    md += `Strongest effect: **${correlation.strongest.dimension}** (${correlation.strongest.effect.toFixed(1)} points)\n\n`;
    for (const dim of VALID_DIMENSIONS) {
        const c = correlation[dim];
        if (c.effect > 0) {
            const arrow = c.direction === 'positive' ? '↑' : '↓';
            md += `- **${dim}**: ${arrow} ${c.effect.toFixed(1)} pts (${c.direction})\n`;
        }
    }
    // Recommendations
    md += '\n## Recommended Themes\n\n';
    for (const t of recommendations.topThemes) {
        md += `- **${t.character}** (${t.theme}): ${t.score} pts\n`;
    }
    // Themes to avoid
    if (recommendations.avoidThemes.length > 0) {
        md += '\n## Avoid These Themes\n\n';
        md += 'These themes underperform the control baseline:\n\n';
        for (const t of recommendations.avoidThemes) {
            md += `- ${t.character} (${t.theme}): ${t.score} pts\n`;
        }
    }
    // Insight
    md += `\n## Insight\n\n${recommendations.insight}\n`;
    return {
        markdown: md,
        data: {
            performers,
            correlation,
            recommendations,
        },
    };
}
//# sourceMappingURL=benchmark-integration.js.map