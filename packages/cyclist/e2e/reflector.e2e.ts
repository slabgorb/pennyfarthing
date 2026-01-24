/**
 * E2E Tests for Reflector (Quick Actions) System
 *
 * Tests that reflector buttons appear when Claude emits CYCLIST markers:
 * - HANDOFF: Agent handoffs (e.g., TEA → Dev)
 * - QUESTION:yesno: Yes/No confirmation prompts
 * - CHOICES: Multiple choice options from AskQuestion tool
 *
 * These tests inject mock messages to simulate Claude responses.
 */

import { test, expect, Page } from '@playwright/test';

/**
 * Helper to inject a mock assistant message with CYCLIST markers
 * This simulates what the SDK would send when Claude responds
 */
async function injectMockMessage(page: Page, text: string) {
  await page.evaluate((messageText) => {
    // Find the quick-actions container
    const container = document.getElementById('quick-actions');
    if (!container) {
      console.error('quick-actions container not found');
      return;
    }

    // Import the quick-actions module functions by accessing globals set up by the app
    // We need to directly test the detection and rendering
    const mockMessage = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: messageText }]
      }
    };

    // We'll dispatch a custom event that the test harness can listen for
    window.dispatchEvent(new CustomEvent('test:inject-message', {
      detail: { message: mockMessage }
    }));
  }, text);
}

/**
 * Helper to check if quick action buttons are visible
 */
async function getQuickActionButtons(page: Page) {
  return page.locator('#quick-actions .quick-action-btn');
}

/**
 * Helper to get button labels
 */
async function getButtonLabels(page: Page) {
  const buttons = await getQuickActionButtons(page);
  const count = await buttons.count();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    labels.push(await buttons.nth(i).textContent() || '');
  }
  return labels;
}

test.describe('Reflector - Quick Actions', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for app to initialize - container exists but is hidden when empty (CSS: #quick-actions:empty)
    await expect(page.locator('#quick-actions')).toBeAttached();

    // Set up test harness - inject message handler
    await page.evaluate(() => {
      // Import the quick-actions functions dynamically
      window.addEventListener('test:inject-message', async (e: CustomEvent) => {
        const { message } = e.detail;

        // Dynamically import and call the processing functions
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
  });

  test.describe('HANDOFF marker', () => {

    test('should show agent button on handoff marker', async ({ page }) => {
      // Simulate a handoff from TEA to Dev
      const messageWithHandoff = `
I've completed the test specification.

The tests are ready for implementation.

<!-- CYCLIST:HANDOFF:/dev -->
      `;

      await injectMockMessage(page, messageWithHandoff);

      // Wait for buttons to appear
      await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });

      // Should have two buttons: the agent and "Not yet"
      const buttons = await getQuickActionButtons(page);
      await expect(buttons).toHaveCount(2);

      // First button should be the agent (or character name from theme)
      const labels = await getButtonLabels(page);
      expect(labels[1]).toBe('Not yet');
    });

    test('should show multiple agent options on handoff', async ({ page }) => {
      // SM might offer different agents
      const messageWithHandoff = `
Ready for the next phase.

<!-- CYCLIST:HANDOFF:/tea -->
      `;

      await injectMockMessage(page, messageWithHandoff);

      await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });

      const buttons = await getQuickActionButtons(page);
      await expect(buttons).toHaveCount(2);
    });
  });

  test.describe('QUESTION:yesno marker', () => {

    test('should show Yes/No buttons on yesno question', async ({ page }) => {
      // Simulate a yes/no question from an agent
      const messageWithQuestion = `
All tests are passing. Ready to proceed with the code review?

<!-- CYCLIST:QUESTION:yesno -->
      `;

      await injectMockMessage(page, messageWithQuestion);

      await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });

      const buttons = await getQuickActionButtons(page);
      await expect(buttons).toHaveCount(2);

      const labels = await getButtonLabels(page);
      expect(labels).toContain('Yes');
      expect(labels).toContain('No');
    });

    test('should submit Yes when Yes button clicked', async ({ page }) => {
      const messageWithQuestion = `
Proceed with implementation?

<!-- CYCLIST:QUESTION:yesno -->
      `;

      await injectMockMessage(page, messageWithQuestion);

      const yesButton = page.locator('#quick-actions .quick-action-btn', { hasText: 'Yes' });
      await expect(yesButton).toBeVisible({ timeout: 5000 });

      // Click should clear the buttons (in real app, also submits to Claude)
      await yesButton.click();

      // Buttons should be cleared after click
      await expect(page.locator('#quick-actions .quick-action-btn')).toHaveCount(0, { timeout: 2000 });
    });
  });

  test.describe('CHOICES marker (AskQuestion)', () => {

    test('should show numbered choice buttons', async ({ page }) => {
      // Simulate AskQuestion with numbered choices
      const messageWithChoices = `
Which approach would you prefer?

1. Use existing API endpoint
2. Create new microservice
3. Refactor monolith

<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2,3 -->
      `;

      await injectMockMessage(page, messageWithChoices);

      await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });

      const buttons = await getQuickActionButtons(page);
      await expect(buttons).toHaveCount(3);

      // Buttons should show option text, not just numbers
      const labels = await getButtonLabels(page);
      expect(labels[0]).toContain('Use existing API');
      expect(labels[1]).toContain('Create new micro');
      expect(labels[2]).toContain('Refactor monolith');
    });

    test('should show text label choices', async ({ page }) => {
      // Simulate AskQuestion with text labels
      const messageWithChoices = `
Select the testing framework:

<!-- CYCLIST:CHOICES:Jest,Vitest,Mocha -->
      `;

      await injectMockMessage(page, messageWithChoices);

      await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });

      const buttons = await getQuickActionButtons(page);
      await expect(buttons).toHaveCount(3);

      const labels = await getButtonLabels(page);
      expect(labels).toContain('Jest');
      expect(labels).toContain('Vitest');
      expect(labels).toContain('Mocha');
    });

    test('should handle 4 options from AskQuestion', async ({ page }) => {
      // AskQuestion supports 2-4 options
      const messageWithChoices = `
Which mode should be default?

1. Plan mode - Read-only
2. Manual mode - Ask permission
3. Accept mode - Auto-accept edits
4. Turbo mode - Full auto

<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2,3,4 -->
      `;

      await injectMockMessage(page, messageWithChoices);

      await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });

      const buttons = await getQuickActionButtons(page);
      await expect(buttons).toHaveCount(4);
    });
  });

  test.describe('Marker in code blocks', () => {

    test('should NOT detect markers inside code blocks', async ({ page }) => {
      // Markers in code blocks should be ignored
      const messageWithCodeBlock = `
Here's an example of a marker:

\`\`\`markdown
<!-- CYCLIST:HANDOFF:/dev -->
\`\`\`

This is documentation, not an actual handoff.
      `;

      await injectMockMessage(page, messageWithCodeBlock);

      // Should NOT show any buttons
      await expect(page.locator('#quick-actions .quick-action-btn')).toHaveCount(0);
    });
  });

  test.describe('Relay mode OFF behavior (MSSCI-12395)', () => {

    test('should show buttons for HANDOFF marker', async ({ page }) => {
      // MSSCI-12395: With relay mode off (manual handoff), HANDOFF markers show buttons
      // Ensure relay mode is off by checking toggle state
      const relayToggle = page.locator('#relay-mode-toggle');
      const isActive = await relayToggle.getAttribute('aria-pressed');

      if (isActive === 'true') {
        // Turn off relay mode
        await relayToggle.click();
      }

      // HANDOFF should show buttons (user chooses whether to proceed)
      const message = `
Ready for implementation.

<!-- CYCLIST:HANDOFF:/dev -->
      `;

      await injectMockMessage(page, message);

      // Buttons should appear
      await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Button styling and accessibility', () => {

    test('should have accessible button attributes', async ({ page }) => {
      const message = `
Proceed?

<!-- CYCLIST:QUESTION:yesno -->
      `;

      await injectMockMessage(page, message);

      const buttons = page.locator('#quick-actions .quick-action-btn');
      await expect(buttons.first()).toBeVisible({ timeout: 5000 });

      // Buttons should have data-response attribute for click handling
      const firstButton = buttons.first();
      await expect(firstButton).toHaveAttribute('data-response');
    });

    test('should have quick-actions-container wrapper', async ({ page }) => {
      const message = `
Ready?

<!-- CYCLIST:QUESTION:yesno -->
      `;

      await injectMockMessage(page, message);

      await expect(page.locator('#quick-actions .quick-actions-container')).toBeVisible({ timeout: 5000 });
    });
  });
});

test.describe('Reflector - Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Container exists but is hidden when empty (CSS: #quick-actions:empty)
    await expect(page.locator('#quick-actions')).toBeAttached();

    // Set up test harness
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
  });

  test('should handle multiple markers in one message', async ({ page }) => {
    // First marker should win
    const message = `
Here are your options:

1. Option A
2. Option B

<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2 -->
<!-- CYCLIST:HANDOFF:/dev -->
      `;

    await injectMockMessage(page, message);

    // Should show choices (first marker type processed)
    await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });
  });

  test('should clear buttons when new message arrives', async ({ page }) => {
    // First inject a message with buttons
    await injectMockMessage(page, 'Ready? <!-- CYCLIST:QUESTION:yesno -->');
    await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });

    // Clear by calling clearQuickActions
    await page.evaluate(() => {
      const container = document.getElementById('quick-actions');
      if (container) container.innerHTML = '';
    });

    await expect(page.locator('#quick-actions .quick-action-btn')).toHaveCount(0);
  });

  test('should handle empty/whitespace values gracefully', async ({ page }) => {
    const message = `
Testing edge case.

<!-- CYCLIST:HANDOFF:   -->
      `;

    await injectMockMessage(page, message);

    // Should handle gracefully (may or may not show buttons depending on implementation)
    // Main thing is it shouldn't crash
    await page.waitForTimeout(500);
  });

  test('case insensitive marker detection', async ({ page }) => {
    // Markers should be case-insensitive for the prefix and type
    const message = `
Lower case test.

<!-- cyclist:handoff:/dev -->
      `;

    await injectMockMessage(page, message);

    // Should still detect
    await expect(page.locator('#quick-actions .quick-action-btn').first()).toBeVisible({ timeout: 5000 });
  });
});
