/**
 * WheelHub Adapter for VS Code Extension
 *
 * Embedded HTTP/WebSocket server for the VS Code extension, adapted from
 * Cyclist's WheelHub (server.ts). Provides WebSocket channels for Claude
 * communication and UI state synchronization.
 *
 * Key differences from Cyclist's WheelHub:
 * - Embedded in VS Code extension host process
 * - Lifecycle tied to extension activation/deactivation
 * - Subset of routers (no static file serving, no OTEL receiver)
 * - Uses VS Code's OutputChannel for logging
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { OutputChannel } from 'vscode';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { WebSocketManager } from './websocket-manager';

// Default port range for WheelHub server
const DEFAULT_PORT = 18980;
const MAX_PORT_ATTEMPTS = 10;

// Port file for Claude CLI discovery
const PORT_FILE_NAME = '.cyclist-port';
const CYCLIST_DIR = '.cyclist';

/**
 * Lightweight HTTP server request handler.
 * Provides a minimal health endpoint for connection verification.
 */
function createRequestHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // Health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'wheelhub-vscode' }));
      return;
    }

    // 404 for all other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  };
}

/**
 * WheelHub server adapter for VS Code extension.
 */
export class WheelHubAdapter {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private wsManager: WebSocketManager;
  private port: number = 0;
  private running: boolean = false;

  constructor(
    private workspaceRoot: string,
    private outputChannel: OutputChannel
  ) {
    this.wsManager = new WebSocketManager();
  }

  /**
   * Start the WheelHub server.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.outputChannel.appendLine('[WheelHub] Server already running');
      return;
    }

    // Create HTTP server with basic request handler
    this.server = createServer(createRequestHandler());

    // Find available port
    this.port = await this.findAvailablePort(DEFAULT_PORT);

    // Set up WebSocket server
    this.wss = new WebSocketServer({ noServer: true });

    // Handle WebSocket upgrade requests
    this.server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(
        request.url || '',
        `http://${request.headers.host}`
      ).pathname;

      // Check if this is a registered channel
      if (this.wsManager.hasChannel(pathname)) {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wsManager.handleConnection(pathname, ws as WsWebSocket);
        });
      } else {
        socket.destroy();
      }
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, () => {
        this.running = true;
        this.outputChannel.appendLine(
          `[WheelHub] Server started on port ${this.port}`
        );
        resolve();
      });

      this.server!.on('error', (err) => {
        reject(err);
      });
    });

    // Write port file for Claude CLI discovery
    this.writePortFile();
  }

  /**
   * Stop the WheelHub server.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Close all WebSocket connections
    this.wsManager.closeAll();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    await new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });

    this.server = null;
    this.running = false;

    // Clean up port file
    this.cleanupPortFile();

    this.outputChannel.appendLine('[WheelHub] Server stopped');
  }

  /**
   * Check if server is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the port the server is running on.
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get the underlying HTTP server.
   */
  getServer(): Server | null {
    return this.server;
  }

  /**
   * Get the WebSocket manager.
   */
  getWebSocketManager(): WebSocketManager {
    return this.wsManager;
  }

  /**
   * Find an available port starting from the given port.
   */
  private async findAvailablePort(
    startPort: number,
    maxAttempts: number = MAX_PORT_ATTEMPTS
  ): Promise<number> {
    const net = await import('net');

    for (let port = startPort; port < startPort + maxAttempts; port++) {
      const available = await new Promise<boolean>((resolve) => {
        const testServer = net.createServer();
        testServer.once('error', () => resolve(false));
        testServer.once('listening', () => {
          testServer.close();
          resolve(true);
        });
        testServer.listen(port);
      });

      if (available) {
        return port;
      }
    }

    throw new Error(
      `No available port found in range ${startPort}-${startPort + maxAttempts - 1}`
    );
  }

  /**
   * Write port file for Claude CLI discovery.
   */
  private writePortFile(): void {
    // Ensure .cyclist directory exists
    const cyclistDir = join(this.workspaceRoot, CYCLIST_DIR);
    if (!existsSync(cyclistDir)) {
      mkdirSync(cyclistDir, { recursive: true });
    }

    // Write port to .cyclist-port file
    const portFilePath = join(this.workspaceRoot, PORT_FILE_NAME);
    writeFileSync(portFilePath, String(this.port));

    this.outputChannel.appendLine(
      `[WheelHub] Wrote port file: ${portFilePath}`
    );
  }

  /**
   * Clean up port file on shutdown.
   */
  private cleanupPortFile(): void {
    const portFilePath = join(this.workspaceRoot, PORT_FILE_NAME);
    if (existsSync(portFilePath)) {
      unlinkSync(portFilePath);
      this.outputChannel.appendLine(
        `[WheelHub] Cleaned up port file: ${portFilePath}`
      );
    }
  }
}
