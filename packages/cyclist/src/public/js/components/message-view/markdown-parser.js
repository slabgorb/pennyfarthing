/**
 * Markdown Parser
 *
 * Parse markdown text to HTML with security (XSS prevention).
 * Extracted from MessageView.js for better maintainability.
 */

import { highlightCode } from './syntax-highlighter.js';

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const map = {
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
 * @param {string} line - Table row line
 * @returns {string[]} Array of cell contents
 */
function parseCells(line) {
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
 * @param {string} line - Table row line
 * @returns {boolean}
 */
function isSeparator(line) {
  const cells = parseCells(line);
  return cells.every((cell) => /^[-:]+$/.test(cell));
}

/**
 * Convert array of table lines to HTML table
 * @param {string[]} lines - Array of | delimited lines
 * @returns {string} HTML table string
 */
function convertTableLinesToHtml(lines) {
  if (lines.length === 0) return '';

  // Filter out separator rows and identify header
  const dataLines = [];
  let headerLine = null;
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
    for (const cell of headerCells) {
      html += `<th>${cell}</th>`;
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
 * @param {string} text - Text with escaped HTML
 * @returns {string} Text with tables converted to HTML
 */
function parseMarkdownTables(text) {
  const lines = text.split('\n');
  const result = [];
  let tableLines = [];
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
 * Parse markdown text to HTML
 * @param {string} markdown - Raw markdown text
 * @returns {string} HTML string
 */
export function parseMarkdown(markdown) {
  if (!markdown) return '';

  // SECURITY: Escape HTML special characters FIRST to prevent XSS
  // This ensures any <script>, <img onerror>, etc. are neutralized before processing
  // Markdown syntax chars (*, #, `, -) are NOT escaped, so regexes still work
  let html = escapeHtml(markdown);

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
};
