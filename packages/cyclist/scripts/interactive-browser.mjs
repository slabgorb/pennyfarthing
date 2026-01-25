#!/usr/bin/env node
/**
 * Interactive browser control script
 * Opens Cyclist in a headed browser for manual/programmatic testing
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:1898';

async function main() {
  console.log('Launching browser...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100, // Slow down for visibility
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  console.log(`Navigating to ${BASE_URL}...`);
  await page.goto(BASE_URL);

  // Wait for the app to load
  await page.waitForSelector('#quick-actions', { timeout: 10000 });
  console.log('Cyclist loaded successfully');

  // Setup test harness for message injection
  await page.evaluate(() => {
    window.addEventListener('test:inject-message', async (e) => {
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
    console.log('[Test Harness] Message injection ready');
  });

  // Export page for REPL-style interaction
  global.page = page;
  global.browser = browser;

  // Helper functions
  global.injectMessage = async (text) => {
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
    console.log('Message injected');
  };

  global.screenshot = async (name = 'screenshot') => {
    await page.screenshot({ path: `test-results/${name}.png` });
    console.log(`Screenshot saved: test-results/${name}.png`);
  };

  global.clickButton = async (text) => {
    const btn = page.locator(`#quick-actions .quick-action-btn`, { hasText: text });
    await btn.click();
    console.log(`Clicked: ${text}`);
  };

  global.getButtons = async () => {
    const buttons = await page.locator('#quick-actions .quick-action-btn').allTextContents();
    console.log('Buttons:', buttons);
    return buttons;
  };

  console.log('\n=== Browser Ready ===');
  console.log('Available commands:');
  console.log('  injectMessage(text) - Inject a message with markers');
  console.log('  getButtons()        - List quick action buttons');
  console.log('  clickButton(text)   - Click a button by text');
  console.log('  screenshot(name)    - Take a screenshot');
  console.log('  page                - Playwright page object');
  console.log('\nKeeping browser open. Press Ctrl+C to exit.\n');

  // Keep process alive
  await new Promise(() => {});
}

main().catch(console.error);
