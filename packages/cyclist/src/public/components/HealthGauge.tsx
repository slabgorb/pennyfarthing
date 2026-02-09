import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export interface HealthGaugeDimension {
  name: string;
  score: number | null;
  weight: number;
}

export interface HealthGaugeProps {
  score: number | null;
  dimensions: HealthGaugeDimension[];
  totalDimensions?: number;
  onDimensionClick?: (dimensionName: string) => void;
  isLoading?: boolean;
  lastFetchedAt?: number | null;
  onRefresh?: () => void;
  error?: Error | null;
}

const GRADE_BANDS: { min: number; grade: string; color: string }[] = [
  { min: 90, grade: 'A', color: '#22c55e' },
  { min: 75, grade: 'B', color: '#84cc16' },
  { min: 60, grade: 'C', color: '#eab308' },
  { min: 40, grade: 'D', color: '#f97316' },
  { min: 0,  grade: 'F', color: '#ef4444' },
];

const DIMENSION_LABELS: Record<string, string> = {
  churn: 'Churn',
  todo_density: 'TODO Density',
  complexity: 'Complexity',
  test_gaps: 'Test Gaps',
  dead_code: 'Dead Code',
  deprecation_debt: 'Deprecation Debt',
  dependency_freshness: 'Dependency Freshness',
  agent_context_efficiency: 'Agent Context Efficiency',
};

function getGrade(score: number): { grade: string; color: string } {
  for (const band of GRADE_BANDS) {
    if (score >= band.min) {
      return { grade: band.grade, color: band.color };
    }
  }
  return { grade: 'F', color: '#ef4444' };
}

// SVG arc helper for a semicircle gauge
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function HealthGauge({ score, dimensions, totalDimensions, onDimensionClick, isLoading, lastFetchedAt, onRefresh, error }: HealthGaugeProps): React.ReactElement {
  const hasData = score !== null && score !== undefined;
  const gradeInfo = hasData ? getGrade(score) : null;
  const fillAngle = hasData ? (score / 100) * 180 : 0;

  // Live-updating age display
  const [ageText, setAgeText] = useState<string | null>(null);
  useEffect(() => {
    if (!lastFetchedAt) {
      setAgeText(null);
      return;
    }
    const tick = () => setAgeText(formatAge(Date.now() - lastFetchedAt));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [lastFetchedAt]);

  // Use all 8 dimension keys so rows always render (even before data arrives)
  const allDimKeys = Object.keys(DIMENSION_LABELS);
  const dimMap = new Map(dimensions.map((d) => [d.name, d]));

  return (
    <div
      data-testid="health-gauge"
      data-grade={gradeInfo?.grade ?? null}
    >
      <div className="health-gauge-header">
        <div className="health-gauge-status">
          {ageText && <span className="health-gauge-age" data-testid="health-gauge-age">{ageText}</span>}
          {error && <span className="health-gauge-error" data-testid="health-gauge-error">Failed</span>}
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="health-gauge-refresh"
            data-testid="health-gauge-refresh"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? 'Analyzing...' : hasData ? 'Refresh' : 'Analyze'}
          </Button>
        )}
      </div>

      <svg viewBox="0 0 200 120" width="200" height="120" className={isLoading ? 'opacity-50' : ''}>
        {/* Background arc (grey) */}
        <path
          d={describeArc(100, 100, 80, 0, 180)}
          fill="none"
          stroke="#333"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Fill arc (colored by grade) */}
        {hasData && fillAngle > 0 && (
          <path
            d={describeArc(100, 100, 80, 0, fillAngle)}
            fill="none"
            stroke={gradeInfo!.color}
            strokeWidth="12"
            strokeLinecap="round"
          />
        )}
        {/* Score text */}
        <text x="100" y="85" textAnchor="middle" fontSize="28" fill="currentColor">
          {hasData ? String(score) : '--'}
        </text>
        {/* Grade letter */}
        {gradeInfo && (
          <text x="100" y="108" textAnchor="middle" fontSize="16" fill={gradeInfo.color}>
            {gradeInfo.grade}
          </text>
        )}
      </svg>

      {/* Dimension count for partial data */}
      {hasData && totalDimensions && dimensions.length < totalDimensions && (
        <div className="health-gauge-partial">
          {dimensions.length} of {totalDimensions} dimensions
        </div>
      )}

      {/* Dimension breakdown — always visible, each row opens its dialog */}
      <div data-testid="dimension-breakdown" className="health-gauge-breakdown">
        {allDimKeys.map((dimName) => {
          const dim = dimMap.get(dimName);
          return (
            <div
              key={dimName}
              data-testid={`dimension-${dimName}`}
              className="health-gauge-dimension"
              onClick={() => onDimensionClick?.(dimName)}
              style={{ cursor: onDimensionClick ? 'pointer' : 'default' }}
            >
              <span className="dimension-label">
                {DIMENSION_LABELS[dimName] || dimName}
              </span>
              <span className="dimension-score">
                {dim?.score !== null && dim?.score !== undefined ? dim.score.toFixed(1) : '--'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
