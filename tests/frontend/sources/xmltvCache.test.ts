// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  xmltvFetch: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/platform/tauri', () => ({ tauriApi: native }));

import { fetchXmltvGuide } from '@/modules/guide/data/xmltvClient';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('native XMLTV payload hydration', () => {
  it('rebuilds frontend indexes from the normalized native payload', async () => {
    native.xmltvFetch.mockResolvedValue({
      channels: [{ id: 'one', names: ['One'] }],
      programmeGroups: [
        {
          channelId: 'one',
          programmes: [
            {
              start: 1_786_535_200_000,
              end: 1_786_538_800_000,
              title: 'News',
              description: '',
            },
          ],
        },
      ],
    });

    await expect(fetchXmltvGuide('https://guide.test/epg.xml')).resolves.toMatchObject({
      programmeCount: 1,
      channelCount: 1,
    });
  });

  it('propagates native validation failures without a webview commit step', async () => {
    native.xmltvFetch.mockRejectedValue(new Error('The guide is not valid XML.'));
    await expect(fetchXmltvGuide('https://guide.test/broken.xml')).rejects.toThrow('not valid XML');
  });
});
