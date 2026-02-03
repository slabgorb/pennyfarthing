/**
 * useMarkdownParser Hook - STUB for TDD RED phase
 *
 * Story MSSCI-13969: Convert markdown-parser.js to React hook
 * This stub allows tests to compile but fail on assertions.
 *
 * TODO: Dev implements this in GREEN phase
 */

import { useMemo } from 'react';

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
  // STUB: Not implemented - for TDD RED phase
  throw new Error('useMarkdownParser not implemented');
}
