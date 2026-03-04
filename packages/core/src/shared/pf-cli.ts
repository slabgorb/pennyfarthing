/**
 * Shared utilities for pf CLI subprocess calls.
 * Story 141-17: Single delegation pattern for all pf CLI interactions.
 */

import { execFileSync } from 'child_process';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface PfResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// CLI call wrapper
// ---------------------------------------------------------------------------

/**
 * Resolve the pf binary path.
 * Checks PF_BIN env → ~/.local/bin/pf → bare 'pf' on PATH.
 */
function resolvePfBinary(): string {
  if (process.env.PF_BIN) return process.env.PF_BIN;
  return 'pf';
}

/**
 * Call a pf CLI command and parse JSON output.
 * Returns {success, data?, error?} — never throws.
 */
export function callPf<T = unknown>(args: string[], projectDir?: string): PfResult<T> {
  try {
    const pfBin = resolvePfBinary();
    const output = execFileSync(pfBin, args, {
      cwd: projectDir || process.cwd(),
      encoding: 'utf8',
      timeout: 15_000,
    });
    return { success: true, data: JSON.parse(output) as T };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Call a pf CLI command and return raw text output.
 */
export function callPfRaw(args: string[], projectDir?: string): PfResult<string> {
  try {
    const pfBin = resolvePfBinary();
    const output = execFileSync(pfBin, args, {
      cwd: projectDir || process.cwd(),
      encoding: 'utf8',
      timeout: 15_000,
    });
    return { success: true, data: output };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Cache with TTL and FSWatcher invalidation
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL = 30_000; // 30s safety fallback

export class PfCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private ttl: number;

  constructor(ttl = DEFAULT_TTL) {
    this.ttl = ttl;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, { data, timestamp: Date.now() });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(pattern)) {
        this.store.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shared string utilities (deduplicated from pennyfarthing.ts + theme-agents.ts)
// ---------------------------------------------------------------------------

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function oceanSuffix(ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
}

export function generateSlug(shortName: string, ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${toSlug(shortName)}-${oceanSuffix(ocean)}`;
}
