import { Tv } from 'lucide-react';
import { useLogoAspect } from '@/modules/catalog/public/hooks/useLogoAspect';
import styles from '../pages/EpgPage.module.css';

interface EpgChannelLogoProps {
  posterUrl?: string;
  channelKey: string;
  sourceId?: string | undefined;
}

export function EpgChannelLogo({ posterUrl, channelKey, sourceId }: EpgChannelLogoProps) {
  const logoAspect = useLogoAspect(posterUrl, channelKey, sourceId);
  const aspectClass =
    logoAspect === '16:9'
      ? styles.logoUnsquish169
      : logoAspect === '4:3'
        ? styles.logoUnsquish43
        : '';

  if (!posterUrl) {
    return (
      <span className={styles.channelLogoFallback}>
        <Tv size={16} />
      </span>
    );
  }

  return (
    <img className={`${styles.channelLogo} ${aspectClass}`} src={posterUrl} alt="" loading="lazy" />
  );
}
