# Contributing

Contributions are welcome. By contributing, you agree that your contribution is
licensed under GPL-3.0-or-later and that you have the right to submit it.

## Developer Certificate of Origin

Every commit must include a `Signed-off-by` line created with `git commit -s`.
The sign-off certifies the Developer Certificate of Origin 1.1:
<https://developercertificate.org/>.

## Set up a development checkout

Movena needs Node.js 20.19 or newer, npm, Rust, Python 3.13.11, the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), and libmpv.

```bash
npm install
npm run setup:twitch
```

On Windows also run `npm run setup:mpv`. On macOS use `brew install mpv`; on
Linux install your distribution's libmpv development package. Start the native
app with `npm run dev`.

## Architecture and change boundaries

Read [the architecture guide](../docs/ARCHITECTURE.md) and the relevant ADR before
changing native playback, credential handling, remote data, or state ownership.
Keep frontend/native calls in `src/platform/tauri.ts` or `src/platform/desktop.ts`; do not
add ad-hoc Tauri invokes. Playback state is event-authoritative and credentials
belong in the operating-system vault.

Small, reviewable pull requests are preferred. Explain the user-visible
problem, the chosen boundary, risks, and how reviewers can reproduce the result.

## Verification

Use the narrowest test while developing, then run the complete gate:

```bash
npm test -- path/to/test.test.ts
npm run test:rust
npm run check
npm run check:licenses
```

UI work should also run `npm run test:ui`; visual changes use
`npm run test:ui:visual`. The feature-gated packaged-desktop journey is built and
run with `npm run test:desktop:all`. It verifies the React/Tauri boundary, but
native libmpv compositing and process teardown still require the manual matrix
in [the release policy](../docs/RELEASING.md).

Coverage is a ratchet, not a target. Repository-wide thresholds prevent broad
regression, while higher per-file gates protect credential, source, player,
download, M3U editing, and crash-recovery boundaries. New high-risk modules
should receive their own explicit gate.

## Before submitting

1. Do not include provider accounts, playlists, tokens, private URLs,
   copyrighted channel artwork, commercial media, or real viewing data.
2. Add a regression test for every behavior change, then run `npm run check`
   and `npm run check:licenses`.
3. Document every new dependency or asset and its license.
4. Keep credentials in the OS vault; never persist them in Zustand,
   localStorage, logs, URLs, query keys, diagnostics, fixtures, or screenshots.

See `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `../docs/ARCHITECTURE.md` before
making substantial changes.

## Reporting bugs

Use the structured bug or playback-compatibility issue form. Include the
Movena version, operating system, source kind, exact reproduction steps, and a
sanitized diagnostic report where useful. Never paste provider URLs, usernames,
passwords, tokens, playlist contents, viewing history, or copyrighted media.

Security vulnerabilities belong in the private process described in
[SECURITY.md](SECURITY.md), not a public issue.
