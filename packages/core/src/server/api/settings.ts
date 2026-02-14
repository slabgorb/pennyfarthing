/**
 * Settings API Router
 * Provides HTTP API endpoints for settings management.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';
import { getCurrentSettings, saveUserSettings, type CyclistSettings, type SettingsInput } from '../settings.js';
import { getProjectDirectory } from '../paths.js';

export interface SettingsResponse {
  [key: string]: unknown;
}

/**
 * Get full settings response including theme from config.local.yaml
 */
export async function getSettingsForWebSocket(projectDir: string): Promise<SettingsResponse> {
  const settings = getCurrentSettings();
  const response: SettingsResponse = { ...settings };

  // Read theme from config.local.yaml
  try {
    const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = parse(content);
      if (config?.theme) {
        response.theme = config.theme;
      }
    }
  } catch {
    // Ignore errors reading config
  }

  return response;
}

export function createSettingsRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const projectDir = getProjectDirectory() || process.cwd();
    getSettingsForWebSocket(projectDir).then(settings => {
      res.json(settings);
    }).catch(() => {
      res.json(getCurrentSettings());
    });
  });

  router.patch('/', (req, res) => {
    const input = req.body as SettingsInput;
    const projectDir = getProjectDirectory() || process.cwd();
    const success = saveUserSettings(input as Partial<CyclistSettings>, projectDir);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  router.get('/themes', (_req, res) => {
    res.json({ themes: [] });
  });

  return router;
}
