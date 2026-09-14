import { describe, expect, it } from 'vitest';
import {
  redactDiagnosticText,
  redactDiagnosticValue,
  redactSensitiveText,
} from '@/shared/lib/redact';

describe('diagnostic redaction', () => {
  it('redacts Xtream query credentials', () => {
    const result = redactSensitiveText(
      'https://provider.test/player_api.php?username=alice&password=hunter2&action=get_live_streams',
    );

    expect(result).not.toContain('alice');
    expect(result).not.toContain('hunter2');
    expect(result).toContain('action=get_live_streams');
  });

  it('redacts credential-bearing stream paths', () => {
    const result = redactSensitiveText('https://provider.test/movie/alice/hunter2/42.mkv');

    expect(result).toBe('https://provider.test/movie/[REDACTED]/[REDACTED]/42.mkv');
  });

  it('redacts percent-encoded credentials', () => {
    const result = redactSensitiveText(
      'url=https%3A%2F%2Fprovider.test%2Flive%2Falice%2Fhunter2%2F42.m3u8',
    );

    expect(result).not.toContain('alice');
    expect(result).not.toContain('hunter2');
  });

  it('sanitizes nested sensitive keys and circular objects', () => {
    const details: Record<string, unknown> = {
      username: 'alice',
      nested: { token: 'abc', url: 'https://x.test/live/alice/hunter2/1' },
    };
    details.self = details;

    const result = redactDiagnosticValue(details);

    expect(result).toEqual({
      username: '[REDACTED]',
      nested: {
        token: '[REDACTED]',
        url: '[URL]',
      },
      self: '[Circular]',
    });
  });

  it('omits ordinary URLs and local paths from diagnostic text', () => {
    expect(redactDiagnosticText('Opening https://cdn.test/public/video.m3u8')).toBe(
      'Opening [URL]',
    );
    expect(redactDiagnosticText('Opening C:\\Users\\viewer\\Videos\\movie.mkv')).toBe(
      'Opening [PATH]',
    );
    expect(redactDiagnosticText('Opening /home/viewer/Videos/movie.mkv')).toBe('Opening [PATH]');
  });

  it('preserves bare protocol examples while redacting complete URLs', () => {
    expect(redactDiagnosticText('Use http:// or https://.')).toBe('Use http:// or https://.');
    expect(redactDiagnosticText('Try file:///home/viewer/private.m3u.')).toBe('Try [URL]');
  });
});
