/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Frame port — OS-assigned per project (multiple Claude/Frame instances
// coexist), so the launcher passes it via FRAME_PORT from .frame-port.
// 2898 is only the fallback default — see pf/frame/app.py _resolve_port().
const FRAME = `http://localhost:${process.env.FRAME_PORT ?? '2898'}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Frame serves this directory via StaticFiles (Task 1). Gitignored;
    // shipped in the wheel as pf.frame package data (Task 10).
    outDir: '../pennyfarthing-dist/src/pf/frame/webui/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': FRAME,
      '/health': FRAME,
      '/ws': { target: FRAME.replace('http', 'ws'), ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
