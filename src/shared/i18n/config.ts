export const UI_LANGUAGE_DEFINITIONS = [
  { code: 'en', locale: 'en-US', label: 'English', direction: 'ltr' },
  { code: 'de', locale: 'de-DE', label: 'Deutsch', direction: 'ltr' },
  { code: 'es', locale: 'es-ES', label: 'Español', direction: 'ltr' },
  { code: 'fr', locale: 'fr-FR', label: 'Français', direction: 'ltr' },
  { code: 'pt-BR', locale: 'pt-BR', label: 'Português (Brasil)', direction: 'ltr' },
  { code: 'it', locale: 'it-IT', label: 'Italiano', direction: 'ltr' },
  { code: 'nl', locale: 'nl-NL', label: 'Nederlands', direction: 'ltr' },
  { code: 'pl', locale: 'pl-PL', label: 'Polski', direction: 'ltr' },
] as const;

export type UiLanguage = (typeof UI_LANGUAGE_DEFINITIONS)[number]['code'];
export type UiLocale = (typeof UI_LANGUAGE_DEFINITIONS)[number]['locale'];

export const UI_LANGUAGES = UI_LANGUAGE_DEFINITIONS.map(
  ({ code }) => code,
) as readonly UiLanguage[];
export const UI_LOCALES = UI_LANGUAGE_DEFINITIONS.map(
  ({ locale }) => locale,
) as readonly UiLocale[];

const definitionByLanguage = new Map<UiLanguage, (typeof UI_LANGUAGE_DEFINITIONS)[number]>(
  UI_LANGUAGE_DEFINITIONS.map((definition) => [definition.code, definition]),
);

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && definitionByLanguage.has(value as UiLanguage);
}

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && UI_LOCALES.includes(value as UiLocale);
}

export function uiLanguageDefinition(language: UiLanguage) {
  return definitionByLanguage.get(language) ?? UI_LANGUAGE_DEFINITIONS[0];
}
