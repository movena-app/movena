# Movena architecture

Movena is a domain-oriented Tauri desktop application. React owns presentation
and client state; Rust owns native playback, credentials, filesystem access,
downloads, and validated native network/cache operations.

## Repository map

```text
.github/                 community files, templates, and workflows
config/                  specialized UI and desktop test configuration
distribution/            store and package metadata
docs/                    architecture, decisions, and release documentation
public/                  allowlisted static application assets
scripts/                 checks, setup, asset, and release tooling
src/
  app/                    providers, router, shell, startup, and composition
  modules/                product domains and their focused public contracts
  platform/               typed Tauri, window, and runtime boundaries
  shared/                 UI, design, i18n, query, notifications, pure helpers
src-tauri/src/
  app_data/               allowlisted files and application-data cleanup
  credentials/            source and Xtream operating-system vault adapters
  downloads/              download lifecycle and file deletion
  metadata/               native metadata integrations
  platform/               window commands and OS-specific window behavior
  player/                 libmpv lifecycle, options, properties, diagnostics, Twitch
  sources/                M3U/XMLTV fetching and caches
tests/
  frontend/               Vitest suites grouped by domain
  ui/                     Playwright accessibility, geometry, locale, and visual QA
  desktop/                packaged Tauri WebDriver journey
  fixtures/               shared test fixtures
```

## Frontend dependency rules

The allowed direction is:

```text
shared  ←  platform  ←  modules  ←  app
                         ↑
                  focused public contracts
```

- `shared` cannot import `platform`, `modules`, or `app`.
- `platform` can import only `shared` and external libraries.
- A module can import `shared`, `platform`, its own private files, and another
  module's focused `public/` entrypoints.
- `app` composes modules and owns no catalog, source, playback, or settings
  business logic.
- Cross-boundary imports use `@/`; relative imports stay within one boundary.
- Direct `@tauri-apps` imports exist only in `platform`.
- General catch-all `api`, `components`, `hooks`, `services`, `store`, and
  `utils` roots are intentionally forbidden.

`npm run check:architecture` enforces these rules, rejects dependency cycles,
and rejects cross-module private imports. Modules expose small, intentional
contracts under `public/` rather than eager general barrel files.

Naming follows the responsibility of the thing: route components end in
`Page`; dialogs use `Dialog`, side panels use `Drawer`, non-dialog layers use
`Overlay`, and media surfaces use plural `Details`. Components are PascalCase,
hooks start with `use`, TypeScript utilities are camelCase, and directories are
kebab-case. Initialisms use `M3u`, `Epg`, `Mpv`, `Tmdb`, `TvMaze`, `Xmltv`,
`IntroDb`, and `Xtream` consistently.

## Native boundary

Frontend code never calls Tauri through ad-hoc `invoke` or event APIs. Typed
commands and events live in `src/platform/tauri.ts`; desktop/window operations
live in `src/platform/desktop.ts`. Rust commands are registered centrally in
`src-tauri/src/lib.rs`.

Tauri command names, camelCase payload mappings, `mpv-event`, resolver events,
and download events are compatibility contracts. Moving implementation files
must not rename or reshape those boundaries.

The native layout mirrors product responsibilities:

- `player/`: manager lifecycle, command handlers, diagnostic sampling,
  allowlisted options/properties, recording paths, and Twitch resolver ownership.
- `platform/`: fullscreen/cursor commands, Windows placement, and macOS
  fullscreen, input, and mpv-surface concerns.
- `sources/`: size-limited M3U/XMLTV access, validation, conditional requests,
  and caches.
- `credentials/`: operating-system vault entries for Xtream and M3U secrets.
- `downloads/`, `metadata/`, and `app_data/`: focused native capabilities.
- `lib.rs`: plugins, managed state, command registration, and app lifecycle
  composition only.

## State and data ownership

Remote/server data belongs in TanStack Query. Local interaction and persisted
client state belong in focused Zustand stores:

- Playback: `src/modules/playback/store/usePlayerStore.ts`
- Sources: `src/modules/sources/store/useSourceStore.ts` and `useAuthStore.ts`
- Settings: `src/modules/settings/store/useSettingsStore.ts`
- Library: `src/modules/library/store/useLibraryStore.ts`
- Downloads: `src/modules/downloads/store/useDownloadStore.ts`
- Search, diagnostics, updates, verification, notifications, and context menus:
  their owning module or shared infrastructure.

Provider query keys live in `src/modules/sources/model/queryKeys.ts` and always
include an opaque source scope. They never include passwords or raw provider
URLs. Catalog mapping lives in `src/modules/catalog/data/useCatalog.ts` and is
shared through focused public contracts.

Stores separate model types, persisted schemas, migrations, and runtime actions
where responsibility warrants it. Existing localStorage keys and serialized
wire formats are compatibility contracts; runtime refactors must retain the
format or add an explicit tested migration.

The Xtream client is stateless. Source promotion, persistence, notifications,
and query invalidation are orchestrated by the sources module rather than by
the transport client. i18n receives language from `I18nProvider`; translations
outside React receive explicit language context. Shared notification and
context-menu infrastructure receive runtime preferences from app composition
and do not import product stores.

## Playback

Playback is native libmpv. Windows and Linux embed mpv using the main window
handle; macOS adopts a separate mpv-owned surface behind the transparent
webview. Do not replace this with HTML video or a browser-only fallback.

Player commands are asynchronous because teardown can cross the macOS main
queue. Playback state returns through `mpv-event`; commands do not pretend to
be authoritative state. Public commands remain:

`mpv_start`, `mpv_stop`, `mpv_play_pause`, `mpv_seek`,
`mpv_seek_relative`, `mpv_set_volume`, `mpv_set_speed`,
`mpv_set_audio_track`, `mpv_set_sub_track`, `mpv_set_recording`, and the
allowlisted `mpv_set_property` boundary.

Canonical Twitch live pages are resolved before `loadfile` by
`src-tauri/src/player/twitch_resolver.rs`. The resolver binds only to a random
`127.0.0.1` port, disables external configuration/plugin sideloading, and gives
only its validated local URL to libmpv. VODs, clips, unrelated Twitch pages,
and direct HLS URLs stay on the ordinary path.

The active `NativePlayerManager` session owns both mpv and the resolver process
group/listener. Replacement, stop, close, shutdown, and application-data
deletion terminate those resources before resolver cache removal. Resolver
URLs, tokens, paths, headers, and raw output never enter diagnostics.

macOS keeps Movena's simple fullscreen behavior rather than a native fullscreen
space. Its implementation is divided into `platform/macos/fullscreen.rs`,
`input.rs`, and `surface.rs` while sharing one private module context so the
ordering/compositing invariants remain atomic.

## Sources, credentials, and portable settings

Xtream and M3U sources retain independent profiles, runtimes, credentials,
caches, and query keys. Provider passwords and M3U connection secrets are
stored only in the operating-system credential vault. Playlist and XMLTV
downloads are size-limited, URL-validated, and use conditional HTTP validators.

Settings backups are allowlisted versioned JSON. They can contain portable
preferences and layouts, but never credentials, source or guide URLs, playlist
headers, history, favorites, diagnostics, or media caches. Imports validate and
sanitize the complete document before one store update.

## Repository checks

- `format` / `format:check`: Prettier for TS/TSX, JS/MJS, JSON, YAML, Markdown,
  and CSS. Generated licenses, builds, binaries, screenshots, caches, and
  dependency trees are excluded.
- `check:architecture`: dependency direction, public boundaries, direct Tauri
  use, and cycles.
- `check:design`: token integrity, CSS modules, shared primitives, and drift.
- `check:dead-code`: production, tests, harnesses, config, and scripts.
- `check:licenses` / `check:public-tree`: dependency notices and release-tree
  hygiene.
- `test:ui`, `test:ui:visual`, and `test:desktop`: UI and packaged desktop QA.

The production build cleans only repository-root `dist/`, then validates every
emitted asset against the release allowlist.

## Verification

```bash
npm run check
npm run build
npm run check:licenses
npm run check:public-tree
npm run test:ui
npm run test:ui:visual
npm run test:desktop:all
```

Push and pull-request CI use `.github/workflows/compliance.yml`; Linux, Windows,
and macOS jobs compile the native domains. Automated tests cannot prove native
compositing or process teardown. Before release, manually cover start/stop,
seek, tracks, fullscreen, recording, replacement, resize, close, Twitch
startup/wait/recovery, process-group teardown, and loopback-listener teardown.
