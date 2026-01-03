/**
 * CharacterCard Component
 *
 * Displays a character with name, theme, role, and mini OCEAN bars.
 * Used in the Compare page results grid.
 */

interface CharacterCardProps {
  character: {
    name: string;
    theme: string;
    role: string;
    ocean: { O: number; C: number; E: number; A: number; N: number };
  };
  onSelect?: () => void;
}

const OCEAN_LABELS: Record<string, string> = {
  O: 'Openness',
  C: 'Conscientiousness',
  E: 'Extraversion',
  A: 'Agreeableness',
  N: 'Neuroticism',
};

const OCEAN_COLORS: Record<string, string> = {
  O: 'bg-blue-500',
  C: 'bg-green-500',
  E: 'bg-yellow-500',
  A: 'bg-pink-500',
  N: 'bg-purple-500',
};

export default function CharacterCard({ character, onSelect }: CharacterCardProps) {
  const { name, theme, role, ocean } = character;

  return (
    <div
      className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow p-4 cursor-pointer"
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => e.key === 'Enter' && onSelect() : undefined}
    >
      <div className="mb-3">
        <h3 className="font-semibold text-gray-900 truncate" title={name}>
          {name}
        </h3>
        <p className="text-sm text-gray-600 truncate">
          {theme} &middot; {role}
        </p>
      </div>

      <div className="space-y-1.5">
        {(['O', 'C', 'E', 'A', 'N'] as const).map((dim) => (
          <div key={dim} className="flex items-center gap-2">
            <span
              className="text-xs font-medium text-gray-500 w-4"
              title={OCEAN_LABELS[dim]}
            >
              {dim}
            </span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${OCEAN_COLORS[dim]}`}
                style={{ width: `${(ocean[dim] / 5) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-3 text-right">
              {ocean[dim]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
