/**
 * TipTap Editor Bundle
 *
 * Bundles TipTap dependencies for browser use.
 * This file is compiled by esbuild into src/public/js/tiptap.bundle.js
 *
 * Eliminates CDN dependency by bundling @tiptap packages from node_modules.
 */

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';

// Export for use by editor.js
export { Editor, StarterKit, CodeBlock };

// Also expose on window for non-module scripts
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).TipTap = {
    Editor,
    StarterKit,
    CodeBlock,
  };
}
