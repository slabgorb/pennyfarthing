import { Router } from 'express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { detectPennyfarthingProject, loadThemeConfig, loadThemeYaml } from '../pennyfarthing.js';

export interface AgentCharacterMap {
  [role: string]: {
    character: string;
    shortName?: string;
  };
}

export function getThemeAgents(projectDir: string): AgentCharacterMap {
  if (!detectPennyfarthingProject(projectDir)) {
    return {};
  }
  const config = loadThemeConfig(projectDir) as Record<string, unknown> | null;
  const themeName = (config as { theme?: string } | null)?.theme;
  if (!themeName) return {};

  const themeData = loadThemeYaml(projectDir, themeName) as Record<string, unknown> | null;
  if (!themeData) return {};

  const agents = (themeData as { agents?: Record<string, { character?: string; shortName?: string }> }).agents;
  if (!agents) return {};

  const result: AgentCharacterMap = {};
  for (const [role, data] of Object.entries(agents)) {
    result[role] = {
      character: data?.character || role,
      shortName: data?.shortName,
    };
  }
  return result;
}

export function createThemeAgentsRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const projectDir = getProjectDir();
    const agents = getThemeAgents(projectDir);
    res.json({ agents });
  });

  return router;
}
