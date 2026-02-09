#!/usr/bin/env node
/**
 * benchmark-runner.js - Unified entry point for benchmark execution
 * Dispatches to solo-runner.sh and job-fair-runner.sh as appropriate
 *
 * Usage:
 *   benchmark-runner.js --mode catalog [--category CAT] [--format json|text]
 *   benchmark-runner.js --mode info --case CASE_ID [--format json|text]
 *   benchmark-runner.js --mode solo --case CASE_ID --agent AGENT_SPEC [--dry-run] [OUTPUT_DIR]
 *   benchmark-runner.js --mode suite --category CAT --agent AGENT_SPEC [--dry-run] [OUTPUT_DIR]
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = join(dirname(__dirname), '..', '..');
const TEST_CASES_DIR = join(PROJECT_DIR, 'benchmarks', 'test-cases');
const SCRIPTS_DIR = __dirname;

// Simple YAML field extractor using yq (already installed)
function parseYamlField(filePath, field) {
  try {
    const result = execSync(`yq -r '.${field}' "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = result.trim();
    return trimmed === 'null' ? '' : trimmed;
  } catch {
    return '';
  }
}

// Load test case metadata from YAML file
function loadTestCase(filePath) {
  try {
    const id = parseYamlField(filePath, 'id');
    if (!id) return null;

    return {
      id,
      name: parseYamlField(filePath, 'name'),
      category: parseYamlField(filePath, 'category'),
      difficulty: parseYamlField(filePath, 'difficulty'),
      agent: parseYamlField(filePath, 'agent'),
      version: parseYamlField(filePath, 'version'),
      description: parseYamlField(filePath, 'description'),
      _filePath: filePath,
    };
  } catch {
    return null;
  }
}

// Parse command line arguments
function parseArgs(argv) {
  const args = {
    mode: null,
    category: null,
    caseId: null,
    agent: null,
    format: 'text',
    dryRun: false,
    outputDir: null,
  };

  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--mode':
        args.mode = argv[++i];
        break;
      case '--category':
        args.category = argv[++i];
        break;
      case '--case':
        args.caseId = argv[++i];
        break;
      case '--agent':
        args.agent = argv[++i];
        break;
      case '--format':
        args.format = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        showUsage();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('-') && !args.outputDir) {
          args.outputDir = arg;
        }
        break;
    }
    i++;
  }

  return args;
}

function showUsage() {
  console.log(`Usage: benchmark-runner.js [OPTIONS]

Modes:
  --mode catalog    List available test cases
  --mode info       Show details of a specific test case
  --mode solo       Run single agent on single test case
  --mode suite      Run agent on all test cases in a category

Options:
  --category CAT    Filter by category (dev, architecture, code-review, etc.)
  --case CASE_ID    Test case ID (e.g., dev-001)
  --agent SPEC      Agent specification (theme:role, e.g., rome:dev)
  --format FORMAT   Output format: text (default) or json
  --dry-run         Show what would be run without executing

Examples:
  benchmark-runner.js --mode catalog
  benchmark-runner.js --mode catalog --category dev --format json
  benchmark-runner.js --mode info --case dev-001
  benchmark-runner.js --mode solo --case dev-001 --agent rome:dev --dry-run
  benchmark-runner.js --mode suite --category dev --agent rome:dev --dry-run`);
}

function error(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// Recursively find all YAML files
function findYamlFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findYamlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

// Get all test cases
function getAllTestCases(categoryFilter = null) {
  const files = findYamlFiles(TEST_CASES_DIR);
  const testCases = [];

  for (const file of files) {
    const tc = loadTestCase(file);
    if (tc && tc.id) {
      if (!categoryFilter || tc.category === categoryFilter) {
        testCases.push(tc);
      }
    }
  }

  return testCases;
}

// Find specific test case by ID
function findTestCase(caseId) {
  const files = findYamlFiles(TEST_CASES_DIR);
  for (const file of files) {
    const tc = loadTestCase(file);
    if (tc && tc.id === caseId) {
      return tc;
    }
  }
  return null;
}

// Get categories
function getCategories() {
  if (!existsSync(TEST_CASES_DIR)) return [];
  return readdirSync(TEST_CASES_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

// Catalog mode
function doCatalog(args) {
  const testCases = getAllTestCases(args.category);

  if (args.format === 'json') {
    const output = testCases.map(tc => ({
      id: tc.id,
      name: tc.name,
      category: tc.category,
      difficulty: tc.difficulty,
    }));
    console.log(JSON.stringify(output));
  } else {
    console.log('Available Test Cases:');
    console.log('');

    const categories = getCategories();
    for (const cat of categories) {
      if (args.category && cat !== args.category) continue;

      const casesInCat = testCases.filter(tc => tc.category === cat);
      if (casesInCat.length === 0 && !args.category) continue;

      console.log(`[${cat}]`);
      for (const tc of casesInCat) {
        const id = (tc.id || '').padEnd(12);
        const name = (tc.name || '').substring(0, 40).padEnd(40);
        const diff = tc.difficulty || 'unknown';
        console.log(`  ${id} ${name} (${diff})`);
      }
      console.log('');
    }
  }
}

// Info mode
function doInfo(args) {
  if (!args.caseId) {
    error('Info mode requires --case CASE_ID');
  }

  const tc = findTestCase(args.caseId);
  if (!tc) {
    error(`Test case not found: ${args.caseId}`);
  }

  if (args.format === 'json') {
    const output = {
      id: tc.id,
      name: tc.name,
      category: tc.category,
      difficulty: tc.difficulty,
      agent: tc.agent,
      version: tc.version,
      description: tc.description,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`Test Case: ${tc.id}`);
    console.log('');
    console.log(`Name:       ${tc.name}`);
    console.log(`Category:   ${tc.category}`);
    console.log(`Difficulty: ${tc.difficulty}`);
    console.log(`Agent:      ${tc.agent}`);
    console.log(`Version:    ${tc.version}`);
    console.log('');
    console.log('Description:');
    const desc = tc.description || '';
    desc.split('\n').forEach(line => console.log(`  ${line}`));
  }
}

// Solo mode
function doSolo(args) {
  if (!args.caseId) {
    error('Solo mode requires --case CASE_ID');
  }
  if (!args.agent) {
    error('Solo mode requires --agent AGENT_SPEC');
  }

  const tc = findTestCase(args.caseId);
  if (!tc) {
    error(`Test case not found: ${args.caseId}`);
  }

  const outputDir = args.outputDir || '/tmp/benchmark-results';

  if (args.dryRun) {
    const output = {
      mode: 'solo',
      test_case: args.caseId,
      agent: args.agent,
      dry_run: true,
      would_execute: `solo-runner.sh ${args.agent} ${args.caseId} ${outputDir}`,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    const soloRunner = join(SCRIPTS_DIR, 'solo-runner.sh');
    const child = spawn(soloRunner, [args.agent, args.caseId, outputDir], {
      stdio: 'inherit',
    });
    child.on('close', code => process.exit(code || 0));
  }
}

// Suite mode
function doSuite(args) {
  if (!args.category) {
    error('Suite mode requires --category CAT');
  }
  if (!args.agent) {
    error('Suite mode requires --agent AGENT_SPEC');
  }

  const testCases = getAllTestCases(args.category);
  const caseIds = testCases.map(tc => tc.id);
  const total = caseIds.length;

  if (args.dryRun) {
    const output = {
      mode: 'suite',
      category: args.category,
      agent: args.agent,
      dry_run: true,
      total_cases: total,
      cases: caseIds,
      summary: `Would run ${total} test cases in category '${args.category}'`,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    const outputDir = args.outputDir || '/tmp/benchmark-results';
    console.log(`Running suite: ${args.category} (${total} cases)`);
    console.log('');

    let passed = 0;
    let failed = 0;

    const runNext = (index) => {
      if (index >= caseIds.length) {
        console.log('');
        console.log(`Suite complete: ${passed} passed, ${failed} failed (total: ${total})`);
        process.exit(failed > 0 ? 1 : 0);
        return;
      }

      const caseId = caseIds[index];
      console.log(`[${caseId}] Running...`);

      const soloRunner = join(SCRIPTS_DIR, 'solo-runner.sh');
      const child = spawn(soloRunner, [args.agent, caseId, outputDir], {
        stdio: 'inherit',
      });

      child.on('close', code => {
        if (code === 0) {
          passed++;
        } else {
          failed++;
        }
        runNext(index + 1);
      });
    };

    runNext(0);
  }
}

// Main
function main() {
  const args = parseArgs(process.argv);

  if (!args.mode) {
    showUsage();
    process.exit(0);
  }

  const validModes = ['catalog', 'info', 'solo', 'suite'];
  if (!validModes.includes(args.mode)) {
    error(`Unknown mode: ${args.mode}. Valid modes: ${validModes.join(', ')}`);
  }

  switch (args.mode) {
    case 'catalog':
      doCatalog(args);
      break;
    case 'info':
      doInfo(args);
      break;
    case 'solo':
      doSolo(args);
      break;
    case 'suite':
      doSuite(args);
      break;
  }
}

main();
