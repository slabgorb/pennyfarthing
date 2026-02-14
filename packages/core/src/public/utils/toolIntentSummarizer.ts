/**
 * Tool Intent Summarizer
 *
 * Story 74-1: Generates human-readable summaries of tool use intent.
 */

const MAX_LENGTH = 70;

/**
 * Truncates a string to the max length, adding ellipsis if needed.
 * Also removes newlines to ensure single-line output.
 */
function truncate(str: string, maxLen: number = MAX_LENGTH - 10): string {
  // Replace newlines with spaces for single-line output
  const singleLine = str.replace(/\n/g, ' ');
  if (singleLine.length <= maxLen) return singleLine;
  return singleLine.slice(0, maxLen - 3) + '...';
}

/**
 * Safely gets a string value from input, returning empty string for null/undefined.
 */
function getString(input: Record<string, unknown> | null | undefined, key: string): string {
  if (!input) return '';
  const value = input[key];
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

/**
 * Extracts the hostname from a URL.
 */
function extractHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Detects special bash command patterns and returns a semantic summary.
 */
function summarizeBashCommand(command: string): string {
  const cmd = command.toLowerCase();

  // Package install commands
  if (
    cmd.startsWith('npm install') ||
    cmd.startsWith('npm i ') ||
    cmd === 'npm i' ||
    cmd.startsWith('pnpm install') ||
    cmd.startsWith('pnpm add') ||
    cmd.startsWith('yarn install') ||
    cmd.startsWith('yarn add')
  ) {
    return 'Installing dependencies';
  }

  // Test commands
  if (
    cmd.startsWith('npm test') ||
    cmd.startsWith('npm run test') ||
    cmd.startsWith('pnpm test') ||
    cmd.startsWith('pnpm run test') ||
    cmd.startsWith('yarn test') ||
    cmd.startsWith('vitest') ||
    cmd.startsWith('jest')
  ) {
    return 'Running tests';
  }

  // Build commands
  if (
    cmd.startsWith('npm run build') ||
    cmd.startsWith('pnpm run build') ||
    cmd.startsWith('pnpm build') ||
    cmd.startsWith('yarn build')
  ) {
    return 'Building project';
  }

  // TypeScript type checking
  if (cmd.startsWith('tsc')) {
    return 'Type checking';
  }

  // Linting
  if (cmd.startsWith('eslint') || cmd.startsWith('npm run lint') || cmd.startsWith('pnpm lint')) {
    return 'Linting code';
  }

  // Formatting
  if (cmd.startsWith('prettier')) {
    return 'Formatting code';
  }

  // Default: show the command
  return `Running ${truncate(command, MAX_LENGTH - 8)}`;
}

/**
 * Generates a human-readable summary of what a tool is doing based on its name and input.
 *
 * @param toolName - The name of the tool (Read, Bash, Glob, Grep, Write, Edit, Task, etc.)
 * @param input - The input parameters passed to the tool
 * @returns A human-readable summary string
 *
 * @example
 * generateToolIntentSummary('Read', { file_path: '/src/foo.ts' })
 * // Returns: "Reading /src/foo.ts"
 *
 * @example
 * generateToolIntentSummary('Bash', { command: 'npm install' })
 * // Returns: "Installing dependencies"
 */
export function generateToolIntentSummary(
  toolName: string,
  input: Record<string, unknown>
): string {
  // Handle null/undefined input
  const safeInput = input ?? {};

  switch (toolName) {
    case 'Read': {
      const filePath = getString(safeInput, 'file_path');
      if (!filePath) return 'Read';
      return truncate(`Reading ${filePath}`);
    }

    case 'Bash': {
      // Prefer Claude's description if provided (human-readable intent)
      const description = getString(safeInput, 'description');
      if (description) return truncate(description);
      // Fall back to command-based summarization
      const command = getString(safeInput, 'command');
      if (!command) return 'Bash';
      return summarizeBashCommand(command);
    }

    case 'Glob': {
      const pattern = getString(safeInput, 'pattern');
      if (!pattern) return 'Glob';
      return truncate(`Finding ${pattern} files`);
    }

    case 'Grep': {
      const pattern = getString(safeInput, 'pattern');
      if (!pattern) return 'Grep';
      // Remove outer quotes if present for display
      const displayPattern = pattern.replace(/^["']|["']$/g, '');
      return truncate(`Searching for '${displayPattern}'`);
    }

    case 'Write': {
      const filePath = getString(safeInput, 'file_path');
      if (!filePath) return 'Write';
      return truncate(`Creating ${filePath}`);
    }

    case 'Edit': {
      const filePath = getString(safeInput, 'file_path');
      if (!filePath) return 'Edit';
      return truncate(`Editing ${filePath}`);
    }

    case 'Task': {
      const subagentType = getString(safeInput, 'subagent_type');
      if (!subagentType) return 'Task';
      return `Launching ${subagentType} agent`;
    }

    case 'WebFetch': {
      const url = getString(safeInput, 'url');
      if (!url) return 'WebFetch';
      const hostname = extractHostname(url);
      return truncate(`Fetching ${hostname}`);
    }

    case 'WebSearch': {
      const query = getString(safeInput, 'query');
      if (!query) return 'WebSearch';
      return truncate(`Searching web for '${query}'`);
    }

    default: {
      // Unknown tool: show tool name with truncated JSON
      try {
        const jsonStr = JSON.stringify(safeInput);
        if (jsonStr === '{}') return toolName;
        const maxJsonLen = MAX_LENGTH - toolName.length - 3; // space + parens
        return `${toolName} (${truncate(jsonStr, maxJsonLen)})`;
      } catch {
        return toolName;
      }
    }
  }
}
