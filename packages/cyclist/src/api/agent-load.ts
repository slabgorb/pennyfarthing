import { Router } from 'express';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { getPrimeContextJson } from '../prime.js';
import type { PrimeOutput } from '../prime.js';

const PRIMARY_AGENTS = [
  'sm', 'tea', 'dev', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator',
] as const;

const VALID_SIDECAR_FILES = ['patterns.md', 'gotchas.md', 'decisions.md'] as const;

const CACHE_TTL_MS = 60_000;

const UPPERCASE_SEGMENTS = new Set(['ux']);

function formatAgentName(agent: string): string {
  return agent.split('-').map((part) =>
    UPPERCASE_SEGMENTS.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1),
  ).join('-');
}

interface AgentLoadEntry {
  agent: string;
  totalTokens: number | null;
  tokenCounts?: Record<string, number>;
  components?: Array<{ name: string; tokens: number; source?: string | null }>;
  error?: string;
}

interface AgentLoadResponse {
  agents: AgentLoadEntry[];
  cachedAt: string;
  totalAcrossAllAgents: number;
}

export function createAgentLoadRouter(getProjectDir: () => string): Router {
  const router = Router();

  let cache: AgentLoadResponse | null = null;
  let cachedAtMs = 0;

  router.get('/', async (_req, res) => {
    const now = Date.now();

    // Return cached if within TTL
    if (cache && (now - cachedAtMs) < CACHE_TTL_MS) {
      res.json(cache);
      return;
    }

    const projectDir = getProjectDir();

    // Run all agents in parallel
    const results = await Promise.all(
      PRIMARY_AGENTS.map(async (agent): Promise<AgentLoadEntry> => {
        try {
          const output: PrimeOutput | null = getPrimeContextJson(agent, projectDir, 'FULL');

          if (!output) {
            return {
              agent,
              totalTokens: null,
              error: `Failed to load context for agent "${agent}"`,
            };
          }

          // Strip context field — never expose full prompt text
          const { context: _context, ...safe } = output;

          return {
            agent,
            totalTokens: safe.totalTokens ?? 0,
            tokenCounts: safe.tokenCounts,
            components: safe.components,
          };
        } catch (err) {
          return {
            agent,
            totalTokens: null,
            error: err instanceof Error ? err.message : `Unknown error for agent "${agent}"`,
          };
        }
      }),
    );

    // Check if ALL agents failed
    const allFailed = results.every((r) => r.totalTokens === null);
    if (allFailed) {
      res.status(500).json({
        error: 'Failed to load agent context',
        details: 'All agents returned null',
      });
      return;
    }

    const totalAcrossAllAgents = results.reduce(
      (sum, r) => sum + (r.totalTokens ?? 0),
      0,
    );

    const response: AgentLoadResponse = {
      agents: results,
      cachedAt: new Date(now).toISOString(),
      totalAcrossAllAgents,
    };

    // Store in cache
    cache = response;
    cachedAtMs = now;

    res.json(response);
  });

  router.post('/prune-sidecar', async (req, res) => {
    const { agent, file } = req.body as { agent?: string; file?: string };

    // Validate input
    if (!agent || !PRIMARY_AGENTS.includes(agent as typeof PRIMARY_AGENTS[number])) {
      res.status(400).json({
        success: false,
        error: `Invalid agent. Must be one of: ${PRIMARY_AGENTS.join(', ')}`,
      });
      return;
    }

    if (!file || !VALID_SIDECAR_FILES.includes(file as typeof VALID_SIDECAR_FILES[number])) {
      res.status(400).json({
        success: false,
        error: `Invalid sidecar file. Must be one of: ${VALID_SIDECAR_FILES.join(', ')}`,
      });
      return;
    }

    const projectDir = getProjectDir();
    const sidecarPath = join(projectDir, '.pennyfarthing', 'sidecars', agent, file);

    // Check sidecar exists
    if (!fs.existsSync(sidecarPath)) {
      res.status(404).json({
        success: false,
        error: `Sidecar file not found: .pennyfarthing/sidecars/${agent}/${file}`,
      });
      return;
    }

    // Read current sidecar content
    const oldContent = fs.readFileSync(sidecarPath, 'utf-8');

    // Read template and substitute agent name
    const templatePath = join(projectDir, 'pennyfarthing-dist', 'templates', 'sidecar', `${file}.template`);
    const template = fs.readFileSync(templatePath, 'utf-8');
    const agentName = formatAgentName(agent);
    const newContent = template.replace(/\$\{AGENT_NAME\}/g, agentName);

    // Write pruned content
    fs.writeFileSync(sidecarPath, newContent, 'utf-8');

    // Invalidate GET cache
    cache = null;
    cachedAtMs = 0;

    const tokensFreed = Math.floor((oldContent.length - newContent.length) / 4);

    res.json({
      success: true,
      tokensFreed,
      agent,
      file,
    });
  });

  return router;
}
