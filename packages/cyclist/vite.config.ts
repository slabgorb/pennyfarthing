import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vite config for Cyclist React renderer
// Builds React components while coexisting with vanilla JS
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/public'),
  base: '/',
  build: {
    outDir: resolve(__dirname, 'src/public'),
    emptyOutDir: false, // Don't wipe existing source files
    rollupOptions: {
      input: {
        react: resolve(__dirname, 'src/public/index.tsx'),
      },
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
