/**
 * StatsStrip Component
 *
 * Displays context percentage, model badge, PWD, and identity info.
 * Story MSSCI-12699 - StatsStrip Component
 *
 * Features:
 * - Context percentage with color thresholds (safe < 70%, warning 70-85%, danger >= 85%)
 * - Model badge showing current model name
 * - PWD showing current working directory (folder name)
 * - Identity section showing Jira email and GitHub username
 * - Real-time updates via IPC subscriptions
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useStatsStrip } from '../hooks/useStatsStrip';

/**
 * Extract short model name from full model ID
 * e.g., 'claude-opus-4-5-20251101' -> 'opus'
 *       'claude-3-5-sonnet-20241022' -> 'sonnet'
 */
function formatModelName(model: string | null): string {
  if (!model) return '\u2014'; // em dash placeholder

  // Extract model family name
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes('opus')) return 'opus';
  if (lowerModel.includes('sonnet')) return 'sonnet';
  if (lowerModel.includes('haiku')) return 'haiku';

  // Fallback: return last segment before date
  const parts = model.split('-');
  if (parts.length >= 2) {
    // Find the part that's not a date (YYYYMMDD)
    for (let i = parts.length - 2; i >= 0; i--) {
      if (!/^\d{8}$/.test(parts[i])) {
        return parts[i];
      }
    }
  }

  return model;
}

/**
 * Determine context level class based on percentage
 */
function getContextLevel(percent: number): string {
  if (percent >= 85) return 'level-danger';
  if (percent >= 70) return 'level-warning';
  return 'level-safe';
}

/**
 * Extract folder name from full path
 */
function getFolderName(pwd: string): string {
  if (!pwd) return '';
  const parts = pwd.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || pwd;
}

export default function StatsStrip(): React.ReactElement {
  const { context, stats, projectInfo } = useStatsStrip();

  const percent = context?.percent ?? 0;
  const model = stats?.model ?? null;
  const pwd = projectInfo?.pwd ?? '';
  const jiraEmail = projectInfo?.jiraEmail ?? null;
  const githubUsername = projectInfo?.githubUsername ?? null;

  const contextLevel = getContextLevel(percent);
  const folderName = getFolderName(pwd);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="stats-strip" data-testid="stats-strip">
        {/* Left side: identity info */}
        <div className="stats-left" data-testid="stats-left">
          {/* PWD */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="stats-pwd"
                data-testid="stats-pwd"
                data-full-path={pwd}
              >
                {folderName}
              </span>
            </TooltipTrigger>
            <TooltipContent>{pwd}</TooltipContent>
          </Tooltip>

          {/* Jira email - only show if configured */}
          {jiraEmail && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="stats-jira-email"
                  data-testid="jira-email"
                >
                  {jiraEmail}
                </span>
              </TooltipTrigger>
              <TooltipContent>{`Jira: ${jiraEmail}`}</TooltipContent>
            </Tooltip>
          )}

          {/* GitHub user - only show if configured */}
          {githubUsername && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="stats-github-user"
                  data-testid="github-user"
                >
                  @{githubUsername}
                </span>
              </TooltipTrigger>
              <TooltipContent>{`GitHub: ${githubUsername}`}</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Right side: metrics */}
        <div className="stats-right" data-testid="stats-right">
          {/* Model badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="stats-model-badge"
                data-testid="model-badge"
              >
                {formatModelName(model)}
              </Badge>
            </TooltipTrigger>
            {model && <TooltipContent>{model}</TooltipContent>}
          </Tooltip>

          {/* Context meter */}
          <div
            className={`stats-context-meter ${contextLevel}`}
            data-testid="context-meter"
          >
            <span className="context-percent" data-testid="context-percent">
              {percent}%
            </span>
            <div
              className="context-fill"
              data-testid="context-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
