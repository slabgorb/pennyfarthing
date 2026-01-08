/**
 * E1-1: Build Tests
 *
 * These tests verify TypeScript compilation works correctly.
 * AC3: TypeScript compilation works (`npm run build`)
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

describe('AC3: TypeScript compilation', () => {

  it('should have a valid tsconfig.json', () => {
    const tsconfigPath = join(process.cwd(), 'tsconfig.json');
    expect(existsSync(tsconfigPath)).toBe(true);
  });

  it('should have src/server.ts as entry point', () => {
    const serverPath = join(process.cwd(), 'src', 'server.ts');
    expect(existsSync(serverPath)).toBe(true);
  });

  it('should compile without errors', () => {
    // This will throw if compilation fails
    expect(() => {
      execSync('npm run build', {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  it('should output compiled files to dist/', () => {
    const distPath = join(process.cwd(), 'dist', 'server.js');
    expect(existsSync(distPath)).toBe(true);
  });

});
