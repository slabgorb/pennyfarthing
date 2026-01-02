/**
 * Story 13-3: Theme Data Loader Tests
 *
 * Tests for the build-time data pipeline that loads theme YAML files
 * and transforms them into typed JSON for client-side queries.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Paths relative to showcase directory
const ROOT = join(__dirname, '..');
const THEMES_DIR = join(ROOT, '..', 'pennyfarthing-dist', 'personas', 'themes');
const OUTPUT_PATH = join(ROOT, 'public', 'themes.json');
const TYPES_PATH = join(ROOT, 'src', 'lib', 'types.ts');
const LOADER_PATH = join(ROOT, 'src', 'lib', 'loader.ts');

describe('Story 13-3: Theme Data Loader', () => {
  describe('AC1: All themes loaded at build time', () => {
    it('should have loader.ts in src/lib/', () => {
      expect(existsSync(LOADER_PATH)).toBe(true);
    });

    it('should export a loadThemes function', async () => {
      // This will fail until loader.ts exists and exports loadThemes
      const loader = await import('../src/lib/loader');
      expect(typeof loader.loadThemes).toBe('function');
    });

    it('should load all theme files from pennyfarthing-dist', async () => {
      const loader = await import('../src/lib/loader');
      const themes = await loader.loadThemes();

      // Count actual YAML files in themes directory
      const yamlFiles = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.yaml'));

      expect(themes.length).toBe(yamlFiles.length);
      expect(themes.length).toBeGreaterThanOrEqual(60); // At least 60 themes
    });

    it('should parse each theme with correct structure', async () => {
      const loader = await import('../src/lib/loader');
      const themes = await loader.loadThemes();

      // Check first theme has expected structure
      const theme = themes[0];
      expect(theme).toHaveProperty('id');
      expect(theme).toHaveProperty('metadata');
      expect(theme).toHaveProperty('agents');
      expect(theme.metadata).toHaveProperty('name');
      expect(theme.metadata).toHaveProperty('description');
      expect(Array.isArray(theme.agents)).toBe(true);
    });
  });

  describe('AC2: TypeScript types for Theme, Agent, OceanScores', () => {
    it('should have types.ts in src/lib/', () => {
      expect(existsSync(TYPES_PATH)).toBe(true);
    });

    it('should export Theme type', async () => {
      const types = await import('../src/lib/types');
      // TypeScript types are erased at runtime, but we can check exports exist
      // by checking if the file compiles and can be imported
      expect(types).toBeDefined();
    });

    it('should define OceanScores with O, C, E, A, N properties', () => {
      const typesContent = readFileSync(TYPES_PATH, 'utf-8');
      expect(typesContent).toMatch(/interface\s+OceanScores/);
      expect(typesContent).toMatch(/O:\s*number/);
      expect(typesContent).toMatch(/C:\s*number/);
      expect(typesContent).toMatch(/E:\s*number/);
      expect(typesContent).toMatch(/A:\s*number/);
      expect(typesContent).toMatch(/N:\s*number/);
    });

    it('should define Agent interface with required fields', () => {
      const typesContent = readFileSync(TYPES_PATH, 'utf-8');
      expect(typesContent).toMatch(/interface\s+Agent/);
      expect(typesContent).toMatch(/character:\s*string/);
      expect(typesContent).toMatch(/ocean:\s*OceanScores/);
      expect(typesContent).toMatch(/style:\s*string/);
    });

    it('should define Theme interface with id, metadata, and agents', () => {
      const typesContent = readFileSync(TYPES_PATH, 'utf-8');
      expect(typesContent).toMatch(/interface\s+Theme/);
      expect(typesContent).toMatch(/id:\s*string/);
      expect(typesContent).toMatch(/metadata:\s*ThemeMetadata/);
      expect(typesContent).toMatch(/agents:\s*Agent\[\]/);
    });
  });

  describe('AC3: themes.json generated in public/ for client queries', () => {
    it('should export a generateThemesJson function', async () => {
      const loader = await import('../src/lib/loader');
      expect(typeof loader.generateThemesJson).toBe('function');
    });

    it('should generate valid JSON output', async () => {
      const loader = await import('../src/lib/loader');
      const json = await loader.generateThemesJson();

      // Should be valid JSON string
      expect(() => JSON.parse(json)).not.toThrow();

      // Should be an array of themes
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThanOrEqual(60);
    });

    it('should produce JSON with all required theme fields', async () => {
      const loader = await import('../src/lib/loader');
      const json = await loader.generateThemesJson();
      const themes = JSON.parse(json);

      // Spot check a few themes
      for (const theme of themes.slice(0, 5)) {
        expect(theme.id).toBeDefined();
        expect(theme.metadata.name).toBeDefined();
        expect(theme.agents.length).toBe(10); // 10 agent roles
      }
    });

    it('should include valid OCEAN scores (1-5 range) for all agents', async () => {
      const loader = await import('../src/lib/loader');
      const json = await loader.generateThemesJson();
      const themes = JSON.parse(json);

      for (const theme of themes) {
        for (const agent of theme.agents) {
          const { O, C, E, A, N } = agent.ocean;
          expect(O).toBeGreaterThanOrEqual(1);
          expect(O).toBeLessThanOrEqual(5);
          expect(C).toBeGreaterThanOrEqual(1);
          expect(C).toBeLessThanOrEqual(5);
          expect(E).toBeGreaterThanOrEqual(1);
          expect(E).toBeLessThanOrEqual(5);
          expect(A).toBeGreaterThanOrEqual(1);
          expect(A).toBeLessThanOrEqual(5);
          expect(N).toBeGreaterThanOrEqual(1);
          expect(N).toBeLessThanOrEqual(5);
        }
      }
    });

    it('should have generate-themes.ts script in scripts/', () => {
      const scriptPath = join(ROOT, 'scripts', 'generate-themes.ts');
      expect(existsSync(scriptPath)).toBe(true);
    });

    it('should have prebuild script in package.json', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      expect(pkg.scripts?.prebuild).toBeDefined();
      expect(pkg.scripts.prebuild).toContain('generate-themes');
    });
  });

  describe('AC4: Build completes in < 30 seconds', () => {
    it('should load all themes in under 5 seconds', async () => {
      const loader = await import('../src/lib/loader');

      const start = performance.now();
      await loader.loadThemes();
      const duration = performance.now() - start;

      // Loading should be fast - under 5 seconds for all themes
      expect(duration).toBeLessThan(5000);
    });

    it('should generate JSON in under 5 seconds', async () => {
      const loader = await import('../src/lib/loader');

      const start = performance.now();
      await loader.generateThemesJson();
      const duration = performance.now() - start;

      // JSON generation should be fast
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Data integrity', () => {
    it('should correctly parse vorkosigan-saga theme as sample', async () => {
      const loader = await import('../src/lib/loader');
      const themes = await loader.loadThemes();

      const vorkosigan = themes.find((t) => t.id === 'vorkosigan-saga');
      expect(vorkosigan).toBeDefined();
      expect(vorkosigan!.metadata.name).toBe('Vorkosigan Saga');
      expect(vorkosigan!.metadata.userTitle).toBe('My Lord');

      // Check Miles (SM agent)
      const miles = vorkosigan!.agents.find((a) => a.role === 'sm');
      expect(miles).toBeDefined();
      expect(miles!.character).toBe('Miles Vorkosigan');
      expect(miles!.ocean.O).toBe(5); // Hyperactive genius
      expect(miles!.ocean.E).toBe(5); // Charismatic chaos
    });

    it('should include all 10 agent roles for each theme', async () => {
      const loader = await import('../src/lib/loader');
      const themes = await loader.loadThemes();

      const expectedRoles = [
        'sm',
        'tea',
        'dev',
        'reviewer',
        'architect',
        'pm',
        'tech-writer',
        'ux-designer',
        'devops',
        'orchestrator',
      ];

      for (const theme of themes) {
        const roles = theme.agents.map((a) => a.role).sort();
        expect(roles).toEqual(expectedRoles.sort());
      }
    });
  });
});
