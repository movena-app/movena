import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/frontend/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/types/**'],
      thresholds: {
        // Ratchet the repository baseline while keeping higher, risk-based
        // gates on credential, source, player, download, and recovery paths.
        statements: 72,
        branches: 62,
        functions: 64,
        lines: 75,
        'src/api/desktop.ts': { statements: 80, branches: 70, functions: 75, lines: 80 },
        'src/api/xmltvNormalizer.ts': { statements: 80, branches: 70, functions: 75, lines: 80 },
        'src/services/credentialVault.ts': {
          statements: 80,
          branches: 70,
          functions: 75,
          lines: 80,
        },
        'src/services/m3uParser.ts': { statements: 80, branches: 70, functions: 75, lines: 80 },
        'src/api/xc.ts': { statements: 58, branches: 50, functions: 40, lines: 60 },
        'src/services/mediaDownload.ts': { statements: 70, branches: 65, functions: 68, lines: 74 },
        'src/store/useAuthStore.ts': { statements: 55, branches: 40, functions: 55, lines: 64 },
        'src/store/useSourceStore.ts': { statements: 65, branches: 52, functions: 60, lines: 70 },
        'src/store/usePlayerStore.ts': { statements: 90, branches: 80, functions: 95, lines: 94 },
        'src/components/m3u-editor/M3uEditor.tsx': {
          statements: 50,
          branches: 34,
          functions: 40,
          lines: 50,
        },
        'src/components/m3u-editor/m3uChannelTableModel.ts': {
          statements: 90,
          branches: 75,
          functions: 80,
          lines: 90,
        },
        'src/components/common/CrashRecovery.tsx': {
          statements: 85,
          branches: 60,
          functions: 95,
          lines: 85,
        },
      },
    },
  },
});
