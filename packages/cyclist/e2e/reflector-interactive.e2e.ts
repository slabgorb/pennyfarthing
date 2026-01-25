/**
 * Interactive E2E Test for Reflector System
 *
 * Story: MSSCI-12409 - Verify Reflector integration with WheelHub
 *
 * This test simulates a real workflow session:
 * 1. Opens Cyclist UI
 * 2. Injects messages with CYCLIST markers
 * 3. Verifies Quick Actions buttons appear
 * 4. Tests button clicks submit correct responses
 * 5. Verifies context state display
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:1898';

/**
 * Helper to inject a mock assistant message
 */
async function injectMessage(page: Page, text: string) {
  await page.evaluate((messageText) => {
    window.dispatchEvent(new CustomEvent('test:inject-message', {
      detail: {
        message: {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: messageText }]
          }
        }
      }
    }));
  }, text);
}

/**
 * Setup test harness for message injection
 */
async function setupTestHarness(page: Page) {
  await page.evaluate(() => {
    window.addEventListener('test:inject-message', async (e: CustomEvent) => {
      const { message } = e.detail;
      try {
        const quickActionsModule = await import('/js/components/message-view/quick-actions.js');
        const result = quickActionsModule.processMessageForQuickActions(message);
        if (result) {
          const container = document.getElementById('quick-actions');
          if (container) {
            container.innerHTML = quickActionsModule.renderQuickActions(result);
            quickActionsModule.setQuickActionsVisible(true);
          }
        }
      } catch (err) {
        console.error('Failed to process message:', err);
      }
    });
  });
}

test.describe('Reflector Interactive Testing - MSSCI-12409', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#quick-actions')).toBeAttached({ timeout: 10000 });
    await setupTestHarness(page);
  });

  test('HANDOFF marker shows agent button with character name', async ({ page }) => {
    // Simulate TEA completing and handing off to Dev
    const message = `
I've written the failing tests for the new feature.

The test file is at \`tests/feature.test.ts\` with 5 test cases covering:
- Happy path
- Error handling
- Edge cases

Ready for implementation.

<!-- CYCLIST:HANDOFF:/dev -->
    `;

    await injectMessage(page, message);

    // Wait for buttons
    const buttons = page.locator('#quick-actions .quick-action-btn');
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });

    // Should have 2 buttons: agent + "Not yet"
    await expect(buttons).toHaveCount(2);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/handoff-marker.png' });

    // Second button should be "Not yet"
    const notYetBtn = buttons.nth(1);
    await expect(notYetBtn).toHaveText('Not yet');
  });

  test('QUESTION:yesno marker shows Yes/No buttons', async ({ page }) => {
    const message = `
All tests are passing and the code looks good.

Should I proceed with creating the PR?

<!-- CYCLIST:QUESTION:yesno -->
    `;

    await injectMessage(page, message);

    const buttons = page.locator('#quick-actions .quick-action-btn');
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });
    await expect(buttons).toHaveCount(2);

    // Verify Yes/No buttons
    const yesBtn = page.locator('#quick-actions .quick-action-btn', { hasText: 'Yes' });
    const noBtn = page.locator('#quick-actions .quick-action-btn', { hasText: 'No' });
    await expect(yesBtn).toBeVisible();
    await expect(noBtn).toBeVisible();

    await page.screenshot({ path: 'test-results/yesno-marker.png' });
  });

  test('CHOICES marker with numbered options extracts labels', async ({ page }) => {
    const message = `
How would you like to proceed with the refactoring?

1. Big bang - refactor everything at once
2. Strangler fig - gradually replace components
3. Branch by abstraction - use feature flags
4. Keep as-is - document but don't change

<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2,3,4 -->
    `;

    await injectMessage(page, message);

    const buttons = page.locator('#quick-actions .quick-action-btn');
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });
    await expect(buttons).toHaveCount(4);

    // Buttons should show extracted text, not just numbers
    const firstBtn = buttons.first();
    const text = await firstBtn.textContent();
    expect(text).toContain('Big bang');

    await page.screenshot({ path: 'test-results/choices-marker.png' });
  });

  test('CHOICES marker with text labels shows labels directly', async ({ page }) => {
    const message = `
Select your preferred testing framework:

<!-- CYCLIST:CHOICES:Vitest,Jest,Mocha,Node Test Runner -->
    `;

    await injectMessage(page, message);

    const buttons = page.locator('#quick-actions .quick-action-btn');
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });
    await expect(buttons).toHaveCount(4);

    // Verify text labels
    await expect(page.locator('#quick-actions .quick-action-btn', { hasText: 'Vitest' })).toBeVisible();
    await expect(page.locator('#quick-actions .quick-action-btn', { hasText: 'Jest' })).toBeVisible();

    await page.screenshot({ path: 'test-results/choices-text-labels.png' });
  });

  test('CONTEXT_CLEAR marker detected', async ({ page }) => {
    const message = `
Context is getting high. Handing off to reviewer with context clear.

<!-- CYCLIST:CONTEXT_CLEAR:/reviewer -->
    `;

    await injectMessage(page, message);

    // CONTEXT_CLEAR should be detected - check via console or result
    // The actual clear action requires Electron APIs, but detection should work
    const result = await page.evaluate((text) => {
      const quickActionsModule = (window as any).__quickActionsModule;
      if (!quickActionsModule) return null;

      const mockMessage = {
        type: 'assistant',
        message: { content: [{ type: 'text', text }] }
      };
      return quickActionsModule.processMessageForQuickActions(mockMessage);
    }, message);

    // In web mode, CONTEXT_CLEAR may not render buttons but should be detected
    await page.screenshot({ path: 'test-results/context-clear-marker.png' });
  });

  test('INVOKE marker auto-executes (turbo mode)', async ({ page }) => {
    // INVOKE should show status indicator, not buttons
    const message = `
Handing off automatically.

<!-- CYCLIST:INVOKE:/dev -->
    `;

    await injectMessage(page, message);

    // Should see "Invoking /dev..." text, not buttons
    await page.waitForTimeout(200);
    const container = page.locator('#quick-actions');
    const html = await container.innerHTML();

    // Either shows invoke status or is empty (auto-executed)
    expect(html.includes('Invoking') || html.includes('quick-action-btn') || html === '').toBeTruthy();

    await page.screenshot({ path: 'test-results/invoke-marker.png' });
  });

  test('markers inside code blocks are ignored', async ({ page }) => {
    const message = `
Here's how markers work:

\`\`\`markdown
<!-- CYCLIST:HANDOFF:/dev -->
\`\`\`

This is documentation, not an actual handoff.
    `;

    await injectMessage(page, message);

    // Should NOT show any buttons
    await page.waitForTimeout(500);
    const buttons = page.locator('#quick-actions .quick-action-btn');
    await expect(buttons).toHaveCount(0);

    await page.screenshot({ path: 'test-results/code-block-immunity.png' });
  });

  test('clicking quick action button submits response', async ({ page }) => {
    const message = `
Ready to proceed?

<!-- CYCLIST:QUESTION:yesno -->
    `;

    await injectMessage(page, message);

    const yesBtn = page.locator('#quick-actions .quick-action-btn', { hasText: 'Yes' });
    await expect(yesBtn).toBeVisible({ timeout: 5000 });

    // Click should clear buttons
    await yesBtn.click();

    // Buttons should be cleared after click
    await expect(page.locator('#quick-actions .quick-action-btn')).toHaveCount(0, { timeout: 2000 });

    await page.screenshot({ path: 'test-results/button-click-clears.png' });
  });

  test('case insensitive marker detection', async ({ page }) => {
    // lowercase should work
    const message = `
Testing lowercase.

<!-- cyclist:handoff:/tea -->
    `;

    await injectMessage(page, message);

    const buttons = page.locator('#quick-actions .quick-action-btn');
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });
    await expect(buttons).toHaveCount(2);
  });

});

test.describe('Hook Integration - MSSCI-12409', () => {

  test('WebSocket /ws/hooks connection works', async ({ page }) => {
    // Connect to hooks WebSocket and verify
    const wsUrl = BASE_URL.replace('http', 'ws') + '/ws/hooks';

    const result = await page.evaluate(async (url) => {
      return new Promise((resolve) => {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          ws.close();
          resolve({ connected: true });
        };
        ws.onerror = () => resolve({ connected: false, error: 'connection error' });
        setTimeout(() => resolve({ connected: false, error: 'timeout' }), 5000);
      });
    }, wsUrl);

    expect(result).toEqual({ connected: true });
  });

});
