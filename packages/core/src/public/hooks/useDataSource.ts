/**
 * useDataSource<T> — Generic React hook for WebSocket-based DataSource<T>.
 *
 * Story 124-3: Replaces direct WebSocket boilerplate in panel hooks.
 * Handles connection lifecycle, reconnection, message parsing, and cleanup.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DataSource } from '@pennyfarthing/core';

export interface UseDataSourceOptions<R, T> {
  /** WebSocket endpoint path, e.g. '/ws/sprint' */
  endpoint: string;
  /** Transform raw message to typed data */
  transform?: (raw: R) => T;
  /** Merge partial updates with existing data */
  merge?: (prev: T | null, update: T) => T;
  /** Message types to accept (default: ['init', 'update']) */
  acceptTypes?: string[];
  /** Reconnect delay in ms (default: 2000) */
  reconnectMs?: number;
}

export interface UseDataSourceResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  /** Send a message to the WebSocket (for bidirectional DataSource communication) */
  send: (message: unknown) => void;
}

/**
 * Generic hook wrapping the DataSource<T> pattern for WebSocket endpoints.
 * All WebSocket panel hooks should use this instead of raw WebSocket.
 */
export function useDataSource<R = unknown, T = R>(
  options: UseDataSourceOptions<R, T>
): UseDataSourceResult<T> {
  const { endpoint, transform, merge, reconnectMs = 2000 } = options;
  const acceptTypes = options.acceptTypes ?? ['init', 'update'];

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);

  const send = useCallback((message: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${endpoint}`;

    const connect = () => {
      if (!isMountedRef.current) return;

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onmessage = (event) => {
          try {
            const raw = JSON.parse(event.data);
            if (raw.type && acceptTypes.includes(raw.type)) {
              const transformed = transform ? transform(raw) : (raw as unknown as T);
              setData((prev) => merge ? merge(prev, transformed) : transformed);
              setIsLoading(false);
              setError(null);
            }
          } catch (err) {
            console.error(`[useDataSource ${endpoint}] Parse error:`, err);
          }
        };

        wsRef.current.onclose = () => {
          if (isMountedRef.current) {
            reconnectTimeoutRef.current = setTimeout(connect, reconnectMs);
          }
        };

        wsRef.current.onerror = () => {
          setError(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to connect'));
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [endpoint]);

  return { data, isLoading, error, send };
}

/**
 * useRestDataSource<T> — Generic hook for REST/fetch-based DataSource<T>.
 *
 * Replaces direct fetch boilerplate in panel hooks.
 */
export interface UseRestDataSourceOptions {
  /** REST endpoint path, e.g. '/api/code-markers' */
  endpoint: string;
  /** Query parameters */
  params?: Record<string, string>;
  /** Whether to auto-fetch on mount (default: true) */
  autoFetch?: boolean;
}

export interface UseRestDataSourceResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  /** Manually trigger a fetch */
  refresh: () => void;
}

/**
 * Generic hook wrapping the DataSource<T> pattern for REST endpoints.
 * All fetch-based panel hooks should use this instead of raw fetch.
 */
export function useRestDataSource<T>(
  options: UseRestDataSourceOptions
): UseRestDataSourceResult<T> {
  const { endpoint, params, autoFetch = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);

    let url = endpoint;
    if (params && Object.keys(params).length > 0) {
      url += `?${new URLSearchParams(params).toString()}`;
    }

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json as T);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, [endpoint, params ? JSON.stringify(params) : '']);

  useEffect(() => {
    if (autoFetch) refresh();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

// =============================================================================
// useRawDataSource — Low-level WebSocket DataSource for custom message handling
// =============================================================================

export interface UseRawDataSourceOptions {
  /** WebSocket endpoint path */
  endpoint: string;
  /** Called with each parsed JSON message */
  onMessage: (data: unknown) => void;
  /** Called on WebSocket close */
  onClose?: () => void;
  /** Called on WebSocket error */
  onError?: (error: Error) => void;
  /** Reconnect delay in ms (default: 2000) */
  reconnectMs?: number;
}

/**
 * Low-level DataSource hook for WebSocket endpoints with custom message handling.
 * Use this when useDataSource's transform/merge pattern is too constraining.
 */
export function useRawDataSource(options: UseRawDataSourceOptions): {
  send: (message: unknown) => void;
} {
  const { endpoint, onMessage, onClose, onError, reconnectMs = 2000 } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onCloseRef.current = onClose;
  onErrorRef.current = onError;

  const send = useCallback((message: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${endpoint}`;

    const connect = () => {
      if (!isMountedRef.current) return;

      try {
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessageRef.current(data);
          } catch (err) {
            console.error(`[useRawDataSource ${endpoint}] Parse error:`, err);
          }
        };

        wsRef.current.onclose = () => {
          onCloseRef.current?.();
          if (isMountedRef.current) {
            reconnectTimeoutRef.current = setTimeout(connect, reconnectMs);
          }
        };

        wsRef.current.onerror = () => {
          onErrorRef.current?.(new Error('WebSocket connection failed'));
        };
      } catch {
        // Connection failed
      }
    };

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [endpoint]);

  return { send };
}
