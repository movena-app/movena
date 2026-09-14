import { memo, useEffect, useMemo, type CSSProperties } from 'react';
import { Play } from 'lucide-react';
import type { CatalogItem } from '@/modules/catalog/public/data/useCatalog';
import {
  parseLiveChannelTitle,
  type CustomTitleRule,
} from '@/modules/catalog/public/lib/titleParser';
import { getErrorMessage } from '@/shared/lib/error';
import { useI18n } from '@/shared/i18n/i18n';
import { useChannelEpg, type EpgProgramme } from '../data/useEpg';
import { lookupXmltvChannel, type XmltvGuide } from '../data/xmltvClient';
import { EPG_CHANNEL_WIDTH, EPG_ROW_HEIGHT, MILLISECONDS_PER_MINUTE } from '../model/epgLayout';
import { EpgChannelLogo } from './EpgChannelLogo';
import styles from '../pages/EpgPage.module.css';

interface EpgRowProps {
  channel: CatalogItem;
  xmltv: XmltvGuide | undefined;
  xmltvLoading: boolean;
  top: number;
  windowStart: number;
  windowEnd: number;
  offsetOf: (time: number) => number;
  now: number;
  selectedId: string | null;
  selectedChannelId: string | null;
  alternate: boolean;
  onSelect: (programme: EpgProgramme) => void;
  onPlay: (channel: CatalogItem) => void;
  onProgrammeEnd: (end: number) => void;
  requestEnabled: boolean;
  customTitleRules: readonly CustomTitleRule[];
  timelineScrollLeft: number;
  timelineViewportWidth: number;
}

export const EpgRow = memo(function EpgRow({
  channel,
  xmltv,
  xmltvLoading,
  top,
  windowStart,
  windowEnd,
  offsetOf,
  now,
  selectedId,
  selectedChannelId,
  alternate,
  onSelect,
  onPlay,
  onProgrammeEnd,
  requestEnabled,
  customTitleRules,
  timelineScrollLeft,
  timelineViewportWidth,
}: EpgRowProps) {
  const { t, time, number } = useI18n();
  const fromXmltv = useMemo(
    () => lookupXmltvChannel(xmltv, channel.epgChannelId, channel.title, channel.sourceId),
    [xmltv, channel.epgChannelId, channel.title, channel.sourceId],
  );
  const {
    data: fromProvider = [],
    isLoading: providerLoading,
    isError,
    error,
    isSuccess: providerResolved,
    canFetch: canFetchProvider,
  } = useChannelEpg(
    channel.sourceItemId || channel.id,
    requestEnabled && !fromXmltv?.length,
    channel.sourceId,
  );
  const programmes = fromXmltv?.length ? fromXmltv : fromProvider;
  const isLoading =
    programmes.length === 0 &&
    (providerLoading || xmltvLoading || (canFetchProvider && !providerResolved && !isError));
  const visible = useMemo(
    () =>
      programmes.filter((programme) => programme.end > windowStart && programme.start < windowEnd),
    [programmes, windowStart, windowEnd],
  );
  const cleanChannelName = useMemo(
    () => parseLiveChannelTitle(channel.title, customTitleRules).cleanTitle,
    [channel.title, customTitleRules],
  );

  useEffect(() => {
    const latest = programmes.reduce((end, programme) => Math.max(end, programme.end), 0);
    if (latest > 0) onProgrammeEnd(latest);
  }, [onProgrammeEnd, programmes]);

  return (
    <div
      className={`${styles.row} ${alternate ? styles.rowAlternate : ''}`}
      style={{ top, height: EPG_ROW_HEIGHT }}
    >
      <button
        type="button"
        className={`${styles.channel} ${selectedChannelId === channel.id ? styles.channelSelected : ''}`}
        onClick={() => onPlay(channel)}
        title={cleanChannelName}
      >
        <EpgChannelLogo
          posterUrl={channel.posterUrl}
          channelKey={(channel.sourceItemId || channel.id).toString()}
          sourceId={channel.sourceId}
        />
        <span className={styles.channelText}>
          <span className={styles.channelName}>{cleanChannelName}</span>
          {channel.channelNum != null && (
            <span className={styles.channelNum}>{channel.channelNum}</span>
          )}
        </span>
        <span className={styles.channelPlay}>
          <Play size={14} />
        </span>
      </button>

      <div className={styles.lane}>
        {isLoading ? (
          <div className={styles.lanePlaceholder} />
        ) : visible.length === 0 ? (
          <div
            className={styles.laneEmptyRow}
            role="status"
            aria-label={t(isError ? 'Guide unavailable' : 'No guide data')}
          >
            {isError && (
              <span>
                {getErrorMessage(error, 'Channel guide query failed without an error message.')}
              </span>
            )}
          </div>
        ) : (
          visible.map((programme) => {
            const from = Math.max(programme.start, windowStart);
            const to = Math.min(programme.end, windowEnd);
            const live = now >= programme.start && now < programme.end;
            const programmeLeft = offsetOf(from) + 2;
            const programmeWidth = Math.max(4, offsetOf(to) - offsetOf(from) - 4);
            const visibleStart = Math.max(programmeLeft, timelineScrollLeft);
            const visibleEnd = Math.min(
              programmeLeft + programmeWidth,
              timelineScrollLeft + Math.max(0, timelineViewportWidth - EPG_CHANNEL_WIDTH),
            );
            const isReachable = visibleEnd - visibleStart >= 24;
            const progress = live
              ? ((now - programme.start) / (programme.end - programme.start)) * 100
              : 0;
            const cleanTitle = cleanProgrammeTitle(
              programme.title,
              t('Programme information unavailable'),
              customTitleRules,
            );

            return (
              <button
                type="button"
                key={programme.id}
                className={[
                  styles.programme,
                  live ? styles.programmeLive : '',
                  now >= programme.end ? styles.programmePast : '',
                  selectedChannelId === channel.id && selectedId === programme.id
                    ? styles.programmeSelected
                    : '',
                ].join(' ')}
                style={
                  {
                    left: programmeLeft,
                    width: programmeWidth,
                    '--programme-left': `${offsetOf(from)}px`,
                  } as CSSProperties
                }
                disabled={!isReachable}
                aria-hidden={!isReachable || undefined}
                tabIndex={isReachable ? undefined : -1}
                onClick={() => onSelect(programme)}
                onDoubleClick={() => onPlay(channel)}
              >
                {live && (
                  <span className={styles.programmeProgress} style={{ width: `${progress}%` }} />
                )}
                <span className={styles.programmeTitle}>{cleanTitle}</span>
                <span className={styles.programmeTime}>
                  {time(programme.start)} ·{' '}
                  {number(Math.round((programme.end - programme.start) / MILLISECONDS_PER_MINUTE))}{' '}
                  min
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

function cleanProgrammeTitle(
  title: string,
  fallback: string,
  rules: readonly CustomTitleRule[],
): string {
  if (!title?.trim()) return fallback;
  return parseLiveChannelTitle(title, rules).cleanTitle || fallback;
}
