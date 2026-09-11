# Changelog

All notable changes to Movena are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for tagged releases.

## [Unreleased]

## [0.1.15] - 2026-09-11

### Fixed

- fixed LiveTV cards showing a fake quality badge (e.g. "4K") next to the real one once verified
- reworked the "4K Ultra HD" category so it trusts a verified resolution over the provider's claim, both for its count and for what actually shows up when you open it

### Added

- added a one-time notice on the "4K Ultra HD" category explaining that unverified channels are grouped by the provider's own label, not a guarantee

## [0.1.14] - 2026-09-09

### Fixed

- fixed Badges on LiveTV Section
- fixed Skip Intro pausing the VOD
- minor bug fixes

## [0.1.13] - 2026-08-29

This maintenance release reorganizes Movena around explicit product-domain
boundaries, standardizes repository tooling and naming, and strengthens
responsive, accessibility, visual, and packaged-desktop verification without
changing routes, persisted data formats, Tauri commands, or playback events.

### Added

- Added automated architecture enforcement for layer violations, cross-module
  private imports, direct Tauri usage outside the platform boundary, and
  TypeScript dependency cycles.
- Added Prettier configuration and repository-wide `format` and `format:check`
  commands, with formatting enforced by the main quality gate.
- Added broader production-surface visual baselines and Playwright coverage for
  dark and light themes, translated copy, minimum logical window dimensions,
  high-DPI rendering, intermediate workspace widths, and global layer order.
- Added focused frontend units for application providers and startup behavior,
  route composition, EPG rows and programme details, and intentional module
  contracts exposed through `public` entry points.

### Changed

- Reorganized the frontend into `app`, domain `modules`, `platform`, and
  `shared` layers, replacing catch-all API, component, hook, service, store,
  utility, route, and page directories with explicit owners.
- Reorganized the Rust backend into player, platform, source, credential,
  download, metadata, and application-data domains while keeping native command
  names, payloads, event contracts, and playback lifecycle semantics intact.
- Made the Xtream client stateless, moved source orchestration into the sources
  domain, extracted shared media and credential contracts, and decoupled i18n,
  notifications, context menus, query infrastructure, and Tauri wrappers from
  product stores.
- Standardized internal naming for pages, dialogs, drawers, detail surfaces,
  provider initialisms, portable settings, and Xtream integrations.
- Consolidated frontend, UI, desktop, and fixture tests under `tests`, moved
  specialized test configuration under `config`, and standardized developer
  commands around `test:*`, `check:*`, and `format:*`.
- Moved community policy files under `.github`, refreshed repository skills and
  architecture documentation, and updated all canonical path references.
- Improved narrow-layout behavior for the application shell and M3U workspace,
  centralized dialog focus behavior, and kept off-screen EPG programmes out of
  keyboard navigation.

### Fixed

- Made the packaged Windows first-run journey independent of previously saved
  local settings by clearing browser persistence before reloading onboarding.
- Corrected modal, drawer, checkbox, player-control, settings, and minimum-width
  geometry and focus behavior covered by the expanded UI quality suite.
- Pinned the Microsoft Store Developer CLI for deterministic direct-MSIX
  submission and added an exact-artifact retry workflow.

## [0.1.12] - 2026-08-28

### Added

- Added a Home Layout setting under Settings > Application: choose which
  rows appear on the home page and reorder them.

### Fixed

- Fixed Skip Intro and Skip Recap: IntroDB's API always answered with a
  CORS header scoped to its own site, so the app's request was silently
  blocked before it ever reached the community timestamp data. The request
  now goes through the desktop backend instead, bypassing that restriction.

## [0.1.11] - 2026-08-28

### Added

- Added Recently Added Series and Popular Movies rows to the Discover home
  page, alongside the existing Recently Added Movies and Popular Series.
- Improved downloads:
  - Downloaded movies and episodes now play straight from disk — instantly,
    online or offline — with no provider round-trip, and resume from the
    saved watch position.
  - Added whole-season downloads from the series detail view.
  - Downloads is now a grid of movies and series (with a local per-series
    episode browser) instead of a flat transfer list, and completed
    downloads persist across restarts with their title, poster, and
    series/season/episode metadata.
  - Added a "Downloaded" badge to catalogue cards, and removing a download
    now deletes the file from disk instead of only forgetting it.
  - The player's download button now hides itself once you're already
    playing a local copy.

## [0.1.10] - 2026-08-27

This maintenance release hardens native platform safety, cleans codebase
architecture and config boundaries, updates factual documentation and privacy
disclosures, and upgrades all showcase screenshot assets to 2x Retina with 4K
master frames.

### Added

- Added new high-resolution screenshot captures for the Coming Up release
  calendar (`upcoming.webp`), clean Light theme (`light-theme.webp`), Series
  player with populated episode navigation drawer (`player-series.webp`), and
  M3U raw syntax editor (`m3u-raw-editor.webp`).
- Added IntroDB network connection disclosure (`api.introdb.app`) in the privacy
  policy alongside TMDB and TVmaze, and updated asset attribution disclaimers.
- Added `initialMode` support to `M3uEditor` component for direct raw syntax
  view activation.

### Changed

- Upgraded all README product tour screenshot captures to 2x Hi-DPI (Retina)
  resolution with uncompressed 4K master frames and hydrated fixture data.
- Upgraded WinGet manifest with `Moniker: movena` for unambiguous package
  matching on `winget install movena`.
- Aligned ESLint and Knip configurations across test and config files.

### Fixed

- Hardened macOS native window embedding with safe `contentView` handling and
  poisoned mutex lock recovery.
- Removed dead parameters and redundant OS directory lookups in native player
  recording path resolution.
- Deduplicated source secrets constants and bundled resolver discovery in the
  Rust backend.

This release adds a complete light appearance, community-backed episode
segment skipping, more responsive VOD seeking, and the first store-oriented
Windows distribution path. It also folds the post-0.1.8 interface, project
showcase, dependency, release, and quality-gate work into one tagged build.

### Added

- Added a persisted light theme with a first-frame-safe startup application,
  theme-aware accent contrast, high-contrast and reduced-motion variants, and
  a dark playback contract that temporarily overrides the saved app theme.
- Added IntroDB intro, recap, and outro timestamp lookup, resolving series IMDb
  identifiers through TMDB when configured and TVmaze as the public fallback.
  Embedded media chapters remain preferred when both sources have data.
- Added separate Skip Intro and Skip Recap controls, optional automatic
  intro/recap skipping, IntroDB and auto-skip preferences, localized copy, and
  IntroDB attribution in the About and third-party documentation.
- Added seekbar hover timestamps, live scrubbing feedback, and immediate
  optimistic timeline/buffering feedback for absolute and relative VOD seeks.
- Added Microsoft Store MSIX build and optional submission automation, WinGet
  manifests, distribution starting points for Homebrew, AUR, and Flathub, plus
  store listing copy, screenshots, and generated artwork.
- Added dark/light accessibility, minimum-window, high-DPI, translated-copy,
  token-contract, and visual-regression coverage to the component QA harness,
  including checked-in Windows light-theme baselines.

### Changed

- Refreshed application surfaces, media overlays, semantic artwork colors,
  selected-state accents, detail presentation, icons, screenshots, and project
  showcase material so they remain legible and consistent in both themes.
- Removed the unused XMLTV probe IPC contract and narrowed internal exports
  without changing persisted settings, source schemas, credentials, caches, or
  the 0.1.x migration chain.
- Added Knip dead-code enforcement, unused CSS selector/token checks, ignored
  publishable-tree inspection, and deterministic `dist/` cleaning and output
  validation to the normal quality gates.
- Consolidated source lifecycle transactions, media logo menus, detail
  enrichment/presentation, and Developer HUD provider diagnostics.
- Pruned mobile and unused Windows icon variants plus generated libmpv import
  libraries; supported desktop bundle artwork remains unchanged.
- Updated compatible dependencies and official GitHub Action majors, corrected
  user-facing copy, and expanded updater, menu, detail, build-output, and player
  control regression coverage.

### Fixed

- Kept seek loading feedback active until authoritative mpv playback events
  report that seeking or buffering has completed.
- Corrected release automation for Microsoft Store secret evaluation, macOS
  runner selection, and cross-platform npm lockfile dependency alignment.
- Corrected media-card, context-menu, modal, loading, skeleton, calendar,
  settings, and overlay colors that could lose contrast under a light theme or
  over artwork.

## [0.1.8] - 2026-08-25

### Fixed

- Kept UI quality evidence separate from published release downloads so the
  immutable release contains only installers, updater metadata, checksums, and
  source archives.
- Made the Windows Twitch-resolver build honor the pinned Python interpreter
  selected on `PATH` instead of allowing the Python launcher to choose a newer
  incompatible runtime.
- Added the bundled libmpv directory to the Windows native-test loader path so
  release compliance can execute the compiled Rust test binary on clean CI
  runners.
- Added the missing Windows Developer HUD visual baseline used by the release
  UI quality gate.

## [0.1.7] - 2026-08-25

This is a broad product, security, architecture, quality, packaging, and
documentation update built on the v0.1.6 release line. It keeps Movena local
and bring-your-own-content while making playback and source handling more
capable, native boundaries more explicit, releases more reproducible, and the
public project considerably easier to evaluate.

### Added

#### Playback and provider resolution

- Added support for canonical public Twitch live-channel page URLs through a
  bundled Streamlink 8.5.0 resolver.
- Added a pinned, hash-locked Python 3.13.11/PyInstaller build pipeline for the
  platform-specific Twitch resolver runtime.
- Added a loopback-only resolver bridge that exposes Twitch media to libmpv on
  a random `127.0.0.1` port instead of sending web-page URLs directly to mpv.
- Added typed resolver lifecycle events for startup, readiness, filtered
  commercial breaks, and classified failures.
- Added bounded Twitch break recovery so expected resolver pauses do not
  consume the ordinary playback stall-recovery budget.
- Added detection and user-facing classification for offline channels, missing
  streams, unavailable client-integrity support, malformed loopback responses,
  resolver startup timeouts, and unexpected resolver exits.
- Added optional headless Chromium client-integrity support through the bundled
  resolver when Twitch requires it, without requesting a Twitch account token.
- Added process-group/job-object containment so resolver helpers and loopback
  listeners are terminated when playback is replaced, stopped, or closed.
- Added a pinned Windows `yt-dlp` executable and explicit mpv `ytdl_hook`
  configuration for supported page URLs without relying on the user's `PATH`.
- Added resolver packaging smoke checks for exact Streamlink version, URL
  handling, notices, executable presence, and platform bundle placement.

#### Native data and desktop boundaries

- Added a typed `desktopApi` boundary for Tauri events, dialogs, updater access,
  window actions, pointer events, and application lifecycle operations.
- Added a lint rule preventing ad-hoc `@tauri-apps/*` imports outside the
  designated native API modules and tests.
- Added a typed, allowlisted `mpv_set_property` command in place of the generic
  arbitrary mpv command surface.
- Added validation and normalization for every permitted dynamic mpv property,
  including numeric ranges, subtitle settings, aspect values, and track state.
- Added dedicated Rust modules for application files, media downloads, M3U
  caches, remote media, source secrets, native player properties, Twitch
  resolution, and XMLTV parsing.
- Added a bounded native XMLTV parser using streaming XML events rather than
  requiring the complete guide document to be retained in frontend memory.
- Added native XMLTV cache promotion, metadata validation, freshness handling,
  conditional HTTP requests, and safe cleanup of incomplete downloads.
- Added split M3U cache documents and metadata with validation, synchronized
  writes, legacy-cache migration, and explicit per-source deletion.
- Added native streamed media downloads with progress events and pause, resume,
  and cancellation controls.
- Added target-specific Tauri bundle configurations for Windows, macOS, and
  Linux.

#### Sources, playlists, and guide handling

- Added explicit source-profile helpers for safe M3U persistence, enabled-source
  selection, public location labels, and normalized remote URLs.
- Added per-source runtime separation so local files, remote playlists,
  credentials, caches, categories, and query identities stay isolated.
- Added safe operating-system credential-vault wrappers for Xtream accounts,
  M3U connection data, and the optional TMDB API key.
- Added source-specific user-agent and referrer propagation through validation,
  fetching, stream probing, and native playback.
- Added bounded URL validation, header validation, same-origin redirect policy,
  conditional ETag/Last-Modified requests, download size limits, and encoding
  fallback for remote playlist data.
- Added native XMLTV normalization into frontend channel/programme maps with
  safe timestamp parsing and predictable programme ordering.
- Added reusable EPG geometry helpers for reliable initial positioning around
  the current programme.
- Added reusable stream-provider branding detection for supported Twitch and
  YouTube URLs.

#### Interface and accessibility quality

- Added a production-component Playwright harness covering primitives, content
  states, settings controls, overlays, and the developer HUD.
- Added automated accessibility, geometry, high-DPI containment, German-copy,
  and visual-regression checks for representative interface surfaces.
- Added checked-in Windows visual baselines for core controls and settings.
- Added accessibility and geometry evidence uploads to the compliance workflow.
- Added reusable controller/model modules for the M3U editor and debug overlay,
  reducing state coupling in the rendered components.
- Added stronger focus, accessible-name, labelled-control, progress, dialog,
  and keyboard behavior coverage across shared controls, player surfaces,
  catalogue cards, settings, and editor tools.
- Added deterministic screenshot fixtures that exercise Movena's production
  React pages and components with documented real titles, reserved provider data, and
  project-owned geometric artwork.

#### Project presentation and discoverability

- Rebuilt the README as a product-first landing page with a search-focused
  description, release/workflow/license/platform badges, primary calls to
  action, official-source warning, and bring-your-own-content notice.
- Added an honest Windows/macOS/Linux package matrix tied to the moving latest
  release URL and published checksums.
- Added grouped feature documentation for sources, guide data, discovery,
  native playback, library state, offline use, M3U editing, privacy, and
  personalization.
- Added a concise three-step user quick start and a collapsible verified
  keyboard-shortcut reference.
- Added a twelve-view product tour covering Discover, Live TV, timeline EPG,
  VOD and live playback, movie and series details, search, M3U editing,
  downloads, sources, and playback settings.
- Added a branded 1280×640 GitHub social-preview card using the real interface
  and checked-in Righteous wordmark font.
- Added a deterministic `npm run readme:social-preview` generator so the social
  card can be refreshed without hand-editing pixels.
- Added complete provenance for README captures, synthetic fixture content,
  the social card, the Righteous font, and TMDB branding.
- Updated the project website to use moving latest-release links and factual
  product language without fixed playlist-size or performance guarantees.
- Updated the GitHub repository description and focused repository topics for
  IPTV, VOD, M3U/M3U8, XMLTV, libmpv, Tauri, and supported desktop platforms.

#### Quality and compliance tooling

- Added ESLint 10 with TypeScript, React Hooks, React Refresh, unused-value,
  explicit-`any`, and native-boundary enforcement.
- Enabled strict TypeScript, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes` for application and configuration code.
- Added Playwright, Axe, PostCSS, and supporting UI-quality dependencies.
- Raised aggregate frontend coverage gates to 60% statements, 55% branches,
  55% functions, and 62% lines.
- Added 70–80% targeted coverage gates for the desktop boundary, XMLTV
  normalizer, credential vault, and M3U parser adapters.
- Added Rust Clippy with all targets/features and warnings denied to the main
  verification command.
- Expanded native, IPC, credential, parser-adapter, controller, stream-provider,
  virtualized-grid, playback, settings, source, guide, and packaging regression
  coverage.
- Added stronger public-tree scanning for private keys, encoded key material,
  cloud and service tokens, JWTs, credential-bearing URLs, personal filesystem
  paths, sensitive filenames, and local signing artifacts.
- Added ignored-path handling for generated resolver bundles, build products,
  coverage, Playwright reports, and test evidence.

### Changed

#### Architecture and state ownership

- Split the former monolithic Rust application module into focused native
  modules while keeping Tauri command registration centralized and auditable.
- Centralized frontend IPC commands and desktop event/window operations behind
  typed wrappers with matching regression tests.
- Extracted source-profile persistence, settings types/snapshots, M3U editor
  controller state, and debug formatting into independently testable modules.
- Tightened TanStack Query source scoping so catalogues, categories, details,
  and guide data cannot be reused across provider identities.
- Tightened Zustand ownership boundaries for player, source, settings, library,
  download, update, notification, context-menu, and debug state.
- Changed settings import to validate and sanitize a complete versioned snapshot
  before applying a single store update.
- Changed portable settings exports to exclude credentials, playlist and XMLTV
  URLs, request headers, history, favorites, diagnostics, downloads, and caches.

#### Playback behavior and diagnostics

- Changed native option errors so media URLs, request headers, local paths, and
  credentials cannot be echoed into frontend diagnostics.
- Changed player event listening to use session-scoped typed events and ignore
  stale events emitted by replaced playback sessions.
- Changed dynamic subtitle and audio-delay updates to use validated property
  payloads instead of arbitrary mpv command arrays.
- Changed startup, fallback, cache-stall, end-of-file, and retry handling to
  retain bounded recovery budgets and clearer aggregated error messages.
- Changed resolver-filtered Twitch break intervals to show dedicated player
  state and resume detection rather than appearing as generic frozen playback.
- Changed stream replacement and shutdown order so mpv disconnects before the
  resolver process group is terminated.
- Expanded playback diagnostics with structured video/audio parameters,
  bitrate, cache, sync, frame-drop, track, and resolver information while
  preserving redaction.

#### Interface and design system

- Consolidated settings controls, buttons, selection controls, tab strips,
  workspace sidebars, state icons, detail shells, and catalogue headers around
  shared design-system contracts.
- Tightened spacing, overflow, minimum-size, truncation, responsive-layout, and
  player-overlay behavior across catalogue, settings, editor, modal, download,
  and playback surfaces.
- Replaced unstable broad CSS transitions with enumerated properties and added
  a design-system check that rejects future `transition: all` usage.
- Improved virtualized catalogue rendering and measurement behavior for large
  libraries and resized layouts.
- Improved media-card badges, logo aspect handling, metadata presentation,
  menus, selection behavior, and accessible action labels.
- Improved category sidebars, filters, search, horizontal carousels, skeletons,
  empty/error states, confirmations, context menus, and toast feedback.
- Improved M3U raw editing, channel tables, detail drawers, diagnostics,
  command-palette actions, stream-health results, and version-history surfaces.
- Improved movie, series, and M3U detail modals with consistent shells, focus
  handling, metadata, episode navigation, and source-aware actions.
- Improved player controls, channel and episode drawers, track selection,
  recording state, feedback overlays, fullscreen behavior, and watch-progress
  synchronization.
- Improved playback, guide, source, storage, appearance, and About settings with
  clearer descriptions, grouped controls, and safer destructive actions.
- Updated all seven non-English locale catalogues for newly exposed player and
  resolver states while keeping lazy catalogue loading stable.

#### Packaging, release, and dependency policy

- Changed release jobs to run the reusable compliance workflow successfully
  before any source archive or platform package is built.
- Changed Windows, macOS, and Linux release builds to use explicit platform
  bundle configurations.
- Changed all platform release jobs to build and verify their own
  architecture-specific pinned Twitch resolver runtime.
- Changed Windows portable packaging to include libmpv, `yt-dlp`, the Twitch
  resolver, licenses, and third-party notices.
- Changed native build setup to copy resolver resources and Windows `yt-dlp`
  only when file contents require it, reducing avoidable rebuild churn.
- Changed compliance to run Windows and macOS native tests in addition to the
  existing frontend, Linux, dependency, license, and public-tree checks.
- Changed release documentation to distinguish Tauri updater signatures from
  Authenticode, Developer ID, notarization, store certification, and other
  operating-system trust signals.
- Updated pinned Windows mpv/libmpv and `yt-dlp` acquisition metadata,
  checksums, corresponding-source expectations, and license reporting.
- Regenerated third-party notices for the expanded JavaScript, Rust, Python,
  Streamlink, PyInstaller, `yt-dlp`, and platform dependency set.

### Fixed

- Fixed generic mpv command exposure that allowed unvalidated property names
  and values to cross the frontend/native boundary.
- Fixed possible sensitive option values appearing in native player errors.
- Fixed stale player and resolver events mutating a newer playback session.
- Fixed expected Twitch commercial-break gaps triggering repeated generic stall
  restarts or exhausting the wrong recovery budget.
- Fixed resolver processes or child helpers potentially surviving stream
  replacement and application shutdown.
- Fixed missing bundled resolver discovery for packaged and portable Windows
  layouts.
- Fixed remote playlist and guide redirects potentially forwarding sensitive
  headers across origins.
- Fixed partial or oversized remote documents being promoted into active M3U
  and XMLTV caches.
- Fixed cache metadata/document inconsistencies and added legacy M3U cache
  migration handling.
- Fixed XMLTV parsing and normalization edge cases around encodings, timestamps,
  absent fields, channel ordering, and programme grouping.
- Fixed empty optional template substitutions and unstable lazy-translation API
  identity after locale catalogues load.
- Fixed unchecked array/index access and ambiguous optional-property handling
  across stores, utilities, API adapters, components, and tests.
- Fixed catalogue and shared-control layouts that could overflow or lose
  containment at narrow and minimum supported logical widths.
- Fixed duplicate or ambiguous accessible queries by giving interactive
  controls stable roles, labels, descriptions, and scoping.
- Fixed source, credential, cache, and app-data deletion paths so Movena-owned
  state is removed consistently without deleting user-owned playlist or media
  files.
- Fixed public documentation that previously described releases as source-only
  or used a stale fixed website version label.
- Fixed README captures that did not use the checked-in Righteous wordmark font
  and replaced mock-looking artwork with real production interface captures.
- Fixed the social-preview brand lockup so the wordmark reads “MOVENA” rather
  than visually repeating the icon as “M MOVENA.”

### Security

- Constrained source and settings file operations to validated extensions,
  bounded sizes, regular files, and traversal-safe paths.
- Constrained remote playlist, guide, and probe requests to validated HTTP(S)
  URLs, bounded headers, limited redirects, and response-size limits.
- Constrained resolver playback to validated Twitch channel routes and a random
  loopback-only endpoint.
- Constrained dynamic mpv properties to an explicit allowlist and safe value
  ranges.
- Kept provider passwords, source secrets, and optional TMDB credentials in the
  operating-system credential vault.
- Hardened logs, diagnostics, native errors, query keys, fixtures, screenshots,
  and public-tree checks against credentials, tokens, URLs, personal paths, and
  commercial media leakage.
- Documented direct network connections, legacy HTTP risk, Twitch resolver
  behavior, local caches, application-data deletion, updater behavior, and
  third-party service boundaries in the privacy policy.
- Expanded public release requirements for secret scanning, native smoke tests,
  resolver teardown, accessibility, signing claims, checksums, licenses, and
  corresponding source.

[Unreleased]: https://github.com/movena-app/movena/compare/v0.1.13...HEAD
[0.1.13]: https://github.com/movena-app/movena/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/movena-app/movena/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/movena-app/movena/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/movena-app/movena/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/movena-app/movena/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/movena-app/movena/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/movena-app/movena/compare/v0.1.6...v0.1.7
