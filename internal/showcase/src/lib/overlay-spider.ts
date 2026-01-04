/**
 * Overlay Spider Chart Generator
 *
 * Generates SVG spider charts with multiple character overlays.
 * Used for comparing OCEAN profiles across 2-4 characters.
 */

import { oceanToPolygonPoints, getOverlayColors } from './spider-utils';

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

export interface OverlaySpiderProps {
  characters: Character[];
  size: number;
  showLabels?: boolean;
}

export interface LegendItem {
  name: string;
  theme: string;
  role: string;
  color: string;
}

/**
 * Generate grid lines (concentric pentagons) for the spider chart.
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
 * Generate axis lines from center to each vertex.
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
 * Generate label positions for OCEAN dimensions.
 */
function generateLabelPositions(
  size: number
): Array<{ x: number; y: number; label: string }> {
  const center = size / 2;
  const labelRadius = (size / 2) * 0.95;
  const dimensions: (keyof OceanScores)[] = ['O', 'C', 'E', 'A', 'N'];

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
 * Generate complete overlay spider SVG string.
 */
export function generateOverlaySvg(props: OverlaySpiderProps): string {
  const { characters, size, showLabels = false } = props;
  const colors = getOverlayColors();

  const gridPolygons = generateGridPolygons(size);
  const axisLines = generateAxisLines(size);
  const labelPositions = generateLabelPositions(size);

  // Build SVG string
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;

  // Grid polygons
  gridPolygons.forEach((points, i) => {
    svg += `<polygon points="${points}" fill="none" stroke="#d1d5db" stroke-width="0.5" opacity="${0.3 + i * 0.1}" />`;
  });

  // Axis lines
  axisLines.forEach((line) => {
    svg += `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="#d1d5db" stroke-width="0.5" />`;
  });

  // Character polygons (data)
  characters.forEach((character, index) => {
    const points = oceanToPolygonPoints(character.ocean, size);
    const color = colors[index % colors.length];
    svg += `<polygon points="${points}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2" />`;
  });

  // Labels (optional)
  if (showLabels) {
    labelPositions.forEach((pos) => {
      svg += `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" fill="#4b5563">${pos.label}</text>`;
    });
  }

  svg += '</svg>';

  return svg;
}

/**
 * Generate legend items for each character.
 */
export function generateLegend(characters: Character[]): LegendItem[] {
  const colors = getOverlayColors();

  return characters.map((character, index) => ({
    name: character.name,
    theme: character.theme,
    role: character.role,
    color: colors[index % colors.length],
  }));
}
