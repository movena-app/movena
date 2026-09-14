import { describe, expect, it } from 'vitest';
import {
  createRecordingFileName,
  createRecordingOutput,
  joinRecordingPath,
} from '@/modules/playback/lib/recording';

describe('recording output paths', () => {
  const now = new Date('2026-08-10T12:34:56.789Z');

  it('creates a filesystem-safe deterministic transport-stream name', () => {
    expect(createRecordingFileName('News: Europe / HD?', now)).toBe(
      'News_ Europe _ HD__2026-08-10T12-34-56-789Z.ts',
    );
  });

  it('preserves Windows separators for absolute Windows paths', () => {
    expect(joinRecordingPath('D:\\TV\\Recordings\\', 'channel.ts')).toBe(
      'D:\\TV\\Recordings\\channel.ts',
    );
  });

  it('uses the canonical relative directory when the setting is blank', () => {
    expect(createRecordingOutput('Live', '', now).path).toBe(
      'Movena Recordings/Live_2026-08-10T12-34-56-789Z.ts',
    );
  });
});
