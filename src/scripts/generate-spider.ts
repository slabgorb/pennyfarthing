/**
 * OCEAN Spider Chart Generator
 *
 * Story 11-10: Build OCEAN spider chart generator (complement to Chernoff faces)
 *
 * Generates pentagon-shaped spider charts showing OCEAN personality profiles.
 * Charts are unfilled (stroke only) to enable clean stacking for comparisons.
 */

import { loadThemeOcean, OceanScores } from './generate-face.js';

// Chart configuration
const VIEW_SIZE = 200;
const CENTER = VIEW_SIZE / 2;
const OUTER_RADIUS = 70; // Leaves room for labels
const LABEL_RADIUS = OUTER_RADIUS + 18;

// OCEAN dimension order (clockwise from top)
const DIMENSIONS: (keyof OceanScores)[] = ['O', 'C', 'E', 'A', 'N'];
const DIMENSION_LABELS: Record<keyof OceanScores, string> = {
  O: 'O',
  C: 'C',
  E: 'E',
  A: 'A',
  N: 'N',
};

// Colors for overlay mode
const OVERLAY_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#9333ea', // Purple
  '#ea580c', // Orange
];

// Grid and axis styling
const GRID_COLOR = '#e5e7eb';
const AXIS_COLOR = '#9ca3af';
const DATA_STROKE_WIDTH = 2;
const GRID_STROKE_WIDTH = 1;

/**
 * Calculate point on pentagon for given dimension and score
 * @param dimensionIndex - Index 0-4 for O, C, E, A, N
 * @param score - Score 1-5
 * @param radius - Base radius to use
 */
function getPoint(dimensionIndex: number, score: number, radius: number): { x: number; y: number } {
  // Start from top (-90°), go clockwise
  // Each vertex is 72° apart (360° / 5)
  const angle = ((dimensionIndex * 72 - 90) * Math.PI) / 180;

  // Map score 1-5 to 20%-100% of radius
  const normalizedScore = 0.2 + ((score - 1) / 4) * 0.8;
  const r = radius * normalizedScore;

  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

/**
 * Get vertex position (at full radius) for a dimension
 */
function getVertex(dimensionIndex: number): { x: number; y: number } {
  const angle = ((dimensionIndex * 72 - 90) * Math.PI) / 180;
  return {
    x: CENTER + OUTER_RADIUS * Math.cos(angle),
    y: CENTER + OUTER_RADIUS * Math.sin(angle),
  };
}

/**
 * Get label position (outside the pentagon)
 */
function getLabelPosition(dimensionIndex: number): { x: number; y: number; anchor: string } {
  const angle = ((dimensionIndex * 72 - 90) * Math.PI) / 180;
  const x = CENTER + LABEL_RADIUS * Math.cos(angle);
  const y = CENTER + LABEL_RADIUS * Math.sin(angle);

  // Text anchor depends on position
  let anchor = 'middle';
  if (dimensionIndex === 1 || dimensionIndex === 2) anchor = 'start'; // Right side
  if (dimensionIndex === 3 || dimensionIndex === 4) anchor = 'end'; // Left side

  return { x, y, anchor };
}

/**
 * Generate grid pentagon at a specific scale
 */
function generateGridPolygon(scale: number): string {
  const points = DIMENSIONS.map((_, i) => {
    const angle = ((i * 72 - 90) * Math.PI) / 180;
    const r = OUTER_RADIUS * scale;
    const x = CENTER + r * Math.cos(angle);
    const y = CENTER + r * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<polygon points="${points}" fill="none" stroke="${GRID_COLOR}" stroke-width="${GRID_STROKE_WIDTH}" />`;
}

/**
 * Generate axis line from center to vertex
 */
function generateAxisLine(dimensionIndex: number): string {
  const vertex = getVertex(dimensionIndex);
  return `<line x1="${CENTER}" y1="${CENTER}" x2="${vertex.x.toFixed(1)}" y2="${vertex.y.toFixed(1)}" stroke="${AXIS_COLOR}" stroke-width="${GRID_STROKE_WIDTH}" />`;
}

/**
 * Generate dimension label
 */
function generateLabel(dimensionIndex: number): string {
  const pos = getLabelPosition(dimensionIndex);
  const label = DIMENSION_LABELS[DIMENSIONS[dimensionIndex]];

  // Adjust y for vertical centering
  const yOffset = dimensionIndex === 0 ? -4 : dimensionIndex === 2 || dimensionIndex === 3 ? 4 : 0;

  return `<text x="${pos.x.toFixed(1)}" y="${(pos.y + yOffset).toFixed(1)}" text-anchor="${pos.anchor}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#374151">${label}</text>`;
}

/**
 * Generate data polygon from OCEAN scores
 */
function generateDataPolygon(ocean: OceanScores, color: string = '#2563eb'): string {
  const points = DIMENSIONS.map((dim, i) => {
    const point = getPoint(i, ocean[dim], OUTER_RADIUS);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(' ');

  return `<polygon points="${points}" fill="none" stroke="${color}" stroke-width="${DATA_STROKE_WIDTH}" stroke-linejoin="round" />`;
}

/**
 * Generate SVG spider chart from OCEAN scores
 */
export function generateSpiderFromOcean(ocean: OceanScores, color: string = '#2563eb'): string {
  // Grid pentagons at 20%, 40%, 60%, 80%, 100%
  const gridPolygons = [0.2, 0.4, 0.6, 0.8, 1.0]
    .map((scale) => generateGridPolygon(scale))
    .join('\n  ');

  // Axis lines
  const axisLines = DIMENSIONS.map((_, i) => generateAxisLine(i)).join('\n  ');

  // Dimension labels
  const labels = DIMENSIONS.map((_, i) => generateLabel(i)).join('\n  ');

  // Data polygon
  const dataPolygon = generateDataPolygon(ocean, color);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}">
  <!-- Grid -->
  ${gridPolygons}

  <!-- Axes -->
  ${axisLines}

  <!-- Data -->
  ${dataPolygon}

  <!-- Labels -->
  ${labels}
</svg>`;
}

/**
 * Generate SVG spider chart from theme and agent
 */
export function generateSpider(theme: string, agent: string): string {
  const ocean = loadThemeOcean(theme, agent);
  return generateSpiderFromOcean(ocean);
}

/**
 * Character specification for overlay mode
 */
export interface CharacterSpec {
  theme: string;
  agent: string;
  label?: string;
}

/**
 * Format theme name for display
 */
function formatThemeName(theme: string): string {
  return theme
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate legend item
 */
function generateLegendItem(
  index: number,
  label: string,
  color: string,
  yOffset: number
): string {
  const x = 10;
  const y = VIEW_SIZE - 10 - yOffset;

  return `<rect x="${x}" y="${y - 8}" width="12" height="12" fill="none" stroke="${color}" stroke-width="2" />
  <text x="${x + 16}" y="${y}" font-family="sans-serif" font-size="10" fill="#374151">${label}</text>`;
}

/**
 * Generate overlay spider chart comparing multiple characters
 */
export function generateOverlaySpider(characters: CharacterSpec[]): string {
  // Grid pentagons
  const gridPolygons = [0.2, 0.4, 0.6, 0.8, 1.0]
    .map((scale) => generateGridPolygon(scale))
    .join('\n  ');

  // Axis lines
  const axisLines = DIMENSIONS.map((_, i) => generateAxisLine(i)).join('\n  ');

  // Dimension labels
  const labels = DIMENSIONS.map((_, i) => generateLabel(i)).join('\n  ');

  // Data polygons for each character
  const dataPolygons = characters
    .map((char, index) => {
      const ocean = loadThemeOcean(char.theme, char.agent);
      const color = OVERLAY_COLORS[index % OVERLAY_COLORS.length];
      return generateDataPolygon(ocean, color);
    })
    .join('\n  ');

  // Legend items
  const legendItems = characters
    .map((char, index) => {
      const color = OVERLAY_COLORS[index % OVERLAY_COLORS.length];
      const label = char.label || `${formatThemeName(char.theme)} (${char.agent})`;
      const yOffset = (characters.length - 1 - index) * 16;
      return generateLegendItem(index, label, color, yOffset);
    })
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}">
  <!-- Grid -->
  ${gridPolygons}

  <!-- Axes -->
  ${axisLines}

  <!-- Data -->
  ${dataPolygons}

  <!-- Labels -->
  ${labels}

  <!-- Legend -->
  ${legendItems}
</svg>`;
}
