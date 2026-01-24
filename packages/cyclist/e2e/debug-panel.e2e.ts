/**
 * E2E Tests for Debug Panel
 *
 * Tests the real-time OTEL span viewer functionality.
 */

import { test, expect } from '@playwright/test';

test.describe('Debug Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await expect(page.locator('#tab-bar')).toBeVisible();
  });

  test('should show Debug tab in tab bar', async ({ page }) => {
    const debugTab = page.locator('[data-panel="debug-panel"]');
    await expect(debugTab).toBeVisible();
    await expect(debugTab).toContainText('DEBUG');
  });

  test('should toggle debug panel with Cmd+5', async ({ page }) => {
    const debugPanel = page.locator('#debug-panel');

    // Panel should be collapsed initially
    await expect(debugPanel).toHaveClass(/collapsed/);

    // Press Cmd+5 to open
    await page.keyboard.press('Meta+5');
    await expect(debugPanel).not.toHaveClass(/collapsed/);

    // Press Cmd+5 again to close
    await page.keyboard.press('Meta+5');
    await expect(debugPanel).toHaveClass(/collapsed/);
  });

  test('should open debug panel when clicking tab', async ({ page }) => {
    const debugTab = page.locator('[data-panel="debug-panel"]');
    const debugPanel = page.locator('#debug-panel');

    // Panel should be collapsed initially
    await expect(debugPanel).toHaveClass(/collapsed/);

    // Click tab to open
    await debugTab.click();
    await expect(debugPanel).not.toHaveClass(/collapsed/);

    // Verify timeline is rendered
    await expect(page.locator('.span-timeline')).toBeVisible();
  });

  test('should display span timeline with controls', async ({ page }) => {
    // Open debug panel
    await page.keyboard.press('Meta+5');

    // Check timeline controls are present
    await expect(page.locator('.filter-tool-type')).toBeVisible();
    await expect(page.locator('.filter-status')).toBeVisible();
    await expect(page.locator('.btn-export-spans')).toBeVisible();
  });

  test('should filter spans by tool type', async ({ page }) => {
    // Open debug panel
    await page.keyboard.press('Meta+5');

    // Wait for timeline to load
    await expect(page.locator('.span-timeline')).toBeVisible();

    // Select a filter (even if no spans, the dropdown should work)
    const toolFilter = page.locator('.filter-tool-type');
    await toolFilter.selectOption('all');
  });

  test('should filter spans by status', async ({ page }) => {
    // Open debug panel
    await page.keyboard.press('Meta+5');

    // Wait for timeline to load
    await expect(page.locator('.span-timeline')).toBeVisible();

    // Filter by success
    const statusFilter = page.locator('.filter-status');
    await statusFilter.selectOption('success');

    // Filter by error
    await statusFilter.selectOption('error');

    // Reset to all
    await statusFilter.selectOption('all');
  });

  test('should show empty state when no spans', async ({ page }) => {
    // Open debug panel
    await page.keyboard.press('Meta+5');

    // Wait for timeline to load
    await expect(page.locator('.span-timeline')).toBeVisible();

    // Should show empty state or span count of 0
    const spanCount = page.locator('.span-count');
    await expect(spanCount).toBeVisible();
  });
});
