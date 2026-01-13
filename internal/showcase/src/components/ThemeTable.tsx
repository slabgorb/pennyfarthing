/**
 * ThemeTable Component
 *
 * Displays themes in a table using shadcn/ui Table components.
 * Columns auto-align, character names shown on wide screens.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Theme, Agent } from "@/lib/types";

interface ThemeTableProps {
  themes: Theme[];
}

// Agent roles in display order
const roles = [
  "sm",
  "tea",
  "dev",
  "reviewer",
  "architect",
  "pm",
  "ux-designer",
  "tech-writer",
  "devops",
  "orchestrator",
] as const;

// Human-readable role labels
const roleLabels: Record<string, string> = {
  sm: "SM",
  tea: "TEA",
  dev: "Dev",
  reviewer: "Review",
  architect: "Arch",
  pm: "PM",
  "ux-designer": "UX",
  "tech-writer": "Docs",
  devops: "Ops",
  orchestrator: "Orch",
};

interface PortraitCellProps {
  theme: Theme;
  role: string;
  agent: Agent | undefined;
}

function PortraitCell({ theme, role, agent }: PortraitCellProps) {
  const spritePath = agent ? `/sprites/${theme.id}/small/${agent.slug}.png` : `/sprites/${theme.id}/small/${role}.png`;
  const firstName = agent?.character?.split(" ")[0] || role;

  return (
    <div className="flex flex-col items-center">
      <a href={`/characters/${theme.id}/${role}`} className="block">
        <img
          src={spritePath}
          alt={agent?.character || role}
          className="w-10 h-10 mx-auto rounded bg-stone-700 hover:ring-2 hover:ring-amber-500 transition-all object-cover"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div className="w-10 h-10 mx-auto rounded bg-stone-700 items-center justify-center text-lg hidden">
          {agent?.emoji || "👤"}
        </div>
      </a>
      <span className="portrait-name text-[10px] text-stone-500 mt-1 truncate max-w-[60px]">
        {firstName}
      </span>
    </div>
  );
}

export function ThemeTable({ themes }: ThemeTableProps) {
  return (
    <Table className="theme-table">
      <TableHeader className="sticky top-0 z-20 bg-[#272822]">
        <TableRow className="border-stone-700 hover:bg-transparent">
          <TableHead className="w-14 p-2"></TableHead>
          <TableHead className="min-w-[140px] p-2"></TableHead>
          {roles.map((role) => (
            <TableHead key={role} className="p-1 text-center">
              <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">
                {roleLabels[role]}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {themes.map((theme) => (
          <TableRow
            key={theme.id}
            data-theme-row
            data-theme-name={theme.metadata.name}
            data-theme-source={theme.metadata.source}
            className="border-stone-700/30 hover:bg-stone-800/50"
          >
            <TableCell className="p-2">
              <a href={`/themes/${theme.id}`} className="block">
                {/* Spider chart would go here - need to pass as prop or use client component */}
                <div className="w-12 h-12 rounded bg-stone-700/50 flex items-center justify-center text-stone-500 text-xs">
                  🕸️
                </div>
              </a>
            </TableCell>
            <TableCell className="p-2">
              <a href={`/themes/${theme.id}`} className="block">
                <div className="text-base font-semibold text-amber-100 truncate max-w-[180px]">
                  {theme.metadata.name}
                </div>
                <div className="text-sm text-stone-400 truncate max-w-[180px]">
                  {theme.metadata.source}
                </div>
              </a>
            </TableCell>
            {roles.map((role) => {
              const agent = theme.agents.find((a) => a.role === role);
              return (
                <TableCell key={role} className="p-1 text-center">
                  <PortraitCell theme={theme} role={role} agent={agent} />
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default ThemeTable;
