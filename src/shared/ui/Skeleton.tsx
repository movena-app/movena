import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';
import { useI18n } from '../i18n/i18n';

function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  return <div className={`${styles.skeleton} ${className}`} style={style} />;
}

function MediaCardSkeleton({
  viewMode = 'grid',
  isLiveTv = false,
}: {
  viewMode?: 'grid' | 'list' | undefined;
  isLiveTv?: boolean | undefined;
}) {
  if (viewMode === 'list') {
    return (
      <div className={styles.listCard}>
        {isLiveTv && <SkeletonBlock className={styles.listChannelNumber} />}
        <SkeletonBlock
          className={`${styles.listPoster} ${isLiveTv ? styles.listPosterLive : ''}`}
        />
        <div className={styles.listMeta}>
          <SkeletonBlock className={styles.titleLine} />
          <SkeletonBlock className={styles.shortLine} />
        </div>
        <SkeletonBlock className={styles.listTrailing} />
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${isLiveTv ? styles.cardLiveTvGrid : ''}`}>
      <div className={styles.posterFrame}>
        <SkeletonBlock className={`${styles.poster} ${isLiveTv ? styles.posterLiveTvGrid : ''}`} />
        <div
          className={`${styles.posterFooterSkeleton} ${isLiveTv ? styles.posterFooterSkeletonLive : ''}`}
        >
          <SkeletonBlock className={styles.posterTitleLine} />
          <SkeletonBlock className={styles.posterMetaLine} />
        </div>
      </div>
    </div>
  );
}

export function TextLineSkeleton({ width = 180 }: { width?: number | undefined }) {
  return <SkeletonBlock className={styles.textLine} style={{ width }} />;
}

export function GridSkeleton({
  count = 12,
  viewMode = 'grid',
  isLiveTv = false,
}: {
  count?: number | undefined;
  viewMode?: 'grid' | 'list' | undefined;
  isLiveTv?: boolean | undefined;
}) {
  return (
    <div
      className={viewMode === 'list' ? styles.listGrid : isLiveTv ? styles.gridLiveTv : styles.grid}
    >
      {Array.from({ length: count }).map((_, index) => (
        <MediaCardSkeleton key={index} viewMode={viewMode} isLiveTv={isLiveTv} />
      ))}
    </div>
  );
}

export function CarouselSkeleton({
  title,
  count = 12,
  isLiveTv = false,
}: {
  title: string;
  count?: number | undefined;
  isLiveTv?: boolean | undefined;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.carousel}>
      <div className={styles.carouselHeader}>
        <div className={styles.titleGroup}>
          <h2>{t(title)}</h2>
          <SkeletonBlock className={styles.seeAllBadge} />
        </div>
        <div className={styles.fakeControls}>
          <SkeletonBlock className={styles.controlDot} />
          <SkeletonBlock className={styles.controlDot} />
        </div>
      </div>
      <div className={styles.carouselTrack}>
        {Array.from({ length: count }).map((_, index) => (
          <div className={styles.carouselItem} key={index}>
            <MediaCardSkeleton isLiveTv={isLiveTv} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategorySkeleton() {
  return (
    <div className={styles.categoryList}>
      {Array.from({ length: 10 }).map((_, index) => (
        <SkeletonBlock
          key={index}
          className={styles.categoryLine}
          style={{ width: `${index % 3 === 0 ? 72 : index % 3 === 1 ? 88 : 64}%` }}
        />
      ))}
    </div>
  );
}

export function MovieDetailSkeleton() {
  return (
    <div className={styles.modalLayout}>
      <div className={styles.modalSidebar}>
        <SkeletonBlock className={styles.modalPoster} />
        <SkeletonBlock className={styles.modalButton} />
        <div className={styles.modalIconRow}>
          <SkeletonBlock className={styles.modalIconBtn} />
        </div>
      </div>
      <div className={styles.modalDetails}>
        <SkeletonBlock className={styles.modalTitle} />
        <div className={styles.chipRow}>
          <SkeletonBlock className={styles.chip} />
          <SkeletonBlock className={styles.chip} />
          <SkeletonBlock className={styles.chipWide} />
        </div>
        <SkeletonBlock className={styles.paragraphWide} />
        <SkeletonBlock className={styles.paragraph} />
        <SkeletonBlock className={styles.paragraphShort} />
      </div>
    </div>
  );
}

export function SeriesDetailSkeleton() {
  return (
    <div className={styles.seriesLayout}>
      <div className={styles.seriesSidebar}>
        <SkeletonBlock className={styles.seriesPoster} />
        <div className={styles.modalIconRow}>
          <SkeletonBlock className={styles.modalIconBtn} />
          <SkeletonBlock className={styles.modalIconBtn} />
        </div>
        <SkeletonBlock className={styles.titleLine} />
        <SkeletonBlock className={styles.paragraph} />
        <SkeletonBlock className={styles.categoryLine} />
        <SkeletonBlock className={styles.categoryLine} />
      </div>
      <div className={styles.episodeList}>
        <SkeletonBlock className={styles.episodeHeading} />
        {Array.from({ length: 4 }).map((_, index) => (
          <div className={styles.episodeCard} key={index}>
            <SkeletonBlock className={styles.episodeThumb} />
            <div className={styles.episodeMeta}>
              <SkeletonBlock className={styles.titleLine} />
              <SkeletonBlock className={styles.paragraph} />
              <SkeletonBlock className={styles.shortLine} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
