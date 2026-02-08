import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useDeadCode, type StaleFile, type UnusedExport } from '@/hooks/useDeadCode';

export interface DeadCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  days?: number;
  repo?: string;
}

type TabId = 'stale' | 'exports';
type SortDir = 'asc' | 'desc';

export function DeadCodeDialog({ isOpen, onClose, days = 180, repo }: DeadCodeDialogProps) {
  const { data, isLoading, error, refresh } = useDeadCode({ days, repo, layer: 'all' });
  const [activeTab, setActiveTab] = useState<TabId>('stale');
  const [staleSortField, setStaleSortField] = useState<keyof StaleFile>('days_since_last_commit');
  const [staleSortDir, setStaleSortDir] = useState<SortDir>('desc');
  const [exportSortField, setExportSortField] = useState<keyof UnusedExport>('file');
  const [exportSortDir, setExportSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  const handleStaleSort = useCallback((field: keyof StaleFile) => {
    setStaleSortDir(prev => staleSortField === field && prev === 'desc' ? 'asc' : 'desc');
    setStaleSortField(field);
  }, [staleSortField]);

  const handleExportSort = useCallback((field: keyof UnusedExport) => {
    setExportSortDir(prev => exportSortField === field && prev === 'desc' ? 'asc' : 'desc');
    setExportSortField(field);
  }, [exportSortField]);

  const staleCount = data?.stale_file_count ?? data?.stale_files?.length ?? 0;
  const exportCount = data?.unused_export_count ?? data?.unused_exports?.length ?? 0;

  const sortedStaleFiles = useMemo(() => {
    const files = [...(data?.stale_files || [])];
    files.sort((a, b) => {
      const aVal = a[staleSortField];
      const bVal = b[staleSortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return staleSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return staleSortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return files;
  }, [data?.stale_files, staleSortField, staleSortDir]);

  const sortedExports = useMemo(() => {
    const exports = [...(data?.unused_exports || [])];
    exports.sort((a, b) => {
      const aVal = a[exportSortField];
      const bVal = b[exportSortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return exportSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return exportSortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return exports;
  }, [data?.unused_exports, exportSortField, exportSortDir]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Dead Code Analysis</DialogTitle>
          <DialogDescription>
            Diagnostic report — files and exports with no recent activity.
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setActiveTab('stale')}
            className={cn('px-3 py-1.5 text-sm rounded-t', activeTab === 'stale' && 'bg-accent')}
          >
            Stale Files <Badge variant="secondary" className="ml-1">{staleCount}</Badge>
          </button>
          <button
            onClick={() => setActiveTab('exports')}
            className={cn('px-3 py-1.5 text-sm rounded-t', activeTab === 'exports' && 'bg-accent')}
          >
            Unused Exports <Badge variant="secondary" className="ml-1">{exportCount}</Badge>
          </button>
        </div>

        {/* Content area */}
        <ScrollArea className="h-[50vh]">
          {isLoading && <div className="p-4 text-muted-foreground">Analyzing...</div>}
          {error && <div className="p-4 text-destructive">Error: {error.message}</div>}
          {data && activeTab === 'stale' && (
            <table className="w-full text-sm">
              <thead>
                <tr role="row">
                  <th className="text-left p-2 cursor-pointer" onClick={() => handleStaleSort('path')}>File</th>
                  <th className="text-left p-2 cursor-pointer" onClick={() => handleStaleSort('days_since_last_commit')}>Days Stale</th>
                  <th className="text-left p-2 cursor-pointer" onClick={() => handleStaleSort('size_bytes')}>Size</th>
                  <th className="text-left p-2 cursor-pointer" onClick={() => handleStaleSort('last_commit_date')}>Last Commit</th>
                </tr>
              </thead>
              <tbody>
                {sortedStaleFiles.map((file) => (
                  <tr key={file.path} role="row">
                    <td className="p-2 font-mono text-xs">{file.path}</td>
                    <td className="p-2">{file.days_since_last_commit}</td>
                    <td className="p-2">{formatBytes(file.size_bytes)}</td>
                    <td className="p-2">{file.last_commit_date ? new Date(file.last_commit_date).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data && activeTab === 'exports' && (
            <table className="w-full text-sm">
              <thead>
                <tr role="row">
                  <th className="text-left p-2 cursor-pointer" onClick={() => handleExportSort('file')}>File</th>
                  <th className="text-left p-2 cursor-pointer" onClick={() => handleExportSort('symbol')}>Export</th>
                  <th className="text-left p-2 cursor-pointer" onClick={() => handleExportSort('line')}>Line</th>
                </tr>
              </thead>
              <tbody>
                {sortedExports.map((exp) => (
                  <tr key={`${exp.file}:${exp.symbol}`} role="row">
                    <td className="p-2 font-mono text-xs">{exp.file}</td>
                    <td className="p-2">{exp.symbol}</td>
                    <td className="p-2">{exp.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
