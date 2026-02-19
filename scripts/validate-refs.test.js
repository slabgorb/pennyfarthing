import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { _testing } = await import('./validate-refs.js');
const {
  checkThemeAgentKeys,
  checkGuideRefs,
  checkSkillRegistry,
  checkPythonImports,
  getGuideNames,
  getPythonModules,
  getSkillNames,
  stripCodeBlocks,
} = _testing;

// Build lookup sets once for reuse
const knownAgents = new Set(['orchestrator', 'sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'tech-writer', 'ux-designer', 'devops']);
const knownGuides = getGuideNames();
const knownPythonModules = getPythonModules();

// --- Suite 1: Lookup builders ---

describe('getGuideNames', () => {
  it('returns a non-empty Set', () => {
    assert.ok(knownGuides.size > 0, `Expected guides, got ${knownGuides.size}`);
  });

  it('contains known guides', () => {
    for (const name of ['agent-behavior', 'prime', 'bikelane', 'reflector']) {
      assert.ok(knownGuides.has(name), `Missing expected guide: ${name}`);
    }
  });

  it('contains guides from subdirectories', () => {
    // guides/patterns/ contains tdd-flow-pattern.md
    const hasSubdir = [...knownGuides].some(n => n.includes('/'));
    assert.ok(hasSubdir, 'Should include guides from subdirectories like patterns/');
  });

  it('excludes non-.md entries', () => {
    for (const name of knownGuides) {
      assert.ok(!name.endsWith('.md'), `Guide name should not include .md extension: ${name}`);
    }
  });
});

describe('getPythonModules', () => {
  it('returns a non-empty Set', () => {
    assert.ok(knownPythonModules.size > 0, `Expected modules, got ${knownPythonModules.size}`);
  });

  it('contains root-level modules', () => {
    for (const name of ['cli', 'config', 'swebench']) {
      assert.ok(knownPythonModules.has(name), `Missing expected root module: ${name}`);
    }
  });

  it('contains nested modules', () => {
    for (const name of ['prime.cli', 'prime.loader', 'jira.cli']) {
      assert.ok(knownPythonModules.has(name), `Missing expected nested module: ${name}`);
    }
  });

  it('contains package names', () => {
    for (const name of ['prime', 'jira', 'sprint']) {
      assert.ok(knownPythonModules.has(name), `Missing expected package: ${name}`);
    }
  });

  it('excludes __pycache__', () => {
    for (const name of knownPythonModules) {
      assert.ok(!name.includes('__pycache__'), `Should not include __pycache__: ${name}`);
    }
  });
});

// --- Suite 2: getSkillNames ---

describe('getSkillNames', () => {
  it('returns a non-empty Set', () => {
    const skills = getSkillNames();
    assert.ok(skills.size > 0, `Expected skills, got ${skills.size}`);
  });

  it('contains core skills from pennyfarthing-dist/skills/', () => {
    const skills = getSkillNames();
    // Known core skills
    for (const name of ['pf-sprint', 'pf-workflow', 'pf-testing']) {
      assert.ok(skills.has(name), `Missing expected core skill: ${name}`);
    }
  });

  it('discovers plugin skills from packages/*/package.json', () => {
    const skills = getSkillNames();
    // packages/benchmark has pennyfarthing.skills pointing to skills/
    // which contains benchmark-related skill directories
    // If no plugin packages exist, this just verifies the scan doesn't crash
    assert.ok(skills instanceof Set, 'Should return a Set');
  });

  it('excludes non-directory entries', () => {
    const skills = getSkillNames();
    for (const name of skills) {
      assert.ok(!name.endsWith('.md'), `Skill name should not be a file: ${name}`);
      assert.ok(!name.endsWith('.yaml'), `Skill name should not be a file: ${name}`);
    }
  });
});

// --- Suite 3: Check 14 — Theme agent keys ---

describe('checkThemeAgentKeys', () => {
  it('returns no issues for valid theme YAML with known agent keys', () => {
    const yaml = `theme:\n  name: Test\nagents:\n  sm:\n    character: Test SM\n  dev:\n    character: Test Dev\n`;
    const { issues, refs } = checkThemeAgentKeys('/fake/theme.yaml', yaml, knownAgents);
    assert.equal(issues.length, 0);
    assert.equal(refs, 2);
  });

  it('returns issue for unknown agent key', () => {
    const yaml = `agents:\n  sm:\n    character: Test SM\n  fake-agent:\n    character: Does Not Exist\n`;
    const { issues, refs } = checkThemeAgentKeys('/fake/theme.yaml', yaml, knownAgents);
    assert.equal(issues.length, 1);
    assert.ok(issues[0].issue.includes('fake-agent'));
    assert.equal(refs, 2);
  });

  it('returns empty for YAML without agents map', () => {
    const yaml = `theme:\n  name: Test\nsomething_else: true\n`;
    const { issues, refs } = checkThemeAgentKeys('/fake/theme.yaml', yaml, knownAgents);
    assert.equal(issues.length, 0);
    assert.equal(refs, 0);
  });

  it('handles malformed YAML gracefully', () => {
    const { issues, refs } = checkThemeAgentKeys('/fake/theme.yaml', '{{invalid', knownAgents);
    assert.equal(issues.length, 0);
    assert.equal(refs, 0);
  });
});

// --- Suite 3: Check 15 — Guide refs in backticks ---

describe('checkGuideRefs', () => {
  it('catches `guides/nonexistent.md` reference', () => {
    const content = 'See `guides/nonexistent.md` for details.';
    const { issues, refs } = checkGuideRefs('/fake/file.md', content, knownGuides);
    assert.equal(issues.length, 1);
    assert.ok(issues[0].issue.includes('nonexistent'));
    assert.equal(refs, 1);
  });

  it('catches `.pennyfarthing/guides/nonexistent.md` reference', () => {
    const content = 'See `.pennyfarthing/guides/nonexistent.md` for details.';
    const { issues } = checkGuideRefs('/fake/file.md', content, knownGuides);
    assert.equal(issues.length, 1);
  });

  it('catches `pennyfarthing-dist/guides/nonexistent.md` reference', () => {
    const content = 'See `pennyfarthing-dist/guides/nonexistent.md` for details.';
    const { issues } = checkGuideRefs('/fake/file.md', content, knownGuides);
    assert.equal(issues.length, 1);
  });

  it('passes for `guides/agent-behavior.md` (known guide)', () => {
    const content = 'See `guides/agent-behavior.md` for details.';
    const { issues, refs } = checkGuideRefs('/fake/file.md', content, knownGuides);
    assert.equal(issues.length, 0);
    assert.equal(refs, 1);
  });

  it('ignores guide refs inside code blocks', () => {
    const content = '```\nSee `guides/nonexistent.md` for details.\n```';
    const { issues, refs } = checkGuideRefs('/fake/file.md', content, knownGuides);
    assert.equal(issues.length, 0);
    assert.equal(refs, 0);
  });

  it('catches `guides/subdir/nonexistent.md` reference', () => {
    const content = 'See `guides/subdir/nonexistent.md` for details.';
    const { issues } = checkGuideRefs('/fake/file.md', content, knownGuides);
    assert.equal(issues.length, 1);
  });

  it('passes for `guides/patterns/tdd-flow-pattern.md` (known nested guide)', () => {
    const content = 'See `guides/patterns/tdd-flow-pattern.md` for details.';
    const { issues } = checkGuideRefs('/fake/file.md', content, knownGuides);
    assert.equal(issues.length, 0);
  });
});

// --- Suite 4: Check 16 — Skill redirect targets ---

describe('checkSkillRegistry — redirect', () => {
  const knownSkills = new Set(['sprint', 'workflow', 'jira', 'story']);

  it('returns no issue when redirect target is a known skill', () => {
    const yaml = `skills:\n  story:\n    name: story\n    deprecated: true\n    redirect: sprint\n    related_skills: [sprint]\n`;
    const { issues, refs } = checkSkillRegistry('/fake/skill-registry.yaml', yaml, knownSkills);
    assert.equal(issues.length, 0);
    assert.equal(refs, 3); // skill key + related_skill + redirect
  });

  it('returns issue when redirect target is unknown', () => {
    const yaml = `skills:\n  story:\n    name: story\n    deprecated: true\n    redirect: nonexistent\n    related_skills: [sprint]\n`;
    const { issues } = checkSkillRegistry('/fake/skill-registry.yaml', yaml, knownSkills);
    const redirectIssues = issues.filter(i => i.ref.startsWith('redirect:'));
    assert.equal(redirectIssues.length, 1);
    assert.ok(redirectIssues[0].issue.includes('nonexistent'));
  });

  it('ignores entries without deprecated flag', () => {
    const yaml = `skills:\n  sprint:\n    name: sprint\n    redirect: nonexistent\n    related_skills: []\n`;
    const { issues } = checkSkillRegistry('/fake/skill-registry.yaml', yaml, knownSkills);
    const redirectIssues = issues.filter(i => i.ref.startsWith('redirect:'));
    assert.equal(redirectIssues.length, 0);
  });
});

// --- Suite 5: Check 17 — Python imports ---

describe('checkPythonImports', () => {
  it('returns no issue for valid `from pf.swebench import ...`', () => {
    const content = 'from pf.swebench import extract_patch_info\n';
    const { issues, refs } = checkPythonImports('/fake/script.py', content, knownPythonModules);
    assert.equal(issues.length, 0);
    assert.equal(refs, 1);
  });

  it('returns issue for `from pf.nonexistent import ...`', () => {
    const content = 'from pf.nonexistent import something\n';
    const { issues } = checkPythonImports('/fake/script.py', content, knownPythonModules);
    assert.equal(issues.length, 1);
    assert.ok(issues[0].issue.includes('nonexistent'));
  });

  it('ignores bare `from pf import __version__`', () => {
    const content = 'from pf import __version__\n';
    const { issues, refs } = checkPythonImports('/fake/script.py', content, knownPythonModules);
    assert.equal(issues.length, 0);
    assert.equal(refs, 0);
  });

  it('ignores comment lines', () => {
    const content = '# from pf.nonexistent import something\n';
    const { issues, refs } = checkPythonImports('/fake/script.py', content, knownPythonModules);
    assert.equal(issues.length, 0);
    assert.equal(refs, 0);
  });

  it('handles sub-module imports via package prefix', () => {
    // sprint.validate_cmd is not a direct module, but sprint is a known package
    const content = 'from pf.sprint.validate_cmd import validate_sprint_yaml\n';
    const { issues } = checkPythonImports('/fake/script.py', content, knownPythonModules);
    assert.equal(issues.length, 0);
  });
});

// --- Suite 6: Integration test ---

describe('integration: full validator run', () => {
  it('runs without crashing', () => {
    const scriptPath = resolve(__dirname, 'validate-refs.js');
    // Run without --strict so it exits 0 even with warnings
    const result = execFileSync('node', [scriptPath], {
      encoding: 'utf-8',
      timeout: 30000,
    });
    assert.ok(result.includes('Known agents:'), 'Should print agent count');
    assert.ok(result.includes('Known guides:'), 'Should print guide count');
    assert.ok(result.includes('Known Python modules:'), 'Should print Python module count');
    assert.ok(result.includes('Summary:'), 'Should print summary');
  });
});
