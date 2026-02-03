/**
 * Syntax Highlighting Utilities
 *
 * Story MSSCI-13970: TypeScript syntax highlighting utilities extracted from
 * js/components/message-view/syntax-highlighter.js
 *
 * Features:
 * - Tokenizer-based highlighting (avoids regex conflicts)
 * - Multi-language support: JS/TS, Python, Go, Rust, Bash
 * - Theme-aware via CSS classes
 */

// Keyword sets by language family
const jsKeywords = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'class',
  'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'try',
  'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'true',
  'false', 'null', 'undefined', 'void',
]);

const pyKeywords = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break',
  'continue', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise',
  'with', 'lambda', 'yield', 'True', 'False', 'None', 'and', 'or', 'not',
  'in', 'is', 'pass', 'self',
]);

const goKeywords = new Set([
  'func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'break',
  'continue', 'go', 'defer', 'chan', 'select', 'type', 'struct', 'interface',
  'map', 'package', 'import', 'var', 'const', 'true', 'false', 'nil', 'make',
  'new', 'append', 'len', 'cap', 'error',
]);

const rustKeywords = new Set([
  'fn', 'let', 'mut', 'return', 'if', 'else', 'for', 'while', 'loop', 'match',
  'break', 'continue', 'impl', 'struct', 'enum', 'trait', 'pub', 'use', 'mod',
  'crate', 'self', 'super', 'where', 'async', 'await', 'true', 'false', 'Some',
  'None', 'Ok', 'Err',
]);

const shKeywords = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case',
  'esac', 'function', 'return', 'exit', 'export', 'source', 'alias', 'cd',
  'echo', 'printf', 'read', 'local',
]);

/**
 * Supported language identifiers for syntax highlighting.
 */
export type SupportedLanguage =
  | 'js' | 'javascript' | 'ts' | 'typescript' | 'jsx' | 'tsx'
  | 'python' | 'py'
  | 'go' | 'golang'
  | 'rust' | 'rs'
  | 'bash' | 'sh' | 'shell' | 'zsh';

/**
 * Get keywords set for a language.
 * @param lang - Language identifier
 * @returns Keywords for the language, or empty set if unsupported
 */
export function getKeywordsForLanguage(lang: string): Set<string> {
  const language = lang.toLowerCase();

  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(language)) {
    return jsKeywords;
  }
  if (['python', 'py'].includes(language)) {
    return pyKeywords;
  }
  if (['go', 'golang'].includes(language)) {
    return goKeywords;
  }
  if (['rust', 'rs'].includes(language)) {
    return rustKeywords;
  }
  if (['bash', 'sh', 'shell', 'zsh'].includes(language)) {
    return shKeywords;
  }

  return new Set();
}

/**
 * Check if a language is supported for syntax highlighting.
 * @param lang - Language identifier
 * @returns true if language is supported
 */
export function isSupportedLanguage(lang: string): boolean {
  return getKeywordsForLanguage(lang).size > 0;
}

/**
 * Check if language uses // for comments.
 * @param lang - Language identifier
 * @returns true if language uses slash comments
 */
function usesSlashComments(lang: string): boolean {
  const language = lang.toLowerCase();
  return ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'go', 'golang', 'rust', 'rs'].includes(language);
}

/**
 * Check if language uses # for comments.
 * @param lang - Language identifier
 * @returns true if language uses hash comments
 */
function usesHashComments(lang: string): boolean {
  const language = lang.toLowerCase();
  return ['python', 'py', 'bash', 'sh', 'shell', 'zsh'].includes(language);
}

/**
 * Highlight a single line of code using tokenizer approach.
 * @param line - Line to highlight (already HTML-escaped)
 * @param keywords - Keywords set for the language
 * @param lang - Language for comment detection
 * @returns HTML with highlighting spans
 */
function highlightLine(line: string, keywords: Set<string>, lang: string): string {
  if (!line.trim()) return line;

  // Handle full-line comments
  const trimmed = line.trim();
  if (usesSlashComments(lang) && trimmed.startsWith('//')) {
    return `<span class="comment">${line}</span>`;
  }
  if (usesHashComments(lang) && trimmed.startsWith('#')) {
    return `<span class="comment">${line}</span>`;
  }

  // Tokenize the line character by character
  let result = '';
  let i = 0;

  while (i < line.length) {
    // Check for HTML-escaped double quote string: &quot;...&quot;
    if (line.slice(i, i + 6) === '&quot;') {
      const endIdx = line.indexOf('&quot;', i + 6);
      if (endIdx !== -1) {
        result += `<span class="string">${line.slice(i, endIdx + 6)}</span>`;
        i = endIdx + 6;
        continue;
      }
    }

    // Check for HTML-escaped single quote string: &#39;...&#39; or &#039;...&#039;
    if (line.slice(i, i + 5) === '&#39;' || line.slice(i, i + 6) === '&#039;') {
      const quoteLen = line.slice(i, i + 6) === '&#039;' ? 6 : 5;
      const quote = line.slice(i, i + quoteLen);
      const endIdx = line.indexOf(quote, i + quoteLen);
      if (endIdx !== -1) {
        result += `<span class="string">${line.slice(i, endIdx + quoteLen)}</span>`;
        i = endIdx + quoteLen;
        continue;
      }
    }

    // Check for word (identifier/keyword)
    if (/[a-zA-Z_]/.test(line[i])) {
      let word = '';
      while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
        word += line[i];
        i++;
      }
      if (keywords.has(word)) {
        result += `<span class="keyword">${word}</span>`;
      } else if (line[i] === '(') {
        result += `<span class="function">${word}</span>`;
      } else {
        result += word;
      }
      continue;
    }

    // Check for number
    if (/[0-9]/.test(line[i])) {
      let num = '';
      while (i < line.length && /[0-9.]/.test(line[i])) {
        num += line[i];
        i++;
      }
      result += `<span class="number">${num}</span>`;
      continue;
    }

    // Default: pass through character
    result += line[i];
    i++;
  }

  return result;
}

/**
 * Highlight code with syntax highlighting.
 * @param code - The code to highlight (already HTML escaped)
 * @param lang - Language identifier (js, ts, python, etc.)
 * @returns HTML with syntax highlighting spans
 */
export function highlightCode(code: string, lang: string): string {
  if (!code || !lang) return code || '';

  const keywords = getKeywordsForLanguage(lang);

  // Process line by line
  const lines = code.split('\n');
  const highlightedLines = lines.map((line) => highlightLine(line, keywords, lang));

  return highlightedLines.join('\n');
}

export default {
  highlightCode,
  getKeywordsForLanguage,
  isSupportedLanguage,
};
