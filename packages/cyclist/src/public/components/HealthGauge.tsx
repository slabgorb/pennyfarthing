/**
 * HealthGauge Component — STUB
 *
 * Story 84-2: To be implemented by Dev.
 * SVG radial gauge showing health score 0-100 with color bands.
 */

import React from 'react';

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

export function HealthGauge({ score, dimensions, totalDimensions, onDimensionClick }: HealthGaugeProps): React.ReactElement {
  return (
    <div data-testid="health-gauge">
      {/* TODO: Implement SVG radial gauge with score, grade, color bands, dimension breakdown */}
    </div>
  );
}
