import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '@/modules/catalog/model/media';
import { MediaCard } from './MediaCard';
import styles from './HorizontalCarousel.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface HorizontalCarouselProps {
  title: string;
  items: MediaItem[];
  onItemClick: (item: MediaItem) => void;
  onSeeAll?: (() => void) | undefined;
  seeAllLabel?: string | undefined;
  /** Square, compact cards instead of movie-poster proportions — channel logos are small and square, not tall portraits. */
  isLiveTv?: boolean | undefined;
}

export function HorizontalCarousel({
  title,
  items,
  onItemClick,
  onSeeAll,
  seeAllLabel = 'See all',
  isLiveTv = false,
}: HorizontalCarouselProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;

    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const tolerance = 2;

    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - tolerance);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    window.addEventListener('resize', updateScrollState);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [items.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = clientWidth * 0.8; // Scroll 80% of container width

      scrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 className={styles.title}>{t(title)}</h2>
          {onSeeAll && (
            <button
              type="button"
              className={styles.seeAllBtn}
              onClick={onSeeAll}
              aria-label={t('{action} for {title}', { action: t(seeAllLabel), title: t(title) })}
            >
              <span className={styles.seeAllText}>{t(seeAllLabel)}</span>
              <ChevronRight size={16} className={styles.seeAllChevron} />
            </button>
          )}
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            aria-label={t('Scroll {title} left', { title: t(title) })}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            aria-label={t('Scroll {title} right', { title: t(title) })}
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      <div className={styles.scrollArea} ref={scrollRef} onScroll={updateScrollState}>
        <div className={styles.itemTrack}>
          {items.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === items.length - 1;
            const transformOrigin = isFirst
              ? 'left center'
              : isLast
                ? 'right center'
                : 'center center';

            return (
              <div key={item.id} className={styles.itemWrapper}>
                <MediaCard
                  item={item}
                  onClick={() => onItemClick(item)}
                  style={{ transformOrigin }}
                  isLiveTv={isLiveTv}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
