// Stub: useDeadCode.ts — Story 81-3 (MSSCI-14460)
// This file is a stub created by TEA for RED state.
// Dev will implement the actual React hook.

import { useState } from 'react';

export interface StaleFile {
  path: string;
  last_commit_date: string;
  days_since_last_commit: number;
  size_bytes: number;
}

export interface UnusedExport {
  symbol: string;
  file: string;
  line: number;
  export_type: string;
}

export interface DeadCodeData {
  success: boolean;
  repo_name?: string;
  repo_path?: string;
  time_window_days?: number;
  stale_files?: StaleFile[];
  unused_exports?: UnusedExport[];
  stale_file_count?: number;
  unused_export_count?: number;
  total_files?: number;
  total_exports_scanned?: number;
  repo_results?: DeadCodeData[];
  error?: string | null;
}

export interface UseDeadCodeOptions {
  days: number;
  repo?: string;
  layer?: 'stale' | 'exports' | 'all';
}

export interface UseDeadCodeReturn {
  data: DeadCodeData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useDeadCode(_options: UseDeadCodeOptions): UseDeadCodeReturn {
  const [data] = useState<DeadCodeData | null>(null);
  // Stub: returns static defaults, no fetch logic
  return { data, isLoading: false, error: null, refresh: () => {} };
}
