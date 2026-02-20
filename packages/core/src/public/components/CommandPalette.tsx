/**
 * CommandPalette Component
 *
 * Story MSSCI-12721 - Command Palette for keyboard-driven navigation
 *
 * Features:
 * - Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows) to open
 * - Fuzzy search filtering (via cmdk)
 * - Category grouping (Panels, Navigation, Settings, Agents)
 * - Keyboard shortcuts display
 * - Recent commands tracking
 *
 * Built on shadcn Command (cmdk) + Dialog primitives.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  Command as CommandPrimitive,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem as ShadcnCommandItem,
  CommandEmpty,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// =============================================================================
// Types
// =============================================================================

export interface Command {
  id: string;
  name: string;
  category: string;
  shortcut?: string;
  handler?: () => void;
}

export type CommandRegistry = Map<string, Command>;

// Runtime exports for testing (TypeScript interfaces don't exist at runtime)
export const Command = {} as const;
export const CommandRegistry = {} as const;

// =============================================================================
// Constants
// =============================================================================

export const COMMAND_PALETTE_TRIGGER = {
  key: 'p',
  metaKey: true,
  shiftKey: true,
};

export const COMMAND_CATEGORIES = ['Panels', 'Navigation', 'Settings', 'Agents'] as const;

export const MODAL_OVERLAY_CLASS = 'command-palette-overlay';
export const SEARCH_INPUT_ID = 'command-palette-search';
export const RESULTS_LIST_ID = 'command-palette-results';
export const CATEGORY_HEADER_CLASS = 'command-palette-category-header';
export const SHORTCUT_DISPLAY_CLASS = 'command-palette-shortcut';
export const RECENT_SECTION_CLASS = 'command-palette-recent';
export const RECENT_COMMANDS_KEY = 'cyclist:recent-commands';
export const MAX_RECENT_COMMANDS = 5;

// =============================================================================
// Default Commands
// =============================================================================

export const DEFAULT_COMMANDS: Command[] = [
  // Panels
  { id: 'toggle-diffs-panel', name: 'Toggle Diffs', category: 'Panels', shortcut: 'Cmd+Shift+1' },
  { id: 'toggle-message-panel', name: 'Toggle Messages', category: 'Panels', shortcut: 'Cmd+Shift+3' },
  { id: 'toggle-debug-panel', name: 'Toggle Debug', category: 'Panels' },

  // Navigation
  { id: 'focus-input', name: 'Focus Input', category: 'Navigation', shortcut: 'Cmd+L' },
  { id: 'scroll-to-bottom', name: 'Scroll to Bottom', category: 'Navigation', shortcut: 'Cmd+End' },
  { id: 'scroll-to-top', name: 'Scroll to Top', category: 'Navigation', shortcut: 'Cmd+Home' },

  // Settings
  { id: 'open-settings', name: 'Open Settings', category: 'Settings', shortcut: 'Cmd+,' },
  { id: 'toggle-theme', name: 'Toggle Theme', category: 'Settings' },

  // Agents
  { id: 'run-sm', name: 'Start Scrum Master', category: 'Agents' },
  { id: 'run-tea', name: 'Start TEA', category: 'Agents' },
  { id: 'run-dev', name: 'Start Dev', category: 'Agents' },
  { id: 'run-reviewer', name: 'Start Reviewer', category: 'Agents' },
];

// =============================================================================
// Selection State (module-level for imperative access)
// =============================================================================

let selectedIndex = 0;

export function getSelectedIndex(): number {
  return selectedIndex;
}

export function setSelectedIndex(index: number): void {
  selectedIndex = index;
}

export function handleArrowDown(listLength: number): void {
  selectedIndex = (selectedIndex + 1) % listLength;
}

export function handleArrowUp(listLength: number): void {
  selectedIndex = selectedIndex === 0 ? listLength - 1 : selectedIndex - 1;
}

export function scrollSelectedIntoView(): void {
  const selectedEl = document.querySelector(`[data-command-index="${selectedIndex}"]`);
  selectedEl?.scrollIntoView({ block: 'nearest' });
}

// =============================================================================
// Platform Detection
// =============================================================================

export function detectPlatform(): 'mac' | 'windows' | 'linux' {
  if (typeof navigator === 'undefined') return 'mac';
  const platform = navigator.platform?.toLowerCase() || '';
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('win')) return 'windows';
  return 'linux';
}

// =============================================================================
// Keyboard Trigger Detection
// =============================================================================

export function isCommandPaletteTrigger(event: KeyboardEvent): boolean {
  const isP = event.key.toLowerCase() === 'p';
  const hasModifier = event.metaKey || event.ctrlKey;
  const hasShift = event.shiftKey;
  return isP && hasModifier && hasShift;
}

// =============================================================================
// Shortcut Formatting
// =============================================================================

export function formatShortcut(shortcut: string, platform: 'mac' | 'windows' | 'linux'): string {
  if (platform === 'mac') {
    return shortcut
      .replace(/Cmd/g, '\u2318')
      .replace(/Shift/g, '\u21E7')
      .replace(/Alt/g, '\u2325')
      .replace(/Ctrl/g, '\u2303')
      .replace(/\+/g, '');
  }
  // Windows/Linux: Keep text but replace Cmd with Ctrl
  return shortcut.replace(/Cmd/g, 'Ctrl');
}

// =============================================================================
// Command Filtering
// =============================================================================

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;

  const lowerQuery = query.toLowerCase();

  // Score each command for fuzzy matching
  const scored = commands.map(cmd => {
    const lowerName = cmd.name.toLowerCase();
    const lowerId = cmd.id.toLowerCase();

    // Exact match in name or id
    if (lowerName.includes(lowerQuery) || lowerId.includes(lowerQuery)) {
      // Prioritize matches at start
      const startsWithBonus = lowerName.startsWith(lowerQuery) ? 100 : 0;
      return { cmd, score: 50 + startsWithBonus };
    }

    // Fuzzy match: check if all query chars appear in order
    let queryIdx = 0;
    let consecutiveBonus = 0;
    let lastMatchIdx = -1;

    for (let i = 0; i < lowerName.length && queryIdx < lowerQuery.length; i++) {
      if (lowerName[i] === lowerQuery[queryIdx]) {
        if (lastMatchIdx === i - 1) consecutiveBonus += 5;
        lastMatchIdx = i;
        queryIdx++;
      }
    }

    if (queryIdx === lowerQuery.length) {
      return { cmd, score: 10 + consecutiveBonus };
    }

    return { cmd, score: 0 };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.cmd);
}

export function highlightMatch(text: string, query: string): string {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let result = '';
  let queryIdx = 0;

  for (let i = 0; i < text.length; i++) {
    if (queryIdx < lowerQuery.length && lowerText[i] === lowerQuery[queryIdx]) {
      result += `<mark>${text[i]}</mark>`;
      queryIdx++;
    } else {
      result += text[i];
    }
  }

  return result;
}

// =============================================================================
// Category Functions
// =============================================================================

export function groupByCategory(commands: Command[]): Record<string, Command[]> {
  const grouped: Record<string, Command[]> = {};
  for (const cmd of commands) {
    if (!grouped[cmd.category]) {
      grouped[cmd.category] = [];
    }
    grouped[cmd.category].push(cmd);
  }
  return grouped;
}

export function filterByCategory(commands: Command[], category: string): Command[] {
  return commands.filter(cmd => cmd.category === category);
}

// =============================================================================
// Command Validation
// =============================================================================

export function validateCommand(cmd: unknown): boolean {
  if (!cmd || typeof cmd !== 'object') return false;
  const c = cmd as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.category === 'string'
  );
}

// =============================================================================
// Command Execution
// =============================================================================

export function executeCommand(command: Command): void {
  addToRecent(command.id);
  if (command.handler) {
    command.handler();
  }
}

// =============================================================================
// Recent Commands (localStorage)
// =============================================================================

export function getRecentCommands(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addToRecent(commandId: string): void {
  if (typeof localStorage === 'undefined') return;
  const recent = getRecentCommands().filter(id => id !== commandId);
  recent.unshift(commandId);
  const trimmed = recent.slice(0, MAX_RECENT_COMMANDS);
  localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(trimmed));
}

export function clearRecentCommands(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(RECENT_COMMANDS_KEY);
}

export function sortWithRecentFirst(commands: Command[]): Command[] {
  const recent = getRecentCommands();
  const recentSet = new Set(recent);

  const recentCmds = commands.filter(c => recentSet.has(c.id));
  const otherCmds = commands.filter(c => !recentSet.has(c.id));

  // Sort recent commands by their order in recent list
  recentCmds.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));

  return [...recentCmds, ...otherCmds];
}

// =============================================================================
// Command Registry
// =============================================================================

const commandRegistry: CommandRegistry = new Map();

export function registerCommand(command: Command): void {
  commandRegistry.set(command.id, command);
}

// Initialize default commands
DEFAULT_COMMANDS.forEach(cmd => registerCommand(cmd));

// =============================================================================
// Context and Provider
// =============================================================================

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPaletteContext(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPaletteContext must be used within CommandPaletteProvider');
  }
  return ctx;
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [commands] = useState<Command[]>(DEFAULT_COMMANDS);

  const open = useCallback(() => {
    setIsOpen(true);
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) close();
    else open();
  }, [isOpen, open, close]);

  return {
    isOpen,
    open,
    close,
    toggle,
    commands,
    selectedIndex: getSelectedIndex(),
  };
}

// =============================================================================
// Global Keyboard Listener
// =============================================================================

let globalListenerSetup = false;
let globalOpenCallback: (() => void) | null = null;

export function setupGlobalKeyboardListener(openCallback: () => void): () => void {
  globalOpenCallback = openCallback;

  if (!globalListenerSetup) {
    const handler = (event: KeyboardEvent) => {
      if (isCommandPaletteTrigger(event)) {
        event.preventDefault();
        globalOpenCallback?.();
      }
    };

    document.addEventListener('keydown', handler);
    globalListenerSetup = true;

    return () => {
      document.removeEventListener('keydown', handler);
      globalListenerSetup = false;
      globalOpenCallback = null;
    };
  }

  return () => {
    globalOpenCallback = null;
  };
}

export function focusSearchInput(): void {
  const input = document.getElementById(SEARCH_INPUT_ID);
  input?.focus();
}

export function closePalette(): void {
  // This is called imperatively; the actual close is handled by the component
  const event = new CustomEvent('cyclist:close-command-palette');
  document.dispatchEvent(event);
}

// =============================================================================
// Provider Component
// =============================================================================

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const palette = useCommandPalette();

  useEffect(() => {
    const cleanup = setupGlobalKeyboardListener(palette.open);
    return cleanup;
  }, [palette.open]);

  useEffect(() => {
    const handleClose = () => palette.close();
    document.addEventListener('cyclist:close-command-palette', handleClose);
    return () => document.removeEventListener('cyclist:close-command-palette', handleClose);
  }, [palette.close]);

  const handleExecute = useCallback((cmd: Command) => {
    executeCommand(cmd);
    palette.close();
  }, [palette.close]);

  const value: CommandPaletteContextValue = {
    isOpen: palette.isOpen,
    open: palette.open,
    close: palette.close,
    toggle: palette.toggle,
  };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        commands={palette.commands}
        isOpen={palette.isOpen}
        onClose={palette.close}
        onExecute={handleExecute}
      />
    </CommandPaletteContext.Provider>
  );
}

// =============================================================================
// CommandPalette Component (shadcn CommandDialog)
// =============================================================================

interface CommandPaletteProps {
  query?: string;
  setQuery?: (q: string) => void;
  commands: Command[];
  onClose: () => void;
  onExecute: (cmd: Command) => void;
  isOpen?: boolean;
}

function CommandPalette({
  commands,
  onClose,
  onExecute,
  isOpen = true,
}: CommandPaletteProps): React.ReactElement {
  const platform = detectPlatform();
  const recentIds = getRecentCommands();
  const grouped = groupByCategory(commands);
  const recentCommands = commands.filter(c => recentIds.includes(c.id));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="overflow-hidden p-0"
        aria-label="Command palette"
      >
        <CommandPrimitive className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <CommandInput
            placeholder="Type a command..."
            id={SEARCH_INPUT_ID}
            aria-label="Search commands"
          />
          <CommandList id={RESULTS_LIST_ID}>
            <CommandEmpty>No matching commands</CommandEmpty>

            {/* Recent Section */}
            {recentCommands.length > 0 && (
              <CommandGroup heading="Recent" className={RECENT_SECTION_CLASS}>
                {recentCommands.map((cmd) => (
                  <ShadcnCommandItem
                    key={`recent-${cmd.id}`}
                    value={cmd.name}
                    onSelect={() => onExecute(cmd)}
                    className="command-palette-item"
                  >
                    <span>{cmd.name}</span>
                    {cmd.shortcut && (
                      <CommandShortcut className={SHORTCUT_DISPLAY_CLASS}>
                        {formatShortcut(cmd.shortcut, platform)}
                      </CommandShortcut>
                    )}
                  </ShadcnCommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Grouped by Category */}
            {COMMAND_CATEGORIES.map(category => {
              const categoryCommands = grouped[category];
              if (!categoryCommands?.length) return null;

              return (
                <CommandGroup key={category} heading={category}>
                  {categoryCommands.map((cmd) => (
                    <ShadcnCommandItem
                      key={cmd.id}
                      value={cmd.name}
                      onSelect={() => onExecute(cmd)}
                      className="command-palette-item"
                    >
                      <span>{cmd.name}</span>
                      {cmd.shortcut && (
                        <CommandShortcut className={SHORTCUT_DISPLAY_CLASS}>
                          {formatShortcut(cmd.shortcut, platform)}
                        </CommandShortcut>
                      )}
                    </ShadcnCommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

// Named and default exports
export { CommandPalette };
export default CommandPalette;
