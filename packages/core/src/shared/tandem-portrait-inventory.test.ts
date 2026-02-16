/**
 * Story 86-17: Tandem Portrait Inventory Validation
 *
 * Validates that tandem branding portraits exist for all themes
 * in both required sizes.
 *
 * Acceptance Criteria:
 * - AC1: ImageMagick script processes source PNG into per-theme color variations
 * - AC6: Tandem portraits properly sized (medium 200x200, large 300x300)
 * - AC7: All 30+ themes have tandem portrait variants available
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePennyfarthingDist, getPortraitPaths } from './portrait-resolver.js';

describe('tandem-portrait-inventory', () => {
  // Resolve paths once for all tests
  const distPath = resolvePennyfarthingDist();

  // AC7: All 30+ themes have tandem portrait variants available
  describe('AC7: All themes have tandem branding portraits', () => {
    it('should resolve pennyfarthing-dist path', () => {
      assert.ok(distPath !== null, 'Must resolve pennyfarthing-dist');
    });

    it('should have a portraits directory', () => {
      assert.ok(distPath !== null);
      const paths = getPortraitPaths(distPath!);
      assert.ok(existsSync(paths.portraitsDir), `Portraits dir should exist: ${paths.portraitsDir}`);
    });

    it('should have tandem branding in every theme portrait directory', () => {
      assert.ok(distPath !== null);
      const paths = getPortraitPaths(distPath!);
      const portraitsDir = paths.portraitsDir;

      // Get all theme directories that have portraits
      const themeDirs = readdirSync(portraitsDir).filter(entry => {
        const themePath = join(portraitsDir, entry);
        try {
          return readdirSync(themePath).length > 0;
        } catch {
          return false;
        }
      });

      assert.ok(themeDirs.length >= 30, `Should have at least 30 themes with portraits, found ${themeDirs.length}`);

      const missing: string[] = [];
      for (const theme of themeDirs) {
        const mediumPath = join(portraitsDir, theme, 'medium', 'cyclist-tandem.png');
        if (!existsSync(mediumPath)) {
          missing.push(theme);
        }
      }

      assert.strictEqual(
        missing.length, 0,
        `Missing tandem branding in ${missing.length} themes: ${missing.join(', ')}`
      );
    });
  });

  // AC6: Tandem portraits properly sized (medium 200x200, large 300x300)
  describe('AC6: Tandem portraits exist in required sizes', () => {
    it('should have medium size tandem portraits for all themes', () => {
      assert.ok(distPath !== null);
      const paths = getPortraitPaths(distPath!);
      const portraitsDir = paths.portraitsDir;

      const themeDirs = readdirSync(portraitsDir).filter(entry => {
        try {
          return readdirSync(join(portraitsDir, entry)).length > 0;
        } catch {
          return false;
        }
      });

      const missingMedium: string[] = [];
      for (const theme of themeDirs) {
        const mediumPath = join(portraitsDir, theme, 'medium', 'cyclist-tandem.png');
        if (!existsSync(mediumPath)) {
          missingMedium.push(theme);
        }
      }

      assert.strictEqual(
        missingMedium.length, 0,
        `Missing medium tandem portrait in: ${missingMedium.join(', ')}`
      );
    });

    it('should have large size tandem portraits for all themes', () => {
      assert.ok(distPath !== null);
      const paths = getPortraitPaths(distPath!);
      const portraitsDir = paths.portraitsDir;

      const themeDirs = readdirSync(portraitsDir).filter(entry => {
        try {
          return readdirSync(join(portraitsDir, entry)).length > 0;
        } catch {
          return false;
        }
      });

      const missingLarge: string[] = [];
      for (const theme of themeDirs) {
        const largePath = join(portraitsDir, theme, 'large', 'cyclist-tandem.png');
        if (!existsSync(largePath)) {
          missingLarge.push(theme);
        }
      }

      assert.strictEqual(
        missingLarge.length, 0,
        `Missing large tandem portrait in: ${missingLarge.join(', ')}`
      );
    });
  });

  // AC1: ImageMagick script processes source PNG
  describe('AC1: Source image and generation script exist', () => {
    it('should have source tandem cyclist image in repository', () => {
      assert.ok(distPath !== null);
      // Source image should be available for regeneration
      const sourcePaths = [
        join(distPath!, '..', 'scripts', 'portraits', 'cyclist-tandem-source.png'),
        join(distPath!, '..', 'scripts', 'portraits', 'cyclist_tandem.png'),
        join(distPath!, 'personas', 'portraits', 'cyclist-tandem-source.png'),
      ];

      const found = sourcePaths.some(p => existsSync(p));
      assert.ok(found, `Source tandem image should exist in one of: ${sourcePaths.join(', ')}`);
    });

    it('should have tandem portrait generation script', () => {
      assert.ok(distPath !== null);
      // Generation script should exist for regeneration
      const scriptPaths = [
        join(distPath!, '..', 'scripts', 'portraits', 'generate-tandem-portraits.sh'),
        join(distPath!, '..', 'scripts', 'portraits', 'generate-tandem-portraits.js'),
        join(distPath!, 'scripts', 'portraits', 'generate-tandem-portraits.sh'),
      ];

      const found = scriptPaths.some(p => existsSync(p));
      assert.ok(found, `Generation script should exist in one of: ${scriptPaths.join(', ')}`);
    });
  });
});
