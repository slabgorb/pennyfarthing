import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToolDialog } from './ToolDialog';
import { useComplexity, FileComplexity } from '../../hooks/useComplexity';

export interface ComplexityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SortField = 'avg_cyclomatic_complexity' | 'max_nesting_depth' | 'longest_function' | 'total_lines' | 'function_count' | 'path';
type SortDirection = 'asc' | 'desc';

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
      className={`text-${align} ${isActive ? 'active' : ''}`}
      onClick={() => onSort(field)}
      role="columnheader"
      aria-sort={isActive ? (currentDirection === 'desc' ? 'descending' : 'ascending') : 'none'}
      style={{ cursor: 'pointer', userSelect: 'none', padding: '4px 8px' }}
    >
      {label}{arrow}
    </th>
  );
}

export function ComplexityDialog({ open, onOpenChange }: ComplexityDialogProps): React.ReactElement {
  const [sortField, setSortField] = useState<SortField>('avg_cyclomatic_complexity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, error, refresh } = useComplexity({});

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

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

  const sorted = useMemo(() => {
    if (!data?.files) return [];
    const items = [...data.files];
    items.sort((a, b) => {
      const aVal = a[sortField as keyof FileComplexity];
      const bVal = b[sortField as keyof FileComplexity];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
      }
      return sortDirection === 'desc'
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
    return items;
  }, [data, sortField, sortDirection]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="complexity-panel loading" data-testid="complexity-panel">
          <div className="space-y-3 p-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="complexity-panel error" data-testid="complexity-panel">
          <div className="error-message">Error: {error.message}</div>
          <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="complexity-panel" data-testid="complexity-panel">
          <p>Click <strong>Analyze</strong> to run complexity analysis</p>
        </div>
      );
    }

    return (
      <div className="complexity-panel" data-testid="complexity-panel">
        <div className="complexity-summary" style={{ marginBottom: '8px' }}>
          <span>{data.file_count} files analyzed</span>
        </div>

        <table className="complexity-table" role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortableHeader label="Complexity" field="avg_cyclomatic_complexity" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Nesting" field="max_nesting_depth" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Longest Fn" field="longest_function" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Lines" field="total_lines" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="Functions" field="function_count" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHeader label="File" field="path" currentSort={sortField} currentDirection={sortDirection} onSort={handleSort} align="left" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => (
              <tr key={f.path}>
                <td className="text-right" style={{ padding: '4px 8px' }}>
                  <Badge variant={f.avg_cyclomatic_complexity >= 7 ? 'destructive' : f.avg_cyclomatic_complexity >= 4 ? 'outline' : 'secondary'}>
                    {Number(f.avg_cyclomatic_complexity).toFixed(1)}
                  </Badge>
                </td>
                <td className="text-right" style={{ padding: '4px 8px' }}>{f.max_nesting_depth}</td>
                <td className="text-right" style={{ padding: '4px 8px' }}>{f.longest_function}</td>
                <td className="text-right" style={{ padding: '4px 8px' }}>{f.total_lines}</td>
                <td className="text-right" style={{ padding: '4px 8px' }}>{f.function_count}</td>
                <td className="text-left" style={{ padding: '4px 8px' }}>{f.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <ToolDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Complexity"
      description="Cyclomatic complexity analysis"
    >
      {renderContent()}
    </ToolDialog>
  );
}
