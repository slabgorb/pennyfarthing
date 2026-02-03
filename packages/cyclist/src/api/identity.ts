/**
 * Identity API - Get user identity information from CLI tools
 * MSSCI-12469: Stats strip redesign with identity context
 *
 * Returns Jira email and GitHub username from respective CLI configs.
 */

import { Router } from 'express';
import { execSync } from 'child_process';

export interface IdentityInfo {
  jiraEmail: string | null;
  githubUsername: string | null;
  avatarUrl: string | null;
}

/**
 * Get Jira email from jira CLI config
 * Runs: jira me --raw | grep email
 */
function getJiraEmail(): string | null {
  try {
    // jira me returns JSON with email field
    const output = execSync('jira me --raw 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const data = JSON.parse(output);
    return data.emailAddress || null;
  } catch {
    // jira CLI not configured or not installed
    return null;
  }
}

/**
 * Get GitHub username from gh CLI config
 * Runs: gh api user
 */
function getGithubUsername(): string | null {
  try {
    const output = execSync('gh api user 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const data = JSON.parse(output);
    return data.login || null;
  } catch {
    // gh CLI not configured or not installed
    return null;
  }
}

// Cache identity info (refresh every 5 minutes)
let cachedIdentity: IdentityInfo | null = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get identity info with caching
 */
function getIdentity(): IdentityInfo {
  const now = Date.now();
  if (cachedIdentity && now - lastFetch < CACHE_TTL) {
    return cachedIdentity;
  }

  const githubUsername = getGithubUsername();
  cachedIdentity = {
    jiraEmail: getJiraEmail(),
    githubUsername,
    avatarUrl: githubUsername ? `https://avatars.githubusercontent.com/${githubUsername}` : null,
  };
  lastFetch = now;

  return cachedIdentity;
}

/**
 * Create identity API router
 */
export function createIdentityRouter(): Router {
  const router = Router();

  // GET /api/identity - Get current user identity
  router.get('/', (_req, res) => {
    const identity = getIdentity();
    res.json(identity);
  });

  return router;
}
