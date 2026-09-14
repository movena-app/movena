import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, Clock3, LockKeyhole } from 'lucide-react';
import { useUpcomingReleases } from '../data/useUpcomingReleases';
import { useI18n } from '@/shared/i18n/i18n';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import {
  exactTimestampDate,
  episodeScheduleKey,
  groupUpcomingReleases,
  localCalendarDate,
  releaseCountdown,
  releasePhase,
  releaseStatusLabel,
  timestampCountdown,
} from '../lib/upcoming';
import { Button } from '@/shared/ui/Button';
import styles from './SeriesUpcomingEpisodes.module.css';

interface SeriesUpcomingEpisodesProps {
  seriesId: string;
  availableEpisodeKeys: ReadonlySet<string>;
  onViewSchedule?: (() => void) | undefined;
}

export function SeriesUpcomingEpisodes({
  seriesId,
  availableEpisodeKeys,
  onViewSchedule,
}: SeriesUpcomingEpisodesProps) {
  const { t, date, number } = useI18n();
  const countdownEnabled = useSettingsStore((state) => state.upcomingCountdownEnabled);
  const schedule = useUpcomingReleases({ favoriteIds: [seriesId] });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), countdownEnabled ? 1_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [countdownEnabled]);

  const announcedGroups = useMemo(
    () =>
      groupUpcomingReleases(
        (schedule.data ?? []).filter(
          (release) =>
            release.favorite.id === seriesId &&
            release.kind === 'episode' &&
            release.seasonNumber !== null &&
            release.episodeNumber !== null &&
            !availableEpisodeKeys.has(
              episodeScheduleKey(release.seasonNumber, release.episodeNumber),
            ),
        ),
      ),
    [availableEpisodeKeys, schedule.data, seriesId],
  );

  if (!schedule.isEnabled || announcedGroups.length === 0) return null;

  return (
    <section className={styles.announcedSection} aria-labelledby={`announced-${seriesId}`}>
      <div className={styles.announcedHeader}>
        <div className={styles.announcedHeadingGroup}>
          <h3 id={`announced-${seriesId}`}>{t('Next announced')}</h3>
          <p>{t('These episodes are scheduled but are not playable from your provider yet.')}</p>
        </div>
        {onViewSchedule && (
          <Button variant="ghost" size="sm" onClick={onViewSchedule}>
            <span>{t('View schedule')}</span>
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className={styles.announcedList}>
        {announcedGroups.slice(0, 4).map((group) => {
          const primary = group.primaryRelease;
          const exactTime = group.exactAirTime ? exactTimestampDate(group.exactAirTime) : null;
          const calendarDate = exactTime ?? localCalendarDate(group.airDate);
          const phase = releasePhase(group, now);
          const status =
            countdownEnabled && phase === 'upcoming'
              ? group.exactAirTime
                ? timestampCountdown(group.exactAirTime, now)
                : releaseCountdown(group.airDate, now)
              : releaseStatusLabel(group, now);
          const episodeCode =
            group.episodeCount > 1
              ? (group.summarySubtitle.split(' · ')[0] ?? group.summarySubtitle)
              : primary.seasonNumber !== null && primary.episodeNumber !== null
                ? `S${primary.seasonNumber} E${primary.episodeNumber}`
                : t('Next episode');
          const title =
            group.episodeCount > 1
              ? t('{count} announced episodes', { count: number(group.episodeCount) })
              : primary.title;
          const dateLabel = calendarDate
            ? date(
                calendarDate,
                exactTime
                  ? {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }
                  : { weekday: 'short', month: 'short', day: 'numeric' },
              )
            : group.airDate;
          const isReleased = phase === 'released';

          return (
            <article
              key={`${group.favorite.id}-${group.airDate}-${episodeCode}`}
              className={`${styles.announcedEpisodeCard} ${isReleased ? styles.announcedEpisodeReleased : ''}`}
              aria-label={t('{episode}, {title}, {date}', {
                episode: episodeCode,
                title,
                date: dateLabel,
              })}
            >
              <div className={styles.episodeImageWrapper}>
                {primary.artworkUrl ? (
                  <img
                    src={primary.artworkUrl}
                    alt=""
                    className={styles.episodeImage}
                    loading="lazy"
                  />
                ) : (
                  <span className={styles.announcedArtworkFallback} aria-hidden="true">
                    <CalendarClock size={24} />
                  </span>
                )}
                <span className={styles.announcedArtworkState} aria-hidden="true">
                  {isReleased ? <Clock3 size={16} /> : <CalendarClock size={16} />}
                </span>
              </div>

              <div className={styles.episodeInfo}>
                <div className={styles.episodeHeaderLine}>
                  <span className={styles.episodeBadge}>{episodeCode}</span>
                  <span className={styles.episodeTitle}>{title}</span>
                </div>
                <div className={styles.episodeMeta}>
                  <span>{dateLabel}</span>
                  {status && (
                    <span
                      className={
                        isReleased ? styles.announcedReleasedStatus : styles.announcedTiming
                      }
                    >
                      {t(status)}
                    </span>
                  )}
                </div>
                <span className={styles.announcedAvailability}>
                  <LockKeyhole size={12} aria-hidden="true" />
                  {t(isReleased ? 'Waiting for provider' : 'Not available yet')}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
