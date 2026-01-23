/**
 * MSSCI-12192: Portrait Loading with Caching
 *
 * Service for caching bundled portraits to VS Code globalStorage
 * for faster subsequent loads. Provides cache management and
 * invalidation capabilities.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Result of a portrait retrieval operation
 */
export interface PortraitResult {
  /** Path to the portrait file, or null if not found */
  path: string | null;
  /** Source of the portrait: 'cached', 'bundled', or 'none' */
  source: 'cached' | 'bundled' | 'none';
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of cached portraits */
  totalCached: number;
  /** List of themes with cached portraits */
  themes: string[];
}

/**
 * PortraitCacheService - Caches bundled portraits to VS Code globalStorage
 */
export class PortraitCacheService {
  private readonly _context: vscode.ExtensionContext;
  private readonly _cacheBaseDir: string;
  private readonly _bundledBaseDir: string;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this._cacheBaseDir = path.join(context.globalStorageUri.fsPath, 'portraits');
    this._bundledBaseDir = path.join(context.extensionUri.fsPath, 'resources', 'portraits');
  }

  /**
   * Get the cache path for a portrait
   */
  public getCachePath(theme: string, agent: string): string {
    this.validateTheme(theme);
    this.validateAgent(agent);
    return path.join(this._cacheBaseDir, theme, `${agent}.png`);
  }

  /**
   * Get the bundled portrait path for a theme and agent
   */
  public getBundledPortraitPath(theme: string, agent: string): string | null {
    this.validateTheme(theme);
    this.validateAgent(agent);

    const themeDir = path.join(this._bundledBaseDir, theme);

    try {
      if (!fs.existsSync(themeDir)) {
        return null;
      }

      const files = fs.readdirSync(themeDir);
      const matchingFile = files.find((f) =>
        f.toLowerCase().startsWith(agent.toLowerCase() + '-')
      );

      if (matchingFile) {
        return path.join(this._bundledBaseDir, theme, matchingFile);
      }
    } catch {
      // Directory read error
    }

    return null;
  }

  /**
   * Check if a bundled portrait exists
   */
  public hasBundledPortrait(theme: string, agent: string): boolean {
    return this.getBundledPortraitPath(theme, agent) !== null;
  }

  /**
   * Check if a portrait is cached
   */
  public async isCached(theme: string, agent: string): Promise<boolean> {
    const cachePath = this.getCachePath(theme, agent);
    const cacheUri = vscode.Uri.file(cachePath);

    try {
      await vscode.workspace.fs.stat(cacheUri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a portrait, using cache if available, otherwise copying from bundled
   */
  public async getPortrait(theme: string, agent: string): Promise<PortraitResult> {
    this.validateTheme(theme);
    this.validateAgent(agent);

    const cachePath = this.getCachePath(theme, agent);
    const cacheUri = vscode.Uri.file(cachePath);

    // Check cache first
    try {
      await vscode.workspace.fs.stat(cacheUri);
      return { path: cachePath, source: 'cached' };
    } catch {
      // Cache miss - continue to bundled
    }

    // Get bundled path
    const bundledPath = this.getBundledPortraitPath(theme, agent);
    if (!bundledPath) {
      return { path: null, source: 'none' };
    }

    // Try to read bundled and cache it
    try {
      const bundledData = fs.readFileSync(bundledPath);

      // Create cache directory
      const cacheDir = path.dirname(cachePath);
      const cacheDirUri = vscode.Uri.file(cacheDir);

      try {
        await vscode.workspace.fs.createDirectory(cacheDirUri);
      } catch {
        // Directory may already exist
      }

      // Write to cache
      try {
        await vscode.workspace.fs.writeFile(cacheUri, bundledData);
      } catch {
        // Cache write failed - return bundled path anyway
        this.log('Cache write failed, using bundled as fallback');
      }

      return { path: bundledPath, source: 'bundled' };
    } catch {
      // Bundled read failed
      return { path: null, source: 'none' };
    }
  }

  /**
   * Clear all cached portraits
   */
  public async clearCache(): Promise<void> {
    const cacheUri = vscode.Uri.file(this._cacheBaseDir);

    try {
      await vscode.workspace.fs.delete(cacheUri, { recursive: true });
    } catch {
      // Cache directory may not exist
    }
  }

  /**
   * Clear cached portraits for a specific theme
   */
  public async clearThemeCache(theme: string): Promise<void> {
    this.validateTheme(theme);
    const themeCacheDir = path.join(this._cacheBaseDir, theme);
    const themeCacheUri = vscode.Uri.file(themeCacheDir);

    try {
      await vscode.workspace.fs.delete(themeCacheUri, { recursive: true });
    } catch {
      // Theme cache directory may not exist
    }
  }

  /**
   * Invalidate a single cached portrait
   */
  public async invalidatePortrait(theme: string, agent: string): Promise<void> {
    const cachePath = this.getCachePath(theme, agent);
    const cacheUri = vscode.Uri.file(cachePath);

    try {
      await vscode.workspace.fs.delete(cacheUri);
    } catch {
      // File may not exist
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<CacheStats> {
    const stats: CacheStats = {
      totalCached: 0,
      themes: [],
    };

    try {
      if (!fs.existsSync(this._cacheBaseDir)) {
        return stats;
      }

      const themes = fs.readdirSync(this._cacheBaseDir);
      stats.themes = themes;

      for (const theme of themes) {
        const themeDir = path.join(this._cacheBaseDir, theme);
        try {
          const themeStat = fs.statSync(themeDir);
          if (themeStat.isDirectory()) {
            const files = fs.readdirSync(themeDir);
            stats.totalCached += files.filter((f) => f.endsWith('.png')).length;
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    } catch {
      // Cache directory may not exist
    }

    return stats;
  }

  /**
   * Validate theme name to prevent path traversal
   */
  public validateTheme(theme: string): void {
    if (
      theme.includes('..') ||
      theme.includes('/') ||
      theme.startsWith('/')
    ) {
      throw new Error(`Invalid theme name: ${theme}`);
    }
  }

  /**
   * Validate agent name to prevent path traversal
   */
  public validateAgent(agent: string): void {
    if (agent.includes('..') || agent.includes('/')) {
      throw new Error(`Invalid agent name: ${agent}`);
    }
  }

  /**
   * Log a message (for debugging)
   */
  private log(message: string): void {
    // Could be extended to use output channel
    console.log(`[PortraitCache] ${message}`);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    // No resources to dispose currently
  }
}
