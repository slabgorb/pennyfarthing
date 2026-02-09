import React from 'react';

export interface SparklinePoint {
  percent: number;
  tokens: number;
  timestamp: number;
}

export interface ContextSparklineProps {
  history: SparklinePoint[];
}

function getBarColor(tokens: number): string {
  if (tokens >= 1000) return 'var(--color-danger, #ef4444)';
  if (tokens >= 100) return 'var(--color-warning, #f59e0b)';
  return 'var(--color-success, #22c55e)';
}

export function ContextSparkline({ history }: ContextSparklineProps): React.ReactElement | null {
  if (history.length < 2) return null;

  const W = 200;
  const H = 32;
  const PAD = 2;
  const usable = H - PAD * 2;
  const latest = history[history.length - 1];
  const barWidth = W / history.length;

  return (
    <div className="context-sparkline" data-testid="context-sparkline">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Context usage trend: currently ${latest.percent}%`}
      >
        {history.map((p, i) => {
          const barHeight = Math.max(1, (p.percent / 100) * usable);
          const x = i * barWidth;
          const y = PAD + usable - barHeight;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={getBarColor(p.tokens)}
              opacity={0.8}
              rx={0.5}
            />
          );
        })}
      </svg>
    </div>
  );
}
