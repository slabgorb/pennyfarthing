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
import { DEFAULT_AVATAR } from '../js/avatar-service';

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
    // TODO: Implement - fetch avatar via electronAPI.avatar.get
    // For now, stub that throws to fail tests
    const fetchAvatar = async () => {
      try {
        const api = window.electronAPI;
        if (api?.avatar?.get) {
          const url = await api.avatar.get();
          setAvatarUrl(url as string);
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
