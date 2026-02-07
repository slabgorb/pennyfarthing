import { Router } from 'express';
import { getPrimeContextJson } from '../prime.js';
import type { PrimeOutput } from '../prime.js';

const PRIMARY_AGENTS = [
  'sm', 'tea', 'dev', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator',
] as const;

const CACHE_TTL_MS = 60_000;

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

  return router;
}
