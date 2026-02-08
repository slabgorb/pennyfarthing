/**
 * CodeMarkersDialog — Story 80-3 (MSSCI-14456)
 *
 * Dialog displaying code markers (TODO, FIXME, HACK, XXX) with tabs,
 * sortable table, staleness badges, and summary stats.
 */
import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ToolDialog } from './ToolDialog';
import { useCodeMarkers, CodeMarker } from '../../hooks/useCodeMarkers';

export interface CodeMarkersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabId = 'all' | 'stale' | 'deprecated';
type SortField = 'marker_type' | 'path' | 'line' | 'author' | 'age_days';
type SortDirection = 'asc' | 'desc';

export function CodeMarkersDialog({ open, onOpenChange }: CodeMarkersDialogProps): React.ReactElement {
  const { data, isLoading, error, refresh } = useCodeMarkers({ days: 90, repo: 'pennyfarthing' });
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
        <div className="text-destructive">{error.message}</div>
      )}

      {!isLoading && !error && data && (
        <>
          {/* Summary stats */}
          <div className="flex gap-3 mb-3 text-sm" data-testid="code-markers-summary">
            <span data-testid="summary-total">Total: {data.summary.total_markers}</span>
            <span data-testid="summary-stale">Stale: {data.summary.stale_markers}</span>
            {Object.entries(data.summary.by_type).map(([type, count]) => (
              <span key={type} data-testid={`summary-type-${type.toLowerCase()}`}>{type}: {count}</span>
            ))}
          </div>

          {/* Tabs */}
          <div role="tablist" className="flex gap-1 mb-3">
            <button
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              className={activeTab === 'all' ? 'font-bold' : ''}
            >
              All
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'stale'}
              onClick={() => setActiveTab('stale')}
              className={activeTab === 'stale' ? 'font-bold' : ''}
            >
              Stale
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'deprecated'}
              onClick={() => setActiveTab('deprecated')}
              className={activeTab === 'deprecated' ? 'font-bold' : ''}
            >
              Deprecated
            </button>
          </div>

          {/* Table or empty state */}
          {sortedMarkers.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">No markers found</div>
          ) : (
            <table role="table" className="w-full text-sm">
              <thead>
                <tr>
                  <th className="cursor-pointer text-left" onClick={() => handleSort('marker_type')}>
                    <span>Type</span>{sortField === 'marker_type' && <span>{sortDirection === 'desc' ? ' v' : ' ^'}</span>}
                  </th>
                  <th className="cursor-pointer text-left" onClick={() => handleSort('path')}>
                    <span>File</span>{sortField === 'path' && <span>{sortDirection === 'desc' ? ' v' : ' ^'}</span>}
                  </th>
                  <th className="cursor-pointer text-right" onClick={() => handleSort('line')}>
                    <span>Line</span>{sortField === 'line' && <span>{sortDirection === 'desc' ? ' v' : ' ^'}</span>}
                  </th>
                  <th className="text-left">Text</th>
                  <th className="cursor-pointer text-left" onClick={() => handleSort('author')}>
                    <span>Author</span>{sortField === 'author' && <span>{sortDirection === 'desc' ? ' v' : ' ^'}</span>}
                  </th>
                  <th className="cursor-pointer text-right" onClick={() => handleSort('age_days')}>
                    <span>Age</span>{sortField === 'age_days' && <span>{sortDirection === 'desc' ? ' v' : ' ^'}</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMarkers.map((marker, i) => (
                  <tr key={`${marker.path}:${marker.line}:${i}`}>
                    <td>
                      <Badge variant={marker.is_stale ? 'destructive' : 'secondary'}>
                        {marker.marker_type}
                      </Badge>
                    </td>
                    <td>{marker.path}</td>
                    <td className="text-right">{marker.line}</td>
                    <td className="truncate max-w-xs">{marker.text}</td>
                    <td>{marker.author}</td>
                    <td className="text-right">{marker.age_days}d</td>
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
