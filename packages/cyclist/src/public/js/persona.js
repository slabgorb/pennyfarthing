/**
 * Persona Module - Electron IPC client for persona updates
 * Story 17-4: Added popup profile view for full persona details
 * Story 35-8: Removed theme picker - theme changes now via SettingsPanel only
 * MSSCI-12403: Two-panel popup with team roster and hover preview
 */

/** Module-level storage for helper name (used by activity.js and MessageView.js) */
let currentHelperName = null;

/** Module-level storage for current persona data (for popup) */
let currentPersonaData = null;

/** MSSCI-12403: Full theme data including all agents for team roster */
let themeData = null;

/** MSSCI-12403: Hover preview timeout for debouncing */
let hoverTimeout = null;

/** MSSCI-12403: Currently previewed agent (null = showing current agent) */
let previewedAgent = null;

/**
 * Get the current helper name for subagent display
 * @returns {string|null} Helper name like "The Fellowship" or null if not available
 */
export function getHelperName() {
  return currentHelperName;
}

/**
 * Humanize a slug/kebab-case string
 * "lord-of-the-rings" -> "Lord of the Rings"
 * @param {string} str - The string to humanize
 * @returns {string} - Humanized string
 */
function humanize(str) {
  if (!str) return '';
  // Split on dashes, capitalize first letter of each word (except small words)
  const smallWords = ['of', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
  return str
    .split('-')
    .map((word, index) => {
      const lower = word.toLowerCase();
      // Always capitalize first word, otherwise check if it's a small word
      if (index === 0 || !smallWords.includes(lower)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return lower;
    })
    .join(' ');
}

/**
 * Update OCEAN scores display
 * @param {Object} ocean - OCEAN scores { O, C, E, A, N } with values 1-5
 */
function updateOceanScores(ocean) {
  const oceanContainer = document.getElementById('ocean-scores');
  if (!oceanContainer) return;

  const traits = ['O', 'C', 'E', 'A', 'N'];
  for (const trait of traits) {
    const row = oceanContainer.querySelector(`[data-trait="${trait}"]`);
    if (!row) continue;

    const value = ocean?.[trait] ?? 0;
    const valueEl = row.querySelector('.trait-value');

    if (valueEl) {
      valueEl.textContent = value > 0 ? value : '-';
    }
  }
}

/**
 * Update persona display in the UI
 * @param {Object} persona - Persona data from IPC
 */
export function updatePersona(persona) {
  if (!persona) return;

  // Store helper name for activity.js and MessageView.js
  currentHelperName = persona.helper?.name || null;

  // Store persona data for popup
  currentPersonaData = persona;

  const projectEl = document.getElementById('project-name');
  const themeEl = document.getElementById('theme-name');
  const nameEl = document.getElementById('character-name');
  const roleEl = document.getElementById('character-role');
  const benchmarkEl = document.getElementById('benchmark-score');
  const quoteEl = document.getElementById('character-quote');

  // Project name at top (repo folder name)
  if (projectEl && persona.projectName) {
    projectEl.textContent = persona.projectName;
    // Also update the document/tab title
    document.title = `${persona.projectName} - Cyclist`;
  }

  // Theme name centered below portrait, humanized
  if (themeEl && persona.theme) {
    themeEl.textContent = humanize(persona.theme);
  }

  if (nameEl) {
    // Use full character name
    nameEl.textContent = persona.character || '';
  }

  if (roleEl) {
    // Show the agent role (dev, sm, tea, etc.) - not the character's story role
    roleEl.textContent = (persona.role || '').toUpperCase();
  }

  // Update OCEAN scores
  if (persona.ocean) {
    updateOceanScores(persona.ocean);
  }

  // Update benchmark score if available
  if (benchmarkEl) {
    if (persona.benchmarkScore) {
      benchmarkEl.innerHTML = `Job Fair: <span class="score-value">${persona.benchmarkScore}</span>`;
    } else {
      benchmarkEl.textContent = '';
    }
  }

  // MSSCI-11821: Update character quote
  if (quoteEl) {
    quoteEl.textContent = persona.quote || '';
  }

  // Update portrait using the portrait module's function
  if (persona.slug && persona.theme && window.loadPortraitWithTheme) {
    window.loadPortraitWithTheme(persona.slug, persona.theme);
  }
}

/**
 * Initialize persona via Electron IPC
 */
async function initPersona() {
  // Check if Electron API is available
  if (!window.electronAPI?.persona) {
    console.warn('Electron persona API not available');
    return;
  }

  // Get initial persona
  try {
    const persona = await window.electronAPI.persona.get();
    if (persona) {
      updatePersona(persona);
    }
  } catch (err) {
    console.error('Failed to get initial persona:', err);
  }

  // Subscribe to persona updates from main process
  window.electronAPI.persona.onUpdate((_event, persona) => {
    updatePersona(persona);
  });

  console.log('Persona IPC connected');
}

/**
 * Fetch full persona details from API
 * @returns {Promise<Object|null>} Full persona data or null
 */
async function fetchFullPersonaDetails() {
  try {
    // Try IPC first (Electron)
    if (window.electronAPI?.persona?.getFullDetails) {
      return await window.electronAPI.persona.getFullDetails();
    }
    // Fallback to HTTP API (web mode)
    const response = await fetch('/api/persona/full');
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (err) {
    console.error('Failed to fetch full persona details:', err);
    return null;
  }
}

/**
 * MSSCI-12403: Fetch enhanced theme data for team roster
 * @returns {Promise<Object|null>} Theme data with all agents or null
 */
async function fetchThemeData() {
  try {
    const response = await fetch('/api/theme-agents/full');
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (err) {
    console.error('Failed to fetch theme data:', err);
    return null;
  }
}

/**
 * MSSCI-12403: Update popup display with agent data (current or previewed)
 * @param {Object} agent - Agent data to display
 * @param {Object} persona - Full persona data for current agent
 */
function updatePopupDisplay(agent, persona) {
  const popup = document.getElementById('persona-popup');
  if (!popup) return;

  const characterNameEl = popup.querySelector('[data-persona="character"]');
  const roleMappingEl = popup.querySelector('[data-persona="role-mapping"]');
  const styleEl = popup.querySelector('[data-persona="style"]');
  const backgroundEl = popup.querySelector('[data-persona="background"]');
  const quirksEl = popup.querySelector('[data-persona="quirks"]');
  const liftBadge = popup.querySelector('.lift-badge');

  // Update text content
  if (characterNameEl) characterNameEl.textContent = agent.character || '—';
  if (roleMappingEl) roleMappingEl.textContent = `${(agent.role || '').toUpperCase()} → ${agent.character || ''}`;
  if (styleEl) styleEl.textContent = agent.style || '—';
  if (backgroundEl) backgroundEl.textContent = agent.background || '—';
  if (quirksEl) {
    if (Array.isArray(agent.quirks) && agent.quirks.length > 0) {
      quirksEl.textContent = agent.quirks.join(', ');
    } else {
      quirksEl.textContent = '—';
    }
  }

  // Update lift badge
  if (liftBadge) {
    if (agent.lift !== undefined && agent.lift !== null) {
      const sign = agent.lift >= 0 ? '+' : '';
      liftBadge.textContent = `${sign}${agent.lift.toFixed(1)}`;
      liftBadge.dataset.lift = liftBadge.textContent;
      liftBadge.classList.remove('positive', 'negative', 'neutral');
      if (agent.lift > 0) liftBadge.classList.add('positive');
      else if (agent.lift < 0) liftBadge.classList.add('negative');
      else liftBadge.classList.add('neutral');
    } else {
      liftBadge.textContent = '—';
      liftBadge.dataset.lift = '—';
    }
  }

  // Update portrait
  const portraitContainer = popup.querySelector('.popup-portrait');
  if (portraitContainer && agent.slug && themeData?.theme) {
    const img = portraitContainer.querySelector('img');
    const placeholder = portraitContainer.querySelector('.portrait-placeholder');
    if (img) {
      img.classList.add('loading');
      const portraitPath = window.buildPortraitPath
        ? window.buildPortraitPath(themeData.theme, agent.slug, 'large')
        : `/portraits/${themeData.theme}/large/${agent.slug}.png`;
      img.src = portraitPath;
      img.style.display = 'block';
      img.onerror = () => {
        img.style.display = 'none';
        img.classList.remove('loading');
        if (placeholder) placeholder.style.display = 'flex';
      };
      img.onload = () => {
        img.classList.remove('loading');
        if (placeholder) placeholder.style.display = 'none';
      };
    }
  }
}

/**
 * MSSCI-12403: Populate the team roster list
 * @param {string} currentRole - Current active agent role
 */
function populateTeamRoster(currentRole) {
  const popup = document.getElementById('persona-popup');
  const rosterList = popup?.querySelector('.roster-list');
  if (!rosterList || !themeData?.agents) return;

  rosterList.innerHTML = '';

  for (const agent of themeData.agents) {
    const isCurrent = agent.role === currentRole;
    const li = document.createElement('li');
    li.className = `roster-item${isCurrent ? ' current' : ''}`;
    li.dataset.role = agent.role;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', isCurrent ? 'true' : 'false');

    li.innerHTML = `
      <span class="roster-item-left">
        <span class="roster-indicator"></span>
        <span class="roster-character">${agent.character}</span>
      </span>
      <span class="roster-item-right">
        <span class="roster-role">${agent.role.toUpperCase()}</span>
        <span class="roster-current-marker">←</span>
      </span>
    `;

    // Hover preview with debounce
    li.addEventListener('mouseenter', () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        previewedAgent = agent;
        updatePopupDisplay(agent, currentPersonaData);
        // Update visual selection in roster
        rosterList.querySelectorAll('.roster-item').forEach(item => {
          item.classList.toggle('previewing', item.dataset.role === agent.role);
        });
      }, 100);
    });

    li.addEventListener('mouseleave', () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        if (previewedAgent) {
          previewedAgent = null;
          // Revert to current agent
          const currentAgent = themeData.agents.find(a => a.role === currentRole);
          if (currentAgent) {
            updatePopupDisplay(currentAgent, currentPersonaData);
          }
          // Clear preview visual
          rosterList.querySelectorAll('.roster-item').forEach(item => {
            item.classList.remove('previewing');
          });
        }
      }, 200);
    });

    // MSSCI-12403: Click to load agent
    li.addEventListener('click', () => {
      // Don't reload current agent
      if (isCurrent) return;

      // Send the agent command (e.g., /dev, /sm, /tea)
      const command = `/${agent.role}`;

      // Close the popup first
      hidePersonaPopup();

      // Send the command to Claude
      if (window.electronAPI?.claude?.send) {
        window.electronAPI.claude.send(command);
      }
    });

    rosterList.appendChild(li);
  }
}

/**
 * Show the persona popup with full details
 * MSSCI-12403: Now includes team roster and tier/lift badges
 */
async function showPersonaPopup() {
  const popup = document.getElementById('persona-popup');
  const backdrop = document.getElementById('persona-popup-backdrop');
  if (!popup || !backdrop) return;

  // Fetch full details and theme data in parallel
  const [fullPersona, fetchedThemeData] = await Promise.all([
    fetchFullPersonaDetails(),
    fetchThemeData()
  ]);

  if (!fullPersona && !currentPersonaData) return;

  // Use full details if available, otherwise fall back to current data
  const persona = fullPersona || currentPersonaData;

  // Store theme data for roster interactions
  themeData = fetchedThemeData;

  // Update theme name and tier badge
  const themeEl = popup.querySelector('[data-persona="theme"]');
  const tierBadge = popup.querySelector('.tier-badge');

  if (themeEl) themeEl.textContent = humanize(persona.theme || '');
  if (tierBadge && themeData?.tier) {
    tierBadge.textContent = themeData.tier;
    tierBadge.dataset.tier = themeData.tier;
  } else if (tierBadge) {
    tierBadge.removeAttribute('data-tier');
  }

  // Find current agent in theme data for full details
  const currentAgent = themeData?.agents?.find(a => a.role === persona.role);
  const agentToDisplay = currentAgent || {
    character: persona.character,
    role: persona.role,
    style: persona.style,
    background: persona.background || persona.roleDescription,
    quirks: persona.quirks,
    slug: persona.slug,
    lift: undefined
  };

  // Update popup display with current agent
  updatePopupDisplay(agentToDisplay, persona);

  // Populate team roster
  if (themeData?.agents) {
    populateTeamRoster(persona.role);
  }

  // Show popup and backdrop with animations
  backdrop.style.display = 'block';
  backdrop.classList.add('visible');
  popup.style.display = 'block';
  popup.classList.remove('closing');
  popup.classList.add('active');
  popup.focus();
}

/**
 * Hide the persona popup
 * MSSCI-12403: Now with close animation
 */
function hidePersonaPopup() {
  const popup = document.getElementById('persona-popup');
  const backdrop = document.getElementById('persona-popup-backdrop');

  if (popup && popup.classList.contains('active')) {
    // Clear any pending hover timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    previewedAgent = null;

    // Animate close
    popup.classList.add('closing');
    popup.classList.remove('active');
    backdrop?.classList.remove('visible');

    // Hide after animation completes
    setTimeout(() => {
      popup.style.display = 'none';
      popup.classList.remove('closing');
      if (backdrop) backdrop.style.display = 'none';
    }, 150);
  }
}

/**
 * Initialize popup event handlers
 */
function initPersonaPopup() {
  const personaSection = document.getElementById('persona-section');
  const popup = document.getElementById('persona-popup');
  const backdrop = document.getElementById('persona-popup-backdrop');
  const closeBtn = popup?.querySelector('.popup-close');

  // Click on persona section opens popup
  if (personaSection) {
    personaSection.addEventListener('click', () => {
      showPersonaPopup();
    });
  }

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hidePersonaPopup();
    });
  }

  // Click on backdrop closes popup
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      hidePersonaPopup();
    });
  }

  // Escape key closes popup
  if (popup) {
    popup.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hidePersonaPopup();
      }
    });
  }

  // Global escape handler for when popup is open
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const popup = document.getElementById('persona-popup');
      if (popup && popup.classList.contains('active')) {
        hidePersonaPopup();
      }
    }
  });
}

/**
 * Get the current agent role as a slash command
 * @returns {string|null} Agent command like '/dev', '/sm', '/tea' or null
 */
export function getCurrentAgentCommand() {
  const role = currentPersonaData?.role;
  return role ? `/${role}` : null;
}

/**
 * Refresh persona display from server
 */
export async function refreshPersona() {
  try {
    if (window.electronAPI?.persona?.get) {
      const persona = await window.electronAPI.persona.get();
      if (persona) {
        updatePersona(persona);
      }
    } else {
      const response = await fetch('/api/persona');
      if (response.ok) {
        const persona = await response.json();
        updatePersona(persona);
      }
    }
  } catch (err) {
    console.error('[Persona] Failed to refresh persona:', err);
  }
}

// Expose functions globally for cross-module access
if (typeof window !== 'undefined') {
  window.refreshPersona = refreshPersona;
  window.getCurrentAgentCommand = getCurrentAgentCommand;  // TirePump: used by stats-strip.js
}

// Initialize on page load (guard for test environments without DOM)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPersona();
    initPersonaPopup();
    // 35-8: Persona click shows detail popup only (theme changes via SettingsPanel)
  });
}
