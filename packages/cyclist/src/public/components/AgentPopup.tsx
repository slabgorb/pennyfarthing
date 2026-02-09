/**
 * AgentPopup Component
 *
 * Two-panel popup showing team roster and agent details.
 * Story MSSCI-12403: Team roster with hover preview
 *
 * Features:
 * - Left panel: Team roster with all agents in theme
 * - Right panel: Agent details (character, style, background, quirks)
 * - Hover to preview different agents
 * - Click to switch to different agent
 * - Portrait display with fallback
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useClaudeContext } from '../contexts/ClaudeContext';

// =============================================================================
// Types
// =============================================================================

interface EnhancedThemeAgent {
  role: string;
  character: string;
  shortName?: string;
  style: string;
  background: string;
  quirks: string[];
  slug: string;
  lift?: number;
  ocean?: { O: number; C: number; E: number; A: number; N: number };
}

interface EnhancedThemeData {
  theme: string;
  themeName: string;
  tier: 'S' | 'A' | 'B' | 'C' | null;
  agents: EnhancedThemeAgent[];
}

interface AgentPopupProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: string | null;
  currentTheme: string | null;
}

// Agent colors matching CLI statusbar
const AGENT_COLORS: Record<string, string> = {
  pm: '#a78bfa',
  sm: '#60a5fa',
  dev: '#4ade80',
  tea: '#2dd4bf',
  reviewer: '#f87171',
  architect: '#fb923c',
  devops: '#22d3ee',
  'ux-designer': '#f0abfc',
  'tech-writer': '#e5e5e5',
  orchestrator: '#e879f9',
};

// =============================================================================
// Component
// =============================================================================

export function AgentPopup({ isOpen, onClose, currentRole, currentTheme }: AgentPopupProps): React.ReactElement | null {
  const [themeData, setThemeData] = useState<EnhancedThemeData | null>(null);
  const [previewedAgent, setPreviewedAgent] = useState<EnhancedThemeAgent | null>(null);
  const [loading, setLoading] = useState(false);
  const [portraitError, setPortraitError] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const { send } = useClaudeContext();

  // Fetch theme data when popup opens
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    fetch('/api/theme-agents/full')
      .then(res => res.ok ? res.json() : null)
      .then((data: EnhancedThemeData | null) => {
        setThemeData(data);
        setPreviewedAgent(null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isOpen]);

  // Reset portrait error when agent changes
  useEffect(() => {
    setPortraitError(false);
  }, [previewedAgent]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle hover preview with debounce
  const handleMouseEnter = useCallback((agent: EnhancedThemeAgent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setPreviewedAgent(agent);
    }, 100);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setPreviewedAgent(null);
    }, 200);
  }, []);

  // Handle agent click - switch to agent
  const handleAgentClick = useCallback((agent: EnhancedThemeAgent) => {
    if (agent.role === currentRole) return;

    // Send slash command to switch agent
    const command = `/${agent.role}`;
    send(command);
    onClose();
  }, [currentRole, send, onClose]);

  if (!isOpen) return null;

  // Determine which agent to display in details panel
  const displayAgent = previewedAgent || themeData?.agents.find(a => a.role === currentRole) || themeData?.agents[0];

  return (
    <>
      {/* Backdrop */}
      <div
        className="agent-popup-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popup */}
      <div
        className="agent-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-popup-title"
      >
        {loading ? (
          <div className="agent-popup-loading p-4 space-y-3">
            <Skeleton className="h-6 w-40" />
            <Separator />
            <div className="flex gap-4">
              <div className="space-y-2 flex-shrink-0" style={{ width: 160 }}>
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
              <div className="space-y-3 flex-1">
                <Skeleton className="h-24 w-24 rounded-full mx-auto" />
                <Skeleton className="h-5 w-32 mx-auto" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ) : !themeData ? (
          <div className="agent-popup-error">Failed to load theme data</div>
        ) : (
          <>
            {/* Header */}
            <div className="agent-popup-header">
              <h2 id="agent-popup-title" className="agent-popup-theme">
                {themeData.themeName}
                <Badge variant="secondary" className={`tier-badge ${themeData.tier ? `tier-${themeData.tier.toLowerCase()}` : 'tier-unranked'}`}>
                  {themeData.tier || 'Unranked'}
                </Badge>
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="agent-popup-close"
                onClick={onClose}
                aria-label="Close popup"
              >
                ×
              </Button>
            </div>

            <Separator className="my-1" />

            {/* Two-panel content */}
            <div className="agent-popup-content">
              {/* Left: Team Roster */}
              <div className="agent-popup-roster">
                <h3 className="roster-title">Team</h3>
                <ul className="roster-list" role="listbox">
                  {themeData.agents.map(agent => {
                    const isCurrent = agent.role === currentRole;
                    const isPreviewing = previewedAgent?.role === agent.role;
                    const roleColor = AGENT_COLORS[agent.role] || '#888';

                    return (
                      <li
                        key={agent.role}
                        className={`roster-item ${isCurrent ? 'current' : ''} ${isPreviewing ? 'previewing' : ''}`}
                        role="option"
                        aria-selected={isCurrent}
                        onMouseEnter={() => handleMouseEnter(agent)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleAgentClick(agent)}
                      >
                        <span className="roster-character">{agent.character}</span>
                        <span
                          className="roster-role"
                          style={{ backgroundColor: roleColor }}
                        >
                          {agent.role}
                        </span>
                        {isCurrent && <span className="roster-current-marker">●</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Right: Agent Details */}
              <div className="agent-popup-details" data-testid="agent-popup-details">
                {displayAgent && (
                  <>
                    {/* Portrait */}
                    <div className="popup-portrait" data-testid="popup-portrait">
                      {!portraitError && currentTheme ? (
                        <img
                          src={`/portraits/${currentTheme}/large/${displayAgent.slug}.png`}
                          alt={displayAgent.character}
                          onError={() => setPortraitError(true)}
                        />
                      ) : (
                        <div className="portrait-placeholder">🤖</div>
                      )}
                    </div>

                    {/* Character Name */}
                    <h3 className="popup-character">{displayAgent.character}</h3>

                    {/* Role Mapping */}
                    <div className="popup-role-mapping">
                      <Badge
                        variant="default"
                        className="role-badge"
                        style={{ backgroundColor: AGENT_COLORS[displayAgent.role] || '#888' }}
                      >
                        {displayAgent.role}
                      </Badge>
                      → {displayAgent.character}
                    </div>

                    {/* Details */}
                    <div className="popup-detail" data-testid="popup-detail-style">
                      <label>Style:</label>
                      <span>{displayAgent.style || '—'}</span>
                    </div>

                    <div className="popup-detail" data-testid="popup-detail-background">
                      <label>Background:</label>
                      <span>{displayAgent.background || '—'}</span>
                    </div>

                    {displayAgent.quirks.length > 0 && (
                      <div className="popup-detail" data-testid="popup-detail-quirks">
                        <label>Quirks:</label>
                        <span>{displayAgent.quirks.join(', ')}</span>
                      </div>
                    )}

                    {displayAgent.lift !== undefined && (
                      <div className="popup-detail">
                        <label>Lift:</label>
                        <span className={`lift-value ${displayAgent.lift >= 0 ? 'positive' : 'negative'}`}>
                          {displayAgent.lift >= 0 ? '+' : ''}{displayAgent.lift.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default AgentPopup;
