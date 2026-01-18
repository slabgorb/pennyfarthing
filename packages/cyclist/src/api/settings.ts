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
import { parse } from 'yaml';
import { getCurrentSettings, saveUserSettings, addToRecentThemes, type CyclistSettings } from '../settings.js';
import { getProjectDirectory } from '../paths.js';

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
   */
  router.get('/', (_req, res) => {
    try {
      const settings = getCurrentSettings();
      res.json(settings);
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
      const partialSettings = req.body as Partial<CyclistSettings>;

      if (!partialSettings || typeof partialSettings !== 'object') {
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid settings object'));
      }

      // AC4: Validate specific field constraints before saving
      if (partialSettings.display?.sidebar_width !== undefined) {
        const width = partialSettings.display.sidebar_width;
        if (typeof width !== 'number' || width < 200 || width > 500) {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Sidebar width must be between 200 and 500'
          ));
        }
      }

      // Validate font settings are non-empty if provided
      if (partialSettings.display?.font_ui !== undefined && partialSettings.display.font_ui === '') {
        return res.status(400).json(createErrorResponse(
          'VALIDATION_ERROR',
          'Font UI must be a non-empty string'
        ));
      }
      if (partialSettings.display?.font_mono !== undefined && partialSettings.display.font_mono === '') {
        return res.status(400).json(createErrorResponse(
          'VALIDATION_ERROR',
          'Font Mono must be a non-empty string'
        ));
      }

      // Validate theme is non-empty and matches slug pattern (35-8: prevent YAML injection)
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

      // Validate handoff_mode enum
      if (partialSettings.workflow?.handoff_mode !== undefined) {
        const mode = partialSettings.workflow.handoff_mode;
        if (mode !== 'auto' && mode !== 'manual') {
          return res.status(400).json(createErrorResponse(
            'VALIDATION_ERROR',
            'Handoff mode must be "auto" or "manual"'
          ));
        }
      }

      // Story 35-8: Track theme changes in recentThemes
      let settingsToSave = partialSettings;
      if (partialSettings.pennyfarthing?.theme) {
        const current = getCurrentSettings();
        const updated = addToRecentThemes(current, partialSettings.pennyfarthing.theme);
        settingsToSave = {
          ...partialSettings,
          pennyfarthing: {
            ...partialSettings.pennyfarthing,
            recentThemes: updated.pennyfarthing.recentThemes,
          },
        };
      }

      // Save settings using the settings module
      const success = saveUserSettings(settingsToSave);

      if (!success) {
        return res.status(500).json(createErrorResponse('FILE_ERROR', 'Failed to save settings to file'));
      }

      // Dual-write theme to .pennyfarthing/config.local.yaml for Pennyfarthing compatibility (24-2)
      const projectDir = getProjectDirectory();
      if (partialSettings.pennyfarthing?.theme && projectDir) {
        try {
          const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
          fs.writeFileSync(configPath, `theme: "${partialSettings.pennyfarthing.theme}"\n`, 'utf-8');
        } catch (err) {
          console.error('[Settings API] Failed to write .pennyfarthing/config.local.yaml:', err);
        }
      }

      res.json(getCurrentSettings());
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
