import { describe, expect, it } from 'vitest';
import { getErrorPresentation, shouldRetryQuery } from '@/shared/lib/error';

describe('user-facing error handling', () => {
  it('classifies transport failures while redacting their private detail', () => {
    const result = getErrorPresentation(
      new Error(
        'Failed to fetch https://provider.test/player_api.php?username=user&password=secret',
      ),
      'movies',
    );

    expect(result.kind).toBe('offline');
    expect(result.title).toBe('Can’t reach movies');
    expect(result.description).not.toContain('secret');
    expect(result.description).not.toContain('provider.test');
    expect(result.detail).toBe('Failed to fetch [URL]');
  });

  it('distinguishes timeouts and account failures', () => {
    const timeout = getErrorPresentation(new Error('Provider request timed out'), 'series');
    expect(timeout.kind).toBe('timeout');
    expect(timeout.title).toBe('Series took too long to respond');
    expect(
      getErrorPresentation(new Error('Invalid credentials or account expired.'), 'series').kind,
    ).toBe('authentication');
    expect(getErrorPresentation(new Error('XC API Error: 403 Forbidden'), 'series').kind).toBe(
      'authentication',
    );
    expect(getErrorPresentation(new Error('Auth failed'), 'series').kind).toBe('authentication');
    expect(getErrorPresentation(new Error('HTTP 408'), 'series').kind).toBe('timeout');
  });

  it('separates source setup, unreadable data, and temporary source failures', () => {
    expect(getErrorPresentation(new Error('The playlist URL answered 404'), 'movies').kind).toBe(
      'configuration',
    );
    expect(getErrorPresentation(new Error('TMDB request failed (401)'), 'movies').kind).toBe(
      'authentication',
    );
    expect(
      getErrorPresentation(new Error('TMDB request failed (HTTP 401 Unauthorized)'), 'movies').kind,
    ).toBe('authentication');
    expect(getErrorPresentation(new Error('TVmaze request failed (503)'), 'movies').kind).toBe(
      'server',
    );
    expect(
      getErrorPresentation(new Error('Invalid JSON returned by provider'), 'movies').kind,
    ).toBe('invalid-response');
    expect(getErrorPresentation(new Error('HTTP status 503'), 'movies').kind).toBe('server');
  });

  it('retries transient failures only within the bounded retry budget', () => {
    expect(shouldRetryQuery(0, new Error('HTTP 503'))).toBe(true);
    expect(shouldRetryQuery(2, new Error('HTTP 503'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('HTTP 401'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('The guide URL answered 404'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('HTTP 429'))).toBe(true);
    expect(shouldRetryQuery(0, new Error('Provider request cancelled'))).toBe(false);
  });

  it('surfaces the complete raw failure as a separate, untranslated detail', () => {
    expect(getErrorPresentation(new Error('XC API Error: 403 Forbidden'), 'series').detail).toBe(
      'XC API Error: 403 Forbidden',
    );
    expect(getErrorPresentation(new Error('The playlist URL answered 404'), 'movies').detail).toBe(
      'The playlist URL answered 404',
    );
    expect(getErrorPresentation(new Error('HTTP status 503'), 'movies').detail).toBe(
      'HTTP status 503',
    );
    expect(
      getErrorPresentation(new Error('Provider request timed out after 5s'), 'series').detail,
    ).toBe('Provider request timed out after 5s');
    expect(
      getErrorPresentation(new Error('Invalid JSON returned by provider'), 'movies').detail,
    ).toBe('Invalid JSON returned by provider');
  });

  it('leaves detail null only when the failure has no usable message', () => {
    expect(getErrorPresentation(null, 'movies').detail).toBeNull();
  });
});
