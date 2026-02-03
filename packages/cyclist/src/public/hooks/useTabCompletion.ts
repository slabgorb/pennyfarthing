/**
 * useTabCompletion Hook
 *
 * React hook for slash command tab completion.
 * Story MSSCI-12717 - React Migration
 */

import { useState, useCallback, useMemo } from 'react';
import { SLASH_COMMANDS, trackCommandUsage, filterCommands as filterCommandsWithFrequency, SlashCommand } from '../utils/slash-commands';

interface CompletionState {
  visible: boolean;
  commands: SlashCommand[];
  selectedIndex: number;
  prefix: string;
}

interface UseTabCompletionResult {
  state: CompletionState;
  showCompletion: (prefix: string) => void;
  hideCompletion: () => void;
  updateCompletion: (prefix: string) => void;
  navigateUp: () => void;
  navigateDown: () => void;
  selectCurrent: () => string | null;
  isVisible: boolean;
}

export function useTabCompletion(commands?: SlashCommand[]): UseTabCompletionResult {
  const allCommands = useMemo(() => commands || SLASH_COMMANDS, [commands]);

  const [state, setState] = useState<CompletionState>({
    visible: false,
    commands: [],
    selectedIndex: 0,
    prefix: '',
  });

  const filterCommands = useCallback((prefix: string): SlashCommand[] => {
    // Use frequency-aware filtering from slash-commands module
    // Falls back to basic filtering if custom commands provided
    if (commands) {
      const search = prefix.toLowerCase();
      return allCommands.filter(cmd =>
        cmd.name.toLowerCase().startsWith(search)
      );
    }
    return filterCommandsWithFrequency(prefix);
  }, [allCommands, commands]);

  const showCompletion = useCallback((prefix: string) => {
    const filtered = filterCommands(prefix);
    setState({
      visible: true,
      commands: filtered,
      selectedIndex: 0,
      prefix,
    });
  }, [filterCommands]);

  const hideCompletion = useCallback(() => {
    setState({
      visible: false,
      commands: [],
      selectedIndex: 0,
      prefix: '',
    });
  }, []);

  const updateCompletion = useCallback((prefix: string) => {
    const filtered = filterCommands(prefix);
    if (filtered.length === 0) {
      hideCompletion();
    } else {
      setState(prev => ({
        ...prev,
        commands: filtered,
        selectedIndex: 0,
        prefix,
      }));
    }
  }, [filterCommands, hideCompletion]);

  const navigateUp = useCallback(() => {
    setState(prev => {
      if (prev.commands.length === 0) return prev;
      const newIndex = prev.selectedIndex <= 0
        ? prev.commands.length - 1
        : prev.selectedIndex - 1;
      return { ...prev, selectedIndex: newIndex };
    });
  }, []);

  const navigateDown = useCallback(() => {
    setState(prev => {
      if (prev.commands.length === 0) return prev;
      const newIndex = prev.selectedIndex >= prev.commands.length - 1
        ? 0
        : prev.selectedIndex + 1;
      return { ...prev, selectedIndex: newIndex };
    });
  }, []);

  const selectCurrent = useCallback((): string | null => {
    if (!state.visible || state.commands.length === 0) return null;
    const selected = state.commands[state.selectedIndex];
    hideCompletion();
    if (selected?.name) {
      trackCommandUsage(selected.name);
    }
    return selected?.name || null;
  }, [state, hideCompletion]);

  return {
    state,
    showCompletion,
    hideCompletion,
    updateCompletion,
    navigateUp,
    navigateDown,
    selectCurrent,
    isVisible: state.visible,
  };
}
