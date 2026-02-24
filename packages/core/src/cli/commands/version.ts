import { getPackageVersion } from '../utils/version.js';
import { manifestExists, readManifest } from '../utils/manifest.js';

export async function versionCommand(): Promise<void> {
  const projectRoot = process.cwd();
  const packageVersion = getPackageVersion();

  console.log(`Pennyfarthing v${packageVersion}`);

  // Check if installed in current project
  if (manifestExists(projectRoot)) {
    const manifest = readManifest(projectRoot);
    if (manifest) {
      console.log();
      console.log(`Installed: v${manifest.version} (${manifest.updatedAt.split('T')[0]})`);

      // Check for update
      if (manifest.version !== packageVersion) {
        console.log(`Latest:    v${packageVersion} (update available)`);
      }

      if (manifest.migrationSource) {
        console.log(`Migrated from: ${manifest.migrationSource}`);
      }
    }
  } else {
    console.log();
    console.log('Not installed in current project.');
    console.log('Run `pf setup` to install.');
  }
}
