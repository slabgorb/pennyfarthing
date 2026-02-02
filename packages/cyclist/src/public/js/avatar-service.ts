/**
 * Avatar Service
 *
 * Fetches and caches user avatars from GitHub and Gravatar.
 * Story MSSCI-12777 - User Avatar from GitHub/Gravatar
 *
 * Priority chain:
 * 1. Local cache (fastest)
 * 2. GitHub API via `gh` CLI
 * 3. Gravatar MD5 hash fallback
 * 4. Default silhouette
 */

// Default silhouette SVG data URL
export const DEFAULT_AVATAR =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iIzY2NiIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMTUiIHI9IjgiIGZpbGw9IiNhYWEiLz48ZWxsaXBzZSBjeD0iMjAiIGN5PSIzNSIgcng9IjEyIiByeT0iMTAiIGZpbGw9IiNhYWEiLz48L3N2Zz4=';

/**
 * Get GitHub avatar URL via gh CLI
 * @param email - User's email (used for lookup)
 * @returns Avatar URL or null if not found
 */
export async function getGitHubAvatarUrl(email: string): Promise<string | null> {
  // TODO: Implement - call electronAPI.avatar.fetchFromGitHub
  throw new Error('getGitHubAvatarUrl not implemented');
}

/**
 * Generate Gravatar URL from email
 * @param email - User's email
 * @returns Gravatar URL with MD5 hash
 */
export function getGravatarUrl(email: string): string {
  // TODO: Implement - MD5 hash of lowercase, trimmed email
  throw new Error('getGravatarUrl not implemented');
}

/**
 * Get user avatar with fallback chain
 * 1. Check cache
 * 2. Try GitHub
 * 3. Fall back to Gravatar
 * 4. Return default silhouette
 *
 * @returns Avatar URL (GitHub, Gravatar, or default)
 */
export async function getUserAvatar(): Promise<string> {
  // TODO: Implement full fallback chain
  throw new Error('getUserAvatar not implemented');
}

/**
 * Clear avatar cache
 */
export async function clearAvatarCache(): Promise<void> {
  // TODO: Implement - call electronAPI.avatar.clearCache
  throw new Error('clearAvatarCache not implemented');
}
