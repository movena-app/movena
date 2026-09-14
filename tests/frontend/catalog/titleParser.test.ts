import { describe, expect, it } from 'vitest';
import { countryName, parseCategoryName } from '@/shared/lib/categoryName';
import {
  applyCustomTitleRules,
  cleanProviderDescription,
  formatEpisodePlaybackTitle,
  getSeriesBaseTitle,
  parseEpisodeTitle,
  parseLiveChannelTitle,
  parseMediaDisplayTitle,
  parseMediaTitle,
  stripAdFluff,
} from '@/modules/catalog/lib/titleParser';
import {
  filterMediaTagsByVisibility,
  getMediaTagCategory,
  getTagColorType,
  normalizeMediaTag,
} from '@/shared/lib/mediaTags';

describe('provider title normalization', () => {
  it('extracts every marker from the reported VOD prefix', () => {
    expect(parseMediaTitle('4K-DE-DV - MobLand (2025)')).toEqual({
      cleanTitle: 'MobLand (2025)',
      country: 'DE',
      tags: ['4K', 'DV'],
    });
  });

  it('strips DE-DO and multi-token language/audio prefixes', () => {
    expect(parseMediaTitle('DE-DO - Over the Top')).toEqual({
      cleanTitle: 'Over the Top',
      country: 'DE',
      tags: [],
    });
    expect(parseMediaTitle('DE-DO - 2010: Moby Dick')).toEqual({
      cleanTitle: '2010: Moby Dick',
      country: 'DE',
      tags: [],
    });
    expect(parseMediaTitle('DE-DO - Die 12 Geschworenen')).toEqual({
      cleanTitle: 'Die 12 Geschworenen',
      country: 'DE',
      tags: [],
    });
    expect(parseMediaTitle('DE-DOKU - Planet Earth')).toEqual({
      cleanTitle: 'Planet Earth',
      country: 'DE',
      tags: [],
    });
    expect(parseMediaTitle('DE-AT - Movie Title')).toEqual({
      cleanTitle: 'Movie Title',
      country: 'DE',
      tags: [],
    });
    expect(parseMediaTitle('GER-4K - Inception (2010)')).toEqual({
      cleanTitle: 'Inception (2010)',
      country: 'DE',
      tags: ['4K'],
    });
    expect(parseMediaTitle('[DE-DO] Over the Top')).toEqual({
      cleanTitle: 'Over the Top',
      country: 'DE',
      tags: [],
    });
  });

  it('extracts movie editions as clean metadata badges', () => {
    expect(parseMediaTitle("Blade Runner 2049 - Director's Cut")).toEqual({
      cleanTitle: 'Blade Runner 2049',
      country: null,
      tags: ["Director's Cut"],
    });
    expect(parseMediaTitle('Avatar (2009) Extended Cut IMAX')).toEqual({
      cleanTitle: 'Avatar (2009)',
      country: null,
      tags: ['Extended Cut', 'IMAX'],
    });
    expect(parseMediaTitle('DE| The Thing (1982) Remastered Unrated')).toEqual({
      cleanTitle: 'The Thing (1982)',
      country: 'DE',
      tags: ['Remastered', 'Unrated'],
    });
  });

  it('extracts rich audio and subtitle indicators', () => {
    expect(parseMediaTitle('Dune: Part Two (2024) Dolby Atmos Multi-Audio OmU')).toEqual({
      cleanTitle: 'Dune: Part Two (2024)',
      country: null,
      tags: ['ATMOS', 'Multi-Audio', 'OmU'],
    });
    expect(parseMediaTitle('Oppenheimer (2023) DTS-HD 5.1 Multi-Sub')).toEqual({
      cleanTitle: 'Oppenheimer (2023)',
      country: null,
      tags: ['DTS-HD', '5.1', 'Multi-Sub'],
    });
  });

  it('does not strip an ordinary title prefix', () => {
    expect(parseMediaTitle('Spider-Man - No Way Home')).toEqual({
      cleanTitle: 'Spider-Man - No Way Home',
      country: null,
      tags: [],
    });
    expect(parseMediaTitle('(500) Days of Summer')).toEqual({
      cleanTitle: '(500) Days of Summer',
      country: null,
      tags: [],
    });
  });

  it('normalizes live prefixes and inline technical markers', () => {
    expect(parseLiveChannelTitle('### DE| Sky Sport UHD 60fps ###')).toEqual({
      cleanTitle: 'Sky Sport',
      country: 'DE',
      categoryPrefix: 'DE',
      qualityBadges: ['4K', '60FPS'],
    });
    expect(parseLiveChannelTitle('ALBANIA SPORT GOLD RAW')).toEqual({
      cleanTitle: 'ALBANIA SPORT',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('### ALBANIA SPORT GOLD RAW ###')).toEqual({
      cleanTitle: 'ALBANIA SPORT',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('ALBANIA GOLD RAW')).toEqual({
      cleanTitle: 'ALBANIA',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('ALBANIA GOLD')).toEqual({
      cleanTitle: 'ALBANIA',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: [],
    });
    expect(parseLiveChannelTitle('DE| Sky Cinema VIP')).toEqual({
      cleanTitle: 'Sky Cinema',
      country: 'DE',
      categoryPrefix: 'DE',
      qualityBadges: [],
    });
    expect(parseLiveChannelTitle('RTL+ RAW GOLD')).toEqual({
      cleanTitle: 'RTL+',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('SERBIA VIP RAW')).toEqual({
      cleanTitle: 'SERBIA',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('JOYN RAW DE')).toEqual({
      cleanTitle: 'JOYN',
      country: 'DE',
      categoryPrefix: 'DE',
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('APPLE+ INF & EVENTS')).toEqual({
      cleanTitle: 'APPLE+',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: [],
    });
    expect(parseLiveChannelTitle('DISNEY+ RAW')).toEqual({
      cleanTitle: 'DISNEY+',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
  });

  it('removes trailing provider separators and hash-wrapped EPG promos', () => {
    expect(parseLiveChannelTitle('DOCUMENTARY /').cleanTitle).toBe('DOCUMENTARY');
    expect(parseLiveChannelTitle('GENERAL /').cleanTitle).toBe('GENERAL');
    expect(
      cleanProviderDescription("The 'Why Am I Still Awake?' Show on ##### DOCUMENTARY HD/4K #####"),
    ).toBe("The 'Why Am I Still Awake?' Show");
    expect(cleanProviderDescription('##### DOCUMENTARY HD/4K #####')).toBe('');
    expect(cleanProviderDescription('A normal description / with punctuation')).toBe(
      'A normal description / with punctuation',
    );
  });

  it('strips telegram and web promotional fluff', () => {
    expect(stripAdFluff('[t.me/best_iptv] Sky Cinema HD FEED 1')).toBe('Sky Cinema HD');
    expect(parseLiveChannelTitle('[t.me/stream] DE| Sky Cinema HD SERVER 2')).toEqual({
      cleanTitle: 'Sky Cinema',
      country: 'DE',
      categoryPrefix: 'DE',
      qualityBadges: ['HD'],
    });
  });

  it('applies custom user title strip rules', () => {
    const rules = [
      { id: '1', pattern: 'PROMO', isRegex: false, enabled: true },
      { id: '2', pattern: '\\[BACKUP\\]', isRegex: true, enabled: true },
      { id: '3', pattern: 'DISABLED_RULE', isRegex: false, enabled: false },
    ];
    expect(applyCustomTitleRules('PROMO Sky Sport [BACKUP] DISABLED_RULE', rules)).toBe(
      'Sky Sport DISABLED_RULE',
    );
  });

  it('keeps episode titles while removing the provider prefix', () => {
    expect(getSeriesBaseTitle('4K-DE-DV - MobLand - S01E01 - Stick or Twist')).toBe('MobLand');
  });

  it('removes a standalone provider territory suffix without removing a year', () => {
    expect(parseMediaTitle('4K-DE-DV - MobLand (2025) (GB)')).toEqual({
      cleanTitle: 'MobLand (2025)',
      country: 'DE',
      tags: ['4K', 'DV'],
    });
  });

  it('separates release year for display while preserving the year in the canonical title', () => {
    expect(parseMediaDisplayTitle('4K-DE-DV - MobLand (2025)')).toEqual({
      cleanTitle: 'MobLand',
      country: 'DE',
      releaseYear: '2025',
      tags: ['4K', 'DV'],
    });
  });

  it('parses structured episode titles from typical Xtream filename formats', () => {
    expect(parseEpisodeTitle('4K-DE-DV - MobLand (2025) - S01E01 - Stick or Twist')).toEqual({
      cleanTitle: 'Stick or Twist',
      seriesTitle: 'MobLand (2025)',
      seasonNum: '1',
      episodeNum: '1',
      country: 'DE',
      tags: ['4K', 'DV'],
    });
    expect(parseEpisodeTitle('MobLand S02E09 The Deal')).toEqual({
      cleanTitle: 'The Deal',
      seriesTitle: 'MobLand',
      seasonNum: '2',
      episodeNum: '9',
      country: null,
      tags: [],
    });
  });

  it('formats clean playback titles for episode history and player chrome', () => {
    expect(
      formatEpisodePlaybackTitle('DE - Severance (2022)', 2, 4, "Severance S02E04 Woe's Hollow"),
    ).toBe("Severance (2022) · S2:E4 · Woe's Hollow");
  });
});

describe('media tag normalization and filtering', () => {
  it('normalizes various tag representations', () => {
    expect(normalizeMediaTag('4K')).toBe('4K');
    expect(normalizeMediaTag('2160p')).toBe('4K');
    expect(normalizeMediaTag('1080p')).toBe('FHD');
    expect(normalizeMediaTag('720p')).toBe('HD');
    expect(normalizeMediaTag('Dolby Atmos')).toBe('ATMOS');
    expect(normalizeMediaTag('DTS-HD MA')).toBe('DTS-HD');
    expect(normalizeMediaTag("Director's Cut")).toBe("Director's Cut");
    expect(normalizeMediaTag('Extended Edition')).toBe('Extended Cut');
    expect(normalizeMediaTag('IMAX Enhanced')).toBe('IMAX');
  });

  it('classifies tags into categories', () => {
    expect(getMediaTagCategory('4K')).toBe('resolution');
    expect(getMediaTagCategory('60FPS')).toBe('fps');
    expect(getMediaTagCategory('ATMOS')).toBe('audio');
    expect(getMediaTagCategory("Director's Cut")).toBe('edition');
  });

  it('filters tags by visibility settings', () => {
    const tags = ['4K', '60FPS', 'ATMOS', 'Extended Cut'];
    expect(
      filterMediaTagsByVisibility(tags, {
        resolution: true,
        fps: false,
        audio: true,
        edition: false,
      }),
    ).toEqual(['4K', 'ATMOS']);
  });

  it('assigns appropriate color types to tag badges', () => {
    expect(getTagColorType('4K')).toBe('gold');
    expect(getTagColorType('IMAX')).toBe('gold');
    expect(getTagColorType("Director's Cut")).toBe('purple');
    expect(getTagColorType('ATMOS')).toBe('purple');
    expect(getTagColorType('Extended Cut')).toBe('cyan');
    expect(getTagColorType('DTS-HD')).toBe('green');
    expect(getTagColorType('RAW')).toBe('coral');
  });
});

describe('category parsing', () => {
  it('parses country codes and display titles', () => {
    expect(parseCategoryName('DE| Sky Sport')).toEqual({
      country: 'DE',
      label: 'Sky Sport',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| SPORT GOLD RAW')).toEqual({
      country: 'AL',
      label: 'Sport',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| GOLD RAW')).toEqual({
      country: 'AL',
      label: 'General',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| PREMIUM RAW')).toEqual({
      country: 'AL',
      label: 'General',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| Filma /Seriale HD')).toEqual({
      country: 'AL',
      label: 'Filma / Seriale',
      tags: ['HD'],
      cluster: 'cinema',
    });
    // Unicode small caps and superscripts in categories
    expect(parseCategoryName('DE| Apple ⁴ᴷ ³⁸⁴⁰ᵖ')).toEqual({
      country: 'DE',
      label: 'Apple',
      tags: ['4K'],
      cluster: 'streaming',
    });
    expect(parseCategoryName('DE| PARAMOUNT+ ⁴ᴷ ³⁸⁴⁰ᵖ ᴰᵒˡᵇʸ ⱽᶦˢᶦᵒⁿ')).toEqual({
      country: 'DE',
      label: 'PARAMOUNT+',
      tags: ['4K'],
      cluster: 'streaming',
    });
    expect(parseCategoryName('DE| Bluray Filme ᴰᴼᴸᴮʸ ᴬᵁᴰᴵᴼ')).toEqual({
      country: 'DE',
      label: 'Filme',
      tags: ['BluRay'],
      cluster: 'cinema',
    });
    expect(parseCategoryName('AL| Sport ᴳᴼᴸᴰ ᴿᴬᵂ')).toEqual({
      country: 'AL',
      label: 'Sport',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| ᴳᴼᴸᴰ ᴿᴬᵂ')).toEqual({
      country: 'AL',
      label: 'General',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| ᴾᴿᴱᴹᴵᵁᴹ ᴿᴬᵂ')).toEqual({
      country: 'AL',
      label: 'General',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| Sport ⱽᴵᴾ ᴿᴬᵂ')).toEqual({
      country: 'AL',
      label: 'Sport',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('AL| ⱽᴵᴾ ᴿᴬᵂ')).toEqual({
      country: 'AL',
      label: 'General',
      tags: [],
      cluster: 'general',
    });
    expect(parseCategoryName('DE| Wow Entertainment ᴴᴰ ᴰᴼᴸᴮʸ ᴬᵁᴰᴵᴼ')).toEqual({
      country: 'DE',
      label: 'Wow Entertainment',
      tags: ['HD'],
      cluster: 'streaming',
    });
    expect(parseCategoryName('DE| Prime ᴿᴬᵂ ⁶⁰ᶠᵖˢ')).toEqual({
      country: 'DE',
      label: 'Prime',
      tags: [],
      cluster: 'streaming',
    });
    expect(parseCategoryName('DE| Joyn ᴿᴬᵂ')).toEqual({
      country: 'DE',
      label: 'Joyn',
      tags: [],
      cluster: 'streaming',
    });
    expect(parseCategoryName('DE| 24 / 7 Prime Video ᴿᴬᵂ')).toEqual({
      country: 'DE',
      label: 'Prime Video',
      tags: ['24/7'],
      cluster: '247',
    });
    expect(parseCategoryName('DE| 24/7 Sky Max')).toEqual({
      country: 'DE',
      label: 'Sky Max',
      tags: ['24/7'],
      cluster: '247',
    });
    expect(parseCategoryName('DE| 24/7 Cinema')).toEqual({
      country: 'DE',
      label: 'Cinema',
      tags: ['24/7'],
      cluster: '247',
    });
    expect(parseCategoryName('DE| 24 / 7')).toEqual({
      country: 'DE',
      label: '24/7',
      tags: [],
      cluster: '247',
    });
    expect(countryName('DE', 'en')).toBe('Germany');
    expect(countryName('DE', 'de')).toBe('Deutschland');
  });

  it('normalizes Unicode fancy and small-cap live channel titles', () => {
    expect(parseLiveChannelTitle('ALBANIA SPORT ᴳᴼᴸᴰ ᴿᴬᵂ')).toEqual({
      cleanTitle: 'ALBANIA SPORT',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('ALBANIA ᴳᴼᴸᴰ ᴿᴬᵂ')).toEqual({
      cleanTitle: 'ALBANIA',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('ALBANIA ᴿᴬᵂ')).toEqual({
      cleanTitle: 'ALBANIA',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
    expect(parseLiveChannelTitle('ALBANIA SPORT ᴿᴬᵂ')).toEqual({
      cleanTitle: 'ALBANIA SPORT',
      country: null,
      categoryPrefix: undefined,
      qualityBadges: ['RAW'],
    });
  });

  it('accurately parses movie release years and formats from diverse provider title formats', () => {
    expect(parseMediaDisplayTitle('Inception (2010)')).toEqual({
      cleanTitle: 'Inception',
      releaseYear: '2010',
      country: null,
      tags: [],
    });
    expect(parseMediaDisplayTitle('Inception [2010]')).toEqual({
      cleanTitle: 'Inception',
      releaseYear: '2010',
      country: null,
      tags: [],
    });
    expect(parseMediaDisplayTitle('Inception 2010')).toEqual({
      cleanTitle: 'Inception',
      releaseYear: '2010',
      country: null,
      tags: [],
    });
    expect(parseMediaDisplayTitle('DE| Oppenheimer (2023) [4K] [HDR10+] [Dolby Atmos]')).toEqual({
      cleanTitle: 'Oppenheimer',
      releaseYear: '2023',
      country: 'DE',
      tags: ['4K', 'HDR10+', 'ATMOS'],
    });
    expect(parseMediaDisplayTitle('The.Matrix.1999.1080p.BluRay.x264.DTS')).toEqual({
      cleanTitle: 'The Matrix',
      releaseYear: '1999',
      country: null,
      tags: ['FHD', 'DTS', 'BluRay', 'AVC'],
    });
    expect(parseMediaDisplayTitle('Dune: Part Two (2024) [IMAX] [Final Cut] [10-Bit]')).toEqual({
      cleanTitle: 'Dune: Part Two',
      releaseYear: '2024',
      country: null,
      tags: ['10-Bit', 'IMAX', 'Final Cut'],
    });
  });
});
