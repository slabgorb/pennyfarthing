/**
 * useMarkdownParser Hook
 *
 * Story MSSCI-13969: React hook for parsing markdown to HTML with security.
 * Extracted from js/components/message-view/markdown-parser.js
 *
 * Features:
 * - XSS prevention via HTML escaping
 * - CYCLIST marker stripping
 * - Memoization for performance
 */

import { useMemo } from 'react';
import { parseMarkdown } from '../utils/markdown.js';

export interface UseMarkdownParserResult {
  html: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * React hook for parsing markdown to HTML with security and memoization.
 * @param markdown - Raw markdown text (or null)
 * @returns Object with html string, loading state, and error
 */
export function useMarkdownParser(
  markdown: string | null
): UseMarkdownParserResult {
  const html = useMemo(() => {
    if (!markdown) return '';
    return parseMarkdown(markdown);
  }, [markdown]);

  return { html, isLoading: false, error: null };
}
