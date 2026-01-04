/**
 * Export Functionality
 *
 * Export character comparisons as markdown tables or SVG images.
 * Used for sharing and saving comparison results.
 */

import { generateOverlaySvg, generateLegend } from './overlay-spider';
import { getOverlayColors, oceanToPolygonPoints } from './spider-utils';

export interface OceanScores {
  O: number;
  C: number;
  E: number;
  A: number;
  N: number;
}

export interface Character {
  theme: string;
  role: string;
  name: string;
  ocean: OceanScores;
}

export interface ExportOptions {
  title?: string;
  size?: number;
}

/**
 * Generate markdown comparison table.
 */
export function generateComparisonTable(characters: Character[]): string {
  const header = '| Character | Theme | Role | O | C | E | A | N |';
  const separator = '|---|---|---|---|---|---|---|---|';

  const rows = characters.map((char) => {
    return `| ${char.name} | ${char.theme} | ${char.role} | ${char.ocean.O} | ${char.ocean.C} | ${char.ocean.E} | ${char.ocean.A} | ${char.ocean.N} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Export comparison as complete markdown document.
 */
export function exportAsMarkdown(
  characters: Character[],
  options?: ExportOptions
): string {
  const title = options?.title ?? '# OCEAN Comparison';
  const timestamp = new Date().toISOString().split('T')[0];
  const table = generateComparisonTable(characters);

  const lines = [
    title.startsWith('#') ? title : `# ${title}`,
    '',
    `Comparing ${characters.length} character${characters.length > 1 ? 's' : ''} (personas)`,
    '',
    `*Generated: ${timestamp}*`,
    '',
    '## OCEAN Scores',
    '',
    table,
    '',
  ];

  return lines.join('\n');
}

/**
 * Generate grid lines for standalone SVG export.
 */
function generateGridPolygons(size: number): string[] {
  const center = size / 2;
  const maxRadius = (size / 2) * 0.8;
  const lines: string[] = [];

  for (let level = 1; level <= 5; level++) {
    const radius = (level / 5) * maxRadius;
    const points = [0, 1, 2, 3, 4].map((i) => {
      const angle = (i * 72 - 90) * (Math.PI / 180);
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    lines.push(points.join(' '));
  }

  return lines;
}

/**
 * Generate axis lines for standalone SVG export.
 */
function generateAxisLines(
  size: number
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const center = size / 2;
  const maxRadius = (size / 2) * 0.8;

  return [0, 1, 2, 3, 4].map((i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    return {
      x1: center,
      y1: center,
      x2: center + maxRadius * Math.cos(angle),
      y2: center + maxRadius * Math.sin(angle),
    };
  });
}

/**
 * Generate label positions for standalone SVG export.
 */
function generateLabelPositions(
  size: number
): Array<{ x: number; y: number; label: string }> {
  const center = size / 2;
  const labelRadius = (size / 2) * 0.95;
  const dimensions = ['O', 'C', 'E', 'A', 'N'];

  return dimensions.map((dim, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    return {
      x: center + labelRadius * Math.cos(angle),
      y: center + labelRadius * Math.sin(angle),
      label: dim,
    };
  });
}

/**
 * Export comparison as standalone SVG with embedded legend.
 */
export function exportAsSvg(
  characters: Character[],
  options?: ExportOptions
): string {
  const size = options?.size ?? 400;
  const legendHeight = 30 * characters.length + 20;
  const totalHeight = size + legendHeight;
  const colors = getOverlayColors();

  const gridPolygons = generateGridPolygons(size);
  const axisLines = generateAxisLines(size);
  const labelPositions = generateLabelPositions(size);
  const legend = generateLegend(characters);

  // Build standalone SVG with xmlns
  let svg = `<svg width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;

  // Background
  svg += `<rect width="${size}" height="${totalHeight}" fill="white" />`;

  // Grid polygons
  gridPolygons.forEach((points, i) => {
    svg += `<polygon points="${points}" fill="none" stroke="#d1d5db" stroke-width="0.5" opacity="${0.3 + i * 0.1}" />`;
  });

  // Axis lines
  axisLines.forEach((line) => {
    svg += `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="#d1d5db" stroke-width="0.5" />`;
  });

  // Character polygons
  characters.forEach((character, index) => {
    const points = oceanToPolygonPoints(character.ocean, size);
    const color = colors[index % colors.length];
    svg += `<polygon points="${points}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2" />`;
  });

  // Labels
  labelPositions.forEach((pos) => {
    svg += `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" fill="#4b5563">${pos.label}</text>`;
  });

  // Legend
  legend.forEach((item, index) => {
    const y = size + 20 + index * 25;
    svg += `<rect x="20" y="${y}" width="16" height="16" fill="${item.color}" />`;
    svg += `<text x="45" y="${y + 12}" font-size="12" fill="#374151">${item.name} (${item.theme})</text>`;
  });

  svg += '</svg>';

  return svg;
}
