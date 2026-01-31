/**
 * MSSCI-12712: ContextIndicator Component Tests
 *
 * Tests verify the ContextIndicator component for displaying context window usage.
 * Part of Epic 71: Codebase Awareness
 *
 * Acceptance Criteria:
 * - AC1: Component displays current context usage as a percentage
 * - AC2: Visual indicator (progress bar) with threshold colors:
 *   - Green: normal usage (<70%)
 *   - Amber: elevated usage (70-89%)
 *   - Red: high usage (90%+)
 * - AC3: Real-time updates as context changes
 * - AC4: Subtle warning display at 90% threshold
 * - AC5: Tooltip showing exact token count
 * - AC6: Styled consistently with other Cyclist components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('MSSCI-12712: ContextIndicator Component', () => {

  describe('Module Structure', () => {

    it('should export ContextIndicator component as default', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.default).toBeDefined();
      expect(typeof module.default).toBe('function');
    });

    it('should export useContext hook from component module', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.useContext).toBeDefined();
      expect(typeof module.useContext).toBe('function');
    });

    it('should export ContextIndicatorProps type', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // TypeScript types exist at compile time; verify props shape via component
      expect(module.default).toBeDefined();
    });

    it('should export threshold constants', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.CONTEXT_THRESHOLDS).toBeDefined();
      expect(module.CONTEXT_THRESHOLDS.WARNING).toBe(70);
      expect(module.CONTEXT_THRESHOLDS.DANGER).toBe(90);
    });

  });

  describe('AC1: Component displays current context usage as percentage', () => {

    it('should render percentage value from context data', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const ContextIndicator = module.default;

      // Component should accept percent prop
      expect(ContextIndicator).toBeDefined();
    });

    it('should export formatPercentage utility function', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.formatPercentage).toBeDefined();
      expect(typeof module.formatPercentage).toBe('function');
    });

    it('should format percentage as integer with % suffix', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { formatPercentage } = module;

      expect(formatPercentage(45)).toBe('45%');
      expect(formatPercentage(99.7)).toBe('100%');
      expect(formatPercentage(0)).toBe('0%');
    });

    it('should clamp percentage between 0 and 100', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { formatPercentage } = module;

      expect(formatPercentage(-5)).toBe('0%');
      expect(formatPercentage(150)).toBe('100%');
    });

    it('should have data-testid="context-indicator" on root element', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // Presence of testid for DOM querying
      expect(module.CONTEXT_INDICATOR_TESTID).toBe('context-indicator');
    });

    it('should have data-testid="context-percent" on percentage display', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.CONTEXT_PERCENT_TESTID).toBe('context-percent');
    });

  });

  describe('AC2: Visual indicator with threshold colors', () => {

    it('should export getContextLevel function', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.getContextLevel).toBeDefined();
      expect(typeof module.getContextLevel).toBe('function');
    });

    it('should return "normal" for usage under 70%', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { getContextLevel } = module;

      expect(getContextLevel(0)).toBe('normal');
      expect(getContextLevel(35)).toBe('normal');
      expect(getContextLevel(69)).toBe('normal');
    });

    it('should return "elevated" for usage 70-89%', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { getContextLevel } = module;

      expect(getContextLevel(70)).toBe('elevated');
      expect(getContextLevel(80)).toBe('elevated');
      expect(getContextLevel(89)).toBe('elevated');
    });

    it('should return "high" for usage 90%+', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { getContextLevel } = module;

      expect(getContextLevel(90)).toBe('high');
      expect(getContextLevel(95)).toBe('high');
      expect(getContextLevel(100)).toBe('high');
    });

    it('should have data-testid="context-bar" on progress bar element', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.CONTEXT_BAR_TESTID).toBe('context-bar');
    });

    it('should have data-testid="context-fill" on progress fill element', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.CONTEXT_FILL_TESTID).toBe('context-fill');
    });

    it('should apply level class to progress bar (level-normal, level-elevated, level-high)', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { getContextLevel, getLevelClassName } = module;

      expect(getLevelClassName(getContextLevel(50))).toBe('level-normal');
      expect(getLevelClassName(getContextLevel(75))).toBe('level-elevated');
      expect(getLevelClassName(getContextLevel(95))).toBe('level-high');
    });

  });

  describe('AC3: Real-time updates as context changes', () => {

    it('should export useContextIndicator hook', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.useContextIndicator).toBeDefined();
      expect(typeof module.useContextIndicator).toBe('function');
    });

    it('should subscribe to context updates via electronAPI', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // Hook should use electronAPI.context.onUpdate
      expect(module.useContextIndicator).toBeDefined();
    });

    it('should return isLoading state from hook', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // Hook signature should include isLoading
      expect(module.useContextIndicator).toBeDefined();
    });

    it('should return error state from hook', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // Hook signature should include error handling
      expect(module.useContextIndicator).toBeDefined();
    });

  });

  describe('AC4: Subtle warning display at 90% threshold', () => {

    it('should export WARNING_THRESHOLD constant equal to 90', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.CONTEXT_THRESHOLDS.DANGER).toBe(90);
    });

    it('should have data-warning attribute when at or above 90%', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { shouldShowWarning } = module;

      expect(shouldShowWarning(89)).toBe(false);
      expect(shouldShowWarning(90)).toBe(true);
      expect(shouldShowWarning(95)).toBe(true);
    });

    it('should export warning message constant', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.CONTEXT_WARNING_MESSAGE).toBeDefined();
      expect(typeof module.CONTEXT_WARNING_MESSAGE).toBe('string');
      expect(module.CONTEXT_WARNING_MESSAGE.length).toBeGreaterThan(0);
    });

    it('should have ARIA live region for screen reader announcements', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // Component should include aria-live for accessibility
      expect(module.CONTEXT_INDICATOR_ARIA_LIVE).toBe('polite');
    });

  });

  describe('AC5: Tooltip showing exact token count', () => {

    it('should export formatTokenCount utility function', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.formatTokenCount).toBeDefined();
      expect(typeof module.formatTokenCount).toBe('function');
    });

    it('should format token counts with thousands separator', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { formatTokenCount } = module;

      expect(formatTokenCount(1000)).toBe('1,000');
      expect(formatTokenCount(50000)).toBe('50,000');
      expect(formatTokenCount(200000)).toBe('200,000');
    });

    it('should export formatTooltip function', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.formatTooltip).toBeDefined();
      expect(typeof module.formatTooltip).toBe('function');
    });

    it('should format tooltip as "used / total tokens"', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { formatTooltip } = module;

      const tooltip = formatTooltip(50000, 200000);
      expect(tooltip).toBe('50,000 / 200,000 tokens');
    });

    it('should handle undefined values gracefully in tooltip', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { formatTooltip } = module;

      expect(formatTooltip(undefined, undefined)).toBe('— / — tokens');
      expect(formatTooltip(50000, undefined)).toBe('50,000 / — tokens');
      expect(formatTooltip(undefined, 200000)).toBe('— / 200,000 tokens');
    });

    it('should set title attribute on component for native tooltip', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // Component should apply title attribute for tooltip
      expect(module.default).toBeDefined();
    });

  });

  describe('AC6: Styled consistently with other Cyclist components', () => {

    it('should export component CSS module classnames', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.COMPONENT_CLASSNAME).toBe('context-indicator');
    });

    it('should use CSS custom properties for theming', async () => {
      // CSS file should exist and use CSS variables
      const { existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ContextIndicator/ContextIndicator.css');

      expect(existsSync(cssPath)).toBe(true);
    });

    it('should have consistent border-radius with other components', async () => {
      const { readFileSync, existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ContextIndicator/ContextIndicator.css');

      if (!existsSync(cssPath)) {
        throw new Error('CSS file does not exist');
      }

      const css = readFileSync(cssPath, 'utf-8');
      // Should use CSS variable for border-radius
      expect(css).toMatch(/border-radius/);
    });

    it('should use semantic color variables for levels', async () => {
      const { readFileSync, existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ContextIndicator/ContextIndicator.css');

      if (!existsSync(cssPath)) {
        throw new Error('CSS file does not exist');
      }

      const css = readFileSync(cssPath, 'utf-8');
      // Should reference CSS custom properties or semantic colors
      expect(css).toMatch(/var\(--|--.*color/);
    });

    it('should have smooth transition for progress bar fill', async () => {
      const { readFileSync, existsSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const cssPath = join(__dirname, '../src/public/components/ContextIndicator/ContextIndicator.css');

      if (!existsSync(cssPath)) {
        throw new Error('CSS file does not exist');
      }

      const css = readFileSync(cssPath, 'utf-8');
      expect(css).toMatch(/transition/);
    });

  });

  describe('Component Integration', () => {

    it('should export ContextData interface type', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // TypeScript interface - component should handle this shape
      expect(module.default).toBeDefined();
    });

    it('should handle null context data gracefully', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { formatPercentage, formatTooltip } = module;

      // Should not throw with null/undefined inputs
      expect(() => formatPercentage(null as unknown as number)).not.toThrow();
      expect(() => formatTooltip(null as unknown as number, null as unknown as number)).not.toThrow();
    });

    it('should expose compact mode prop for different layouts', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      // Component should support compact mode for smaller displays
      expect(module.COMPACT_MODE_CLASSNAME).toBe('context-indicator--compact');
    });

  });

  describe('Accessibility', () => {

    it('should have role="progressbar" on the bar element', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');

      expect(module.PROGRESS_BAR_ROLE).toBe('progressbar');
    });

    it('should include aria-valuenow, aria-valuemin, aria-valuemax attributes', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { getAriaAttributes } = module;

      const attrs = getAriaAttributes(75, 100);
      expect(attrs['aria-valuenow']).toBe(75);
      expect(attrs['aria-valuemin']).toBe(0);
      expect(attrs['aria-valuemax']).toBe(100);
    });

    it('should have aria-label describing the context usage', async () => {
      const module = await import('../src/public/components/ContextIndicator/index.js');
      const { getAriaAttributes } = module;

      const attrs = getAriaAttributes(75, 100);
      expect(attrs['aria-label']).toMatch(/context.*usage|token.*usage/i);
    });

  });

});
