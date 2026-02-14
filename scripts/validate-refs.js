/**
 * File Reference Validator for Pennyfarthing
 *
 * Validates cross-file references in pennyfarthing-dist/ source files.
 * Catches broken file paths, missing scripts, stale cross-references,
 * and absolute path leaks.
 *
 * What it checks:
 *  1. Workflow YAML `agent:` fields → agents/*.md
 *  2. Stepped workflow `steps.path` → directory with step files
 *  3. Workflow YAML `template:` fields → template files
 *  4. Workflow YAML string values containing relative paths → files
 *  5. Agent <helpers> subagent names → agents/*.md
 *  6. .pennyfarthing/scripts/ paths in any .md file → pennyfarthing-dist/scripts/
 *  7. python3 .pennyfarthing/scripts/ paths → pennyfarthing-dist/scripts/
 *  8. Command <related> cross-references → commands/*.md
 *  9. Skill registry related_skills → skill directories
 * 10. Markdown links [text](relative/path) → target files
 * 11. Shell source/dot-source references between scripts
 * 12. Handoff-marker.sh targets → agent names
 * 13. Absolute path leak detection (/Users/, /home/, C:\)
 * 14. Theme YAML agent keys → agents/*.md
 * 15. Guide references in backticks → guides/*.md
 * 16. Skill redirect targets → skill directories
 * 17. Python imports → pennyfarthing_scripts modules
 *
 * What it does NOT check:
 * - Runtime variables ({STORY_ID}, {project_root}, $CLAUDE_PROJECT_DIR, etc.)
 * - Workflow `variables:` block values — runtime-substituted into step templates
 * - Template output files (templates/) — reference generated siblings
 * - Session file paths (.session/) — ephemeral
 * - Sprint YAML paths — user-specific, not in pennyfarthing-dist
 * - Schema validation — separate concern
 * - OCEAN profile format in theme additional_characters
 * - Workflow trigger type taxonomy
 * - Template variable binding in workflow steps
 *
 * Usage:
 *   node scripts/validate-refs.js            # Warn on broken references (exit 0)
 *   node scripts/validate-refs.js --strict    # Fail on broken references (exit 1)
 *   node scripts/validate-refs.js --verbose   # Show all checked references
 */

import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, join, relative, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, isMap, isSeq, isScalar } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');
const DIST_DIR = join(PROJECT_ROOT, 'pennyfarthing-dist');
const VERBOSE = process.argv.includes('--verbose');
const STRICT = process.argv.includes('--strict');

// --- Constants ---

const SCAN_EXTENSIONS = new Set(['.yaml', '.yml', '.md', '.sh', '.py']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'portraits', 'templates']);

// Absolute path leak pattern
// Windows pattern requires backslash + word char to avoid matching sed expressions like PR:\*
const ABS_PATH_LEAK = /(?:\/Users\/[a-zA-Z]|\/home\/[a-zA-Z]|[A-Z]:\\[a-zA-Z])/;

// Words that indicate a line is *about* absolute paths, not an actual leak
const LEAK_META_WORDS = ['pattern', 'detect', 'check', 'leak', 'example', 'e.g.', 'ABS_PATH', 'regex'];

// --- Lookup Table Builders ---

function getAgentNames() {
  const dir = join(DIST_DIR, 'agents');
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter(f => f.endsWith('.md') && f !== 'README.md')
      .map(f => f.replace('.md', ''))
  );
}

function getCommandNames() {
  const dir = join(DIST_DIR, 'commands');
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
  );
}

function getSkillNames() {
  const names = new Set();

  // Core skills from pennyfarthing-dist/skills/
  const dir = join(DIST_DIR, 'skills');
  if (existsSync(dir)) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) names.add(e.name);
    }
  }

  // Plugin skills from packages/*/package.json with pennyfarthing.skills
  const packagesDir = join(PROJECT_ROOT, 'packages');
  if (existsSync(packagesDir)) {
    for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const pkgJson = join(packagesDir, pkg.name, 'package.json');
      if (!existsSync(pkgJson)) continue;
      try {
        const meta = JSON.parse(readFileSync(pkgJson, 'utf-8'));
        const skillsPath = meta.pennyfarthing?.skills;
        if (typeof skillsPath !== 'string') continue;
        const skillsDir = join(packagesDir, pkg.name, skillsPath);
        if (!existsSync(skillsDir)) continue;
        for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
          if (e.isDirectory()) names.add(e.name);
        }
      } catch (err) {
        if (VERBOSE) console.log(`  [skip] ${pkgJson}: ${err.message}`);
      }
    }
  }

  return names;
}

function getGuideNames() {
  const dir = join(DIST_DIR, 'guides');
  if (!existsSync(dir)) return new Set();
  const names = new Set();
  function walk(currentDir, prefix) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
        const baseName = entry.name.replace('.md', '');
        names.add(prefix ? `${prefix}/${baseName}` : baseName);
      }
    }
  }
  walk(dir, '');
  return names;
}

function getPythonModules() {
  const scriptsDir = join(PROJECT_ROOT, 'pennyfarthing_scripts');
  if (!existsSync(scriptsDir)) return new Set();
  const modules = new Set();

  function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '__pycache__' || entry.name === 'README.md') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Only recurse into Python packages (directories with __init__.py)
        if (existsSync(join(fullPath, '__init__.py'))) {
          const pkgName = prefix ? `${prefix}.${entry.name}` : entry.name;
          modules.add(pkgName);
          walk(fullPath, pkgName);
        }
      } else if (entry.isFile() && entry.name.endsWith('.py') && entry.name !== '__init__.py') {
        const modName = entry.name.replace('.py', '');
        modules.add(prefix ? `${prefix}.${modName}` : modName);
      }
    }
  }
  walk(scriptsDir, '');
  return modules;
}

// --- Output Escaping ---

function escapeAnnotation(str) {
  return str.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeTableCell(str) {
  return String(str).replaceAll('|', String.raw`\|`);
}

// --- File Discovery ---

function getSourceFiles(dir) {
  const files = [];
  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files;
}

// --- Helpers ---

function stripCodeBlocks(content) {
  // Replace code block content with empty chars but preserve newlines (for line counting)
  return content.replaceAll(/```[\s\S]*?```/g, m => m.replaceAll(/[^\n]/g, ''));
}

function offsetToLine(content, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function hasRuntimeVar(str) {
  return str.includes('{') || str.includes('$') || str.includes('{{');
}

function cleanTrailing(str) {
  return str.replace(/['")\]}>,:;]+$/, '');
}

// Issue factory
function issue(file, line, ref, msg) {
  return { file, line, ref, issue: msg };
}

// --- Validators ---

/**
 * 1. Workflow YAML `agent:` fields → agents/*.md
 */
function checkWorkflowAgents(filePath, content, agents) {
  const issues = [];
  let refs = 0;
  let doc;
  try { doc = parseDocument(content); } catch { return { issues, refs }; }

  function walk(node) {
    if (!node) return;
    if (isMap(node)) {
      for (const item of node.items) {
        const key = item.key?.value;
        if (key === 'agent' && isScalar(item.value)) {
          refs++;
          const name = item.value.value;
          if (typeof name === 'string' && !agents.has(name)) {
            const line = item.value.range ? offsetToLine(content, item.value.range[0]) : undefined;
            issues.push(issue(filePath, line, `agent: ${name}`, `Unknown agent "${name}" (no agents/${name}.md)`));
          }
        } else {
          walk(item.value);
        }
      }
    } else if (isSeq(node)) {
      for (const item of node.items) walk(item);
    }
  }
  walk(doc.contents);
  return { issues, refs };
}

/**
 * 2. Stepped workflow `steps.path` → directory with step files
 */
function checkSteppedWorkflowSteps(filePath, content) {
  const issues = [];
  let refs = 0;
  let doc;
  try { doc = parseDocument(content); } catch { return { issues, refs }; }

  const workflow = doc.get('workflow');
  if (!workflow || !isMap(workflow)) return { issues, refs };
  if (workflow.get('type') !== 'stepped') return { issues, refs };

  const steps = workflow.get('steps');
  if (!steps || !isMap(steps)) return { issues, refs };

  const stepsPath = steps.get('path');
  if (!stepsPath) return { issues, refs };

  refs++;
  const resolvedDir = resolve(dirname(filePath), stepsPath);
  if (!existsSync(resolvedDir)) {
    issues.push(issue(filePath, undefined, `steps.path: ${stepsPath}`,
      `Steps directory not found: ${relative(PROJECT_ROOT, resolvedDir)}`));
  } else {
    const stepFiles = readdirSync(resolvedDir).filter(f => f.startsWith('step-') && f.endsWith('.md'));
    if (stepFiles.length === 0) {
      issues.push(issue(filePath, undefined, `steps.path: ${stepsPath}`,
        `Steps directory empty (no step-*.md files): ${relative(PROJECT_ROOT, resolvedDir)}`));
    }
  }
  return { issues, refs };
}

/**
 * 3. Workflow YAML `template:` fields → template files
 */
function checkWorkflowTemplates(filePath, content) {
  const issues = [];
  let refs = 0;
  let doc;
  try { doc = parseDocument(content); } catch { return { issues, refs }; }

  const workflow = doc.get('workflow');
  if (!workflow || !isMap(workflow)) return { issues, refs };

  const template = workflow.get('template');
  if (!template || typeof template !== 'string') return { issues, refs };
  if (hasRuntimeVar(template)) return { issues, refs };

  refs++;
  const resolved = resolve(dirname(filePath), template);
  if (!existsSync(resolved)) {
    issues.push(issue(filePath, undefined, `template: ${template}`,
      `Template file not found: ${relative(PROJECT_ROOT, resolved)}`));
  }
  return { issues, refs };
}

/**
 * 4. YAML string values that look like relative file paths → target files
 */
function checkYamlRelativePaths(filePath, content) {
  const issues = [];
  let refs = 0;
  let doc;
  try { doc = parseDocument(content); } catch { return { issues, refs }; }

  // Match values that start with ./ or ../ and have a file extension
  const REL_PATH = /^\.\.?\/.*\.(?:md|yaml|yml|sh|py|json|txt|template\.md)$/;

  // Keys whose values are handled by dedicated checks or are runtime-resolved
  const SKIP_KEYS = new Set(['agent', 'template', 'path', 'variables']);

  function walk(node, keyPath) {
    if (!node) return;
    if (isMap(node)) {
      for (const item of node.items) {
        const key = item.key?.value ?? '?';
        const childPath = keyPath ? `${keyPath}.${key}` : String(key);
        // Skip keys handled elsewhere or containing runtime-substituted values
        if (SKIP_KEYS.has(key)) continue;
        walk(item.value, childPath);
      }
    } else if (isSeq(node)) {
      for (const [i, item] of node.items.entries()) walk(item, `${keyPath}[${i}]`);
    } else if (isScalar(node) && typeof node.value === 'string') {
      const val = node.value;
      if (REL_PATH.test(val) && !hasRuntimeVar(val)) {
        refs++;
        const resolved = resolve(dirname(filePath), val);
        if (!existsSync(resolved)) {
          const line = node.range ? offsetToLine(content, node.range[0]) : undefined;
          issues.push(issue(filePath, line, `${keyPath}: ${val}`,
            `File not found: ${relative(PROJECT_ROOT, resolved)}`));
        }
      }
    }
  }
  walk(doc.contents, '');
  return { issues, refs };
}

/**
 * 5. Agent <helpers> subagent names → agents/*.md
 */
function checkAgentSubagents(filePath, content, agents) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);

  const helpersMatch = stripped.match(/<helpers>([\s\S]*?)<\/helpers>/);
  if (!helpersMatch) return { issues, refs };

  const block = helpersMatch[1];
  const pattern = /\|\s*`([a-z][-a-z0-9]*)`\s*\|/g;
  let match;
  while ((match = pattern.exec(block)) !== null) {
    refs++;
    const name = match[1];
    if (!agents.has(name)) {
      issues.push(issue(filePath, offsetToLine(stripped, helpersMatch.index + match.index),
        `subagent: ${name}`, `Unknown subagent "${name}" (no agents/${name}.md)`));
    }
  }
  return { issues, refs };
}

/**
 * 6. .pennyfarthing/scripts/ paths in markdown → pennyfarthing-dist/scripts/
 */
function checkPennyfarthingScriptRefs(filePath, content) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);

  const SCRIPT_REF = /\.pennyfarthing\/scripts\/([^\s'"<>)`\]]+)/g;
  let match;
  while ((match = SCRIPT_REF.exec(stripped)) !== null) {
    let scriptPath = cleanTrailing(match[1]);
    if (hasRuntimeVar(scriptPath)) continue;

    refs++;
    // Strip trailing flags like --dry-run, --detect-only
    scriptPath = scriptPath.replace(/\s+--.*$/, '');

    const resolved = join(DIST_DIR, 'scripts', scriptPath);
    if (!existsSync(resolved)) {
      issues.push(issue(filePath, offsetToLine(stripped, match.index),
        `.pennyfarthing/scripts/${scriptPath}`,
        `Script not found: pennyfarthing-dist/scripts/${scriptPath}`));
    }
  }
  return { issues, refs };
}

/**
 * 7. python3 .pennyfarthing/scripts/ paths in markdown
 */
function checkPythonScriptRefs(filePath, content) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);

  const PY_REF = /python3?\s+\.pennyfarthing\/scripts\/([^\s'"<>)`\]]+\.py)/g;
  let match;
  while ((match = PY_REF.exec(stripped)) !== null) {
    const scriptPath = cleanTrailing(match[1]);
    if (hasRuntimeVar(scriptPath)) continue;

    refs++;
    const resolved = join(DIST_DIR, 'scripts', scriptPath);
    if (!existsSync(resolved)) {
      issues.push(issue(filePath, offsetToLine(stripped, match.index),
        `.pennyfarthing/scripts/${scriptPath}`,
        `Python script not found: pennyfarthing-dist/scripts/${scriptPath}`));
    }
  }
  return { issues, refs };
}

/**
 * 8. Command <related> cross-references → commands/*.md
 */
function checkCommandRelated(filePath, content, commands) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);

  const relatedMatch = stripped.match(/<related>([\s\S]*?)<\/related>/);
  if (!relatedMatch) return { issues, refs };

  const block = relatedMatch[1];
  const pattern = /\/([a-z][-a-z0-9]*)/g;
  let match;
  while ((match = pattern.exec(block)) !== null) {
    refs++;
    const cmdName = match[1];
    if (!commands.has(cmdName) && !commands.has(`pf-${cmdName}`)) {
      issues.push(issue(filePath, offsetToLine(stripped, relatedMatch.index + match.index),
        `/${cmdName}`, `Unknown command "/${cmdName}" (no commands/${cmdName}.md or pf-${cmdName}.md)`));
    }
  }
  return { issues, refs };
}

/**
 * 9. Skill registry related_skills → skill directories
 */
function checkSkillRegistry(filePath, content, skills) {
  const issues = [];
  let refs = 0;
  let doc;
  try { doc = parseDocument(content); } catch { return { issues, refs }; }

  const skillsNode = doc.get('skills');
  if (!skillsNode || !isMap(skillsNode)) return { issues, refs };

  for (const item of skillsNode.items) {
    const skillName = item.key?.value;
    if (!isMap(item.value)) continue;

    if (skillName) {
      refs++;
      if (!skills.has(skillName)) {
        issues.push(issue(filePath,
          item.key?.range ? offsetToLine(content, item.key.range[0]) : undefined,
          `skill: ${skillName}`, `Skill "${skillName}" has no directory in skills/`));
      }
    }

    const related = item.value.get('related_skills');
    if (related && isSeq(related)) {
      for (const relItem of related.items) {
        if (!isScalar(relItem)) continue;
        const relName = relItem.value;
        if (typeof relName === 'string') {
          refs++;
          if (!skills.has(relName)) {
            issues.push(issue(filePath,
              relItem.range ? offsetToLine(content, relItem.range[0]) : undefined,
              `related_skill: ${relName}`, `Unknown related skill "${relName}" (no skills/${relName}/ directory)`));
          }
        }
      }
    }

    // Check redirect targets for deprecated skills
    const deprecated = item.value.get('deprecated');
    const redirect = item.value.get('redirect', true);
    if (deprecated && redirect && isScalar(redirect)) {
      const target = redirect.value;
      if (typeof target === 'string') {
        refs++;
        if (!skills.has(target)) {
          issues.push(issue(filePath,
            redirect.range ? offsetToLine(content, redirect.range[0]) : undefined,
            `redirect: ${target}`, `Redirect target "${target}" is not a known skill`));
        }
      }
    }
  }
  return { issues, refs };
}

/**
 * 10. Markdown links [text](relative/path) → target files
 *     Only checks relative paths (starting with ./ or ../) with file extensions.
 */
function checkMarkdownLinks(filePath, content) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);

  // Match [any text](./path or ../path) with a file extension
  const LINK_REF = /\[([^\]]*)\]\((\.\.?\/[^)]+\.(?:md|yaml|yml|sh|py|json|txt))\)/g;
  let match;
  while ((match = LINK_REF.exec(stripped)) !== null) {
    const linkPath = match[2];
    if (hasRuntimeVar(linkPath)) continue;

    refs++;
    const resolved = resolve(dirname(filePath), linkPath);
    if (!existsSync(resolved)) {
      issues.push(issue(filePath, offsetToLine(stripped, match.index),
        `[${match[1]}](${linkPath})`,
        `Link target not found: ${relative(PROJECT_ROOT, resolved)}`));
    }
  }
  return { issues, refs };
}

/**
 * 11. Shell script source/dot-source references
 *     Checks `source "path"` and `. "path"` in .sh files
 */
function checkShellSourceRefs(filePath, content) {
  const issues = [];
  let refs = 0;
  const lines = content.split('\n');

  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('#')) continue;

    // Match source or . commands with quoted or unquoted paths
    // source "$SCRIPT_DIR/../lib/find-root.sh"
    // source "${SCRIPT_DIR}/file-lock.sh"
    // . "$LIB_DIR/common.sh"
    let sourceMatch = trimmed.match(/^(?:source|\.)\s+["']?(.+?)["']?\s*(?:2>.*|$)/);
    if (!sourceMatch) continue;

    let sourcePath = sourceMatch[1];

    // Skip paths with variables we can't resolve
    if (sourcePath.includes('$') || sourcePath.includes('{')) continue;

    // Skip virtual env activations and non-library sources
    if (sourcePath.includes('venv') || sourcePath.includes('.env')) continue;

    refs++;
    // Resolve relative to the script's directory
    const resolved = resolve(dirname(filePath), sourcePath);
    if (!existsSync(resolved)) {
      issues.push(issue(filePath, i + 1, `source ${sourcePath}`,
        `Source target not found: ${relative(PROJECT_ROOT, resolved)}`));
    }
  }
  return { issues, refs };
}

/**
 * 12. handoff-marker.sh targets → agent names
 */
function checkHandoffTargets(filePath, content, agents) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);

  const pattern = /handoff-marker\.sh\s+([a-z][-a-z0-9]*)/g;
  let match;
  while ((match = pattern.exec(stripped)) !== null) {
    const target = match[1];
    if (hasRuntimeVar(target)) continue;
    refs++;
    if (!agents.has(target)) {
      issues.push(issue(filePath, offsetToLine(stripped, match.index),
        `handoff-marker.sh ${target}`, `Handoff target "${target}" is not a known agent`));
    }
  }
  return { issues, refs };
}

/**
 * 14. Theme YAML agent keys → agents/*.md
 */
function checkThemeAgentKeys(filePath, content, agents) {
  const issues = [];
  let refs = 0;
  let doc;
  try { doc = parseDocument(content); } catch { return { issues, refs }; }

  const agentsNode = doc.get('agents', true);
  if (!agentsNode || !isMap(agentsNode)) return { issues, refs };

  for (const item of agentsNode.items) {
    const key = item.key?.value;
    if (typeof key === 'string') {
      refs++;
      if (!agents.has(key)) {
        const line = item.key.range ? offsetToLine(content, item.key.range[0]) : undefined;
        issues.push(issue(filePath, line, `agent key: ${key}`,
          `Theme agent key "${key}" has no matching agents/${key}.md`));
      }
    }
  }
  return { issues, refs };
}

/**
 * 15. Guide references in backticks → guides/*.md
 */
function checkGuideRefs(filePath, content, guides) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);

  const GUIDE_REF = /`(?:\.pennyfarthing\/|pennyfarthing-dist\/|(?:\.\.?\/)*)?guides\/([a-zA-Z0-9_/-]+)\.md`/g;
  let match;
  while ((match = GUIDE_REF.exec(stripped)) !== null) {
    refs++;
    const guideName = match[1];
    if (!guides.has(guideName)) {
      issues.push(issue(filePath, offsetToLine(stripped, match.index),
        `guides/${guideName}.md`,
        `Unknown guide "${guideName}" (no guides/${guideName}.md)`));
    }
  }
  return { issues, refs };
}

/**
 * 17. Python imports → pennyfarthing_scripts modules
 */
function checkPythonImports(filePath, content, pythonModules) {
  const issues = [];
  let refs = 0;
  const lines = content.split('\n');

  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    // from pennyfarthing_scripts.X.Y import ...
    let match = trimmed.match(/^from\s+pennyfarthing_scripts\.([a-zA-Z0-9_.]+)\s+import/);
    if (!match) {
      // import pennyfarthing_scripts.X.Y
      match = trimmed.match(/^import\s+pennyfarthing_scripts\.([a-zA-Z0-9_.]+)/);
    }
    if (!match) continue;

    refs++;
    const modulePath = match[1];
    if (!pythonModules.has(modulePath)) {
      // Also check if it's a valid sub-path of a known module (e.g., sprint.validate_cmd → sprint exists as package)
      const parts = modulePath.split('.');
      let found = false;
      // Check progressively longer prefixes: the import could be a.b.c where a.b is a module
      for (let len = parts.length; len >= 1; len--) {
        if (pythonModules.has(parts.slice(0, len).join('.'))) {
          found = true;
          break;
        }
      }
      if (!found) {
        issues.push(issue(filePath, i + 1, `pennyfarthing_scripts.${modulePath}`,
          `Unknown Python module "pennyfarthing_scripts.${modulePath}"`));
      }
    }
  }
  return { issues, refs };
}

/**
 * 13. Absolute path leak detection
 */
function checkAbsolutePathLeaks(filePath, content) {
  const issues = [];
  let refs = 0;
  const stripped = stripCodeBlocks(content);
  const lines = stripped.split('\n');

  for (const [i, line] of lines.entries()) {
    if (!ABS_PATH_LEAK.test(line)) continue;
    refs++;
    // Skip lines that are talking *about* absolute paths (meta-references)
    if (LEAK_META_WORDS.some(w => line.includes(w))) continue;
    issues.push(issue(filePath, i + 1, line.trim().substring(0, 100), 'Absolute path leak'));
  }
  return { issues, refs };
}

// --- Exports for testing ---

export const _testing = {
  checkThemeAgentKeys,
  checkGuideRefs,
  checkSkillRegistry,
  checkPythonImports,
  getGuideNames,
  getPythonModules,
  getSkillNames,
  stripCodeBlocks,
  hasRuntimeVar,
  offsetToLine,
  DIST_DIR,
  PROJECT_ROOT,
};

// --- Main ---

const _isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (_isMain) {

console.log(`\nValidating file references in: ${relative(PROJECT_ROOT, DIST_DIR)}/`);
console.log(`Mode: ${STRICT ? 'STRICT (exit 1 on issues)' : 'WARNING (exit 0)'}${VERBOSE ? ' + VERBOSE' : ''}\n`);

const agents = getAgentNames();
const commands = getCommandNames();
const skills = getSkillNames();
const guides = getGuideNames();
const pythonModules = getPythonModules();

console.log(`Known agents: ${agents.size}`);
console.log(`Known commands: ${commands.size}`);
console.log(`Known skills: ${skills.size}`);
console.log(`Known guides: ${guides.size}`);
console.log(`Known Python modules: ${pythonModules.size}`);

const files = getSourceFiles(DIST_DIR);
console.log(`Files to scan: ${files.length}\n`);

let totalChecks = 0;
let totalIssues = 0;
let filesWithIssues = 0;
const allIssues = [];
const refStats = {};

function track(name, result) {
  if (!refStats[name]) refStats[name] = { refs: 0, issues: 0 };
  refStats[name].refs += result.refs;
  refStats[name].issues += result.issues.length;
  return result.issues;
}

for (const filePath of files) {
  const relativePath = relative(PROJECT_ROOT, filePath);
  const content = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath);
  const file = basename(filePath);
  const fileIssues = [];

  const isYaml = ext === '.yaml' || ext === '.yml';
  const isMd = ext === '.md';
  const isSh = ext === '.sh';
  const inWorkflows = relativePath.includes('workflows/');
  const inAgents = relativePath.includes('agents/') && file !== 'README.md';
  const inCommands = relativePath.includes('commands/');

  // --- YAML checks ---
  if (isYaml) {
    if (inWorkflows) {
      fileIssues.push(...track('Workflow agents', checkWorkflowAgents(filePath, content, agents)));
      fileIssues.push(...track('Stepped workflow steps', checkSteppedWorkflowSteps(filePath, content)));
      fileIssues.push(...track('Workflow templates', checkWorkflowTemplates(filePath, content)));
      totalChecks += 3;
    }
    // Relative path refs in any YAML
    fileIssues.push(...track('YAML relative paths', checkYamlRelativePaths(filePath, content)));
    totalChecks += 1;

    // Skill registry
    if (file === 'skill-registry.yaml') {
      fileIssues.push(...track('Skill registry', checkSkillRegistry(filePath, content, skills)));
      totalChecks += 1;
    }

    // Theme agent keys
    if (relativePath.includes('personas/themes/')) {
      fileIssues.push(...track('Theme agent keys', checkThemeAgentKeys(filePath, content, agents)));
      totalChecks += 1;
    }
  }

  // --- Markdown checks ---
  if (isMd) {
    // Script refs (.pennyfarthing/scripts/) in ALL markdown files
    fileIssues.push(...track('Script refs', checkPennyfarthingScriptRefs(filePath, content)));
    fileIssues.push(...track('Python script refs', checkPythonScriptRefs(filePath, content)));
    totalChecks += 2;

    // Markdown relative links in ALL markdown files
    fileIssues.push(...track('Markdown links', checkMarkdownLinks(filePath, content)));
    totalChecks += 1;

    // Guide references in backticks
    fileIssues.push(...track('Guide refs', checkGuideRefs(filePath, content, guides)));
    totalChecks += 1;

    // Agent-specific checks
    if (inAgents) {
      fileIssues.push(...track('Agent subagents', checkAgentSubagents(filePath, content, agents)));
      fileIssues.push(...track('Handoff targets', checkHandoffTargets(filePath, content, agents)));
      totalChecks += 2;
    }

    // Command-specific checks
    if (inCommands) {
      fileIssues.push(...track('Command cross-refs', checkCommandRelated(filePath, content, commands)));
      totalChecks += 1;
    }
  }

  // --- Shell script checks ---
  if (isSh) {
    fileIssues.push(...track('Shell source refs', checkShellSourceRefs(filePath, content)));
    totalChecks += 1;
  }

  // --- Python checks ---
  if (extname(filePath) === '.py') {
    fileIssues.push(...track('Python imports', checkPythonImports(filePath, content, pythonModules)));
    totalChecks += 1;
  }

  // --- Universal checks ---
  fileIssues.push(...track('Absolute path leaks', checkAbsolutePathLeaks(filePath, content)));
  totalChecks += 1;

  // Report
  if (fileIssues.length > 0) {
    filesWithIssues++;
    console.log(`\n${relativePath}`);
    for (const iss of fileIssues) {
      const loc = iss.line ? `line ${iss.line}` : '';
      console.log(`  [ISSUE] ${iss.ref}${loc ? ` (${loc})` : ''}`);
      console.log(`     ${iss.issue}`);
      if (process.env.GITHUB_ACTIONS) {
        console.log(`::warning file=${relativePath},line=${iss.line || 1}::${escapeAnnotation(`${iss.issue}: ${iss.ref}`)}`);
      }
    }
    totalIssues += fileIssues.length;
    allIssues.push(...fileIssues.map(i => ({ ...i, file: relativePath })));
  } else if (VERBOSE) {
    console.log(`  [OK] ${relativePath}`);
  }
}

// Ref stats
const totalRefs = Object.values(refStats).reduce((s, v) => s + v.refs, 0);
const entries = Object.entries(refStats).filter(([, v]) => v.refs > 0).sort((a, b) => b[1].refs - a[1].refs);
const maxName = entries.reduce((m, [n]) => Math.max(m, n.length), 0);

// Summary
console.log(`\n${'─'.repeat(60)}`);
console.log(`\nReferences validated: ${totalRefs}`);
for (const [name, { refs, issues: iss }] of entries) {
  const label = name.padEnd(maxName);
  const issueStr = iss > 0 ? `  ${iss} issue${iss !== 1 ? 's' : ''}` : '';
  console.log(`  ${label}  ${String(refs).padStart(5)}${issueStr}`);
}
if (totalRefs > 0 && totalIssues > 0) {
  const pct = ((1 - totalIssues / totalRefs) * 100).toFixed(1);
  console.log(`  ${''.padEnd(maxName)}  ${String(totalRefs).padStart(5)} total  (${pct}% valid)`);
}

console.log(`\nSummary:`);
console.log(`  Files scanned: ${files.length}`);
console.log(`  Checks performed: ${totalChecks}`);
console.log(`  References validated: ${totalRefs}`);
console.log(`  Issues found: ${totalIssues}`);

if (totalIssues > 0) {
  console.log(`  ${filesWithIssues} file(s) with issues`);
  if (STRICT) {
    console.log(`\n  [STRICT MODE] Exiting with failure.`);
  } else {
    console.log(`\n  Run with --strict to treat warnings as errors.`);
  }
} else {
  console.log(`\n  All file references valid!`);
}
console.log('');

// GHA step summary
if (process.env.GITHUB_STEP_SUMMARY) {
  let summary = '## Pennyfarthing File Reference Validation\n\n';
  if (allIssues.length > 0) {
    summary += '| File | Line | Reference | Issue |\n';
    summary += '|------|------|-----------|-------|\n';
    for (const iss of allIssues) {
      summary += `| ${escapeTableCell(iss.file)} | ${iss.line || '-'} | ${escapeTableCell(iss.ref)} | ${escapeTableCell(iss.issue)} |\n`;
    }
    summary += '\n';
  }
  if (entries.length > 0) {
    summary += '### References by check\n\n';
    summary += '| Check | Refs | Issues |\n';
    summary += '|-------|-----:|-------:|\n';
    for (const [name, { refs, issues: iss }] of entries) {
      summary += `| ${escapeTableCell(name)} | ${refs} | ${iss} |\n`;
    }
    summary += `| **Total** | **${totalRefs}** | **${totalIssues}** |\n\n`;
  }
  summary += `**${files.length} files scanned, ${totalChecks} checks, ${totalRefs} refs validated, ${totalIssues} issues found**\n`;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

process.exit(totalIssues > 0 && STRICT ? 1 : 0);
} // end if (_isMain)
