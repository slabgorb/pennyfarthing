/**
 * CharacterCard Component
 *
 * Displays a character with portrait, name, theme, role, and OCEAN bars.
 * Used in the Compare page results grid and Favorites page.
 */

import { useState } from 'react';
import FavoriteButton from './FavoriteButton';
import { buildCharacterId } from '../lib/favorites-store';

interface CharacterCardProps {
  character: {
    name: string;
    theme: string;
    themeId?: string;
    role: string;
    ocean: { O: number; C: number; E: number; A: number; N: number };
    emoji?: string;
  };
  onSelect?: () => void;
  showFavorite?: boolean;
  isSelected?: boolean;
}

const OCEAN_LABELS: Record<string, string> = {
  O: 'Openness',
  C: 'Conscientiousness',
  E: 'Extraversion',
  A: 'Agreeableness',
  N: 'Neuroticism',
};

const OCEAN_COLORS: Record<string, string> = {
  O: 'bg-purple-500',
  C: 'bg-blue-500',
  E: 'bg-yellow-500',
  A: 'bg-green-500',
  N: 'bg-red-500',
};

// Mini Spider Chart Component
function MiniSpiderChart({ ocean, size = 60 }: { ocean: Record<string, number>; size?: number }) {
  const center = size / 2;
  const maxRadius = (size / 2) * 0.8;
  const dimensions = ['O', 'C', 'E', 'A', 'N'];

  // Generate polygon points for the data
  const dataPoints = dimensions.map((dim, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    const score = ocean[dim];
    const radius = (score / 5) * maxRadius;
    return `${(center + radius * Math.cos(angle)).toFixed(1)},${(center + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

  // Generate grid pentagon points
  const gridLevels = [1, 2, 3, 4, 5].map(level => {
    const radius = (level / 5) * maxRadius;
    return dimensions.map((_, i) => {
      const angle = (i * 72 - 90) * (Math.PI / 180);
      return `${(center + radius * Math.cos(angle)).toFixed(1)},${(center + radius * Math.sin(angle)).toFixed(1)}`;
    }).join(' ');
  });

  // Generate axis lines
  const axisLines = dimensions.map((_, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    return {
      x2: center + maxRadius * Math.cos(angle),
      y2: center + maxRadius * Math.sin(angle),
    };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {/* Grid pentagons */}
      {gridLevels.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-stone-600"
          opacity={0.3 + i * 0.1}
        />
      ))}
      {/* Axis lines */}
      {axisLines.map((line, i) => (
        <line
          key={i}
          x1={center}
          y1={center}
          x2={line.x2}
          y2={line.y2}
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-stone-600"
        />
      ))}
      {/* Data polygon */}
      <polygon
        points={dataPoints}
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-amber-500"
      />
    </svg>
  );
}

// Portrait with emoji fallback
function Portrait({ themeId, role, emoji, name }: { themeId?: string; role: string; emoji?: string; name: string }) {
  const [imgError, setImgError] = useState(false);
  const spritePath = themeId ? `/sprites/${themeId}/${role}.png` : null;

  if (!spritePath || imgError) {
    return (
      <div className="w-12 h-12 flex items-center justify-center text-2xl bg-stone-700 rounded">
        {emoji || '👤'}
      </div>
    );
  }

  return (
    <img
      src={spritePath}
      alt={name}
      className="w-12 h-12 object-cover rounded"
      onError={() => setImgError(true)}
    />
  );
}

export default function CharacterCard({ character, onSelect, showFavorite = true, isSelected = false }: CharacterCardProps) {
  const { name, theme, themeId, role, ocean, emoji } = character;
  const characterId = buildCharacterId(theme, role);

  return (
    <div
      className={`bg-stone-800 border-2 rounded-lg hover:border-amber-600 transition-all p-3 cursor-pointer relative ${
        isSelected ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-stone-700'
      }`}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => e.key === 'Enter' && onSelect() : undefined}
    >
      {showFavorite && (
        <div className="absolute top-2 right-2">
          <FavoriteButton characterId={characterId} />
        </div>
      )}

      {/* Name and theme/role on top */}
      <div className="mb-2 pr-6">
        <h3 className="font-semibold text-amber-100 truncate text-sm" title={name}>
          {name}
        </h3>
        <p className="text-xs text-stone-400 truncate">
          {theme} · {role}
        </p>
      </div>

      {/* Spider chart, bar graph, and portrait inline */}
      <div className="flex items-center gap-2">
        {/* Spider Chart - always visible */}
        <MiniSpiderChart ocean={ocean} size={56} />

        {/* OCEAN Bars with ticks */}
        <div className="space-y-1">
          {(['O', 'C', 'E', 'A', 'N'] as const).map((dim) => (
            <div key={dim} className="flex items-center gap-1">
              <span
                className="text-xs font-medium text-stone-400 w-3"
                title={OCEAN_LABELS[dim]}
              >
                {dim}
              </span>
              <div className="w-14 h-1.5 bg-stone-700 rounded-full overflow-hidden relative">
                {/* Tick marks at 1,2,3,4 */}
                {[1, 2, 3, 4].map((tick) => (
                  <div
                    key={tick}
                    className="absolute w-px h-full bg-stone-600"
                    style={{ left: `${(tick / 5) * 100}%` }}
                  />
                ))}
                <div
                  className={`h-full rounded-full ${OCEAN_COLORS[dim]} relative z-10`}
                  style={{ width: `${(ocean[dim] / 5) * 100}%` }}
                />
              </div>
              <span className="text-xs text-stone-500 w-3 text-right">
                {ocean[dim]}
              </span>
            </div>
          ))}
        </div>

        {/* Portrait aligned right */}
        <div className="ml-auto">
          <Portrait themeId={themeId} role={role} emoji={emoji} name={name} />
        </div>
      </div>
    </div>
  );
}
