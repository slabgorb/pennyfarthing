/**
 * Story MSSCI-13969: useMarkdownParser Hook Tests
 *
 * TDD RED phase - these tests should FAIL until Dev implements the functionality.
 * Tests verify all acceptance criteria for converting markdown-parser.js to a React hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Import the hook - will fail until implemented
import { useMarkdownParser } from '../src/public/hooks/useMarkdownParser.js';

// Import utility functions - will fail until extracted
import {
  parseMarkdown,
  escapeHtml,
  stripMarkers,
} from '../src/public/utils/markdown.js';

describe('MSSCI-13969: useMarkdownParser Hook', () => {
  describe('AC1: Hook converts markdown to HTML', () => {
    it('should return html string from markdown input', () => {
      const { result } = renderHook(() => useMarkdownParser('# Hello World'));
      expect(result.current.html).toContain('<h1>Hello World</h1>');
    });

    it('should return empty string for null input', () => {
      const { result } = renderHook(() => useMarkdownParser(null));
      expect(result.current.html).toBe('');
    });

    it('should return empty string for empty string input', () => {
      const { result } = renderHook(() => useMarkdownParser(''));
      expect(result.current.html).toBe('');
    });

    it('should return isLoading false (sync operation)', () => {
      const { result } = renderHook(() => useMarkdownParser('# Test'));
      expect(result.current.isLoading).toBe(false);
    });

    it('should return error as null on success', () => {
      const { result } = renderHook(() => useMarkdownParser('# Test'));
      expect(result.current.error).toBeNull();
    });
  });

  describe('AC2: Handles code blocks with language detection', () => {
    it('should wrap code blocks in pre/code tags', () => {
      const markdown = '```javascript\nconst x = 1;\n```';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<pre>');
      expect(result.current.html).toContain('<code');
    });

    it('should add language class to code blocks', () => {
      const markdown = '```typescript\nconst x: number = 1;\n```';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('class="language-typescript"');
    });

    it('should handle code blocks without language specified', () => {
      const markdown = '```\nplain code\n```';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<pre>');
      expect(result.current.html).toContain('plain code');
    });

    it('should handle inline code', () => {
      const markdown = 'Use `npm install` to install';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<code>npm install</code>');
    });
  });

  describe('AC3: Sanitizes against XSS via HTML escaping', () => {
    it('should escape script tags', () => {
      const markdown = '<script>alert("xss")</script>';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).not.toContain('<script>');
      expect(result.current.html).toContain('&lt;script&gt;');
    });

    it('should escape img onerror attacks', () => {
      const markdown = '<img src="x" onerror="alert(1)">';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).not.toContain('onerror=');
      expect(result.current.html).toContain('&lt;img');
    });

    it('should escape HTML special characters', () => {
      const markdown = '5 > 3 && 3 < 5';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('&gt;');
      expect(result.current.html).toContain('&lt;');
      expect(result.current.html).toContain('&amp;');
    });

    it('should escape quotes', () => {
      const markdown = 'He said "hello" and \'goodbye\'';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('&quot;');
      expect(result.current.html).toContain('&#039;');
    });
  });

  describe('AC4: Memoizes results based on input', () => {
    it('should return same reference for same input', () => {
      const markdown = '# Test';
      const { result, rerender } = renderHook(
        ({ md }) => useMarkdownParser(md),
        { initialProps: { md: markdown } }
      );
      const firstHtml = result.current.html;

      // Rerender with same input
      rerender({ md: markdown });

      // Should be the same string (memoized)
      expect(result.current.html).toBe(firstHtml);
    });

    it('should recompute when input changes', () => {
      const { result, rerender } = renderHook(
        ({ md }) => useMarkdownParser(md),
        { initialProps: { md: '# First' } }
      );
      const firstHtml = result.current.html;

      // Rerender with different input
      rerender({ md: '# Second' });

      // Should be different
      expect(result.current.html).not.toBe(firstHtml);
      expect(result.current.html).toContain('Second');
    });
  });

  describe('AC5: Strips CYCLIST markers before rendering', () => {
    it('should remove CYCLIST:HANDOFF markers', () => {
      const markdown = 'Some text\n<!-- CYCLIST:HANDOFF:/dev -->\nMore text';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).not.toContain('CYCLIST');
      expect(result.current.html).not.toContain('HANDOFF');
    });

    it('should remove CYCLIST:QUESTION markers', () => {
      const markdown = 'Question here\n<!-- CYCLIST:QUESTION:yesno -->';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).not.toContain('CYCLIST');
      expect(result.current.html).not.toContain('QUESTION');
    });

    it('should remove CYCLIST:CHOICES markers', () => {
      const markdown = 'Choose:\n<!-- CYCLIST:CHOICES:a,b,c -->';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).not.toContain('CYCLIST');
      expect(result.current.html).not.toContain('CHOICES');
    });

    it('should remove CYCLIST:CONTINUE markers', () => {
      const markdown = 'Text\n<!-- CYCLIST:CONTINUE -->';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).not.toContain('CYCLIST');
      expect(result.current.html).not.toContain('CONTINUE');
    });

    it('should handle multiple markers in same text', () => {
      const markdown = `
Some text
<!-- CYCLIST:HANDOFF:/dev -->
More text
<!-- CYCLIST:QUESTION:open -->
Final text`;
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).not.toContain('CYCLIST');
      expect(result.current.html).toContain('Some text');
      expect(result.current.html).toContain('More text');
      expect(result.current.html).toContain('Final text');
    });
  });

  describe('Additional markdown features', () => {
    it('should parse headers h1-h6', () => {
      const markdown = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<h1>H1</h1>');
      expect(result.current.html).toContain('<h2>H2</h2>');
      expect(result.current.html).toContain('<h3>H3</h3>');
      expect(result.current.html).toContain('<h4>H4</h4>');
      expect(result.current.html).toContain('<h5>H5</h5>');
      expect(result.current.html).toContain('<h6>H6</h6>');
    });

    it('should parse bold text', () => {
      const markdown = 'This is **bold** text';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<strong>bold</strong>');
    });

    it('should parse italic text', () => {
      const markdown = 'This is *italic* text';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<em>italic</em>');
    });

    it('should parse unordered lists', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<ul>');
      expect(result.current.html).toContain('<li>Item 1</li>');
      expect(result.current.html).toContain('<li>Item 2</li>');
      expect(result.current.html).toContain('<li>Item 3</li>');
      expect(result.current.html).toContain('</ul>');
    });

    it('should parse ordered lists', () => {
      const markdown = '1. First\n2. Second\n3. Third';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<ol>');
      expect(result.current.html).toContain('<li>First</li>');
      expect(result.current.html).toContain('<li>Second</li>');
      expect(result.current.html).toContain('<li>Third</li>');
      expect(result.current.html).toContain('</ol>');
    });

    it('should parse markdown tables', () => {
      const markdown = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1 | Cell 2 |';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<table>');
      expect(result.current.html).toContain('<thead>');
      expect(result.current.html).toContain('<th>Header 1</th>');
      expect(result.current.html).toContain('<tbody>');
      expect(result.current.html).toContain('<td>Cell 1</td>');
    });

    it('should wrap paragraphs in p tags', () => {
      const markdown = 'This is a paragraph.';
      const { result } = renderHook(() => useMarkdownParser(markdown));
      expect(result.current.html).toContain('<p>This is a paragraph.</p>');
    });
  });
});

describe('Utility Functions (extracted to markdown.ts)', () => {
  describe('parseMarkdown', () => {
    it('should convert markdown to HTML', () => {
      const result = parseMarkdown('# Hello');
      expect(result).toContain('<h1>Hello</h1>');
    });

    it('should return empty string for null/undefined', () => {
      expect(parseMarkdown(null as unknown as string)).toBe('');
      expect(parseMarkdown(undefined as unknown as string)).toBe('');
      expect(parseMarkdown('')).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#039;s');
    });

    it('should escape all special characters together', () => {
      const input = '<script>alert("xss" && \'bad\')</script>';
      const result = escapeHtml(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain("'");
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&#039;');
    });
  });

  describe('stripMarkers', () => {
    it('should remove CYCLIST markers', () => {
      const input = 'text <!-- CYCLIST:HANDOFF:/dev --> more';
      expect(stripMarkers(input)).toBe('text  more');
    });

    it('should handle markers with values', () => {
      const input = '<!-- CYCLIST:CHOICES:a,b,c -->';
      expect(stripMarkers(input)).toBe('');
    });

    it('should return input unchanged if no markers', () => {
      const input = 'plain text with no markers';
      expect(stripMarkers(input)).toBe('plain text with no markers');
    });

    it('should handle null/empty input', () => {
      expect(stripMarkers(null as unknown as string)).toBeFalsy();
      expect(stripMarkers('')).toBe('');
    });

    it('should handle multiple markers', () => {
      const input = '<!-- CYCLIST:A --> text <!-- CYCLIST:B -->';
      const result = stripMarkers(input);
      expect(result).not.toContain('CYCLIST');
      expect(result.trim()).toBe('text');
    });
  });
});
