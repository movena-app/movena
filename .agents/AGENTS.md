# Movena agent rules

These rules apply to changes in this repository. Keep them short and verify
behavior instead of relying on documentation or assumptions.

## Required

- Every behavior change gets regression coverage in the nearest existing test.
- Run the relevant targeted checks while working and `npm run check` before
  handoff. If a native process prevents a check, report it precisely.
- Inspect errors before changing code or claiming a fix. Never hide failures
  with fallbacks, skipped tests, or weakened assertions.
- Do not commit credentials, private URLs, machine-specific paths, or secrets.

### Test expectations

- Utilities and parsing cover normal, empty, invalid, and boundary inputs.
- Store changes cover reset/isolation, persistence, malformed data, and
  migrations when relevant.
- IPC changes assert exact command names and payloads.
- React interaction tests use Testing Library roles and `userEvent`; cover
  focus, keyboard, ARIA, disabled, and dismissal behavior where relevant.
- Layout math tests assert exact invariants and breakpoint/zero-width cases.
- Rust validation, path, conversion, and event helpers get platform-
  independent `#[cfg(test)]` coverage.

## Architecture boundaries

- Playback is native libmpv through `src-tauri/src/player/`; supported Twitch
  live pages are resolved by `src-tauri/src/player/twitch_resolver.rs` before
  libmpv loads the loopback stream. Never add an HTML `<video>` fallback or a
  browser-only player.
- Frontend native calls go through the typed wrappers in
  `src/platform/tauri.ts` and `src/platform/desktop.ts`.
- Player commands that start, stop, or reconfigure mpv use
  `#[tauri::command(async)]`; playback state comes from mpv events.
- Keep remote/server data in TanStack Query and local interaction state in
  Zustand. Provider-backed query keys must include the opaque source scope.
- Store passwords only through the OS credential vault. Redact URLs, headers,
  credentials, and local paths from diagnostics.
- Use the shared CSS tokens and controls. Run `npm run check:design` after CSS
  or token changes.
- Do not add local provider tag/color maps, ad-hoc badges, native selects, or
  page-local copies of shared settings/sidebar/catalog controls.
- `WorkspaceSidebar.module.css`'s `.resizing` state must keep `transition:
none` on the dragged `.sidebar` element. A `transition: width` active
  during the pointer drag fights the 1:1 cursor tracking in
  `WorkspaceSidebar.tsx`'s `handleResizeMove` — the sidebar visibly lags
  behind the cursor, easing a catch-up on every pixel step instead of
  following it instantly. This has regressed repeatedly; do not remove the
  override or reintroduce anything that transitions `width`/`--sidebar-width`
  while `.resizing` is applied. The transition on `.sidebar` itself is fine
  and wanted for the non-drag paths (double-click reset, arrow-key resize).

## Native playback invariants

- Windows/Linux embed mpv through the main window handle.
- macOS uses the separate mpv surface adopted behind the transparent webview;
  do not replace it with `wid`.
- macOS uses the project’s simple fullscreen behavior, not a native fullscreen
  space.
- Do not claim automated tests validate native compositing, window ordering, or
  teardown; list those manual checks explicitly.
- The Twitch resolver is owned by the active native-player session. Replacement,
  close, app-data deletion, and shutdown must terminate its complete process
  group and loopback listener before resolver cache removal.
- Keep resolver configuration and plugin sideloading disabled, bind only to a
  random `127.0.0.1` port, and redact resolver URLs, tokens, and raw output.

## Local verification

```bash
npm run check:design
npm run setup:twitch
npm run format:rust:check
npm run check:types
npm run check:types:frontend
npm test
npm run test:coverage
npm run test:rust
npm run check:rust
npm run check
```

Push-triggered CI runs through `.github/workflows/compliance.yml`. Keep its
quality and compliance checks aligned with the local `npm run check` gate.

When a change affects native compositing, transparency, fullscreen, cursor
recovery, or teardown, automated checks are necessary but insufficient; name
the exact manual desktop scenario in the handoff.

Twitch-path changes additionally require a public live-channel startup,
pre-roll/mid-roll wait and recovery, stream replacement, close, process-group
teardown, and loopback-listener teardown scenario. Do not use a real account or
OAuth token in fixtures or diagnostics.

## Project skills

- `skills/state-and-ipc/SKILL.md` — stores, queries, and IPC.
- `skills/tauri-mpv-playback/SKILL.md` — native playback.
- `skills/ui-design-system/SKILL.md` — tokens and shared UI patterns.
