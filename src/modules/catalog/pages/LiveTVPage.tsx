import { useCallback } from 'react';
import { Tv } from 'lucide-react';
import type { MediaItem } from '../model/media';
import { CatalogPage } from '../components/CatalogPage';
import {
  selectPrimaryXtreamCredentials,
  useAuthStore,
} from '@/modules/sources/public/store/useAuthStore';
import { usePlayerStore } from '@/modules/playback/public/store/usePlayerStore';
import { playableFromMediaItem } from '@/modules/playback/public/lib/playback';

export function LiveTvPage() {
  const credentials = useAuthStore(selectPrimaryXtreamCredentials);
  const playStream = usePlayerStore((state) => state.playStream);

  const handlePlay = useCallback(
    (item: MediaItem) => {
      const playable = playableFromMediaItem({ ...item, type: 'live' }, credentials);
      if (playable) playStream(playable);
    },
    [credentials, playStream],
  );

  return (
    <CatalogPage
      type="live"
      title="Live TV"
      icon={Tv}
      emptyTitle="No Channels Found"
      emptyDescription="There are no live channels available in this category."
      noSourceDescription="Connect an Xtream account or add an M3U playlist in Settings to view live channels."
      onItemClick={handlePlay}
      isLiveTv
    />
  );
}
