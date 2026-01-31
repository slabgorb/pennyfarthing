/**
 * DiffViewer.js - Compatibility stub for React migration
 *
 * The DiffViewer is now a React component at src/public/components/DiffViewer.tsx
 * This stub provides backward compatibility for vanilla JS code that still imports
 * from this location (e.g., controls.js clearDiffs).
 */

// No-op - diff state is now managed by React component
export function clearDiffs() {
  // In React architecture, dispatch event to clear diffs
  window.dispatchEvent(new CustomEvent('cyclist:clear-diffs'));
}

// Re-export for any legacy code expecting the old exports
export default {
  clearDiffs,
};
