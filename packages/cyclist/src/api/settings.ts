/**
 * Settings API Router (Story 35-1)
 *
 * Provides HTTP API endpoints for settings management:
 * - GET /api/settings - Get current settings
 * - PATCH /api/settings - Update partial settings
 * - GET /api/settings/themes - Get available themes metadata
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { parse, stringify } from 'yaml';
import { getCurrentSettings, saveUserSettings, type CyclistSettings, type SettingsInput } from '../settings.js';
import { getProjectDirectory } from '../paths.js';
import { setBellMode } from '../bell-mode.js';
import { isOtelDebugEnabled } from '../otlp-receiver.js';

// =============================================================================
// Theme Response Type
// =============================================================================

/**
 * Extended settings response that includes theme and handoff_mode from config.local.yaml
 * These are NOT part of CyclistSettings - stored ONLY in .pennyfarthing/config.local.yaml
 *
 * Note: relay_mode is part of CyclistSettings.workflow since MSSCI-12395
 */
export interface SettingsResponse extends Omit<CyclistSettings, 'workflow'> {
  workflow: CyclistSettings['workflow'] & {
    handoff_mode?: string;
    bell_mode?: boolean;
    relay_mode?: boolean;
  };
  pennyfarthing?: {
    theme: string;
  };
}

// =============================================================================
// Error Response Types (AC4)
// =============================================================================

/**
 * Error codes for settings API responses
 */
export type ErrorCode = 'VALIDATION_ERROR' | 'FILE_ERROR' | 'PERMISSION_ERROR' | 'UNKNOWN_ERROR';

/**
 * Error response structure for consistent API error handling
 * AC4: Consistent error handling with user feedback
 */
export interface ErrorResponse {
  error: boolean;
  code: ErrorCode;
  message: string;
}

/**
 * Create a consistent error response object
 * AC4: Helper for consistent error formatting
 */
export function createErrorResponse(code: ErrorCode, message: string): ErrorResponse {
  return {
    error: true,
    code,
    message,
  };
}

/**
 * Get settings for WebSocket broadcast
 * Used by websocket.ts for /ws/settings endpoint
 */
export async function getSettingsForWebSocket(projectDir: string | null): Promise<Record<string, unknown>> {
  const settings = getCurrentSettings();

  // Read config.local.yaml as single source of truth
  let theme = 'alice-in-wonderland';
  let handoffMode = 'manual';
  let bellMode = false;
  let display: Record<string, unknown> | undefined;
  let notifications: Record<string, unknown> | undefined;

  if (projectDir) {
    try {
      const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = parse(content) as Record<string, unknown>;
        if (parsed?.theme && typeof parsed.theme === 'string') {
          theme = parsed.theme;
        }
        const workflow = parsed?.workflow as Record<string, unknown> | undefined;
        if (workflow?.handoff_mode) {
          handoffMode = workflow.handoff_mode as string;
        }
        if (workflow?.bell_mode !== undefined) {
          bellMode = workflow.bell_mode as boolean;
        }
        if (parsed?.display && typeof parsed.display === 'object') {
          display = parsed.display as Record<string, unknown>;
        }
        if (parsed?.notifications && typeof parsed.notifications === 'object') {
          notifications = parsed.notifications as Record<string, unknown>;
        }
      }
    } catch {
      // Ignore project config errors - use defaults
    }
  }

  const response: Record<string, unknown> = {
    ...settings,
    workflow: {
      ...settings.workflow,
      handoff_mode: handoffMode,
      bell_mode: bellMode,
    },
    pennyfarthing: { theme },
  };
  if (display) response.display = display;
  if (notifications) response.notifications = notifications;

  return response;
}

/**
 * Create the settings router
 */
export function createSettingsRouter(): Router {
  const router = Router();

  /**
   * GET / - Get current settings
   * AC4: Returns consistent error format
   * Theme, handoff_mode, and bell_mode are all read from .pennyfarthing/config.local.yaml (single source of truth)
   */
  router.get('/', async (_req, res) => {
    try {
      const settings = getCurrentSettings();

      // Read config.local.yaml as single source of truth for all project settings
      let theme = 'alice-in-wonderland';
      let handoffMode = 'manual';
      let bellMode = false;
      let display: Record<string, unknown> | undefined;
      let notifications: Record<string, unknown> | undefined;
      const projectDir = getProjectDirectory();
      if (projectDir) {
        try {
          const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
          if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const parsed = parse(content) as Record<string, unknown>;
            if (parsed?.theme && typeof parsed.theme === 'string') {
              theme = parsed.theme;
            }
            const workflow = parsed?.workflow as Record<string, unknown> | undefined;
            if (workflow?.handoff_mode) {
              handoffMode = workflow.handoff_mode as string;
            }
            if (workflow?.bell_mode !== undefined) {
              bellMode = workflow.bell_mode as boolean;
            }
            if (parsed?.display && typeof parsed.display === 'object') {
              display = parsed.display as Record<string, unknown>;
            }
            if (parsed?.notifications && typeof parsed.notifications === 'object') {
              notifications = parsed.notifications as Record<string, unknown>;
            }
          }
        } catch {
          // Ignore project config errors - use defaults
        }
      }

      // Construct response with all persisted settings
      const response: Record<string, unknown> = {
        ...settings,
        workflow: {
          ...settings.workflow,
          handoff_mode: handoffMode,
          bell_mode: bellMode,
        },
        pennyfarthing: { theme },
      };
      if (display) response.display = display;
      if (notifications) response.notifications = notifications;

      res.json(response);
    } catch (error) {
      console.error('[Settings API] Failed to get settings:', error);
      res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to load settings'));
    }
  });

  /**
   * PATCH / - Update partial settings
   * Accepts a partial settings object and merges with current settings
   * AC4: Returns consistent error format with user-friendly messages
   */
  router.patch('/', async (req, res) => {
    try {
      const partialSettings = req.body as SettingsInput;

      if (!partialSettings || typeof partialSettings !== 'object') {
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid settings object'));
      }

      // Validate theme is non-empty and matches slug pattern (prevent YAML injection)
      if (partialSettings.pennyfarthing?.theme !== undefined) {
        const theme = partialSettings.pennyfarthing.theme;
        if (theme === '') {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Theme must be a non-empty string'
          ));
        }
        // Theme ID must be alphanumeric with hyphens only (slug format)
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(theme)) {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Theme must be a valid slug (lowercase alphanumeric with hyphens)'
          ));
        }
      }

      // Validate permission_mode enum (turbo removed in MSSCI-12395)
      if (partialSettings.workflow?.permission_mode !== undefined) {
        const mode = partialSettings.workflow.permission_mode;
        const validModes = ['plan', 'manual', 'accept'];
        if (!validModes.includes(mode)) {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Permission mode must be "plan", "manual", or "accept". Use relay_mode for auto-handoff.'
          ));
        }
      }

      // Validate relay_mode is boolean if present (MSSCI-12395)
      if (partialSettings.workflow?.relay_mode !== undefined) {
        const relayMode = partialSettings.workflow.relay_mode;
        if (typeof relayMode !== 'boolean') {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Relay mode must be a boolean (true or false)'
          ));
        }
      }

      // Handle bell_mode toggle (MSSCI-12275) - stored in separate file
      const bellModeValue = (partialSettings.workflow as Record<string, unknown>)?.bell_mode;
      if (bellModeValue !== undefined) {
        if (typeof bellModeValue !== 'boolean') {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Bell mode must be a boolean'
          ));
        }
        await setBellMode(bellModeValue);
      }

      // Extract theme - it goes to config.local.yaml, not to CyclistSettings
      const theme = partialSettings.pennyfarthing?.theme;

      // Strip pennyfarthing and bell_mode from settings to save (handled separately)
      const { pennyfarthing: _pf, ...rest } = partialSettings;
      const settingsToSave = { ...rest };
      if (settingsToSave.workflow) {
        const { bell_mode: _bm, ...workflowRest } = settingsToSave.workflow as Record<string, unknown>;
        settingsToSave.workflow = workflowRest as typeof settingsToSave.workflow;
      }

      // Get project directory FIRST - needed for both settings save and theme update
      const projectDir = getProjectDirectory();

      // Save settings using the settings module (pass projectDir to avoid cwd fallback)
      const success = saveUserSettings(settingsToSave as Partial<CyclistSettings>, projectDir || undefined);

      if (!success) {
        return res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to save settings to file'));
      }

      // Update theme in .pennyfarthing/config.local.yaml using read-modify-write
      // This preserves other settings (like handoff_mode) in the same file
      let themeChanged = false;
      if (theme && projectDir) {
        try {
          const pennyfarthingDir = path.join(projectDir, '.pennyfarthing');
          const configPath = path.join(pennyfarthingDir, 'config.local.yaml');

          // Create .pennyfarthing directory if it doesn't exist
          if (!fs.existsSync(pennyfarthingDir)) {
            fs.mkdirSync(pennyfarthingDir, { recursive: true });
          }

          // Read existing config to preserve other settings
          let existingConfig: Record<string, unknown> = {};
          if (fs.existsSync(configPath)) {
            const existingContent = fs.readFileSync(configPath, 'utf-8');
            const parsed = parse(existingContent);
            if (parsed && typeof parsed === 'object') {
              existingConfig = parsed as Record<string, unknown>;
            }
          }

          // Update only the theme, preserving everything else
          existingConfig.theme = theme;

          // Write back with theme first for consistent ordering
          const { theme: themeValue, ...rest } = existingConfig;
          const ordered = { theme: themeValue, ...rest };
          fs.writeFileSync(configPath, stringify(ordered), 'utf-8');
          themeChanged = true;

          // Touch the agent session file to trigger watchAgentChanges
          // This broadcasts the new persona to the Cyclist UI
          const sessionId = process.env.CYCLIST_SESSION_ID;
          if (sessionId) {
            const agentFile = path.join(projectDir, '.session', 'agents', sessionId);
            if (fs.existsSync(agentFile)) {
              const now = new Date();
              fs.utimesSync(agentFile, now, now);
            }
          }
        } catch (err) {
          console.error('[Settings API] Failed to write .pennyfarthing/config.local.yaml:', err);
        }
      }

      // Return settings with theme_changed flag so frontend can prompt refresh
      const responseSettings = getCurrentSettings();
      res.json({ ...responseSettings, _themeChanged: themeChanged });
    } catch (error) {
      console.error('[Settings API] Failed to save settings:', error);
      res.status(500).json(createErrorResponse('UNKNOWN_ERROR', 'Failed to save settings'));
    }
  });

  /**
   * GET /themes - Get available themes metadata
   * Story 35-8: Returns id, name, and tier for each theme
   */
  router.get('/themes', async (_req, res) => {
    try {
      // Find themes directory - check bundled resources first, then project dir
      let themesDir: string | null = null;

      // 1. Packaged Electron app: Contents/Resources/pennyfarthing-dist/personas/themes
      if (process.resourcesPath) {
        const bundledThemes = path.join(process.resourcesPath, 'pennyfarthing-dist', 'personas', 'themes');
        if (fs.existsSync(bundledThemes)) {
          themesDir = bundledThemes;
        }
      }

      // 2. Runtime via symlinks: .pennyfarthing/personas/themes (orchestrator pattern)
      if (!themesDir) {
        const projectDir = getProjectDirectory();
        if (projectDir) {
          const runtimeThemes = path.join(projectDir, '.pennyfarthing', 'personas', 'themes');
          if (fs.existsSync(runtimeThemes)) {
            themesDir = runtimeThemes;
          }
        }
      }

      // 3. Monorepo/dev: project dir pennyfarthing-dist
      if (!themesDir) {
        const projectDir = getProjectDirectory();
        if (projectDir) {
          const projectThemes = path.join(projectDir, 'pennyfarthing-dist', 'personas', 'themes');
          if (fs.existsSync(projectThemes)) {
            themesDir = projectThemes;
          }
        }
      }

      if (isOtelDebugEnabled()) {
        console.log('[Themes API] Final themesDir:', themesDir);
      }

      if (!themesDir) {
        return res.json([]);
      }

      const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.yaml')).sort();
      if (isOtelDebugEnabled()) {
        console.log('[Themes API] Found', files.length, 'theme files');
      }
      const themes = files.map(f => {
        const id = f.replace('.yaml', '');
        const name = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        // Try to read tier from theme file (nested under theme.tier)
        let tier = ''; // Empty when no tier data (displayed as "Unranked" in UI)
        try {
          const themePath = path.join(themesDir, f);
          const content = fs.readFileSync(themePath, 'utf-8');
          const parsed = parse(content) as { theme?: { tier?: string } };
          if (parsed.theme?.tier && typeof parsed.theme.tier === 'string') {
            tier = parsed.theme.tier.toUpperCase();
          }
        } catch {
          // Ignore parse errors, use default tier
        }

        return { id, name, tier };
      });

      res.json(themes);
    } catch (error) {
      console.error('[Settings API] Failed to load themes:', error);
      res.status(500).json({ error: 'Failed to load themes' });
    }
  });

  /**
   * GET /collapsed - Get collapsed section states from config.local.yaml
   * Returns { persona: boolean, git: boolean, ... }
   */
  router.get('/collapsed', (_req, res) => {
    try {
      const projectDir = getProjectDirectory();
      if (!projectDir) {
        return res.json({});
      }

      const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
      if (!fs.existsSync(configPath)) {
        return res.json({});
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = parse(content) as { display?: { collapsed_sections?: Record<string, boolean> } };
      res.json(parsed?.display?.collapsed_sections || {});
    } catch (error) {
      console.error('[Settings API] Failed to get collapsed sections:', error);
      res.json({});
    }
  });

  /**
   * PATCH /collapsed - Update collapsed section states in config.local.yaml
   * Body: { sectionId: boolean, ... }
   */
  router.patch('/collapsed', (req, res) => {
    try {
      const updates = req.body as Record<string, boolean>;
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid collapsed sections object'));
      }

      const projectDir = getProjectDirectory();
      if (!projectDir) {
        return res.status(500).json(createErrorResponse('FILE_ERROR', 'Project directory not found'));
      }

      const pennyfarthingDir = path.join(projectDir, '.pennyfarthing');
      const configPath = path.join(pennyfarthingDir, 'config.local.yaml');

      // Create .pennyfarthing directory if needed
      if (!fs.existsSync(pennyfarthingDir)) {
        fs.mkdirSync(pennyfarthingDir, { recursive: true });
      }

      // Read existing config
      let existingConfig: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = parse(content);
        if (parsed && typeof parsed === 'object') {
          existingConfig = parsed as Record<string, unknown>;
        }
      }

      // Merge collapsed sections into display
      const display = (existingConfig.display || {}) as Record<string, unknown>;
      const existingCollapsed = (display.collapsed_sections || {}) as Record<string, boolean>;
      display.collapsed_sections = { ...existingCollapsed, ...updates };
      existingConfig.display = display;

      // Write back
      fs.writeFileSync(configPath, stringify(existingConfig), 'utf-8');

      res.json(display.collapsed_sections);
    } catch (error) {
      console.error('[Settings API] Failed to save collapsed sections:', error);
      res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to save collapsed sections'));
    }
  });

  /**
   * GET /layout - Get layout from config.local.yaml
   * Returns { layout: { leftSidebar: {...}, rightSidebar: {...} } } or null
   */
  router.get('/layout', (_req, res) => {
    try {
      const projectDir = getProjectDirectory();
      if (!projectDir) {
        return res.json({ layout: null });
      }

      const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
      if (!fs.existsSync(configPath)) {
        return res.json({ layout: null });
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = parse(content) as { layout?: unknown };
      res.json({ layout: parsed?.layout || null });
    } catch (error) {
      console.error('[Settings API] Failed to get layout:', error);
      res.json({ layout: null });
    }
  });

  /**
   * PATCH /layout - Update layout in config.local.yaml
   * Body: { leftSidebar: {...}, rightSidebar: {...} }
   */
  router.patch('/layout', (req, res) => {
    try {
      const layout = req.body;
      if (!layout || typeof layout !== 'object') {
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid layout object'));
      }

      const projectDir = getProjectDirectory();
      if (!projectDir) {
        return res.status(500).json(createErrorResponse('FILE_ERROR', 'Project directory not found'));
      }

      const pennyfarthingDir = path.join(projectDir, '.pennyfarthing');
      const configPath = path.join(pennyfarthingDir, 'config.local.yaml');

      // Create .pennyfarthing directory if needed
      if (!fs.existsSync(pennyfarthingDir)) {
        fs.mkdirSync(pennyfarthingDir, { recursive: true });
      }

      // Read existing config
      let existingConfig: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = parse(content);
        if (parsed && typeof parsed === 'object') {
          existingConfig = parsed as Record<string, unknown>;
        }
      }

      // Update layout
      existingConfig.layout = layout;

      // Write back
      fs.writeFileSync(configPath, stringify(existingConfig), 'utf-8');

      res.json({ success: true, layout });
    } catch (error) {
      console.error('[Settings API] Failed to save layout:', error);
      res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to save layout'));
    }
  });

  return router;
}
