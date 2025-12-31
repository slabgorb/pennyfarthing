export interface Manifest {
    version: string;
    installedAt: string;
    updatedAt: string;
    projectName: string;
    installationType: 'symlink' | 'copy';
    nodeModulesPath?: string;
    managedPaths: string[];
    fileHashes: Record<string, string>;
    userModified?: string[];
    migrationSource?: string;
}
/**
 * Get the full path to the manifest file
 */
export declare function getManifestPath(projectRoot: string): string;
/**
 * Check if a manifest exists
 */
export declare function manifestExists(projectRoot: string): boolean;
/**
 * Read the manifest file
 */
export declare function readManifest(projectRoot: string): Manifest | null;
/**
 * Write the manifest file
 */
export declare function writeManifest(projectRoot: string, manifest: Manifest, options?: {
    dryRun?: boolean;
}): void;
/**
 * Create a new manifest
 * Note: copy mode was deprecated in v4.0.4 - all installs now use symlink mode
 */
export declare function createManifest(projectName: string, version: string, options: {
    nodeModulesPath?: string;
    migrationSource?: string;
}): Manifest;
/**
 * Update manifest after an update
 */
export declare function updateManifestForUpdate(manifest: Manifest, newVersion: string, newHashes: Record<string, string>, userModified?: string[]): Manifest;
/**
 * Get the installed version from manifest
 */
export declare function getInstalledVersion(projectRoot: string): string | null;
//# sourceMappingURL=manifest.d.ts.map