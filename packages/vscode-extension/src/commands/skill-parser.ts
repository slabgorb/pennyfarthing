/**
 * Skill Parser
 *
 * Parses the skill-registry.yaml to extract skill metadata for command palette integration.
 * MSSCI-12050: Command palette integration
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Skill metadata extracted from skill-registry.yaml
 */
export interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  tags: string[];
  keywords: string[];
  examples: Array<{
    context: string;
    invocation: string;
  }>;
}

/**
 * QuickPick item for skill selection
 */
export interface SkillQuickPickItem {
  label: string;
  description: string;
  detail: string;
  skill: SkillMetadata;
}

/**
 * Parse skill-registry.yaml and return skill metadata
 *
 * Uses simple YAML parsing without external dependencies.
 * The registry format is consistent and doesn't require a full YAML parser.
 */
export function parseSkillRegistry(projectDir: string): SkillMetadata[] {
  const registryPath = path.join(
    projectDir,
    'pennyfarthing-dist',
    'skills',
    'skill-registry.yaml'
  );

  if (!fs.existsSync(registryPath)) {
    // Fallback: check .pennyfarthing symlink
    const fallbackPath = path.join(
      projectDir,
      '.pennyfarthing',
      'skills',
      'skill-registry.yaml'
    );
    if (fs.existsSync(fallbackPath)) {
      return parseYamlRegistry(fs.readFileSync(fallbackPath, 'utf-8'));
    }
    return [];
  }

  const content = fs.readFileSync(registryPath, 'utf-8');
  return parseYamlRegistry(content);
}

/**
 * Parse YAML registry content into skill metadata
 *
 * Simple line-based parser that handles the known registry format.
 * Avoids adding yaml/js-yaml dependency to keep bundle small.
 */
function parseYamlRegistry(content: string): SkillMetadata[] {
  const skills: SkillMetadata[] = [];
  const lines = content.split('\n');

  let currentSkill: Partial<SkillMetadata> | null = null;
  let currentKey = '';
  let inExamples = false;
  let currentExample: { context: string; invocation: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skill entry start (2 space indent, ends with :)
    const skillMatch = line.match(/^ {2}([a-z-]+):$/);
    if (skillMatch) {
      // Save previous skill
      if (currentSkill && currentSkill.name) {
        skills.push(normalizeSkill(currentSkill));
      }
      currentSkill = {
        name: skillMatch[1],
        description: '',
        category: 'other',
        tags: [],
        keywords: [],
        examples: [],
      };
      inExamples = false;
      continue;
    }

    if (!currentSkill) continue;

    // Property (4 space indent)
    const propMatch = line.match(/^ {4}([a-z_]+): (.*)$/);
    if (propMatch) {
      const [, key, value] = propMatch;
      currentKey = key;
      inExamples = key === 'examples';

      if (key === 'name') {
        currentSkill.name = value;
      } else if (key === 'description') {
        // Handle multi-line or single-line description
        if (value.startsWith('|')) {
          // Multi-line, collect following lines
          currentSkill.description = '';
        } else {
          currentSkill.description = value;
        }
      } else if (key === 'category') {
        currentSkill.category = value;
      } else if (key === 'tags') {
        currentSkill.tags = parseYamlArray(value);
      } else if (key === 'keywords') {
        currentSkill.keywords = parseYamlArray(value);
      }
      continue;
    }

    // Multi-line description continuation (6 space indent)
    if (currentKey === 'description' && line.match(/^ {6}\S/)) {
      const text = line.trim();
      currentSkill.description = currentSkill.description
        ? `${currentSkill.description} ${text}`
        : text;
      continue;
    }

    // Examples array item (6 space indent with -)
    if (inExamples && line.match(/^ {6}- /)) {
      // Start of example item
      const contextMatch = line.match(/^ {6}- context: (.*)$/);
      if (contextMatch) {
        if (currentExample && currentExample.invocation) {
          currentSkill.examples = currentSkill.examples || [];
          currentSkill.examples.push(currentExample);
        }
        currentExample = { context: contextMatch[1], invocation: '' };
      }
      continue;
    }

    // Example invocation (8 space indent)
    if (inExamples && currentExample && line.match(/^ {8}invocation: /)) {
      const invMatch = line.match(/^ {8}invocation: (.*)$/);
      if (invMatch) {
        currentExample.invocation = invMatch[1];
      }
      continue;
    }
  }

  // Don't forget the last skill
  if (currentSkill && currentSkill.name) {
    if (currentExample && currentExample.invocation) {
      currentSkill.examples = currentSkill.examples || [];
      currentSkill.examples.push(currentExample);
    }
    skills.push(normalizeSkill(currentSkill));
  }

  return skills;
}

/**
 * Parse YAML inline array format: [item1, item2, item3]
 */
function parseYamlArray(value: string): string[] {
  const match = value.match(/^\[(.*)\]$/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normalize partial skill to full SkillMetadata
 */
function normalizeSkill(partial: Partial<SkillMetadata>): SkillMetadata {
  return {
    name: partial.name || 'unknown',
    description: partial.description || '',
    category: partial.category || 'other',
    tags: partial.tags || [],
    keywords: partial.keywords || [],
    examples: partial.examples || [],
  };
}

/**
 * Convert skills to QuickPick items for VS Code
 */
export function skillsToQuickPickItems(
  skills: SkillMetadata[]
): SkillQuickPickItem[] {
  return skills.map((skill) => ({
    label: `/${skill.name}`,
    description: `(${skill.category})`,
    detail: skill.description,
    skill,
  }));
}

/**
 * Filter skills by search query
 * Matches against name, description, tags, and keywords
 */
export function filterSkills(
  skills: SkillMetadata[],
  query: string
): SkillMetadata[] {
  if (!query) return skills;

  const lowerQuery = query.toLowerCase();

  return skills.filter((skill) => {
    // Match name
    if (skill.name.toLowerCase().includes(lowerQuery)) return true;

    // Match description
    if (skill.description.toLowerCase().includes(lowerQuery)) return true;

    // Match tags
    if (skill.tags.some((t) => t.toLowerCase().includes(lowerQuery)))
      return true;

    // Match keywords
    if (skill.keywords.some((k) => k.toLowerCase().includes(lowerQuery)))
      return true;

    // Match category
    if (skill.category.toLowerCase().includes(lowerQuery)) return true;

    return false;
  });
}

/**
 * Group skills by category for display
 */
export function groupSkillsByCategory(
  skills: SkillMetadata[]
): Map<string, SkillMetadata[]> {
  const groups = new Map<string, SkillMetadata[]>();

  for (const skill of skills) {
    const category = skill.category;
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(skill);
  }

  return groups;
}
