import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { UI_LANGUAGES, uiLanguageDefinition, type UiLanguage } from './config';

export type { UiLanguage } from './config';
export type TranslationValues = Record<string, string | number>;

type MessageLanguage = Exclude<UiLanguage, 'en'>;
type MessageCatalog = Record<string, string>;

const EMPTY_CATALOG: MessageCatalog = Object.freeze({});
const catalogLoaders: Record<MessageLanguage, () => Promise<MessageCatalog>> = {
  de: () => import('./locales/de').then((module) => module.DE_MESSAGES),
  es: () => import('./locales/es').then((module) => module.ES_MESSAGES),
  fr: () => import('./locales/fr').then((module) => module.FR_MESSAGES),
  'pt-BR': () => import('./locales/ptBR').then((module) => module.PT_BR_MESSAGES),
  it: () => import('./locales/it').then((module) => module.IT_MESSAGES),
  nl: () => import('./locales/nl').then((module) => module.NL_MESSAGES),
  pl: () => import('./locales/pl').then((module) => module.PL_MESSAGES),
};

/** Loaded catalogs only. Keeping this object stable also makes catalogue
 * parity straightforward to inspect in tests and diagnostics. */
export const UI_MESSAGE_CATALOGS: Partial<Record<MessageLanguage, MessageCatalog>> = {};

const catalogPromises = new Map<MessageLanguage, Promise<void>>();
const catalogListeners = new Set<() => void>();

function subscribeCatalogs(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

function installCatalog(language: MessageLanguage, catalog: MessageCatalog): void {
  UI_MESSAGE_CATALOGS[language] = catalog;
  catalogListeners.forEach((listener) => listener());
}

/** Load one locale on demand. English requires no catalogue. Concurrent
 * callers share one import so a settings change cannot duplicate work. */
export function ensureUiMessages(language: UiLanguage): Promise<void> {
  if (language === 'en' || UI_MESSAGE_CATALOGS[language]) return Promise.resolve();
  const pending = catalogPromises.get(language);
  if (pending) return pending;

  const request = catalogLoaders[language]()
    .then((catalog) => {
      installCatalog(language, catalog);
    })
    .finally(() => {
      catalogPromises.delete(language);
    });
  catalogPromises.set(language, request);
  return request;
}

/** Test/diagnostic helper. Production startup deliberately calls
 * `ensureUiMessages` for only the selected locale. */
export async function loadAllUiMessageCatalogs(): Promise<void> {
  await Promise.all(UI_LANGUAGES.map((language) => ensureUiMessages(language)));
}

const catalogFor = (language: UiLanguage): Record<string, string> =>
  language === 'en' ? EMPTY_CATALOG : (UI_MESSAGE_CATALOGS[language] ?? EMPTY_CATALOG);

const templateCache = new Map<string, { names: string[]; pattern: RegExp }>();
const NUMERIC_PLACEHOLDERS = new Set([
  'count',
  'configured',
  'current',
  'downloaded',
  'enabled',
  'episode',
  'failed',
  'maximum',
  'number',
  'percent',
  'progress',
  'season',
  'seconds',
  'slow',
  'step',
  'stale',
  'total',
  'visible',
]);
const dynamicTemplates = new WeakMap<MessageCatalog, string[]>();

function compileTemplate(template: string) {
  const cached = templateCache.get(template);
  if (cached) return cached;

  const names: string[] = [];
  let source = '^';
  let cursor = 0;
  const placeholder = /\{(\w+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = placeholder.exec(template))) {
    source += template.slice(cursor, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const name = match[1];
    if (!name) continue;
    source += NUMERIC_PLACEHOLDERS.has(name) ? '([+-]?(?:\\d[\\d.,\\s]*|—))' : '(.+?)';
    names.push(name);
    cursor = match.index + match[0].length;
  }
  source += `${template.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;

  const compiled = { names, pattern: new RegExp(source, 'u') };
  templateCache.set(template, compiled);
  return compiled;
}

function interpolate(message: string, values: TranslationValues): string {
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder,
  );
}

function templatesFor(catalog: MessageCatalog): string[] {
  const cached = dynamicTemplates.get(catalog);
  if (cached) return cached;
  const templates = Object.keys(catalog)
    .filter((message) => /\{\w+\}/.test(message))
    .sort((left, right) => right.length - left.length);
  dynamicTemplates.set(catalog, templates);
  return templates;
}

function translateDynamicEnglish(
  message: string,
  catalog: MessageCatalog,
): { template: string; values: TranslationValues } | null {
  for (const template of templatesFor(catalog)) {
    const { names, pattern } = compileTemplate(template);
    const match = pattern.exec(message);
    if (!match) continue;
    return {
      template,
      values: Object.fromEntries(names.map((name, index) => [name, match[index + 1] ?? ''])),
    };
  }
  return null;
}

/**
 * Translates app-owned English copy. Unknown values are deliberately returned
 * unchanged so provider names, media titles, paths, and API content are never
 * treated as interface text.
 */
export function translateUiText(
  message: string,
  language: UiLanguage,
  values: TranslationValues = {},
): string {
  if (!message) return message;

  const catalog = catalogFor(language);

  if (language === 'en') {
    return interpolate(message, values);
  }

  const exact = catalog[message];
  if (exact) return interpolate(exact, values);

  if (Object.keys(values).length > 0) return interpolate(message, values);

  const dynamic = translateDynamicEnglish(message, catalog);
  if (!dynamic) return message;
  const localizedValues = Object.fromEntries(
    Object.entries(dynamic.values).map(([name, value]) => [name, catalog[String(value)] ?? value]),
  );
  return interpolate(catalog[dynamic.template] ?? dynamic.template, localizedValues);
}

export interface I18nApi {
  language: UiLanguage;
  locale: string;
  t: (message: string, values?: TranslationValues) => string;
  tn: (singular: string, plural: string, count: number, values?: TranslationValues) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  time: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  list: (values: readonly string[], options?: Intl.ListFormatOptions) => string;
}

const defaultI18n = createI18n('en');
const I18nContext = createContext<I18nApi>(defaultI18n);

export interface I18nProviderProps {
  children: ReactNode;
  language: UiLanguage;
}

/** Application composition supplies the selected language. The shared i18n
 * layer never reaches into product settings or persistence on its own. */
export function I18nProvider({ children, language }: I18nProviderProps) {
  const catalogReady = useSyncExternalStore(
    subscribeCatalogs,
    () => language === 'en' || Boolean(UI_MESSAGE_CATALOGS[language]),
    () => language === 'en' || Boolean(UI_MESSAGE_CATALOGS[language]),
  );

  useEffect(() => {
    void ensureUiMessages(language).catch((error) => {
      console.warn(`Could not load the ${language} interface catalog`, error);
    });
  }, [language]);

  const api = useMemo(() => {
    void catalogReady;
    return createI18n(language);
  }, [language, catalogReady]);

  return <I18nContext.Provider value={api}>{children}</I18nContext.Provider>;
}

export function createI18n(language: UiLanguage): I18nApi {
  const locale = uiLanguageDefinition(language).locale;
  const t = (message: string, values?: TranslationValues) =>
    translateUiText(message, language, values);
  const pluralRules = new Intl.PluralRules(locale);
  return {
    language,
    locale,
    t,
    tn: (singular, plural, count, values = {}) => {
      const category = pluralRules.select(count);
      const defaultMessage = category === 'one' ? singular : plural;
      const localizedPlural = `${defaultMessage}::${category}`;
      const message = catalogFor(language)[localizedPlural] ? localizedPlural : defaultMessage;
      return t(message, { count, ...values });
    },
    number: (value, options) => new Intl.NumberFormat(locale, options).format(value),
    date: (value, options) => new Intl.DateTimeFormat(locale, options).format(value),
    time: (value, options) =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        ...options,
      }).format(value),
    list: (values, options) => new Intl.ListFormat(locale, options).format(values),
  };
}

/** Reactive localization API for components. */
export function useI18n(): I18nApi {
  return useContext(I18nContext);
}

/** Translation helper for stores and services that run outside React. */
export function translateNow(
  message: string,
  language: UiLanguage,
  values?: TranslationValues,
): string {
  return translateUiText(message, language, values);
}

export function uiLocale(language: UiLanguage): string {
  return uiLanguageDefinition(language).locale;
}
