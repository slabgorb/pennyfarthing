/**
 * Test helpers for DebugPanel component tests
 */

export interface WebSocketRefs {
  contextWs: any;
  tokenWs: any;
  spansWs: any;
}

/**
 * Setup WebSocket mocking that captures instances for testing
 * Call this in beforeEach
 */
export function setupWebSocketMocks(): WebSocketRefs {
  const refs: WebSocketRefs = {
    contextWs: null,
    tokenWs: null,
    spansWs: null,
  };

  const originalWebSocket = (global as any).WebSocket;
  (global as any).WebSocket = class extends originalWebSocket {
    constructor(url: string) {
      super(url);
      if (url.includes('/ws/context')) {
        refs.contextWs = this;
      } else if (url.includes('/ws/token-stats')) {
        refs.tokenWs = this;
      } else if (url.includes('/ws/spans')) {
        refs.spansWs = this;
      }
    }
  };

  return refs;
}

/**
 * Send context data via WebSocket
 */
export function sendContextUpdate(ws: any, data: any) {
  ws.onmessage({ data: JSON.stringify({
    type: 'update',
    context: data,
  }) });
}

/**
 * Send token stats via WebSocket
 */
export function sendTokenStats(ws: any, data: any) {
  ws.onmessage({ data: JSON.stringify(data) });
}

/**
 * Send spans via WebSocket
 */
export function sendSpans(ws: any, spans: any[]) {
  ws.onmessage({ data: JSON.stringify({
    type: 'init',
    spans,
  }) });
}
