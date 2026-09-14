export type SettingsSectionId =
  | 'sources'
  | 'library-metadata'
  | 'coming-up'
  | 'general'
  | 'appearance'
  | 'notifications'
  | 'storage'
  | 'config'
  | 'shortcuts'
  | 'home'
  | 'playback'
  | 'subtitles-audio'
  | 'picture'
  | 'developer'
  | 'about';

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  description: string;
  keywords: readonly string[];
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  items: readonly SettingsNavItem[];
}

export const SETTINGS_NAV_GROUPS = [
  {
    id: 'account-sources',
    label: 'Account & Sources',
    items: [
      {
        id: 'sources',
        label: 'Sources',
        description: 'Connect Xtream and M3U sources, then enable any combination.',
        keywords: [
          'provider',
          'account',
          'connection',
          'credentials',
          'xtream',
          'server',
          'login',
          'disconnect',
          'm3u',
          'm3u8',
          'playlist',
          'source',
          'import',
          'url',
          'local file',
          'refresh',
          'epg',
          'programme',
          'listings',
          'xmltv',
          'provider guide',
        ],
      },
      {
        id: 'library-metadata',
        label: 'Library & Metadata',
        description: 'Configure stream badges, TMDB enrichment, and smart library features.',
        keywords: [
          'tmdb',
          'metadata',
          'posters',
          'cast',
          'genres',
          'enrichment',
          'movie details',
          'series details',
          'badges',
          'resolution',
          'stream folding',
          'logo',
          'quality',
        ],
      },
      {
        id: 'coming-up',
        label: 'Coming Up',
        description:
          'Control release schedules, announced episodes, countdowns, and calendar for your favorites.',
        keywords: [
          'tvmaze',
          'upcoming',
          'release',
          'schedule',
          'calendar',
          'countdown',
          'airtime',
          'discover',
          'coming up',
          'next episode',
          'announced episode',
        ],
      },
    ],
  },
  {
    id: 'application',
    label: 'Application',
    items: [
      {
        id: 'general',
        label: 'General',
        description: 'Language, window behavior, sidebar, and accessibility preferences.',
        keywords: [
          'language',
          'locale',
          'window',
          'always on top',
          'sidebar',
          'badges',
          'motion',
          'accessibility',
          'reduced motion',
          'preferences',
        ],
      },
      {
        id: 'appearance',
        label: 'Appearance',
        description: 'Accent color and default catalogue layout.',
        keywords: ['accent', 'color', 'theme', 'catalog', 'grid', 'list', 'view'],
      },
      {
        id: 'notifications',
        label: 'Notifications',
        description: 'Configure alerts, their placement, sound, and playback behavior.',
        keywords: ['alerts', 'toast', 'sound', 'do not disturb', 'download notifications'],
      },
      {
        id: 'storage',
        label: 'Storage',
        description: 'Recording and download folders, queue behavior, and file management.',
        keywords: [
          'recording',
          'record',
          'download',
          'save',
          'folder',
          'location',
          'disk',
          'queue',
          'concurrent',
          'parallel',
          'quick record',
          'offline',
        ],
      },
      {
        id: 'config',
        label: 'Import & Export',
        description: 'Back up, restore, and move portable application preferences.',
        keywords: [
          'backup',
          'restore',
          'settings',
          'preferences',
          'configuration',
          'config',
          'import',
          'export',
          'transfer',
          'json',
        ],
      },
      {
        id: 'shortcuts',
        label: 'Keyboard Shortcuts',
        description: 'Review the keyboard controls available during playback.',
        keywords: ['keys', 'hotkeys', 'play', 'pause', 'fullscreen', 'volume', 'seek'],
      },
      {
        id: 'home',
        label: 'Home Layout',
        description: 'Choose which rows appear on the Home page, and in what order.',
        keywords: [
          'discover',
          'home',
          'homepage',
          'layout',
          'rows',
          'sections',
          'reorder',
          'continue watching',
          'recently added',
          'popular',
          'live tv',
        ],
      },
    ],
  },
  {
    id: 'playback-media',
    label: 'Playback',
    items: [
      {
        id: 'playback',
        label: 'Player & Video',
        description: 'Video output, buffering, seeking, connection recovery, and episode behavior.',
        keywords: [
          'engine',
          'player',
          'gpu',
          'hardware',
          'aspect',
          'hdr',
          'tone mapping',
          'seek',
          'buffer',
          'autoplay',
          'intro',
          'failover',
          'timeout',
        ],
      },
      {
        id: 'subtitles-audio',
        label: 'Subtitles & Audio',
        description: 'Default subtitle appearance, audio sync, and playback speed.',
        keywords: [
          'subtitle',
          'captions',
          'font',
          'opacity',
          'border',
          'shadow',
          'audio delay',
          'speed',
          'playback speed',
        ],
      },
      {
        id: 'picture',
        label: 'Picture',
        description: 'Sharpness, brightness, contrast, saturation, and color adjustments.',
        keywords: [
          'picture',
          'image',
          'brightness',
          'contrast',
          'saturation',
          'hue',
          'gamma',
          'sharpness',
          'dark scene',
        ],
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    items: [
      {
        id: 'developer',
        label: 'Developer Tools',
        description: 'Control diagnostics, request logging, and debugging tools.',
        keywords: ['debugging', 'logs', 'network', 'delay', 'diagnostics'],
      },
      {
        id: 'about',
        label: 'About Movena',
        description: 'View version information, updates, support links, and reset options.',
        keywords: ['app', 'version', 'updates', 'github', 'reset'],
      },
    ],
  },
] as const satisfies readonly SettingsNavGroup[];

export const SETTINGS_SECTIONS: readonly SettingsNavItem[] =
  SETTINGS_NAV_GROUPS.flatMap<SettingsNavItem>((group) => [...group.items]);

const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'general';

function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

/** Resolves current sections and the former standalone provider-account URL. */
export function resolveSettingsSectionId(value: string | null): SettingsSectionId {
  if (value === 'account' || value === 'guide') return 'sources';
  if (value === 'metadata') return 'library-metadata';
  if (value === 'recording' || value === 'downloads') return 'storage';
  if (value === 'm3u-editor') return 'sources';
  return isSettingsSectionId(value) ? value : DEFAULT_SETTINGS_SECTION;
}

export function filterSettingsSections(
  query: string,
  localize: (value: string) => string = (value) => value,
): SettingsNavItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...SETTINGS_SECTIONS];

  return SETTINGS_SECTIONS.filter(
    (item) =>
      item.label.toLocaleLowerCase().includes(normalizedQuery) ||
      item.description.toLocaleLowerCase().includes(normalizedQuery) ||
      localize(item.label).toLocaleLowerCase().includes(normalizedQuery) ||
      localize(item.description).toLocaleLowerCase().includes(normalizedQuery) ||
      item.keywords.some((keyword) => keyword.includes(normalizedQuery)),
  );
}
