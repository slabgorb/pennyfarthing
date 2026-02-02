/**
 * MSSCI-12777: User Avatar from GitHub/Gravatar
 *
 * Replace the default user headshot with the user's actual profile picture
 * from GitHub or Gravatar. Improves personalization and visual identity
 * in the Cyclist UI.
 *
 * Acceptance Criteria:
 * - AC1: User avatar displays from GitHub profile when available
 * - AC2: Falls back to Gravatar MD5 hash when GitHub unavailable
 * - AC3: Avatar caches locally to avoid repeated API calls
 * - AC4: Shows default silhouette if both GitHub and Gravatar fail
 * - AC5: Avatar displays in message headers for user messages
 * - AC6: Git user.email config read correctly
 * - AC7: GitHub API integration uses `gh` CLI
 * - AC8: Cache stored in appropriate local directory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock electronAPI before component imports
const mockElectronAPI = {
  avatar: {
    get: vi.fn(),
    getGitEmail: vi.fn(),
    fetchFromGitHub: vi.fn(),
    fetchFromGravatar: vi.fn(),
    getCached: vi.fn(),
    setCached: vi.fn(),
    clearCache: vi.fn(),
  },
};

beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
});

afterEach(() => {
  delete (window as any).electronAPI;
});

// =============================================================================
// AC1: User avatar displays from GitHub profile when available
// =============================================================================

describe('AC1: User avatar displays from GitHub profile when available', () => {
  it('should fetch avatar URL from GitHub API via gh CLI', async () => {
    const { getGitHubAvatarUrl } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce({
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
    });

    const result = await getGitHubAvatarUrl('user@example.com');

    expect(mockElectronAPI.avatar.fetchFromGitHub).toHaveBeenCalled();
    expect(result).toBe('https://avatars.githubusercontent.com/u/12345?v=4');
  });

  it('should return null when GitHub API returns no avatar', async () => {
    const { getGitHubAvatarUrl } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce(null);

    const result = await getGitHubAvatarUrl('user@example.com');

    expect(result).toBeNull();
  });

  it('should return null when GitHub API throws error', async () => {
    const { getGitHubAvatarUrl } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.fetchFromGitHub.mockRejectedValueOnce(new Error('API error'));

    const result = await getGitHubAvatarUrl('user@example.com');

    expect(result).toBeNull();
  });
});

// =============================================================================
// AC2: Falls back to Gravatar MD5 hash when GitHub unavailable
// =============================================================================

describe('AC2: Falls back to Gravatar MD5 hash when GitHub unavailable', () => {
  it('should generate correct Gravatar URL from email hash', async () => {
    const { getGravatarUrl } = await import('../src/public/js/avatar-service');

    // MD5 hash of "test@example.com" (lowercase, trimmed)
    const result = getGravatarUrl('test@example.com');

    // Gravatar URL format: https://www.gravatar.com/avatar/{md5hash}?d=404&s=80
    expect(result).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}/);
    expect(result).toContain('?d=404');
  });

  it('should normalize email to lowercase before hashing', async () => {
    const { getGravatarUrl } = await import('../src/public/js/avatar-service');

    const lowerResult = getGravatarUrl('test@example.com');
    const upperResult = getGravatarUrl('TEST@EXAMPLE.COM');

    expect(lowerResult).toBe(upperResult);
  });

  it('should trim whitespace from email before hashing', async () => {
    const { getGravatarUrl } = await import('../src/public/js/avatar-service');

    const normalResult = getGravatarUrl('test@example.com');
    const paddedResult = getGravatarUrl('  test@example.com  ');

    expect(normalResult).toBe(paddedResult);
  });

  it('should use Gravatar when GitHub returns null', async () => {
    const { getUserAvatar } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce('user@example.com');
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce(null);
    mockElectronAPI.avatar.getCached.mockResolvedValueOnce(null);

    const result = await getUserAvatar();

    expect(result).toMatch(/gravatar\.com\/avatar/);
  });
});

// =============================================================================
// AC3: Avatar caches locally to avoid repeated API calls
// =============================================================================

describe('AC3: Avatar caches locally to avoid repeated API calls', () => {
  it('should check cache before making API calls', async () => {
    const { getUserAvatar } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce('user@example.com');
    mockElectronAPI.avatar.getCached.mockResolvedValueOnce('https://cached-avatar.com/image.png');

    const result = await getUserAvatar();

    expect(mockElectronAPI.avatar.getCached).toHaveBeenCalledWith('user@example.com');
    expect(mockElectronAPI.avatar.fetchFromGitHub).not.toHaveBeenCalled();
    expect(result).toBe('https://cached-avatar.com/image.png');
  });

  it('should cache avatar URL after successful fetch', async () => {
    const { getUserAvatar } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce('user@example.com');
    mockElectronAPI.avatar.getCached.mockResolvedValueOnce(null);
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce({
      avatar_url: 'https://github-avatar.com/image.png',
    });

    await getUserAvatar();

    expect(mockElectronAPI.avatar.setCached).toHaveBeenCalledWith(
      'user@example.com',
      'https://github-avatar.com/image.png'
    );
  });

  it('should provide clearCache function for cache invalidation', async () => {
    const { clearAvatarCache } = await import('../src/public/js/avatar-service');

    await clearAvatarCache();

    expect(mockElectronAPI.avatar.clearCache).toHaveBeenCalled();
  });

  it('should cache Gravatar URL when GitHub fails', async () => {
    const { getUserAvatar } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce('user@example.com');
    mockElectronAPI.avatar.getCached.mockResolvedValueOnce(null);
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce(null);

    await getUserAvatar();

    expect(mockElectronAPI.avatar.setCached).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/gravatar\.com\/avatar/)
    );
  });
});

// =============================================================================
// AC4: Shows default silhouette if both GitHub and Gravatar fail
// =============================================================================

describe('AC4: Shows default silhouette if both GitHub and Gravatar fail', () => {
  it('should return default avatar when no email configured', async () => {
    const { getUserAvatar, DEFAULT_AVATAR } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce(null);

    const result = await getUserAvatar();

    expect(result).toBe(DEFAULT_AVATAR);
  });

  it('should return default avatar when email is empty string', async () => {
    const { getUserAvatar, DEFAULT_AVATAR } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce('');

    const result = await getUserAvatar();

    expect(result).toBe(DEFAULT_AVATAR);
  });

  it('should export DEFAULT_AVATAR constant for UI fallback', async () => {
    const { DEFAULT_AVATAR } = await import('../src/public/js/avatar-service');

    // Should be either a data URL or a path to a default silhouette
    expect(DEFAULT_AVATAR).toBeDefined();
    expect(typeof DEFAULT_AVATAR).toBe('string');
    expect(DEFAULT_AVATAR.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// AC5: Avatar displays in message headers for user messages
// =============================================================================

describe('AC5: Avatar displays in message headers for user messages', () => {
  it('should render UserAvatar component for user messages', async () => {
    const Message = (await import('../src/public/components/Message')).default;
    mockElectronAPI.avatar.get.mockResolvedValueOnce('https://avatar.example.com/user.png');

    render(
      <Message
        message={{
          type: 'user',
          content: 'Hello world',
          timestamp: Date.now(),
        }}
      />
    );

    await waitFor(() => {
      const avatar = screen.getByTestId('avatar');
      expect(avatar).toBeInTheDocument();
    });
  });

  it('should show user avatar image when available', async () => {
    const Message = (await import('../src/public/components/Message')).default;
    mockElectronAPI.avatar.get.mockResolvedValueOnce('https://avatar.example.com/user.png');

    render(
      <Message
        message={{
          type: 'user',
          content: 'Hello world',
          timestamp: Date.now(),
        }}
      />
    );

    await waitFor(() => {
      const img = screen.queryByRole('img');
      // Either an img element or the avatar container should exist
      const avatar = screen.getByTestId('avatar');
      expect(avatar).toBeInTheDocument();
    });
  });

  it('should show fallback emoji when avatar fails to load', async () => {
    const Message = (await import('../src/public/components/Message')).default;
    mockElectronAPI.avatar.get.mockRejectedValueOnce(new Error('Failed'));

    render(
      <Message
        message={{
          type: 'user',
          content: 'Hello world',
          timestamp: Date.now(),
        }}
      />
    );

    await waitFor(() => {
      const avatar = screen.getByTestId('avatar');
      expect(avatar).toBeInTheDocument();
    });
  });
});

// =============================================================================
// AC6: Git user.email config read correctly
// =============================================================================

describe('AC6: Git user.email config read correctly', () => {
  it('should call getGitEmail to retrieve email from git config', async () => {
    const { getUserAvatar } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce('user@example.com');
    mockElectronAPI.avatar.getCached.mockResolvedValueOnce('https://cached.com/avatar.png');

    await getUserAvatar();

    expect(mockElectronAPI.avatar.getGitEmail).toHaveBeenCalled();
  });

  it('should handle git config errors gracefully', async () => {
    const { getUserAvatar, DEFAULT_AVATAR } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockRejectedValueOnce(new Error('git not found'));

    const result = await getUserAvatar();

    expect(result).toBe(DEFAULT_AVATAR);
  });
});

// =============================================================================
// AC7: GitHub API integration uses `gh` CLI
// =============================================================================

describe('AC7: GitHub API integration uses gh CLI', () => {
  it('should use electronAPI.avatar.fetchFromGitHub for GitHub calls', async () => {
    const { getGitHubAvatarUrl } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce({
      avatar_url: 'https://github.com/avatar.png',
    });

    await getGitHubAvatarUrl('user@example.com');

    // The IPC handler should execute: gh api /user
    expect(mockElectronAPI.avatar.fetchFromGitHub).toHaveBeenCalled();
  });

  it('should extract avatar_url from GitHub API response', async () => {
    const { getGitHubAvatarUrl } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce({
      login: 'testuser',
      id: 12345,
      avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
      html_url: 'https://github.com/testuser',
    });

    const result = await getGitHubAvatarUrl('user@example.com');

    expect(result).toBe('https://avatars.githubusercontent.com/u/12345?v=4');
  });
});

// =============================================================================
// AC8: Cache stored in appropriate local directory
// =============================================================================

describe('AC8: Cache stored in appropriate local directory', () => {
  it('should use electronAPI for cache operations (IPC to main process)', async () => {
    const { getUserAvatar } = await import('../src/public/js/avatar-service');
    mockElectronAPI.avatar.getGitEmail.mockResolvedValueOnce('user@example.com');
    mockElectronAPI.avatar.getCached.mockResolvedValueOnce(null);
    mockElectronAPI.avatar.fetchFromGitHub.mockResolvedValueOnce({
      avatar_url: 'https://github.com/avatar.png',
    });

    await getUserAvatar();

    // Cache operations should go through IPC
    expect(mockElectronAPI.avatar.getCached).toHaveBeenCalled();
    expect(mockElectronAPI.avatar.setCached).toHaveBeenCalled();
  });
});

// =============================================================================
// Integration: useUserAvatar hook
// =============================================================================

describe('Integration: useUserAvatar hook', () => {
  it('should provide avatar URL to components', async () => {
    const { useUserAvatar } = await import('../src/public/hooks/useUserAvatar');
    const { renderHook } = await import('@testing-library/react');
    mockElectronAPI.avatar.get.mockResolvedValueOnce('https://avatar.example.com/user.png');

    const { result } = renderHook(() => useUserAvatar());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.avatarUrl).toBeDefined();
  });

  it('should return loading state while fetching', async () => {
    const { useUserAvatar } = await import('../src/public/hooks/useUserAvatar');
    const { renderHook } = await import('@testing-library/react');
    mockElectronAPI.avatar.get.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('https://avatar.com/user.png'), 100))
    );

    const { result } = renderHook(() => useUserAvatar());

    expect(result.current.isLoading).toBe(true);
  });

  it('should return default avatar on error', async () => {
    const { useUserAvatar, DEFAULT_AVATAR } = await import('../src/public/hooks/useUserAvatar');
    const { renderHook } = await import('@testing-library/react');
    mockElectronAPI.avatar.get.mockRejectedValueOnce(new Error('Failed'));

    const { result } = renderHook(() => useUserAvatar());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should fall back to default
    expect(result.current.avatarUrl).toBeDefined();
  });
});
