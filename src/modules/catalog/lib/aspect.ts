export type AspectMode =
  'auto' | 'fit100' | 'stretch' | 'zoom' | 'fitScreen' | '16:9' | '4:3' | '1:1' | '5:4';

/**
 * The four mpv properties that together decide how the picture meets the
 * window. Every mode sets all four, so switching between them can never leave a
 * setting behind from the previous one.
 *
 * - `video-aspect-override`  -2 means "use the container's aspect"
 * - `keepaspect`             no lets the picture distort to fill
 * - `panscan`                1 fills the window by cropping
 * - `video-unscaled`         yes shows the source at its native pixel size
 */
export interface AspectSettings {
  'video-aspect-override': '-2' | '16:9' | '4:3' | '1:1' | '5:4';
  keepaspect: 'yes' | 'no';
  panscan: '0' | '1';
  'video-unscaled': 'yes' | 'no';
}

interface AspectOption {
  mode: AspectMode;
  label: string;
  hint: string;
  settings: AspectSettings;
}

const fit = (aspect: AspectSettings['video-aspect-override']): AspectSettings => ({
  'video-aspect-override': aspect,
  keepaspect: 'yes',
  panscan: '0',
  'video-unscaled': 'no',
});

export const ASPECT_OPTIONS: AspectOption[] = [
  {
    mode: 'auto',
    label: 'Auto',
    hint: "The source's own aspect ratio",
    settings: fit('-2'),
  },
  {
    mode: 'fit100',
    label: '100% Fit',
    hint: 'Native pixel size, never scaled',
    settings: { ...fit('-2'), 'video-unscaled': 'yes' },
  },
  {
    mode: 'stretch',
    label: 'Stretch',
    hint: 'Fill the window, distorting the picture',
    settings: { ...fit('-2'), keepaspect: 'no' },
  },
  {
    mode: 'zoom',
    label: 'Zoom',
    hint: 'Fill the window by cropping the edges',
    settings: { ...fit('-2'), panscan: '1' },
  },
  {
    mode: 'fitScreen',
    label: 'Fit to Screen',
    hint: 'Scale to fit, letterboxed',
    settings: fit('-2'),
  },
  { mode: '16:9', label: '16:9', hint: 'Widescreen', settings: fit('16:9') },
  { mode: '4:3', label: '4:3', hint: 'Classic television', settings: fit('4:3') },
  { mode: '1:1', label: '1:1', hint: 'Square', settings: fit('1:1') },
  { mode: '5:4', label: '5:4', hint: 'Early computer displays', settings: fit('5:4') },
];

export function aspectSettingsFor(mode: AspectMode): AspectSettings {
  return (ASPECT_OPTIONS.find((option) => option.mode === mode) ?? ASPECT_OPTIONS[0]!).settings;
}

export function aspectLabelFor(mode: AspectMode): string {
  return (ASPECT_OPTIONS.find((option) => option.mode === mode) ?? ASPECT_OPTIONS[0]!).label;
}
