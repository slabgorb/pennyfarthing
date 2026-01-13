/**
 * Portrait management for sidebar
 * Handles loading, swapping, and fallback for character portraits
 * Supports theme-specific portrait directories with fallback chain
 *
 * Multi-resolution support:
 * - small/  (64x64)   - For thumbnails, cards, lists
 * - medium/ (128x128) - For sidebar portrait display
 * - large/  (256x256) - For popup/modal display
 * - original/ (512x512) - Full resolution
 */

// Get portrait elements
const portraitContainer = document.getElementById('portrait');
const portraitImg = portraitContainer?.querySelector('img');
const portraitPlaceholder = portraitContainer?.querySelector('.portrait-placeholder');

// Track current role for theme-aware reloading
let currentRole = null;
// Track current portrait theme (persona theme, not UI theme)
let currentPortraitTheme = null;

// Portrait size constants
const PORTRAIT_SIZES = {
  small: 'small',    // 64x64 - thumbnails, cards
  medium: 'medium',  // 128x128 - sidebar
  large: 'large',    // 256x256 - modals
  original: 'original' // 512x512 - full res
};

// Default size for sidebar portrait
const DEFAULT_PORTRAIT_SIZE = PORTRAIT_SIZES.medium;

/**
 * Extract slug from a portrait path
 * Handles both old format: /portraits/theme/slug.png
 * And new format: /portraits/theme/size/slug.png
 * @param {string} path - Portrait path
 * @returns {string|null} The slug (e.g., "yoda-54242") or null if not extractable
 */
function extractSlugFromPath(path) {
  if (!path) return null;
  // Try new format first: /portraits/theme/size/slug.png
  let match = path.match(/\/portraits\/[^/]+\/(?:small|medium|large|original)\/([^/]+)\.png$/);
  if (match) return match[1];
  // Fall back to old format: /portraits/theme/slug.png
  match = path.match(/\/portraits\/[^/]+\/([^/]+)\.png$/);
  return match ? match[1] : null;
}

// Alias for backwards compatibility
function extractRoleFromPath(path) {
  return extractSlugFromPath(path);
}

/**
 * Extract theme from a portrait path
 * Handles both old format: /portraits/theme/slug.png
 * And new format: /portraits/theme/size/slug.png
 * @param {string} path - Portrait path
 * @returns {string|null} The theme (e.g., "moby-dick") or null if not extractable
 */
function extractThemeFromPath(path) {
  if (!path) return null;
  // Both formats have theme as first segment after /portraits/
  const match = path.match(/\/portraits\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Build portrait path with size subdirectory
 * @param {string} theme - Theme name (e.g., "discworld")
 * @param {string} slug - Character slug (e.g., "granny-35211")
 * @param {string} size - Size variant (small|medium|large|original)
 * @returns {string} Full path like "/portraits/discworld/medium/granny-35211.png"
 */
function buildPortraitPath(theme, slug, size = DEFAULT_PORTRAIT_SIZE) {
  return `/portraits/${theme}/${size}/${slug}.png`;
}

/**
 * Load portrait with theme-specific path and fallback chain
 * @param {string} slug - The character slug (e.g., "yoda-54242", "death-55231")
 * @param {string} theme - The portrait theme (e.g., "star-wars", "discworld")
 * @param {string} size - The size variant (small|medium|large|original), defaults to medium
 */
function loadPortraitWithTheme(slug, theme, size = DEFAULT_PORTRAIT_SIZE) {
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

  // Build primary path using size-aware helper
  const primaryPath = buildPortraitPath(currentPortraitTheme, slug, size);

  // Set up fallback chain via error handler
  const handleError = () => {
    if (currentPortraitTheme !== 'discworld') {
      // Try discworld fallback (same size)
      const fallbackPath = buildPortraitPath('discworld', slug, size);
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
window.buildPortraitPath = buildPortraitPath;
window.PORTRAIT_SIZES = PORTRAIT_SIZES;
