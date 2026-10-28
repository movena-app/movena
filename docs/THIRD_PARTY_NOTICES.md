# Third-party notices

Movena is licensed under GPL-3.0-or-later. It incorporates or interfaces with
third-party components under compatible licenses. `package-lock.json`,
`src-tauri/Cargo.lock`, and the pinned native setup scripts identify the
JavaScript, Rust, and native versions used by a release.

Run `npm run licenses:generate` after changing dependencies. It creates
`THIRD_PARTY_LICENSES.txt` from installed JavaScript license files, Cargo
metadata, and checked-in native component notices. Release source archives must include the generated file, this notice, all dependency
locks, `LICENSE`, and `public/fonts/OFL.txt`.

Important components include:

- React, Zustand, TanStack Query, Tauri, reqwest, Tokio, serde, and most other
  dependencies: MIT and/or Apache-2.0; see generated notices.
- Mozilla Public License components: MPL-2.0; source-level obligations remain
  with the corresponding components.
- `libmpv-sys`: LGPL-2.1; it provides Rust bindings and does not change the
  license of the linked mpv runtime.
- mpv: GPL-2.0-or-later in the normal build configuration.
- FFmpeg and the pinned Windows mpv build: configuration-dependent. The build
  used by this project enables GPL and version-3 components, so a distribution
  containing that native runtime must comply with GPL-3.0-or-later and include
  complete corresponding native source.
- yt-dlp 2026.08.19: Unlicense. Its pinned Windows executable, source URL, and
  checksum are recorded in `scripts/ensure-windows-mpv.mjs`.
- Righteous font: SIL Open Font License 1.1; see `public/fonts/OFL.txt`.
- `country-flag-icons`: MIT. Movena uses the package's 3:2 SVG flag artwork and
  ISO 3166 country-code list; Unicode regional-indicator symbols are not used as
  the artwork source.

Movena does not bundle TMDB, TVmaze, or IntroDB data. Runtime responses remain
subject to their respective terms. TVmaze identifies its API data as
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and requires
source attribution and ShareAlike compliance. IntroDB provides crowdsourced intro,
recap, and outro timestamps via https://introdb.app.
