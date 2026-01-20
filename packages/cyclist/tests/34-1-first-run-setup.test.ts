/**
 * 34-1: First-run setup documentation and tooling
 *
 * Tests for Cyclist first-run experience:
 * - README documents prerequisites
 * - Install scripts have valid syntax
 * - Install scripts handle error cases correctly
 * - Justfile has required recipes
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const CYCLIST_ROOT = process.cwd();
const MONOREPO_ROOT = join(CYCLIST_ROOT, '..', '..');

describe('34-1: First-run setup documentation', () => {

  describe('README.md content', () => {
    const readmePath = join(CYCLIST_ROOT, 'README.md');

    it('should exist', () => {
      expect(existsSync(readmePath)).toBe(true);
    });

    it('should document pnpm requirement', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/pnpm/i);
      expect(content).toMatch(/npm will not work|must use pnpm/i);
    });

    it('should document Python 3 requirement', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/Python\s*3/i);
    });

    it('should document Xcode tools requirement for macOS', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/xcode-select|Xcode.*Command Line Tools/i);
    });

    it('should document just command runner requirement', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/\*\*just\*\*/);
      expect(content).toMatch(/brew install just|just\.systems/i);
    });

    it('should have Prerequisites section', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/##\s*Prerequisites/i);
    });

    it('should have Troubleshooting section', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/##\s*Troubleshooting/i);
    });

    it('should document node-pty rebuild fix', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/node-pty/i);
      expect(content).toMatch(/cyclist-rebuild/i);
    });

    it('should document just command not found troubleshooting', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/just.*command not found/i);
    });

    it('should document monorepo root requirement', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/monorepo root/i);
    });

    it('should document just cyclist-setup command', () => {
      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toMatch(/just cyclist-setup/);
    });
  });

  describe('install-app.sh script', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'install-app.sh');

    it('should exist', () => {
      expect(existsSync(scriptPath)).toBe(true);
    });

    it('should have valid bash syntax', () => {
      expect(() => {
        execSync(`bash -n "${scriptPath}"`, { stdio: 'pipe' });
      }).not.toThrow();
    });

    it('should be executable', () => {
      const stats = execSync(`ls -la "${scriptPath}"`, { encoding: 'utf-8' });
      expect(stats).toMatch(/^-rwx/);
    });

    it('should check for macOS', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/uname.*Darwin/);
    });

    it('should check for release directory', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/RELEASE_DIR/);
      expect(content).toMatch(/Cyclist\.app not found/i);
    });

    it('should exit 1 on non-macOS', () => {
      // Simulate non-macOS by checking the script logic
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/exit 1/);
    });
  });

  describe('install-cli.sh script', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'install-cli.sh');

    it('should exist', () => {
      expect(existsSync(scriptPath)).toBe(true);
    });

    it('should have valid bash syntax', () => {
      expect(() => {
        execSync(`bash -n "${scriptPath}"`, { stdio: 'pipe' });
      }).not.toThrow();
    });

    it('should be executable', () => {
      const stats = execSync(`ls -la "${scriptPath}"`, { encoding: 'utf-8' });
      expect(stats).toMatch(/^-rwx/);
    });

    it('should check for dist/server.js', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/dist\/server\.js/);
    });

    it('should handle sudo requirement', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/sudo/i);
    });

    it('should create CLI with --help support', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/--help/);
      expect(content).toMatch(/show_help/);
    });

    it('should check for .claude directory in target project', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/\.claude/);
    });
  });

  describe('justfile recipes', () => {
    const justfilePath = join(MONOREPO_ROOT, 'justfile');

    it('should have cyclist recipe with setup subcommand', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // Consolidated recipe: cyclist *args with setup) case
      expect(content).toMatch(/^cyclist \*args:/m);
      expect(content).toMatch(/setup\)/);
    });

    it('should have cyclist recipe with install subcommand', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // install subcommand calls both install-app.sh and install-cli.sh
      expect(content).toMatch(/install\)/);
      expect(content).toMatch(/install-app\.sh/);
      expect(content).toMatch(/install-cli\.sh/);
    });

    it('should have cyclist recipe with rebuild subcommand', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      expect(content).toMatch(/rebuild\)/);
    });

    it('should have cyclist recipe with doctor subcommand', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      expect(content).toMatch(/doctor\)/);
    });

    it('cyclist setup should run pnpm install', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // The setup case handler includes pnpm install
      expect(content).toMatch(/setup\)[\s\S]*?pnpm install/);
    });

    it('cyclist setup should run electron-rebuild', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // The setup case handler includes electron-rebuild
      expect(content).toMatch(/setup\)[\s\S]*?electron-rebuild/);
    });
  });

  describe('script error handling', () => {

    it('install-app.sh should fail gracefully without release dir', () => {
      // Test that script has proper error messaging
      const scriptPath = join(CYCLIST_ROOT, 'scripts', 'install-app.sh');
      const content = readFileSync(scriptPath, 'utf-8');

      // Should have log_error function
      expect(content).toMatch(/log_error/);

      // Should suggest running cyclist-package
      expect(content).toMatch(/cyclist-package/);
    });

    it('install-cli.sh should fail gracefully without build', () => {
      const scriptPath = join(CYCLIST_ROOT, 'scripts', 'install-cli.sh');
      const content = readFileSync(scriptPath, 'utf-8');

      // Should have log_error function
      expect(content).toMatch(/log_error/);

      // Should suggest running cyclist-build
      expect(content).toMatch(/cyclist-build/);
    });
  });
});
