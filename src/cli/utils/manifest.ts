import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';

const { ensureDirSync } = fsExtra;

export interface Manifest {
  version: string;
  installedAt: string;
  updatedAt: string;
  projectName: string;
  managedPaths: string[];
  fileHashes: Record<string, string>;
  userModified?: string[];
  migrationSource?: string;
}

const MANIFEST_PATH = '.claude/manifest.json';

/**
 * Get the full path to the manifest file
 */
export function getManifestPath(projectRoot: string): string {
  return join(projectRoot, MANIFEST_PATH);
}

/**
 * Check if a manifest exists
 */
export function manifestExists(projectRoot: string): boolean {
  return existsSync(getManifestPath(projectRoot));
}

/**
 * Read the manifest file
 */
export function readManifest(projectRoot: string): Manifest | null {
  const manifestPath = getManifestPath(projectRoot);

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = readFileSync(manifestPath, 'utf8');
    return JSON.parse(content) as Manifest;
  } catch (error) {
    throw new Error(`Failed to read manifest: ${error}`);
  }
}

/**
 * Write the manifest file
 */
export function writeManifest(
  projectRoot: string,
  manifest: Manifest,
  options?: { dryRun?: boolean }
): void {
  if (options?.dryRun) {
    return;
  }

  const manifestPath = getManifestPath(projectRoot);
  ensureDirSync(join(projectRoot, '.claude'));

  writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );
}

/**
 * Create a new manifest
 */
export function createManifest(
  projectName: string,
  version: string,
  fileHashes: Record<string, string>,
  options?: {
    migrationSource?: string;
  }
): Manifest {
  const now = new Date().toISOString();

  return {
    version,
    installedAt: now,
    updatedAt: now,
    projectName,
    managedPaths: [
      '.claude/core/',
      '.claude/skills/',
      '.claude/personas/',
      'scripts/hooks/'
    ],
    fileHashes,
    ...(options?.migrationSource && { migrationSource: options.migrationSource })
  };
}

/**
 * Update manifest after an update
 */
export function updateManifestForUpdate(
  manifest: Manifest,
  newVersion: string,
  newHashes: Record<string, string>,
  userModified?: string[]
): Manifest {
  return {
    ...manifest,
    version: newVersion,
    updatedAt: new Date().toISOString(),
    fileHashes: newHashes,
    ...(userModified && userModified.length > 0 && { userModified })
  };
}

/**
 * Get the installed version from manifest
 */
export function getInstalledVersion(projectRoot: string): string | null {
  const manifest = readManifest(projectRoot);
  return manifest?.version || null;
}
