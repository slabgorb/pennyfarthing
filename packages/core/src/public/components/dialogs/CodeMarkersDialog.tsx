/**
 * CodeMarkersDialog — Story 80-3 (MSSCI-14456)
 *
 * Dialog displaying code markers (TODO, FIXME, HACK, XXX) with tabs,
 * sortable table, staleness badges, and summary stats.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToolDialog } from './ToolDialog';
import { useCodeMarkers } from '../../hooks/useCodeMarkers';

export interface CodeMarkersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabId = 'all' | 'stale' | 'deprecated';
type SortField = 'marker_type' | 'path' | 'line' | 'author' | 'age_days';
type SortDirection = 'asc' | 'desc';

export function CodeMarkersDialog({ open, onOpenChange }: CodeMarkersDialogProps): React.ReactElement {
  const { data, isLoading, error, refresh } = useCodeMarkers({ days: 90, repo: 'pennyfarthing' });

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [sortField, setSortField] = useState<SortField>('age_days');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredMarkers = useMemo(() => {
    if (!data?.markers) return [];
    switch (activeTab) {
      case 'stale':
        return data.markers.filter((m) => m.is_stale);
      case 'deprecated':
        return [];
      default:
        return data.markers;
    }
  }, [data, activeTab]);

  const sortedMarkers = useMemo(() => {
    const sorted = [...filteredMarkers];
    sorted.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });
    return sorted;
  }, [filteredMarkers, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortArrow = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDirection === 'desc' ? ' v' : ' ^';
  };

  return (
    <ToolDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Code Markers"
      description="TODO, FIXME, HACK, and XXX markers across the codebase"
    >
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded border border-[var(--status-error)]/20 bg-[var(--status-error)]/5 text-[var(--status-error)] text-sm">
          {error.message}
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          {/* Summary stats */}
          <div className="flex gap-4 text-xs text-[var(--text-muted)]" data-testid="code-markers-summary">
            <span data-testid="summary-total">Total: <span className="tabular-nums font-mono">{data.summary.total_markers}</span></span>
            <span data-testid="summary-stale">Stale: <span className="tabular-nums font-mono">{data.summary.stale_markers}</span></span>
            {Object.entries(data.summary.by_type).map(([type, count]) => (
              <span key={type} data-testid={`summary-type-${type.toLowerCase()}`}>{type}: <span className="tabular-nums font-mono">{count}</span></span>
            ))}
          </div>

          {/* Tabs */}
          <div role="tablist" className="flex gap-4 border-b border-[var(--border)] mb-3">
            {(['all', 'stale', 'deprecated'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 text-sm capitalize ${activeTab === tab ? 'border-b-2 border-[var(--accent)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Table or empty state */}
          {sortedMarkers.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">No markers found</div>
          ) : (
            <table role="table" className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="cursor-pointer select-none text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] pb-2" onClick={() => handleSort('marker_type')}>
                    Type{sortArrow('marker_type')}
                  </th>
                  <th className="cursor-pointer select-none text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] pb-2" onClick={() => handleSort('path')}>
                    File{sortArrow('path')}
                  </th>
                  <th className="cursor-pointer select-none text-right text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] pb-2" onClick={() => handleSort('line')}>
                    Line{sortArrow('line')}
                  </th>
                  <th className="text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] pb-2">Text</th>
                  <th className="cursor-pointer select-none text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] pb-2" onClick={() => handleSort('author')}>
                    Author{sortArrow('author')}
                  </th>
                  <th className="cursor-pointer select-none text-right text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] pb-2" onClick={() => handleSort('age_days')}>
                    Age{sortArrow('age_days')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMarkers.map((marker, i) => (
                  <tr key={`${marker.path}:${marker.line}:${i}`} className="text-[var(--text-primary)]">
                    <td className="py-1.5">
                      <Badge variant={marker.is_stale ? 'destructive' : 'secondary'}>
                        {marker.marker_type}
                      </Badge>
                    </td>
                    <td className="py-1.5 font-mono text-xs">{marker.path}</td>
                    <td className="text-right py-1.5 tabular-nums font-mono">{marker.line}</td>
                    <td className="py-1.5 truncate max-w-xs">{marker.text}</td>
                    <td className="py-1.5">{marker.author}</td>
                    <td className="text-right py-1.5 tabular-nums font-mono">{marker.age_days}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

    </ToolDialog>
  );
}
