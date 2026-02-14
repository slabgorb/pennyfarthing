/**
 * Skill Documentation Generator - Story 9-4
 *
 * Generates docs/SKILLS.md from pennyfarthing-dist/skills/skill-registry.yaml.
 * Organizes skills by category with table of contents and all metadata.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { resolvePennyfarthingDist } from './portrait-resolver.js';

// ----- Types -----

export interface GeneratorOptions {
  /** Path to skill-registry.yaml (defaults to pennyfarthing-dist/skills/skill-registry.yaml) */
  registryPath?: string;
  /** Path to write output (optional - if provided with writeFile=true, writes to disk) */
  outputPath?: string;
  /** Whether to write the file to disk */
  writeFile?: boolean;
  /** Strict mode - error if required fields missing */
  strict?: boolean;
}

export interface GeneratorResult {
  /** Whether generation succeeded */
  success: boolean;
  /** Generated markdown content */
  content: string;
  /** Number of skills processed */
  skillCount: number;
  /** Path where file was written (if writeFile=true) */
  writtenTo?: string;
}

interface SkillExample {
  context: string;
  invocation: string;
}

interface Skill {
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  prerequisites: string[];
  examples: SkillExample[];
  anti_patterns: string[];
  related_skills: string[];
  keywords: string[];
}

interface Registry {
  version: string;
  skills: Record<string, Skill>;
}

// ----- YAML Parser -----

/**
 * Parse inline YAML array like [tag1, tag2, tag3]
 */
function parseInlineArray(value: string): string[] {
  const match = value.match(/^\[(.*)\]$/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Simple YAML parser for skill registry.
 * Handles the specific nested structure we need without external dependencies.
 */
function parseRegistryYaml(content: string): Registry {
  // Basic YAML validation - check for obvious syntax errors
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for unclosed brackets
    if ((trimmed.includes('[') && !trimmed.includes(']')) ||
        (trimmed.includes('{') && !trimmed.includes('}'))) {
      throw new Error(`Invalid YAML: unclosed bracket at line ${i + 1}`);
    }

    // Check for invalid key format (key without colon in non-array context)
    if (!trimmed.startsWith('-') && trimmed.includes(':')) {
      const colonPos = trimmed.indexOf(':');
      const beforeColon = trimmed.substring(0, colonPos);
      // Check if the part before colon looks like a valid key
      if (beforeColon.includes('[') || beforeColon.includes(']') ||
          beforeColon.includes('{') || beforeColon.includes('}')) {
        throw new Error(`Invalid YAML: malformed key at line ${i + 1}`);
      }
    }
  }

  const result: Registry = { version: '', skills: {} };

  let currentSkillKey: string | null = null;
  let currentArrayField: string | null = null;
  let insideExamples = false;

  for (const line of lines) {
    const trimmedEnd = line.trimEnd();
    const trimmed = trimmedEnd.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const colonIndex = trimmed.indexOf(':');
    const key = colonIndex >= 0 ? trimmed.substring(0, colonIndex).trim() : trimmed;
    const value = colonIndex >= 0 ? trimmed.substring(colonIndex + 1).trim() : '';

    // Top-level version
    if (indent === 0 && key === 'version') {
      result.version = value.replace(/^["']|["']$/g, '');
      continue;
    }

    // Top-level skills key
    if (indent === 0 && key === 'skills') {
      continue;
    }

    // Skill key (indent 2)
    if (indent === 2 && !trimmed.startsWith('-')) {
      currentSkillKey = key;
      result.skills[currentSkillKey] = {
        name: '',
        description: '',
        category: '',
        tags: [],
        version: '',
        prerequisites: [],
        examples: [],
        anti_patterns: [],
        related_skills: [],
        keywords: []
      };
      currentArrayField = null;
      insideExamples = false;
      continue;
    }

    // Skill fields (indent 4)
    if (indent === 4 && currentSkillKey) {
      insideExamples = false;
      currentArrayField = null;

      if (key === 'name') {
        result.skills[currentSkillKey].name = value.replace(/^["']|["']$/g, '');
      } else if (key === 'description') {
        result.skills[currentSkillKey].description = value.replace(/^["']|["']$/g, '');
      } else if (key === 'category') {
        result.skills[currentSkillKey].category = value.replace(/^["']|["']$/g, '');
      } else if (key === 'version') {
        result.skills[currentSkillKey].version = value.replace(/^["']|["']$/g, '');
      } else if (key === 'tags') {
        if (value.startsWith('[')) {
          result.skills[currentSkillKey].tags = parseInlineArray(value);
        } else {
          currentArrayField = 'tags';
        }
      } else if (key === 'keywords') {
        if (value.startsWith('[')) {
          result.skills[currentSkillKey].keywords = parseInlineArray(value);
        } else {
          currentArrayField = 'keywords';
        }
      } else if (key === 'prerequisites') {
        if (value.startsWith('[')) {
          result.skills[currentSkillKey].prerequisites = parseInlineArray(value);
        } else {
          currentArrayField = 'prerequisites';
        }
      } else if (key === 'related_skills') {
        if (value.startsWith('[')) {
          result.skills[currentSkillKey].related_skills = parseInlineArray(value);
        } else {
          currentArrayField = 'related_skills';
        }
      } else if (key === 'anti_patterns') {
        currentArrayField = 'anti_patterns';
      } else if (key === 'examples') {
        insideExamples = true;
        currentArrayField = null;
      }
      continue;
    }

    // Array items (indent 6 starting with -)
    if (indent === 6 && currentSkillKey && trimmed.startsWith('-')) {
      const afterDash = trimmed.substring(1).trim();
      const itemColonIndex = afterDash.indexOf(':');
      const itemKey = itemColonIndex >= 0 ? afterDash.substring(0, itemColonIndex).trim() : '';
      const itemValue = itemColonIndex >= 0 ? afterDash.substring(itemColonIndex + 1).trim().replace(/^["']|["']$/g, '') : afterDash.replace(/^["']|["']$/g, '');

      if (insideExamples) {
        // Start of a new example object - might have inline key:value like "- context: Running project tests"
        const newExample = { context: '', invocation: '' };
        if (itemKey === 'context') {
          newExample.context = itemValue;
        } else if (itemKey === 'invocation') {
          newExample.invocation = itemValue;
        }
        result.skills[currentSkillKey].examples.push(newExample);
      } else if (currentArrayField && currentArrayField in result.skills[currentSkillKey]) {
        const arr = result.skills[currentSkillKey][currentArrayField as keyof Skill];
        if (Array.isArray(arr) && typeof arr[0] !== 'object') {
          (arr as string[]).push(afterDash.replace(/^["']|["']$/g, ''));
        }
      }
      continue;
    }

    // Example sub-fields (indent 8) - continuation of example started at indent 6
    if (indent === 8 && currentSkillKey && insideExamples) {
      const examples = result.skills[currentSkillKey].examples;
      if (examples.length > 0) {
        const lastExample = examples[examples.length - 1];
        if (key === 'context') {
          lastExample.context = value.replace(/^["']|["']$/g, '');
        } else if (key === 'invocation') {
          lastExample.invocation = value.replace(/^["']|["']$/g, '');
        }
      }
      continue;
    }
  }

  return result;
}

// ----- Markdown Generation -----

/**
 * Convert category slug to display name
 */
function categoryDisplayName(category: string): string {
  const map: Record<string, string> = {
    'ai-llm': 'AI/LLM',
    'development': 'Development',
    'documentation': 'Documentation',
    'tools': 'Tools',
    'benchmarking': 'Benchmarking',
    'project-management': 'Project Management',
    'theming': 'Theming'
  };
  return map[category] || category.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Convert text to GitHub-compatible anchor
 */
function toAnchor(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-');
}

/**
 * Generate markdown for a single skill
 */
function generateSkillMarkdown(skill: Skill): string {
  const lines: string[] = [];

  lines.push(`### ${skill.name}`);
  lines.push('');
  lines.push(skill.description);
  lines.push('');

  // Tags
  if (skill.tags.length > 0) {
    lines.push(`**Tags:** ${skill.tags.join(', ')}`);
    lines.push('');
  }

  // Keywords
  if (skill.keywords.length > 0) {
    lines.push(`**Keywords:** ${skill.keywords.join(', ')}`);
    lines.push('');
  }

  // Examples
  if (skill.examples.length > 0) {
    lines.push('**Examples:**');
    for (const ex of skill.examples) {
      lines.push(`- ${ex.context}: \`${ex.invocation}\``);
    }
    lines.push('');
  }

  // Anti-patterns
  if (skill.anti_patterns.length > 0) {
    lines.push('**Anti-patterns:**');
    for (const ap of skill.anti_patterns) {
      lines.push(`- ${ap}`);
    }
    lines.push('');
  }

  // Related skills
  if (skill.related_skills.length > 0) {
    lines.push(`**Related:** ${skill.related_skills.map(s => `[${s}](#${toAnchor(s)})`).join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate full markdown documentation from registry
 */
function generateMarkdown(registry: Registry): string {
  const lines: string[] = [];

  // Header
  lines.push('# Pennyfarthing Skills Reference');
  lines.push('');
  lines.push('This document is auto-generated from `skill-registry.yaml`. Do not edit manually.');
  lines.push('');

  // Group skills by category
  const byCategory: Record<string, Skill[]> = {};
  for (const skill of Object.values(registry.skills)) {
    if (!byCategory[skill.category]) {
      byCategory[skill.category] = [];
    }
    byCategory[skill.category].push(skill);
  }

  // Sort categories alphabetically (AI/LLM first as special case)
  const sortedCategories = Object.keys(byCategory).sort((a, b) => {
    if (a === 'ai-llm') return -1;
    if (b === 'ai-llm') return 1;
    return a.localeCompare(b);
  });

  // Sort skills within each category alphabetically
  for (const cat of sortedCategories) {
    byCategory[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Table of Contents
  lines.push('## Table of Contents');
  lines.push('');
  for (const cat of sortedCategories) {
    const displayName = categoryDisplayName(cat);
    lines.push(`- [${displayName}](#${toAnchor(displayName)})`);
    for (const skill of byCategory[cat]) {
      lines.push(`  - [${skill.name}](#${toAnchor(skill.name)})`);
    }
  }
  lines.push('');

  // Categories and skills
  for (const cat of sortedCategories) {
    const displayName = categoryDisplayName(cat);
    lines.push(`## ${displayName}`);
    lines.push('');

    for (const skill of byCategory[cat]) {
      lines.push(generateSkillMarkdown(skill));
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Generated by `generate-skill-docs`*');
  lines.push('');

  return lines.join('\n');
}

// ----- Main Export -----

/**
 * Generate skill documentation from the skill registry.
 *
 * @param options - Generator options
 * @returns Promise resolving to generator result
 * @throws Error if registry not found or invalid
 */
export async function generateSkillDocs(options: GeneratorOptions = {}): Promise<GeneratorResult> {
  // Resolve registry path
  let registryPath = options.registryPath;
  if (!registryPath) {
    const distPath = resolvePennyfarthingDist();
    if (!distPath) {
      throw new Error('Registry not found: Cannot resolve pennyfarthing-dist directory');
    }
    registryPath = join(distPath, 'skills', 'skill-registry.yaml');
  }

  // Validate registry exists
  if (!existsSync(registryPath)) {
    throw new Error(`Registry not found: ${registryPath}`);
  }

  // Parse registry
  let content: string;
  try {
    content = readFileSync(registryPath, 'utf-8');
  } catch {
    throw new Error(`Cannot read registry: ${registryPath}`);
  }

  let registry: Registry;
  try {
    registry = parseRegistryYaml(content);
  } catch (err) {
    throw new Error(`Invalid YAML in registry: ${(err as Error).message}`);
  }

  // Strict mode validation
  if (options.strict) {
    for (const [key, skill] of Object.entries(registry.skills)) {
      if (!skill.description) {
        throw new Error(`Missing required field 'description' for skill: ${key}`);
      }
    }
  }

  // Generate markdown
  const markdown = generateMarkdown(registry);
  const skillCount = Object.keys(registry.skills).length;

  // Write file if requested
  let writtenTo: string | undefined;
  if (options.writeFile && options.outputPath) {
    const dir = dirname(options.outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(options.outputPath, markdown, 'utf-8');
    writtenTo = options.outputPath;
  }

  return {
    success: true,
    content: markdown,
    skillCount,
    writtenTo
  };
}

// ----- CLI Entry Point -----

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let registryPath: string | undefined;
  let outputPath: string | undefined;
  let dryRun = false;

  // Parse command-line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: generate-skill-docs [options]

Options:
  --registry <path>   Path to skill-registry.yaml
  --output <path>     Path to write output (default: docs/SKILLS.md)
  --dry-run           Print output instead of writing file
  --help, -h          Show this help

Examples:
  generate-skill-docs
  generate-skill-docs --dry-run
  generate-skill-docs --registry ./custom-registry.yaml --output ./SKILLS.md
`);
      process.exit(0);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--registry' && args[i + 1]) {
      registryPath = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i];
    }
  }

  // Default output path
  if (!outputPath && !dryRun) {
    const distPath = resolvePennyfarthingDist();
    if (distPath) {
      outputPath = join(dirname(dirname(distPath)), 'docs', 'SKILLS.md');
    }
  }

  generateSkillDocs({
    registryPath,
    outputPath,
    writeFile: !dryRun && !!outputPath
  })
    .then(result => {
      if (dryRun) {
        console.log(result.content);
      } else {
        console.log(`Generated documentation for ${result.skillCount} skills`);
        if (result.writtenTo) {
          console.log(`Written to: ${result.writtenTo}`);
        }
      }
    })
    .catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
