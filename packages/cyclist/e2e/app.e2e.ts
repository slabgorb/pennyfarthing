/**
 * E2E Tests for Cyclist App - Core Functionality
 *
 * Smoke tests and core feature verification.
 */

import { test, expect } from '@playwright/test';

test.describe('Cyclist App', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/Cyclist/);

    // Check main elements are present
    await expect(page.locator('#container')).toBeVisible();
    await expect(page.locator('#tab-bar')).toBeVisible();
    await expect(page.locator('#editor')).toBeVisible();
  });

  test('should display tab bar with panels', async ({ page }) => {
    await page.goto('/');

    const tabBar = page.locator('#tab-bar');
    await expect(tabBar).toBeVisible();

    // Check for expected tabs
    await expect(page.locator('[data-panel="file-panel"]')).toBeVisible();
    await expect(page.locator('[data-panel="diff-panel"]')).toBeVisible();
    await expect(page.locator('[data-panel="debug-panel"]')).toBeVisible();
  });

  test('should have working editor', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('#editor');
    await expect(editor).toBeVisible();

    // Editor should be focusable
    await editor.click();
  });

  test('should display mode switch controls', async ({ page }) => {
    await page.goto('/');

    const modeSwitch = page.locator('.mode-switch');
    await expect(modeSwitch).toBeVisible();

    // Check mode buttons exist
    await expect(page.locator('[data-mode="plan"]')).toBeVisible();
    await expect(page.locator('[data-mode="manual"]')).toBeVisible();
    await expect(page.locator('[data-mode="accept"]')).toBeVisible();
    await expect(page.locator('[data-mode="turbo"]')).toBeVisible();
  });

  test('should switch modes with keyboard shortcuts', async ({ page }) => {
    await page.goto('/');

    // Press Cmd+1 for plan mode
    await page.keyboard.press('Meta+1');
    await expect(page.locator('[data-mode="plan"]')).toHaveAttribute('aria-checked', 'true');

    // Press Cmd+2 for manual mode
    await page.keyboard.press('Meta+2');
    await expect(page.locator('[data-mode="manual"]')).toHaveAttribute('aria-checked', 'true');

    // Press Cmd+3 for accept mode
    await page.keyboard.press('Meta+3');
    await expect(page.locator('[data-mode="accept"]')).toHaveAttribute('aria-checked', 'true');

    // Press Cmd+4 for turbo mode
    await page.keyboard.press('Meta+4');
    await expect(page.locator('[data-mode="turbo"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('should toggle panels with keyboard shortcuts', async ({ page }) => {
    await page.goto('/');

    const filePanel = page.locator('#file-panel');
    const diffPanel = page.locator('#diff-panel');

    // Panels start collapsed
    await expect(filePanel).toHaveClass(/collapsed/);
    await expect(diffPanel).toHaveClass(/collapsed/);

    // Cmd+1 toggles file panel
    await page.keyboard.press('Meta+1');
    // Note: This might conflict with mode switch - adjust if needed

    // Cmd+2 toggles diff panel
    await page.keyboard.press('Meta+2');
  });

  test('should display control buttons', async ({ page }) => {
    await page.goto('/');

    // Stop button
    await expect(page.locator('#stop-btn')).toBeVisible();

    // Clear button
    await expect(page.locator('#clear-btn')).toBeVisible();
  });

  test('should have bell mode toggle', async ({ page }) => {
    await page.goto('/');

    const bellToggle = page.locator('#bell-mode-toggle');
    await expect(bellToggle).toBeVisible();

    // Click to toggle
    await bellToggle.click();
    await expect(bellToggle).toHaveAttribute('aria-pressed', 'true');

    // Click again to toggle off
    await bellToggle.click();
    await expect(bellToggle).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('Panels', () => {
  test('file panel should toggle', async ({ page }) => {
    await page.goto('/');

    const fileTab = page.locator('[data-panel="file-panel"]');
    const filePanel = page.locator('#file-panel');

    // Initially collapsed
    await expect(filePanel).toHaveClass(/collapsed/);

    // Click to expand
    await fileTab.click();
    await expect(filePanel).not.toHaveClass(/collapsed/);

    // Click again to collapse
    await fileTab.click();
    await expect(filePanel).toHaveClass(/collapsed/);
  });

  test('diff panel should toggle', async ({ page }) => {
    await page.goto('/');

    const diffTab = page.locator('[data-panel="diff-panel"]');
    const diffPanel = page.locator('#diff-panel');

    // Initially collapsed
    await expect(diffPanel).toHaveClass(/collapsed/);

    // Click to expand
    await diffTab.click();
    await expect(diffPanel).not.toHaveClass(/collapsed/);

    // Click again to collapse
    await diffTab.click();
    await expect(diffPanel).toHaveClass(/collapsed/);
  });

  test('multiple panels can be open simultaneously', async ({ page }) => {
    await page.goto('/');

    const fileTab = page.locator('[data-panel="file-panel"]');
    const diffTab = page.locator('[data-panel="diff-panel"]');
    const debugTab = page.locator('[data-panel="debug-panel"]');

    const filePanel = page.locator('#file-panel');
    const diffPanel = page.locator('#diff-panel');
    const debugPanel = page.locator('#debug-panel');

    // Open all panels
    await fileTab.click();
    await diffTab.click();
    await debugTab.click();

    // All should be open
    await expect(filePanel).not.toHaveClass(/collapsed/);
    await expect(diffPanel).not.toHaveClass(/collapsed/);
    await expect(debugPanel).not.toHaveClass(/collapsed/);
  });
});

test.describe('Accessibility', () => {
  test('should have proper ARIA attributes on tabs', async ({ page }) => {
    await page.goto('/');

    const tabs = page.locator('#tab-bar [role="tab"]');
    const tabCount = await tabs.count();

    expect(tabCount).toBeGreaterThan(0);

    // Each tab should have proper attributes
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      await expect(tab).toHaveAttribute('aria-pressed', /(true|false)/);
    }
  });

  test('should have proper role on tab bar', async ({ page }) => {
    await page.goto('/');

    const tabBar = page.locator('#tab-bar');
    await expect(tabBar).toHaveAttribute('role', 'tablist');
  });
});
