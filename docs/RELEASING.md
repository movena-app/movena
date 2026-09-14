# Release policy

## Release automation

Pushing a matching version tag (`vX.Y.Z`) triggers the automated multi-platform
release workflow (`.github/workflows/release.yml`).

The workflow:

1. Calls the reusable `compliance.yml` workflow and waits for its Linux,
   Windows, and macOS verification jobs.
2. Builds source archives (`.tar.gz` and `.zip`).
3. Builds Windows installers (NSIS `.exe`, `.msi`) and portable archive (`.zip`).
4. Builds macOS bundles (`.dmg` and `.app.tar.gz`).
5. Builds Linux packages (`.deb` and `.AppImage`).
6. Generates an SPDX SBOM and `SHA256SUMS.txt`, records GitHub build provenance
   attestations, and publishes the GitHub release.
7. Submits the generated MSIX to Microsoft Store when the project credentials
   are configured.

If a Store submission needs to be retried after the GitHub release is complete,
run `Publish Microsoft Store Package` with the immutable release tag. That
workflow downloads the existing release MSIX instead of rebuilding it, so the
Store submission stays tied to the exact tagged artifact. Store automation pins
the CLI version because its package-input contract is release-sensitive.

## Release checklist

1. Work from a clean tree and a reviewed `vX.Y.Z` tag whose version matches
   `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`.
2. Run `npm ci`, the platform's native setup (`npm run setup:mpv` on Windows
   and `npm run setup:twitch` everywhere),
   `npm audit --omit=dev --audit-level=high`,
   `npm run check:licenses`, `npm run check:public-tree`, `npm run check`,
   `npm run build`, and `npm run test:ui:visual`. `setup:twitch` regenerates the
   license report before it is copied into the resolver bundle. The build
   cleans `dist/` first and rejects unexpected output extensions afterward.
3. Run secret scanning and verify that no playlists, provider records,
   credentials, private URLs, diagnostics, recordings, downloads, or
   third-party media exist anywhere in the public history.
4. Include `LICENSE`, all policy files, both lockfiles,
   `THIRD_PARTY_LICENSES.txt`, font licenses, and build scripts.
5. Run the native smoke matrix on Windows, macOS, and Linux:
   - open live, VOD, series, and radio playback; verify loading and recovery;
   - enter and exit fullscreen, resize the window, and verify video/control geometry;
   - switch audio/subtitle tracks, seek, change volume, and exercise recording/download feedback;
   - close and replace playback, confirming the mpv surface, audio, cursor state, and listeners are released;
   - start `gleggmire` during Twitch pre-roll and mid-roll breaks, confirm no
     commercial video reaches mpv, real video resumes after the Movena status,
     and closing/switching leaves no resolver process or loopback listener;
   - verify window actions, dialogs, menus, drawers, and player controls by keyboard;
   - sample the supported screen reader on each platform for window actions, errors, progress, and player controls.
6. Create and push the Git tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

Each platform build must report the resolver's added artifact size and verify
that the bundled executable reports exactly Streamlink 8.5.0, accepts a Twitch
channel URL, includes `THIRD_PARTY_NOTICES.txt`, and runs without system Python
or FFmpeg. The PyInstaller onedir runtime is architecture-specific and must be
built on every release runner rather than copied between platforms. The release
workflow pins Python 3.13.11 so the embedded interpreter does not change between
runners.

## Published binary status

Artifacts published by `movena-app/movena` are project-published packages from
the official download channel. That describes their origin, not operating-system
trust or store certification. Tauri updater signatures authenticate updater
artifacts and are separate from Authenticode or Apple Developer ID signing.

Current v0.x packages have these disclosed limitations:

- Windows packages are not Authenticode-signed and may trigger SmartScreen.
- macOS packages are ad-hoc signed, are not notarized, and depend on a Homebrew
  libmpv installation.
- Linux packages depend on compatible system libmpv and WebKit/Tauri libraries.

Do not describe a build as Authenticode-signed, Developer ID signed, notarized,
stapled, or store-certified until the workflow performs and verifies that exact
operation. When signing credentials are introduced, Windows releases must
verify Authenticode and macOS releases must deep-sign nested native code with
Developer ID, enable hardened runtime, notarize, and staple before publication.

## Pinned native distribution inputs

The setup scripts are the executable manifest for fetched binaries. Keep this
summary synchronized with them:

| Component          | Release input                                                                                                                                                       | SHA-256 / lock                                                     | Distribution note                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Windows mpv/libmpv | [`mpv-dev-x86_64-20260811-git-f4d13e1c2c.7z`](https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20260811/mpv-dev-x86_64-20260811-git-f4d13e1c2c.7z) | `d849de71d4e57ac7f92cedbda50564af4431d84bd1898e9ee6f9a9fc21d42427` | GPL/version-3-enabled build; include the applicable mpv/FFmpeg corresponding source and build information. |
| Windows yt-dlp     | [`yt-dlp.exe` 2026.08.19](https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe)                                                                 | `66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a` | Unlicense; source is the matching [`yt-dlp` tag](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19).        |
| Twitch resolver    | Streamlink 8.5.0, PyInstaller 6.16.0, Python 3.13.11                                                                                                                | `scripts/twitch-resolver/requirements.lock` with required hashes   | Built independently on each target; no FFmpeg is included in this bundle.                                  |

Before publishing, verify every fetched or compiled native component has an
exact version, source URL, checksum or hashed lock, license, patches/build
configuration where applicable, and reproducible acquisition/build command.
Release assets must carry `THIRD_PARTY_LICENSES.txt` and provide the applicable
corresponding source for Movena and redistributed copyleft native components
for as long as the binaries are offered. Record any target-country codec-patent
distribution decision outside the automated build and have it reviewed before
adding a new distribution target.

## Signing and provenance configuration

The workflow signs only when project-held credentials are configured. Windows
uses `WINDOWS_CERTIFICATE` (base64 PFX) and
`WINDOWS_CERTIFICATE_PASSWORD`; the imported certificate thumbprint is passed
to Tauri and every generated executable/installer must pass
`Get-AuthenticodeSignature`. macOS uses Tauri's `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, and `APPLE_TEAM_ID` inputs. A signed macOS job must pass deep
codesign verification, Gatekeeper assessment, and stapler validation.

Missing signing credentials deliberately preserve the disclosed unsigned/ad-hoc
status. Partial credentials fail rather than silently downgrade. Updater signing
continues to use `TAURI_SIGNING_PRIVATE_KEY` and its password independently.

Every published release includes `movena.spdx.json`, checksums that cover the
SBOM, and GitHub artifact attestations for the complete `release-final` set.
Consumers can verify provenance with `gh attestation verify <artifact>
--repo movena-app/movena` and verify file bytes with `SHA256SUMS.txt`.

Direct JavaScript packages and the Rust lockfile may be refreshed within their
existing compatible major ranges during maintenance. Breaking library majors,
including a future TypeScript major, require a dedicated migration and must not
be folded into routine release cleanup.

## Public-history rule

The public history must not contain provider exports, credentials, private URLs,
diagnostics, recordings, downloads, or third-party commercial media. The
compliance workflow scans the full fetched history for disallowed media
extensions; release review still needs secret scanning and human inspection of
fixtures and screenshots.
