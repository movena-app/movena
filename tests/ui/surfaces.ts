export const UI_QA_SURFACES = [
  'primitives',
  'content-states',
  'settings-controls',
  'overlays',
  'developer-hud',
] as const;

export type UiQaSurface = (typeof UI_QA_SURFACES)[number];

export function isUiQaSurface(value: string): value is UiQaSurface {
  return UI_QA_SURFACES.some((surface) => surface === value);
}
