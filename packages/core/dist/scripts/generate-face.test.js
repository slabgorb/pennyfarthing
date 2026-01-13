/**
 * Tests for Story 11-3: Build Chernoff Face Generator (OCEAN → SVG)
 *
 * These tests verify:
 * AC1: scripts/generate-face.ts functional (module exists and exports work)
 * AC2: Takes theme + agent as input, outputs SVG
 * AC3: Faces visually distinct across OCEAN profiles
 * AC4: SVGs render correctly in browsers and markdown (valid SVG structure)
 *
 * Run with: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { findMonorepoRoot } from '../cli/utils/files.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Find monorepo root by walking up from current directory
const _projectRoot = findMonorepoRoot(__dirname);
// ============================================================================
// AC1: scripts/generate-face.ts functional
// ============================================================================
describe('AC1: Generator Module Exists and Exports', () => {
    it('should export generateFace function', async () => {
        // This will fail until the module is created
        const module = await import('./generate-face.js');
        assert.ok(typeof module.generateFace === 'function', 'generateFace should be a function');
    });
    it('should export oceanToParams function for mapping', async () => {
        const module = await import('./generate-face.js');
        assert.ok(typeof module.oceanToParams === 'function', 'oceanToParams should be a function');
    });
    it('should export loadThemeOcean function for YAML parsing', async () => {
        const module = await import('./generate-face.js');
        assert.ok(typeof module.loadThemeOcean === 'function', 'loadThemeOcean should be a function');
    });
});
// ============================================================================
// AC2: Takes theme + agent as input, outputs SVG
// ============================================================================
describe('AC2: Theme + Agent Input → SVG Output', () => {
    it('should load OCEAN scores from deadwood theme for sm agent', async () => {
        const { loadThemeOcean } = await import('./generate-face.js');
        const ocean = loadThemeOcean('deadwood', 'sm');
        assert.ok(ocean, 'Should return OCEAN object');
        assert.strictEqual(typeof ocean.O, 'number', 'O should be a number');
        assert.strictEqual(typeof ocean.C, 'number', 'C should be a number');
        assert.strictEqual(typeof ocean.E, 'number', 'E should be a number');
        assert.strictEqual(typeof ocean.A, 'number', 'A should be a number');
        assert.strictEqual(typeof ocean.N, 'number', 'N should be a number');
    });
    it('should generate SVG string from theme and agent', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        assert.ok(typeof svg === 'string', 'Should return string');
        assert.ok(svg.includes('<svg'), 'Should contain SVG opening tag');
        assert.ok(svg.includes('</svg>'), 'Should contain SVG closing tag');
    });
    it('should work for all 10 agent roles', async () => {
        const { generateFace } = await import('./generate-face.js');
        const roles = [
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
        for (const role of roles) {
            const svg = generateFace('deadwood', role);
            assert.ok(svg.includes('<svg'), `Should generate SVG for ${role}`);
        }
    });
    it('should throw error for non-existent theme', async () => {
        const { generateFace } = await import('./generate-face.js');
        assert.throws(() => generateFace('nonexistent-theme', 'sm'), /theme.*not found/i, 'Should throw error for missing theme');
    });
    it('should throw error for non-existent agent', async () => {
        const { generateFace } = await import('./generate-face.js');
        assert.throws(() => generateFace('deadwood', 'nonexistent-agent'), /agent.*not found/i, 'Should throw error for missing agent');
    });
});
// ============================================================================
// AC3: Faces visually distinct across OCEAN profiles
// ============================================================================
describe('AC3: OCEAN → SVG Parameter Mapping', () => {
    // Test the mapping function directly with known values
    it('should map O=1 to small eye radius (8px)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 1, C: 3, E: 3, A: 3, N: 3 });
        assert.strictEqual(params.eyeRadius, 8, 'O=1 should map to 8px eye radius');
    });
    it('should map O=5 to large eye radius (18px)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 5, C: 3, E: 3, A: 3, N: 3 });
        assert.strictEqual(params.eyeRadius, 18, 'O=5 should map to 18px eye radius');
    });
    it('should map C=1 to wide round face (110x90)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 1, E: 3, A: 3, N: 3 });
        assert.strictEqual(params.faceWidth, 110, 'C=1 should map to 110px face width');
        assert.strictEqual(params.faceHeight, 90, 'C=1 should map to 90px face height');
        assert.strictEqual(params.cornerRadius, 50, 'C=1 should have very round corners');
    });
    it('should map C=5 to narrow angular face (70x120)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 5, E: 3, A: 3, N: 3 });
        assert.strictEqual(params.faceWidth, 70, 'C=5 should map to 70px face width');
        assert.strictEqual(params.faceHeight, 120, 'C=5 should map to 120px face height');
        assert.strictEqual(params.cornerRadius, 5, 'C=5 should have angular corners');
    });
    it('should map E=1 to narrow mouth (12px)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 3, E: 1, A: 3, N: 3 });
        assert.strictEqual(params.mouthWidth, 12, 'E=1 should map to 12px mouth width');
    });
    it('should map E=5 to wide mouth (50px)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 3, E: 5, A: 3, N: 3 });
        assert.strictEqual(params.mouthWidth, 50, 'E=5 should map to 50px mouth width');
    });
    it('should map A=1 to angled-down eyebrows (-20 degrees)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 3, E: 3, A: 1, N: 3 });
        assert.strictEqual(params.eyebrowAngle, -20, 'A=1 should map to -20 degree eyebrows');
    });
    it('should map A=5 to raised eyebrows (+20 degrees)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 3, E: 3, A: 5, N: 3 });
        assert.strictEqual(params.eyebrowAngle, 20, 'A=5 should map to +20 degree eyebrows');
    });
    it('should map N=1 to light stroke (1.5px)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 3, E: 3, A: 3, N: 1 });
        assert.strictEqual(params.strokeWidth, 1.5, 'N=1 should map to 1.5px stroke');
    });
    it('should map N=5 to heavy stroke (4px)', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        const params = oceanToParams({ O: 3, C: 3, E: 3, A: 3, N: 5 });
        assert.strictEqual(params.strokeWidth, 4, 'N=5 should map to 4px stroke');
    });
});
describe('AC3: Extreme Profiles Produce Different SVGs', () => {
    it('should produce different SVGs for 1-1-1-1-1 vs 5-5-5-5-5', async () => {
        const { oceanToParams, generateSvgFromParams } = await import('./generate-face.js');
        const stoic = oceanToParams({ O: 1, C: 1, E: 1, A: 1, N: 1 });
        const intense = oceanToParams({ O: 5, C: 5, E: 5, A: 5, N: 5 });
        const stoicSvg = generateSvgFromParams(stoic);
        const intenseSvg = generateSvgFromParams(intense);
        assert.notStrictEqual(stoicSvg, intenseSvg, 'Extreme profiles should produce different SVGs');
        // Verify specific differences exist
        assert.ok(stoicSvg.includes('r="8"') || stoicSvg.includes('r="8px"'), 'Stoic should have small eyes (8px)');
        assert.ok(intenseSvg.includes('r="18"') || intenseSvg.includes('r="18px"'), 'Intense should have large eyes (18px)');
    });
    it('should produce measurably different parameters for each OCEAN value', async () => {
        const { oceanToParams } = await import('./generate-face.js');
        // Generate params for each value of O (1-5)
        const openness1 = oceanToParams({ O: 1, C: 3, E: 3, A: 3, N: 3 });
        const openness3 = oceanToParams({ O: 3, C: 3, E: 3, A: 3, N: 3 });
        const openness5 = oceanToParams({ O: 5, C: 3, E: 3, A: 3, N: 3 });
        // Eye radius should increase with O
        assert.ok(openness1.eyeRadius < openness3.eyeRadius, 'O=1 should have smaller eyes than O=3');
        assert.ok(openness3.eyeRadius < openness5.eyeRadius, 'O=3 should have smaller eyes than O=5');
    });
});
// ============================================================================
// AC4: SVGs render correctly in browsers and markdown
// ============================================================================
describe('AC4: Valid SVG Structure', () => {
    it('should include viewBox attribute for scaling', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        assert.ok(svg.includes('viewBox="0 0 200 200"'), 'Should have 200x200 viewBox for proper scaling');
    });
    it('should include xmlns attribute for browser compatibility', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'Should have SVG xmlns for browser rendering');
    });
    it('should contain face shape element', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        // Face could be ellipse, rect with rx/ry, or path
        const hasFaceShape = svg.includes('<ellipse') ||
            svg.includes('<rect') ||
            svg.includes('<circle');
        assert.ok(hasFaceShape, 'Should contain face shape element');
    });
    it('should contain eye elements', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        // Eyes are typically circles or ellipses
        // Count occurrences - should have at least 2 for eyes
        const circleCount = (svg.match(/<circle/g) || []).length;
        const ellipseCount = (svg.match(/<ellipse/g) || []).length;
        assert.ok(circleCount >= 2 || ellipseCount >= 2, 'Should contain at least 2 eye elements');
    });
    it('should contain mouth element', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        // Mouth is typically a path or line
        const hasMouth = svg.includes('<path') || svg.includes('<line');
        assert.ok(hasMouth, 'Should contain mouth path or line');
    });
    it('should be well-formed XML', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        // Check basic XML well-formedness
        assert.ok(svg.startsWith('<svg'), 'Should start with <svg');
        assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
        // Check that all opened tags have closing counterparts
        // (This is a simple check - real XML validation would use a parser)
        const openTags = svg.match(/<[a-z]+[^/>]*>/gi) || [];
        const closeTags = svg.match(/<\/[a-z]+>/gi) || [];
        const selfClosing = svg.match(/<[a-z]+[^>]*\/>/gi) || [];
        // Note: This is approximate - real validation needed for production
        assert.ok(openTags.length <= closeTags.length + selfClosing.length + 1, 'Tags should be properly closed');
    });
    it('should use stroke-width for line weights', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        assert.ok(svg.includes('stroke-width'), 'Should use stroke-width for line weight control');
    });
    it('should be monochrome (black strokes, no fill or light fill)', async () => {
        const { generateFace } = await import('./generate-face.js');
        const svg = generateFace('deadwood', 'sm');
        // Should have black or no stroke color
        const hasStroke = svg.includes('stroke=');
        const strokeIsBlack = svg.includes('stroke="black"') ||
            svg.includes('stroke="#000"') ||
            svg.includes('stroke="currentColor"');
        assert.ok(!hasStroke || strokeIsBlack, 'Strokes should be black or currentColor');
    });
});
// ============================================================================
// Integration: Full Pipeline Test
// ============================================================================
describe('Integration: Full Face Generation Pipeline', () => {
    it('should generate valid SVG for all 10 anchor themes', async () => {
        const { generateFace } = await import('./generate-face.js');
        const themes = [
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
        for (const theme of themes) {
            const svg = generateFace(theme, 'sm');
            assert.ok(svg.includes('<svg') && svg.includes('</svg>'), `Should generate valid SVG for ${theme}`);
        }
    });
    it('should produce 100 unique face variations (10 themes × 10 agents)', async () => {
        const { generateFace } = await import('./generate-face.js');
        const themes = [
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
        const roles = [
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
        const svgSet = new Set();
        for (const theme of themes) {
            for (const role of roles) {
                const svg = generateFace(theme, role);
                svgSet.add(svg);
            }
        }
        // Not all 100 will be unique (some characters share OCEAN scores)
        // but there should be significant variation
        assert.ok(svgSet.size >= 20, `Should have at least 20 unique face variations, got ${svgSet.size}`);
    });
});
//# sourceMappingURL=generate-face.test.js.map