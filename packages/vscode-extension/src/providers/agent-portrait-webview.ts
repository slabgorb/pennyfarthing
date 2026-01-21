/**
 * MSSCI-12148: Agent Portrait Webview Provider
 *
 * WebviewViewProvider implementation for the Agent Portrait panel in VS Code.
 * Displays the current agent's portrait image, character name, and role.
 * Updates via file watchers on config.local.yaml and .session/agents/*.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Persona data interface matching sidebar.ts
interface PersonaData {
  character: string;
  theme: string;
  role: string;
}

// Message types from webview
interface WebviewMessage {
  type: string;
  command?: string;
  args?: unknown[];
  [key: string]: unknown;
}

/**
 * AgentPortraitWebviewProvider - VS Code WebviewViewProvider for Agent Portrait panel
 */
export class AgentPortraitWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pennyfarthing.agentPortrait';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _persona?: PersonaData;
  private _disposables: vscode.Disposable[] = [];
  private _configWatcher?: vscode.FileSystemWatcher;
  private _agentWatcher?: vscode.FileSystemWatcher;
  private _currentTheme?: string;
  private _currentAgent?: string;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  /**
   * Generate a unique nonce for CSP.
   * Uses hex encoding to ensure only alphanumeric characters.
   */
  public generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Detect current VS Code color theme.
   */
  public detectVSCodeTheme(): 'light' | 'dark' | 'high-contrast' {
    const kind = vscode.window.activeColorTheme.kind;
    switch (kind) {
      case vscode.ColorThemeKind.Light:
        return 'light';
      case vscode.ColorThemeKind.HighContrast:
      case vscode.ColorThemeKind.HighContrastLight:
        return 'high-contrast';
      case vscode.ColorThemeKind.Dark:
      default:
        return 'dark';
    }
  }

  /**
   * Get the agent role to portrait filename mapping.
   */
  public getAgentPortraitMapping(): Record<string, string> {
    return { ...AGENT_PORTRAIT_MAPPING };
  }

  /**
   * Get the portrait path for a given theme and agent role.
   * Scans the portraits directory for files matching the shortName pattern.
   */
  public getPortraitPath(theme: string, role: string): string {
    const mapping = this.getAgentPortraitMapping();
    const shortName = mapping[role.toLowerCase()] || role.toLowerCase();

    // Portrait files are named {shortName}-{ocean_score}.png
    // Scan directory to find matching file
    const portraitsDir = path.join(this._extensionUri.fsPath, 'resources', 'portraits', theme);

    try {
      if (fs.existsSync(portraitsDir)) {
        const files = fs.readdirSync(portraitsDir);
        const matchingFile = files.find((f) => f.toLowerCase().startsWith(shortName + '-'));
        if (matchingFile) {
          return path.join('resources', 'portraits', theme, matchingFile);
        }
      }
    } catch {
      // Directory read error
    }

    // Fallback to simple pattern
    return path.join('resources', 'portraits', theme, `${shortName}.png`);
  }

  /**
   * Get the webview URI for a portrait image.
   */
  public getPortraitUri(webview: vscode.Webview, theme: string, role: string): vscode.Uri | null {
    const portraitPath = this.getPortraitPath(theme, role);
    const fullPath = vscode.Uri.joinPath(this._extensionUri, portraitPath);

    if (this.checkPortraitExists(theme, role)) {
      return webview.asWebviewUri(fullPath);
    }
    return null;
  }

  /**
   * Check if a portrait file exists for the given theme and role.
   */
  public checkPortraitExists(theme: string, role: string): boolean {
    const portraitPath = this.getPortraitPath(theme, role);
    const fullPath = path.join(this._extensionUri.fsPath, portraitPath);
    try {
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  /**
   * Update the persona data and refresh the webview.
   */
  public updatePersona(persona: PersonaData): void {
    this._persona = persona;
    if (this._view) {
      this._view.webview.postMessage({
        type: 'personaUpdate',
        persona,
        portraitExists: this.checkPortraitExists(persona.theme, persona.role),
      });
    }
  }

  /**
   * Start file watchers for config and agent changes.
   * Called from extension.ts after provider is registered.
   */
  public startFileWatchers(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const basePath = workspaceFolder.uri.fsPath;

    // Watch config file for theme changes
    const configPattern = new vscode.RelativePattern(
      basePath,
      '.pennyfarthing/config.local.yaml'
    );
    this._configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);
    this._configWatcher.onDidChange((uri) => this._parseConfigFile(uri));
    this._configWatcher.onDidCreate((uri) => this._parseConfigFile(uri));

    // Watch agent session files for agent changes
    const agentPattern = new vscode.RelativePattern(
      basePath,
      '.session/agents/*'
    );
    this._agentWatcher = vscode.workspace.createFileSystemWatcher(agentPattern);
    this._agentWatcher.onDidChange(() => this._parseAgentFiles(basePath));
    this._agentWatcher.onDidCreate(() => this._parseAgentFiles(basePath));
    this._agentWatcher.onDidDelete(() => this._parseAgentFiles(basePath));

    // Initial parse
    this._initialFileParse(basePath);
  }

  /**
   * Stop file watchers and clean up.
   */
  public stopFileWatchers(): void {
    if (this._configWatcher) {
      this._configWatcher.dispose();
      this._configWatcher = undefined;
    }
    if (this._agentWatcher) {
      this._agentWatcher.dispose();
      this._agentWatcher = undefined;
    }
  }

  /**
   * Parse config file for theme.
   */
  private async _parseConfigFile(uri: vscode.Uri): Promise<void> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder().decode(content);

      // Parse theme from YAML (simple regex, no YAML parser needed)
      const themeMatch = text.match(/^theme:\s*(.+)$/m);
      if (themeMatch) {
        const theme = themeMatch[1].trim().replace(/["']/g, '');
        if (theme !== this._currentTheme) {
          this._currentTheme = theme;
          this._updatePersonaFromFiles();
        }
      }
    } catch {
      // File read error, ignore
    }
  }

  /**
   * Parse agent session files to find current agent.
   * Uses most recently modified file.
   */
  private async _parseAgentFiles(basePath: string): Promise<void> {
    try {
      const agentsDir = path.join(basePath, '.session', 'agents');
      if (!fs.existsSync(agentsDir)) {
        return;
      }

      // Find most recently modified agent file
      const files = fs.readdirSync(agentsDir);
      let mostRecent: { name: string; mtime: number } | null = null;

      for (const file of files) {
        const filePath = path.join(agentsDir, file);
        const stat = fs.statSync(filePath);
        if (!mostRecent || stat.mtimeMs > mostRecent.mtime) {
          mostRecent = { name: file, mtime: stat.mtimeMs };
        }
      }

      if (mostRecent) {
        const agentContent = fs.readFileSync(
          path.join(agentsDir, mostRecent.name),
          'utf-8'
        ).trim();
        if (agentContent && agentContent !== this._currentAgent) {
          this._currentAgent = agentContent;
          this._updatePersonaFromFiles();
        }
      }
    } catch {
      // Directory read error, ignore
    }
  }

  /**
   * Initial parse of config and agent files.
   */
  private async _initialFileParse(basePath: string): Promise<void> {
    // Parse config file
    const configPath = path.join(basePath, '.pennyfarthing', 'config.local.yaml');
    if (fs.existsSync(configPath)) {
      await this._parseConfigFile(vscode.Uri.file(configPath));
    }

    // Parse agent files
    await this._parseAgentFiles(basePath);
  }

  /**
   * Update persona from current theme and agent.
   * Reads theme file to get character name.
   */
  private async _updatePersonaFromFiles(): Promise<void> {
    if (!this._currentTheme || !this._currentAgent) {
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const basePath = workspaceFolder.uri.fsPath;

    // Read theme file to get character name
    const themeFilePath = path.join(
      basePath,
      '.pennyfarthing',
      'personas',
      'themes',
      `${this._currentTheme}.yaml`
    );

    let character = this._currentAgent; // Fallback to agent name

    try {
      if (fs.existsSync(themeFilePath)) {
        const themeContent = fs.readFileSync(themeFilePath, 'utf-8');
        // Parse character name from theme YAML
        const characterMatch = themeContent.match(
          new RegExp(`${this._currentAgent}:[\\s\\S]*?character:\\s*(.+)`, 'm')
        );
        if (characterMatch) {
          character = characterMatch[1].trim().replace(/["']/g, '');
        }
      }
    } catch {
      // Theme file read error, use fallback
    }

    this.updatePersona({
      character,
      theme: this._currentTheme,
      role: this._currentAgent,
    });
  }

  /**
   * Get the agent role to portrait filename mapping.
   * Reads from theme file's shortName field.
   */
  public getAgentPortraitMapping(): Record<string, string> {
    // Default mapping as fallback
    const defaultMapping: Record<string, string> = {
      sm: 'hermes',
      tea: 'themis',
      dev: 'hephaestus',
      reviewer: 'argus',
      architect: 'daedalus',
      pm: 'zeus',
      'tech-writer': 'calliope',
      'ux-designer': 'aphrodite',
      devops: 'atlas',
      orchestrator: 'athena',
    };

    if (!this._currentTheme) {
      return defaultMapping;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return defaultMapping;
    }

    // Try to read shortNames from theme file
    const themeFilePath = path.join(
      workspaceFolder.uri.fsPath,
      '.pennyfarthing',
      'personas',
      'themes',
      `${this._currentTheme}.yaml`
    );

    try {
      if (fs.existsSync(themeFilePath)) {
        const themeContent = fs.readFileSync(themeFilePath, 'utf-8');
        const mapping: Record<string, string> = {};

        // Extract shortName for each agent
        const agents = ['sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator'];
        for (const agent of agents) {
          const shortNameMatch = themeContent.match(
            new RegExp(`${agent}:[\\s\\S]*?shortName:\\s*(.+)`, 'm')
          );
          if (shortNameMatch) {
            mapping[agent] = shortNameMatch[1].trim().replace(/["']/g, '').toLowerCase();
          } else {
            mapping[agent] = defaultMapping[agent] || agent;
          }
        }
        return mapping;
      }
    } catch {
      // Theme file read error, use default
    }

    return defaultMapping;
  }

  /**
   * Resolve the webview view when VS Code needs to display it.
   */
  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'resources', 'portraits'),
        vscode.Uri.joinPath(this._extensionUri, 'src', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
      ],
    };

    // Generate nonce for CSP
    const nonce = this.generateNonce();
    const theme = this.detectVSCodeTheme();

    // Set HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, nonce, theme);

    // Set up message listener
    const messageDisposable = webviewView.webview.onDidReceiveMessage(
      (message) => {
        this._handleWebviewMessage(message);
      },
      null,
      this._disposables
    );
    this._disposables.push(messageDisposable);

    // Subscribe to theme changes
    const themeDisposable = vscode.window.onDidChangeActiveColorTheme((colorTheme) => {
      const newTheme = this._colorThemeKindToString(colorTheme.kind);
      webviewView.webview.postMessage({
        type: 'themeChange',
        theme: newTheme,
      });
    });
    this._disposables.push(themeDisposable);

    // Send initial state if we have persona data
    if (this._persona) {
      webviewView.webview.postMessage({
        type: 'initialState',
        persona: this._persona,
        portraitExists: this.checkPortraitExists(this._persona.theme, this._persona.role),
      });
    }
  }

  /**
   * Convert ColorThemeKind to string.
   */
  private _colorThemeKindToString(kind: vscode.ColorThemeKind): 'light' | 'dark' | 'high-contrast' {
    switch (kind) {
      case vscode.ColorThemeKind.Light:
        return 'light';
      case vscode.ColorThemeKind.HighContrast:
      case vscode.ColorThemeKind.HighContrastLight:
        return 'high-contrast';
      case vscode.ColorThemeKind.Dark:
      default:
        return 'dark';
    }
  }

  /**
   * Handle messages from webview.
   */
  private _handleWebviewMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'requestInitialState':
        if (this._view && this._persona) {
          this._view.webview.postMessage({
            type: 'initialState',
            persona: this._persona,
            portraitExists: this.checkPortraitExists(this._persona.theme, this._persona.role),
          });
        }
        break;

      case 'executeCommand':
        if (message.command) {
          vscode.commands.executeCommand(message.command, ...(message.args || []));
        }
        break;

      default:
        break;
    }
  }

  /**
   * Dispose the provider and clean up resources.
   */
  public dispose(): void {
    // Stop file watchers
    this.stopFileWatchers();

    // Dispose all subscriptions
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables = [];
  }

  /**
   * Generate HTML content for the webview.
   */
  private _getHtmlForWebview(
    webview: vscode.Webview,
    nonce: string,
    theme: 'light' | 'dark' | 'high-contrast'
  ): string {
    const themeClass = theme === 'light' ? 'vscode-light' : 'vscode-dark';

    // Get portrait URI if persona is set
    let portraitSrc = '';
    let characterName = 'No Agent Active';
    let characterRole = '';
    let showFallback = true;

    if (this._persona) {
      const portraitUri = this.getPortraitUri(webview, this._persona.theme, this._persona.role);
      if (portraitUri) {
        portraitSrc = portraitUri.toString();
        showFallback = false;
      }
      characterName = this._persona.character;
      characterRole = this._formatRole(this._persona.role);
    }

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <title>Agent Portrait</title>
  <style nonce="${nonce}">
    :root {
      --portrait-size: 180px;
      --border-radius: 8px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .portrait-container {
      width: var(--portrait-size);
      height: var(--portrait-size);
      border-radius: var(--border-radius);
      overflow: hidden;
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      margin-bottom: 12px;
      position: relative;
    }

    .portrait-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .portrait-image.hidden {
      display: none;
    }

    .portrait-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: var(--vscode-editor-background);
    }

    .portrait-fallback.hidden {
      display: none;
    }

    .fallback-icon {
      font-size: 48px;
      margin-bottom: 8px;
      color: var(--vscode-textPreformat-foreground);
    }

    .fallback-name {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 0 8px;
    }

    .character-info {
      text-align: center;
      width: 100%;
    }

    .character-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 4px;
    }

    .character-role {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .codicon {
      font-family: codicon;
      font-size: 48px;
    }
  </style>
</head>
<body class="${themeClass}">
  <div class="portrait-container">
    <img
      id="portrait-image"
      class="portrait-image${showFallback ? ' hidden' : ''}"
      src="${portraitSrc}"
      alt="${characterName}"
      onerror="this.classList.add('hidden'); document.getElementById('portrait-fallback').classList.remove('hidden');"
    />
    <div id="portrait-fallback" class="portrait-fallback${showFallback ? '' : ' hidden'}">
      <span class="fallback-icon codicon">&#xeb99;</span>
      <span class="fallback-name agent-name" id="fallback-agent-name">${characterName}</span>
    </div>
  </div>

  <div class="character-info">
    <div class="character-name" id="character-name">${characterName}</div>
    <div class="character-role" id="character-role">${characterRole}</div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      // DOM elements
      const portraitImage = document.getElementById('portrait-image');
      const portraitFallback = document.getElementById('portrait-fallback');
      const fallbackAgentName = document.getElementById('fallback-agent-name');
      const characterNameEl = document.getElementById('character-name');
      const characterRoleEl = document.getElementById('character-role');

      // Format role for display
      function formatRole(role) {
        const roleMap = {
          'sm': 'Scrum Master',
          'tea': 'Test Engineer',
          'dev': 'Developer',
          'reviewer': 'Code Reviewer',
          'architect': 'System Architect',
          'pm': 'Product Manager',
          'tech-writer': 'Technical Writer',
          'ux-designer': 'UX Designer',
          'devops': 'DevOps Engineer',
          'orchestrator': 'Orchestrator'
        };
        return roleMap[role?.toLowerCase()] || role || '';
      }

      // Update the UI with new persona data
      function updateUI(data) {
        if (!data) return;

        const { persona, portraitExists } = data;
        if (!persona) return;

        // Update character info
        characterNameEl.textContent = persona.character || 'No Agent Active';
        characterRoleEl.textContent = formatRole(persona.role);
        fallbackAgentName.textContent = persona.character || 'No Agent';

        // Show/hide portrait vs fallback
        if (portraitExists) {
          // Request new portrait URI from extension
          portraitImage.classList.remove('hidden');
          portraitFallback.classList.add('hidden');
        } else {
          portraitImage.classList.add('hidden');
          portraitFallback.classList.remove('hidden');
        }
      }

      // Handle messages from extension
      window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.type) {
          case 'initialState':
          case 'personaUpdate':
            updateUI(message);
            break;
          case 'themeChange':
            document.body.className = message.theme === 'light' ? 'vscode-light' : 'vscode-dark';
            break;
        }
      });

      // Request initial state
      vscode.postMessage({ type: 'requestInitialState' });
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Format role for display.
   */
  private _formatRole(role: string): string {
    const roleMap: Record<string, string> = {
      sm: 'Scrum Master',
      tea: 'Test Engineer',
      dev: 'Developer',
      reviewer: 'Code Reviewer',
      architect: 'System Architect',
      pm: 'Product Manager',
      'tech-writer': 'Technical Writer',
      'ux-designer': 'UX Designer',
      devops: 'DevOps Engineer',
      orchestrator: 'Orchestrator',
    };
    return roleMap[role?.toLowerCase()] || role || '';
  }
}
