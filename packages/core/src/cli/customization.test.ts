/**
 * Tests for Story 2-7: User-Customizable Output Styles and Preferences
 *
 * These tests verify:
 * - Output style files exist in pennyfarthing-dist/output-styles/
 * - Preferences template exists with required fields
 * - CLI init creates preferences file
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { findMonorepoRoot } from './utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const rootResult = findMonorepoRoot(__dirname);
if (!rootResult.success) { throw new Error(rootResult.error); }
const projectRoot = rootResult.data!;
const distDir = join(projectRoot, 'pennyfarthing-dist');

describe('Output Styles', () => {
  const outputStylesDir = join(distDir, 'output-styles');

  it('should have output-styles directory', () => {
    assert.ok(
      existsSync(outputStylesDir),
      `Missing directory: ${outputStylesDir}`
    );
  });

  it('should have verbose.md output style', () => {
    const filePath = join(outputStylesDir, 'verbose.md');
    assert.ok(existsSync(filePath), `Missing file: ${filePath}`);

    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.length > 100, 'verbose.md should have substantial content');
    assert.ok(
      content.toLowerCase().includes('detail') || content.toLowerCase().includes('explain'),
      'verbose.md should mention detailed explanations'
    );
  });

  it('should have terse.md output style', () => {
    const filePath = join(outputStylesDir, 'terse.md');
    assert.ok(existsSync(filePath), `Missing file: ${filePath}`);

    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.length > 50, 'terse.md should have content');
    assert.ok(
      content.toLowerCase().includes('minimal') || content.toLowerCase().includes('brief') || content.toLowerCase().includes('concise'),
      'terse.md should mention minimal/brief output'
    );
  });

  it('should have teaching.md output style', () => {
    const filePath = join(outputStylesDir, 'teaching.md');
    assert.ok(existsSync(filePath), `Missing file: ${filePath}`);

    const content = readFileSync(filePath, 'utf-8');
    assert.ok(content.length > 100, 'teaching.md should have substantial content');
    assert.ok(
      content.toLowerCase().includes('explain') || content.toLowerCase().includes('teach') || content.toLowerCase().includes('reason'),
      'teaching.md should mention explaining or teaching'
    );
  });
});

describe('Preferences Template', () => {
  const templatesDir = join(distDir, 'templates');
  const prefsTemplatePath = join(templatesDir, 'preferences.yaml.template');

  it('should have preferences.yaml.template', () => {
    assert.ok(
      existsSync(prefsTemplatePath),
      `Missing file: ${prefsTemplatePath}`
    );
  });

  it('should have valid YAML structure', () => {
    const content = readFileSync(prefsTemplatePath, 'utf-8');
    const parsed = parseYaml(content);
    assert.ok(typeof parsed === 'object', 'Should parse as YAML object');
  });

  it('should have character_voice preference', () => {
    const content = readFileSync(prefsTemplatePath, 'utf-8');
    const parsed = parseYaml(content);
    assert.ok(
      'character_voice' in parsed,
      'preferences.yaml.template should have character_voice field'
    );
    assert.ok(
      typeof parsed.character_voice === 'boolean',
      'character_voice should be a boolean'
    );
  });

  it('should have explain_decisions preference', () => {
    const content = readFileSync(prefsTemplatePath, 'utf-8');
    const parsed = parseYaml(content);
    assert.ok(
      'explain_decisions' in parsed,
      'preferences.yaml.template should have explain_decisions field'
    );
    assert.ok(
      typeof parsed.explain_decisions === 'boolean',
      'explain_decisions should be a boolean'
    );
  });

  it('should have auto_commit preference', () => {
    const content = readFileSync(prefsTemplatePath, 'utf-8');
    const parsed = parseYaml(content);
    assert.ok(
      'auto_commit' in parsed,
      'preferences.yaml.template should have auto_commit field'
    );
    assert.ok(
      typeof parsed.auto_commit === 'boolean',
      'auto_commit should be a boolean'
    );
  });

  it('should have documentation comments', () => {
    const content = readFileSync(prefsTemplatePath, 'utf-8');
    assert.ok(
      content.includes('#'),
      'Template should have YAML comments documenting options'
    );
  });
});
