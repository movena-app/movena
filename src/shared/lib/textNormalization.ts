/**
 * Normalizes stylized Unicode text (small caps, superscripts, subscripts,
 * modifier letters, mathematical alphanumerics, full-width characters) into
 * standard ASCII characters so they can be parsed, cleaned, and categorized.
 */

const UNICODE_CHAR_MAP: Record<string, string> = {
  // Superscript & subscript digits
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',

  // Small Capitals
  ᴀ: 'A',
  ʙ: 'B',
  ᴄ: 'C',
  ᴅ: 'D',
  ᴇ: 'E',
  ꜰ: 'F',
  ɢ: 'G',
  ʜ: 'H',
  ɪ: 'I',
  ᴊ: 'J',
  ᴋ: 'K',
  ʟ: 'L',
  ᴍ: 'M',
  ɴ: 'N',
  ᴏ: 'O',
  ᴘ: 'P',
  ǫ: 'Q',
  ʀ: 'R',
  ꜱ: 'S',
  ᴛ: 'T',
  ᴜ: 'U',
  ᴠ: 'V',
  ᴡ: 'W',
  ʏ: 'Y',
  ᴢ: 'Z',

  // Modifier capital letters
  ᴬ: 'A',
  ᴮ: 'B',
  ᴰ: 'D',
  ᴱ: 'E',
  ᴳ: 'G',
  ᴴ: 'H',
  ᴵ: 'I',
  ᴶ: 'J',
  ᴷ: 'K',
  ᴸ: 'L',
  ᴹ: 'M',
  ᴺ: 'N',
  ᴼ: 'O',
  ᴾ: 'P',
  ᴿ: 'R',
  ᵀ: 'T',
  ᵁ: 'U',
  ⱽ: 'V',
  ᵂ: 'W',

  // Modifier lowercase letters
  ᵃ: 'a',
  ᵇ: 'b',
  ᶜ: 'c',
  ᵈ: 'd',
  ᵉ: 'e',
  ᶠ: 'f',
  ᵍ: 'g',
  ʰ: 'h',
  ⁱ: 'i',
  ʲ: 'j',
  ᵏ: 'k',
  ˡ: 'l',
  ᵐ: 'm',
  ⁿ: 'n',
  ᵒ: 'o',
  ᵖ: 'p',
  ʳ: 'r',
  ˢ: 's',
  ᵗ: 't',
  ᵘ: 'u',
  ᵛ: 'v',
  ʷ: 'w',
  ˣ: 'x',
  ʸ: 'y',
  ᶻ: 'z',
  ᶦ: 'i',
  ᶥ: 'i',
  ᶤ: 'i',

  // Superscript symbols
  '⁺': '+',
  '⁻': '-',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
  '₊': '+',
  '₋': '-',
  '₌': '=',
  '₍': '(',
  '₎': ')',
};

const UNICODE_CHAR_REGEX = new RegExp(Object.keys(UNICODE_CHAR_MAP).join('|'), 'g');

export function normalizeFancyUnicode(text: string): string {
  if (!text) return '';
  // 1. Decompose mathematical/fullwidth/compatibility glyphs
  let result = text.normalize('NFKD');
  // 2. Replace small caps, superscripts, and modifier letters that NFKD does not decompose
  result = result.replace(UNICODE_CHAR_REGEX, (char) => UNICODE_CHAR_MAP[char] || char);
  return result;
}
