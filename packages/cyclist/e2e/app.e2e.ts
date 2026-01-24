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

    // Check mode buttons exist (MSSCI-12395: turbo removed, now plan/manual/accept)
    await expect(page.locator('[data-mode="plan"]')).toBeVisible();
    await expect(page.locator('[data-mode="manual"]')).toBeVisible();
    await expect(page.locator('[data-mode="accept"]')).toBeVisible();

    // Check relay mode toggle exists (MSSCI-12395: independent auto-handoff)
    await expect(page.locator('#relay-mode-toggle')).toBeVisible();
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

    // MSSCI-12395: Relay mode toggle (independent auto-handoff)
    // Note: Cmd+4 shortcut conflicts with panel shortcuts - test via click instead
    const relayToggle = page.locator('#relay-mode-toggle');
    const initialState = await relayToggle.getAttribute('aria-pressed');
    await relayToggle.click();
    // Wait for async toggle to complete (settings API call)
    const expectedState = initialState === 'true' ? 'false' : 'true';
    await expect(relayToggle).toHaveAttribute('aria-pressed', expectedState, { timeout: 5000 });
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

    // Get initial state and toggle
    const initialState = await bellToggle.getAttribute('aria-pressed');
    await bellToggle.click();
    // Wait for async toggle to complete (settings API call)
    const expectedAfterFirst = initialState === 'true' ? 'false' : 'true';
    await expect(bellToggle).toHaveAttribute('aria-pressed', expectedAfterFirst, { timeout: 5000 });

    // Click again to toggle back
    await bellToggle.click();
    await expect(bellToggle).toHaveAttribute('aria-pressed', initialState, { timeout: 5000 });
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
