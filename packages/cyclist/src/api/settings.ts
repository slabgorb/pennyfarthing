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
import { getCurrentSettings, saveUserSettings, type CyclistSettings, type PartialSettings, type SettingsInput } from '../settings.js';
import { getProjectDirectory } from '../paths.js';

// =============================================================================
// Theme Response Type
// =============================================================================

/**
 * Extended settings response that includes theme and handoff_mode from config.local.yaml
 * These are NOT part of CyclistSettings - stored ONLY in .pennyfarthing/config.local.yaml
 */
export interface SettingsResponse extends Omit<CyclistSettings, 'workflow'> {
  workflow: CyclistSettings['workflow'] & {
    handoff_mode?: string;
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
 * Create the settings router
 */
export function createSettingsRouter(): Router {
  const router = Router();

  /**
   * GET / - Get current settings
   * AC4: Returns consistent error format
   * Theme and handoff_mode are read from .pennyfarthing/config.local.yaml (single source of truth)
   */
  router.get('/', (_req, res) => {
    try {
      const settings = getCurrentSettings();

      // Read theme and handoff_mode from config.local.yaml (single source of truth)
      let theme = 'alice-in-wonderland'; // Default fallback
      let handoffMode = 'manual'; // Default fallback
      const projectDir = getProjectDirectory();
      if (projectDir) {
        try {
          const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
          if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const parsed = parse(content) as { theme?: string; workflow?: { handoff_mode?: string } };
            if (parsed?.theme) {
              theme = parsed.theme;
            }
            if (parsed?.workflow?.handoff_mode) {
              handoffMode = parsed.workflow.handoff_mode;
            }
          }
        } catch {
          // Ignore project config errors - use defaults
        }
      }

      // Construct response with theme and handoff_mode added
      const response: SettingsResponse = {
        ...settings,
        workflow: {
          ...settings.workflow,
          handoff_mode: handoffMode,
        },
        pennyfarthing: { theme },
      };

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

      // Validate permission_mode enum
      if (partialSettings.workflow?.permission_mode !== undefined) {
        const mode = partialSettings.workflow.permission_mode;
        const validModes = ['plan', 'manual', 'accept', 'turbo'];
        if (!validModes.includes(mode)) {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Permission mode must be "plan", "manual", "accept", or "turbo"'
          ));
        }
      }

      // Extract theme - it goes to config.local.yaml, not to CyclistSettings
      const theme = partialSettings.pennyfarthing?.theme;

      // Strip pennyfarthing from settings to save (we handle theme separately)
      const { pennyfarthing: _pf, ...settingsToSave } = partialSettings;

      // Save settings using the settings module
      const success = saveUserSettings(settingsToSave as Partial<CyclistSettings>);

      if (!success) {
        return res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to save settings to file'));
      }

      // Update theme in .pennyfarthing/config.local.yaml using read-modify-write
      // This preserves other settings (like handoff_mode) in the same file
      const projectDir = getProjectDirectory();
      let themeChanged = false;
      if (theme && projectDir) {
        try {
          const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');

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
      const projectDir = getProjectDirectory();
      if (!projectDir) {
        return res.json([]);
      }

      const themesDir = path.join(projectDir, 'pennyfarthing-dist', 'personas', 'themes');
      if (!fs.existsSync(themesDir)) {
        return res.json([]);
      }

      const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.yaml')).sort();
      const themes = files.map(f => {
        const id = f.replace('.yaml', '');
        const name = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        // Try to read tier from theme file
        let tier = 'U'; // Default to Unbenchmarked
        try {
          const themePath = path.join(themesDir, f);
          const content = fs.readFileSync(themePath, 'utf-8');
          const parsed = parse(content) as { tier?: string };
          if (parsed.tier && typeof parsed.tier === 'string') {
            tier = parsed.tier.toUpperCase();
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

  return router;
}
