#!/usr/bin/env npx ts-node
/**
 * Validate OCEAN profiles across all persona themes
 *
 * Checks that every agent in every theme has a complete ocean: block
 * with O, C, E, A, N scores (1-5).
 */
import { readFileSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Navigate from dist/scripts/ to project root
const projectRoot = join(__dirname, '..', '..');
const THEMES_DIR = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');
const AGENTS = ['orchestrator', 'sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'tech-writer', 'ux-designer', 'devops'];
const OCEAN_DIMS = ['O', 'C', 'E', 'A', 'N'];
function validateTheme(themePath) {
    const results = [];
    const themeName = basename(themePath, '.yaml');
    try {
        const content = readFileSync(themePath, 'utf-8');
        const data = parseYaml(content);
        if (!data?.agents) {
            console.error(`  Warning: ${themeName} has no agents block`);
            return results;
        }
        for (const agent of AGENTS) {
            const agentDef = data.agents[agent];
            if (!agentDef) {
                results.push({
                    theme: themeName,
                    agent,
                    character: '(missing)',
                    hasOcean: false,
                    missingDims: OCEAN_DIMS,
                });
                continue;
            }
            const character = agentDef.character || '(unnamed)';
            const ocean = agentDef.ocean;
            if (!ocean) {
                results.push({
                    theme: themeName,
                    agent,
                    character,
                    hasOcean: false,
                    missingDims: OCEAN_DIMS,
                });
                continue;
            }
            const missingDims = OCEAN_DIMS.filter(dim => {
                const val = ocean[dim];
                return val === undefined || val < 1 || val > 5;
            });
            results.push({
                theme: themeName,
                agent,
                character,
                hasOcean: missingDims.length === 0,
                missingDims,
                scores: ocean,
            });
        }
    }
    catch (err) {
        console.error(`  Error parsing ${themeName}: ${err}`);
    }
    return results;
}
function main() {
    const themeFiles = readdirSync(THEMES_DIR)
        .filter(f => f.endsWith('.yaml'))
        .sort();
    console.log(`\nValidating OCEAN profiles across ${themeFiles.length} themes...\n`);
    const allResults = [];
    const completeThemes = [];
    const incompleteThemes = [];
    for (const file of themeFiles) {
        const themePath = join(THEMES_DIR, file);
        const results = validateTheme(themePath);
        allResults.push(...results);
        const themeName = basename(file, '.yaml');
        const incomplete = results.filter(r => !r.hasOcean);
        if (incomplete.length === 0) {
            completeThemes.push(themeName);
        }
        else {
            incompleteThemes.push(themeName);
        }
    }
    // Summary
    const totalProfiles = allResults.length;
    const completeProfiles = allResults.filter(r => r.hasOcean).length;
    const incompleteProfiles = totalProfiles - completeProfiles;
    console.log('='.repeat(60));
    console.log('OCEAN Profile Validation Summary');
    console.log('='.repeat(60));
    console.log(`Total themes:      ${themeFiles.length}`);
    console.log(`Complete themes:   ${completeThemes.length}`);
    console.log(`Incomplete themes: ${incompleteThemes.length}`);
    console.log();
    console.log(`Total profiles:    ${totalProfiles}`);
    console.log(`Complete profiles: ${completeProfiles}`);
    console.log(`Missing profiles:  ${incompleteProfiles}`);
    console.log(`Coverage:          ${((completeProfiles / totalProfiles) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
    if (incompleteThemes.length > 0) {
        console.log('\nIncomplete themes:');
        for (const theme of incompleteThemes) {
            const missing = allResults.filter(r => r.theme === theme && !r.hasOcean);
            console.log(`  ${theme}: ${missing.length} agents missing OCEAN`);
            for (const m of missing) {
                console.log(`    - ${m.agent} (${m.character})`);
            }
        }
    }
    if (completeThemes.length > 0 && process.argv.includes('--show-complete')) {
        console.log('\nComplete themes:');
        for (const theme of completeThemes) {
            console.log(`  ✓ ${theme}`);
        }
    }
    // Exit with error if incomplete
    process.exit(incompleteProfiles > 0 ? 1 : 0);
}
main();
//# sourceMappingURL=validate-ocean-profiles.js.map