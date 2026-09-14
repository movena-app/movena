import { createElement } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Button } from '@/shared/ui/Button';
import {
  createI18n,
  translateUiText,
  loadAllUiMessageCatalogs,
  UI_MESSAGE_CATALOGS,
  uiLocale,
  I18nProvider,
} from '@/shared/i18n/i18n';
import { UI_LANGUAGE_DEFINITIONS } from '@/shared/i18n/config';
import { DE_MESSAGES } from '@/shared/i18n/locales/de';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

function TestI18nRoot() {
  const language = useSettingsStore((state) => state.language);
  return createElement(I18nProvider, {
    language,
    children: createElement(Button, null, 'Movies'),
  });
}

beforeAll(async () => {
  await loadAllUiMessageCatalogs();
});

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
});

describe('UI localization', () => {
  it('translates app-owned labels without touching unknown content', () => {
    expect(translateUiText('Movies', 'de')).toBe('Filme');
    expect(translateUiText('Filme', 'en')).toBe('Filme');
    expect(translateUiText('A provider title', 'de')).toBe('A provider title');
  });

  it('provides complete catalogue parity for every supported language', () => {
    const sourceKeys = Object.keys(DE_MESSAGES)
      .filter((key) => !key.includes('::'))
      .sort();

    expect(UI_LANGUAGE_DEFINITIONS.map(({ code }) => code)).toEqual([
      'en',
      'de',
      'es',
      'fr',
      'pt-BR',
      'it',
      'nl',
      'pl',
    ]);
    for (const [language, catalogue] of Object.entries(UI_MESSAGE_CATALOGS)) {
      const translatedKeys = Object.keys(catalogue)
        .filter((key) => !key.includes('::'))
        .sort();
      expect(translatedKeys, `${language} catalogue keys`).toEqual(sourceKeys);
      for (const key of sourceKeys) {
        const sourcePlaceholders = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        const translatedPlaceholders = [...catalogue[key]!.matchAll(/\{(\w+)\}/g)]
          .map((match) => match[1])
          .sort();
        expect(translatedPlaceholders, `${language}: ${key}`).toEqual(sourcePlaceholders);
      }
    }
  });

  it('translates representative media labels across all eight languages', () => {
    expect(translateUiText('Movies', 'es')).toBe('Películas');
    expect(translateUiText('Movies', 'fr')).toBe('Films');
    expect(translateUiText('Movies', 'pt-BR')).toBe('Filmes');
    expect(translateUiText('Movies', 'it')).toBe('Film');
    expect(translateUiText('Movies', 'nl')).toBe('Films');
    expect(translateUiText('Movies', 'pl')).toBe('Filmy');
    expect(uiLocale('pt-BR')).toBe('pt-BR');
  });

  it('interpolates templates and localizes app-owned values captured from dynamic text', () => {
    expect(translateUiText('Season {number}', 'de', { number: 3 })).toBe('Staffel 3');
    expect(translateUiText('Collection "Weekend" ready.', 'de')).toBe(
      'Sammlung „Weekend“ ist bereit.',
    );
    expect(translateUiText('Can’t reach Movies', 'de')).toBe('Filme ist nicht erreichbar');
    expect(translateUiText('Can’t reach Movies', 'es')).toBe('No se puede acceder a Películas');
  });

  it('formats plurals, numbers, and dates with the selected locale', () => {
    const german = createI18n('de');
    const english = createI18n('en');

    expect(german.tn('{count} item', '{count} items', 2, { count: german.number(2) })).toBe(
      '2 Elemente',
    );
    expect(german.number(1234.5)).toBe('1.234,5');
    expect(english.number(1234.5)).toBe('1,234.5');
    expect(german.date(new Date(2026, 7, 13))).toBe('13.8.2026');
  });

  it('uses locale plural categories for Polish counts', () => {
    const polish = createI18n('pl');

    expect(polish.tn('{count} item', '{count} items', 1)).toBe('1 element');
    expect(polish.tn('{count} item', '{count} items', 2)).toBe('2 elementy');
    expect(polish.tn('{count} item', '{count} items', 5)).toBe('5 elementów');
    expect(polish.tn('{count} series', '{count} series', 2)).toBe('2 seriale');
  });

  it('reactively updates shared controls when the persisted language changes', () => {
    render(createElement(TestI18nRoot));
    expect(screen.getByRole('button', { name: 'Movies' })).toBeTruthy();

    act(() => useSettingsStore.getState().updateSetting('language', 'de'));
    expect(screen.getByRole('button', { name: 'Filme' })).toBeTruthy();

    act(() => useSettingsStore.getState().updateSetting('language', 'fr'));
    expect(screen.getByRole('button', { name: 'Films' })).toBeTruthy();
  });
});
