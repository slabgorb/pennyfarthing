/**
 * MSSCI-12192: Portrait Loading with Caching
 *
 * BDD-style tests for portrait caching using VS Code globalStorage.
 * Tests are written to FAIL until Dev implements the PortraitCacheService.
 *
 * Acceptance Criteria:
 * - AC1: Cache bundled portraits to VS Code globalStorage for faster subsequent loads
 * - AC2: Return cached portrait path if cache hit, bundled path if cache miss
 * - AC3: Support all 102+ themes with proper cache isolation per theme
 * - AC4: Provide cache invalidation/clear capability
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock VS Code API
const mockGlobalStorageUri = {
  fsPath: '/mock/global-storage',
  scheme: 'file',
};

const mockContext = {
  subscriptions: [] as { dispose: () => void }[],
  globalStorageUri: mockGlobalStorageUri,
  extensionUri: { fsPath: '/mock/extension/path' },
  extensionPath: '/mock/extension/path',
};

const mockVscode = {
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
    joinPath: vi.fn((base: any, ...segments: string[]) => ({
      fsPath: [base.fsPath, ...segments].join('/'),
      scheme: 'file',
    })),
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      stat: vi.fn(),
      createDirectory: vi.fn(),
      delete: vi.fn(),
    },
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  FileType: {
    File: 1,
    Directory: 2,
  },
};

vi.mock('vscode', () => mockVscode);

// Mock fs for bundled portrait checks
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import * as fs from 'fs';

describe('MSSCI-12192: Portrait Loading with Caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as any).mockReset();
    (fs.readdirSync as any).mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  // ========================================================================
  // AC1: Cache bundled portraits to VS Code globalStorage
  // ========================================================================
  describe('AC1: Cache bundled portraits to globalStorage', () => {
    it('should have services/portrait-cache.ts file', async () => {
      const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
      const { join } = await vi.importActual<typeof import('path')>('path');
      const cachePath = join(__dirname, '..', 'src', 'services', 'portrait-cache.ts');
      expect(existsSync(cachePath)).toBe(true);
    });

    it('should export PortraitCacheService class', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      expect(cacheModule.PortraitCacheService).toBeDefined();
    });

    it('should accept ExtensionContext in constructor', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(service).toBeDefined();
    });

    it('should have getCachePath method', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.getCachePath).toBe('function');
    });

    it('should return cache path in globalStorage/portraits/{theme}', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const cachePath = service.getCachePath('discworld', 'carrot');
      expect(cachePath).toContain('global-storage');
      expect(cachePath).toContain('portraits');
      expect(cachePath).toContain('discworld');
      expect(cachePath).toContain('carrot');
      expect(cachePath).toMatch(/\.png$/);
    });

    it('should have getBundledPortraitPath method', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.getBundledPortraitPath).toBe('function');
    });

    it('should return bundled path with ocean score pattern', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png', 'death-55231.png']);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const path = service.getBundledPortraitPath('discworld', 'carrot');
      expect(path).toContain('resources/portraits/discworld');
      expect(path).toContain('carrot-');
      expect(path).toMatch(/\.png$/);
    });

    it('should copy bundled portrait to cache on first access', async () => {
      // Mock cache miss
      mockVscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));

      // Mock bundled portrait exists
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png']);
      (fs.readFileSync as any).mockReturnValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      // Mock successful cache write
      mockVscode.workspace.fs.writeFile.mockResolvedValue(undefined);
      mockVscode.workspace.fs.createDirectory.mockResolvedValue(undefined);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      await service.getPortrait('discworld', 'carrot');

      expect(mockVscode.workspace.fs.writeFile).toHaveBeenCalled();
    });

    it('should create cache directory structure if not exists', async () => {
      mockVscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));
      mockVscode.workspace.fs.createDirectory.mockResolvedValue(undefined);
      mockVscode.workspace.fs.writeFile.mockResolvedValue(undefined);

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png']);
      (fs.readFileSync as any).mockReturnValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      await service.getPortrait('discworld', 'carrot');

      expect(mockVscode.workspace.fs.createDirectory).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // AC2: Return cached portrait path if cache hit, bundled path if cache miss
  // ========================================================================
  describe('AC2: Cache hit returns cached path, miss returns bundled', () => {
    it('should have getPortrait method that returns PortraitResult', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.getPortrait).toBe('function');
    });

    it('should return cached path and source="cached" on cache hit', async () => {
      // Mock cache hit
      mockVscode.workspace.fs.stat.mockResolvedValue({ type: 1, mtime: Date.now() });

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const result = await service.getPortrait('discworld', 'carrot');

      expect(result.source).toBe('cached');
      expect(result.path).toContain('global-storage');
    });

    it('should NOT read bundled portrait on cache hit', async () => {
      mockVscode.workspace.fs.stat.mockResolvedValue({ type: 1, mtime: Date.now() });

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      await service.getPortrait('discworld', 'carrot');

      // Should not read bundled file when cached
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return bundled path and source="bundled" on cache miss', async () => {
      // Mock cache miss
      mockVscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));

      // Mock bundled portrait exists
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png']);
      (fs.readFileSync as any).mockReturnValue(Buffer.from([0x89]));
      mockVscode.workspace.fs.writeFile.mockResolvedValue(undefined);
      mockVscode.workspace.fs.createDirectory.mockResolvedValue(undefined);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const result = await service.getPortrait('discworld', 'carrot');

      // First access populates cache, returns bundled source
      expect(result.source).toBe('bundled');
      expect(result.path).toBeDefined();
    });

    it('should have isCached method', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.isCached).toBe('function');
    });

    it('should return true from isCached when portrait is cached', async () => {
      mockVscode.workspace.fs.stat.mockResolvedValue({ type: 1, mtime: Date.now() });

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const cached = await service.isCached('discworld', 'carrot');
      expect(cached).toBe(true);
    });

    it('should return false from isCached when portrait is not cached', async () => {
      mockVscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const cached = await service.isCached('discworld', 'carrot');
      expect(cached).toBe(false);
    });

    it('should return null path and source="none" when bundled not found', async () => {
      mockVscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));
      (fs.existsSync as any).mockReturnValue(false);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const result = await service.getPortrait('nonexistent-theme', 'unknown');

      expect(result.path).toBeNull();
      expect(result.source).toBe('none');
    });

    it('should have hasBundledPortrait method', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.hasBundledPortrait).toBe('function');
    });

    it('should return true from hasBundledPortrait when exists', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png']);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const exists = service.hasBundledPortrait('discworld', 'carrot');
      expect(exists).toBe(true);
    });

    it('should return false from hasBundledPortrait when not exists', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['death-55231.png']); // No carrot

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const exists = service.hasBundledPortrait('discworld', 'carrot');
      expect(exists).toBe(false);
    });
  });

  // ========================================================================
  // AC3: Support all 102+ themes with proper cache isolation
  // ========================================================================
  describe('AC3: Support all 102+ themes with cache isolation', () => {
    it('should isolate cache by theme directory', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const discworldPath = service.getCachePath('discworld', 'carrot');
      const greekPath = service.getCachePath('greek-mythology', 'hermes');

      expect(discworldPath).toContain('discworld');
      expect(greekPath).toContain('greek-mythology');
      expect(discworldPath).not.toBe(greekPath);
    });

    it('should handle themes with hyphens', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const path = service.getCachePath('avatar-the-last-airbender', 'aang');
      expect(path).toContain('avatar-the-last-airbender');
    });

    it('should handle all standard agent shortNames', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir.includes('discworld')) {
          return [
            'carrot-25551.png',
            'igor-35251.png',
            'ponder-55233.png',
            'granny-35211.png',
            'leonard-53241.png',
            'havelock-55221.png',
            'sacharissa-45432.png',
            'adora-45322.png',
            'lu-tze-55231.png',
            'death-55231.png',
          ];
        }
        return [];
      });

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const shortNames = [
        'carrot',
        'igor',
        'ponder',
        'granny',
        'leonard',
        'havelock',
        'sacharissa',
        'adora',
        'lu-tze',
        'death',
      ];

      for (const shortName of shortNames) {
        const exists = service.hasBundledPortrait('discworld', shortName);
        expect(exists).toBe(true);
      }
    });

    it('should validate theme name to prevent path traversal', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      expect(() => service.validateTheme('../etc')).toThrow();
      expect(() => service.validateTheme('theme/../other')).toThrow();
      expect(() => service.validateTheme('/absolute/path')).toThrow();
    });

    it('should validate agent name to prevent path traversal', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      expect(() => service.validateAgent('../etc')).toThrow();
      expect(() => service.validateAgent('agent/../other')).toThrow();
    });

    it('should accept valid theme names', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      expect(() => service.validateTheme('discworld')).not.toThrow();
      expect(() => service.validateTheme('greek-mythology')).not.toThrow();
      expect(() => service.validateTheme('avatar-the-last-airbender')).not.toThrow();
      expect(() => service.validateTheme('1984')).not.toThrow();
    });

    it('should accept valid agent names', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      expect(() => service.validateAgent('carrot')).not.toThrow();
      expect(() => service.validateAgent('lu-tze')).not.toThrow();
      expect(() => service.validateAgent('death')).not.toThrow();
    });
  });

  // ========================================================================
  // AC4: Provide cache invalidation/clear capability
  // ========================================================================
  describe('AC4: Cache invalidation and clearing', () => {
    it('should have clearCache method', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.clearCache).toBe('function');
    });

    it('should clear all cached portraits when clearCache called', async () => {
      mockVscode.workspace.fs.delete.mockResolvedValue(undefined);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      await service.clearCache();

      expect(mockVscode.workspace.fs.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringContaining('portraits'),
        }),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should have clearThemeCache method for single theme', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.clearThemeCache).toBe('function');
    });

    it('should clear only specified theme when clearThemeCache called', async () => {
      mockVscode.workspace.fs.delete.mockResolvedValue(undefined);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      await service.clearThemeCache('discworld');

      expect(mockVscode.workspace.fs.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringContaining('discworld'),
        }),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should have invalidatePortrait method for single portrait', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.invalidatePortrait).toBe('function');
    });

    it('should delete single portrait when invalidatePortrait called', async () => {
      mockVscode.workspace.fs.delete.mockResolvedValue(undefined);

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      await service.invalidatePortrait('discworld', 'carrot');

      expect(mockVscode.workspace.fs.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringMatching(/discworld.*carrot.*\.png$/),
        })
      );
    });

    it('should not throw if cache directory does not exist on clear', async () => {
      mockVscode.workspace.fs.delete.mockRejectedValue(new Error('Directory not found'));

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      await expect(service.clearCache()).resolves.not.toThrow();
    });

    it('should have getCacheStats method', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.getCacheStats).toBe('function');
    });

    it('should return cache statistics', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const stats = await service.getCacheStats();

      expect(stats).toHaveProperty('totalCached');
      expect(stats).toHaveProperty('themes');
      expect(typeof stats.totalCached).toBe('number');
    });
  });

  // ========================================================================
  // Integration with AgentPortraitWebviewProvider
  // ========================================================================
  describe('Integration with AgentPortraitWebviewProvider', () => {
    it('should have setPortraitCacheService method on provider', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.setPortraitCacheService).toBe('function');
    });

    it('should have getPortraitCacheService method on provider', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.getPortraitCacheService).toBe('function');
    });

    it('should use cache service when available', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const cacheModule = await import('../src/services/portrait-cache');

      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const cacheService = new cacheModule.PortraitCacheService(mockContext as any);

      provider.setPortraitCacheService(cacheService);

      const retrievedService = provider.getPortraitCacheService();
      expect(retrievedService).toBe(cacheService);
    });

    it('should have loadPortraitAsync method', async () => {
      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      expect(typeof provider.loadPortraitAsync).toBe('function');
    });

    it('should call cache service getPortrait when loadPortraitAsync invoked', async () => {
      mockVscode.workspace.fs.stat.mockResolvedValue({ type: 1, mtime: Date.now() });

      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const cacheModule = await import('../src/services/portrait-cache');

      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );
      const cacheService = new cacheModule.PortraitCacheService(mockContext as any);

      const getPortraitSpy = vi.spyOn(cacheService, 'getPortrait');
      provider.setPortraitCacheService(cacheService);

      await provider.loadPortraitAsync('discworld', 'carrot');

      expect(getPortraitSpy).toHaveBeenCalledWith('discworld', 'carrot');
    });

    it('should fallback to sync getPortraitPath when no cache service', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png']);

      const webviewModule = await import('../src/providers/agent-portrait-webview');
      const provider = new webviewModule.AgentPortraitWebviewProvider(
        mockContext.extensionUri as any
      );

      // No cache service set - should use existing sync method
      const path = provider.getPortraitPath('discworld', 'carrot');
      expect(path).toContain('resources/portraits');
    });
  });

  // ========================================================================
  // Error handling
  // ========================================================================
  describe('Error handling', () => {
    it('should handle cache write failures gracefully', async () => {
      mockVscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));
      mockVscode.workspace.fs.writeFile.mockRejectedValue(new Error('Write failed'));
      mockVscode.workspace.fs.createDirectory.mockResolvedValue(undefined);

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png']);
      (fs.readFileSync as any).mockReturnValue(Buffer.from([0x89]));

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      // Should not throw, should return bundled path
      const result = await service.getPortrait('discworld', 'carrot');
      expect(result.path).toBeDefined();
      expect(result.source).toBe('bundled');
    });

    it('should handle bundled read failures gracefully', async () => {
      mockVscode.workspace.fs.stat.mockRejectedValue(new Error('File not found'));
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue(['carrot-25551.png']);
      (fs.readFileSync as any).mockImplementation(() => {
        throw new Error('Read failed');
      });

      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);

      const result = await service.getPortrait('discworld', 'carrot');
      expect(result.source).toBe('none');
    });

    it('should have dispose method for cleanup', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(typeof service.dispose).toBe('function');
    });

    it('should not throw on dispose', async () => {
      const cacheModule = await import('../src/services/portrait-cache');
      const service = new cacheModule.PortraitCacheService(mockContext as any);
      expect(() => service.dispose()).not.toThrow();
    });
  });
});
