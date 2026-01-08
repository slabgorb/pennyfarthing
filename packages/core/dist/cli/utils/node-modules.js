import { join, dirname } from 'path';
import { pathExists } from './files.js';
/**
 * Find pennyfarthing in node_modules (handles monorepo hoisting)
 * Returns the absolute path to pennyfarthing-dist/ or null if not found
 */
export function findNodeModulesPath(projectRoot) {
    // Check standard location first
    const standard = join(projectRoot, 'node_modules/pennyfarthing/pennyfarthing-dist');
    if (pathExists(standard))
        return standard;
    // Check hoisted locations (monorepo)
    let dir = dirname(projectRoot);
    while (dir !== '/' && dir !== dirname(dir)) {
        const hoisted = join(dir, 'node_modules/pennyfarthing/pennyfarthing-dist');
        if (pathExists(hoisted))
            return hoisted;
        dir = dirname(dir);
    }
    return null;
}
//# sourceMappingURL=node-modules.js.map