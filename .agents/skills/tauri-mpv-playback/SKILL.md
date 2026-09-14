---
name: tauri-mpv-playback
description: Technical instructions and guidelines for native libmpv FFI video playback in Tauri 2. Use when modifying native player commands, mpv events, video embedding/compositing, macOS/Windows window handling, or stream lifecycles.
---

# Native libmpv playback

Canonical documentation:

- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) § Playback
- [.agents/AGENTS.md](../../AGENTS.md) § Native playback invariants

## mpv options and contracts

- Core options remain valid and tested: `vo=gpu-next`, `keep-open=yes`, `idle=yes`, `hwdec`, `tone-mapping`, and `demuxer-lavf-o=strict=-2`.
- Stream changes own replacement: start the new session directly and let the session lifecycle stop the outgoing one (prevents race conditions).
- Relative recording paths resolve below Downloads.
- Headers are converted only through the safe mpv option helper.
- Do not use window shadows over the transparent player surface.
- Supported Twitch live pages are resolved before `loadfile`; VODs, clips,
  unrelated pages, and direct HLS URLs stay on the ordinary path.
- The active player session owns the resolver process group and loopback
  listener. Replacement, close, shutdown, and app-data deletion stop them
  before the resolver cache is removed.
- Keep Streamlink configuration/plugin sideloading disabled, bind only to a
  random `127.0.0.1` port, and never expose raw resolver output, URLs, or tokens
  in diagnostics.

## Native setup

- `build.rs` discovers platform libmpv files.
- On Windows, `npm run setup:mpv` provisions the pinned development archive.
- On macOS, the build locates Homebrew’s libmpv installation.
- `npm run setup:twitch` builds the hash-pinned Streamlink 8.5 onedir resolver
  with Python 3.13.11 for the current architecture and regenerates its
  third-party notices.

## Verification and testing

```bash
npm run test:rust
npm run check:rust
npm run check
```

Manually test the following matrix when playback paths change:

- stream start/stop
- seek
- tracks
- fullscreen
- recording
- replacement
- resize
- close
- Twitch live-page startup and unavailable/offline failure
- Twitch pre-roll/mid-roll wait and recovery
- Twitch replacement/close with no resolver process or loopback listener left
