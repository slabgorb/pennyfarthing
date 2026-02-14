import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vite config for Core React UI build
// Builds React components independently from Electron
// Migrated from packages/cyclist/vite.config.ts (Story 98-18)
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/public'),
  base: '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/public'),
    },
  },
  define: {
    '__dirname': '""',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  build: {
    outDir: resolve(__dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        react: resolve(__dirname, 'src/public/index.tsx'),
      },
      external: ['electron'],
      output: {
        entryFileNames: 'js/react/[name].js',
        chunkFileNames: 'js/react/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/react.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  css: {
    postcss: resolve(__dirname, 'postcss.config.js'),
  },
});
