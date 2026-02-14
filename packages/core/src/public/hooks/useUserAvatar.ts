/**
 * useUserAvatar Hook
 *
 * React hook for fetching and managing user avatar state.
 * Story MSSCI-12777 - User Avatar from GitHub/Gravatar
 *
 * Uses avatar-service for fetching with fallback chain:
 * GitHub → Gravatar → Default silhouette
 */

import { useState, useEffect } from 'react';
import { DEFAULT_AVATAR } from '../utils/avatar-service';

export { DEFAULT_AVATAR };

export interface UseUserAvatarResult {
  avatarUrl: string | null;
  isLoading: boolean;
  error: Error | null;
}

export function useUserAvatar(): UseUserAvatarResult {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchAvatar = async () => {
      try {
        // Try REST endpoint for avatar
        const response = await fetch('/api/identity');
        if (response.ok) {
          const data = await response.json();
          if (data.avatarUrl) {
            setAvatarUrl(data.avatarUrl);
          } else {
            setAvatarUrl(DEFAULT_AVATAR);
          }
        } else {
          setAvatarUrl(DEFAULT_AVATAR);
        }
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch avatar'));
        setAvatarUrl(DEFAULT_AVATAR);
        setIsLoading(false);
      }
    };

    fetchAvatar();
  }, []);

  return { avatarUrl, isLoading, error };
}
