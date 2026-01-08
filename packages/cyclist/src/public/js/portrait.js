/**
 * Portrait management for sidebar
 * Handles loading, swapping, and fallback for character portraits
 * Supports theme-specific portrait directories with fallback chain
 */

// Get portrait elements
const portraitContainer = document.getElementById('portrait');
const portraitImg = portraitContainer?.querySelector('img');
const portraitPlaceholder = portraitContainer?.querySelector('.portrait-placeholder');

// Track current role for theme-aware reloading
let currentRole = null;
// Track current portrait theme (persona theme, not UI theme)
let currentPortraitTheme = null;

/**
 * Extract role from a portrait path
 * @param {string} path - Portrait path like "/portraits/moby-dick/dev.png"
 * @returns {string|null} The role (e.g., "dev") or null if not extractable
 */
function extractRoleFromPath(path) {
  if (!path) return null;
  const match = path.match(/\/portraits\/[^/]+\/([^/]+)\.png$/);
  return match ? match[1] : null;
}

/**
 * Extract theme from a portrait path
 * @param {string} path - Portrait path like "/portraits/moby-dick/dev.png"
 * @returns {string|null} The theme (e.g., "moby-dick") or null if not extractable
 */
function extractThemeFromPath(path) {
  if (!path) return null;
  const match = path.match(/\/portraits\/([^/]+)\/[^/]+\.png$/);
  return match ? match[1] : null;
}

/**
 * Load portrait with theme-specific path and fallback chain
 * @param {string} slug - The character slug (e.g., "yoda-54242", "death-55231")
 * @param {string} theme - The portrait theme (e.g., "star-wars", "discworld")
 */
function loadPortraitWithTheme(slug, theme) {
  if (!portraitImg || !slug) return;

  // Store current slug and theme for future reloads
  currentRole = slug;  // Note: currentRole now stores slug for compatibility
  currentPortraitTheme = theme || 'discworld';

  // Show loading state
  portraitImg.style.opacity = '0';
  portraitImg.style.display = 'block';
  if (portraitPlaceholder) {
    portraitPlaceholder.style.display = 'none';
  }

  // Build primary path using slug
  const primaryPath = `/portraits/${currentPortraitTheme}/${slug}.png`;

  // Set up fallback chain via error handler
  const handleError = () => {
    if (currentPortraitTheme !== 'discworld') {
      // Try discworld fallback
      const fallbackPath = `/portraits/discworld/${slug}.png`;
      portraitImg.src = fallbackPath;
      // Update theme to discworld so subsequent errors show placeholder
      currentPortraitTheme = 'discworld';
    } else {
      // Already tried discworld, show placeholder
      handleImageError();
    }
  };

  // Temporarily override error handler for fallback chain
  const originalHandler = portraitImg.onerror;
  portraitImg.onerror = handleError;

  // Load primary path
  portraitImg.src = primaryPath;

  // Update server state
  fetch('/api/portrait', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: primaryPath })
  }).catch(err => console.error('Failed to update portrait on server:', err));
}

/**
 * Set the portrait image source
 * @param {string} src - The image source URL
 */
function setPortrait(src) {
  if (!portraitImg) return;

  // Extract and store role from path
  const role = extractRoleFromPath(src);
  const theme = extractThemeFromPath(src);
  if (role) {
    currentRole = role;
  }
  if (theme) {
    currentPortraitTheme = theme;
  }

  // Show loading state
  portraitImg.style.opacity = '0';

  // Set new source
  portraitImg.src = src;

  // Update server state
  fetch('/api/portrait', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src })
  }).catch(err => console.error('Failed to update portrait on server:', err));
}

/**
 * Load portrait from server
 */
async function loadPortrait() {
  try {
    const response = await fetch('/api/portrait');
    const data = await response.json();
    if (data.src && portraitImg) {
      // Extract role and theme from saved path
      const role = extractRoleFromPath(data.src);
      const theme = extractThemeFromPath(data.src);
      if (role) {
        currentRole = role;
      }
      if (theme) {
        currentPortraitTheme = theme;
      }
      portraitImg.src = data.src;
    }
  } catch (err) {
    console.error('Failed to load portrait:', err);
  }
}

/**
 * Reload current portrait with a new theme
 * @param {string} theme - The portrait theme to use
 */
function reloadPortraitWithTheme(theme) {
  if (currentRole) {
    loadPortraitWithTheme(currentRole, theme);
  }
}

/**
 * Handle image load success
 */
function handleImageLoad() {
  if (portraitImg) {
    portraitImg.style.opacity = '1';
    portraitImg.style.display = 'block';
  }
  if (portraitPlaceholder) {
    portraitPlaceholder.style.display = 'none';
  }
}

/**
 * Handle image load error - show fallback
 */
function handleImageError() {
  if (portraitImg) {
    portraitImg.style.display = 'none';
  }
  if (portraitPlaceholder) {
    portraitPlaceholder.style.display = 'flex';
    portraitPlaceholder.textContent = 'No portrait loaded';
  }
}

// Set up event listeners
if (portraitImg) {
  portraitImg.addEventListener('load', handleImageLoad);
  portraitImg.addEventListener('error', handleImageError);
}

// Listen for UI theme changes - reload portrait to ensure consistency
window.addEventListener('themechange', (e) => {
  // When UI theme changes, reload the portrait
  // This ensures any cached images are refreshed
  if (currentRole && currentPortraitTheme) {
    loadPortraitWithTheme(currentRole, currentPortraitTheme);
  }
});

// Load initial portrait
loadPortrait();

// Export for external use
window.setPortrait = setPortrait;
window.loadPortrait = loadPortrait;
window.loadPortraitWithTheme = loadPortraitWithTheme;
window.reloadPortraitWithTheme = reloadPortraitWithTheme;
