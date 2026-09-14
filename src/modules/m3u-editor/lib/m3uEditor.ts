import type { M3uEntry } from '@/modules/sources/public/data/m3uClient';
import type { XmltvGuide } from '@/modules/guide/public/data/xmltvClient';
import { tauriApi, type M3uProbeResult, type M3uProbeStatus } from '@/platform/tauri';
import { getErrorMessage } from '@/shared/lib/error';

export interface TitleCleanOptions {
  removeResolutionTags?: boolean | undefined;
  removeCountryPrefixes?: boolean | undefined;
  removeProviderNoise?: boolean | undefined;
  normalizeSpacing?: boolean | undefined;
}

const RESOLUTION_PATTERNS = [
  /\[(?:4k|fhd|uhd|hd|sd|1080p|720p|50fps|60fps|hevc|h265|raw)\]/gi,
  /\((?:4k|fhd|uhd|hd|sd|1080p|720p|50fps|60fps|hevc|h265|raw)\)/gi,
  /\b(?:4k|fhd|uhd|hd|sd|1080p|720p|50fps|60fps|hevc|h265|raw)\b/gi,
];

const COUNTRY_PREFIX_PATTERNS = [
  /^(?:\[[a-z]{2,3}\]|\|[a-z]{2,3}\||\([a-z]{2,3}\))\s*[-:]?\s*/i,
  /^[a-z]{2,3}\s*[:|•-]\s*/i,
];

const PROVIDER_NOISE_PATTERNS = [/[#*~=_>-]{2,}/g, /^[|>•~*#<-]+\s*/g, /\s*[|<•~*#>-]+$/g];

export function cleanChannelTitle(title: string, options: TitleCleanOptions = {}): string {
  let cleaned = title;

  if (options.removeResolutionTags) {
    for (const pattern of RESOLUTION_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' ');
    }
  }

  if (options.removeCountryPrefixes) {
    for (const pattern of COUNTRY_PREFIX_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
  }

  if (options.removeProviderNoise) {
    for (const pattern of PROVIDER_NOISE_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' ');
    }
  }

  if (options.normalizeSpacing ?? true) {
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
  }

  return cleaned || title;
}

export interface DuplicateGroup {
  key: string;
  type: 'url' | 'name' | 'epg';
  entries: M3uEntry[];
  signals: Array<'url' | 'name' | 'epg' | 'logo'>;
}

export function detectDuplicates(entries: M3uEntry[]): DuplicateGroup[] {
  const urlMap = new Map<string, M3uEntry[]>();
  const nameMap = new Map<string, M3uEntry[]>();
  const epgMap = new Map<string, M3uEntry[]>();

  for (const entry of entries) {
    const urlKey = entry.url.trim().toLowerCase();
    const existingUrl = urlMap.get(urlKey);
    if (existingUrl) {
      existingUrl.push(entry);
    } else {
      urlMap.set(urlKey, [entry]);
    }

    const normalizedTitle = cleanChannelTitle(entry.title, {
      removeResolutionTags: true,
      removeCountryPrefixes: true,
      removeProviderNoise: true,
    }).toLowerCase();
    const nameKey = `${(entry.groupTitle || '').trim().toLowerCase()}|${normalizedTitle}`;
    const existingName = nameMap.get(nameKey);
    if (existingName) {
      existingName.push(entry);
    } else {
      nameMap.set(nameKey, [entry]);
    }

    const epgKey = entry.tvgId?.trim().toLowerCase();
    if (epgKey) {
      const existingEpg = epgMap.get(epgKey);
      if (existingEpg) existingEpg.push(entry);
      else epgMap.set(epgKey, [entry]);
    }
  }

  const results = new Map<string, DuplicateGroup>();
  const addGroup = (type: DuplicateGroup['type'], key: string, group: M3uEntry[]) => {
    if (group.length < 2) return;
    const identity = group
      .map((entry) => entry.id)
      .sort()
      .join('|');
    const existing = results.get(identity);
    const signals: DuplicateGroup['signals'] = existing ? [...existing.signals] : [];
    if (!signals.includes(type)) signals.push(type);
    const logos = new Set(group.map((entry) => entry.logo?.trim()).filter(Boolean));
    if (logos.size === 1 && !signals.includes('logo')) signals.push('logo');
    results.set(identity, {
      key: existing?.key || key,
      type: existing?.type === 'url' || type === 'url' ? 'url' : existing?.type || type,
      entries: group,
      signals,
    });
  };

  for (const [url, group] of urlMap.entries()) {
    addGroup('url', url, group);
  }

  for (const [nameKey, group] of nameMap.entries()) {
    addGroup('name', nameKey.split('|')[1] || nameKey, group);
  }

  for (const [epgId, group] of epgMap.entries()) addGroup('epg', epgId, group);

  return [...results.values()];
}

export function mergeDuplicateEntries(primary: M3uEntry, duplicates: M3uEntry[]): M3uEntry {
  const candidates = [primary, ...duplicates.filter((entry) => entry.id !== primary.id)];
  const firstText = (select: (entry: M3uEntry) => string | undefined) =>
    candidates
      .map(select)
      .find((value) => value?.trim())
      ?.trim();
  const longestText = (select: (entry: M3uEntry) => string | undefined) =>
    candidates
      .map(select)
      .filter((value): value is string => Boolean(value?.trim()))
      .sort((a, b) => b.length - a.length)[0];
  const extraDirectives = [...new Set(candidates.flatMap((entry) => entry.extraDirectives ?? []))];
  const inheritedHeaderNames =
    candidates.length > 0
      ? (candidates[0]!.inheritedHeaderNames ?? []).filter((name) =>
          candidates.every((entry) =>
            (entry.inheritedHeaderNames ?? []).some(
              (candidate) => candidate.toLowerCase() === name.toLowerCase(),
            ),
          ),
        )
      : [];

  return {
    ...primary,
    tvgId: firstText((entry) => entry.tvgId),
    tvgName: firstText((entry) => entry.tvgName),
    logo: firstText((entry) => entry.logo),
    channelNumber: firstText((entry) => entry.channelNumber),
    description: longestText((entry) => entry.description),
    year: firstText((entry) => entry.year),
    rating: candidates.map((entry) => entry.rating).find((value) => value !== undefined),
    catchup: firstText((entry) => entry.catchup),
    catchupSource: firstText((entry) => entry.catchupSource),
    catchupDays: candidates.map((entry) => entry.catchupDays).find((value) => value !== undefined),
    radio: candidates.some((entry) => entry.radio),
    headers: Object.assign({}, ...[...candidates].reverse().map((entry) => entry.headers)),
    inheritedHeaderNames: inheritedHeaderNames.length > 0 ? inheritedHeaderNames : undefined,
    extraAttributes: Object.assign(
      {},
      ...[...candidates].reverse().map((entry) => entry.extraAttributes ?? {}),
    ),
    extraDirectives: extraDirectives.length > 0 ? extraDirectives : undefined,
  };
}

type M3uValidationSeverity = 'error' | 'warning' | 'info';

export interface M3uValidationIssue {
  id: string;
  code: string;
  severity: M3uValidationSeverity;
  message: string;
  entryId?: string | undefined;
  entryTitle?: string | undefined;
}

const STREAM_SCHEMES = new Set(['http:', 'https:', 'rtsp:', 'rtmp:', 'rtp:', 'udp:', 'mms:']);

function isSupportedUrl(value: string, allowData = false): boolean {
  try {
    const protocol = new URL(value).protocol;
    return STREAM_SCHEMES.has(protocol) || (allowData && protocol === 'data:');
  } catch {
    return false;
  }
}

export function validateM3uEntries(
  entries: M3uEntry[],
  parserWarnings: string[] = [],
): M3uValidationIssue[] {
  const issues: M3uValidationIssue[] = parserWarnings.map((message, index) => ({
    id: `parser-${index}`,
    code: 'parser-warning',
    severity: 'warning',
    message,
  }));
  const channelNumbers = new Map<string, M3uEntry[]>();
  const epgIds = new Map<string, M3uEntry[]>();

  for (const entry of entries) {
    const add = (code: string, severity: M3uValidationSeverity, message: string) =>
      issues.push({
        id: `${code}-${entry.id}`,
        code,
        severity,
        message,
        entryId: entry.id,
        entryTitle: entry.title || 'Untitled channel',
      });
    if (!entry.title.trim()) add('missing-title', 'error', 'Channel name is empty.');
    if (!entry.url.trim()) add('missing-url', 'error', 'Stream URL is empty.');
    else if (!isSupportedUrl(entry.url))
      add('invalid-url', 'error', 'Stream URL uses an invalid or unsupported scheme.');
    if (!entry.groupTitle.trim()) add('missing-group', 'warning', 'Channel has no category.');
    if (entry.logo && !isSupportedUrl(entry.logo, true))
      add('invalid-logo', 'warning', 'Logo URL is malformed or unsupported.');
    if (
      entry.rating !== undefined &&
      (!Number.isFinite(entry.rating) || entry.rating < 0 || entry.rating > 10)
    ) {
      add('invalid-rating', 'warning', 'Rating should be between 0 and 10.');
    }
    if (
      entry.catchupDays !== undefined &&
      (!Number.isFinite(entry.catchupDays) || entry.catchupDays < 0)
    ) {
      add('invalid-catchup-days', 'warning', 'Catch-up days must be zero or greater.');
    }
    if (entry.extraDirectives?.some((directive) => directive.trim().startsWith('#EXT'))) {
      add(
        'preserved-directive',
        'info',
        'Channel contains preserved directives that Movena does not interpret.',
      );
    }
    if (entry.channelNumber?.trim()) {
      const key = entry.channelNumber.trim();
      channelNumbers.set(key, [...(channelNumbers.get(key) ?? []), entry]);
    }
    if (entry.tvgId?.trim()) {
      const key = entry.tvgId.trim().toLowerCase();
      epgIds.set(key, [...(epgIds.get(key) ?? []), entry]);
    } else if (entry.type === 'live') {
      add('missing-epg-id', 'info', 'Live channel has no EPG ID.');
    }
  }

  for (const [number, duplicates] of channelNumbers) {
    if (duplicates.length < 2) continue;
    duplicates.forEach((entry) =>
      issues.push({
        id: `duplicate-number-${number}-${entry.id}`,
        code: 'duplicate-channel-number',
        severity: 'warning',
        message: `Channel number ${number} is used ${duplicates.length} times.`,
        entryId: entry.id,
        entryTitle: entry.title,
      }),
    );
  }
  for (const [epgId, duplicates] of epgIds) {
    if (duplicates.length < 2) continue;
    duplicates.forEach((entry) =>
      issues.push({
        id: `duplicate-epg-${epgId}-${entry.id}`,
        code: 'duplicate-epg-id',
        severity: 'warning',
        message: `EPG ID “${entry.tvgId}” is assigned to ${duplicates.length} channels.`,
        entryId: entry.id,
        entryTitle: entry.title,
      }),
    );
  }
  return issues;
}

export interface EpgMatchSuggestion {
  entryId: string;
  entryTitle: string;
  currentTvgId?: string | undefined;
  suggestedTvgId?: string | undefined;
  guideName?: string | undefined;
  confidence: number;
  status: 'matched' | 'suggested' | 'unmatched';
}

function comparableName(value: string): string {
  return cleanChannelTitle(value, {
    removeResolutionTags: true,
    removeCountryPrefixes: true,
    removeProviderNoise: true,
  })
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshteinSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j] ?? 0;
      previous[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - (previous[right.length] ?? 0) / Math.max(left.length, right.length);
}

export function buildEpgMatchSuggestions(
  entries: M3uEntry[],
  guide: XmltvGuide | undefined,
  sourceId?: string,
): EpgMatchSuggestion[] {
  const liveEntries = entries.filter((entry) => entry.type === 'live');
  if (!guide)
    return liveEntries.map((entry) => ({
      entryId: entry.id,
      entryTitle: entry.title,
      currentTvgId: entry.tvgId,
      confidence: 0,
      status: 'unmatched',
    }));
  const prefix = sourceId ? `${sourceId}::` : '';
  const candidates = [...guide.nameById.entries()]
    .filter(([id]) => !prefix || id.startsWith(prefix))
    .map(([id, name]) => ({
      id: prefix ? id.slice(prefix.length) : id,
      scopedId: id,
      name,
      normalized: comparableName(name),
    }));
  const candidatesByToken = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    for (const token of new Set(
      candidate.normalized.split(' ').filter((part) => part.length > 1),
    )) {
      candidatesByToken.set(token, [...(candidatesByToken.get(token) ?? []), candidate]);
    }
  }

  return liveEntries.map((entry) => {
    const scopedCurrent = entry.tvgId ? `${prefix}${entry.tvgId}` : '';
    if (entry.tvgId && (guide.byChannel.has(scopedCurrent) || guide.byChannel.has(entry.tvgId))) {
      const name = guide.nameById.get(scopedCurrent) || guide.nameById.get(entry.tvgId);
      return {
        entryId: entry.id,
        entryTitle: entry.title,
        currentTvgId: entry.tvgId,
        suggestedTvgId: entry.tvgId,
        guideName: name,
        confidence: 1,
        status: 'matched',
      };
    }
    const normalized = comparableName(entry.title);
    const pool = [
      ...new Set(normalized.split(' ').flatMap((token) => candidatesByToken.get(token) ?? [])),
    ];
    let best: (typeof candidates)[number] | undefined;
    let score = 0;
    for (const candidate of pool) {
      const candidateScore = levenshteinSimilarity(normalized, candidate.normalized);
      if (candidateScore > score) {
        best = candidate;
        score = candidateScore;
      }
    }
    if (best && score >= 0.62) {
      return {
        entryId: entry.id,
        entryTitle: entry.title,
        currentTvgId: entry.tvgId,
        suggestedTvgId: best.id,
        guideName: best.name,
        confidence: score,
        status: 'suggested',
      };
    }
    return {
      entryId: entry.id,
      entryTitle: entry.title,
      currentTvgId: entry.tvgId,
      confidence: score,
      status: 'unmatched',
    };
  });
}

export interface M3uTransformPreset {
  id: string;
  name: string;
  kind: 'clean' | 'replace';
  cleanOptions?: TitleCleanOptions | undefined;
  replaceOptions?: FindReplaceOptions | undefined;
  createdAt: number;
}

export const TRANSFORM_PRESET_KEY = 'movena-m3u-transform-presets-v1';

export function loadTransformPresets(): M3uTransformPreset[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(TRANSFORM_PRESET_KEY) || '[]',
    ) as M3uTransformPreset[];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (preset) =>
              preset &&
              typeof preset.id === 'string' &&
              typeof preset.name === 'string' &&
              (preset.kind === 'clean' || preset.kind === 'replace'),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export function persistTransformPresets(presets: M3uTransformPreset[]): void {
  localStorage.setItem(TRANSFORM_PRESET_KEY, JSON.stringify(presets.slice(0, 20)));
}

export function applyTransformPreset(
  entries: M3uEntry[],
  preset: M3uTransformPreset,
): { entries: M3uEntry[]; count: number } {
  if (preset.kind === 'replace' && preset.replaceOptions)
    return findAndReplace(entries, preset.replaceOptions);
  if (preset.kind === 'clean' && preset.cleanOptions) {
    let count = 0;
    const updated = entries.map((entry) => {
      const title = cleanChannelTitle(entry.title, preset.cleanOptions);
      if (title === entry.title) return entry;
      count += 1;
      return { ...entry, title };
    });
    return { entries: updated, count };
  }
  return { entries, count: 0 };
}

export interface FindReplaceOptions {
  field: 'title' | 'url' | 'groupTitle' | 'tvgId';
  findText: string;
  replaceText: string;
  matchCase?: boolean | undefined;
  useRegex?: boolean | undefined;
}

export function findAndReplace(
  entries: M3uEntry[],
  options: FindReplaceOptions,
): { entries: M3uEntry[]; count: number } {
  if (!options.findText) return { entries, count: 0 };

  let count = 0;
  let regex: RegExp;

  try {
    if (options.useRegex) {
      regex = new RegExp(options.findText, options.matchCase ? 'g' : 'gi');
    } else {
      const escaped = options.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, options.matchCase ? 'g' : 'gi');
    }
  } catch {
    return { entries, count: 0 };
  }

  const updated = entries.map((entry) => {
    const currentValue = entry[options.field] || '';
    if (!currentValue || !regex.test(currentValue)) return entry;

    regex.lastIndex = 0;
    const nextValue = currentValue.replace(regex, options.replaceText);
    if (nextValue !== currentValue) {
      count += 1;
      return {
        ...entry,
        [options.field]: nextValue,
      };
    }
    return entry;
  });

  return { entries: updated, count };
}

export function renumberChannels(entries: M3uEntry[], startNumber = 1): M3uEntry[] {
  let current = Math.max(1, Math.floor(startNumber));
  return entries.map((entry) => ({
    ...entry,
    channelNumber: String(current++),
  }));
}

export async function checkStreamHealth(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 4000,
): Promise<M3uProbeStatus> {
  return (await probeStreamHealth(url, headers, timeoutMs)).status;
}

export async function probeStreamHealth(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 6000,
): Promise<M3uProbeResult> {
  const started = performance.now();
  try {
    return await tauriApi.m3uProbeStream({ url, headers, timeoutMs });
  } catch (error: unknown) {
    return {
      status: 'offline',
      errorMessage: getErrorMessage(error, 'Native stream probe failed without an error message.'),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}
