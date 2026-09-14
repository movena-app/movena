import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CircleHelp, FolderOpen, Grid2X2, List, RefreshCw } from 'lucide-react';
import { Button, IconButton } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorState } from '@/shared/ui/ErrorState';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { TabStrip } from '@/shared/ui/TabStrip';
import { MediaCard } from '@/modules/catalog/components/MediaCard';
import type { MediaItem } from '@/modules/catalog/model/media';
import {
  SettingsButton,
  SettingsGroup,
  SettingsInput,
  SettingsPageContent,
  SettingsRange,
  SettingsRow,
  SettingsToggle,
} from '@/modules/settings/components/SettingsControls';
import { EmptyState } from '@/shared/ui/EmptyState';
import { DebugOverlay } from '@/modules/diagnostics/components/DebugOverlay';
import { Select } from '@/shared/ui/Select';
import { GridSkeleton } from '@/shared/ui/Skeleton';
import { usePlayerStore } from '@/modules/playback/store/usePlayerStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import type { UiLanguage } from '@/shared/i18n/config';
import { UI_QA_SURFACES, isUiQaSurface, type UiQaSurface } from '../surfaces';
import styles from './ComponentHarness.module.css';

const COPY = {
  en: {
    eyebrow: 'Production component QA',
    description: 'Focused states rendered from the same shared controls used by Movena.',
    primitives: 'Controls and selection',
    content: 'Content states',
    settings: 'Settings controls',
    overlays: 'Overlay behavior',
    developerHud: 'Developer HUD',
  },
  de: {
    eyebrow: 'Prüfung der Produktionskomponenten',
    description:
      'Gezielte Zustände mit denselben gemeinsam genutzten Bedienelementen, die Movena verwendet.',
    primitives: 'Bedienelemente und Auswahl',
    content: 'Inhaltszustände',
    settings: 'Einstellungen und Steuerelemente',
    overlays: 'Überlagerungsverhalten',
    developerHud: 'Entwickler-HUD',
  },
} as const;

const POSTER = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450">
    <rect width="300" height="450" fill="#171c25"/>
    <circle cx="150" cy="175" r="62" fill="#263143"/>
    <path d="M128 132v86l72-43z" fill="#79b6ff"/>
  </svg>
`)}`;

const MEDIA: MediaItem = {
  id: 'qa-feature-film',
  title: 'The Deliberately Long Motion Picture Title',
  year: '2026',
  posterUrl: POSTER,
  type: 'vod',
  quality: '4K',
  rating: 8.4,
  progressPercentage: 37,
  tags: ['HDR', 'Drama'],
};

function surfaceFromPath(): UiQaSurface {
  const candidate = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  return isUiQaSurface(candidate) ? candidate : UI_QA_SURFACES[0];
}

function PrimitivesSurface() {
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [tab, setTab] = useState<'overview' | 'activity'>('overview');
  const [quality, setQuality] = useState<'balanced' | 'quality'>('balanced');

  return (
    <div className={styles.stack}>
      <section className={styles.componentGroup} aria-labelledby="button-heading">
        <h2 id="button-heading">Buttons</h2>
        <div className={styles.controlRow}>
          <Button>Default</Button>
          <Button variant="primary">Save changes</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Remove source</Button>
          <Button disabled>Disabled</Button>
          <IconButton aria-label="Help">
            <CircleHelp size={18} />
          </IconButton>
        </div>
      </section>
      <section className={styles.componentGroup} aria-labelledby="selection-heading">
        <h2 id="selection-heading">Selection</h2>
        <div className={styles.controlGrid}>
          <Select
            ariaLabel="Quality profile"
            value={quality}
            onChange={setQuality}
            options={[
              { value: 'balanced', label: 'Balanced' },
              { value: 'quality', label: 'Best quality' },
            ]}
          />
          <SegmentedControl
            ariaLabel="Catalogue layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'grid', label: 'Grid', icon: Grid2X2 },
              { value: 'list', label: 'List', icon: List },
            ]}
          />
          <TabStrip
            ariaLabel="Fixture sections"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'activity', label: 'Activity' },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function ContentStatesSurface() {
  return (
    <div className={styles.stateGrid}>
      <section className={styles.statePanel} aria-labelledby="populated-heading">
        <h2 id="populated-heading">Populated</h2>
        <div className={styles.cardFrame}>
          <MediaCard item={MEDIA} onClick={() => undefined} />
        </div>
      </section>
      <section className={styles.statePanel} aria-labelledby="loading-heading">
        <h2 id="loading-heading">Loading</h2>
        <div className={styles.skeletonFrame}>
          <GridSkeleton count={1} />
        </div>
      </section>
      <section className={styles.statePanel} aria-labelledby="empty-heading">
        <h2 id="empty-heading">Empty</h2>
        <EmptyState
          icon={FolderOpen}
          title="No Media in This View"
          description="Adjust the active filters or connect another source."
          actionLabel="Add a Source"
          onAction={() => undefined}
        />
      </section>
      <section className={styles.statePanel} aria-labelledby="error-heading">
        <h2 id="error-heading">Error</h2>
        <ErrorState
          compact
          title="Content Could Not Be Loaded"
          description="Check the connection and try again."
          detail="Fixture error: HTTP 503"
          actionLabel="Try Again"
          actionIcon={RefreshCw}
          onAction={() => undefined}
        />
      </section>
    </div>
  );
}

function SettingsControlsSurface() {
  const [enabled, setEnabled] = useState(true);
  const [quality, setQuality] = useState<'compatible' | 'balanced' | 'quality'>('balanced');
  const [volume, setVolume] = useState(65);

  return (
    <SettingsPageContent>
      <SettingsGroup
        title="Playback Preferences"
        description="Choose how Movena balances compatibility, performance, and visual quality."
      >
        <SettingsRow
          title="Enable hardware decoding"
          description="Use the graphics processor when the current stream and platform support it."
        >
          <SettingsToggle
            checked={enabled}
            onChange={setEnabled}
            label="Enable hardware decoding"
          />
        </SettingsRow>
        <SettingsRow
          title="Quality profile"
          description="Apply one consistent profile to new playback sessions."
        >
          <Select
            variant="settings"
            ariaLabel="Quality profile"
            value={quality}
            onChange={setQuality}
            options={[
              { value: 'compatible', label: 'Compatible' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'quality', label: 'Best quality' },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          title="Default volume"
          description="The selected value remains visible while the slider has focus."
        >
          <SettingsRange
            aria-label="Default volume"
            min={0}
            max={100}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            formatValue={(value) => `${value}%`}
          />
        </SettingsRow>
        <SettingsRow
          title="Download folder"
          description="Long file-system paths wrap without hiding the action."
          wideControl
        >
          <div className={styles.settingsInputRow}>
            <SettingsInput
              aria-label="Download folder"
              readOnly
              value="C:\\Users\\viewer\\Downloads\\Movena Media"
            />
            <SettingsButton>Choose</SettingsButton>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPageContent>
  );
}

function OverlaysSurface() {
  return (
    <div className={styles.overlayStage}>
      <Button variant="danger">Remove source</Button>
      <ConfirmDialog
        title="Remove this source?"
        description="Cached catalogue and guide data will be removed. Downloaded media remains on disk."
        confirmLabel="Remove source"
        danger
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    </div>
  );
}

function DeveloperHudSurface() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
  );

  useEffect(() => {
    const settings = useSettingsStore.getState();
    settings.updateSetting('debugMode', true);
    settings.updateSetting('showDebugOverlay', true);
    const player = usePlayerStore.getState();
    player.playStream({
      id: 'qa-developer-hud',
      title: 'QA Playback Session',
      type: 'vod',
      streamUrl: 'https://example.test/qa',
    });
    player.updateFromMpvEvent('vo-configured', true);
    player.updateFromMpvEvent('diagnostic-sample', {
      'hwdec-current': 'd3d11va',
      'video-params': { w: 1920, h: 1080, 'hw-pixelformat': 'nv12' },
      'demuxer-cache-duration': 5.5,
      'cache-speed': 1_060_000,
      'video-bitrate': 8_000_000,
      'audio-bitrate': 192_000,
      'estimated-vf-fps': 60,
      avsync: 0,
      'frame-drop-count': 1,
    });
    return () => {
      usePlayerStore.getState().closePlayer();
      useSettingsStore.getState().updateSetting('showDebugOverlay', false);
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <DebugOverlay />
    </QueryClientProvider>
  );
}

const SURFACE_COMPONENTS: Record<UiQaSurface, () => React.JSX.Element> = {
  primitives: PrimitivesSurface,
  'content-states': ContentStatesSurface,
  'settings-controls': SettingsControlsSurface,
  overlays: OverlaysSurface,
  'developer-hud': DeveloperHudSurface,
};

export function ComponentHarness({ language }: { language: UiLanguage }) {
  const surface = surfaceFromPath();
  const themePreference = useSettingsStore((state) => state.themePreference);
  const copy = language === 'de' ? COPY.de : COPY.en;
  const titleBySurface: Record<UiQaSurface, string> = {
    primitives: copy.primitives,
    'content-states': copy.content,
    'settings-controls': copy.settings,
    overlays: copy.overlays,
    'developer-hud': copy.developerHud,
  };
  const Surface = SURFACE_COMPONENTS[surface];

  return (
    <main className={styles.harness} data-ui-qa-surface={surface}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{copy.eyebrow}</span>
          <h1>{titleBySurface[surface]}</h1>
          <p>{copy.description}</p>
        </div>
        <nav className={styles.navigation} aria-label="Component QA surfaces">
          {UI_QA_SURFACES.map((item) => (
            <a
              key={item}
              href={`/${item}?locale=${language}&theme=${themePreference}`}
              aria-current={item === surface ? 'page' : undefined}
            >
              {item.replace('-', ' ')}
            </a>
          ))}
        </nav>
      </header>
      <section className={styles.canvas} aria-label={titleBySurface[surface]}>
        <Surface />
      </section>
    </main>
  );
}
