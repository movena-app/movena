---
name: ui-design-system
description: CSS tokens, guidelines, layout math formulas, and custom component standards for Movena. Use when modifying CSS tokens, styles, shared UI components (Button, Select, SegmentedControl, WorkspaceSidebar), layout math, or player overlay surfaces.
---

# UI design system

Canonical documentation: [docs/DESIGN_SYSTEM.md](../../../docs/DESIGN_SYSTEM.md)
Global tokens: `src/shared/design/index.css`

## Surface tokens quick-reference

Repeated surfaces use semantic tokens such as:

- `--bg-surface`
- `--surface-control`
- `--surface-elevated`
- `--surface-overlay`
- `--surface-player`

## Hover stability

Category counts and action slots must remain stable on hover (do not shift the catalog).

## Verification commands

Run `npm run check:design` after CSS or token changes.
