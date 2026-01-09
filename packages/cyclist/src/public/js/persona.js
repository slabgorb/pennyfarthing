/**
 * Persona Module - Electron IPC client for persona updates
 * Story 17-4: Added popup profile view for full persona details
 */

/** Module-level storage for helper name (used by activity.js and MessageView.js) */
let currentHelperName = null;

/** Module-level storage for current persona data (for popup) */
let currentPersonaData = null;

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
  const quoteEl = document.getElementById('character-quote');

  // Project name at top (repo folder name)
  if (projectEl && persona.projectName) {
    projectEl.textContent = persona.projectName;
  }

  // Theme name at bottom, humanized
  if (themeEl && persona.theme) {
    themeEl.textContent = humanize(persona.theme);
  }

  if (nameEl) {
    // Use displayName (smart short name) if available, fall back to full character name
    nameEl.textContent = persona.displayName || persona.character || '';
  }

  if (roleEl) {
    // Show the agent role (dev, sm, tea, etc.) - not the character's story role
    roleEl.textContent = (persona.role || '').toUpperCase();
  }

  if (quoteEl && persona.quote) {
    quoteEl.textContent = `"${persona.quote}"`;
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

  // Update portrait
  const portraitContainer = popup.querySelector('.popup-portrait');
  if (portraitContainer && persona.slug && persona.theme) {
    const img = portraitContainer.querySelector('img');
    const placeholder = portraitContainer.querySelector('.portrait-placeholder');
    if (img) {
      img.src = `/portraits/${persona.theme}/${persona.slug}.png`;
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

// Initialize on page load (guard for test environments without DOM)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPersona();
    initPersonaPopup();
  });
}
