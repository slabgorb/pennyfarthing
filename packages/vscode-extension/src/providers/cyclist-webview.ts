/**
 * MSSCI-12051: Cyclist Webview Provider
 *
 * WebviewViewProvider implementation for the Cyclist panel in VS Code.
 * Renders Cyclist UI components (stats-strip, persona, story panels)
 * with CSP-compliant script/style loading and real-time WheelHub updates.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { WebSocketManager, StatsData } from '../server/websocket-manager';
import { WebviewMessageHandler } from './webview-message-handler';

// Story data type (subset of StatsData)
interface StoryData {
  id: string;
  title: string;
  phase: string;
  branch: string;
  points?: number;
}

// Message types from webview
interface WebviewMessage {
  type: string;
  command?: string;
  args?: unknown[];
}

/**
 * CyclistWebviewProvider - VS Code WebviewViewProvider for Cyclist panel
 */
export class CyclistWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'pennyfarthing.cyclistPanel';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _messageHandler?: WebviewMessageHandler;
  private _statsUnsubscribe?: () => void;
  private _storyUnsubscribe?: () => void;
  private _themeChangeDisposable?: vscode.Disposable;

  // Cached state for initial state requests
  private _lastStats?: StatsData;
  private _lastStory?: StoryData;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
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

    // Create message handler
    this._messageHandler = new WebviewMessageHandler(webviewView.webview);

    // Set up message listener
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        this._handleWebviewMessage(message);
      },
      null,
      []
    );

    // Subscribe to theme changes
    this._themeChangeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      const themeType = this._getThemeType(theme.kind);
      webviewView.webview.postMessage({
        type: 'themeChange',
        theme: themeType,
      });
    });
  }

  /**
   * Generate a unique nonce for CSP.
   * Uses hex encoding to ensure only alphanumeric characters.
   */
  public generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Detect current VS Code theme type.
   */
  public detectVSCodeTheme(): string {
    return this._getThemeType(vscode.window.activeColorTheme.kind);
  }

  /**
   * Get theme type string from ColorThemeKind.
   */
  private _getThemeType(kind: vscode.ColorThemeKind): string {
    switch (kind) {
      case vscode.ColorThemeKind.Light:
        return 'light';
      case vscode.ColorThemeKind.Dark:
        return 'dark';
      case vscode.ColorThemeKind.HighContrast:
      case vscode.ColorThemeKind.HighContrastLight:
        return 'high-contrast';
      default:
        return 'dark';
    }
  }

  /**
   * Get VS Code to Cyclist theme variable mapping.
   */
  public getThemeVariableMapping(): Record<string, string> {
    return {
      '--cyclist-bg': 'var(--vscode-editor-background)',
      '--cyclist-fg': 'var(--vscode-editor-foreground)',
      '--cyclist-border': 'var(--vscode-panel-border)',
      '--cyclist-accent': 'var(--vscode-focusBorder)',
      '--cyclist-button-bg': 'var(--vscode-button-background)',
      '--cyclist-button-fg': 'var(--vscode-button-foreground)',
      '--cyclist-input-bg': 'var(--vscode-input-background)',
      '--cyclist-input-fg': 'var(--vscode-input-foreground)',
    };
  }

  /**
   * Connect to WheelHub for real-time updates.
   */
  public connectToWheelHub(wsManager: WebSocketManager): void {
    // Unsubscribe from any existing connection
    if (this._statsUnsubscribe) {
      this._statsUnsubscribe();
    }

    // Subscribe to stats updates
    this._statsUnsubscribe = wsManager.onStats((data: StatsData) => {
      // Check if this is a story-only update (from broadcastStory)
      const isStoryOnlyUpdate = data.story && !data.persona && !data.context;

      if (isStoryOnlyUpdate) {
        // Forward as story message
        this._lastStory = data.story;
        if (this._view) {
          this._view.webview.postMessage({
            type: 'story',
            data: data.story,
          });
        }
      } else {
        // Forward as stats message (may include story data too)
        this._lastStats = data;
        if (data.story) {
          this._lastStory = data.story;
        }
        if (this._view) {
          this._view.webview.postMessage({
            type: 'stats',
            data,
          });
        }
      }
    });
  }

  /**
   * Handle WheelHub disconnect.
   */
  public handleWheelHubDisconnect(): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'connectionStatus',
        status: 'reconnecting',
      });
    }
  }

  /**
   * Handle WheelHub connect.
   */
  public handleWheelHubConnect(): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'connectionStatus',
        status: 'connected',
      });
    }
  }

  /**
   * Handle messages from webview.
   */
  private _handleWebviewMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'executeCommand':
        vscode.commands.executeCommand(message.command, ...(message.args || []));
        break;

      case 'requestInitialState':
        if (this._view) {
          this._view.webview.postMessage({
            type: 'initialState',
            stats: this._lastStats || null,
            story: this._lastStory || null,
          });
        }
        break;

      default:
        // Forward other messages to the message handler
        if (this._messageHandler) {
          this._messageHandler.handleWebviewMessage(message);
        }
        break;
    }
  }

  /**
   * Dispose the provider and clean up resources.
   */
  public dispose(): void {
    if (this._statsUnsubscribe) {
      this._statsUnsubscribe();
      this._statsUnsubscribe = undefined;
    }
    if (this._storyUnsubscribe) {
      this._storyUnsubscribe();
      this._storyUnsubscribe = undefined;
    }
    if (this._themeChangeDisposable) {
      this._themeChangeDisposable.dispose();
      this._themeChangeDisposable = undefined;
    }
  }

  /**
   * Generate HTML content for the webview.
   */
  private _getHtmlForWebview(webview: vscode.Webview, nonce: string): string {
    // Get URIs for scripts and styles
    const adapterUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'cyclist-adapter.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'styles.css')
    );

    // Detect current theme
    const themeClass = this.detectVSCodeTheme() === 'light' ? 'vscode-light' : 'vscode-dark';

    // Get theme variable mapping
    const themeVars = this.getThemeVariableMapping();
    const cssVars = Object.entries(themeVars)
      .map(([key, value]) => `${key}: ${value};`)
      .join('\n      ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
  <link href="${stylesUri}" rel="stylesheet" nonce="${nonce}">
  <title>Cyclist</title>
  <style nonce="${nonce}">
    :root {
      ${cssVars}
    }
  </style>
</head>
<body class="${themeClass}">
  <div id="cyclist-panel">
    <!-- Stats Strip -->
    <div id="stats-strip" class="stats-strip">
      <div class="context-meter">
        <div class="context-bar" id="context-bar"></div>
        <span class="context-label" id="context-label">--%</span>
      </div>
    </div>

    <!-- Persona Panel -->
    <div id="persona" class="persona-panel">
      <div class="character-name" id="character-name">--</div>
      <div class="character-role" id="character-role">--</div>
    </div>

    <!-- Story Panel -->
    <div id="story" class="story-panel">
      <div class="story-header">
        <span class="story-id" id="story-id">--</span>
        <span class="story-phase" id="story-phase">--</span>
      </div>
      <div class="story-title" id="story-title">No active story</div>
      <div class="story-branch" id="story-branch">--</div>
    </div>

    <!-- Connection Status -->
    <div id="connection-status" class="connection-status hidden">
      <span class="status-indicator"></span>
      <span class="status-text">Connecting...</span>
    </div>
  </div>

  <script nonce="${nonce}" src="${adapterUri}"></script>
</body>
</html>`;
  }
}
