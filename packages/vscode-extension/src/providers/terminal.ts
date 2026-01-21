import * as vscode from 'vscode';

/**
 * Terminal link data passed to handleTerminalLink
 */
interface TerminalLinkData {
  filePath: string;
  lineNumber: number;
}

/**
 * Custom terminal link with file path data
 */
interface PennyfarthingTerminalLink extends vscode.TerminalLink {
  data: TerminalLinkData;
}

/**
 * Terminal profile provider for Pennyfarthing Claude sessions.
 * Creates terminals with environment variables set for Claude Code integration.
 */
export class PennyfarthingTerminalProfileProvider implements vscode.TerminalProfileProvider {
  /**
   * Provides a terminal profile with Pennyfarthing environment configuration.
   * Called when user selects "Pennyfarthing Claude" from terminal dropdown.
   */
  provideTerminalProfile(): vscode.TerminalProfile {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspacePath = workspaceFolder?.uri.fsPath ?? process.cwd();

    return new vscode.TerminalProfile({
      name: 'Pennyfarthing Claude',
      env: {
        PROJECT_ROOT: workspacePath,
        CLAUDE_PROJECT_DIR: workspacePath,
        PENNYFARTHING_ACTIVE: '1',
      },
    });
  }
}

/**
 * Terminal link provider that detects file:line patterns in terminal output.
 * Makes file paths clickable, opening them in VS Code at the correct line.
 */
export class PennyfarthingTerminalLinkProvider implements vscode.TerminalLinkProvider<PennyfarthingTerminalLink> {
  /**
   * Regex to match file:line patterns in terminal output.
   * Matches patterns like:
   * - src/extension.ts:42
   * - ./relative/path.js:100
   * - /absolute/path/file.go:123
   * - packages/core/index.ts:100:5 (ignores column)
   */
  private readonly fileLineRegex = /(?:^|[\s'"(])([./]?[\w./-]+\.[a-zA-Z]{1,5}):(\d+)(?::\d+)?/g;

  /**
   * Detects file:line patterns in a terminal line and returns clickable links.
   */
  provideTerminalLinks(
    context: vscode.TerminalLinkContext
  ): PennyfarthingTerminalLink[] {
    const links: PennyfarthingTerminalLink[] = [];
    const line = context.line;

    // Reset regex state
    this.fileLineRegex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = this.fileLineRegex.exec(line)) !== null) {
      const filePath = match[1];
      const lineNumber = parseInt(match[2], 10);

      // Calculate the start index - account for any prefix character captured
      const fullMatch = match[0];
      const prefixLength = fullMatch.indexOf(filePath);
      const startIndex = match.index + prefixLength;

      // Length includes file path and line number (e.g., "src/foo.ts:42")
      const linkText = `${filePath}:${lineNumber}`;
      const length = linkText.length;

      links.push({
        startIndex,
        length,
        tooltip: `Open ${filePath} at line ${lineNumber}`,
        data: {
          filePath: this.resolveFilePath(filePath),
          lineNumber,
        },
      });
    }

    return links;
  }

  /**
   * Opens the file at the specified line when a link is clicked.
   */
  async handleTerminalLink(link: PennyfarthingTerminalLink): Promise<void> {
    const { filePath, lineNumber } = link.data;

    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);

    // Convert to 0-indexed line number for VS Code
    const line = Math.max(0, lineNumber - 1);
    const position = new vscode.Position(line, 0);
    const selection = new vscode.Selection(position, position);

    await vscode.window.showTextDocument(document, { selection });
  }

  /**
   * Resolves relative file paths to absolute paths using workspace folder.
   */
  private resolveFilePath(filePath: string): string {
    // If already absolute, return as-is
    if (filePath.startsWith('/')) {
      return filePath;
    }

    // Resolve relative to workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      // Remove leading ./ if present
      const cleanPath = filePath.replace(/^\.\//, '');
      return `${workspaceFolder.uri.fsPath}/${cleanPath}`;
    }

    return filePath;
  }
}
