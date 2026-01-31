/**
 * DebugPanel - Placeholder for debug/diagnostic info
 *
 * Story MSSCI-12717 - React Migration
 */

import React, { useState, useEffect } from 'react';

interface ContextData {
  used?: number;
  total?: number;
  percent?: number;
}

export function DebugPanel(): React.ReactElement {
  const [context, setContext] = useState<ContextData | null>(null);
  const [tokenStats, setTokenStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Subscribe to context updates
    api.context?.get?.().then(data => {
      setContext(data as ContextData);
    });
    api.context?.onUpdate?.((_, data) => {
      setContext(data as ContextData);
    });

    // Subscribe to token stats
    api.tokenStats?.get?.().then(data => {
      setTokenStats(data as Record<string, unknown>);
    });
    api.tokenStats?.onUpdate?.((_, data) => {
      setTokenStats(data as Record<string, unknown>);
    });
  }, []);

  return (
    <div className="debug-panel" data-testid="debug-panel">
      <h4>Context Usage</h4>
      {context ? (
        <div className="context-info">
          <div className="context-bar">
            <div
              className="context-fill"
              style={{ width: `${context.percent || 0}%` }}
            />
          </div>
          <span className="context-text">
            {context.used?.toLocaleString()} / {context.total?.toLocaleString()} tokens
            ({context.percent || 0}%)
          </span>
        </div>
      ) : (
        <div className="placeholder">No context data</div>
      )}

      <h4>Token Stats</h4>
      {tokenStats ? (
        <pre className="token-stats">
          {JSON.stringify(tokenStats, null, 2)}
        </pre>
      ) : (
        <div className="placeholder">No token stats</div>
      )}
    </div>
  );
}

export default DebugPanel;
