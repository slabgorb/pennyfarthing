/**
 * B-9.2: Rich Text Editor Integration Tests
 *
 * Tests verify the TipTap editor integration for Cyclist.
 * Focus on our integration code, not TipTap library internals.
 *
 * Acceptance Criteria:
 * - AC1: Editor component renders in Cyclist
 * - AC2: Basic formatting works (bold, italic, code, lists)
 * - AC3: Editor receives keyboard input
 * - AC4: Terminal is visible and displays output
 *
 * Note: AC2-AC4 require DOM environment. These tests focus on
 * structural/contract verification that enables those features.
 */

import { describe, it, expect } from 'vitest';

describe('B-9.2: Rich Text Editor Integration', () => {

  describe('AC1: Editor Module Structure', () => {

    it('should export createEditor factory function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.createEditor).toBeDefined();
      expect(typeof editor.createEditor).toBe('function');
    });

    it('should export getEditorContent function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.getEditorContent).toBeDefined();
      expect(typeof editor.getEditorContent).toBe('function');
    });

    it('should export setEditorContent function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.setEditorContent).toBeDefined();
      expect(typeof editor.setEditorContent).toBe('function');
    });

    it('should export clearEditor function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.clearEditor).toBeDefined();
      expect(typeof editor.clearEditor).toBe('function');
    });

  });

  describe('AC2: Editor Extensions Configuration', () => {

    it('should export EDITOR_EXTENSIONS list', async () => {
      const editor = await import('../src/public/js/editor.js');

      // Editor should document which extensions are loaded
      expect(editor.EDITOR_EXTENSIONS).toBeDefined();
      expect(Array.isArray(editor.EDITOR_EXTENSIONS)).toBe(true);
    });

    it('should include StarterKit extension', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.EDITOR_EXTENSIONS).toContain('StarterKit');
    });

    it('should include CodeBlock extension', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.EDITOR_EXTENSIONS).toContain('CodeBlock');
    });

  });

  describe('AC1/AC4: Layout Contract', () => {

    it('should export EDITOR_CONTAINER_ID constant', async () => {
      const editor = await import('../src/public/js/editor.js');

      // The container ID the editor mounts to
      expect(editor.EDITOR_CONTAINER_ID).toBe('editor');
    });

    it('should export editor initialization options', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.EDITOR_OPTIONS).toBeDefined();
      expect(editor.EDITOR_OPTIONS.autofocus).toBe(true);
    });

  });

  describe('AC3: Input Handling Contract', () => {

    it('should export onSubmit callback setter', async () => {
      const editor = await import('../src/public/js/editor.js');

      // For B-9.3: wiring submit to PTY
      expect(editor.setOnSubmit).toBeDefined();
      expect(typeof editor.setOnSubmit).toBe('function');
    });

  });

});
