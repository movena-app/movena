import { describe, expect, it } from 'vitest';
import {
  getCombinedErrorMessage,
  getErrorMessage,
  getUserFacingErrorMessage,
} from '@/shared/lib/error';

describe('error message normalization', () => {
  it('accepts useful strings, Error objects, and message-shaped values', () => {
    expect(getErrorMessage('failed', 'fallback')).toBe('failed');
    expect(getErrorMessage(new Error('broken'), 'fallback')).toBe('broken');
    expect(getErrorMessage({ message: 'unavailable' }, 'fallback')).toBe('unavailable');
  });

  it('uses the supplied fallback and safely serializes other thrown values', () => {
    expect(getErrorMessage('  ', 'fallback')).toBe('fallback');
    expect(getErrorMessage({ message: 42 }, 'fallback')).toBe('{"message":42}');
    expect(getErrorMessage(503, 'fallback')).toBe('503');
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    expect(getErrorMessage({ password: 'private', nested: { token: 'private' } }, 'fallback')).toBe(
      '{"password":"[REDACTED]","nested":{"token":"[REDACTED]"}}',
    );
  });

  it('retains structured error codes and combines distinct simultaneous failures', () => {
    expect(getErrorMessage({ code: 'ECONNRESET', message: 'socket closed' }, 'fallback')).toBe(
      'ECONNRESET: socket closed',
    );
    expect(
      getCombinedErrorMessage(
        [
          new Error('Movies: HTTP 503'),
          new Error('Series: HTTP 502'),
          new Error('Movies: HTTP 503'),
        ],
        'fallback',
      ),
    ).toBe('Movies: HTTP 503\nSeries: HTTP 502');
    expect(getCombinedErrorMessage([null, ''], 'fallback')).toBe('fallback');
  });

  it('preserves useful technical failures without exposing private locations', () => {
    const fallback = 'The playlist could not be loaded.';
    expect(
      getUserFacingErrorMessage(
        new Error('Failed to fetch https://provider.test/playlist?username=user&password=secret'),
        fallback,
      ),
    ).toBe('Failed to fetch [URL]');
    expect(
      getUserFacingErrorMessage(
        new Error('Could not open C:\\Users\\viewer\\private.m3u'),
        fallback,
      ),
    ).toBe('Could not open [PATH]');
    expect(getUserFacingErrorMessage(new Error('The playlist URL answered 404'), fallback)).toBe(
      'The playlist URL answered 404',
    );
    expect(
      getUserFacingErrorMessage(
        new Error('Playlist URLs must start with http:// or https://.'),
        fallback,
      ),
    ).toBe('Playlist URLs must start with http:// or https://.');
    expect(getUserFacingErrorMessage('', fallback)).toBe(fallback);
  });
});
