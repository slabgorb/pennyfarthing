/**
 * MSSCI-12123: Welcome Webview Provider
 *
 * WebviewViewProvider implementation for the Welcome panel in VS Code.
 * Shows onboarding content on first extension activation with agent roster,
 * quick-start buttons, and "don't show again" option.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';

// Message types from webview
interface WebviewMessage {
  type: string;
  command?: string;
  args?: unknown[];
  url?: string;
  [key: string]: unknown;
}

/**
 * WelcomeWebviewProvider - VS Code WebviewViewProvider for Welcome panel
 */
export class WelcomeWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pennyfarthing.welcomePanel';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _globalState: vscode.Memento;

  constructor(extensionUri: vscode.Uri, globalState: vscode.Memento) {
    this._extensionUri = extensionUri;
    this._globalState = globalState;
  }

  /**
   * Check if user has previously dismissed the welcome view.
   */
  public hasUserSeenWelcome(): boolean {
    return this._globalState.get('hasSeenWelcome', false);
  }

  /**
   * Mark the welcome view as seen/dismissed.
   */
  public async dismissWelcome(): Promise<void> {
    await this._globalState.update('hasSeenWelcome', true);
  }

  /**
   * Generate a unique nonce for CSP.
   * Uses hex encoding to ensure only alphanumeric characters.
   */
  public generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
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
        vscode.Uri.joinPath(this._extensionUri, 'src', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
      ],
    };

    // Generate nonce for CSP
    const nonce = this.generateNonce();

    // Set HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, nonce);

    // Set up message listener
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        this._handleWebviewMessage(message);
      },
      null,
      []
    );
  }

  /**
   * Handle messages from webview.
   */
  private _handleWebviewMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'executeCommand':
        if (message.command) {
          vscode.commands.executeCommand(message.command, ...(message.args || []));
        }
        break;

      case 'dismiss':
        this.dismissWelcome();
        break;

      case 'openExternal':
        if (message.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
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
    // Nothing to clean up currently
  }

  /**
   * Generate HTML content for the webview.
   */
  private _getHtmlForWebview(webview: vscode.Webview, nonce: string): string {
    // Get URIs for scripts and styles
    const adapterUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'welcome-adapter.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'welcome-styles.css')
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
  <link href="${stylesUri}" rel="stylesheet" nonce="${nonce}">
  <title>Welcome to Pennyfarthing</title>
</head>
<body>
  <div id="welcome-panel">
    <!-- Welcome Header -->
    <div class="welcome-header">
      <h1>Welcome to Pennyfarthing</h1>
      <p class="tagline">Agent orchestration for Claude Code with TDD workflow</p>
    </div>

    <!-- About Section -->
    <div class="about-section">
      <h2>What is Pennyfarthing?</h2>
      <p>Pennyfarthing coordinates AI agents through a structured TDD workflow:</p>
      <p><strong>SM → TEA → Dev → Reviewer</strong></p>
    </div>

    <!-- Agent Roster -->
    <div class="agent-roster">
      <h2>Meet the Agents</h2>

      <div class="agent-card">
        <div class="agent-icon">SM</div>
        <div class="agent-info">
          <div class="agent-name">Scrum Master</div>
          <div class="agent-desc">Story coordination and sprint management</div>
        </div>
      </div>

      <div class="agent-card">
        <div class="agent-icon">TEA</div>
        <div class="agent-info">
          <div class="agent-name">Test Engineer</div>
          <div class="agent-desc">Test-first development and quality gates</div>
        </div>
      </div>

      <div class="agent-card">
        <div class="agent-icon">Dev</div>
        <div class="agent-info">
          <div class="agent-name">Developer</div>
          <div class="agent-desc">Implementation and making tests pass</div>
        </div>
      </div>

      <div class="agent-card">
        <div class="agent-icon">Rev</div>
        <div class="agent-info">
          <div class="agent-name">Reviewer</div>
          <div class="agent-desc">Code review and quality assurance</div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>Quick Start</h2>

      <button class="action-button primary" data-command="pennyfarthing.startWork">
        Start Work
      </button>

      <button class="action-button" data-command="pennyfarthing.viewBacklog">
        View Backlog
      </button>

      <button class="action-button" data-command="pennyfarthing.switchTheme">
        Switch Theme
      </button>
    </div>

    <!-- Links -->
    <div class="links-section">
      <a href="#" class="link" data-url="https://github.com/1898andCo/pennyfarthing">
        Documentation & GitHub
      </a>
    </div>

    <!-- Dismiss -->
    <div class="dismiss-section">
      <button class="dismiss-button" id="dismiss-btn">
        Don't show again
      </button>
    </div>
  </div>

  <script nonce="${nonce}" src="${adapterUri}"></script>
</body>
</html>`;
  }
}
