import type { SettingsSectionId } from '@/modules/settings/lib/settingsNavigation';
import { SETTINGS_SECTIONS } from '@/modules/settings/lib/settingsNavigation';
import { UI_QA_SURFACES, type UiQaSurface } from './surfaces';
import { README_SURFACES, type ReadmeSurface } from './readmeSurfaces';

type UiQaTheme = 'dark' | 'light';
type UiQaFixtureSetup = 'component' | 'populated-library' | 'native-player';
type UiQaStableScreenshotStatus = 'baseline' | 'geometry-only';

/** Deterministic contract used by Playwright and screenshot generation. */
export interface UiQaScenario {
  id: string;
  fixtureSetup: UiQaFixtureSetup;
  route: string;
  state: string;
  themes: readonly UiQaTheme[];
  expectedLayers: readonly string[];
  stableScreenshot: UiQaStableScreenshotStatus;
  componentSurface?: UiQaSurface | undefined;
  productionSurface?: ReadmeSurface | undefined;
  settingsSection?: SettingsSectionId | undefined;
}

const BOTH_THEMES = ['dark', 'light'] as const;
const DARK_PLAYER_THEME = ['dark'] as const;
const STABLE_PRODUCTION_SCREENSHOTS = new Set<ReadmeSurface>([
  'hero',
  'live-tv',
  'live-epg',
  'library-details',
  'series-details',
  'm3u-editor',
  'm3u-raw-editor',
  'player-vod',
  'player-series',
]);
const STABLE_SETTINGS_SCREENSHOTS = new Set<SettingsSectionId>(['general', 'sources']);

export const COMPONENT_UI_QA_SCENARIOS: readonly UiQaScenario[] = UI_QA_SURFACES.map((surface) => ({
  id: `component-${surface}`,
  fixtureSetup: 'component',
  route: `/${surface}`,
  state: surface,
  themes: BOTH_THEMES,
  expectedLayers: surface === 'overlays' ? ['modal'] : surface === 'developer-hud' ? ['debug'] : [],
  stableScreenshot: 'baseline',
  componentSurface: surface,
}));

const PRODUCTION_SURFACES = README_SURFACES.filter(
  (surface) =>
    surface !== 'settings' && surface !== 'playback-settings' && surface !== 'light-theme',
);

export const PRODUCTION_UI_QA_SCENARIOS: readonly UiQaScenario[] = [
  ...PRODUCTION_SURFACES.map((surface): UiQaScenario => {
    const isPlayer = surface === 'player-vod' || surface === 'player-series';
    const isDetail = surface === 'library-details' || surface === 'series-details';
    return {
      id: surface,
      fixtureSetup: isPlayer ? 'native-player' : 'populated-library',
      route: `/?readme=${surface}`,
      state: 'populated',
      themes: isPlayer ? DARK_PLAYER_THEME : BOTH_THEMES,
      expectedLayers: isPlayer
        ? [
            'player',
            'player-controls',
            'window-chrome',
            ...(surface === 'player-series' ? ['player-popover'] : []),
          ]
        : [...(isDetail ? ['modal'] : []), 'window-chrome'],
      stableScreenshot: STABLE_PRODUCTION_SCREENSHOTS.has(surface) ? 'baseline' : 'geometry-only',
      productionSurface: surface,
    };
  }),
  ...SETTINGS_SECTIONS.map((section): UiQaScenario => ({
    id: `settings-${section.id}`,
    fixtureSetup: 'populated-library',
    route: `/?readme=settings&settingsSection=${section.id}`,
    state: 'populated',
    themes: BOTH_THEMES,
    expectedLayers: ['window-chrome'],
    stableScreenshot: STABLE_SETTINGS_SCREENSHOTS.has(section.id) ? 'baseline' : 'geometry-only',
    productionSurface: 'settings',
    settingsSection: section.id,
  })),
];

export const UI_QA_SCENARIOS: readonly UiQaScenario[] = [
  ...COMPONENT_UI_QA_SCENARIOS,
  ...PRODUCTION_UI_QA_SCENARIOS,
];
