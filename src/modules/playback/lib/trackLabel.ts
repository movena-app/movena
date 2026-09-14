export interface TrackLabelInput {
  title?: string | undefined;
  lang?: string | undefined;
}

function clean(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function languageCode(value: string): string {
  return value.trim().replace(/_/g, '-').split('-')[0]?.toUpperCase() || value.toUpperCase();
}

/** Keeps the useful language visible when providers reuse the same track title. */
export function formatTrackLabel(track: TrackLabelInput, fallback: string): string {
  const title = clean(track.title);
  const language = clean(track.lang);
  if (title && language) {
    const code = languageCode(language);
    if (
      title.toLocaleLowerCase() === language.toLocaleLowerCase() ||
      title.toLocaleLowerCase() === code.toLocaleLowerCase()
    ) {
      return code;
    }
    return `${code} · ${title}`;
  }
  return title || (language ? languageCode(language) : fallback);
}
