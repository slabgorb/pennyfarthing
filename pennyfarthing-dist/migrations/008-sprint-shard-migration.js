/**
 * Migration 008: Sprint shard migration
 *
 * Converts monolithic sprint/current-sprint.yaml (with inline epic objects)
 * to sharded format (string refs + individual epic-{ref}.yaml files).
 *
 * Detects monolithic format by checking if epics[0] is a dict.
 * Extracts each inline epic to its own file and replaces with string refs.
 * Leverages logic from sprint/migrate-to-shards.py.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

export const id = '008-sprint-shard-migration';
export const description = 'Migrate monolithic sprint YAML to sharded per-epic format';

const JIRA_PATTERN = /^MSSCI-\d{5}$/;

/**
 * Get canonical reference ID for an epic.
 * Prefers Jira key (MSSCI-NNNNN), falls back to id.
 */
function getEpicRef(epic) {
  const jira = epic.jira;
  const epicId = String(epic.id || '');

  if (jira && JIRA_PATTERN.test(String(jira))) {
    return String(jira);
  }
  if (JIRA_PATTERN.test(epicId)) {
    return epicId;
  }
  return epicId;
}

/**
 * Derive filename for an epic shard file.
 * Strips 'epic-' prefix to avoid epic-epic-41.yaml doubling.
 */
function getEpicFilename(epicOrRef) {
  const ref = typeof epicOrRef === 'string' ? epicOrRef : getEpicRef(epicOrRef);
  const bare = ref.startsWith('epic-') ? ref.slice(5) : ref;
  return `epic-${bare}.yaml`;
}

/**
 * Write file atomically via tmp + rename.
 */
function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp';
  try {
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
    throw err;
  }
}

export async function up(ctx) {
  const sprintDir = join(ctx.projectRoot, 'sprint');
  const sprintPath = join(sprintDir, 'current-sprint.yaml');

  // No sprint directory or file — nothing to migrate
  if (!existsSync(sprintPath)) {
    ctx.logger.info('No sprint/current-sprint.yaml found — skipping');
    return { success: true };
  }

  const content = readFileSync(sprintPath, 'utf8');
  const data = parse(content);

  if (!data || !data.epics || !Array.isArray(data.epics)) {
    ctx.logger.info('No epics array in current-sprint.yaml — skipping');
    return { success: true };
  }

  const epics = data.epics;

  // Already sharded?
  if (epics.length === 0 || typeof epics[0] === 'string') {
    ctx.logger.info('current-sprint.yaml is already sharded');
    return { success: true };
  }

  // Monolithic format detected — extract epics to individual files
  const epicRefs = [];
  let created = 0;

  for (let i = 0; i < epics.length; i++) {
    const epic = epics[i];
    if (!epic.id) {
      ctx.logger.warning(`Epic at index ${i} has no id field — skipping`);
      continue;
    }

    const ref = getEpicRef(epic);
    const filename = getEpicFilename(epic);
    const filepath = join(sprintDir, filename);
    epicRefs.push(ref);

    if (ctx.dryRun) {
      const storyCount = Array.isArray(epic.stories) ? epic.stories.length : 0;
      ctx.logger.info(`[dry-run] Would write ${filename} (${storyCount} stories)`);
    } else {
      // Skip if shard file already exists (idempotency for partial runs)
      if (existsSync(filepath)) {
        ctx.logger.info(`${filename} already exists — skipping write`);
      } else {
        const epicYaml = stringify(epic, { lineWidth: 0 });
        atomicWrite(filepath, epicYaml);
        created++;
      }
    }
  }

  if (ctx.dryRun) {
    ctx.logger.info(`[dry-run] Would update current-sprint.yaml index with ${epicRefs.length} epic refs`);
  } else {
    // Replace inline epics with string refs
    data.epics = epicRefs;
    const indexYaml = stringify(data, { lineWidth: 0 });
    atomicWrite(sprintPath, indexYaml);
    ctx.logger.success(`Sharded ${created} epics from current-sprint.yaml`);
  }

  return { success: true };
}

export async function check(ctx) {
  const sprintPath = join(ctx.projectRoot, 'sprint', 'current-sprint.yaml');

  // No sprint file — migration not needed
  if (!existsSync(sprintPath)) {
    return true;
  }

  const content = readFileSync(sprintPath, 'utf8');
  const data = parse(content);

  if (!data || !data.epics || !Array.isArray(data.epics) || data.epics.length === 0) {
    return true; // No epics to migrate
  }

  // Already sharded if first epic is a string reference
  return typeof data.epics[0] === 'string';
}
