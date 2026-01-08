/**
 * Story 15-2: Pennyfarthing Metadata Module Tests
 *
 * These tests verify the acceptance criteria for the Pennyfarthing metadata module.
 * Written to FAIL initially (RED phase) - Dev will make them GREEN.
 *
 * Acceptance Criteria:
 * - AC1: Detects Pennyfarthing project (.claude/ exists)
 * - AC2: Reads .claude/persona-config.yaml for theme name
 * - AC3: Loads theme YAML and parses agent data
 * - AC4: Watches .session/agents/* for changes
 * - AC5: GET /api/persona returns {character, role, quote, ocean}
 * - AC6: WebSocket /ws/persona broadcasts on agent change
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, watch, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Mock fs module for isolation
vi.mock('fs');

// Import will fail until pennyfarthing.ts exists - that's expected (RED phase)
import {
  detectPennyfarthingProject,
  loadThemeConfig,
  loadThemeYaml,
  getCurrentAgent,
  getCurrentPersona,
  watchAgentChanges,
  type Persona
} from '../src/pennyfarthing.js';

describe('Story 15-2: Pennyfarthing Metadata Module', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC1: Detects Pennyfarthing project (.claude/ exists)', () => {

    it('should return true when .claude directory exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = detectPennyfarthingProject('/path/to/project');

      expect(existsSync).toHaveBeenCalledWith('/path/to/project/.claude');
      expect(result).toBe(true);
    });

    it('should return false when .claude directory does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = detectPennyfarthingProject('/path/to/project');

      expect(result).toBe(false);
    });

    it('should handle empty project path gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = detectPennyfarthingProject('');

      expect(result).toBe(false);
    });

  });

  describe('AC2: Reads .claude/persona-config.yaml for theme name', () => {

    it('should read theme from persona-config.yaml', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('persona-config.yaml');
      });
      vi.mocked(readFileSync).mockReturnValue('theme: enlightenment-thinkers\n');

      const result = loadThemeConfig('/path/to/project');

      expect(result).toEqual({ theme: 'enlightenment-thinkers' });
    });

    it('should prefer persona-config.local.yaml over persona-config.yaml', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('persona-config');
      });
      vi.mocked(readFileSync).mockReturnValue('theme: shakespeare\n');

      const result = loadThemeConfig('/path/to/project');

      // Should check local first
      expect(existsSync).toHaveBeenCalledWith(
        expect.stringContaining('persona-config.local.yaml')
      );
      expect(result).toEqual({ theme: 'shakespeare' });
    });

    it('should return null when config file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = loadThemeConfig('/path/to/project');

      expect(result).toBeNull();
    });

    it('should return null for malformed YAML', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid: yaml: content: [');

      const result = loadThemeConfig('/path/to/project');

      expect(result).toBeNull();
    });

  });

  describe('AC3: Loads theme YAML and parses agent data', () => {

    const mockThemeYaml = `
theme:
  name: enlightenment-thinkers
  user_title: Citizen
agents:
  sm:
    character: Benjamin Franklin
    role: The American who charmed France
    style: Polymath who leads through practical wisdom
    quote: An investment in knowledge pays the best interest.
    ocean:
      O: 4
      C: 4
      E: 5
      A: 4
      N: 2
  tea:
    character: David Hume
    role: The philosopher who found the self
    style: Skeptic who tests by questioning everything
    quote: Reason is, and ought only to be the slave of the passions.
    ocean:
      O: 5
      C: 3
      E: 3
      A: 3
      N: 4
`;

    it('should parse theme YAML and return agent map', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockThemeYaml);

      const result = loadThemeYaml('/path/to/theme.yaml');

      expect(result).toBeDefined();
      expect(result?.sm).toBeDefined();
      expect(result?.sm.character).toBe('Benjamin Franklin');
      expect(result?.tea).toBeDefined();
      expect(result?.tea.character).toBe('David Hume');
    });

    it('should include OCEAN personality scores', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockThemeYaml);

      const result = loadThemeYaml('/path/to/theme.yaml');

      expect(result?.sm.ocean).toEqual({ O: 4, C: 4, E: 5, A: 4, N: 2 });
      expect(result?.tea.ocean).toEqual({ O: 5, C: 3, E: 3, A: 3, N: 4 });
    });

    it('should return null when theme file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = loadThemeYaml('/path/to/nonexistent.yaml');

      expect(result).toBeNull();
    });

    it('should return null for malformed theme YAML', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not: valid: yaml: [');

      const result = loadThemeYaml('/path/to/bad.yaml');

      expect(result).toBeNull();
    });

  });

  describe('AC4: Watches .session/agents/* for changes', () => {

    it('should get current agent from session-specific file when sessionId provided', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('sm');

      const result = getCurrentAgent('/path/to/project', 'abc-123-def');

      expect(readFileSync).toHaveBeenCalledWith(
        '/path/to/project/.session/agents/abc-123-def',
        'utf-8'
      );
      expect(result).toBe('sm');
    });

    it('should get current agent from most recent file when no sessionId', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue(['file1', 'file2', 'file3'] as any);
      vi.mocked(statSync).mockImplementation((path) => {
        const filename = String(path).split('/').pop();
        return {
          mtimeMs: filename === 'file2' ? 3000 : filename === 'file3' ? 2000 : 1000
        } as any;
      });
      vi.mocked(readFileSync).mockReturnValue('dev');

      const result = getCurrentAgent('/path/to/project');

      // Should read the most recently modified file (file2)
      expect(readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('file2'),
        'utf-8'
      );
      expect(result).toBe('dev');
    });

    it('should return null when agents directory does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getCurrentAgent('/path/to/project');

      expect(result).toBeNull();
    });

    it('should return null when agents directory is empty', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = getCurrentAgent('/path/to/project');

      expect(result).toBeNull();
    });

    it('should set up file watcher for session-specific file', () => {
      const mockWatcher = { close: vi.fn() };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(watch).mockReturnValue(mockWatcher as any);
      const callback = vi.fn();

      const cleanup = watchAgentChanges('/path/to/project', 'session-123', callback);

      expect(watch).toHaveBeenCalledWith(
        '/path/to/project/.session/agents/session-123',
        expect.any(Function)
      );
      expect(typeof cleanup).toBe('function');

      // Cleanup should close the watcher
      cleanup();
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should set up file watcher for entire agents directory when no sessionId', () => {
      const mockWatcher = { close: vi.fn() };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(watch).mockReturnValue(mockWatcher as any);
      const callback = vi.fn();

      watchAgentChanges('/path/to/project', undefined, callback);

      expect(watch).toHaveBeenCalledWith(
        '/path/to/project/.session/agents',
        expect.objectContaining({ recursive: true }),
        expect.any(Function)
      );
    });

    it('should invoke callback when agent file changes', () => {
      const mockWatcher = { close: vi.fn() };
      let watchCallback: Function = () => {};
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(watch).mockImplementation((path, options, cb) => {
        watchCallback = typeof options === 'function' ? options : cb!;
        return mockWatcher as any;
      });
      vi.mocked(readFileSync).mockReturnValue('tea');
      const callback = vi.fn();

      watchAgentChanges('/path/to/project', 'session-123', callback);

      // Simulate file change
      watchCallback('change', 'session-123');

      expect(callback).toHaveBeenCalledWith('tea');
    });

  });

  describe('AC5 & AC6: getCurrentPersona returns full persona data', () => {

    const mockThemeYaml = `
agents:
  sm:
    character: Benjamin Franklin
    role: Scrum Master
    style: Polymath who leads through practical wisdom
    quote: An investment in knowledge pays the best interest.
    ocean:
      O: 4
      C: 4
      E: 5
      A: 4
      N: 2
`;

    it('should return complete persona for current agent', () => {
      // Mock: project exists, config exists, theme exists, agent file exists
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('persona-config')) {
          return 'theme: enlightenment-thinkers\n';
        }
        if (pathStr.includes('.yaml') && !pathStr.includes('persona-config')) {
          return mockThemeYaml;
        }
        // Agent file
        return 'sm';
      });

      const result = getCurrentPersona('/path/to/project', 'session-123');

      // Verify core persona fields
      expect(result?.character).toBe('Benjamin Franklin');
      expect(result?.displayName).toBe('Benjamin');  // Algorithm returns shortest unique name
      expect(result?.role).toBe('sm');  // Agent role
      expect(result?.roleDescription).toBe('Scrum Master');  // Character's role from theme
      expect(result?.style).toBe('Polymath who leads through practical wisdom');
      expect(result?.theme).toBe('enlightenment-thinkers');
      expect(result?.quote).toBe('An investment in knowledge pays the best interest.');
      expect(result?.ocean).toEqual({ O: 4, C: 4, E: 5, A: 4, N: 2 });
      // Slug is generated from shortName and OCEAN scores
      expect(result?.slug).toBeDefined();
    });

    it('should return null when project is not a Pennyfarthing project', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getCurrentPersona('/path/to/regular-project');

      expect(result).toBeNull();
    });

    it('should return null when no active agent', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        // .claude exists but agents dir is empty
        return !String(path).includes('agents');
      });
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = getCurrentPersona('/path/to/project');

      expect(result).toBeNull();
    });

    it('should return null when agent role not found in theme', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path) => {
        const pathStr = String(path);
        if (pathStr.includes('persona-config')) {
          return 'theme: enlightenment-thinkers\n';
        }
        if (pathStr.includes('.yaml') && !pathStr.includes('persona-config')) {
          return mockThemeYaml;
        }
        // Agent file with unknown role
        return 'unknown-agent';
      });

      const result = getCurrentPersona('/path/to/project', 'session-123');

      expect(result).toBeNull();
    });

  });

});
