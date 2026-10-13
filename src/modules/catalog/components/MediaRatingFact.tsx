import { Star } from 'lucide-react';
import type { MediaRating } from '@/shared/lib/rating';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './MediaRatingFact.module.css';

interface MediaRatingFactProps {
  rating: MediaRating;
  /** The details dialog's own fact-bar item and star styling. */
  className?: string | undefined;
  iconClassName?: string | undefined;
}

/** A rating in a details fact bar, always saying whose rating it is. */
export function MediaRatingFact({ rating, className, iconClassName }: MediaRatingFactProps) {
  const { t, tn, number } = useI18n();
  const value = number(rating.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const votes = rating.voteCount ?? 0;
  const description =
    rating.source === 'tmdb'
      ? tn(
          'TMDB rating {rating} out of 10 from {count} vote',
          'TMDB rating {rating} out of 10 from {count} votes',
          votes,
          { rating: value, count: number(votes) },
        )
      : t('Provider rating {rating} out of 10, not checked against TMDB', { rating: value });

  return (
    <span className={className} title={description} data-rating-source={rating.source}>
      <Star size={14} fill="currentColor" className={iconClassName} aria-hidden="true" />
      <span className={styles.value}>{value}</span>
      <span className={styles.source}>{rating.source === 'tmdb' ? 'TMDB' : t('Provider')}</span>
    </span>
  );
}
