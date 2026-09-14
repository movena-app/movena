---
name: state-and-ipc
description: State management architecture with Zustand, TanStack Query caching, and Tauri IPC event flow. Use when modifying Zustand stores, TanStack Query hooks or keys, IPC wrappers in src/platform/tauri.ts, or credential vault operations.
---

# State and IPC

Canonical documentation: [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)

## Hooks and helpers

Derived visibility belongs in shared hooks such as `useCategories` and `useVisibleCatalog`.

## Diagnostics and IPC

- `usePlayerStore`: Event-authoritative playback diagnostics belong to the
  active playback session and reset with it.
- `useDebugStore`: In-memory application and network logs are capped at 200 and
  100 entries respectively and are redacted when exported.
- Components and stores call typed `tauriApi` methods (in
  `src/platform/tauri.ts`), never bare `invoke`.
- Credential storage uses the sources module's vault service and native
  commands under `src-tauri/src/credentials/`.
- Portable settings snapshots use the explicit `SETTINGS_SNAPSHOT_KEYS`
  allowlist and must not include credentials, provider URLs, or guide URLs.

## Tests

When changing a store, query key, mapping, fallback, IPC payload, or event:

1. Update the nearest focused test.
2. Cover isolation, invalid input, errors, and boundary behavior as relevant.
3. Run the targeted test, TypeScript checks, and `npm run check` before handoff.
