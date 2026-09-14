import { describe, expect, it, vi } from 'vitest';

const { introDbFetchSegments } = vi.hoisted(() => ({
  introDbFetchSegments: vi.fn(),
}));

vi.mock('@/platform/tauri', () => ({
  tauriApi: { introDbFetchSegments },
}));

import { fetchIntroDbSegments } from '@/modules/playback/data/introDbClient';
import { normalizeTmdbExternalIds } from '@/modules/metadata/model/tmdb';

describe('IntroDB API client & normalization', () => {
  // The request is proxied through the Rust backend — see introdb.ts's
  // module doc — so what's under test here is the IPC call and the response
  // normalization, not a `fetch()` call.
  describe('fetchIntroDbSegments', () => {
    it('returns segments for valid episode response with seconds', async () => {
      introDbFetchSegments.mockResolvedValue({
        imdb_id: 'tt0944947',
        season: 1,
        episode: 1,
        intro: { start_sec: 95, end_sec: 172, confidence: 0.98, submission_count: 14 },
        recap: { start_sec: 0, end_sec: 45, confidence: 0.95, submission_count: 8 },
        outro: { start_sec: 3480, end_sec: 3600, confidence: 0.92, submission_count: 5 },
      });

      const segments = await fetchIntroDbSegments('tt0944947', 1, 1);
      expect(introDbFetchSegments).toHaveBeenCalledWith('tt0944947', 1, 1);
      expect(segments).toEqual({
        intro: { startSec: 95, endSec: 172 },
        recap: { startSec: 0, endSec: 45 },
        outro: { startSec: 3480, endSec: 3600 },
      });
    });

    it('falls back to converting millisecond timestamps if start_sec/end_sec are omitted', async () => {
      introDbFetchSegments.mockResolvedValue({
        imdb_id: 'tt0944947',
        season: 1,
        episode: 1,
        intro: { start_ms: 95000, end_ms: 172000, confidence: 0.9 },
        recap: null,
        outro: null,
      });

      const segments = await fetchIntroDbSegments('tt0944947', 1, 1);
      expect(segments.intro).toEqual({ startSec: 95, endSec: 172 });
      expect(segments.recap).toBeNull();
      expect(segments.outro).toBeNull();
    });

    it('filters out low-confidence submissions (< 0.5)', async () => {
      introDbFetchSegments.mockResolvedValue({
        imdb_id: 'tt0944947',
        season: 1,
        episode: 1,
        intro: { start_sec: 10, end_sec: 60, confidence: 0.2 },
        recap: null,
        outro: null,
      });

      const segments = await fetchIntroDbSegments('tt0944947', 1, 1);
      expect(segments.intro).toBeNull();
    });

    it('filters out invalid ranges where endSec <= startSec', async () => {
      introDbFetchSegments.mockResolvedValue({
        imdb_id: 'tt0944947',
        season: 1,
        episode: 1,
        intro: { start_sec: 100, end_sec: 50, confidence: 0.9 },
        recap: null,
        outro: null,
      });

      const segments = await fetchIntroDbSegments('tt0944947', 1, 1);
      expect(segments.intro).toBeNull();
    });

    it('returns empty segments when the backend has no data (show or episode not in IntroDB)', async () => {
      introDbFetchSegments.mockResolvedValue(null);

      const segments = await fetchIntroDbSegments('tt0944947', 99, 99);
      expect(segments).toEqual({ intro: null, recap: null, outro: null });
    });

    it('returns empty segments on invalid IMDb ID or non-positive season/episode without calling the backend', async () => {
      introDbFetchSegments.mockClear();

      expect(await fetchIntroDbSegments('invalid', 1, 1)).toEqual({
        intro: null,
        recap: null,
        outro: null,
      });
      expect(await fetchIntroDbSegments('tt1234567', 0, 1)).toEqual({
        intro: null,
        recap: null,
        outro: null,
      });
      expect(await fetchIntroDbSegments('tt1234567', 1, -1)).toEqual({
        intro: null,
        recap: null,
        outro: null,
      });
      expect(introDbFetchSegments).not.toHaveBeenCalled();
    });

    it('safely handles a rejected IPC call', async () => {
      introDbFetchSegments.mockRejectedValue(new Error('IPC error'));
      expect(await fetchIntroDbSegments('tt0944947', 1, 1)).toEqual({
        intro: null,
        recap: null,
        outro: null,
      });
    });
  });

  describe('normalizeTmdbExternalIds', () => {
    it('extracts valid IMDb ID from TMDB external_ids response', () => {
      expect(normalizeTmdbExternalIds({ id: 1399, imdb_id: 'tt0944947', tvdb_id: 121361 })).toEqual(
        { imdbId: 'tt0944947' },
      );
    });

    it('returns null if imdb_id is null, missing, or malformed', () => {
      expect(normalizeTmdbExternalIds({ id: 1399, imdb_id: null })).toEqual({ imdbId: null });
      expect(normalizeTmdbExternalIds({ id: 1399, imdb_id: '' })).toEqual({ imdbId: null });
      expect(normalizeTmdbExternalIds({ id: 1399, imdb_id: 'not-an-imdb-id' })).toEqual({
        imdbId: null,
      });
      expect(normalizeTmdbExternalIds(null)).toEqual({ imdbId: null });
      expect(normalizeTmdbExternalIds(undefined)).toEqual({ imdbId: null });
      expect(normalizeTmdbExternalIds('garbage')).toEqual({ imdbId: null });
    });
  });
});
