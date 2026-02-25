// BikeRack mode entry point — delegator (Story 124-5)
// Full launcher logic moved to @pennyfarthing/core/bikerack/entry.
// This file remains for backward compatibility with existing build references.
//
// To launch BikeRack standalone, use the bikerack package's own entry point:
//   node packages/bikerack/dist/entry.js

console.log('[cyclist/bikerack.ts] Deprecated — use @pennyfarthing/core/bikerack/entry instead');
import('@pennyfarthing/core/bikerack/entry');
