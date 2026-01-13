/**
 * Skill Search Utility - Story 9-2
 *
 * Searches the skill registry by tag, keyword, category, or description query.
 * Returns matching skills with metadata for discovery and suggestions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePennyfarthingDist } from './portrait-resolver.js';

export interface SearchOptions {
  /** Filter by tag (e.g., "tdd", "quality") */
  tag?: string;
  /** Filter by keyword (e.g., "jest", "vitest") */
  keyword?: string;
  /** Search description text */
  query?: string;
  /** Filter by category (e.g., "development", "tools") */
  category?: string;
  /** Custom path to registry file (for testing) */
  registryPath?: string;
}

export interface SkillResult {
  name: string;
  description: string;
  category: string;
  tags: string[];
  keywords?: string[];
  version?: string;
  related_skills?: string[];
}

/** Valid categories from the registry */
const VALID_CATEGORIES = [
  'ai-llm',
  'documentation',
  'development',
  'tools',
  'benchmarking',
  'project-management',
  'theming'
];

interface RawSkill {
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  prerequisites: string[];
  examples: Array<{ context: string; invocation: string }>;
  anti_patterns: string[];
  related_skills: string[];
  keywords: string[];
}

interface RawRegistry {
  version: string;
  skills: Record<string, RawSkill>;
}

/**
 * Simple YAML parser for skill registry
 * Handles nested objects and arrays in the specific structure we need
 */
function parseRegistryYaml(content: string): RawRegistry {
  const result: RawRegistry = { version: '', skills: {} };
  const lines = content.split('\n');

  let currentSkillKey: string | null = null;
  let currentArrayField: string | null = null;
  let insideExamples = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const colonIndex = trimmed.indexOf(':');
    const key = colonIndex >= 0 ? trimmed.substring(0, colonIndex).trim() : trimmed.trim();
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
        // Inline array: [tag1, tag2]
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
      const itemValue = trimmed.substring(1).trim().replace(/^["']|["']$/g, '');

      if (insideExamples) {
        // Start of a new example object
        result.skills[currentSkillKey].examples.push({ context: '', invocation: '' });
      } else if (currentArrayField && currentArrayField in result.skills[currentSkillKey]) {
        const arr = result.skills[currentSkillKey][currentArrayField as keyof RawSkill];
        if (Array.isArray(arr) && typeof arr[0] !== 'object') {
          (arr as string[]).push(itemValue);
        }
      }
      continue;
    }

    // Example sub-fields (indent 8)
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
 * Search skills in the registry based on provided options.
 *
 * @param options - Search options (tag, keyword, query, category)
 * @returns Promise resolving to array of matching skills
 * @throws Error if registry file not found or invalid category
 */
export async function searchSkills(options: SearchOptions): Promise<SkillResult[]> {
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

  // Validate category if provided
  if (options.category && !VALID_CATEGORIES.includes(options.category)) {
    throw new Error(`Invalid category: ${options.category}. Valid categories: ${VALID_CATEGORIES.join(', ')}`);
  }

  // Parse registry
  const content = readFileSync(registryPath, 'utf-8');
  const registry = parseRegistryYaml(content);

  // Convert to SkillResult array
  let results: SkillResult[] = Object.values(registry.skills).map(skill => ({
    name: skill.name,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    keywords: skill.keywords.length > 0 ? skill.keywords : undefined,
    version: skill.version || undefined,
    related_skills: skill.related_skills.length > 0 ? skill.related_skills : undefined
  }));

  // Apply filters (AND logic - all filters must match)

  // Filter by category
  if (options.category) {
    results = results.filter(s => s.category === options.category);
  }

  // Filter by tag (case-insensitive)
  if (options.tag) {
    const searchTag = options.tag.toLowerCase();
    results = results.filter(s =>
      s.tags.some(t => t.toLowerCase() === searchTag)
    );
  }

  // Filter by keyword (case-insensitive)
  if (options.keyword) {
    const searchKeyword = options.keyword.toLowerCase();
    results = results.filter(s =>
      s.keywords?.some(k => k.toLowerCase() === searchKeyword)
    );
  }

  // Filter by query (searches description, case-insensitive)
  if (options.query) {
    const searchQuery = options.query.toLowerCase();
    results = results.filter(s =>
      s.description.toLowerCase().includes(searchQuery)
    );
  }

  return results;
}

// CLI entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options: SearchOptions = {};
  let jsonOutput = false;

  // Parse command-line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: skill-search [options]

Options:
  --tag <tag>        Filter by tag (e.g., "tdd", "quality")
  --keyword <kw>     Filter by keyword (e.g., "jest", "vitest")
  --query <text>     Search description text
  --category <cat>   Filter by category
  --json             Output as JSON (default: table)
  --help, -h         Show this help

Examples:
  skill-search --tag tdd
  skill-search --category development --json
  skill-search --query "TDD workflow"
`);
      process.exit(0);
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--tag' && args[i + 1]) {
      options.tag = args[++i];
    } else if (arg === '--keyword' && args[i + 1]) {
      options.keyword = args[++i];
    } else if (arg === '--query' && args[i + 1]) {
      options.query = args[++i];
    } else if (arg === '--category' && args[i + 1]) {
      options.category = args[++i];
    }
  }

  searchSkills(options)
    .then(results => {
      if (jsonOutput) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        // Table output
        if (results.length === 0) {
          console.log('No skills found matching criteria.');
        } else {
          const maxName = Math.max(...results.map(s => s.name.length), 4);
          const maxCat = Math.max(...results.map(s => s.category.length), 8);

          console.log(`${'NAME'.padEnd(maxName)}  ${'CATEGORY'.padEnd(maxCat)}  DESCRIPTION`);
          console.log(`${'-'.repeat(maxName)}  ${'-'.repeat(maxCat)}  ${'-'.repeat(40)}`);

          for (const skill of results) {
            const desc = skill.description.length > 50
              ? skill.description.substring(0, 47) + '...'
              : skill.description;
            console.log(`${skill.name.padEnd(maxName)}  ${skill.category.padEnd(maxCat)}  ${desc}`);
          }
        }
      }
    })
    .catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
