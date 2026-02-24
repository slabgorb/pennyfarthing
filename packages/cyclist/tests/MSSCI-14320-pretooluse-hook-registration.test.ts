/**
 * MSSCI-14320: PreToolUse Hook Registration Tests
 *
 * Verifies the cyclist pretooluse hook is registered in .claude/settings.local.json.
 *
 * Acceptance Criteria:
 * - AC2: Hook is registered in .claude/settings.local.json under hooks.PreToolUse
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SETTINGS_PATH = path.resolve(
  __dirname,
  '../../../../.claude/settings.local.json'
);

const settingsExist = fs.existsSync(SETTINGS_PATH);

describe('MSSCI-14320: PreToolUse hook registration', () => {

  describe('AC2: Hook registered in settings.local.json', () => {

    it('should have cyclist pretooluse hook in PreToolUse hooks', () => {
      if (!settingsExist) return; // Skip in CI — no .claude/settings.local.json
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);

      const cyclistHook = settings.hooks.PreToolUse.find(
        (entry: { hooks?: Array<{ command?: string }> }) =>
          entry.hooks?.some((h) =>
            h.command?.includes('cyclist-pretooluse')
          )
      );

      expect(cyclistHook).toBeDefined();
    });

    it('should use pf hooks CLI in hook command', () => {
      if (!settingsExist) return;
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));

      const cyclistHook = settings.hooks.PreToolUse.find(
        (entry: { hooks?: Array<{ command?: string }> }) =>
          entry.hooks?.some((h) =>
            h.command?.includes('cyclist-pretooluse')
          )
      );

      const command = cyclistHook?.hooks?.[0]?.command || '';
      expect(command).toContain('pf hooks');
    });

    it('should use "command" type for hook entry', () => {
      if (!settingsExist) return;
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));

      const cyclistHook = settings.hooks.PreToolUse.find(
        (entry: { hooks?: Array<{ command?: string; type?: string }> }) =>
          entry.hooks?.some((h) =>
            h.command?.includes('cyclist-pretooluse')
          )
      );

      expect(cyclistHook?.hooks?.[0]?.type).toBe('command');
    });

    it('should invoke via pf hooks wrapper', () => {
      if (!settingsExist) return;
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));

      const cyclistHook = settings.hooks.PreToolUse.find(
        (entry: { hooks?: Array<{ command?: string }> }) =>
          entry.hooks?.some((h) =>
            h.command?.includes('cyclist-pretooluse')
          )
      );

      const command = cyclistHook?.hooks?.[0]?.command || '';
      expect(command).toContain('pf hooks cyclist-pretooluse');
    });
  });
});
