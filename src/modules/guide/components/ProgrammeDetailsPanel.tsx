import { Play, X } from 'lucide-react';
import type { CatalogItem } from '@/modules/catalog/public/data/useCatalog';
import {
  cleanProviderDescription,
  parseLiveChannelTitle,
  type CustomTitleRule,
} from '@/modules/catalog/public/lib/titleParser';
import { useI18n } from '@/shared/i18n/i18n';
import type { EpgProgramme } from '../data/useEpg';
import { MILLISECONDS_PER_MINUTE } from '../model/epgLayout';
import styles from '../pages/EpgPage.module.css';

interface ProgrammeDetailsPanelProps {
  selection: { channel: CatalogItem; programme: EpgProgramme } | null;
  now: number;
  onPlay: (channel: CatalogItem, programme: EpgProgramme) => void;
  onClose: () => void;
  customTitleRules: readonly CustomTitleRule[];
}

export function ProgrammeDetailsPanel({
  selection,
  now,
  onPlay,
  onClose,
  customTitleRules,
}: ProgrammeDetailsPanelProps) {
  const { t, time, number } = useI18n();
  if (!selection) {
    return (
      <aside
        className={`${styles.detail} ${styles.detailEmpty}`}
        aria-label={t('Programme details')}
      >
        <span className={styles.detailEmptyTitle}>{t('No programme selected')}</span>
        <span className={styles.detailEmptyHint}>
          {t('Select a programme in the guide to view its details.')}
        </span>
      </aside>
    );
  }

  const { channel, programme } = selection;
  const live = now >= programme.start && now < programme.end;
  const progress = live
    ? Math.max(
        0,
        Math.min(100, ((now - programme.start) / (programme.end - programme.start)) * 100),
      )
    : 0;
  const cleanChannelName = parseLiveChannelTitle(channel.title, customTitleRules).cleanTitle;
  const cleanTitle = programme.title?.trim()
    ? parseLiveChannelTitle(programme.title, customTitleRules).cleanTitle
    : t('Programme information unavailable');
  const cleanDescription = cleanProviderDescription(programme.description);

  return (
    <aside className={styles.detail}>
      <div className={styles.detailBody}>
        <div className={styles.detailHead}>
          <span className={styles.detailChannel}>{cleanChannelName}</span>
        </div>
        <h2 className={styles.detailTitle}>
          {cleanTitle || t('Programme information unavailable')}
        </h2>
        <div className={styles.detailMeta}>
          {live && (
            <span className={styles.detailLive}>
              <i />
              {t('Live')}
            </span>
          )}
          <span>
            {time(programme.start)}–{time(programme.end)}
          </span>
          <span>
            {number(Math.round((programme.end - programme.start) / MILLISECONDS_PER_MINUTE))} min
          </span>
        </div>
        {live && (
          <div
            className={styles.detailProgress}
            aria-label={t('{percent} percent complete', { percent: number(Math.round(progress)) })}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {cleanDescription && <p className={styles.detailText}>{cleanDescription}</p>}
      </div>
      <div className={styles.detailActions}>
        <button
          type="button"
          className={styles.watchBtn}
          onClick={() => onPlay(channel, programme)}
        >
          <Play size={15} />
          {t('Watch')}
        </button>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('Close details')}
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}
