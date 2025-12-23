// Pennyfarthing - Programmatic API
// For use by other tools and slash commands

export { getPackageVersion, getAssetsPath } from './cli/utils/version.js';
export {
  readManifest,
  writeManifest,
  manifestExists,
  getInstalledVersion,
  type Manifest
} from './cli/utils/manifest.js';
export {
  hashFile,
  hashString,
  pathExists,
  isDirectory,
  isSymlink,
  getAllFiles,
  getDirectoryHashes
} from './cli/utils/files.js';
export { hasSubmodule, getSubmoduleVersion } from './cli/commands/migrate.js';
