// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hydrateXmltvGuide,
  lookupXmltvChannel,
  mergeXmltvGuides,
  parseXmltv,
  parseXmltvTime,
  settleWithConcurrency,
} from '@/modules/guide/data/xmltvClient';

const XML = `<?xml version="1.0"?>
<tv>
  <channel id="channel.de"><display-name>Example TV</display-name></channel>
  <channel id="empty"><display-name>Empty Channel</display-name></channel>
  <programme channel="channel.de" start="20260810130000 +0200" stop="20260810140000 +0200">
    <title>Later</title><desc>Second programme</desc>
  </programme>
  <programme channel="channel.de" start="20260810120000 +0200" stop="20260810130000 +0200">
    <title>Earlier</title>
  </programme>
  <programme channel="channel.de" start="bad" stop="20260810150000 +0200"><title>Invalid</title></programme>
</tv>`;

afterEach(() => vi.unstubAllGlobals());

describe('XMLTV parsing', () => {
  it('parses seconds and timezone offsets into UTC timestamps', () => {
    expect(parseXmltvTime('20260810123456 +0200')).toBe(Date.UTC(2026, 7, 10, 10, 34, 56));
    expect(parseXmltvTime('202608101234 -0530')).toBe(Date.UTC(2026, 7, 10, 18, 4, 0));
    expect(parseXmltvTime('not-a-time')).toBe(0);
  });

  it('rejects impossible calendar dates, clock values, and timezone offsets', () => {
    expect(parseXmltvTime('20260230100000 +0000')).toBe(0);
    expect(parseXmltvTime('20260810246000 +0000')).toBe(0);
    expect(parseXmltvTime('20260810100000 +2460')).toBe(0);
  });

  it('indexes names, drops invalid programmes, and sorts listings', () => {
    const guide = parseXmltv(XML);

    expect(guide.channelCount).toBe(1);
    expect(guide.programmeCount).toBe(2);
    expect(guide.idByName.get('example tv')).toBe('channel.de');
    expect(guide.nameById.get('channel.de')).toBe('Example TV');
    expect(guide.byChannel.get('channel.de')?.map((programme) => programme.title)).toEqual([
      'Earlier',
      'Later',
    ]);
  });

  it('rejects malformed XML', () => {
    expect(() => parseXmltv('<tv><programme></tv>')).toThrow('This guide is not valid XML.');
  });

  it('prefers channel ids and falls back to normalized display names', () => {
    const guide = parseXmltv(XML);
    const expected = guide.byChannel.get('channel.de');

    expect(lookupXmltvChannel(guide, 'channel.de', 'Wrong name')).toBe(expected);
    expect(lookupXmltvChannel(guide, 'missing', '  EXAMPLE TV ')).toBe(expected);
    expect(lookupXmltvChannel(undefined, 'channel.de', 'Example TV')).toBeUndefined();
  });

  it('keeps identical channel ids isolated when guides from multiple sources are merged', () => {
    const guide = parseXmltv(XML);
    const merged = mergeXmltvGuides([
      { sourceId: 'm3u-one', guide },
      { sourceId: 'm3u-two', guide },
    ]);

    expect(merged.channelCount).toBe(2);
    expect(merged.programmeCount).toBe(4);
    expect(lookupXmltvChannel(merged, 'channel.de', 'Example TV', 'm3u-one')?.[0]!.id).toMatch(
      /^m3u-one::/,
    );
    expect(lookupXmltvChannel(merged, 'missing', 'Example TV', 'm3u-two')?.[0]!.id).toMatch(
      /^m3u-two::/,
    );
  });

  it('hydrates normalized native payloads with first-name matching and sorted IDs', () => {
    const guide = hydrateXmltvGuide({
      channels: [
        { id: 'one', names: ['Shared', 'One'] },
        { id: 'two', names: ['Shared', 'Two'] },
      ],
      programmeGroups: [
        {
          channelId: 'one',
          programmes: [
            { start: 20, end: 30, title: 'Later', description: '' },
            { start: 10, end: 20, title: 'Earlier', description: '' },
          ],
        },
      ],
    });
    expect(guide.idByName.get('shared')).toBe('one');
    expect(guide.byChannel.get('one')?.map((programme) => programme.title)).toEqual([
      'Earlier',
      'Later',
    ]);
    expect(guide.byChannel.get('one')?.[0]!.id).toBe('one-10');
  });

  it('bounds multi-source work to two active requests and stops queued work on abort', async () => {
    const signal = new AbortController().signal;
    let active = 0;
    let maximum = 0;
    const settled = await settleWithConcurrency([1, 2, 3, 4], 2, signal, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return value * 2;
    });
    expect(maximum).toBe(2);
    expect(settled).toEqual([2, 4, 6, 8].map((value) => ({ status: 'fulfilled', value })));

    const controller = new AbortController();
    const started: number[] = [];
    await expect(
      settleWithConcurrency([1, 2, 3], 2, controller.signal, async (value) => {
        started.push(value);
        controller.abort();
        return value;
      }),
    ).rejects.toThrow();
    expect(started).toEqual([1]);
  });
});
