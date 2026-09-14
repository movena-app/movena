import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import type { MediaItem, MediaOpenContext } from '@/modules/catalog/public/model/media';
import { IconButton } from '@/shared/ui/Button';
import {
  exactTimestampDate,
  localCalendarDate,
  releasePhase,
  releaseStatusLabel,
  type GroupedUpcomingRelease,
} from '../lib/upcoming';
import { parseMediaDisplayTitle } from '@/modules/catalog/public/lib/titleParser';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './UpcomingCalendar.module.css';

interface UpcomingCalendarProps {
  groups: readonly GroupedUpcomingRelease[];
  now: Date;
  onOpen: (item: MediaItem, context?: MediaOpenContext) => void;
}

function openContext(group: GroupedUpcomingRelease): MediaOpenContext | undefined {
  const { seasonNumber, episodeNumber } = group.primaryRelease;
  return seasonNumber === null && episodeNumber === null
    ? undefined
    : {
        seasonNumber: seasonNumber ?? undefined,
        episodeNumber: episodeNumber ?? undefined,
      };
}

const WEEKDAY_DATES = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, index + 1));

function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from(
    { length: 42 },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  );
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayTitle(item: MediaItem): string {
  return parseMediaDisplayTitle(item.title, item.year)?.cleanTitle ?? item.title;
}

export function UpcomingCalendar({ groups: groupedReleases, now, onOpen }: UpcomingCalendarProps) {
  const { t, tn, date } = useI18n();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const days = useMemo(() => calendarDays(month), [month]);
  const events = useMemo(() => {
    const grouped = new Map<string, GroupedUpcomingRelease[]>();
    for (const releaseGroup of groupedReleases) {
      if (!localCalendarDate(releaseGroup.airDate)) continue;
      const items = grouped.get(releaseGroup.airDate) ?? [];
      items.push(releaseGroup);
      grouped.set(releaseGroup.airDate, items);
    }
    return grouped;
  }, [groupedReleases]);
  const today = isoDay(now);
  const visibleMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const monthReleases = useMemo(() => {
    return groupedReleases.filter((group) => group.airDate.startsWith(visibleMonth));
  }, [groupedReleases, visibleMonth]);
  const changeMonth = (step: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1));

  return (
    <section className={styles.calendar} aria-labelledby="calendar-heading">
      <div className={styles.header}>
        <h2 className={styles.title} id="calendar-heading">
          {t('Release calendar')}
        </h2>
        <div className={styles.controls}>
          <IconButton size="sm" onClick={() => changeMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </IconButton>
          <span className={styles.month}>{date(month, { month: 'long', year: 'numeric' })}</span>
          <IconButton size="sm" onClick={() => changeMonth(1)} aria-label="Next month">
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      <div className={styles.gridView}>
        <div className={styles.weekdays}>
          {WEEKDAY_DATES.map((day) => (
            <span className={styles.weekday} key={day.getDay()}>
              {date(day, { weekday: 'short' })}
            </span>
          ))}
        </div>
        <div className={styles.days}>
          {days.map((day) => {
            const key = isoDay(day);
            const dayEvents = events.get(key) ?? [];
            const isCurrentMonth = day.getMonth() === month.getMonth();
            return (
              <div
                className={`${styles.day} ${!isCurrentMonth ? styles.outside : ''} ${key === today ? styles.today : ''}`}
                key={key}
              >
                <span className={styles.dayNumber}>{date(day, { day: 'numeric' })}</span>
                <div className={styles.events}>
                  {dayEvents.map((group) => {
                    const airTime = group.exactAirTime
                      ? exactTimestampDate(group.exactAirTime)
                      : null;
                    const time = airTime
                      ? date(airTime, { hour: 'numeric', minute: '2-digit' })
                      : null;
                    const title = displayTitle(group.favorite);
                    const isReleased = releasePhase(group, now) === 'released';
                    const scheduleText = isReleased
                      ? t(releaseStatusLabel(group, now) ?? 'Released')
                      : group.episodeCount > 1
                        ? time
                          ? `${time} · ${tn('{count} ep', '{count} eps', group.episodeCount)}`
                          : tn('{count} episode', '{count} episodes', group.episodeCount)
                        : (time ?? t('Date only'));
                    return (
                      <button
                        type="button"
                        className={`${styles.event} ${isReleased ? styles.eventReleased : ''}`}
                        key={`${group.favorite.id}-${group.airDate}`}
                        onClick={() => onOpen(group.favorite, openContext(group))}
                        aria-label={t('Open {title}', { title })}
                      >
                        <span className={styles.eventTitle}>{title}</span>
                        <span className={styles.eventSchedule}>
                          {time && !isReleased ? (
                            <Clock3 size={11} aria-hidden="true" />
                          ) : (
                            <CalendarDays size={11} aria-hidden="true" />
                          )}
                          <span>{scheduleText}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.agenda}>
        {monthReleases.length === 0 ? (
          <p className={styles.agendaEmpty}>{t('No releases this month.')}</p>
        ) : (
          monthReleases.map((group) => {
            const releaseDate = localCalendarDate(group.airDate)!;
            const airTime = group.exactAirTime ? exactTimestampDate(group.exactAirTime) : null;
            const title = displayTitle(group.favorite);
            const status = releaseStatusLabel(group, now);
            return (
              <button
                type="button"
                className={styles.agendaItem}
                key={`${group.favorite.id}-${group.airDate}`}
                onClick={() => onOpen(group.favorite, openContext(group))}
                aria-label={t('Open {title}', { title })}
              >
                <span className={styles.agendaDate}>
                  <strong>{date(releaseDate, { day: 'numeric' })}</strong>
                  <span>{date(releaseDate, { month: 'short' })}</span>
                </span>
                <span className={styles.agendaCopy}>
                  <strong>{title}</strong>
                  <span>{group.summarySubtitle}</span>
                </span>
                <span className={styles.agendaTime}>
                  {releasePhase(group, now) === 'released'
                    ? t(status ?? 'Released')
                    : airTime
                      ? date(airTime, { hour: 'numeric', minute: '2-digit' })
                      : t('Date only')}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
