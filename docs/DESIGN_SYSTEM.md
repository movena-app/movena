# Movena design system

Movena is a focused desktop media workspace with explicit dark and light
themes, cool slate neutrals, and a single user-selected accent. Dark uses
graphite depth; light uses a soft blue-gray canvas with white elevated
surfaces. The interface should feel quiet while browsing and become clear only
when something is selected, focused, loading, or actionable.

`src/index.css` is the visual source of truth. It contains the finite token
scales and the canonical `.uiButton`, `.uiIconButton`, and `.uiField`
primitives. Feature styles add layout and composition; they do not create a
second control language.

## Visual hierarchy

- `--bg-base` is the application canvas.
- `--bg-sidebar` is the primary navigation rail.
- `--surface-control` is a contained panel or control group.
- `--surface-input` is an editable field.
- `--surface-elevated` is a modal, menu, or popover.
- `--surface-player-elevated` is the opaque-enough player menu surface used
  over native video.
- `--surface-selection` is the full-surface selected state.
- `--surface-media-control`, `--text-media-primary`, and
  `--text-media-secondary` stay dark/bright over posters and other imagery in
  both application themes.
- Shadows are reserved for cards, menus, dialogs, and other floating layers.

Borders are quiet at rest. Hover uses `--border-strong`; keyboard focus uses
`--focus-ring`; selection uses a full surface or perimeter treatment. Do not
use one-sided accent stripes to communicate state.

Primary buttons use a low-contrast accent-tinted surface with a clear
perimeter. They do not use solid accent fills or accent glows; reserve strong
accent color for progress, indicators, and small state cues.

## Control contracts

Use the shared primitives before adding a local control:

- `Button` in `src/shared/ui/Button.tsx` for default, primary, ghost,
  and danger actions.
- `IconButton` from the same module for icon-only actions.
- `uiField` for text, search, URL, number, and password fields. Add a local
  class only for geometry such as an icon inset or a specific width.
- `Select`, `SegmentedControl`, and `TabStrip` for their respective interaction
  patterns. They own keyboard behavior and selected state.
- `SettingsControls` for settings rows, groups, toggles, inputs, and actions.
- `WorkspaceSidebar` for resizable secondary navigation.
- `CatalogPageHeader` for catalog title, metadata, actions, and gutters.

When a new screen needs a variant, add it to the shared primitive and its
tests instead of styling the same variant in a page module.

## Surfaces and window chrome

Use `uiModalOverlay` and `uiModalPanel` for modal backdrops and elevated
dialog surfaces. Feature styles may control width, layout, and scrolling, but
the overlay, border, radius, background, and shadow stay shared.

The desktop shell is frameless and uses `WindowChrome` as its invisible window
bar. Preserve the transparent drag area and reveal native window actions on
hover or keyboard focus; product branding belongs in the sidebar wordmark, not
duplicated in the chrome. Fullscreen playback may hide the chrome with the
player, but normal app navigation should always retain the functional bar.

## Token rules

- Use semantic surface, text, border, status, shadow, motion, spacing, radius,
  type, and z-index tokens.
- Keep literal colors in `src/index.css` only. Runtime accent changes update
  the accent tokens from the settings store.
- Dark tokens are the root defaults. Light overrides belong under
  `html[data-theme='light']:not(.is-playing)` so starting native playback also
  keeps portaled menus and browser-native controls on the dark contract.
- Use the finite alpha and duration scales. Do not introduce a one-off alpha,
  easing curve, shadow, or transition duration in a component stylesheet.
- Enumerate animated properties. `transition: all` is forbidden because it
  makes later layout and visibility changes animate accidentally.
- Use the finite type, weight, spacing, and radius scales too. Small optical
  spacing comes from the shared `--space-px` through `--space-3-5` tokens;
  component styles must not introduce literal values for these properties.
- Every interactive element needs an accessible name, a visible
  `:focus-visible` state, and a pointer target of at least 24×24 CSS pixels.
- Respect `prefers-reduced-motion` and the app motion preference.
- Do not put emojis in titles, settings labels, or notification headings. Use
  `CountryFlag` instead of emoji flags.

## Layout rules

- Keep the primary navigation rail at the shared sidebar width and keep page
  content inside the app shell gutters.
- Standard media cards use a 2:3 poster. Live TV cards are square.
- Virtualized grid math must preserve
  `columns × cardWidth + (columns - 1) × gap = containerWidth`.
- A scrolling flex child and every flex ancestor in its scroll chain need
  `min-height: 0` (and `min-width: 0` for horizontal scrolling).
- Skeletons match the real card/list geometry so loading never shifts content.
- Settings stay query-addressable and render one selected section at a time.
- The shell reserves one title-bar height; route content uses the responsive
  `--page-top-inset` only for breathing room below it. Do not add another
  page-level top spacer.
- The 960×600 logical-pixel minimum and 1280×800 default desktop sizes are
  release contracts. OS display scaling does not reduce that CSS viewport:
  200% DPI renders the same 960×600 logical layout at a 2× device scale.
  Content may scroll vertically, but the document must never gain unintended
  horizontal overflow.
- Long titles and translated copy wrap or truncate non-destructively. Never
  hide the only label, value, recovery action, or destructive warning.

## Media and player rules

Provider metadata remains normalized by `src/shared/lib/mediaTags.ts` and
`src/modules/catalog/lib/titleParser.ts`; feature code must not create local provider tag or
color maps. Use the semantic aliases in `src/shared/ui/icons.ts` for
icons. Their implementations come from Lucide; active state belongs to the
surrounding selected surface and accessible state rather than a separate icon
library.

Metadata on ordinary surfaces uses the theme-aware `--tag-*` palette. Tags
over posters or hero artwork use the matching invariant `--tag-media-*`
palette on an opaque dark media surface; artwork must never determine their
contrast. Preserve the shared `data-tag-type` mapping instead of defining
component-local category colors.

Native video is rendered by libmpv behind a transparent webview. Over the
player use flat translucent surfaces, never `backdrop-filter`, and use
accessible labels instead of native `title` tooltips. Keep the root opaque
until mpv reports `vo-configured=true`.

Playback is always dark, independent of the saved application theme. Leaving
playback restores the saved theme without a separate player preference.

## Verification

Run these after visual changes:

```text
npm run check:design
npm run check:types
npm run test -- --run
npm run test:ui
```

The component QA harness is a separate Vite entry under `tests/ui/harness`.
It renders production primitives, content states, settings controls, and
overlays without adding a development route or fixture code to the app.
`npm run test:ui` checks accessibility and the 960×600 logical-pixel geometry
contract, plus a 2× device-scale pass that preserves that viewport.
`npm run test:ui:visual` also compares the representative Windows screenshots.
Update a baseline only after reviewing the rendered difference.

Shared controls should have role-based tests for keyboard navigation, focus,
ARIA state, disabled behavior, dismissal, selection, and boundaries. Pure grid
math gets exact invariant tests; a screenshot is not a substitute for the
token contract.
