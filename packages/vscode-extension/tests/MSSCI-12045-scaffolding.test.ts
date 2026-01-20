/**
 * MSSCI-12045: Extension scaffolding with Yeoman generator
 *
 * These tests verify the VS Code extension scaffolding is properly configured.
 * Tests are written to FAIL until Dev implements the scaffolding.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const EXTENSION_ROOT = join(__dirname, '..');

describe('MSSCI-12045: VS Code Extension Scaffolding', () => {

  describe('AC1: packages/vscode-extension directory with valid package.json', () => {

    it('should have package.json in extension directory', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      expect(existsSync(packagePath)).toBe(true);
    });

    it('should have valid JSON in package.json', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      expect(() => {
        const content = readFileSync(packagePath, 'utf-8');
        JSON.parse(content);
      }).not.toThrow();
    });

    it('should have required VS Code extension fields', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));

      // VS Code extension requirements
      expect(pkg.name).toBe('@pennyfarthing/vscode-extension');
      expect(pkg.publisher).toBeDefined();
      expect(pkg.engines?.vscode).toBeDefined();
      expect(pkg.main).toBeDefined();
    });

    it('should have correct package name for monorepo', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(pkg.name).toBe('@pennyfarthing/vscode-extension');
    });
  });

  describe('AC2: Extension compiles with npm run build (esbuild)', () => {

    it('should have build script in package.json', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(pkg.scripts?.build).toBeDefined();
    });

    it('should have esbuild as dev dependency', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(pkg.devDependencies?.esbuild).toBeDefined();
    });

    it('should have tsconfig.json', () => {
      const tsconfigPath = join(EXTENSION_ROOT, 'tsconfig.json');
      expect(existsSync(tsconfigPath)).toBe(true);
    });

    it('should have src/extension.ts entry point', () => {
      const extensionPath = join(EXTENSION_ROOT, 'src', 'extension.ts');
      expect(existsSync(extensionPath)).toBe(true);
    });

    it('should compile without errors', () => {
      expect(() => {
        execSync('npm run build', {
          cwd: EXTENSION_ROOT,
          stdio: 'pipe',
        });
      }).not.toThrow();
    });

    it('should output compiled extension to dist/', () => {
      const distPath = join(EXTENSION_ROOT, 'dist', 'extension.js');
      expect(existsSync(distPath)).toBe(true);
    });
  });

  describe('AC3: Extension loads in VS Code Extension Development Host', () => {
    // Note: Full F5 testing requires manual VS Code interaction
    // We verify the manifest is properly configured for activation

    it('should have valid contributes section', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      // At minimum, extension should have commands or other contributions
      expect(pkg.contributes).toBeDefined();
    });

    it('should have activation events defined', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(pkg.activationEvents).toBeDefined();
      expect(Array.isArray(pkg.activationEvents)).toBe(true);
      expect(pkg.activationEvents.length).toBeGreaterThan(0);
    });

    it('should export activate and deactivate functions', () => {
      const extensionPath = join(EXTENSION_ROOT, 'src', 'extension.ts');
      const content = readFileSync(extensionPath, 'utf-8');
      expect(content).toMatch(/export\s+(async\s+)?function\s+activate/);
      expect(content).toMatch(/export\s+(async\s+)?function\s+deactivate/);
    });
  });

  describe('AC4: package.json includes pennyfarthing activation events', () => {

    it('should activate on workspaceContains:.pennyfarthing', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(pkg.activationEvents).toContain('workspaceContains:.pennyfarthing');
    });

    it('should activate on workspaceContains:.claude', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      expect(pkg.activationEvents).toContain('workspaceContains:.claude');
    });
  });

  describe('AC5: pnpm workspace recognizes the new package', () => {

    it('should be listed in pnpm workspace packages', () => {
      // Run pnpm list from monorepo root to verify workspace recognition
      const output = execSync('pnpm list --filter @pennyfarthing/vscode-extension --json', {
        cwd: join(EXTENSION_ROOT, '..', '..'),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // If package is recognized, output will contain package info
      // If not recognized, command will fail or return empty
      expect(output).toContain('@pennyfarthing/vscode-extension');
    });

    it('should have workspace:* dependency pattern for internal packages', () => {
      const packagePath = join(EXTENSION_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));

      // Check if it uses workspace protocol for internal deps
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const internalDeps = Object.entries(deps).filter(([name]) =>
        name.startsWith('@pennyfarthing/')
      );

      // If there are internal deps, they should use workspace:*
      for (const [name, version] of internalDeps) {
        expect(version).toBe('workspace:*');
      }
    });
  });
});
