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

/**
 * Get GitHub avatar URL via gh CLI
 * @returns Avatar URL or null if not found
 */
export async function getGitHubAvatarUrl(): Promise<string | null> {
  try {
    const api = window.electronAPI;
    if (!api?.avatar?.fetchFromGitHub) {
      return null;
    }
    const response = await api.avatar.fetchFromGitHub();
    if (response && typeof response === 'object' && 'avatar_url' in response) {
      return (response as { avatar_url: string }).avatar_url;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get user avatar with fallback chain
 * 1. Check cache
 * 2. Try GitHub
 * 3. Return default silhouette
 *
 * @returns Avatar URL (GitHub or default)
 */
export async function getUserAvatar(): Promise<string> {
  try {
    const api = window.electronAPI;
    if (!api?.avatar) {
      return DEFAULT_AVATAR;
    }

    // Check cache first
    const cached = await api.avatar.getCached();
    if (cached) {
      return cached as string;
    }

    // Try GitHub
    const githubUrl = await getGitHubAvatarUrl();
    if (githubUrl) {
      // Cache the result
      await api.avatar.setCached(githubUrl);
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
export async function clearAvatarCache(): Promise<void> {
  const api = window.electronAPI;
  if (api?.avatar?.clearCache) {
    await api.avatar.clearCache();
  }
}
