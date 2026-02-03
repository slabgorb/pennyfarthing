/**
 * useSyntaxHighlighter Hook
 *
 * Story MSSCI-13970: React hook for syntax highlighting code blocks.
 * Extracted from js/components/message-view/syntax-highlighter.js
 *
 * Features:
 * - Multi-language support (JS/TS, Python, Go, Rust, Bash)
 * - Tokenizer-based highlighting (keyword, string, comment, number, function)
 * - Theme-aware via CSS variables
 * - Memoization for performance
 */

import { useMemo } from 'react';
import { highlightCode, isSupportedLanguage } from '../utils/syntax';

export interface UseSyntaxHighlighterResult {
  /** HTML string with syntax highlighting spans */
  highlighted: string;
  /** Whether the language is supported for highlighting */
  isSupported: boolean;
}

/**
 * React hook for syntax highlighting code blocks with memoization.
 *
 * @param code - Code to highlight (already HTML-escaped, or null)
 * @param lang - Language identifier (js, ts, python, go, rust, bash, etc.)
 * @returns Object with highlighted HTML and support status
 *
 * @example
 * ```tsx
 * const { highlighted, isSupported } = useSyntaxHighlighter(code, 'typescript');
 * return <pre dangerouslySetInnerHTML={{ __html: highlighted }} />;
 * ```
 */
export function useSyntaxHighlighter(
  code: string | null,
  lang: string
): UseSyntaxHighlighterResult {
  const isSupported = useMemo(() => {
    return lang ? isSupportedLanguage(lang) : false;
  }, [lang]);

  const highlighted = useMemo(() => {
    if (!code) return '';
    if (!lang || !isSupported) return code;
    return highlightCode(code, lang);
  }, [code, lang, isSupported]);

  return { highlighted, isSupported };
}
