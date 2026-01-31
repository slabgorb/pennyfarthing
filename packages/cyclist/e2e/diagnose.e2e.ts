/**
 * Diagnostic E2E test for React migration
 * Connects to running Cyclist on port 1898 to check wiring state
 */

import { test, expect } from '@playwright/test';

// Override to connect to the existing running instance
test.use({
  baseURL: 'http://localhost:1898',
});

test.describe('React Migration Diagnostic', () => {
  test('check current UI state', async ({ page }) => {
    // Collect console messages
    const consoleMessages: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Collect page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // Track network requests
    const reactRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('react')) {
        reactRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    page.on('response', (res) => {
      if (res.url().includes('react')) {
        reactRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    // Go to the running instance with cache bypass
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait a bit for React to mount
    await page.waitForTimeout(500);

    // Take a screenshot of current state
    await page.screenshot({ path: 'e2e-results/current-state.png', fullPage: true });

    // Check what's visible
    console.log('\n=== DIAGNOSTIC RESULTS ===\n');

    // Show any errors first
    if (pageErrors.length > 0) {
      console.log('PAGE ERRORS:', pageErrors);
    }
    if (consoleErrors.length > 0) {
      console.log('CONSOLE ERRORS:', consoleErrors);
    }

    // Check React root
    const reactRoot = page.locator('#react-root');
    const reactRootVisible = await reactRoot.isVisible();
    const reactRootHTML = await reactRoot.innerHTML();
    console.log('React root visible:', reactRootVisible);
    console.log('React root innerHTML length:', reactRootHTML.length);
    console.log('React root content:', reactRootHTML.substring(0, 200));

    // Check main container (vanilla JS)
    const container = page.locator('#container');
    const containerVisible = await container.isVisible();
    console.log('\nContainer (vanilla JS) visible:', containerVisible);

    // Check tab bar
    const tabBar = page.locator('#tab-bar');
    const tabBarVisible = await tabBar.isVisible();
    console.log('Tab bar visible:', tabBarVisible);

    // Check message view
    const messageView = page.locator('#message-view');
    const messageViewVisible = await messageView.isVisible();
    console.log('Message view visible:', messageViewVisible);

    // Check editor
    const editor = page.locator('#editor');
    const editorVisible = await editor.isVisible();
    console.log('Editor visible:', editorVisible);

    // Check file panel
    const filePanel = page.locator('#file-panel');
    const filePanelExists = await filePanel.count() > 0;
    console.log('File panel exists:', filePanelExists);

    // Check diff panel
    const diffPanel = page.locator('#diff-panel');
    const diffPanelExists = await diffPanel.count() > 0;
    console.log('Diff panel exists:', diffPanelExists);

    // List all visible panels
    const panels = await page.locator('[class*="panel"]').all();
    console.log('\nPanel elements found:', panels.length);

    // Check for any React components
    const dockingWorkspace = page.locator('[data-testid="docking-workspace"]');
    const dockingExists = await dockingWorkspace.count() > 0;
    console.log('\nDockingWorkspace React component rendered:', dockingExists);

    // Check what React is doing
    const cyclist_app = page.locator('.cyclist-app');
    console.log('cyclist-app rendered:', await cyclist_app.count() > 0);

    // Print React network requests
    console.log('\nReact-related network:');
    reactRequests.forEach(r => console.log('  ', r));

    // Print all console messages for debugging
    console.log('\nAll console messages:');
    consoleMessages.slice(0, 20).forEach(m => console.log('  ', m));

    // Try to interact with the editor
    const editorTextarea = page.locator('#editor textarea, #editor [contenteditable]');
    const hasEditor = await editorTextarea.count() > 0;
    console.log('\nEditor textarea/contenteditable found:', hasEditor);

    // Check stats strip
    const statsStrip = page.locator('#stats-strip');
    const statsVisible = await statsStrip.isVisible();
    console.log('Stats strip visible:', statsVisible);

    // Check for persona header
    const personaHeader = page.locator('#persona-header');
    const personaVisible = await personaHeader.isVisible();
    console.log('Persona header visible:', personaVisible);

    console.log('\n=== END DIAGNOSTIC ===\n');

    // Basic assertion so test passes
    expect(containerVisible || reactRootVisible).toBeTruthy();
  });

  test('check API endpoints', async ({ page, request }) => {
    console.log('\n=== API DIAGNOSTIC ===\n');

    // Check health/status endpoint
    try {
      const health = await request.get('http://localhost:1898/api/health');
      console.log('Health endpoint:', health.status());
    } catch (e) {
      console.log('Health endpoint: not available');
    }

    // Check theme endpoint
    try {
      const theme = await request.get('http://localhost:1898/api/current-theme');
      console.log('Theme endpoint:', theme.status());
      if (theme.ok()) {
        const data = await theme.json();
        console.log('Current theme:', data);
      }
    } catch (e) {
      console.log('Theme endpoint: error');
    }

    // Check persona endpoint
    try {
      const persona = await request.get('http://localhost:1898/api/current-persona');
      console.log('Persona endpoint:', persona.status());
    } catch (e) {
      console.log('Persona endpoint: not available');
    }

    console.log('\n=== END API DIAGNOSTIC ===\n');
  });
});
