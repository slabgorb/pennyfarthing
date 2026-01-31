/**
 * E2E tests for React UI migration
 * Tests the new docking workspace and panels
 */

import { test, expect } from '@playwright/test';

test.use({
  baseURL: 'http://localhost:1898',
});

test.describe('React UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('renders docking workspace', async ({ page }) => {
    const workspace = page.locator('[data-testid="docking-workspace"]');
    await expect(workspace).toBeVisible();
    await page.screenshot({ path: 'e2e-results/react-workspace.png' });
  });

  test('left sidebar has correct tabs', async ({ page }) => {
    // Check left sidebar tabs
    const leftSidebar = page.locator('[data-region="left"]');
    await expect(leftSidebar).toBeVisible();

    // Check tabs exist
    const changedTab = leftSidebar.locator('button[role="tab"]', { hasText: 'Changed' });
    const diffsTab = leftSidebar.locator('button[role="tab"]', { hasText: 'Diffs' });
    const debugTab = leftSidebar.locator('button[role="tab"]', { hasText: 'Debug' });

    await expect(changedTab).toBeVisible();
    await expect(diffsTab).toBeVisible();
    await expect(debugTab).toBeVisible();
  });

  test('right sidebar has correct tabs', async ({ page }) => {
    const rightSidebar = page.locator('[data-region="right"]');
    await expect(rightSidebar).toBeVisible();

    // Check tabs exist
    const sprintTab = rightSidebar.locator('button[role="tab"]', { hasText: 'Sprint' });
    const progressTab = rightSidebar.locator('button[role="tab"]', { hasText: 'Progress' });
    const backgroundTab = rightSidebar.locator('button[role="tab"]', { hasText: 'Background' });
    const gitTab = rightSidebar.locator('button[role="tab"]', { hasText: 'Git' });
    const settingsTab = rightSidebar.locator('button[role="tab"]', { hasText: 'Settings' });

    await expect(sprintTab).toBeVisible();
    await expect(progressTab).toBeVisible();
    await expect(backgroundTab).toBeVisible();
    await expect(gitTab).toBeVisible();
    await expect(settingsTab).toBeVisible();
  });

  test('can switch tabs in left sidebar', async ({ page }) => {
    const leftSidebar = page.locator('[data-region="left"]');

    // Click Diffs tab
    const diffsTab = leftSidebar.locator('button[role="tab"]', { hasText: 'Diffs' });
    await diffsTab.click();

    // Verify Diffs tab is selected
    await expect(diffsTab).toHaveAttribute('aria-selected', 'true');

    // Verify Diffs panel is visible
    const diffsPanel = leftSidebar.locator('[data-panel="diffs"]');
    await expect(diffsPanel).not.toHaveAttribute('hidden');

    await page.screenshot({ path: 'e2e-results/react-diffs-tab.png' });
  });

  test('can collapse left sidebar', async ({ page }) => {
    // Click collapse button
    const collapseBtn = page.locator('[data-testid="left-collapse-toggle"]');
    await collapseBtn.click();

    // Verify sidebar is collapsed
    const leftSidebar = page.locator('[data-region="left"]');
    await expect(leftSidebar).toHaveAttribute('data-collapsed', 'true');

    await page.screenshot({ path: 'e2e-results/react-left-collapsed.png' });

    // Click again to expand
    await collapseBtn.click();
    await expect(leftSidebar).not.toHaveAttribute('data-collapsed');
  });

  test('FileTree shows empty state', async ({ page }) => {
    // Check FileTree is rendered
    const fileTree = page.locator('.filetree');
    await expect(fileTree).toBeVisible();

    // Check badge shows 0
    const badge = page.locator('[data-testid="file-count-badge"]');
    await expect(badge).toHaveText('0');

    // Check empty state message
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toContainText('No files changed');
  });

  test('center region is visible', async ({ page }) => {
    const centerRegion = page.locator('[data-testid="center-region"]');
    await expect(centerRegion).toBeVisible();

    // Check message panel exists
    const messagePanel = centerRegion.locator('[data-panel="message"]');
    await expect(messagePanel).toBeVisible();
  });

  test('vanilla JS container is hidden', async ({ page }) => {
    const container = page.locator('#container');
    // Container should exist in DOM but be hidden
    await expect(container).toHaveCount(1);
    await expect(container).not.toBeVisible();
  });
});
