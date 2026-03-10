import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vite config for Cyclist React renderer
// Builds from core's src/public (canonical source moved in Story 98-18)
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, '../core/src/public'),
  base: '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, '../core/src/public'),
      // Cross-package aliases for monorepo vite builds (Story 124-6)
      '@pennyfarthing/bikerack': resolve(__dirname, '../core/src/public/bikerack/index.ts'),
      '@pennyfarthing/core/components': resolve(__dirname, '../core/src/public/components'),
      '@pennyfarthing/core/hooks': resolve(__dirname, '../core/src/public/hooks'),
      '@pennyfarthing/core/styles': resolve(__dirname, '../core/src/public/styles'),
    },
  },
  // Define Node.js globals for browser - some packages check for these
  define: {
    // Stub __dirname to empty string - it's only used for optional file checks
    '__dirname': '""',
    // Prevent process checks from throwing
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  build: {
    outDir: resolve(__dirname, 'dist/public'),
    emptyOutDir: true, // Safe to clear - this is a build output directory
    rollupOptions: {
      input: {
        react: resolve(__dirname, '../core/src/public/index.tsx'),
      },
      // Mark electron as external - only available in Electron main/preload
      external: ['electron'],
      output: {
        entryFileNames: 'js/react/[name].js',
        chunkFileNames: 'js/react/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Put CSS in a predictable location without hash for easy linking
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/react.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  server: {
    // Dev server for HMR - proxies to Express backend
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  css: {
    postcss: resolve(__dirname, 'postcss.config.js'),
  },
});
