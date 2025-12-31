import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import fsExtra from 'fs-extra';
const { ensureDirSync } = fsExtra;
const MANIFEST_PATH = '.claude/manifest.json';
/**
 * Get the full path to the manifest file
 */
export function getManifestPath(projectRoot) {
    return join(projectRoot, MANIFEST_PATH);
}
/**
 * Check if a manifest exists
 */
export function manifestExists(projectRoot) {
    return existsSync(getManifestPath(projectRoot));
}
/**
 * Read the manifest file
 */
export function readManifest(projectRoot) {
    const manifestPath = getManifestPath(projectRoot);
    if (!existsSync(manifestPath)) {
        return null;
    }
    try {
        const content = readFileSync(manifestPath, 'utf8');
        return JSON.parse(content);
    }
    catch (error) {
        throw new Error(`Failed to read manifest: ${error}`);
    }
}
/**
 * Write the manifest file
 */
export function writeManifest(projectRoot, manifest, options) {
    if (options?.dryRun) {
        return;
    }
    const manifestPath = getManifestPath(projectRoot);
    ensureDirSync(join(projectRoot, '.claude'));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
/**
 * Create a new manifest
 */
export function createManifest(projectName, version, options) {
    const now = new Date().toISOString();
    // Managed paths depend on installation type
    const managedPaths = options.installationType === 'symlink'
        ? ['.claude/agents', '.claude/commands', '.claude/guides', '.claude/skills', '.claude/personas', '.claude/scripts']
        : ['.claude/pennyfarthing/'];
    return {
        version,
        installedAt: now,
        updatedAt: now,
        projectName,
        installationType: options.installationType,
        ...(options.nodeModulesPath && { nodeModulesPath: options.nodeModulesPath }),
        managedPaths,
        fileHashes: options.fileHashes || {},
        ...(options.migrationSource && { migrationSource: options.migrationSource })
    };
}
/**
 * Update manifest after an update
 */
export function updateManifestForUpdate(manifest, newVersion, newHashes, userModified) {
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
export function getInstalledVersion(projectRoot) {
    const manifest = readManifest(projectRoot);
    return manifest?.version || null;
}
//# sourceMappingURL=manifest.js.map