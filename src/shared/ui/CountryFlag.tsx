import { normalizeCountryCode } from '@/shared/lib/categoryName';

/**
 * Country flag icons.
 *
 * SVG rather than emoji: `AGENTS.md` rules emoji out of section headers, and
 * emoji flags also render differently per platform and cannot be sized or
 * aligned with the rest of the interface.
 *
 * Drawn from `country-flag-icons`, which covers every ISO-3166 code. Hand-drawn
 * stripes were tried first and only stretched to a dozen countries — anything
 * with a coat of arms or a union jack was beyond them, and an IPTV provider's
 * category list reaches well past the simple tricolours.
 */

const FLAG_URLS = import.meta.glob<string>('/node_modules/country-flag-icons/3x2/??.svg', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});

function resolve(code: string | null): string | undefined {
  const key = normalizeCountryCode(code);
  if (!key) return undefined;
  if (!/^[A-Z]{2}$/.test(key)) return undefined;
  return FLAG_URLS[`/node_modules/country-flag-icons/3x2/${key}.svg`];
}

interface CountryFlagProps {
  code: string;
  className?: string | undefined;
}

export function CountryFlag({ code, className }: CountryFlagProps) {
  const url = resolve(code);
  if (!url) return null;
  return <img src={url} alt="" className={className} decoding="async" />;
}
