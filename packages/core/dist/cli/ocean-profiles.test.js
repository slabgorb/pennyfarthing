/**
 * Tests for Story 11-2: Add OCEAN Profiles to 10 Anchor Themes
 *
 * These tests verify:
 * - 10 anchor theme YAMLs have ocean blocks
 * - All 10 agents in each theme have OCEAN scores
 * - Each OCEAN score uses the 1-5 integer scale
 * - 100 character profiles defined (10 themes × 10 agents)
 *
 * Run with: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { findMonorepoRoot } from './utils/files.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);
const themesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');
// 10 anchor themes for Phase 1
const ANCHOR_THEMES = [
    'deadwood',
    'firefly',
    'breaking-bad',
    'the-good-place',
    'star-trek-tng',
    'discworld',
    'fargo',
    'succession',
    'mass-effect',
    'software-pioneers',
];
// 10 agent roles
const AGENT_ROLES = [
    'orchestrator',
    'sm',
    'tea',
    'dev',
    'reviewer',
    'architect',
    'pm',
    'tech-writer',
    'ux-designer',
    'devops',
];
// OCEAN dimensions
const OCEAN_KEYS = ['O', 'C', 'E', 'A', 'N'];
// Helper to load and parse theme YAML
function loadTheme(themeName) {
    const filePath = join(themesDir, `${themeName}.yaml`);
    if (!existsSync(filePath)) {
        throw new Error(`Theme file not found: ${filePath}`);
    }
    const content = readFileSync(filePath, 'utf-8');
    return parseYaml(content);
}
describe('OCEAN Profiles - Anchor Themes', () => {
    it('should have all 10 anchor theme files', () => {
        for (const theme of ANCHOR_THEMES) {
            const filePath = join(themesDir, `${theme}.yaml`);
            assert.ok(existsSync(filePath), `Missing anchor theme: ${theme}.yaml`);
        }
    });
});
describe('OCEAN Profiles - Structure Validation', () => {
    for (const themeName of ANCHOR_THEMES) {
        describe(`Theme: ${themeName}`, () => {
            it('should have agents section', () => {
                const theme = loadTheme(themeName);
                assert.ok('agents' in theme && typeof theme.agents === 'object', `${themeName} should have agents section`);
            });
            it('should have all 10 agent roles', () => {
                const theme = loadTheme(themeName);
                const agents = theme.agents;
                for (const role of AGENT_ROLES) {
                    assert.ok(role in agents, `${themeName} missing agent role: ${role}`);
                }
            });
            for (const role of AGENT_ROLES) {
                it(`agent ${role} should have ocean block`, () => {
                    const theme = loadTheme(themeName);
                    const agents = theme.agents;
                    const agent = agents[role];
                    assert.ok(agent && 'ocean' in agent, `${themeName}/${role} missing ocean block`);
                });
                it(`agent ${role} ocean block should have all 5 OCEAN keys`, () => {
                    const theme = loadTheme(themeName);
                    const agents = theme.agents;
                    const agent = agents[role];
                    const ocean = agent?.ocean;
                    assert.ok(ocean, `${themeName}/${role} missing ocean block`);
                    for (const key of OCEAN_KEYS) {
                        assert.ok(key in ocean, `${themeName}/${role}/ocean missing key: ${key}`);
                    }
                });
                it(`agent ${role} OCEAN values should be integers 1-5`, () => {
                    const theme = loadTheme(themeName);
                    const agents = theme.agents;
                    const agent = agents[role];
                    const ocean = agent?.ocean;
                    assert.ok(ocean, `${themeName}/${role} missing ocean block`);
                    for (const key of OCEAN_KEYS) {
                        const value = ocean[key];
                        assert.ok(typeof value === 'number' &&
                            Number.isInteger(value) &&
                            value >= 1 &&
                            value <= 5, `${themeName}/${role}/ocean/${key} should be integer 1-5, got: ${value}`);
                    }
                });
            }
        });
    }
});
describe('OCEAN Profiles - Completeness', () => {
    it('should have exactly 100 character profiles (10 themes × 10 agents)', () => {
        let profileCount = 0;
        for (const themeName of ANCHOR_THEMES) {
            const theme = loadTheme(themeName);
            const agents = theme.agents;
            for (const role of AGENT_ROLES) {
                const agent = agents[role];
                if (agent && 'ocean' in agent) {
                    profileCount++;
                }
            }
        }
        assert.strictEqual(profileCount, 100, `Expected 100 character profiles, found ${profileCount}`);
    });
});
//# sourceMappingURL=ocean-profiles.test.js.map