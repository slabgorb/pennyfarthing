/**
 * PersonaHeader Component
 *
 * Displays the current agent persona with portrait, character name, theme, role.
 * Story MSSCI-12700 - PersonaHeader Component
 * Story 72-3 - Catchphrase and Badge Improvements
 *
 * Features:
 * - Portrait image display with adjacent role badge
 * - Character name display with prominent styling
 * - Random catchphrase from theme
 * - Color-coded role badge matching CLI statusbar
 * - Real-time updates via IPC subscriptions
 * - Graceful handling of missing data
 * - Accessible with ARIA labels
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePersona } from '../hooks/usePersona';
import { useColorScheme } from '../hooks/useColorScheme';
import { AgentPopup } from './AgentPopup';
import TandemPortrait from './TandemPortrait';

// Agent colors matching CLI statusbar (statusline.sh)
const AGENT_COLORS: Record<string, string> = {
  pm: '#a78bfa',           // Purple - strategic
  sm: '#60a5fa',           // Blue - coordination
  dev: '#4ade80',          // Green - building
  tea: '#2dd4bf',          // Teal - testing
  reviewer: '#f87171',     // Red - critical eye
  architect: '#fb923c',    // Orange - design
  devops: '#22d3ee',       // Cyan - infrastructure
  'ux-designer': '#f0abfc', // Pink - design
  'tech-writer': '#e5e5e5', // White/light gray - documentation
  orchestrator: '#e879f9', // Magenta - coordination
  ba: '#a3e635',           // Lime - discovery
};

// Abbreviated role names for compact badge display
const AGENT_ABBREV: Record<string, string> = {
  pm: 'PM',
  sm: 'SM',
  dev: 'DEV',
  tea: 'TEA',
  reviewer: 'REV',
  architect: 'ARC',
  devops: 'OPS',
  'ux-designer': 'UX',
  'tech-writer': 'TW',
  orchestrator: 'ORC',
  ba: 'BA',
};

// Convert kebab-case theme name to Title Case (e.g., "princess-bride" -> "Princess Bride")
function humanizeTheme(theme: string): string {
  return theme
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function PersonaHeader(): React.ReactElement {
  const { persona, isStreaming } = usePersona();
  const colorScheme = useColorScheme();
  const [portraitError, setPortraitError] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const character = persona?.character || 'Agent';
  const theme = persona?.theme || 'default';
  const role = persona?.role || 'agent';
  const slug = persona?.slug;
  const quote = persona?.quote;
  const tandemAgent = persona?.tandemAgent;

  // Observation pulse: one-shot animation on primary portrait when backseat starts thinking
  const [observationPulse, setObservationPulse] = useState(false);
  const prevThinkingRef = useRef(false);
  const portraitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wasThinking = prevThinkingRef.current;
    const isThinking = tandemAgent?.isThinking ?? false;
    prevThinkingRef.current = isThinking;

    if (!wasThinking && isThinking) {
      setObservationPulse(true);
    }
  }, [tandemAgent?.isThinking]);

  const handlePulseEnd = useCallback(() => {
    setObservationPulse(false);
  }, []);

  const handleOpenPopup = useCallback(() => {
    setIsPopupOpen(true);
  }, []);

  const handleClosePopup = useCallback(() => {
    setIsPopupOpen(false);
  }, []);

  // Get role color, fallback to magenta
  const roleColor = AGENT_COLORS[role] || '#e879f9';

  // Don't render if no persona data
  if (!persona?.character) {
    return <div className="persona-header empty" data-testid="persona-header" />;
  }

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div
          className={`persona-header clickable${isCompact ? ' compact' : ''}`}
          data-testid="persona-header"
          role="button"
          tabIndex={0}
          aria-label="Current agent persona - click to view team"
          aria-live="polite"
          onClick={handleOpenPopup}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenPopup()}
        >
          <div className="persona-portrait-group">
            <div
              className={`persona-portrait${isStreaming ? ' avatar-thinking' : ''}${observationPulse ? ' avatar-observation-pulse' : ''}`}
              data-testid="persona-portrait"
              ref={portraitRef}
              onAnimationEnd={handlePulseEnd}
            >
              {slug && theme && !portraitError ? (
                <img
                  src={`/portraits/${theme}/medium/${slug}.png`}
                  alt={character}
                  className="portrait-image"
                  onError={() => setPortraitError(true)}
                />
              ) : (
                <span className="portrait-fallback">🤖</span>
              )}
            </div>
            {tandemAgent && (
              <TandemPortrait
                character={tandemAgent.character}
                role={tandemAgent.role}
                slug={tandemAgent.slug}
                theme={tandemAgent.theme}
                isActive={true}
                isThinking={tandemAgent.isThinking}
              />
            )}
            {tandemAgent && (
              <span className="visually-hidden" role="status" aria-live="polite" data-testid="tandem-sr-status">
                {tandemAgent.isThinking
                  ? `${tandemAgent.character} is thinking`
                  : `${tandemAgent.character} observing`}
              </span>
            )}
          </div>
          <div className="persona-info">
            <div className="persona-name-row">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="default"
                    className="persona-role"
                    data-testid="persona-role"
                    style={{ backgroundColor: roleColor }}
                  >
                    {AGENT_ABBREV[role] || role}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{role}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="persona-character"
                    data-testid="persona-character"
                  >
                    {character}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{character}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="persona-theme"
                    data-testid="persona-theme"
                  >
                    {humanizeTheme(theme)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{`Theme: ${theme}`}</TooltipContent>
              </Tooltip>
            </div>
            {quote && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="persona-catchphrase"
                    data-testid="persona-catchphrase"
                  >
                    "{quote}"
                  </span>
                </TooltipTrigger>
                <TooltipContent>{quote}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <img
            src={colorScheme === 'dark' ? '/images/cyclist-dark.png' : '/images/cyclist-light.png'}
            alt="Cyclist"
            className="persona-branding"
          />
          <button
            className="persona-collapse-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setIsCompact(!isCompact);
            }}
            aria-label={isCompact ? 'Expand header' : 'Collapse header'}
          >
            {isCompact ? '▼' : '▲'}
          </button>
        </div>
      </TooltipProvider>

      <AgentPopup
        isOpen={isPopupOpen}
        onClose={handleClosePopup}
        currentRole={role}
        currentTheme={theme}
      />
    </>
  );
}
