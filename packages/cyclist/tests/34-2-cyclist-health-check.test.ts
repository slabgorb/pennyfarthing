/**
 * 34-2: Cyclist health check command
 *
 * Tests for the cyclist-doctor health check script:
 * - Script exists and has valid syntax
 * - Checks system prerequisites
 * - Checks build state
 * - Checks native modules and workspace deps
 * - Provides actionable fix commands
 * - Supports --fix flag for auto-remediation
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const CYCLIST_ROOT = process.cwd();
const MONOREPO_ROOT = join(CYCLIST_ROOT, '..', '..');

describe('34-2: Cyclist health check command', () => {

  describe('cyclist-doctor.sh script basics', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

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

    it('should use strict mode (set -euo pipefail)', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/set -euo pipefail/);
    });
  });

  describe('--help flag support', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should have show_help function', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/show_help\s*\(\)/);
    });

    it('should handle --help flag', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/--help/);
    });

    it('should handle -h flag', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/-h\b/);
    });

    it('should document usage in help', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/[Uu]sage:/);
    });
  });

  describe('--fix flag support', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should handle --fix flag', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/--fix/);
    });

    it('should have FIX_MODE variable or equivalent', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Could be FIX_MODE, AUTO_FIX, DO_FIX, etc.
      expect(content).toMatch(/FIX|fix.*mode|auto.*fix/i);
    });

    it('should document --fix in help output', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Help should mention the fix flag
      expect(content).toMatch(/--fix.*auto|auto.*--fix|fix.*issues/i);
    });
  });

  describe('system prerequisite checks', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should check Node.js version', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/node.*--version|node.*-v/i);
    });

    it('should verify Node >= 18', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/18/);
    });

    it('should check pnpm availability', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/pnpm/);
    });

    it('should check Python 3 availability', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/python3/i);
    });

    it('should check Xcode Command Line Tools (macOS)', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/xcode-select/);
    });

    it('should check just command runner', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/just.*--version|command.*just/i);
    });

    it('should provide fix command for missing Node', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/brew install node|nvm|nodejs/i);
    });

    it('should provide fix command for missing pnpm', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/npm install.*pnpm|corepack/i);
    });

    it('should provide fix command for missing just', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/brew install just/i);
    });
  });

  describe('build state checks', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should check for dist/server.js', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/dist\/server\.js/);
    });

    it('should check for dist/main.js', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/dist\/main\.js/);
    });

    it('should provide fix command for missing build', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/cyclist-build|npm run build/i);
    });
  });

  describe('node-pty native module checks', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should check for node-pty prebuild', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/node-pty|prebuilds/i);
    });

    it('should detect current platform architecture', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should check darwin-arm64 or darwin-x64
      expect(content).toMatch(/uname|arch|darwin|arm64|x64/i);
    });

    it('should check if node-pty is loadable', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should try to require or test node-pty
      expect(content).toMatch(/require.*node-pty|node.*-e.*node-pty/i);
    });

    it('should provide fix command for broken node-pty', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/cyclist-rebuild|electron-rebuild/i);
    });
  });

  describe('Electron compatibility check', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should check Electron version', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/electron|ELECTRON/i);
    });

    it('should verify Electron and node-pty compatibility', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should mention version compatibility or ABI
      expect(content).toMatch(/compat|ABI|version.*match|electron.*node-pty/i);
    });
  });

  describe('workspace dependency checks', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should check @pennyfarthing/core symlink', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/pennyfarthing\/core|@pennyfarthing.*core/i);
    });

    it('should check @pennyfarthing/shared symlink', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/pennyfarthing\/shared|@pennyfarthing.*shared/i);
    });

    it('should verify symlinks point to valid directories', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should check -L (symlink) and -d (directory target exists)
      expect(content).toMatch(/-L|-d|readlink|symlink/i);
    });

    it('should provide fix command for broken workspace deps', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/pnpm install|monorepo root/i);
    });
  });

  describe('port 1898 availability check', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should check port 1898', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/1898/);
    });

    it('should use lsof or netstat to check port', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/lsof|netstat|ss /i);
    });

    it('should warn (not fail) if port in use', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should use warning, not error, for port check
      expect(content).toMatch(/warn|WARN|warning/i);
    });
  });

  describe('output formatting', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should define color codes', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // ANSI color codes
      expect(content).toMatch(/\\033\[|\\e\[/);
    });

    it('should have green color for pass', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/GREEN|32m/i);
    });

    it('should have red color for fail', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/RED|31m/i);
    });

    it('should have yellow color for warn', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/YELLOW|33m/i);
    });

    it('should have log_pass or check_pass function', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/log_pass|check_pass|log_ok|pass\s*\(\)/i);
    });

    it('should have log_fail or check_fail function', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/log_fail|check_fail|log_error|fail\s*\(\)/i);
    });

    it('should have log_warn function', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/log_warn|check_warn|warn\s*\(\)/i);
    });
  });

  describe('exit code handling', () => {
    const scriptPath = join(CYCLIST_ROOT, 'scripts', 'cyclist-doctor.sh');

    it('should track failure count', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should have a counter for failures
      expect(content).toMatch(/FAIL.*COUNT|fail.*count|errors|ERRORS/i);
    });

    it('should exit 0 when all checks pass', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/exit 0/);
    });

    it('should exit 1 when checks fail', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toMatch(/exit 1/);
    });

    it('should show summary at end', () => {
      const content = readFileSync(scriptPath, 'utf-8');
      // Should have a summary section
      expect(content).toMatch(/summary|Summary|SUMMARY|passed|failed/i);
    });
  });

  describe('justfile integration', () => {
    const justfilePath = join(MONOREPO_ROOT, 'justfile');

    it('should have cyclist recipe with doctor subcommand', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // Consolidated recipe: cyclist *args with doctor) case
      expect(content).toMatch(/^cyclist \*args:/m);
      expect(content).toMatch(/doctor\)/);
    });

    it('cyclist doctor should run scripts/cyclist-doctor.sh', () => {
      const content = readFileSync(justfilePath, 'utf-8');
      // The doctor) case handler runs cyclist-doctor.sh
      expect(content).toMatch(/doctor\)[\s\S]*?cyclist-doctor\.sh/);
    });
  });
});
