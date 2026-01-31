/**
 * useCommandHistory Hook
 *
 * React hook for command history navigation (Up/Down arrows).
 * Story MSSCI-12717 - React Migration
 */

import { useState, useCallback, useRef } from 'react';

const HISTORY_KEY = 'cyclist-command-history';
const MAX_HISTORY = 100;

interface UseCommandHistoryResult {
  addToHistory: (command: string) => void;
  navigateUp: (currentContent: string) => string | null;
  navigateDown: () => string | null;
  resetNavigation: () => void;
}

export function useCommandHistory(): UseCommandHistoryResult {
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');

  const saveHistory = useCallback((newHistory: string[]) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const addToHistory = useCallback((command: string) => {
    if (!command.trim()) return;

    setHistory(prev => {
      // Don't add duplicate of last command
      if (prev.length > 0 && prev[prev.length - 1] === command) {
        return prev;
      }

      const newHistory = [...prev, command];
      // Trim to max size
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      saveHistory(newHistory);
      return newHistory;
    });
  }, [saveHistory]);

  const navigateUp = useCallback((currentContent: string): string | null => {
    if (history.length === 0) return null;

    // First time pressing up: save current input and start at end
    if (historyIndexRef.current === -1) {
      savedInputRef.current = currentContent;
      historyIndexRef.current = history.length - 1;
    } else if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
    } else {
      // Already at oldest command
      return null;
    }

    return history[historyIndexRef.current];
  }, [history]);

  const navigateDown = useCallback((): string | null => {
    if (historyIndexRef.current === -1) return null;

    historyIndexRef.current++;

    if (historyIndexRef.current >= history.length) {
      // Back to current input
      historyIndexRef.current = -1;
      const saved = savedInputRef.current;
      savedInputRef.current = '';
      return saved;
    }

    return history[historyIndexRef.current];
  }, [history]);

  const resetNavigation = useCallback(() => {
    historyIndexRef.current = -1;
    savedInputRef.current = '';
  }, []);

  return { addToHistory, navigateUp, navigateDown, resetNavigation };
}
