# Asset provenance and licenses

## Project artwork

The Movena favicon, desktop application icons, required Windows tiles, and DMG
background stored in `public/` and `src-tauri/` are project artwork from this
repository's contributors. They are distributed under GPL-3.0-or-later with
the application source. The branding rules in `TRADEMARK.md` prevent
misrepresentation but do not withdraw the copyright license. Android and iOS
icon trees are intentionally not shipped because Movena supports desktop
bundles only.

Files covered include:

- `public/favicon.png` and `public/favicon.svg`
- `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`,
  `icon.icns`, and `icon.ico`
- `src-tauri/icons/StoreLogo.png`, `Square44x44Logo.png`, and
  `Square150x150Logo.png` for the desktop MSIX manifest
- `src-tauri/dmg/background.png` and `src-tauri/dmg/background.svg`

## README showcase artwork

The product screenshots and social-preview image in
`.github/assets/readme/` were created for this repository on 25 August 2026.
They are browser captures of Movena's production React pages, shared
components, CSS modules, and app shell at a 1440×900 viewport. The gallery
includes Discover, Live TV, timeline guide, VOD player, series player with
episode drawer, movie and series details, upcoming release schedule, global
search, M3U visual and raw code workspace, downloads, sources, playback
settings, and light appearance. The deterministic fixture in
`tests/ui/harness/ReadmeHarness.tsx` supplies an in-memory M3U playlist, XMLTV guide, library history, download
queue, player state, and track metadata. Movie and series surfaces use real
titles, factual metadata, and TMDB poster/backdrop artwork. Live TV surfaces use
the real channel identities and marks documented below; their schedule times
are deterministic example XMLTV data. Provider names, stream URLs, downloads,
and playback state use reserved `.test` identifiers and fixture data. The
fixture does not contain provider accounts, private URLs, credentials, or
commercial video.

The VOD capture renders Movena's production `PlayerShell` and control
components over TMDB backdrop artwork. A Live Player screenshot is deliberately
not included because the native libmpv video layer is a separate operating-
system surface and is not present in a browser capture.

Movena's UI, fixture code, and original portions of the
captures are project work distributed under GPL-3.0-or-later. TMDB metadata and
artwork embedded in the rendered PNG/WebP files are third-party content and are
not offered under the project's GPL license. `social-preview.png` is a
1280×640 branded composition made from the real Discover capture and checked-in
Righteous wordmark font. Regenerate the production-UI captures and social image
with `npm run readme:screenshots`; the WebP files are the README product tour.

### TMDB showcase content

The following real movie and series records and artwork were retrieved from
TMDB on 25 August 2026 under the
[TMDB API Terms of Use](https://www.themoviedb.org/api-terms-of-use). Their use
is non-commercial, is attributed in the README and Movena About screen, and
does not imply endorsement by TMDB or any title owner. TMDB content remains
subject to TMDB's terms and any underlying rights. Exact poster and backdrop
CDN URLs are recorded alongside the fixture constants in
`tests/ui/harness/ReadmeHarness.tsx`. TMDB does not identify the original poster
and backdrop creators or rightsholders on the title pages used here; no creator
credit beyond the supplying title record was available.

| Title                    | TMDB record                             |
| ------------------------ | --------------------------------------- |
| Dune: Part Two           | https://www.themoviedb.org/movie/693134 |
| Parasite                 | https://www.themoviedb.org/movie/496243 |
| Spirited Away            | https://www.themoviedb.org/movie/129    |
| The Matrix               | https://www.themoviedb.org/movie/603    |
| Arrival                  | https://www.themoviedb.org/movie/329865 |
| The Grand Budapest Hotel | https://www.themoviedb.org/movie/120467 |
| Mad Max: Fury Road       | https://www.themoviedb.org/movie/76341  |
| The Godfather            | https://www.themoviedb.org/movie/238    |
| Severance                | https://www.themoviedb.org/tv/95396     |
| The Bear                 | https://www.themoviedb.org/tv/136315    |
| Dark                     | https://www.themoviedb.org/tv/70523     |
| Arcane                   | https://www.themoviedb.org/tv/94605     |
| Shōgun                   | https://www.themoviedb.org/tv/126308    |

### Live TV channel marks

The following marks were retrieved from Wikimedia Commons on 25 August 2026.
Each linked file page identifies the uploaded artwork as public domain. The
marks may additionally be protected as trademarks; their appearance in an
accurate product screenshot is nominative and does not imply endorsement.

| Channel             | Wikimedia Commons source                                                |
| ------------------- | ----------------------------------------------------------------------- |
| BBC News            | https://commons.wikimedia.org/wiki/File:BBC_News_2022_(Alt,_boxed).svg  |
| CNN International   | https://commons.wikimedia.org/wiki/File:CNN_International_logo.svg      |
| ARTE                | https://commons.wikimedia.org/wiki/File:Arte_Logo_2017.svg              |
| National Geographic | https://commons.wikimedia.org/wiki/File:National_Geographic_Channel.svg |
| Eurosport           | https://commons.wikimedia.org/wiki/File:Eurosport_Logo_2015.svg         |
| MTV                 | https://commons.wikimedia.org/wiki/File:MTV_2021_(brand_version).svg    |
| Cartoon Network     | https://commons.wikimedia.org/wiki/File:Cartoon_Network_2010_logo.svg   |
| Deutsche Welle      | https://commons.wikimedia.org/wiki/File:Deutsche_Welle_symbol_2012.svg  |

Do not add screenshots, channel logos, provider logos, posters, video, audio,
or other third-party media without recording the creator, source URL, exact
license, and retrieval date in this file.

## Righteous font

`public/fonts/righteous-latin-400.woff2` is Righteous by Astigmatic (Brian J.
Bonislawsky), obtained from the
[Google Fonts Righteous source](https://github.com/google/fonts/tree/main/ofl/righteous)
on 23 August 2026. It is licensed under the SIL Open Font License 1.1. The
Reserved Font Name is "Righteous". The complete license is in
`public/fonts/OFL.txt`. The checked-in WOFF2 SHA-256 is
`17bb3e21ead29ad20cb4e9ffbfa6eac5dbed184836ae13e5c14cbd6e85ddcce6`.

## External service branding

`public/tmdb-logo.svg` is TMDB's approved "Primary short (blue)" logo,
downloaded from TMDB's official
[Logos & Attribution page](https://www.themoviedb.org/about/logos-attribution)
on 23 August 2026. Its checked-in SHA-256 is
`ea66f5cb3bf6ecf099ddcce41b374103d11ecad1b27615019359e06e20a8f767`.
It is included only to satisfy TMDB attribution and is not offered under the
project's GPL license. TMDB, TVmaze, and IntroDB names, logos, and data are not project
artwork. Their use is subject to the applicable service terms and attribution
requirements.
