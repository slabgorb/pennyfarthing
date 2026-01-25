#!/usr/bin/env node
/**
 * Test Reflector features interactively
 * Usage: node scripts/test-reflector.mjs <scenario>
 *
 * Scenarios:
 *   handoff   - Test HANDOFF marker
 *   yesno     - Test QUESTION:yesno marker
 *   choices   - Test CHOICES marker
 *   context   - Test CONTEXT_CLEAR marker
 *   invoke    - Test INVOKE marker
 *   codeblock - Test code block immunity
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:1898';
const scenario = process.argv[2] || 'handoff';

const SCENARIOS = {
  handoff: {
    name: 'HANDOFF marker',
    message: `
I've completed the test specification for story 63-7.

The tests cover:
- Jira API authentication
- Story sync functionality
- Error handling

Ready for implementation.

<!-- CYCLIST:HANDOFF:/dev -->
    `,
    expect: 'Two buttons: agent name + "Not yet"'
  },

  yesno: {
    name: 'QUESTION:yesno marker',
    message: `
All tests are passing. The implementation looks good.

Should I proceed with creating the PR?

<!-- CYCLIST:QUESTION:yesno -->
    `,
    expect: 'Two buttons: "Yes" and "No"'
  },

  choices: {
    name: 'CHOICES marker with numbers',
    message: `
How would you like to handle the error case?

1. Retry with exponential backoff
2. Fail fast and report
3. Queue for manual review
4. Ignore and continue

<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2,3,4 -->
    `,
    expect: 'Four buttons with extracted labels'
  },

  'choices-text': {
    name: 'CHOICES marker with text labels',
    message: `
Select the database:

<!-- CYCLIST:CHOICES:PostgreSQL,MySQL,SQLite,MongoDB -->
    `,
    expect: 'Four buttons: PostgreSQL, MySQL, SQLite, MongoDB'
  },

  context: {
    name: 'CONTEXT_CLEAR marker (TirePump)',
    message: `
Context is at 75%. Performing context-preserving handoff.

<!-- CYCLIST:CONTEXT_CLEAR:/reviewer -->
    `,
    expect: 'Context clear action (in Electron mode triggers TirePump)'
  },

  invoke: {
    name: 'INVOKE marker (turbo auto-execute)',
    message: `
Auto-handoff in turbo mode.

<!-- CYCLIST:INVOKE:/dev -->
    `,
    expect: 'Auto-invoke status or immediate execution'
  },

  codeblock: {
    name: 'Markers in code blocks (should be ignored)',
    message: `
Here's an example of a handoff marker:

\`\`\`markdown
<!-- CYCLIST:HANDOFF:/dev -->
\`\`\`

This should NOT trigger any buttons.
    `,
    expect: 'No buttons (marker is inside code block)'
  },

  workflow: {
    name: 'Full workflow simulation',
    message: `
## Story Setup Complete

I've analyzed the backlog and set up story 63-7 for you.

**Story:** Port remaining Jira scripts to Python
**Points:** 3
**Branch:** feat/63-7-jira-scripts-python

Ready to begin the RED phase with Herbert West (TEA).

<!-- CYCLIST:HANDOFF:/tea -->
    `,
    expect: 'Handoff button to TEA agent'
  }
};

async function main() {
  const config = SCENARIOS[scenario];
  if (!config) {
    console.error(`Unknown scenario: ${scenario}`);
    console.log('Available:', Object.keys(SCENARIOS).join(', '));
    process.exit(1);
  }

  console.log(`\n=== Testing: ${config.name} ===\n`);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  console.log(`Opening ${BASE_URL}...`);
  await page.goto(BASE_URL);
  await page.waitForSelector('#quick-actions', { timeout: 10000 });

  // Setup message injection
  await page.evaluate(() => {
    window.addEventListener('test:inject-message', async (e) => {
      const { message } = e.detail;
      try {
        const mod = await import('/js/components/message-view/quick-actions.js');
        const result = mod.processMessageForQuickActions(message);
        if (result) {
          const container = document.getElementById('quick-actions');
          if (container) {
            container.innerHTML = mod.renderQuickActions(result);
            mod.setQuickActionsVisible(true);
          }
        }
      } catch (err) {
        console.error('Injection error:', err);
      }
    });
  });

  console.log('Injecting message...\n');
  console.log('---MESSAGE START---');
  console.log(config.message.trim());
  console.log('---MESSAGE END---\n');

  // Inject the test message
  await page.evaluate((text) => {
    window.dispatchEvent(new CustomEvent('test:inject-message', {
      detail: {
        message: {
          type: 'assistant',
          message: { content: [{ type: 'text', text }] }
        }
      }
    }));
  }, config.message);

  // Wait for buttons to appear (or not)
  await page.waitForTimeout(1000);

  // Check results
  const buttons = await page.locator('#quick-actions .quick-action-btn').allTextContents();

  console.log('Expected:', config.expect);
  console.log('Buttons found:', buttons.length > 0 ? buttons.join(', ') : '(none)');

  // Take screenshot
  const screenshotPath = `test-results/reflector-${scenario}.png`;
  await page.screenshot({ path: screenshotPath });
  console.log(`\nScreenshot: ${screenshotPath}`);

  console.log('\n=== Browser will stay open for inspection ===');
  console.log('Press Ctrl+C to close.\n');

  // Keep browser open for inspection
  await new Promise(() => {});
}

main().catch(console.error);
