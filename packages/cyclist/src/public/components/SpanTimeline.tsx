/**
 * SpanTimeline Component
 *
 * Visual timeline of OTEL spans showing tool execution over time.
 *
 * Features:
 * - Horizontal timeline with spans as bars
 * - Color-coded by tool type
 * - Click to expand span details
 * - Real-time updates via WebSocket
 * - Zoom and scroll controls
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

interface EnrichedSpan {
  spanId: string;
  traceId: string;
  toolName: string;
  startTime: number;
  endTime?: number;
  durationMs: number;
  status: 'running' | 'completed' | 'error';
  success: boolean;
  error?: string;
  enrichment: {
    filePath?: string;
    command?: string;
    pattern?: string;
    summary?: string;
  };
}

interface SpanTimelineProps {
  /** Height of the timeline in pixels */
  height?: number;
  /** Whether to auto-scroll to newest spans */
  autoScroll?: boolean;
}

// Tool colors for visual distinction
const TOOL_COLORS: Record<string, string> = {
  Read: '#4ade80',      // Green
  Write: '#f87171',     // Red
  Edit: '#fb923c',      // Orange
  Bash: '#60a5fa',      // Blue
  Grep: '#a78bfa',      // Purple
  Glob: '#2dd4bf',      // Teal
  Task: '#e879f9',      // Magenta
  WebFetch: '#22d3ee',  // Cyan
  WebSearch: '#fbbf24', // Yellow
};

// =============================================================================
// Helper Functions
// =============================================================================

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] || '#888888';
}

// =============================================================================
// Component
// =============================================================================

export function SpanTimeline({ height = 200, autoScroll = true }: SpanTimelineProps): React.ReactElement {
  const [spans, setSpans] = useState<EnrichedSpan[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<EnrichedSpan | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = 1px per 100ms
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch initial spans
  useEffect(() => {
    fetch('/api/spans?limit=100')
      .then(res => res.ok ? res.json() : { spans: [] })
      .then(data => {
        setSpans(data.spans || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws/spans`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'span' && data.span) {
          setSpans(prev => {
            // Update existing span or add new one
            const existing = prev.findIndex(s => s.spanId === data.span.spanId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = data.span;
              return updated;
            }
            return [...prev, data.span].slice(-100); // Keep last 100
          });
        }
      } catch (err) {
        console.error('[SpanTimeline] WebSocket parse error:', err);
      }
    };

    return () => ws.close();
  }, []);

  // Auto-scroll to right (newest spans)
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
  }, [spans, autoScroll]);

  // Calculate timeline bounds
  const { minTime, maxTime, timeRange } = useMemo(() => {
    if (spans.length === 0) {
      const now = Date.now();
      return { minTime: now - 60000, maxTime: now, timeRange: 60000 };
    }

    const times = spans.flatMap(s => [s.startTime, s.endTime || s.startTime + s.durationMs]);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const range = Math.max(max - min, 10000); // At least 10 seconds

    return { minTime: min, maxTime: max, timeRange: range };
  }, [spans]);

  // Calculate timeline width based on zoom
  const timelineWidth = useMemo(() => {
    return Math.max(800, (timeRange / 100) * zoomLevel);
  }, [timeRange, zoomLevel]);

  // Handle span click
  const handleSpanClick = useCallback((span: EnrichedSpan) => {
    setSelectedSpan(selectedSpan?.spanId === span.spanId ? null : span);
  }, [selectedSpan]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev * 1.5, 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev / 1.5, 0.1));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
  }, []);

  if (loading) {
    return <div className="span-timeline-loading">Loading spans...</div>;
  }

  return (
    <div className="span-timeline" style={{ height }}>
      {/* Toolbar */}
      <div className="span-timeline-toolbar">
        <span className="span-count">{spans.length} spans</span>
        <div className="zoom-controls">
          <button onClick={handleZoomOut} title="Zoom out">−</button>
          <button onClick={handleZoomReset} title="Reset zoom">⟳</button>
          <button onClick={handleZoomIn} title="Zoom in">+</button>
        </div>
      </div>

      {/* Timeline container */}
      <div className="span-timeline-container" ref={containerRef}>
        <div
          className="span-timeline-track"
          ref={timelineRef}
          style={{ width: timelineWidth }}
        >
          {/* Time axis */}
          <div className="span-timeline-axis">
            {Array.from({ length: Math.ceil(timeRange / 10000) + 1 }, (_, i) => {
              const time = minTime + i * 10000;
              const left = ((time - minTime) / timeRange) * timelineWidth;
              return (
                <div
                  key={i}
                  className="axis-tick"
                  style={{ left }}
                >
                  <span className="tick-label">{formatTime(time)}</span>
                </div>
              );
            })}
          </div>

          {/* Span bars */}
          <div className="span-timeline-bars">
            {spans.map((span, index) => {
              const left = ((span.startTime - minTime) / timeRange) * timelineWidth;
              const width = Math.max(4, (span.durationMs / timeRange) * timelineWidth);
              const top = (index % 5) * 28 + 4; // Stack in 5 rows

              return (
                <div
                  key={span.spanId}
                  className={`span-bar ${span.success ? '' : 'error'} ${
                    selectedSpan?.spanId === span.spanId ? 'selected' : ''
                  }`}
                  style={{
                    left,
                    width,
                    top,
                    backgroundColor: getToolColor(span.toolName),
                  }}
                  onClick={() => handleSpanClick(span)}
                  title={`${span.toolName}: ${formatDuration(span.durationMs)}`}
                >
                  <span className="span-bar-label">{span.toolName}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected span details */}
      {selectedSpan && (
        <div className="span-timeline-details">
          <div className="detail-header">
            <span
              className="tool-badge"
              style={{ backgroundColor: getToolColor(selectedSpan.toolName) }}
            >
              {selectedSpan.toolName}
            </span>
            <span className="duration">{formatDuration(selectedSpan.durationMs)}</span>
            <span className={`status ${selectedSpan.success ? 'success' : 'error'}`}>
              {selectedSpan.success ? '✓' : '✗'}
            </span>
            <button
              className="close-details"
              onClick={() => setSelectedSpan(null)}
            >
              ×
            </button>
          </div>
          <div className="detail-body">
            <div className="detail-row">
              <label>Time:</label>
              <span>{formatTime(selectedSpan.startTime)}</span>
            </div>
            {selectedSpan.enrichment.filePath && (
              <div className="detail-row">
                <label>File:</label>
                <span className="mono">{selectedSpan.enrichment.filePath}</span>
              </div>
            )}
            {selectedSpan.enrichment.command && (
              <div className="detail-row">
                <label>Command:</label>
                <span className="mono">{selectedSpan.enrichment.command}</span>
              </div>
            )}
            {selectedSpan.enrichment.pattern && (
              <div className="detail-row">
                <label>Pattern:</label>
                <span className="mono">{selectedSpan.enrichment.pattern}</span>
              </div>
            )}
            {selectedSpan.enrichment.summary && (
              <div className="detail-row">
                <label>Summary:</label>
                <span>{selectedSpan.enrichment.summary}</span>
              </div>
            )}
            {selectedSpan.error && (
              <div className="detail-row error">
                <label>Error:</label>
                <span>{selectedSpan.error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="span-timeline-legend">
        {Object.entries(TOOL_COLORS).slice(0, 6).map(([tool, color]) => (
          <div key={tool} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: color }} />
            <span className="legend-label">{tool}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SpanTimeline;
