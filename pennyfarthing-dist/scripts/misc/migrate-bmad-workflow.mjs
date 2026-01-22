#!/usr/bin/env node
/**
 * migrate-bmad-workflow.mjs - Migrate BMAD workflows to Pennyfarthing format
 *
 * Story MSSCI-12132: BMAD to Pennyfarthing migration script
 *
 * Converts BMAD workflow format to Pennyfarthing stepped workflow format:
 * - Parses BMAD workflow.md with YAML frontmatter
 * - Extracts step files and their frontmatter
 * - Converts variable syntax ({var-name} → {var_name})
 * - Generates workflow.yaml with Pennyfarthing schema
 * - Preserves tri-modal structure (steps-c, steps-v, steps-e)
 *
 * Usage: node migrate-bmad-workflow.mjs [--dry-run] <source-dir> [target-dir]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Colors
// =============================================================================

const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
};

const log = {
  info: (msg) => console.log(`${colors.blue('INFO')}: ${msg}`),
  success: (msg) => console.log(`${colors.green('SUCCESS')}: ${msg}`),
  warn: (msg) => console.log(`${colors.yellow('WARN')}: ${msg}`),
  error: (msg) => console.error(`${colors.red('ERROR')}: ${msg}`),
};

// =============================================================================
// YAML Frontmatter Parsing
// =============================================================================

/**
 * Extract YAML frontmatter from markdown content
 * Returns { frontmatter: object, content: string }
 */
function extractFrontmatter(content) {
  const lines = content.split('\n');

  // Check for opening ---
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, content };
  }

  // Find closing ---
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { frontmatter: {}, content };
  }

  // Parse frontmatter as simple key-value pairs
  const frontmatterLines = lines.slice(1, endIndex);
  const frontmatter = {};

  for (const line of frontmatterLines) {
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (match) {
      let [, key, value] = match;
      // Remove quotes
      value = value.replace(/^['"]|['"]$/g, '').trim();
      frontmatter[key] = value;
    }
  }

  // Rest of content
  const restContent = lines.slice(endIndex + 1).join('\n');

  return { frontmatter, content: restContent };
}

// =============================================================================
// Variable Conversion
// =============================================================================

/**
 * Convert BMAD-style dashed variables to Pennyfarthing underscore style
 * {var-name} → {var_name}
 */
function convertVariables(text) {
  // Repeatedly convert dashed variables until none remain
  // This handles multi-segment variables like {user-skill-level}
  let result = text;
  let prev;

  do {
    prev = result;
    result = result.replace(/\{([a-zA-Z0-9_]+)-([a-zA-Z0-9_-]+)\}/g, (match, p1, p2) => {
      // Convert all dashes in p2 to underscores
      const converted = p2.replace(/-/g, '_');
      return `{${p1}_${converted}}`;
    });
  } while (result !== prev);

  return result;
}

// =============================================================================
// Directory Helpers
// =============================================================================

/**
 * Check if workflow is tri-modal (has steps-c, steps-v, or steps-e)
 */
function isTrimodal(sourceDir) {
  return (
    fs.existsSync(path.join(sourceDir, 'steps-c')) ||
    fs.existsSync(path.join(sourceDir, 'steps-v')) ||
    fs.existsSync(path.join(sourceDir, 'steps-e'))
  );
}

/**
 * Get step directories to process
 */
function getStepDirectories(sourceDir) {
  const dirs = [];

  if (isTrimodal(sourceDir)) {
    for (const dir of ['steps-c', 'steps-v', 'steps-e']) {
      if (fs.existsSync(path.join(sourceDir, dir))) {
        dirs.push(dir);
      }
    }
  } else if (fs.existsSync(path.join(sourceDir, 'steps'))) {
    dirs.push('steps');
  }

  return dirs;
}

/**
 * Get supporting directories (templates, data, etc.)
 */
function getSupportingDirectories(sourceDir) {
  const dirs = [];

  for (const dir of ['templates', 'data', 'assets']) {
    if (fs.existsSync(path.join(sourceDir, dir))) {
      dirs.push(dir);
    }
  }

  return dirs;
}

/**
 * Get root-level template files (e.g., project-context-template.md)
 */
function getRootTemplateFiles(sourceDir) {
  const files = [];

  try {
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.includes('-template') && entry.name.endsWith('.md')) {
        files.push(entry.name);
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}

/**
 * Recursively copy directory with file transformation
 */
function copyDirWithTransform(srcDir, destDir, transform, dryRun) {
  if (!fs.existsSync(srcDir)) return;

  if (!dryRun) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirWithTransform(srcPath, destPath, transform, dryRun);
    } else if (entry.isFile()) {
      if (dryRun) {
        const content = fs.readFileSync(srcPath, 'utf-8');
        const transformed = transform(content, srcPath);
        if (content !== transformed) {
          log.info(`[DRY-RUN] Would convert variables in: ${path.relative(process.cwd(), srcPath)}`);
        }
      } else {
        const content = fs.readFileSync(srcPath, 'utf-8');
        const transformed = transform(content, srcPath);
        fs.writeFileSync(destPath, transformed, 'utf-8');
        log.success(`Copied: ${path.relative(destDir, destPath)}`);
      }
    }
  }
}

// =============================================================================
// Workflow Generation
// =============================================================================

/**
 * Generate workflow.yaml content
 */
function generateWorkflowYaml(name, description, trimodal) {
  const convertedDesc = convertVariables(description);

  let stepConfig;
  let modesConfig = '';

  if (trimodal) {
    stepConfig = `    path: ./steps-c/
    pattern: step-*.md`;
    modesConfig = `
  # Tri-modal workflow paths
  modes:
    create: ./steps-c/
    validate: ./steps-v/
    edit: ./steps-e/`;
  } else {
    stepConfig = `    path: ./steps/
    pattern: step-*.md`;
  }

  return `# ${name} Workflow - Migrated from BMAD format
# Generated by migrate-bmad-workflow.mjs

workflow:
  name: ${name}
  description: ${convertedDesc}
  version: "1.0.0"
  type: stepped

  # Step configuration
  steps:
${stepConfig}
${modesConfig}
  # Variables available in step files
  variables:
    project_root: .
    planning_artifacts: ./artifacts
    output_file: artifacts/${name}.md

  # Agent assignment (customize as needed)
  agent: architect

  # Triggers - when to suggest this workflow
  triggers:
    types: [${name}]
    tags: [${name}, stepped]
`;
}

// =============================================================================
// Main
// =============================================================================

function showHelp() {
  console.log(`
Usage: migrate-bmad-workflow.mjs [--dry-run] <source-dir> [target-dir]

Migrate BMAD workflows to Pennyfarthing stepped workflow format.

Arguments:
  source-dir   Path to BMAD workflow directory (must contain workflow.md)
  target-dir   Path to output directory (default: current directory)

Options:
  --dry-run    Show what would be done without making changes
  -h, --help   Show this help message

Examples:
  # Migrate PRD workflow to ./prd/
  migrate-bmad-workflow.mjs ~/BMAD-METHOD/workflows/prd ./prd

  # Preview migration without writing files
  migrate-bmad-workflow.mjs --dry-run ~/BMAD-METHOD/workflows/prd ./prd
`);
}

function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let dryRun = false;
  const positional = [];

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '-h' || arg === '--help') {
      showHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      log.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  // Validate arguments
  const [sourceDir, targetDir = '.'] = positional;

  if (!sourceDir) {
    log.error('Source directory required');
    showHelp();
    process.exit(1);
  }

  if (!fs.existsSync(sourceDir)) {
    log.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const workflowMdPath = path.join(sourceDir, 'workflow.md');
  if (!fs.existsSync(workflowMdPath)) {
    log.error(`workflow.md not found in ${sourceDir}`);
    process.exit(1);
  }

  // Header
  log.info('BMAD Workflow Migration');
  log.info('=======================');
  log.info(`Source: ${sourceDir}`);
  log.info(`Target: ${targetDir}`);

  if (dryRun) {
    log.warn('DRY-RUN MODE - No changes will be made');
  }

  console.log('');

  // Parse workflow.md
  const workflowContent = fs.readFileSync(workflowMdPath, 'utf-8');
  const { frontmatter } = extractFrontmatter(workflowContent);

  const name = frontmatter.name;
  const description = frontmatter.description || '';

  if (!name) {
    log.error('Could not extract workflow name from workflow.md');
    process.exit(1);
  }

  log.info(`Parsed workflow: ${name}`);
  log.info(`Description: ${description}`);

  console.log('');

  // Create target directory
  if (!dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Generate workflow.yaml
  log.info('Generating workflow.yaml');

  const trimodal = isTrimodal(sourceDir);
  const workflowYaml = generateWorkflowYaml(name, description, trimodal);

  if (dryRun) {
    log.info('[DRY-RUN] Would create: workflow.yaml');
  } else {
    fs.writeFileSync(path.join(targetDir, 'workflow.yaml'), workflowYaml, 'utf-8');
    log.success('Created workflow.yaml');
  }

  console.log('');

  // Copy step directories
  const stepDirs = getStepDirectories(sourceDir);

  for (const dir of stepDirs) {
    log.info(`Processing step directory: ${dir}`);

    if (dryRun) {
      log.info(`[DRY-RUN] Would copy and transform: ${dir}/`);
    }

    copyDirWithTransform(
      path.join(sourceDir, dir),
      path.join(targetDir, dir),
      (content, filePath) => {
        // Only convert variables in markdown files
        if (filePath.endsWith('.md')) {
          return convertVariables(content);
        }
        return content;
      },
      dryRun
    );
  }

  console.log('');

  // Copy supporting directories
  const supportDirs = getSupportingDirectories(sourceDir);

  for (const dir of supportDirs) {
    log.info(`Processing supporting directory: ${dir}`);

    if (dryRun) {
      log.info(`[DRY-RUN] Would copy: ${dir}/`);
    }

    copyDirWithTransform(
      path.join(sourceDir, dir),
      path.join(targetDir, dir),
      (content, filePath) => {
        if (filePath.endsWith('.md')) {
          return convertVariables(content);
        }
        return content;
      },
      dryRun
    );
  }

  console.log('');

  // Copy root-level template files
  const templateFiles = getRootTemplateFiles(sourceDir);

  for (const file of templateFiles) {
    log.info(`Processing root template file: ${file}`);

    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(targetDir, file);

    if (dryRun) {
      log.info(`[DRY-RUN] Would copy: ${file}`);
    } else {
      const content = fs.readFileSync(srcPath, 'utf-8');
      const transformed = convertVariables(content);
      fs.writeFileSync(destPath, transformed, 'utf-8');
      log.success(`Copied: ${file}`);
    }
  }

  console.log('');

  if (dryRun) {
    log.info('DRY-RUN complete. No files were modified.');
  } else {
    log.success('Migration complete!');
    log.info(`Output directory: ${targetDir}`);
  }
}

main();
