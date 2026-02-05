/**
 * useFileBrowser Hook
 *
 * Fetches directory listings from /api/files for the full file tree.
 * Lazy-loads subdirectories on demand.
 */

import { useState, useCallback } from 'react';

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  isModified?: boolean;
  size?: number;
}

export interface DirectoryListing {
  path: string;
  entries: DirectoryEntry[];
}

interface DirectoryCache {
  [path: string]: DirectoryEntry[];
}

interface UseFileBrowserResult {
  cache: DirectoryCache;
  loading: Set<string>;
  error: string | null;
  fetchDirectory: (dirPath: string) => Promise<void>;
}

export function useFileBrowser(): UseFileBrowserResult {
  const [cache, setCache] = useState<DirectoryCache>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchDirectory = useCallback(async (dirPath: string) => {
    // Already cached or loading
    if (cache[dirPath] || loading.has(dirPath)) return;

    setLoading(prev => new Set(prev).add(dirPath));
    setError(null);

    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`/api/files${params}`);
      if (!res.ok) throw new Error(`Failed to list directory: ${res.statusText}`);
      const listing: DirectoryListing = await res.json();

      // Sort: directories first, then files, alphabetical within each
      const sorted = listing.entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setCache(prev => ({ ...prev, [dirPath || '__root__']: sorted }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, [cache, loading]);

  return { cache, loading, error, fetchDirectory };
}
