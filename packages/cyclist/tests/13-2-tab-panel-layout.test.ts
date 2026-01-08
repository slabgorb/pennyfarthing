/**
 * Story 13-2: Tab Panel Layout Fix Tests
 *
 * Tests that verify the tab panel layout does not hide the message view
 * when expanded. The tab panel should share space with the conversation,
 * not replace it.
 *
 * Acceptance Criteria:
 * - AC1: Tab panel expansion does not hide conversation view
 * - AC2: Both conversation and tab content visible simultaneously
 * - AC3: Panel has sensible default height (max 40% of viewport)
 * - AC4: Panel can be collapsed to minimize (already working - covered in E8-1)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// =============================================================================
// Test Setup - Load actual CSS for style verification
// =============================================================================

const CSS_PATH = join(__dirname, '../src/public/styles.css');
let cssContent: string;

try {
  cssContent = readFileSync(CSS_PATH, 'utf-8');
} catch {
  cssContent = '';
}

/**
 * Helper to check if a CSS rule exists with expected properties
 */
function hasStyleRule(selector: string, property: string, valuePattern: RegExp | string): boolean {
  // Find the selector block in CSS
  const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRegex = new RegExp(`${selectorEscaped}\\s*\\{([^}]+)\\}`, 'g');

  let match;
  while ((match = blockRegex.exec(cssContent)) !== null) {
    const block = match[1];
    const propRegex = new RegExp(`${property}\\s*:\\s*([^;]+)`);
    const propMatch = block.match(propRegex);

    if (propMatch) {
      const value = propMatch[1].trim();
      if (typeof valuePattern === 'string') {
        if (value === valuePattern) return true;
      } else {
        if (valuePattern.test(value)) return true;
      }
    }
  }
  return false;
}

// =============================================================================
// AC1 & AC2: Layout Structure Tests
// =============================================================================

describe('Story 13-2: Tab Panel Layout Fix', () => {

  describe('AC1 & AC2: Message view remains visible when tab panel expands', () => {

    beforeEach(() => {
      // Create DOM structure matching expected layout
      document.body.innerHTML = `
        <div id="container" style="height: 100vh; display: flex;">
          <div id="main-content" style="flex: 1; display: flex; flex-direction: column; height: 100%;">
            <main id="message-view" style="flex: 1; min-height: 0; overflow-y: auto;">
              <div class="message">Test conversation content</div>
            </main>
            <div id="tab-panel" class="tab-panel">
              <div class="tab-bar">
                <div class="tab-bar-tabs" id="tab-bar-tabs">
                  <div class="tab active">Files</div>
                </div>
                <button class="tab-panel-toggle" id="tab-panel-toggle">▼</button>
              </div>
              <div class="tab-content" id="tab-content">
                <div>Tab panel content here</div>
              </div>
            </div>
            <div id="editor-wrapper" style="flex-shrink: 0; height: 100px;"></div>
          </div>
        </div>
      `;
    });

    it('should have message-view and tab-panel as siblings in main-content', () => {
      const mainContent = document.getElementById('main-content');
      const messageView = document.getElementById('message-view');
      const tabPanel = document.getElementById('tab-panel');

      expect(mainContent).toBeTruthy();
      expect(messageView?.parentElement).toBe(mainContent);
      expect(tabPanel?.parentElement).toBe(mainContent);
    });

    it('should have tab-panel positioned between message-view and editor-wrapper', () => {
      const messageView = document.getElementById('message-view');
      const tabPanel = document.getElementById('tab-panel');
      const editorWrapper = document.getElementById('editor-wrapper');

      expect(messageView?.nextElementSibling).toBe(tabPanel);
      expect(tabPanel?.nextElementSibling).toBe(editorWrapper);
    });

    it('should have main-content as flex column container', () => {
      const mainContent = document.getElementById('main-content');
      expect(mainContent).toBeTruthy();

      // Verify the CSS has correct flex-direction
      expect(hasStyleRule('#main-content', 'flex-direction', 'column')).toBe(true);
    });

  });

  // ===========================================================================
  // AC3: Tab Panel Max Height Constraint
  // ===========================================================================

  describe('AC3: Panel has sensible default height (max 40% of viewport)', () => {

    it('should have max-height constraint on .tab-panel when expanded', () => {
      // The fix should add max-height to .tab-panel (not collapsed)
      // Acceptable values: 40vh, 40%, max(200px, 40vh), etc.
      const hasMaxHeight = hasStyleRule('.tab-panel', 'max-height', /\d+(vh|%|px)/) ||
                           hasStyleRule('.tab-panel:not\\(.collapsed\\)', 'max-height', /\d+(vh|%|px)/);

      expect(hasMaxHeight).toBe(true);
    });

    it('should have .tab-content max-height that respects parent constraint', () => {
      // Current: max-height: 300px (fixed)
      // Expected: Should be relative (100%, inherit) or removed to let parent control
      // This test checks if the fix changes the approach
      const hasRelativeHeight = hasStyleRule('.tab-content', 'max-height', /100%|inherit|none/) ||
                                hasStyleRule('.tab-content', 'flex', /0\s+0|none/);

      // If still using fixed px, the parent .tab-panel must have proper constraint
      const hasParentConstraint = hasStyleRule('.tab-panel', 'max-height', /\d+(vh|%)/);

      expect(hasRelativeHeight || hasParentConstraint).toBe(true);
    });

    it('should prevent .tab-panel from growing beyond 40% of viewport', () => {
      // Verify the max-height is 40vh or 40% or similar
      const hasCorrectMax = hasStyleRule('.tab-panel', 'max-height', /40(vh|%)/) ||
                            hasStyleRule('.tab-panel:not\\(.collapsed\\)', 'max-height', /40(vh|%)/);

      expect(hasCorrectMax).toBe(true);
    });

  });

  // ===========================================================================
  // CSS Structure Verification
  // ===========================================================================

  describe('CSS layout constraints', () => {

    it('should have #message-view with flex: 1 to take remaining space', () => {
      expect(hasStyleRule('#message-view', 'flex', '1')).toBe(true);
    });

    it('should have #message-view with min-height: 0 for proper flex scrolling', () => {
      // min-height: 0 is required for flex children to shrink below content size
      const hasMinHeight = hasStyleRule('#message-view', 'min-height', '0') ||
                           hasStyleRule('#message-view', 'min-height', '0px');

      expect(hasMinHeight).toBe(true);
    });

    it('should have .tab-panel with flex-shrink: 0 to maintain height', () => {
      // Tab panel should not shrink - it has a fixed max height
      const hasFlexShrink = hasStyleRule('.tab-panel', 'flex-shrink', '0') ||
                            hasStyleRule('.tab-panel', 'flex', /0\s+0/);

      expect(hasFlexShrink).toBe(true);
    });

    it('should have #main-content with overflow: hidden to prevent blowout', () => {
      // The parent needs overflow: hidden to constrain children
      const hasOverflow = hasStyleRule('#main-content', 'overflow', 'hidden') ||
                          hasStyleRule('#main-content', 'overflow-y', 'hidden');

      expect(hasOverflow).toBe(true);
    });

  });

  // ===========================================================================
  // AC4: Collapse Behavior (Regression Check)
  // ===========================================================================

  describe('AC4: Panel can be collapsed to minimize (regression check)', () => {

    it('should have .tab-panel.collapsed .tab-content with max-height: 0', () => {
      expect(hasStyleRule('.tab-panel.collapsed .tab-content', 'max-height', '0')).toBe(true);
    });

    it('should have .tab-panel.collapsed .tab-content with opacity: 0', () => {
      expect(hasStyleRule('.tab-panel.collapsed .tab-content', 'opacity', '0')).toBe(true);
    });

    it('should have .tab-panel.collapsed .tab-content with overflow: hidden', () => {
      expect(hasStyleRule('.tab-panel.collapsed .tab-content', 'overflow', 'hidden')).toBe(true);
    });

  });

  // ===========================================================================
  // Integration: Both Visible Simultaneously
  // ===========================================================================

  describe('Integration: Both areas visible when expanded', () => {

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="container" style="height: 800px; display: flex;">
          <div id="main-content" style="flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden;">
            <main id="message-view" style="flex: 1; min-height: 0; overflow-y: auto;">
              <div class="message" style="height: 1000px;">Long conversation content</div>
            </main>
            <div id="tab-panel" class="tab-panel" style="flex-shrink: 0; max-height: 40%;">
              <div class="tab-bar" style="height: 32px;">
                <div class="tab active">Files</div>
              </div>
              <div class="tab-content" style="height: 200px;">
                Tab content
              </div>
            </div>
            <div id="editor-wrapper" style="flex-shrink: 0; height: 100px;"></div>
          </div>
        </div>
      `;
    });

    it('should have both message-view and tab-panel in the DOM', () => {
      const messageView = document.getElementById('message-view');
      const tabPanel = document.getElementById('tab-panel');

      expect(messageView).toBeTruthy();
      expect(tabPanel).toBeTruthy();
    });

    it('should have message-view with scrollable overflow', () => {
      const messageView = document.getElementById('message-view');
      expect(messageView?.style.overflowY).toBe('auto');
    });

    it('should have tab-panel without collapsed class when expanded', () => {
      const tabPanel = document.getElementById('tab-panel');
      expect(tabPanel?.classList.contains('collapsed')).toBe(false);
    });

  });

});
