/**
 * useCodeMarkers React hook — Story 80-3 (MSSCI-14456)
 *
 * STUB: Created by TEA for RED state. Dev implements to GREEN.
 */

export interface CodeMarker {
  path: string;
  line: number;
  marker_type: string;
  text: string;
  author: string;
  date: string;
  age_days: number;
  is_stale: boolean;
}

export interface MarkerSummary {
  total_markers: number;
  stale_markers: number;
  by_type: Record<string, number>;
}

export interface CodeMarkersData {
  success: boolean;
  repo_name: string;
  repo_path: string;
  stale_threshold_days: number;
  markers: CodeMarker[];
  summary: MarkerSummary;
  error: string | null;
}

export interface UseCodeMarkersOptions {
  days: number;
  repo?: string;
  type?: 'all' | 'stale' | 'deprecated';
}

export interface UseCodeMarkersReturn {
  data: CodeMarkersData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useCodeMarkers(options: UseCodeMarkersOptions): UseCodeMarkersReturn {
  throw new Error('useCodeMarkers not implemented');
}
