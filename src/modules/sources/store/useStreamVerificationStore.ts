import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VerifiedStreamMetadata {
  width: number;
  height: number;
  fps?: number | undefined;
  videoCodec?: string | undefined;
  audioCodec?: string | undefined;
  audioChannels?: number | undefined;
  isHdr?: boolean | undefined;
  verifiedAt: number;
}

export interface StreamVerificationState {
  verifiedStreams: Record<string, VerifiedStreamMetadata>;
  recordVerification: (streamKey: string, meta: Omit<VerifiedStreamMetadata, 'verifiedAt'>) => void;
  getVerification: (streamKey: string) => VerifiedStreamMetadata | null;
  clearVerifications: () => void;
}

const MAX_VERIFICATIONS = 500;
const MAX_VERIFICATION_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** An unchanged stream is written again only this often, so it never ages out while in use. */
const VERIFICATION_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Frame rate estimates drift by fractions of a frame; whole frames are what a badge shows. */
function sameVerification(left: VerifiedStreamMetadata, right: VerifiedStreamMetadata): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    Math.round(left.fps ?? 0) === Math.round(right.fps ?? 0) &&
    left.isHdr === right.isHdr &&
    left.videoCodec === right.videoCodec &&
    left.audioCodec === right.audioCodec &&
    left.audioChannels === right.audioChannels
  );
}

export function normalizeVerifiedStreams(
  value: unknown,
  now = Date.now(),
): Record<string, VerifiedStreamMetadata> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, candidate]) => {
      if (!key || !candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return [];
      const item = candidate as Partial<VerifiedStreamMetadata>;
      if (
        !Number.isFinite(item.width) ||
        !Number.isFinite(item.height) ||
        !Number.isFinite(item.verifiedAt) ||
        (item.width as number) <= 0 ||
        (item.height as number) <= 0 ||
        now - (item.verifiedAt as number) < 0 ||
        now - (item.verifiedAt as number) > MAX_VERIFICATION_AGE_MS
      )
        return [];
      return [
        [
          key,
          {
            width: Math.floor(item.width as number),
            height: Math.floor(item.height as number),
            ...(Number.isFinite(item.fps) && (item.fps as number) > 0
              ? { fps: item.fps as number }
              : {}),
            ...(typeof item.videoCodec === 'string'
              ? { videoCodec: item.videoCodec.slice(0, 80) }
              : {}),
            ...(typeof item.audioCodec === 'string'
              ? { audioCodec: item.audioCodec.slice(0, 80) }
              : {}),
            ...(Number.isFinite(item.audioChannels) && (item.audioChannels as number) > 0
              ? { audioChannels: item.audioChannels as number }
              : {}),
            ...(typeof item.isHdr === 'boolean' ? { isHdr: item.isHdr } : {}),
            verifiedAt: item.verifiedAt as number,
          } satisfies VerifiedStreamMetadata,
        ] as const,
      ];
    })
    .sort((left, right) => right[1].verifiedAt - left[1].verifiedAt)
    .slice(0, MAX_VERIFICATIONS)
    .reduce<Record<string, VerifiedStreamMetadata>>((result, [key, item]) => {
      result[key] = item;
      return result;
    }, {});
}

export function formatVerifiedResolution(width: number, height: number, fps?: number): string {
  let label = '';
  if (width >= 3800 || height >= 2100) label = '4K';
  else if (width >= 1900 || height >= 1000) label = '1080p';
  else if (width >= 1200 || height >= 700) label = '720p';
  else if (height > 0) label = `${height}p`;

  if (fps && fps >= 45) {
    label += `${Math.round(fps)}fps`;
  }
  return label;
}

export const useStreamVerificationStore = create<StreamVerificationState>()(
  persist(
    (set, get) => ({
      verifiedStreams: {},

      recordVerification: (streamKey, meta) => {
        if (
          !streamKey ||
          !Number.isFinite(meta.width) ||
          !Number.isFinite(meta.height) ||
          meta.width <= 0 ||
          meta.height <= 0
        )
          return;
        const now = Date.now();
        const next = normalizeVerifiedStreams({ [streamKey]: { ...meta, verifiedAt: now } }, now)[
          streamKey
        ];
        if (!next) return;
        const current = get().verifiedStreams;
        const existing = current[streamKey];
        // Playback reports the same stream once a second. Rewriting the store
        // each time persisted it and re-ran every catalogue filter mounted
        // under the player, so a stream is only written again when what it
        // delivers changed, or to keep a long-known entry from ageing out.
        if (
          existing &&
          sameVerification(existing, next) &&
          now - existing.verifiedAt < VERIFICATION_REFRESH_MS
        )
          return;
        // Untouched entries keep their identity, so only cards showing this
        // stream re-render.
        const verifiedStreams: Record<string, VerifiedStreamMetadata> = {
          ...current,
          [streamKey]: next,
        };
        const keys = Object.keys(verifiedStreams);
        if (keys.length > MAX_VERIFICATIONS) {
          keys
            .sort(
              (left, right) =>
                verifiedStreams[left]!.verifiedAt - verifiedStreams[right]!.verifiedAt,
            )
            .slice(0, keys.length - MAX_VERIFICATIONS)
            .forEach((key) => delete verifiedStreams[key]);
        }
        set({ verifiedStreams });
      },

      getVerification: (streamKey) => {
        if (!streamKey) return null;
        return get().verifiedStreams[streamKey] ?? null;
      },

      clearVerifications: () => {
        set({ verifiedStreams: {} });
      },
    }),
    {
      name: 'movena-stream-verification',
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        verifiedStreams: normalizeVerifiedStreams(
          (persisted as Partial<StreamVerificationState> | undefined)?.verifiedStreams,
        ),
      }),
      partialize: (state) => ({ verifiedStreams: normalizeVerifiedStreams(state.verifiedStreams) }),
    },
  ),
);

/**
 * Formatted verified resolution per stream id, for anything that needs to
 * check many items at once (smart-category counts/filters) rather than one
 * card's own badge. `enabled` mirrors `badgeVisibility.verified` — when the
 * user has turned verified resolutions off, callers get an empty map back
 * and fall back to whatever the provider claims, same as a single card does.
 */
export function useVerifiedResolutionMap(enabled: boolean): ReadonlyMap<string, string> {
  const verifiedStreams = useStreamVerificationStore((s) => s.verifiedStreams);
  return useMemo(() => {
    if (!enabled) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const [id, meta] of Object.entries(verifiedStreams)) {
      map.set(id, formatVerifiedResolution(meta.width, meta.height, meta.fps));
    }
    return map;
  }, [enabled, verifiedStreams]);
}
