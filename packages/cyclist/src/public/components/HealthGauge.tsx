import React, { useState } from 'react';

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

export function HealthGauge({ score, dimensions, totalDimensions, onDimensionClick }: HealthGaugeProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const hasData = score !== null && score !== undefined;
  const gradeInfo = hasData ? getGrade(score) : null;
  const fillAngle = hasData ? (score / 100) * 180 : 0;

  const handleClick = () => {
    if (hasData && dimensions.length > 0) {
      setExpanded(!expanded);
    }
  };

  return (
    <div
      data-testid="health-gauge"
      data-grade={gradeInfo?.grade ?? null}
      onClick={handleClick}
      style={{ cursor: hasData ? 'pointer' : 'default' }}
    >
      <svg viewBox="0 0 200 120" width="200" height="120">
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

      {/* Dimension breakdown */}
      {expanded && (
        <div data-testid="dimension-breakdown" className="health-gauge-breakdown">
          {dimensions.map((dim) => (
            <div
              key={dim.name}
              data-testid={`dimension-${dim.name}`}
              className="health-gauge-dimension"
              onClick={(e) => {
                e.stopPropagation();
                onDimensionClick?.(dim.name);
              }}
              style={{ cursor: onDimensionClick ? 'pointer' : 'default' }}
            >
              <span className="dimension-label">
                {DIMENSION_LABELS[dim.name] || dim.name}
              </span>
              <span className="dimension-score">
                {dim.score !== null ? dim.score.toFixed(1) : '--'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
