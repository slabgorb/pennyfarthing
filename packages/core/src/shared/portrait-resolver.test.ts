import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import {
  resolvePennyfarthingDist,
  resolvePortraitPath,
  resolveTandemBrandingPath,
  getPortraitPaths,
} from './portrait-resolver.js';

describe('portrait-resolver', () => {
  describe('resolvePennyfarthingDist', () => {
    const originalEnv = process.env.PENNYFARTHING_DIST;

    afterEach(() => {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.PENNYFARTHING_DIST = originalEnv;
      } else {
        delete process.env.PENNYFARTHING_DIST;
      }
    });

    it('should return PENNYFARTHING_DIST env var when set and path exists', () => {
      // Scenario 1: Explicit env var override with existing path
      // Use the actual pennyfarthing-dist path that exists
      const actualDistPath = resolvePennyfarthingDist();
      assert.ok(actualDistPath !== null, 'Should have a valid dist path');

      process.env.PENNYFARTHING_DIST = actualDistPath!;

      const result = resolvePennyfarthingDist();

      // When env var is set to valid existing path, should return it
      assert.strictEqual(result, actualDistPath);
    });

    it('should fall through when PENNYFARTHING_DIST is set but path does not exist', () => {
      // Scenario 1b: Env var set but invalid - should fall through to other checks
      process.env.PENNYFARTHING_DIST = '/nonexistent/path/pennyfarthing-dist';

      const result = resolvePennyfarthingDist();

      // Should fall through and find monorepo path (since we're in monorepo)
      // The key behavior is it doesn't return the invalid env var path
      assert.ok(result === null || !result.includes('/nonexistent/'));
    });

    it('should find monorepo root pennyfarthing-dist directory', () => {
      // Scenario 2: Monorepo root detection (dogfooding)
      // When running from within pennyfarthing repo, find pennyfarthing-dist/ at root
      delete process.env.PENNYFARTHING_DIST;

      const result = resolvePennyfarthingDist();

      // Should find the monorepo root path
      assert.ok(result !== null, 'Should find monorepo root');
      assert.ok(result!.endsWith('pennyfarthing-dist'), 'Path should end with pennyfarthing-dist');
    });

    it('should find sibling pennyfarthing-dist directory', () => {
      // Scenario 3: Sibling directory for dev scenarios
      // e.g., project/pennyfarthing-dist when called from project/packages/shared
      delete process.env.PENNYFARTHING_DIST;

      const result = resolvePennyfarthingDist();

      // Implementation should check ../pennyfarthing-dist, ../../pennyfarthing-dist, etc.
      assert.ok(result === null || result.includes('pennyfarthing-dist'));
    });

    it('should find scoped npm package path', () => {
      // Scenario 4: Scoped npm install
      // node_modules/@pennyfarthing/core/pennyfarthing-dist/
      delete process.env.PENNYFARTHING_DIST;

      const result = resolvePennyfarthingDist();

      // When installed via @pennyfarthing/core, should find that path
      assert.ok(result === null || result.includes('pennyfarthing-dist'));
    });

    it('should find legacy npm package path', () => {
      // Scenario 5: Legacy npm install
      // node_modules/pennyfarthing/pennyfarthing-dist/
      delete process.env.PENNYFARTHING_DIST;

      const result = resolvePennyfarthingDist();

      // When installed via pennyfarthing, should find that path
      assert.ok(result === null || result.includes('pennyfarthing-dist'));
    });

    it('should return a valid path or null', () => {
      // This tests that the function returns a valid result
      delete process.env.PENNYFARTHING_DIST;

      const result = resolvePennyfarthingDist();

      // Result should be either null or a valid pennyfarthing-dist path
      if (result !== null) {
        assert.ok(result.includes('pennyfarthing-dist'));
      }
    });

    it('should check paths in priority order - env var takes precedence', () => {
      // When multiple paths exist, env var should return first if it exists
      const actualDistPath = resolvePennyfarthingDist();
      assert.ok(actualDistPath !== null, 'Should have a valid dist path');

      // Set env var to actual path
      process.env.PENNYFARTHING_DIST = actualDistPath!;

      const result = resolvePennyfarthingDist();

      // Env var should take precedence (returns same path since it exists)
      assert.strictEqual(result, actualDistPath);
    });
  });

  describe('resolvePortraitPath', () => {
    it('should resolve portrait by shortName-OCEAN slug from theme YAML', () => {
      // a-team sm = Faceman, shortName "Faceman", OCEAN scores produce slug
      const result = resolvePortraitPath('a-team', 'sm');

      assert.ok(result !== null, 'Should find portrait');
      assert.ok(result!.includes('a-team'), 'Path should include theme');
      assert.ok(result!.endsWith('.png') || result!.endsWith('.jpg'), 'Should be image file');
    });

    it('should resolve monty-python portraits by shortName-OCEAN slug', () => {
      const result = resolvePortraitPath('monty-python', 'sm');

      // monty-python sm = The Announcer, shortName "Announcer", slug "announcer-44441"
      if (result !== null) {
        assert.ok(result.includes('monty-python'), 'Path should include theme');
        assert.ok(result.includes('announcer'), 'Should match by shortName slug');
      }
    });

    it('should return null for invalid theme', () => {
      const result = resolvePortraitPath('nonexistent-theme', 'sm');

      assert.strictEqual(result, null);
    });

    it('should return null for invalid agent', () => {
      const result = resolvePortraitPath('a-team', 'nonexistent-agent');

      assert.strictEqual(result, null);
    });

    it('should handle theme with special characters in name', () => {
      const result = resolvePortraitPath('star-trek-tos', 'sm');

      assert.ok(result === null || result.includes('star-trek-tos'));
    });

    it('should resolve portraits across theme packages', () => {
      delete process.env.PENNYFARTHING_DIST;

      const result = resolvePortraitPath('a-team', 'dev');

      if (result !== null) {
        assert.ok(result.includes('a-team'));
        assert.ok(result.endsWith('.png') || result.endsWith('.jpg'));
      }
    });
  });

  describe('getPortraitPaths', () => {
    it('should return correct paths structure', () => {
      const distPath = '/test/pennyfarthing-dist';
      const result = getPortraitPaths(distPath);

      assert.ok('portraitsDir' in result, 'Should have portraitsDir');
      assert.ok('themesDir' in result, 'Should have themesDir');
      assert.ok('agentsDir' in result, 'Should have agentsDir');
    });

    it('should build portraitsDir correctly', () => {
      const distPath = '/test/pennyfarthing-dist';
      const result = getPortraitPaths(distPath);

      // Actual structure: pennyfarthing-dist/personas/portraits/
      assert.strictEqual(
        result.portraitsDir,
        path.join(distPath, 'personas', 'portraits'),
        'portraitsDir should be distPath/personas/portraits'
      );
    });

    it('should build themesDir correctly', () => {
      const distPath = '/test/pennyfarthing-dist';
      const result = getPortraitPaths(distPath);

      assert.strictEqual(
        result.themesDir,
        path.join(distPath, 'personas'),
        'themesDir should be distPath/personas'
      );
    });

    it('should build agentsDir correctly', () => {
      const distPath = '/test/pennyfarthing-dist';
      const result = getPortraitPaths(distPath);

      assert.strictEqual(
        result.agentsDir,
        path.join(distPath, 'agents'),
        'agentsDir should be distPath/agents'
      );
    });

    it('should handle paths with trailing slashes', () => {
      const distPath = '/test/pennyfarthing-dist/';
      const result = getPortraitPaths(distPath);

      // Should normalize paths correctly
      assert.ok(!result.portraitsDir.includes('//'), 'Should not have double slashes');
    });
  });

  // ==========================================================================
  // Story 86-17: resolveTandemBrandingPath
  // ==========================================================================

  describe('resolveTandemBrandingPath', () => {
    // AC3: Portrait resolver detects tandem mode and returns tandem variant path
    it('should return a path containing cyclist-tandem for a theme with tandem portraits', () => {
      // Once tandem portraits are generated, a-team should have one
      const result = resolveTandemBrandingPath('a-team');

      assert.ok(result !== null, 'Should find tandem branding for a-team theme');
      assert.ok(result!.includes('cyclist-tandem'), 'Path should include cyclist-tandem');
      assert.ok(result!.includes('a-team'), 'Path should include theme name');
    });

    it('should return path in the medium size directory by default', () => {
      const result = resolveTandemBrandingPath('a-team');

      assert.ok(result !== null, 'Should find tandem branding');
      assert.ok(result!.includes('/medium/'), 'Default should use medium size');
    });

    it('should return path in the large size directory when requested', () => {
      // AC6: Tandem portraits properly sized (large 300x300)
      const result = resolveTandemBrandingPath('a-team', 'large');

      assert.ok(result !== null, 'Should find large tandem branding');
      assert.ok(result!.includes('/large/'), 'Should use large size directory');
    });

    // AC5: Falls back to standard portrait when tandem mode is inactive
    it('should return null for a theme without tandem portraits', () => {
      const result = resolveTandemBrandingPath('nonexistent-theme');

      assert.strictEqual(result, null, 'Should return null for unknown theme');
    });

    it('should return a .png file path', () => {
      const result = resolveTandemBrandingPath('a-team');

      assert.ok(result !== null, 'Should find tandem branding');
      assert.ok(result!.endsWith('.png'), 'Should be a PNG file');
    });

    it('should work for stephen-king theme', () => {
      // Verify multiple themes work, not just one
      const result = resolveTandemBrandingPath('stephen-king');

      assert.ok(result !== null, 'Should find tandem branding for stephen-king');
      assert.ok(result!.includes('stephen-king'), 'Path should include theme');
      assert.ok(result!.includes('cyclist-tandem'), 'Path should include cyclist-tandem');
    });

    it('should work for monty-python theme', () => {
      const result = resolveTandemBrandingPath('monty-python');

      assert.ok(result !== null, 'Should find tandem branding for monty-python');
      assert.ok(result!.includes('monty-python'), 'Path should include theme');
    });
  });
});
