import type { EpgProgramme } from '../data/useEpg';
import type { XmltvGuidePayload } from '@/platform/tauri';

export interface XmltvGuide {
  byChannel: Map<string, EpgProgramme[]>;
  idByName: Map<string, string>;
  nameById: Map<string, string>;
  channelCount: number;
  programmeCount: number;
}

const XMLTV_TIME = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/;

export function parseXmltvTime(value: string | null | undefined): number {
  if (!value) return 0;
  const match = XMLTV_TIME.exec(value.trim());
  if (!match) return 0;

  const [, year, month, day, hour, minute, second, offset] = match;
  if (!year || !month || !day || !hour || !minute) return 0;
  const parts = [+year, +month - 1, +day, +hour, +minute, +(second ?? 0)] as const;
  const monthNumber = parts[1] + 1;
  const dayNumber = parts[2];
  const hourNumber = parts[3];
  const minuteNumber = parts[4];
  const secondNumber = parts[5];
  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    hourNumber > 23 ||
    minuteNumber > 59 ||
    secondNumber > 59
  )
    return 0;
  const daysInMonth = new Date(Date.UTC(parts[0], monthNumber, 0)).getUTCDate();
  if (dayNumber < 1 || dayNumber > daysInMonth) return 0;
  if (!offset)
    return new Date(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]).getTime();

  const sign = offset.startsWith('-') ? -1 : 1;
  const offsetHours = +offset.slice(1, 3);
  const offsetMinutesPart = +offset.slice(3, 5);
  if (offsetHours > 23 || offsetMinutesPart > 59) return 0;
  const offsetMinutes = sign * (offsetHours * 60 + offsetMinutesPart);
  return Date.UTC(...parts) - offsetMinutes * 60_000;
}

export function hydrateXmltvGuide(payload: XmltvGuidePayload): XmltvGuide {
  const byChannel = new Map<string, EpgProgramme[]>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  let programmeCount = 0;

  for (const channel of payload.channels) {
    const preferredName = channel.names.find((name) => name.trim())?.trim() || channel.id;
    nameById.set(channel.id, preferredName);
    for (const name of channel.names) {
      const normalized = name.trim().toLowerCase();
      if (normalized && !idByName.has(normalized)) idByName.set(normalized, channel.id);
    }
  }
  for (const group of payload.programmeGroups) {
    const programmes = group.programmes.map((programme) => ({
      id: `${group.channelId}-${programme.start}`,
      title: programme.title,
      description: programme.description,
      start: programme.start,
      end: programme.end,
    }));
    programmes.sort((left, right) => left.start - right.start);
    byChannel.set(group.channelId, programmes);
    programmeCount += programmes.length;
  }

  return { byChannel, idByName, nameById, channelCount: byChannel.size, programmeCount };
}
