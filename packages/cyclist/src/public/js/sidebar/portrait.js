/**
 * Portrait Module - Character portrait loading and management
 *
 * Handles loading, swapping, and fallback for character portraits
 * Supports theme-specific portrait directories with fallback chain
 *
 * Multi-resolution support:
 * - small/  (64x64)   - For thumbnails, cards, lists
 * - medium/ (128x128) - For sidebar portrait display
 * - large/  (256x256) - For popup/modal display
 * - original/ (512x512) - Full resolution
 */

// DOM elements (initialized in init())
let portraitContainer = null;
let portraitImg = null;
let portraitPlaceholder = null;

// MSSCI-12474: Thumbnail elements for collapsed header
let thumbContainer = null;
let thumbImg = null;
let thumbPlaceholder = null;

// Track current role/theme for reloading
let currentRole = null;
let currentPortraitTheme = null;

// Portrait size constants
export const PORTRAIT_SIZES = {
  small: 'small',    // 64x64 - thumbnails, cards
  medium: 'medium',  // 128x128 - sidebar
  large: 'large',    // 256x256 - modals
  original: 'original' // 512x512 - full res
};

const DEFAULT_PORTRAIT_SIZE = PORTRAIT_SIZES.medium;

/**
 * Extract slug from a portrait path
 * @param {string} path - Portrait path
 * @returns {string|null} The slug or null
 */
function extractSlugFromPath(path) {
  if (!path) return null;
  let match = path.match(/\/portraits\/[^/]+\/(?:small|medium|large|original)\/([^/]+)\.png$/);
  if (match) return match[1];
  match = path.match(/\/portraits\/[^/]+\/([^/]+)\.png$/);
  return match ? match[1] : null;
}

/**
 * Extract theme from a portrait path
 * @param {string} path - Portrait path
 * @returns {string|null} The theme or null
 */
function extractThemeFromPath(path) {
  if (!path) return null;
  const match = path.match(/\/portraits\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Build portrait path with size subdirectory
 * @param {string} theme - Theme name
 * @param {string} slug - Character slug
 * @param {string} size - Size variant
 * @returns {string} Full path
 */
export function buildPortraitPath(theme, slug, size = DEFAULT_PORTRAIT_SIZE) {
  return `/portraits/${theme}/${size}/${slug}.png`;
}

/**
 * Handle successful image load
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
 * MSSCI-12474: Handle successful thumbnail load
 */
function handleThumbLoad() {
  if (thumbImg) {
    thumbImg.style.display = 'block';
  }
  if (thumbPlaceholder) {
    thumbPlaceholder.style.display = 'none';
  }
}

/**
 * MSSCI-12474: Handle thumbnail load error - show fallback
 */
function handleThumbError() {
  if (thumbImg) {
    thumbImg.style.display = 'none';
  }
  if (thumbPlaceholder) {
    thumbPlaceholder.style.display = 'flex';
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

/**
 * Load portrait with theme-specific path and fallback chain
 * @param {string} slug - The character slug
 * @param {string} theme - The portrait theme
 * @param {string} size - The size variant
 */
export function loadPortraitWithTheme(slug, theme, size = DEFAULT_PORTRAIT_SIZE) {
  if (!portraitImg || !slug) return;

  currentRole = slug;
  currentPortraitTheme = theme || 'discworld';

  // Show loading state
  portraitImg.style.opacity = '0';
  portraitImg.style.display = 'block';
  if (portraitPlaceholder) {
    portraitPlaceholder.style.display = 'none';
  }

  const primaryPath = buildPortraitPath(currentPortraitTheme, slug, size);

  const handleError = () => {
    if (currentPortraitTheme !== 'discworld') {
      const fallbackPath = buildPortraitPath('discworld', slug, size);
      portraitImg.src = fallbackPath;
      currentPortraitTheme = 'discworld';
    } else {
      handleImageError();
    }
  };

  portraitImg.onerror = handleError;
  portraitImg.src = primaryPath;

  // MSSCI-12474: Also load thumbnail (uses small size)
  if (thumbImg) {
    const thumbPath = buildPortraitPath(currentPortraitTheme, slug, PORTRAIT_SIZES.small);
    thumbImg.onerror = () => {
      if (currentPortraitTheme !== 'discworld') {
        thumbImg.src = buildPortraitPath('discworld', slug, PORTRAIT_SIZES.small);
      } else {
        handleThumbError();
      }
    };
    thumbImg.src = thumbPath;
  }

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
export function setPortrait(src) {
  if (!portraitImg) return;

  const role = extractSlugFromPath(src);
  const theme = extractThemeFromPath(src);
  if (role) currentRole = role;
  if (theme) currentPortraitTheme = theme;

  portraitImg.style.opacity = '0';
  portraitImg.src = src;

  fetch('/api/portrait', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src })
  }).catch(err => console.error('Failed to update portrait on server:', err));
}

/**
 * Load portrait from server
 */
export async function loadPortrait() {
  try {
    const response = await fetch('/api/portrait');
    const data = await response.json();
    if (data.src && portraitImg) {
      const role = extractSlugFromPath(data.src);
      const theme = extractThemeFromPath(data.src);
      if (role) currentRole = role;
      if (theme) currentPortraitTheme = theme;
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
export function reloadPortraitWithTheme(theme) {
  if (currentRole) {
    loadPortraitWithTheme(currentRole, theme);
  }
}

/**
 * Handle UI theme change
 */
function handleThemeChange() {
  if (currentRole && currentPortraitTheme) {
    loadPortraitWithTheme(currentRole, currentPortraitTheme);
  }
}

/**
 * Initialize portrait module
 */
export function init() {
  portraitContainer = document.getElementById('portrait');
  portraitImg = portraitContainer?.querySelector('img');
  portraitPlaceholder = portraitContainer?.querySelector('.portrait-placeholder');

  // MSSCI-12474: Initialize thumbnail elements
  thumbContainer = document.getElementById('portrait-thumb');
  thumbImg = thumbContainer?.querySelector('img');
  thumbPlaceholder = thumbContainer?.querySelector('.portrait-placeholder');

  if (portraitImg) {
    portraitImg.addEventListener('load', handleImageLoad);
    portraitImg.addEventListener('error', handleImageError);
  }

  // MSSCI-12474: Thumbnail load handlers
  if (thumbImg) {
    thumbImg.addEventListener('load', handleThumbLoad);
    thumbImg.addEventListener('error', handleThumbError);
  }

  // Listen for UI theme changes
  window.addEventListener('themechange', handleThemeChange);

  // Load initial portrait
  loadPortrait();

  // Export to window for backward compatibility
  window.setPortrait = setPortrait;
  window.loadPortrait = loadPortrait;
  window.loadPortraitWithTheme = loadPortraitWithTheme;
  window.reloadPortraitWithTheme = reloadPortraitWithTheme;
  window.buildPortraitPath = buildPortraitPath;
  window.PORTRAIT_SIZES = PORTRAIT_SIZES;
}

/**
 * Cleanup portrait module
 */
export function destroy() {
  if (portraitImg) {
    portraitImg.removeEventListener('load', handleImageLoad);
    portraitImg.removeEventListener('error', handleImageError);
  }
  // MSSCI-12474: Cleanup thumbnail handlers
  if (thumbImg) {
    thumbImg.removeEventListener('load', handleThumbLoad);
    thumbImg.removeEventListener('error', handleThumbError);
  }
  window.removeEventListener('themechange', handleThemeChange);
}
