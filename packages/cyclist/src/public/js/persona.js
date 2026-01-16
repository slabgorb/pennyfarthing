/**
 * Persona Module - Electron IPC client for persona updates
 * Story 17-4: Added popup profile view for full persona details
 * Story 35-1: Added theme picker integration for contextual settings
 */

/** Module-level storage for helper name (used by activity.js and MessageView.js) */
let currentHelperName = null;

/** Module-level storage for current persona data (for popup) */
let currentPersonaData = null;

/** ThemePicker module reference (lazy loaded) */
let themePickerModule = null;

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

  // Project name at top (repo folder name)
  if (projectEl && persona.projectName) {
    projectEl.textContent = persona.projectName;
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
 * Show the persona popup with full details
 */
async function showPersonaPopup() {
  const popup = document.getElementById('persona-popup');
  const backdrop = document.getElementById('persona-popup-backdrop');
  if (!popup || !backdrop) return;

  // Fetch full details
  const fullPersona = await fetchFullPersonaDetails();
  if (!fullPersona && !currentPersonaData) return;

  // Use full details if available, otherwise fall back to current data
  const persona = fullPersona || currentPersonaData;

  // Update popup content
  const characterNameEl = popup.querySelector('[data-persona="character"]');
  const roleMappingEl = popup.querySelector('[data-persona="role-mapping"]');
  const themeEl = popup.querySelector('[data-persona="theme"]');
  const styleEl = popup.querySelector('[data-persona="style"]');
  const voiceEl = popup.querySelector('[data-persona="voice"]');
  const backgroundEl = popup.querySelector('[data-persona="background"]');
  const quirksEl = popup.querySelector('[data-persona="quirks"]');

  if (characterNameEl) characterNameEl.textContent = persona.character || '—';
  if (roleMappingEl) roleMappingEl.textContent = persona.roleMapping || `${(persona.role || '').toUpperCase()} → ${persona.character || ''}`;
  if (themeEl) themeEl.textContent = humanize(persona.theme || '');
  if (styleEl) styleEl.textContent = persona.style || '—';
  if (voiceEl) voiceEl.textContent = persona.voice || '—';
  if (backgroundEl) backgroundEl.textContent = persona.background || persona.roleDescription || '—';
  if (quirksEl) {
    if (Array.isArray(persona.quirks) && persona.quirks.length > 0) {
      quirksEl.textContent = persona.quirks.join(', ');
    } else {
      quirksEl.textContent = '—';
    }
  }

  // Update portrait (use large size for popup - 256x256)
  const portraitContainer = popup.querySelector('.popup-portrait');
  if (portraitContainer && persona.slug && persona.theme) {
    const img = portraitContainer.querySelector('img');
    const placeholder = portraitContainer.querySelector('.portrait-placeholder');
    if (img) {
      // Use buildPortraitPath if available (from portrait.js), otherwise build directly
      const portraitPath = window.buildPortraitPath
        ? window.buildPortraitPath(persona.theme, persona.slug, 'large')
        : `/portraits/${persona.theme}/large/${persona.slug}.png`;
      img.src = portraitPath;
      img.style.display = 'block';
      img.onerror = () => {
        img.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
      };
      img.onload = () => {
        if (placeholder) placeholder.style.display = 'none';
      };
    }
  }

  // Show popup and backdrop
  backdrop.style.display = 'block';
  popup.style.display = 'block';
  popup.classList.add('active');
  popup.focus();
}

/**
 * Hide the persona popup
 */
function hidePersonaPopup() {
  const popup = document.getElementById('persona-popup');
  const backdrop = document.getElementById('persona-popup-backdrop');
  if (popup) {
    popup.style.display = 'none';
    popup.classList.remove('active');
  }
  if (backdrop) {
    backdrop.style.display = 'none';
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

// =============================================================================
// Theme Picker Functions (35-1)
// =============================================================================

/**
 * Initialize theme picker functionality
 * Sets up click handler on persona section to toggle theme picker
 */
export async function initThemePicker() {
  // Lazy load ThemePicker module
  if (!themePickerModule) {
    try {
      themePickerModule = await import('./components/ThemePicker.js');
    } catch (err) {
      console.warn('[Persona] Failed to load ThemePicker module:', err);
      return;
    }
  }

  // Initialize the picker
  await themePickerModule.init();

  // Set current theme from persona data
  if (currentPersonaData?.theme) {
    themePickerModule.setCurrentTheme(currentPersonaData.theme);
  }

  console.log('[Persona] Theme picker initialized');
}

/**
 * Show the theme picker
 */
export function showThemePicker() {
  if (themePickerModule) {
    themePickerModule.show();
  }
}

/**
 * Hide the theme picker
 */
export function hideThemePicker() {
  if (themePickerModule) {
    themePickerModule.hide();
  }
}

/**
 * Update the current theme
 * @param {string} themeId - Theme ID to set
 */
export async function updateTheme(themeId) {
  try {
    // Update via settings API
    if (window.electronAPI?.settings?.save) {
      await window.electronAPI.settings.save({ pennyfarthing: { theme: themeId } });
    } else {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pennyfarthing: { theme: themeId } }),
      });
    }

    // Update theme picker state
    if (themePickerModule) {
      themePickerModule.setCurrentTheme(themeId);
    }

    // Refresh persona display
    await refreshPersona();

    console.log('[Persona] Theme updated to:', themeId);
  } catch (err) {
    console.error('[Persona] Failed to update theme:', err);
    throw err;
  }
}

/**
 * Get the current theme ID
 * @returns {string|null} Current theme ID or null
 */
export function getCurrentTheme() {
  if (themePickerModule) {
    return themePickerModule.getCurrentTheme();
  }
  return currentPersonaData?.theme || null;
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

// Expose refreshPersona globally for ThemePicker
if (typeof window !== 'undefined') {
  window.refreshPersona = refreshPersona;
}

/**
 * Handle persona section click - toggle theme picker instead of popup
 * 35-1: Changed from popup to theme picker
 */
function handlePersonaSectionClick(event) {
  // Don't trigger if clicking on specific interactive elements
  if (event.target.closest('.popup-close') ||
      event.target.closest('.theme-picker') ||
      event.target.closest('button')) {
    return;
  }

  // Toggle theme picker
  if (themePickerModule?.isVisible?.()) {
    hideThemePicker();
  } else {
    showThemePicker();
  }
}

// Initialize on page load (guard for test environments without DOM)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    initPersona();
    initPersonaPopup();
    await initThemePicker();

    // 35-1: Override persona section click to show theme picker
    const personaSection = document.getElementById('persona-section');
    if (personaSection && personaSection.dataset.action === 'theme-picker') {
      // Remove old click handler and add new one
      personaSection.removeEventListener('click', showPersonaPopup);
      personaSection.addEventListener('click', handlePersonaSectionClick);
    }
  });
}
