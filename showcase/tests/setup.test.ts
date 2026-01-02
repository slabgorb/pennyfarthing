/**
 * Story 13-1: Setup Verification Tests
 *
 * These tests verify the Astro project is correctly configured with
 * React, Tailwind, and TypeScript strict mode.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

describe('Story 13-1: Project Setup', () => {
  describe('AC1: Astro project in showcase/ with package.json', () => {
    it('should have package.json', () => {
      expect(existsSync(join(ROOT, 'package.json'))).toBe(true);
    });

    it('should have astro as a dependency', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      const hasAstro = pkg.dependencies?.astro || pkg.devDependencies?.astro;
      expect(hasAstro).toBeDefined();
    });

    it('should have astro.config.mjs', () => {
      expect(existsSync(join(ROOT, 'astro.config.mjs'))).toBe(true);
    });
  });

  describe('AC2: React integration working', () => {
    it('should have @astrojs/react as a dependency', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      const hasReact =
        pkg.dependencies?.['@astrojs/react'] ||
        pkg.devDependencies?.['@astrojs/react'];
      expect(hasReact).toBeDefined();
    });

    it('should have react and react-dom as dependencies', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      const hasReact = pkg.dependencies?.react || pkg.devDependencies?.react;
      const hasReactDom = pkg.dependencies?.['react-dom'] || pkg.devDependencies?.['react-dom'];
      expect(hasReact).toBeDefined();
      expect(hasReactDom).toBeDefined();
    });

    it('should have react integration configured in astro.config.mjs', () => {
      const config = readFileSync(join(ROOT, 'astro.config.mjs'), 'utf-8');
      expect(config).toContain('react');
    });
  });

  describe('AC3: Tailwind CSS configured and working', () => {
    it('should have @tailwindcss/vite or @astrojs/tailwind as a dependency', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      // Tailwind v4 uses @tailwindcss/vite, v3 uses @astrojs/tailwind
      const hasTailwindV4 =
        pkg.dependencies?.['@tailwindcss/vite'] ||
        pkg.devDependencies?.['@tailwindcss/vite'];
      const hasTailwindV3 =
        pkg.dependencies?.['@astrojs/tailwind'] ||
        pkg.devDependencies?.['@astrojs/tailwind'];
      expect(hasTailwindV4 || hasTailwindV3).toBeDefined();
    });

    it('should have tailwindcss as a dependency', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      const hasTailwindCss =
        pkg.dependencies?.tailwindcss ||
        pkg.devDependencies?.tailwindcss;
      expect(hasTailwindCss).toBeDefined();
    });

    it('should have tailwind configured in astro.config.mjs', () => {
      const config = readFileSync(join(ROOT, 'astro.config.mjs'), 'utf-8');
      // Check for either tailwindcss import (v4) or tailwind integration (v3)
      expect(config).toMatch(/tailwind/i);
    });

    it('should have global.css with tailwind import', () => {
      // Tailwind v4 uses @import "tailwindcss" in CSS
      const cssPath = join(ROOT, 'src/styles/global.css');
      expect(existsSync(cssPath)).toBe(true);
      const css = readFileSync(cssPath, 'utf-8');
      expect(css).toContain('tailwindcss');
    });
  });

  describe('AC4: Build outputs to docs/ directory', () => {
    it('should configure outDir to ../docs/showcase in astro.config.mjs', () => {
      const config = readFileSync(join(ROOT, 'astro.config.mjs'), 'utf-8');
      // Check for outDir configuration pointing to docs/showcase
      expect(config).toMatch(/outDir.*['"]\.\.\/docs\/showcase['"]/);
    });
  });

  describe('AC5: TypeScript strict mode enabled', () => {
    it('should have tsconfig.json', () => {
      expect(existsSync(join(ROOT, 'tsconfig.json'))).toBe(true);
    });

    it('should have strict mode enabled in tsconfig.json', () => {
      const tsconfig = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf-8'));
      // Astro uses extends, so check for strict or the astro/tsconfigs/strict base
      const isStrict =
        tsconfig.compilerOptions?.strict === true ||
        tsconfig.extends?.includes('strict');
      expect(isStrict).toBe(true);
    });
  });
});
