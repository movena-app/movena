import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const harnessRoot = path.join(projectRoot, 'tests', 'ui', 'harness');

export default defineConfig({
  root: harnessRoot,
  publicDir: path.join(projectRoot, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(projectRoot, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [projectRoot],
    },
    watch: {
      ignored: [
        '**/coverage/**',
        '**/dist/**',
        '**/playwright-report/**',
        '**/src-tauri/target/**',
        '**/test-results/**',
      ],
    },
  },
});
