/**
 * BikeRackIndex - Index page listing all available panels
 *
 * Story MSSCI-14822: BikeRackIndex panel listing page
 * Epic: 101 (BikeRack Mode)
 *
 * Lists all 13 panels with links to standalone mode via ?panel=X.
 * Styled with Tailwind dark mode, consistent with Cyclist.
 *
 * Rules:
 * - No dockview-react imports (Rule 7)
 * - No BikeRack-specific props (Rule 2)
 * - URL-based detection only (Rule 10)
 */

import React from 'react';

const PANELS = [
  { id: 'sprint', label: 'Sprint', description: 'Story tracking and sprint progress' },
  { id: 'git', label: 'Git', description: 'Repository status and branches' },
  { id: 'diffs', label: 'Diffs', description: 'Code changes and diffs' },
  { id: 'todos', label: 'Todos', description: 'Acceptance criteria tracking' },
  { id: 'workflow', label: 'Workflow', description: 'Current workflow state' },
  { id: 'background', label: 'Background', description: 'Background tasks' },
  { id: 'audit', label: 'Audit', description: 'OTEL spans and logs' },
  { id: 'changed', label: 'Changed', description: 'Changed files' },
  { id: 'ac', label: 'AC', description: 'Acceptance criteria detail' },
  { id: 'debug', label: 'Debug', description: 'Debug information' },
  { id: 'bikelane', label: 'BikeLane', description: 'Workflow visualization' },
  { id: 'settings', label: 'Settings', description: 'Theme, fonts, and display preferences' },
] as const;

export function BikeRackIndex(): React.ReactElement {
  return (
    <div className="bg-slate-900 min-h-screen text-gray-200 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">BikeRack</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PANELS.map((panel) => (
            <a
              key={panel.id}
              href={`/?panel=${panel.id}`}
              className="block border border-slate-700 rounded-lg p-4 hover:bg-slate-800 hover:text-cyan-400 transition-colors"
            >
              <div className="text-lg font-semibold text-white mb-1">{panel.label}</div>
              <p className="text-sm text-gray-400">{panel.description}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
