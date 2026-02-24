/**
 * Settings API Router
 * Provides HTTP API endpoints for settings management.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { parse, stringify } from 'yaml';
import { getCurrentSettings, saveUserSettings, type CyclistSettings, type SettingsInput } from '../settings.js';
import { getProjectDirectory } from '../paths.js';
import { loadAllThemeMetadata } from '@pennyfarthing/shared';

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
      if (config?.display) {
        response.display = config.display;
      }
      if (config?.workflow) {
        response.workflow = { ...response.workflow as object, ...config.workflow };
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

  // Layout persistence (Cyclist full app)
  router.get('/layout', (_req, res) => {
    try {
      const projectDir = getProjectDirectory() || process.cwd();
      const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
      if (fs.existsSync(configPath)) {
        const config = parse(fs.readFileSync(configPath, 'utf-8')) || {};
        return res.json({ layout: config.layout || null });
      }
      res.json({ layout: null });
    } catch {
      res.json({ layout: null });
    }
  });

  router.patch('/layout', (req, res) => {
    try {
      const projectDir = getProjectDirectory() || process.cwd();
      const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
      let config: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        config = (parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>) || {};
      }
      config.layout = req.body;
      fs.writeFileSync(configPath, stringify(config), 'utf-8');
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to save layout' });
    }
  });

  // Layout persistence (BikeRack standalone)
  router.get('/bikerack-layout', (_req, res) => {
    try {
      const projectDir = getProjectDirectory() || process.cwd();
      const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
      if (fs.existsSync(configPath)) {
        const config = parse(fs.readFileSync(configPath, 'utf-8')) || {};
        return res.json({ layout: config.bikerack_layout || null });
      }
      res.json({ layout: null });
    } catch {
      res.json({ layout: null });
    }
  });

  router.patch('/bikerack-layout', (req, res) => {
    try {
      const projectDir = getProjectDirectory() || process.cwd();
      const configPath = path.join(projectDir, '.pennyfarthing', 'config.local.yaml');
      let config: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        config = (parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>) || {};
      }
      config.bikerack_layout = req.body;
      fs.writeFileSync(configPath, stringify(config), 'utf-8');
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to save layout' });
    }
  });

  router.get('/themes', (_req, res) => {
    try {
      const projectDir = getProjectDirectory() || process.cwd();
      const themes = loadAllThemeMetadata(projectDir);
      res.json({ themes });
    } catch (err) {
      console.error('Failed to load themes:', err);
      res.json({ themes: [] });
    }
  });

  return router;
}
