/**
 * Response Formatter for VS Code Chat
 *
 * MSSCI-12126: Chat response formatting improvements
 * MSSCI-12147: XML tag stripping for clean display
 *
 * Provides formatting utilities for Claude responses in VS Code chat:
 * - XML/system tag stripping (MSSCI-12147)
 * - Code block syntax highlighting
 * - Collapsible tool use sections
 * - File path clickable links
 * - Markdown table rendering
 * - Progress indicators
 */

import * as vscode from 'vscode';

// ============================================================================
// MSSCI-12147: XML Tag Stripping
// ============================================================================

/**
 * System tags that should be stripped from display.
 * These are internal markers that shouldn't be shown to users.
 */
const SYSTEM_TAG_PATTERNS: RegExp[] = [
  // System reminders injected by Claude Code
  /<system-reminder>[\s\S]*?<\/system-reminder>/gi,
  // Tool output wrappers
  /<output>[\s\S]*?<\/output>/gi,
  // Tool result containers
  /<result>[\s\S]*?<\/result>/gi,
  // Function call blocks (antml namespace)
  /<[\w-]+[^>]*>[\s\S]*?<\/antml:[\w-]+>/gi,
  // Function results
  /<function_results>[\s\S]*?<\/function_results>/gi,
];

/**
 * Strip system XML tags from text for clean display.
 * Preserves content inside code blocks.
 *
 * @param text - Text that may contain system XML tags
 * @returns Text with system tags removed
 */
export function stripSystemTags(text: string): string {
  if (!text) {
    return '';
  }

  // First, identify code blocks to preserve them
  const codeBlockPlaceholders: Map<string, string> = new Map();
  let placeholderIndex = 0;

  // Replace code blocks with placeholders
  let result = text.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_BLOCK_${placeholderIndex++}__`;
    codeBlockPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Strip all system tags
  for (const pattern of SYSTEM_TAG_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // Restore code blocks
  for (const [placeholder, original] of codeBlockPlaceholders) {
    result = result.replace(placeholder, original);
  }

  return result;
}

// ============================================================================
// AC1: Code Block Syntax Highlighting
// ============================================================================

// Regex to match code blocks with optional language
const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

/**
 * Format code blocks with language hints for syntax highlighting.
 * Infers language from content when not specified.
 */
export function formatCodeBlocks(text: string): string {
  return text.replace(CODE_BLOCK_REGEX, (match, lang, content) => {
    // If language already specified, preserve it
    if (lang && lang.trim()) {
      return match;
    }

    // Try to infer language from content
    const inferred = inferLanguage(content);
    if (inferred) {
      return '```' + inferred + '\n' + content + '```';
    }

    // Leave as-is if cannot infer
    return match;
  });
}

/**
 * Infer programming language from code content.
 * Returns language identifier or null if cannot be determined.
 */
export function inferLanguage(code: string): string | null {
  const trimmed = code.trim();

  // TypeScript patterns - check before JavaScript
  if (
    /\binterface\s+\w+\s*\{/.test(trimmed) ||
    /\btype\s+\w+\s*=/.test(trimmed) ||
    /:\s*(string|number|boolean|any|void|never)\b/.test(trimmed) ||
    /\bexport\s+(interface|type)\b/.test(trimmed)
  ) {
    return 'typescript';
  }

  // Go patterns
  if (
    /^package\s+\w+/.test(trimmed) ||
    /\bfunc\s+\w+\(/.test(trimmed) ||
    /\bimport\s+"/.test(trimmed) ||
    /\bfmt\.\w+/.test(trimmed)
  ) {
    return 'go';
  }

  // Python patterns
  if (
    /^def\s+\w+\(.*\):/.test(trimmed) ||
    /^import\s+\w+/.test(trimmed) ||
    /^from\s+\w+\s+import/.test(trimmed) ||
    /\bprint\(/.test(trimmed)
  ) {
    return 'python';
  }

  // JSON patterns - check for object/array structure
  if (
    /^\s*[\[{]/.test(trimmed) &&
    /[\]}]\s*$/.test(trimmed) &&
    /"[^"]+"\s*:/.test(trimmed)
  ) {
    return 'json';
  }

  // YAML patterns
  if (
    /^\w+:\s*\S/.test(trimmed) &&
    /\n\s*\w+:/.test(trimmed) &&
    !trimmed.includes('{')
  ) {
    return 'yaml';
  }

  // Bash/shell patterns
  if (
    /^(npm|yarn|pnpm|git|cd|ls|cat|mkdir|rm|chmod|echo|export)\s/.test(
      trimmed
    ) ||
    /^\$\s/.test(trimmed) ||
    /\|\s*(grep|awk|sed|xargs)/.test(trimmed)
  ) {
    return 'bash';
  }

  // JavaScript patterns (CommonJS)
  if (
    /\brequire\s*\(/.test(trimmed) ||
    /\bmodule\.exports\s*=/.test(trimmed)
  ) {
    return 'javascript';
  }

  // Cannot determine
  return null;
}

// ============================================================================
// AC2: Collapsible Tool Use Sections
// ============================================================================

// Tool type emoji mapping
const TOOL_EMOJI: Record<string, string> = {
  Read: '📖',
  Write: '✏️',
  Edit: '📝',
  Bash: '💻',
  Task: '🔄',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  default: '🔧',
};

/**
 * Format tool use as collapsible HTML details/summary section.
 */
export function formatToolUse(
  toolName: string,
  input: Record<string, unknown>
): string {
  const emoji = TOOL_EMOJI[toolName] || TOOL_EMOJI.default;
  const inputJson = JSON.stringify(input, null, 2);

  // Truncate long input
  const maxLength = 1000;
  const truncatedInput =
    inputJson.length > maxLength
      ? inputJson.substring(0, maxLength) + '\n  ...(truncated)...'
      : inputJson;

  return `
<details>
<summary>${emoji} Tool: ${toolName}</summary>

\`\`\`json
${truncatedInput}
\`\`\`

</details>
`.trim();
}

// ============================================================================
// AC3: File Path Clickable Links
// ============================================================================

// Regex to match file paths with optional line:column
// Matches absolute paths (/...) and common relative paths (src/..., ./..., etc.)
const FILE_PATH_REGEX =
  /((?:\/[\w.-]+)+(?:\/[\w.-]+)*\.[\w]+)(?::(\d+)(?::(\d+))?)?/g;
const RELATIVE_PATH_REGEX =
  /(?:^|\s)((?:src|lib|test|tests|packages|internal)\/[\w./-]+\.[\w]+)/g;

/**
 * Convert file paths in text to clickable VS Code command links.
 */
export function formatFilePaths(text: string): string {
  // First, identify code blocks to exclude them
  const codeBlocks: Array<{ start: number; end: number }> = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push({ start: match.index, end: match.index + match[0].length });
  }

  // Also exclude existing markdown links
  const existingLinks: Array<{ start: number; end: number }> = [];
  const linkRegex = /\[[^\]]+\]\([^)]+\)/g;
  while ((match = linkRegex.exec(text)) !== null) {
    existingLinks.push({ start: match.index, end: match.index + match[0].length });
  }

  const isInExcludedRegion = (index: number): boolean => {
    return (
      codeBlocks.some((block) => index >= block.start && index < block.end) ||
      existingLinks.some((link) => index >= link.start && index < link.end)
    );
  };

  // Process absolute paths
  let result = text.replace(
    FILE_PATH_REGEX,
    (match, path, line, column, _offset) => {
      if (isInExcludedRegion(_offset)) {
        return match;
      }
      const lineNum = line ? parseInt(line, 10) : undefined;
      const colNum = column ? parseInt(column, 10) : undefined;
      return createFileLink(path, lineNum, colNum);
    }
  );

  // Process relative paths
  result = result.replace(RELATIVE_PATH_REGEX, (match, path) => {
    // Check if this position is now in an excluded region (including new links we added)
    // For simplicity, just do the replacement
    const trimmedMatch = match.trimStart();
    const leadingSpace = match.substring(0, match.length - trimmedMatch.length);

    // Get workspace folder for relative path resolution
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const fullPath = workspaceFolder
      ? `${workspaceFolder.uri.fsPath}/${path}`
      : path;

    return leadingSpace + createFileLink(fullPath);
  });

  return result;
}

/**
 * Create a VS Code command URI link for opening a file.
 */
export function createFileLink(
  filePath: string,
  line?: number,
  column?: number
): string {
  // Extract filename for display
  const filename = filePath.split('/').pop() || filePath;
  const displayName =
    line !== undefined
      ? column !== undefined
        ? `${filename}:${line}:${column}`
        : `${filename}:${line}`
      : filename;

  // Build the command URI
  // vscode.open expects a URI, and we can pass selection as query params
  const uri = vscode.Uri.file(filePath);
  const args: Record<string, unknown> = { uri: uri.toString() };

  if (line !== undefined) {
    // VS Code uses 0-based line numbers internally
    args.selection = {
      start: { line: line - 1, character: column ? column - 1 : 0 },
      end: { line: line - 1, character: column ? column - 1 : 0 },
    };
  }

  // Encode the arguments
  const encodedArgs = encodeURIComponent(JSON.stringify([uri, args.selection]));

  return `[${displayName}](command:vscode.open?${encodedArgs})`;
}

// ============================================================================
// AC4: Markdown Table Rendering
// ============================================================================

// Regex to detect table rows
const TABLE_ROW_REGEX = /^\|.+\|$/;

/**
 * Format markdown tables with proper spacing and alignment.
 */
export function formatTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check if this might be the start of a table
    if (TABLE_ROW_REGEX.test(line.trim())) {
      const tableLines: string[] = [line];
      let j = i + 1;

      // Collect consecutive table rows
      while (j < lines.length && TABLE_ROW_REGEX.test(lines[j].trim())) {
        tableLines.push(lines[j]);
        j++;
      }

      // If we have at least 2 rows, it might be a table
      if (tableLines.length >= 2) {
        // Check if this is already a well-formed table
        const isWellFormed = isWellFormedTable(tableLines);

        if (isWellFormed) {
          // Pass through well-formed tables unchanged
          result.push(...tableLines);
        } else {
          // Format malformed tables
          const formattedTable = formatTableRows(tableLines);
          result.push(...formattedTable);
        }
        i = j;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

/**
 * Check if a table is well-formed (has proper structure and formatting).
 */
function isWellFormedTable(rows: string[]): boolean {
  // A well-formed table must have:
  // 1. At least 2 rows (header + separator or header + data)
  // 2. Second row should be a separator
  // 3. All rows should have the same number of cells
  // 4. Non-separator rows should have consistent spacing (spaces after/before pipes)

  if (rows.length < 2) {
    return false;
  }

  // Parse cells from each row
  const parsedRows = rows.map((row) => {
    const cells = row
      .split('|')
      .slice(1, -1) // Remove empty strings from split
      .map((cell) => cell.trim());
    return cells;
  });

  // Check if all rows have the same number of cells
  const cellCount = parsedRows[0].length;
  if (!parsedRows.every((row) => row.length === cellCount)) {
    return false;
  }

  // Check if second row is a separator
  const secondRow = parsedRows[1];
  const isSecondRowSeparator = secondRow.every((cell) => isSeparatorCell(cell));

  if (!isSecondRowSeparator) {
    return false;
  }

  // Check for consistent spacing in non-separator rows
  // Non-separator rows should have spaces after opening pipe and before closing pipe
  for (let i = 0; i < rows.length; i++) {
    if (i === 1) continue; // Skip separator row
    const row = rows[i];
    // Well-formed rows start with "| " and end with " |"
    if (!row.match(/^\|\s/) || !row.match(/\s\|$/)) {
      return false;
    }
  }

  return true;
}

/**
 * Format a set of table rows with proper spacing.
 */
function formatTableRows(rows: string[]): string[] {
  // Parse cells from each row
  const parsedRows = rows.map((row) => {
    const cells = row
      .split('|')
      .slice(1, -1) // Remove empty strings from split
      .map((cell) => cell.trim());
    return cells;
  });

  // Check if second row is a separator
  const hasSeparator =
    parsedRows.length >= 2 && isSeparatorRow(parsedRows[1].join('|'));

  // If no separator, we need to add one after the header
  const addedSeparator = !hasSeparator && parsedRows.length >= 2;
  if (addedSeparator) {
    const separatorRow = parsedRows[0].map(() => '---');
    parsedRows.splice(1, 0, separatorRow);

    // When adding a separator, return minimal format and exit
    return parsedRows.map((cells, rowIndex) => {
      if (rowIndex === 1) {
        // Return minimal separator format: |---|---|...
        return '|' + cells.map(() => '---').join('|') + '|';
      }
      // Return other rows with minimal spacing
      return '|' + cells.join('|') + '|';
    });
  }

  // If separator already exists, format consistently with spacing
  // Calculate column widths
  const colCount = Math.max(...parsedRows.map((r) => r.length));
  const colWidths: number[] = [];

  for (let col = 0; col < colCount; col++) {
    let maxWidth = 3; // Minimum width of 3 for separator
    for (const row of parsedRows) {
      if (row[col]) {
        maxWidth = Math.max(maxWidth, row[col].length);
      }
    }
    colWidths.push(maxWidth);
  }

  // Format each row with proper spacing
  return parsedRows.map((cells) => {
    const formattedCells = cells.map((cell, colIndex) => {
      // Check if this is a separator cell
      if (isSeparatorCell(cell)) {
        const width = colWidths[colIndex] || 3;
        // Preserve alignment markers
        if (cell.startsWith(':') && cell.endsWith(':')) {
          return ':' + '-'.repeat(width - 2) + ':';
        } else if (cell.startsWith(':')) {
          return ':' + '-'.repeat(width - 1);
        } else if (cell.endsWith(':')) {
          return '-'.repeat(width - 1) + ':';
        }
        return '-'.repeat(width);
      }
      const width = colWidths[colIndex] || 3;
      return cell.padEnd(width);
    });

    return '| ' + formattedCells.join(' | ') + ' |';
  });
}

/**
 * Check if a row is a separator row.
 */
function isSeparatorRow(row: string): boolean {
  return /^[\s|:-]+$/.test(row) && row.includes('-');
}

/**
 * Check if a cell is a separator cell.
 */
function isSeparatorCell(cell: string): boolean {
  return /^:?-+:?$/.test(cell);
}

// ============================================================================
// AC5: Progress Indicators
// ============================================================================

// Progress messages by tool type
const PROGRESS_MESSAGES: Record<string, string> = {
  Read: 'Reading file...',
  Write: 'Writing file...',
  Edit: 'Editing file...',
  Bash: 'Running command...',
  Task: 'Running task...',
  Glob: 'Searching files...',
  Grep: 'Searching content...',
  WebFetch: 'Fetching URL...',
  default: 'Processing...',
};

/**
 * Track progress for long-running operations.
 */
export class ProgressTracker {
  private toolCount = 0;
  private toolStack: string[] = [];

  /**
   * Start showing progress for a tool operation.
   */
  startToolProgress(
    toolName: string,
    stream: vscode.ChatResponseStream
  ): void {
    const message = PROGRESS_MESSAGES[toolName] || PROGRESS_MESSAGES.default;
    this.toolStack.push(toolName);
    stream.progress(message);
  }

  /**
   * Clear progress indicator when tool completes.
   */
  endToolProgress(stream: vscode.ChatResponseStream): void {
    this.toolStack.pop();

    // Show previous tool's progress or clear
    if (this.toolStack.length > 0) {
      const prevTool = this.toolStack[this.toolStack.length - 1];
      const message = PROGRESS_MESSAGES[prevTool] || PROGRESS_MESSAGES.default;
      stream.progress(message);
    } else {
      stream.progress('');
    }
  }

  /**
   * Record that a tool operation started.
   */
  recordToolStart(_toolName: string): void {
    this.toolCount++;
  }

  /**
   * Get total count of tools executed.
   */
  getToolCount(): number {
    return this.toolCount;
  }

  /**
   * Check if this is a long-running operation (5+ tools).
   */
  isLongOperation(): boolean {
    return this.toolCount >= 5;
  }
}

// ============================================================================
// Integration: Full Response Formatting Pipeline
// ============================================================================

/**
 * Apply all response formatters in the correct order.
 *
 * Order matters:
 * 0. Strip system tags first (MSSCI-12147) - removes internal XML before display
 * 1. Tables (structural, might affect code block detection)
 * 2. Code blocks (so we can exclude them from file path conversion)
 * 3. File paths last (operates on plain text regions only)
 */
export function formatResponse(text: string): string {
  if (!text || !text.trim()) {
    return text;
  }

  // Apply formatters in order
  let result = text;

  // 0. Strip system XML tags (MSSCI-12147)
  result = stripSystemTags(result);

  // 1. Format tables
  result = formatTables(result);

  // 2. Format code blocks (add language hints)
  result = formatCodeBlocks(result);

  // 3. Format file paths (convert to links)
  result = formatFilePaths(result);

  return result;
}
