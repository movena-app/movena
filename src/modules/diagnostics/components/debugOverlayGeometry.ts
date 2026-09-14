export const HUD_DEFAULT_WIDTH = 680;
export const HUD_DEFAULT_HEIGHT = 520;
export const HUD_MIN_WIDTH = 480;
export const HUD_MIN_HEIGHT = 360;
export const HUD_VIEWPORT_MARGIN = 12;
export const HUD_KEYBOARD_STEP = 16;

export interface HudGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HudPointerOperation {
  kind: 'move' | 'resize';
  pointerId: number;
  clientX: number;
  clientY: number;
  geometry: HudGeometry;
}

interface ViewportSize {
  width: number;
  height: number;
}

function currentViewport(): ViewportSize {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  };
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function fitHudGeometry(geometry: HudGeometry, viewport = currentViewport()): HudGeometry {
  const availableWidth = Math.max(1, viewport.width - HUD_VIEWPORT_MARGIN * 2);
  const availableHeight = Math.max(1, viewport.height - HUD_VIEWPORT_MARGIN * 2);
  const width = clamp(geometry.width, Math.min(HUD_MIN_WIDTH, availableWidth), availableWidth);
  const height = clamp(geometry.height, Math.min(HUD_MIN_HEIGHT, availableHeight), availableHeight);
  return {
    width,
    height,
    x: clamp(
      geometry.x,
      HUD_VIEWPORT_MARGIN,
      Math.max(HUD_VIEWPORT_MARGIN, viewport.width - width - HUD_VIEWPORT_MARGIN),
    ),
    y: clamp(
      geometry.y,
      HUD_VIEWPORT_MARGIN,
      Math.max(HUD_VIEWPORT_MARGIN, viewport.height - height - HUD_VIEWPORT_MARGIN),
    ),
  };
}

export function initialHudGeometry(viewport = currentViewport()): HudGeometry {
  return fitHudGeometry(
    {
      width: HUD_DEFAULT_WIDTH,
      height: HUD_DEFAULT_HEIGHT,
      x: (viewport.width - HUD_DEFAULT_WIDTH) / 2,
      y: (viewport.height - HUD_DEFAULT_HEIGHT) / 2,
    },
    viewport,
  );
}
