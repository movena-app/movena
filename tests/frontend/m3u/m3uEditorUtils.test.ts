import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ m3uProbeStream: vi.fn() }));
vi.mock('@/platform/tauri', () => ({ tauriApi: native }));
import type { M3uEntry } from '@/modules/sources/data/m3uClient';
import {
  cleanChannelTitle,
  detectDuplicates,
  findAndReplace,
  renumberChannels,
  checkStreamHealth,
  probeStreamHealth,
  validateM3uEntries,
  buildEpgMatchSuggestions,
  mergeDuplicateEntries,
  applyTransformPreset,
} from '@/modules/m3u-editor/lib/m3uEditor';
import type { XmltvGuide } from '@/modules/guide/data/xmltvClient';

const createEntry = (overrides: Partial<M3uEntry>): M3uEntry => ({
  id: 'm3u-1',
  sourceId: 'src-1',
  title: 'Channel One',
  url: 'https://stream.test/1.m3u8',
  type: 'live',
  duration: -1,
  groupTitle: 'General',
  categoryId: 'cat-1',
  headers: {},
  ...overrides,
});

describe('M3U Editor Utilities', () => {
  describe('cleanChannelTitle', () => {
    it('removes resolution and quality tags', () => {
      expect(
        cleanChannelTitle('BBC One [4K] [FHD] (1080p) HD', { removeResolutionTags: true }),
      ).toBe('BBC One');
      expect(
        cleanChannelTitle('Sky Sports 1 [50FPS] (HEVC) 60fps', { removeResolutionTags: true }),
      ).toBe('Sky Sports 1');
    });

    it('removes country and language prefixes', () => {
      expect(cleanChannelTitle('[US] HBO HD', { removeCountryPrefixes: true })).toBe('HBO HD');
      expect(cleanChannelTitle('|UK| BBC News', { removeCountryPrefixes: true })).toBe('BBC News');
      expect(cleanChannelTitle('DE: Das Erste', { removeCountryPrefixes: true })).toBe('Das Erste');
    });

    it('removes provider noise and decorative characters', () => {
      expect(cleanChannelTitle('### VIP ### Sports 1 >>>', { removeProviderNoise: true })).toBe(
        'VIP Sports 1',
      );
      expect(cleanChannelTitle('| Channel Name |', { removeProviderNoise: true })).toBe(
        'Channel Name',
      );
    });

    it('combines multiple cleanup options cleanly', () => {
      const dirty = '|US| Discovery Channel [4K] (1080p) ###';
      expect(
        cleanChannelTitle(dirty, {
          removeResolutionTags: true,
          removeCountryPrefixes: true,
          removeProviderNoise: true,
        }),
      ).toBe('Discovery Channel');
    });
  });

  describe('detectDuplicates', () => {
    it('detects duplicate stream URLs', () => {
      const entries: M3uEntry[] = [
        createEntry({
          id: '1',
          title: 'Channel A',
          url: 'https://stream.example.test/stream.m3u8',
        }),
        createEntry({
          id: '2',
          title: 'Channel B',
          url: 'https://stream.example.test/stream.m3u8',
        }),
        createEntry({
          id: '3',
          title: 'Channel C',
          url: 'https://stream.example.test/unique.m3u8',
        }),
      ];

      const duplicates = detectDuplicates(entries);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]!.type).toBe('url');
      expect(duplicates[0]!.entries).toHaveLength(2);
      expect(duplicates[0]!.entries.map((e) => e.id)).toEqual(['1', '2']);
    });

    it('detects duplicate channel names in the same group', () => {
      const entries: M3uEntry[] = [
        createEntry({
          id: '1',
          title: 'BBC One',
          groupTitle: 'UK',
          url: 'https://stream.example.test/1.m3u8',
        }),
        createEntry({
          id: '2',
          title: 'BBC One',
          groupTitle: 'UK',
          url: 'https://stream.example.test/2.m3u8',
        }),
        createEntry({
          id: '3',
          title: 'BBC One',
          groupTitle: 'USA',
          url: 'https://stream.example.test/3.m3u8',
        }),
      ];

      const duplicates = detectDuplicates(entries);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]!.type).toBe('name');
      expect(duplicates[0]!.entries).toHaveLength(2);
      expect(duplicates[0]!.entries.map((e) => e.id)).toEqual(['1', '2']);
    });
  });

  describe('findAndReplace', () => {
    it('finds and replaces text across stream titles or URLs', () => {
      const entries: M3uEntry[] = [
        createEntry({
          id: '1',
          title: 'OldServer Sports',
          url: 'http://old.example.test:8080/live/1',
        }),
        createEntry({
          id: '2',
          title: 'OldServer Movies',
          url: 'http://old.example.test:8080/live/2',
        }),
        createEntry({ id: '3', title: 'Other Stream', url: 'http://new.example.test/live/3' }),
      ];

      const titleResult = findAndReplace(entries, {
        field: 'title',
        findText: 'OldServer',
        replaceText: 'NewServer',
      });
      expect(titleResult.count).toBe(2);
      expect(titleResult.entries[0]!.title).toBe('NewServer Sports');

      const urlResult = findAndReplace(entries, {
        field: 'url',
        findText: 'http://old.example.test:8080',
        replaceText: 'https://cdn.example.com',
      });
      expect(urlResult.count).toBe(2);
      expect(urlResult.entries[0]!.url).toBe('https://cdn.example.com/live/1');
    });
  });

  describe('playlist review tools', () => {
    it('reports malformed URLs and duplicate channel numbers', () => {
      const issues = validateM3uEntries([
        createEntry({ id: '1', channelNumber: '7', url: 'not-a-url', tvgId: undefined }),
        createEntry({
          id: '2',
          channelNumber: '7',
          url: 'https://stream.test/two',
          tvgId: undefined,
        }),
      ]);
      expect(issues.some((issue) => issue.code === 'invalid-url' && issue.entryId === '1')).toBe(
        true,
      );
      expect(issues.filter((issue) => issue.code === 'duplicate-channel-number')).toHaveLength(2);
    });

    it('suggests XMLTV IDs with confidence and recognizes existing matches', () => {
      const guide: XmltvGuide = {
        byChannel: new Map([['src-1::bbc.one', []]]),
        idByName: new Map([['src-1::bbc one', 'src-1::bbc.one']]),
        nameById: new Map([['src-1::bbc.one', 'BBC One']]),
        channelCount: 1,
        programmeCount: 0,
      };
      const suggestions = buildEpgMatchSuggestions(
        [
          createEntry({ id: '1', title: 'BBC One [HD]', tvgId: undefined }),
          createEntry({ id: '2', title: 'BBC One', tvgId: 'bbc.one' }),
        ],
        guide,
        'src-1',
      );
      expect(suggestions[0]).toEqual(
        expect.objectContaining({ status: 'suggested', suggestedTvgId: 'bbc.one' }),
      );
      expect(suggestions[0]!.confidence).toBeGreaterThan(0.85);
      expect(suggestions[1]!.status).toBe('matched');
    });

    it('merges complementary duplicate metadata into the chosen primary', () => {
      const primary = createEntry({
        id: '1',
        title: 'Primary',
        logo: undefined,
        description: 'Short',
      });
      const secondary = createEntry({
        id: '2',
        title: 'Backup',
        logo: 'https://logo.test/one.png',
        description: 'A longer useful description',
        tvgId: 'one.epg',
      });
      const merged = mergeDuplicateEntries(primary, [primary, secondary]);
      expect(merged).toEqual(
        expect.objectContaining({
          id: '1',
          title: 'Primary',
          url: primary.url,
          logo: secondary.logo,
          description: secondary.description,
          tvgId: 'one.epg',
        }),
      );
    });

    it('applies a reusable transformation preset', () => {
      const result = applyTransformPreset([createEntry({ title: 'BBC One [HD]' })], {
        id: 'clean-1',
        name: 'Remove quality',
        kind: 'clean',
        createdAt: 1,
        cleanOptions: { removeResolutionTags: true },
      });
      expect(result.count).toBe(1);
      expect(result.entries[0]!.title).toBe('BBC One');
    });
  });

  describe('renumberChannels', () => {
    it('renumbers channels sequentially from given start number', () => {
      const entries: M3uEntry[] = [
        createEntry({ id: '1', channelNumber: '99' }),
        createEntry({ id: '2', channelNumber: '5' }),
        createEntry({ id: '3', channelNumber: undefined }),
      ];

      const renumbered = renumberChannels(entries, 100);
      expect(renumbered[0]!.channelNumber).toBe('100');
      expect(renumbered[1]!.channelNumber).toBe('101');
      expect(renumbered[2]!.channelNumber).toBe('102');
    });
  });

  describe('checkStreamHealth', () => {
    it('returns the native probe status', async () => {
      native.m3uProbeStream.mockResolvedValue({ status: 'online', httpStatus: 200, latencyMs: 4 });

      const status = await checkStreamHealth('https://stream.test/live.m3u8');
      expect(status).toBe('online');
    });

    it('returns offline when the native probe fails', async () => {
      native.m3uProbeStream.mockRejectedValue(new Error('Network error'));

      const status = await checkStreamHealth('https://stream.test/dead.m3u8');
      expect(status).toBe('offline');
    });

    it('retains the concrete stream probe failure', async () => {
      native.m3uProbeStream.mockRejectedValue(new Error('ECONNRESET: socket closed'));

      const result = await probeStreamHealth('https://stream.test/dead.m3u8');
      expect(result).toMatchObject({
        status: 'offline',
        errorMessage: 'ECONNRESET: socket closed',
      });
    });
  });
});
