/**
 * 34-4: Upgrade path handling
 *
 * Tests for upgrade-related changes:
 * - cyclist-setup cleans stale artifacts before rebuilding
 * - install-cli.sh warns if replacing CLI pointing to different location
 *
 * Note: ACs 1 and 4 (documentation) are not testable with automated tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CYCLIST_ROOT = process.cwd();
const MONOREPO_ROOT = join(CYCLIST_ROOT, '..', '..');

describe('34-4: Upgrade path handling', () => {

  describe('AC2: cyclist-setup cleans stale artifacts', () => {
    const justfilePath = join(MONOREPO_ROOT, 'justfile');

    it('should include cyclist-clean in cyclist-setup recipe', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // Extract the cyclist-setup recipe content
      const setupMatch = content.match(/cyclist-setup:[\s\S]*?(?=\n[a-z]+-[a-z]+:|$)/);
      expect(setupMatch).not.toBeNull();
      const setupRecipe = setupMatch![0];
      expect(setupRecipe).toMatch(/cyclist-clean|rm -rf.*dist/);
    });

    it('should clean artifacts BEFORE installing dependencies', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // Extract the cyclist-setup recipe
      const setupMatch = content.match(/cyclist-setup:[\s\S]*?(?=\n[a-z]+-[a-z]+:|$)/);
      expect(setupMatch).not.toBeNull();
      const setupRecipe = setupMatch![0];

      // Find positions of clean and pnpm install
      const cleanIndex = setupRecipe.search(/cyclist-clean|rm -rf.*dist/);
      const pnpmIndex = setupRecipe.search(/pnpm install/);

      // Clean should come before pnpm install
      expect(cleanIndex).toBeGreaterThan(-1);
      expect(pnpmIndex).toBeGreaterThan(-1);
      expect(cleanIndex).toBeLessThan(pnpmIndex);
    });

    it('should mention cleaning in setup output', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      const setupMatch = content.match(/cyclist-setup:[\s\S]*?(?=\n[a-z]+-[a-z]+:|$)/);
      expect(setupMatch).not.toBeNull();
      const setupRecipe = setupMatch![0];
      // Should have a step mentioning cleaning or removing
      expect(setupRecipe).toMatch(/[Cc]lean|[Rr]emov/);
    });
  });

  describe('AC3: install-cli.sh warns on relocation', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'install-cli.sh');

    it('should check if existing CLI wrapper exists', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should check if /usr/local/bin/cyclist exists before overwriting
      expect(content).toMatch(/\-[fe]\s+["']?\$CLI_PATH|test\s+-[fe].*cyclist|if.*exists.*cyclist/i);
    });

    it('should read CYCLIST_ROOT from existing wrapper', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should extract CYCLIST_ROOT or CYCLIST_DIR from existing wrapper
      expect(content).toMatch(/grep.*CYCLIST|sed.*CYCLIST|awk.*CYCLIST|read.*existing|EXISTING_/i);
    });

    it('should compare existing path with current path', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should compare the extracted path with current CYCLIST_DIR
      expect(content).toMatch(/EXISTING.*!=|!=.*EXISTING|different.*path|path.*different|compare/i);
    });

    it('should warn if CLI points to different location', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should use log_warn or echo warning about different location
      expect(content).toMatch(/log_warn.*different|log_warn.*location|log_warn.*exists|warn.*relocat|WARN.*point/i);
    });

    it('should suggest removing old CLI or explain relocation', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should provide guidance on what to do
      expect(content).toMatch(/rm.*cyclist|remove.*old|replacing|overwrite|proceed/i);
    });

    it('should show both old and new paths in warning', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Warning should include both the existing path and new path for clarity
      expect(content).toMatch(/EXISTING.*CYCLIST|from.*to|old.*new|current.*previous/i);
    });
  });

  describe('Documentation existence checks', () => {
    // These don't test content (that's AC1/AC4), just that sections exist
    const readmePath = join(CYCLIST_ROOT, 'README.md');

    it('should have an Upgrading section in README', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/##\s*[Uu]pgrad/);
    });

    it('should reference cyclist-doctor in upgrade documentation', () => {
      const content = readFileSync(readmePath, 'utf-8');
      // The upgrade section should mention cyclist-doctor as diagnostic tool
      const upgradeMatch = content.match(/##\s*[Uu]pgrad[\s\S]*?(?=\n##\s|$)/);
      expect(upgradeMatch).not.toBeNull();
      expect(upgradeMatch![0]).toMatch(/cyclist-doctor/);
    });

    it('should document when rebuild is needed', () => {
      const content = readFileSync(readmePath, 'utf-8');
      // Should mention scenarios requiring rebuild
      expect(content).toMatch(/when.*rebuild|rebuild.*when|node.*upgrade|after.*pull|pnpm.*update/i);
    });
  });
});
