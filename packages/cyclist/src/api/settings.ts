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
import { getCurrentSettings, saveUserSettings, type CyclistSettings } from '../settings.js';
import { getProjectDirectory } from '../paths.js';

/**
 * Create the settings router
 */
export function createSettingsRouter(): Router {
  const router = Router();

  /**
   * GET / - Get current settings
   */
  router.get('/', (_req, res) => {
    try {
      const settings = getCurrentSettings();
      res.json(settings);
    } catch (error) {
      console.error('[Settings API] Failed to get settings:', error);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  /**
   * PATCH / - Update partial settings
   * Accepts a partial settings object and merges with current settings
   */
  router.patch('/', async (req, res) => {
    try {
      const partialSettings = req.body as Partial<CyclistSettings>;

      if (!partialSettings || typeof partialSettings !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object' });
      }

      // Save settings using the settings module
      const success = saveUserSettings(partialSettings);

      if (!success) {
        return res.status(500).json({ error: 'Failed to save settings' });
      }

      // Dual-write theme to persona-config.local.yaml for Pennyfarthing compatibility (24-2)
      const projectDir = getProjectDirectory();
      if (partialSettings.pennyfarthing?.theme && projectDir) {
        try {
          const personaConfigPath = path.join(projectDir, '.claude', 'persona-config.local.yaml');
          fs.writeFileSync(personaConfigPath, `theme: "${partialSettings.pennyfarthing.theme}"\n`, 'utf-8');
        } catch (err) {
          console.error('[Settings API] Failed to write persona-config.local.yaml:', err);
        }
      }

      res.json(getCurrentSettings());
    } catch (error) {
      console.error('[Settings API] Failed to save settings:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  /**
   * GET /themes - Get available themes metadata
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
      const themes = files.map(f => ({
        id: f.replace('.yaml', ''),
        name: f.replace('.yaml', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      }));

      res.json(themes);
    } catch (error) {
      console.error('[Settings API] Failed to load themes:', error);
      res.status(500).json({ error: 'Failed to load themes' });
    }
  });

  return router;
}
