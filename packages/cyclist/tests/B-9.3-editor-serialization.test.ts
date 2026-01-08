/**
 * B-9.3: Rich Text Editor - Markdown Serialization Tests
 *
 * Tests verify markdown serialization from TipTap JSON to clean markdown.
 *
 * Acceptance Criteria:
 * - AC1: Enter key submits and clears editor
 * - AC2: Content serialized to clean markdown
 * - AC3: Lists become - or 1. format
 * - AC4: Code blocks preserved with ``` fences
 * - AC5: Shift+Enter creates newline (no submit)
 * - AC6: Claude receives and processes the markdown
 */

import { describe, it, expect } from 'vitest';

describe('B-9.3: Markdown Serialization', () => {

  describe('Module Exports', () => {

    it('should export getEditorMarkdown function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.getEditorMarkdown).toBeDefined();
      expect(typeof editor.getEditorMarkdown).toBe('function');
    });

    it('should export jsonToMarkdown function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.jsonToMarkdown).toBeDefined();
      expect(typeof editor.jsonToMarkdown).toBe('function');
    });

  });

  describe('AC2: Markdown Serialization', () => {

    it('should serialize plain text paragraph', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }]
          }
        ]
      };

      expect(jsonToMarkdown(doc)).toBe('Hello world');
    });

    it('should serialize bold text with **', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: 'world', marks: [{ type: 'bold' }] }
            ]
          }
        ]
      };

      expect(jsonToMarkdown(doc)).toBe('Hello **world**');
    });

    it('should serialize italic text with *', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'emphasized', marks: [{ type: 'italic' }] }
            ]
          }
        ]
      };

      expect(jsonToMarkdown(doc)).toBe('*emphasized*');
    });

    it('should serialize inline code with backticks', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Use ' },
              { type: 'text', text: 'const', marks: [{ type: 'code' }] },
              { type: 'text', text: ' keyword' }
            ]
          }
        ]
      };

      expect(jsonToMarkdown(doc)).toBe('Use `const` keyword');
    });

  });

  describe('AC3: List Serialization', () => {

    it('should serialize bullet list with -', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }
                ]
              },
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }
                ]
              }
            ]
          }
        ]
      };

      const result = jsonToMarkdown(doc);
      expect(result).toContain('- Item one');
      expect(result).toContain('- Item two');
    });

    it('should serialize ordered list with numbers', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'First' }] }
                ]
              },
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }
                ]
              }
            ]
          }
        ]
      };

      const result = jsonToMarkdown(doc);
      expect(result).toContain('1.');
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });

  });

  describe('AC4: Code Block Serialization', () => {

    it('should serialize code block with ``` fences', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'javascript' },
            content: [{ type: 'text', text: 'const x = 1;' }]
          }
        ]
      };

      const result = jsonToMarkdown(doc);
      expect(result).toContain('```javascript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('```');
    });

    it('should handle code block without language', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            content: [{ type: 'text', text: 'plain code' }]
          }
        ]
      };

      const result = jsonToMarkdown(doc);
      expect(result).toContain('```\n');
      expect(result).toContain('plain code');
    });

  });

  describe('Edge Cases', () => {

    it('should handle empty document', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      expect(jsonToMarkdown(null)).toBe('');
      expect(jsonToMarkdown(undefined)).toBe('');
      expect(jsonToMarkdown({ type: 'doc', content: [] })).toBe('');
    });

    it('should handle multiple paragraphs', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First para' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second para' }] }
        ]
      };

      const result = jsonToMarkdown(doc);
      expect(result).toContain('First para');
      expect(result).toContain('Second para');
      expect(result).toContain('\n\n'); // Paragraphs separated by blank line
    });

    it('should handle hard breaks as newlines', async () => {
      const { jsonToMarkdown } = await import('../src/public/js/editor.js');

      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line one' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Line two' }
            ]
          }
        ]
      };

      const result = jsonToMarkdown(doc);
      expect(result).toContain('Line one\nLine two');
    });

  });

});
