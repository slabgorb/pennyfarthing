/**
 * Persona Module - Electron IPC client for persona updates
 */

/** Module-level storage for helper name (used by activity.js and MessageView.js) */
let currentHelperName = null;

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

// Initialize on page load (guard for test environments without DOM)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPersona();
  });
}
