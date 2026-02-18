import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Capture console logs
page.on('console', msg => {
  console.log(`[CONSOLE ${msg.type()}]`, msg.text());
});

import { readFileSync } from 'fs';
const port = readFileSync('/Users/keithavery/Projects/pennyfarthing-orchestrator/.bikerack-port', 'utf-8').trim();
console.log('Using port:', port);
await page.goto(`http://localhost:${port}`);
await page.waitForTimeout(3000);

// Check React root
const reactRoot = await page.$('#react-root');
const reactHTML = await reactRoot?.innerHTML();
console.log('\n=== React Root ===');
console.log('Has content:', reactHTML?.length > 0);
console.log('Content preview:', reactHTML?.substring(0, 500));

// Check center region
console.log('\n=== Center Region ===');
const centerRegion = await page.$('[data-testid="center-region"]');
if (centerRegion) {
  const html = await centerRegion.innerHTML();
  console.log('Center region HTML:', html);
}

// Check panel-message
console.log('\n=== Panel Message ===');
const panelMessage = await page.$('[data-panel="message"]');
if (panelMessage) {
  const html = await panelMessage.innerHTML();
  console.log('Panel message HTML:', html || '(empty)');
  console.log('Panel message child count:', (await panelMessage.$$('*')).length);
}

// Check all data-panel elements
console.log('\n=== All Panels ===');
const panels = await page.$$('[data-panel]');
for (const panel of panels) {
  const name = await panel.getAttribute('data-panel');
  const childCount = (await panel.$$('> *')).length;
  const html = await panel.innerHTML();
  console.log(`Panel "${name}": ${childCount} direct children, HTML: ${html.substring(0, 200)}`);
}

// Check for testids
console.log('\n=== Test IDs ===');
const messagePanel = await page.$('[data-testid="message-panel"]');
console.log('message-panel testid exists:', !!messagePanel);
const editorContainer = await page.$('[data-testid="editor-container"]');
console.log('editor-container testid exists:', !!editorContainer);

await browser.close();
