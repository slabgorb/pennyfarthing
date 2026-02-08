import { useState, useCallback, useRef, useEffect } from 'react';

// Types matching Python HotspotResult / MultiRepoHotspotResult
export interface FileHotspot {
  path: string;
  change_count: number;
  bug_fix_count: number;
  author_count: number;
  lines_added: number;
  lines_deleted: number;
  churn: number;
  last_changed: string;
  hotspot_score: number;
}

export interface DirectoryHotspot {
  path: string;
  file_count: number;
  total_changes: number;
  total_bug_fixes: number;
  avg_author_count: number;
  hotspot_score: number;
}

export interface HotspotRepoResult {
  success: boolean;
  repo_name: string;
  repo_path: string;
  time_window_days: number;
  commit_count: number;
  file_hotspots: FileHotspot[];
  directory_hotspots: DirectoryHotspot[];
  error?: string;
}

export interface HotspotData {
  success: boolean;
  // Single-repo result fields (when --path is used)
  repo_name?: string;
  repo_path?: string;
  time_window_days?: number;
  commit_count?: number;
  file_hotspots?: FileHotspot[];
  directory_hotspots?: DirectoryHotspot[];
  // Multi-repo result fields
  repo_results?: HotspotRepoResult[];
  error?: string;
}

export interface UseHotspotsOptions {
  days: number;
  repo?: string;
  skipTypes?: string[];
  includeOrchestrator?: boolean;
}

export interface UseHotspotsReturn {
  data: HotspotData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useHotspots(options: UseHotspotsOptions): UseHotspotsReturn {
  const [data, setData] = useState<HotspotData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchHotspots = useCallback(() => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ days: String(options.days) });
    if (options.repo) {
      params.set('repo', options.repo);
    }

    // Determine skip_type values: use explicit skipTypes, or default to ['orchestrator']
    // unless includeOrchestrator is true
    const skipTypes = options.skipTypes ??
      (options.includeOrchestrator ? [] : ['orchestrator']);
    for (const st of skipTypes) {
      params.append('skip_type', st);
    }

    fetch(`/api/hotspots?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((json: HotspotData) => {
        setData(json);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, [options.days, options.repo, options.skipTypes, options.includeOrchestrator]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { data, isLoading, error, refresh: fetchHotspots };
}
