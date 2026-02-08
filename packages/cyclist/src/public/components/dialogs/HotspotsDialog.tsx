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
      className={`hotspots-th ${align === 'left' ? 'text-left' : 'text-right'} ${isActive ? 'active' : ''}`}
      onClick={() => onSort(field)}
      role="columnheader"
      aria-sort={isActive ? (currentDirection === 'desc' ? 'descending' : 'ascending') : 'none'}
      style={{ cursor: 'pointer', userSelect: 'none' }}
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
    <table className="hotspots-table" role="table">
      <thead>
        <tr>
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
          <tr key={h.path}>
            <td className="text-right">
              <Badge variant={h.hotspot_score >= 50 ? 'destructive' : h.hotspot_score >= 25 ? 'outline' : 'secondary'}>
                {h.hotspot_score.toFixed(1)}
              </Badge>
            </td>
            <td className="text-right">{h.change_count}</td>
            <td className="text-right">{h.bug_fix_count}</td>
            <td className="text-right">{h.author_count}</td>
            <td className="text-right">{h.churn}</td>
            <td className="text-left">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hotspots-filepath">{h.path}</span>
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
    <table className="hotspots-table" role="table">
      <thead>
        <tr>
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
          <tr key={d.path}>
            <td className="text-right">
              <Badge variant={d.hotspot_score >= 50 ? 'destructive' : d.hotspot_score >= 25 ? 'outline' : 'secondary'}>
                {d.hotspot_score.toFixed(1)}
              </Badge>
            </td>
            <td className="text-right">{d.total_changes}</td>
            <td className="text-right">{d.total_bug_fixes}</td>
            <td className="text-right">{d.avg_author_count.toFixed(1)}</td>
            <td className="text-right">{d.file_count}</td>
            <td className="text-left">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hotspots-filepath">{d.path}</span>
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
          <div className="hotspots-controls">
            <div className="hotspots-time-windows">
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

            <div className="hotspots-view-toggle">
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

            <label className="hotspots-checkbox">
              <input
                type="checkbox"
                checked={includeOrchestrator}
                onChange={(e) => setIncludeOrchestrator(e.target.checked)}
              />
              <span>Include orchestrator</span>
            </label>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={refresh}>
                  Analyze
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run hotspot analysis</TooltipContent>
            </Tooltip>
          </div>

          {data && (
            <div className="hotspots-summary">
              <span>{totalCommits} commits</span>
              <span>{allFiles.length} files</span>
              <span>{allDirs.length} dirs</span>
            </div>
          )}

          {!data && (
            <div className="hotspots-empty">
              <p>Click <strong>Analyze</strong> to detect code hotspots</p>
            </div>
          )}

          {data && viewMode === 'files' && (
            allFiles.length > 0 ? (
              <FileTable
                hotspots={allFiles.slice(0, 50)}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : (
              <div className="hotspots-empty">No file hotspots found</div>
            )
          )}

          {data && viewMode === 'dirs' && (
            allDirs.length > 0 ? (
              <DirTable
                hotspots={allDirs.slice(0, 50)}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : (
              <div className="hotspots-empty">No directory hotspots found</div>
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
