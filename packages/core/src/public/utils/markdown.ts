/**
 * Markdown Utilities
 *
 * Story MSSCI-13969: TypeScript markdown parsing utilities extracted from
 * js/components/message-view/markdown-parser.js
 *
 * Security: XSS prevention via HTML escaping BEFORE markdown processing.
 */

import { highlightCode } from './syntax';

/**
 * Strip CYCLIST structured markers from text before rendering.
 * These markers are used for machine parsing (quick actions) but should
 * be invisible to users.
 * @param text - Text that may contain CYCLIST markers
 * @returns Text with markers removed
 */
export function stripMarkers(text: string | null | undefined): string {
  if (!text) return text as string;
  // Remove CYCLIST markers: <!-- CYCLIST:TYPE --> or <!-- CYCLIST:TYPE:value -->
  return text.replace(/<!--\s*CYCLIST:[^>]+?\s*-->/gi, '').trim();
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param text - Raw text that may contain HTML
 * @returns Escaped text safe for HTML rendering
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Parse cells from a table line: | cell1 | cell2 | cell3 |
 * @param line - Table row line
 * @returns Array of cell contents
 */
function parseCells(line: string): string[] {
  return line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, index, arr) => {
      // Filter out empty first/last cells from leading/trailing |
      if (index === 0 && cell === '') return false;
      if (index === arr.length - 1 && cell === '') return false;
      return true;
    });
}

/**
 * Check if a line is a separator row (|---|---|)
 * @param line - Table row line
 * @returns boolean
 */
function isSeparator(line: string): boolean {
  const cells = parseCells(line);
  return cells.every((cell) => /^[-:]+$/.test(cell));
}

/**
 * Convert array of table lines to HTML table
 * @param lines - Array of | delimited lines
 * @returns HTML table string
 */
function convertTableLinesToHtml(lines: string[]): string {
  if (lines.length === 0) return '';

  // Filter out separator rows and identify header
  const dataLines: string[] = [];
  let headerLine: string | null = null;
  let foundSeparator = false;

  for (const line of lines) {
    if (isSeparator(line)) {
      foundSeparator = true;
      continue; // Skip separator rows
    }
    if (!foundSeparator && headerLine === null) {
      headerLine = line; // First non-separator row is header
    } else {
      dataLines.push(line);
    }
  }

  // Build HTML table
  let html = '<div class="table-wrapper"><table>';

  // Header row
  if (headerLine) {
    const headerCells = parseCells(headerLine);
    html += '<thead><tr>';
    for (let i = 0; i < headerCells.length; i++) {
      html += `<th data-col="${i}" class="sortable-th">${headerCells[i]} <span class="sort-indicator"></span></th>`;
    }
    html += '</tr></thead>';
  }

  // Body rows
  if (dataLines.length > 0) {
    html += '<tbody>';
    for (const line of dataLines) {
      const cells = parseCells(line);
      html += '<tr>';
      for (const cell of cells) {
        html += `<td>${cell}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table></div>';
  return html;
}

/**
 * Parse markdown tables to HTML
 * Detects consecutive lines starting with | and converts to <table>
 * @param text - Text with escaped HTML
 * @returns Text with tables converted to HTML
 */
function parseMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if line is a table row (starts and ends with |, or starts with |)
    const isTableRow = line.startsWith('|') && line.includes('|', 1);

    if (isTableRow) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
    } else {
      // End of table or not a table line
      if (inTable && tableLines.length > 0) {
        result.push(convertTableLinesToHtml(tableLines));
        tableLines = [];
        inTable = false;
      }
      result.push(lines[i]); // Preserve original line (not trimmed)
    }
  }

  // Handle table at end of text
  if (inTable && tableLines.length > 0) {
    result.push(convertTableLinesToHtml(tableLines));
  }

  return result.join('\n');
}

/**
 * Parse markdown text to HTML with XSS protection.
 * @param markdown - Raw markdown text
 * @returns HTML string
 */
export function parseMarkdown(markdown: string | null | undefined): string {
  if (!markdown) return '';

  // Strip CYCLIST structured markers BEFORE escaping HTML
  // These are for quick-actions parsing, not display
  const cleaned = stripMarkers(markdown);

  // SECURITY: Escape HTML special characters FIRST to prevent XSS
  // This ensures any <script>, <img onerror>, etc. are neutralized before processing
  // Markdown syntax chars (*, #, `, -) are NOT escaped, so regexes still work
  let html = escapeHtml(cleaned);

  // Code blocks with syntax highlighting (must be first to avoid conflicts)
  // Content is already escaped, apply highlighting then wrap
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : '';
    const highlighted = lang ? highlightCode(code.trim(), lang) : code.trim();
    return `<pre><code${langClass}>${highlighted}</code></pre>`;
  });

  // B-15: Join multi-line list items BEFORE other processing
  // Indented continuation lines (2+ spaces) are joined to previous list item
  // Stop at blank lines or new list items
  html = html.replace(/^(\d+\.\s+.+)\n((?:  +[^\n]+\n)+)/gm, (_, firstLine, continuation) => {
    // Join continuation lines with spaces, removing leading whitespace
    // Preserve trailing newline for next list item
    const joined = continuation.trim().replace(/\n\s*/g, ' ');
    return `${firstLine} ${joined}\n`;
  });

  // Inline code - content already escaped
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Tables - convert | delimited rows to HTML tables
  // Must be after code blocks to avoid parsing tables in code
  html = parseMarkdownTables(html);

  // Headers (h1-h6) - content already escaped
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic - content already escaped
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Unordered lists - mark with data attribute to distinguish from ordered
  html = html.replace(/^- (.+)$/gm, '<li data-ul>$1</li>');

  // Ordered lists - mark with data attribute
  // B-15: Match ordered list items that may contain inline formatting
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li data-ol>$1</li>');

  // Wrap consecutive unordered list items
  html = html.replace(/(<li data-ul>.*?<\/li>\n?)+/g, (match) => {
    return `<ul>${match.replace(/ data-ul/g, '')}</ul>`;
  });

  // Wrap consecutive ordered list items
  html = html.replace(/(<li data-ol>.*?<\/li>\n?)+/g, (match) => {
    return `<ol>${match.replace(/ data-ol/g, '')}</ol>`;
  });

  // Paragraphs (lines not already wrapped) - content already escaped
  // Excludes: h1-6, ul, ol, li, pre, div (table-wrapper), table elements
  html = html.replace(/^(?!<[hulodtp]|<pre|<li)(.+)$/gm, '<p>$1</p>');

  return html;
}

export default {
  parseMarkdown,
  escapeHtml,
  stripMarkers,
};
