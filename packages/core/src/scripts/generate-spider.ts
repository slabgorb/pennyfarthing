/**
 * OCEAN Spider Chart Generator
 *
 * Story 11-10: Build OCEAN spider chart generator (complement to Chernoff faces)
 *
 * Generates pentagon-shaped spider charts showing OCEAN personality profiles.
 * Charts are unfilled (stroke only) to enable clean stacking for comparisons.
 */

import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { findMonorepoRoot, resolveThemeFile } from '../cli/utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);

// OCEAN personality scores interface
export interface OceanScores {
  O: number;
  C: number;
  E: number;
  A: number;
  N: number;
}

/**
 * Load OCEAN scores for a specific theme and agent
 */
export function loadThemeOcean(theme: string, agent: string): OceanScores {
  const themePath = resolveThemeFile(projectRoot, theme);
  if (!themePath) {
    throw new Error(`Theme not found: ${theme}`);
  }
  const content = readFileSync(themePath, 'utf-8');
  const data = parseYaml(content) as Record<string, unknown>;

  const agents = data.agents as Record<string, Record<string, unknown>> | undefined;
  if (!agents || !agents[agent]) {
    return { O: 3, C: 3, E: 3, A: 3, N: 3 }; // Default neutral scores
  }

  const ocean = agents[agent].ocean as OceanScores | undefined;
  return ocean || { O: 3, C: 3, E: 3, A: 3, N: 3 };
}

// Chart configuration
const VIEW_SIZE = 200;
const CENTER_X = VIEW_SIZE / 2;
const CENTER_Y = VIEW_SIZE / 2 + 8; // Shifted down to balance top/bottom margins
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

// Role-specific colors (consistent across all charts for visual training)
export const ROLE_COLORS: Record<string, string> = {
  orchestrator: '#f59e0b', // Amber
  sm: '#10b981',           // Emerald
  tea: '#ef4444',          // Red
  dev: '#3b82f6',          // Blue
  reviewer: '#8b5cf6',     // Purple
  architect: '#06b6d4',    // Cyan
  pm: '#ec4899',           // Pink
  'tech-writer': '#84cc16', // Lime
  'ux-designer': '#f97316', // Orange
  devops: '#6366f1',       // Indigo
};

// Legacy overlay colors (for arbitrary comparisons)
const OVERLAY_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#9333ea', // Purple
  '#ea580c', // Orange
];

// Background and styling (dark theme for consistent rendering)
const BACKGROUND_COLOR = '#000000';
const GRID_COLOR = '#374151';
const AXIS_COLOR = '#4b5563';
const LABEL_COLOR = '#e5e7eb';
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
    x: CENTER_X + r * Math.cos(angle),
    y: CENTER_Y + r * Math.sin(angle),
  };
}

/**
 * Get vertex position (at full radius) for a dimension
 */
function getVertex(dimensionIndex: number): { x: number; y: number } {
  const angle = ((dimensionIndex * 72 - 90) * Math.PI) / 180;
  return {
    x: CENTER_X + OUTER_RADIUS * Math.cos(angle),
    y: CENTER_Y + OUTER_RADIUS * Math.sin(angle),
  };
}

/**
 * Get label position (outside the pentagon)
 */
function getLabelPosition(dimensionIndex: number): { x: number; y: number; anchor: string } {
  const angle = ((dimensionIndex * 72 - 90) * Math.PI) / 180;
  const x = CENTER_X + LABEL_RADIUS * Math.cos(angle);
  const y = CENTER_Y + LABEL_RADIUS * Math.sin(angle);

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
    const x = CENTER_X + r * Math.cos(angle);
    const y = CENTER_Y + r * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<polygon points="${points}" fill="none" stroke="${GRID_COLOR}" stroke-width="${GRID_STROKE_WIDTH}" />`;
}

/**
 * Generate axis line from center to vertex
 */
function generateAxisLine(dimensionIndex: number): string {
  const vertex = getVertex(dimensionIndex);
  return `<line x1="${CENTER_X}" y1="${CENTER_Y}" x2="${vertex.x.toFixed(1)}" y2="${vertex.y.toFixed(1)}" stroke="${AXIS_COLOR}" stroke-width="${GRID_STROKE_WIDTH}" />`;
}

/**
 * Generate dimension label
 */
function generateLabel(dimensionIndex: number): string {
  const pos = getLabelPosition(dimensionIndex);
  const label = DIMENSION_LABELS[DIMENSIONS[dimensionIndex]];

  // Adjust y for vertical centering
  const yOffset = dimensionIndex === 0 ? -4 : dimensionIndex === 2 || dimensionIndex === 3 ? 4 : 0;

  return `<text x="${pos.x.toFixed(1)}" y="${(pos.y + yOffset).toFixed(1)}" text-anchor="${pos.anchor}" font-family="sans-serif" font-size="12" font-weight="bold" fill="${LABEL_COLOR}">${label}</text>`;
}

/**
 * Generate data polygon from OCEAN scores
 */
function generateDataPolygon(ocean: OceanScores, color: string = '#2563eb', strokeWidth: number = DATA_STROKE_WIDTH): string {
  const points = DIMENSIONS.map((dim, i) => {
    const point = getPoint(i, ocean[dim], OUTER_RADIUS);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(' ');

  return `<polygon points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;
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
  <!-- Background -->
  <rect width="${VIEW_SIZE}" height="${VIEW_SIZE}" fill="${BACKGROUND_COLOR}" />

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
 * Uses role-specific color for consistent visual training
 */
export function generateSpider(theme: string, agent: string): string {
  const ocean = loadThemeOcean(theme, agent);
  const color = ROLE_COLORS[agent] || '#2563eb';
  return generateSpiderFromOcean(ocean, color);
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
  <text x="${x + 16}" y="${y}" font-family="sans-serif" font-size="10" fill="${LABEL_COLOR}">${label}</text>`;
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
  <!-- Background -->
  <rect width="${VIEW_SIZE}" height="${VIEW_SIZE}" fill="${BACKGROUND_COLOR}" />

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

// Agent order for team overlay (matches AGENTS in generate-all-spiders.ts)
const TEAM_AGENTS = [
  'orchestrator',
  'sm',
  'tea',
  'dev',
  'reviewer',
  'architect',
  'pm',
  'tech-writer',
  'ux-designer',
  'devops',
  'ba',
];

// Human-readable agent names for legend (reserved for future use)
const _AGENT_DISPLAY_NAMES: Record<string, string> = {
  orchestrator: 'Orch',
  sm: 'SM',
  tea: 'TEA',
  dev: 'Dev',
  reviewer: 'Rev',
  architect: 'Arch',
  pm: 'PM',
  'tech-writer': 'TW',
  'ux-designer': 'UX',
  devops: 'Ops',
  ba: 'BA',
};

// Tactical agents get emphasized (thicker stroke) in team overlays
const TACTICAL_AGENTS = new Set(['sm', 'tea', 'dev', 'reviewer']);
const TACTICAL_STROKE_WIDTH = 2.5;
const STRATEGIC_STROKE_WIDTH = 1;

/**
 * Generate team overlay spider chart showing all 10 agents for a theme
 * Uses role-specific colors for consistent visual training
 */
export function generateTeamOverlay(theme: string): string {
  // Grid pentagons
  const gridPolygons = [0.2, 0.4, 0.6, 0.8, 1.0]
    .map((scale) => generateGridPolygon(scale))
    .join('\n  ');

  // Axis lines
  const axisLines = TEAM_AGENTS.slice(0, 5)
    .map((_, i) => generateAxisLine(i))
    .join('\n  ');

  // Dimension labels
  const labels = DIMENSIONS.map((_, i) => generateLabel(i)).join('\n  ');

  // Data polygons for each agent (using role colors)
  // Tactical agents (sm, tea, dev, reviewer) emphasized with thicker strokes
  // Strategic/support agents de-emphasized with thinner strokes
  const dataPolygons = TEAM_AGENTS.map((agent) => {
    const ocean = loadThemeOcean(theme, agent);
    const color = ROLE_COLORS[agent];
    const strokeWidth = TACTICAL_AGENTS.has(agent) ? TACTICAL_STROKE_WIDTH : STRATEGIC_STROKE_WIDTH;
    return generateDataPolygon(ocean, color, strokeWidth);
  }).join('\n  ');

  // Legend removed - color key is in markdown header
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}">
  <!-- Background -->
  <rect width="${VIEW_SIZE}" height="${VIEW_SIZE}" fill="${BACKGROUND_COLOR}" />

  <!-- Grid -->
  ${gridPolygons}

  <!-- Axes -->
  ${axisLines}

  <!-- Data -->
  ${dataPolygons}

  <!-- Labels -->
  ${labels}
</svg>`;
}
