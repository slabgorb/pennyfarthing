/**
 * WebSocketDataSource<T> — Live WebSocket data provider.
 *
 * Story 124-3: Concrete DataSource implementation for real-time local data.
 * Handles URL construction, auto-reconnection, and JSON message parsing.
 */

import type { DataSource, DataSourceOptions, Unsubscribe } from '../data-source.js';

const DEFAULT_RECONNECT_MS = 2000;

export interface WebSocketDataSourceConfig {
  /** WebSocket endpoint path, e.g. '/ws/sprint' */
  endpoint: string;
  /** Base URL override (defaults to window.location) */
  baseUrl?: string;
  /** Reconnect delay in ms (default: 2000) */
  reconnectMs?: number;
  /** Transform raw parsed JSON to typed data */
  transform?: (raw: unknown) => unknown;
}

export class WebSocketDataSource<T> implements DataSource<T> {
  private ws: WebSocket | null = null;
  private subscribers: Set<(data: T) => void> = new Set();
  private errorSubscribers: Set<(error: Error) => void> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private shouldReconnect = false;
  private config: WebSocketDataSourceConfig;
  private options: DataSourceOptions = {};

  constructor(config: WebSocketDataSourceConfig) {
    this.config = config;
  }

  connect(options?: DataSourceOptions): void {
    if (options) {
      this.options = options;
    }
    this.shouldReconnect = true;
    this.doConnect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  subscribe(callback: (data: T) => void): Unsubscribe {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  onError(callback: (error: Error) => void): Unsubscribe {
    this.errorSubscribers.add(callback);
    return () => this.errorSubscribers.delete(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private buildUrl(): string {
    const endpoint = this.options.endpoint || this.config.endpoint;
    if (this.config.baseUrl) {
      return `${this.config.baseUrl}${endpoint}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = `${protocol}//${window.location.host}${endpoint}`;

    // Append query params if provided
    const params = this.options.params;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }
    return url;
  }

  private doConnect(): void {
    if (!this.shouldReconnect) return;

    try {
      const url = this.buildUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = JSON.parse(event.data as string);
          const data = this.config.transform
            ? (this.config.transform(raw) as T)
            : (raw as T);
          for (const cb of this.subscribers) {
            cb(data);
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Failed to parse message');
          for (const cb of this.errorSubscribers) {
            cb(error);
          }
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this.shouldReconnect) {
          const delay = this.config.reconnectMs ?? DEFAULT_RECONNECT_MS;
          this.reconnectTimeout = setTimeout(() => this.doConnect(), delay);
        }
      };

      this.ws.onerror = () => {
        const error = new Error('WebSocket connection failed');
        for (const cb of this.errorSubscribers) {
          cb(error);
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      for (const cb of this.errorSubscribers) {
        cb(error);
      }
    }
  }
}
