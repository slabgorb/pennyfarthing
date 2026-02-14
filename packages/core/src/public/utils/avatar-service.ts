/**
 * Avatar Service
 *
 * Fetches and caches user avatars from GitHub.
 * Story MSSCI-12777 - User Avatar from GitHub
 *
 * Priority chain:
 * 1. Local cache (fastest)
 * 2. GitHub API via `gh` CLI
 * 3. Default silhouette
 */

// Default silhouette SVG data URL
export const DEFAULT_AVATAR =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iIzY2NiIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMTUiIHI9IjgiIGZpbGw9IiNhYWEiLz48ZWxsaXBzZSBjeD0iMjAiIGN5PSIzNSIgcng9IjEyIiByeT0iMTAiIGZpbGw9IiNhYWEiLz48L3N2Zz4=';

// Local cache for avatar URL
let avatarCache: string | null = null;

/**
 * Get GitHub avatar URL via REST API
 * @returns Avatar URL or null if not found
 */
export async function getGitHubAvatarUrl(): Promise<string | null> {
  try {
    const response = await fetch('/api/identity');
    if (response.ok) {
      const data = await response.json();
      if (data.avatarUrl) {
        return data.avatarUrl;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get user avatar with fallback chain
 * 1. Check cache
 * 2. Try GitHub via REST API
 * 3. Return default silhouette
 *
 * @returns Avatar URL (GitHub or default)
 */
export async function getUserAvatar(): Promise<string> {
  try {
    // Check cache first
    if (avatarCache) {
      return avatarCache;
    }

    // Try REST API
    const githubUrl = await getGitHubAvatarUrl();
    if (githubUrl) {
      avatarCache = githubUrl;
      return githubUrl;
    }

    // Return default
    return DEFAULT_AVATAR;
  } catch {
    return DEFAULT_AVATAR;
  }
}

/**
 * Clear avatar cache
 */
export function clearAvatarCache(): void {
  avatarCache = null;
}
