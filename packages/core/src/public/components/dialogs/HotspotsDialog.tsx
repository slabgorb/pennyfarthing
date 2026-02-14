/**
 * HotspotsDialog - Git history hotspot detector in a dialog
 *
 * Story: MSSCI-14442 - Migrate HotspotsPanel into HotspotsDialog
 * Epic: epic-79 (Dialog Infrastructure + Hotspot Refactor)
 *
 * Migrated from HotspotsPanel — uses ToolDialog wrapper from 79-1.
 * Shows files and directories with highest change frequency, bug fix
 * concentration, and multi-author churn. Sortable table with time window controls.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ToolDialog } from './ToolDialog';
import { useHotspots, FileHotspot, DirectoryHotspot, HotspotRepoResult } from '../../hooks/useHotspots';

export interface HotspotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SortField = 'hotspot_score' | 'change_count' | 'bug_fix_count' | 'author_count' | 'churn' | 'path';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'files' | 'dirs';

const TIME_WINDOWS = [30, 60, 90] as const;

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.md', '.css', '.scss', '.html',
]);

const CONFIG_EXTENSIONS = new Set([
  '.json', '.yaml', '.yml', '.toml', '.env',
]);

function getExtension(path: string): string {
  const basename = path.split('/').pop() || '';
  // Handle dotfiles like .env
  if (basename.startsWith('.') && !basename.includes('.', 1)) {
    return '.' + basename.slice(1);
  }
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex > 0 ? basename.slice(dotIndex) : '';
}

function matchesFilter(path: string, codeOnly: boolean, includeConfig: boolean): boolean {
  if (!codeOnly) return true;
  const ext = getExtension(path);
  if (SOURCE_EXTENSIONS.has(ext)) return true;
  if (includeConfig && CONFIG_EXTENSIONS.has(ext)) return true;
  return false;
}

function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
  align = 'right',
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentDirection: SortDirection;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort === field;
  const arrow = isActive ? (currentDirection === 'desc' ? ' v' : ' ^') : '';

  return (
    <th
      className={`text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] pb-2 cursor-pointer select-none ${align === 'left' ? 'text-left' : 'text-right'} ${isActive ? 'text-[var(--text-primary)]' : ''}`}
      onClick={() => onSort(field)}
      role="columnheader"
      aria-sort={isActive ? (currentDirection === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      {label}{arrow}
    </th>
  );
}

function FileTable({
  hotspots,
  sortField,
  sortDirection,
  onSort,
}: {
  hotspots: FileHotspot[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const sorted = useMemo(() => {
    const items = [...hotspots];
    items.sort((a, b) => {
      const aVal = a[sortField as keyof FileHotspot];
      const bVal = b[sortField as keyof FileHotspot];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'desc' ? bStr.localeCompare(aStr) : aStr.localeCompare(bStr);
    });
    return items;
  }, [hotspots, sortField, sortDirection]);

  return (
    <table className="w-full text-sm" role="table">
      <thead>
        <tr className="border-b border-[var(--border)]">
          <SortableHeader label="Score" field="hotspot_score" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Changes" field="change_count" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Fixes" field="bug_fix_count" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Authors" field="author_count" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Churn" field="churn" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="File" field="path" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} align="left" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((h) => (
          <tr key={h.path} className="text-[var(--text-primary)]">
            <td className="text-right py-1.5">
              <Badge variant={h.hotspot_score >= 50 ? 'destructive' : h.hotspot_score >= 25 ? 'outline' : 'secondary'}>
                {h.hotspot_score.toFixed(1)}
              </Badge>
            </td>
            <td className="text-right py-1.5 tabular-nums font-mono">{h.change_count}</td>
            <td className="text-right py-1.5 tabular-nums font-mono">{h.bug_fix_count}</td>
            <td className="text-right py-1.5 tabular-nums font-mono">{h.author_count}</td>
            <td className="text-right py-1.5 tabular-nums font-mono">{h.churn}</td>
            <td className="text-left py-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate max-w-xs inline-block align-bottom font-mono text-xs">{h.path}</span>
                </TooltipTrigger>
                <TooltipContent>{h.path}</TooltipContent>
              </Tooltip>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DirTable({
  hotspots,
  sortField,
  sortDirection,
  onSort,
}: {
  hotspots: DirectoryHotspot[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const sorted = useMemo(() => {
    const items = [...hotspots];
    items.sort((a, b) => {
      const fieldMap: Record<string, keyof DirectoryHotspot> = {
        change_count: 'total_changes',
        bug_fix_count: 'total_bug_fixes',
        author_count: 'avg_author_count',
        churn: 'file_count',
      };
      const key = (fieldMap[sortField] || sortField) as keyof DirectoryHotspot;
      const aVal = a[key];
      const bVal = b[key];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
      }
      return sortDirection === 'desc'
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
    return items;
  }, [hotspots, sortField, sortDirection]);

  return (
    <table className="w-full text-sm" role="table">
      <thead>
        <tr className="border-b border-[var(--border)]">
          <SortableHeader label="Score" field="hotspot_score" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Changes" field="change_count" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Fixes" field="bug_fix_count" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Authors" field="author_count" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Files" field="churn" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} />
          <SortableHeader label="Directory" field="path" currentSort={sortField} currentDirection={sortDirection} onSort={onSort} align="left" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((d) => (
          <tr key={d.path} className="text-[var(--text-primary)]">
            <td className="text-right py-1.5">
              <Badge variant={d.hotspot_score >= 50 ? 'destructive' : d.hotspot_score >= 25 ? 'outline' : 'secondary'}>
                {d.hotspot_score.toFixed(1)}
              </Badge>
            </td>
            <td className="text-right py-1.5 tabular-nums font-mono">{d.total_changes}</td>
            <td className="text-right py-1.5 tabular-nums font-mono">{d.total_bug_fixes}</td>
            <td className="text-right py-1.5 tabular-nums font-mono">{d.avg_author_count.toFixed(1)}</td>
            <td className="text-right py-1.5 tabular-nums font-mono">{d.file_count}</td>
            <td className="text-left py-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate max-w-xs inline-block align-bottom font-mono text-xs">{d.path}</span>
                </TooltipTrigger>
                <TooltipContent>{d.path}</TooltipContent>
              </Tooltip>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HotspotsDialog({ open, onOpenChange }: HotspotsDialogProps): React.ReactElement {
  const [days, setDays] = useState<number>(90);
  const [viewMode, setViewMode] = useState<ViewMode>('files');
  const [sortField, setSortField] = useState<SortField>('hotspot_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [includeOrchestrator, setIncludeOrchestrator] = useState(false);
  const [codeOnly, setCodeOnly] = useState(false);
  const [includeConfig, setIncludeConfig] = useState(false);

  const { data, isLoading, error, refresh } = useHotspots({ days, includeOrchestrator });

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
        return prev;
      }
      setSortDirection('desc');
      return field;
    });
  }, []);

  const repoResults: HotspotRepoResult[] = useMemo(() => {
    if (!data) return [];
    if (data.repo_results) return data.repo_results;
    if (data.file_hotspots) {
      return [{
        success: data.success,
        repo_name: data.repo_name || '',
        repo_path: data.repo_path || '',
        time_window_days: data.time_window_days || days,
        commit_count: data.commit_count || 0,
        file_hotspots: data.file_hotspots || [],
        directory_hotspots: data.directory_hotspots || [],
      }];
    }
    return [];
  }, [data, days]);

  const allFiles = useMemo(() => {
    const files: FileHotspot[] = [];
    for (const r of repoResults) {
      if (r.success) files.push(...r.file_hotspots);
    }
    return files;
  }, [repoResults]);

  const allDirs = useMemo(() => {
    const dirs: DirectoryHotspot[] = [];
    for (const r of repoResults) {
      if (r.success) dirs.push(...r.directory_hotspots);
    }
    return dirs;
  }, [repoResults]);

  const filteredFiles = useMemo(
    () => allFiles.filter((f) => matchesFilter(f.path, codeOnly, includeConfig)),
    [allFiles, codeOnly, includeConfig],
  );

  const filteredDirs = useMemo(
    () => allDirs.filter((d) => matchesFilter(d.path, codeOnly, includeConfig)),
    [allDirs, codeOnly, includeConfig],
  );

  const totalCommits = repoResults.reduce((sum, r) => sum + (r.commit_count || 0), 0);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="hotspots-panel loading" data-testid="hotspots-panel">
          <div className="space-y-3 p-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="hotspots-panel error" data-testid="hotspots-panel">
          <div className="error-message">{error.message}</div>
          <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
        </div>
      );
    }

    return (
      <TooltipProvider delayDuration={300}>
        <div className="hotspots-panel" data-testid="hotspots-panel">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex gap-1">
                {TIME_WINDOWS.map((w) => (
                  <Button
                    key={w}
                    variant={days === w ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDays(w)}
                  >
                    {w}d
                  </Button>
                ))}
              </div>

              <div className="flex gap-1">
                <Button
                  variant={viewMode === 'files' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('files')}
                >
                  Files
                </Button>
                <Button
                  variant={viewMode === 'dirs' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('dirs')}
                >
                  Dirs
                </Button>
              </div>

              <div className="ml-auto">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={refresh}>
                      Analyze
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Run hotspot analysis</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOrchestrator}
                  onChange={(e) => setIncludeOrchestrator(e.target.checked)}
                />
                Include orchestrator
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Code only"
                  checked={codeOnly}
                  onChange={(e) => setCodeOnly(e.target.checked)}
                />
                Code only
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Include config"
                  checked={includeConfig}
                  disabled={!codeOnly}
                  onChange={(e) => setIncludeConfig(e.target.checked)}
                  className="disabled:opacity-40"
                />
                <span className={!codeOnly ? 'opacity-40' : ''}>Include config</span>
              </label>
            </div>
          </div>

          {data && (
            <div className="flex gap-4 text-xs text-[var(--text-muted)]">
              <span>{totalCommits} commits</span>
              <span>{filteredFiles.length} files</span>
              <span>{filteredDirs.length} dirs</span>
            </div>
          )}

          {!data && (
            <div className="text-center py-12 text-[var(--text-muted)]">
              Click <strong>Analyze</strong> to detect code hotspots
            </div>
          )}

          {data && viewMode === 'files' && (
            filteredFiles.length > 0 ? (
              <FileTable
                hotspots={filteredFiles.slice(0, 50)}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : (
              <div className="text-center py-12 text-[var(--text-muted)]">No file hotspots found</div>
            )
          )}

          {data && viewMode === 'dirs' && (
            filteredDirs.length > 0 ? (
              <DirTable
                hotspots={filteredDirs.slice(0, 50)}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : (
              <div className="text-center py-12 text-[var(--text-muted)]">No directory hotspots found</div>
            )
          )}
        </div>
      </TooltipProvider>
    );
  };

  return (
    <ToolDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Hotspots"
      description="Files and directories ranked by change frequency and complexity"
    >
      {renderContent()}
    </ToolDialog>
  );
}
