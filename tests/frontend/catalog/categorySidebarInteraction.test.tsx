// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/catalog/data/useCategories', () => ({
  useCategories: vi.fn(),
  useHiddenCategoryIds: vi.fn(),
}));

vi.mock('@/modules/catalog/data/useCatalog', () => ({
  useCatalogByType: vi.fn(),
}));

import { CategorySidebar } from '@/modules/catalog/components/CategorySidebar';
import { useCatalogByType } from '@/modules/catalog/data/useCatalog';
import { useCategories, useHiddenCategoryIds } from '@/modules/catalog/data/useCategories';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

const categoryResult = {
  data: [
    { category_id: 'm3u-category-ar', category_name: 'Argentina', parent_id: 0 },
    { category_id: 'm3u-category-de-news', category_name: 'DE | News', parent_id: 0 },
    { category_id: 'm3u-category-de-sports', category_name: 'DE | Sports', parent_id: 0 },
    { category_id: 'm3u-category-es', category_name: 'Spain', parent_id: 0 },
    { category_id: 'm3u-category-es-vod', category_name: 'Spain | VOD', parent_id: 0 },
    { category_id: 'm3u-category-tr', category_name: 'Turkey', parent_id: 0 },
    { category_id: 'm3u-category-gb', category_name: 'UK', parent_id: 0 },
    { category_id: 'm3u-category-ad', category_name: 'Andorra', parent_id: 0 },
  ],
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().resetSettings();
  vi.mocked(useCategories).mockReturnValue(
    categoryResult as unknown as ReturnType<typeof useCategories>,
  );
  vi.mocked(useHiddenCategoryIds).mockReturnValue(new Set());
  vi.mocked(useCatalogByType).mockReturnValue({
    data: [
      {
        id: 'ar-1',
        title: 'Argentina One',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-ar',
      },
      {
        id: 'ar-2',
        title: 'Argentina Two',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-ar',
      },
      {
        id: 'de-1',
        title: 'Germany News',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-de-news',
      },
      {
        id: 'de-2',
        title: 'Germany Sports',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-de-sports',
      },
      {
        id: 'es-1',
        title: 'Spain General',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-es',
      },
      {
        id: 'es-2',
        title: 'Spain VOD',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-es-vod',
      },
      {
        id: 'tr-1',
        title: 'Türkiye General',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-tr',
      },
      {
        id: 'gb-1',
        title: 'United Kingdom General',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-gb',
      },
      {
        id: 'ad-1',
        title: 'Andorra General',
        type: 'live',
        posterUrl: '',
        categoryId: 'm3u-category-ad',
      },
    ],
  } as ReturnType<typeof useCatalogByType>);
});

describe('category sidebar M3U country groups', () => {
  it('keeps a category failure compact and retries only the category request', async () => {
    const refetch = vi.fn();
    vi.mocked(useCategories).mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('Provider request timed out'),
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useCategories>);

    render(<CategorySidebar type="live" activeCategoryId={null} onSelectCategory={vi.fn()} />);

    expect(screen.getByText('Categories unavailable')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Retry loading categories' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('clears a saved category that is no longer supplied by an enabled source', async () => {
    const onSelectCategory = vi.fn();
    render(
      <CategorySidebar
        type="live"
        activeCategoryId="removed-source:category:99"
        onSelectCategory={onSelectCategory}
      />,
    );

    await waitFor(() => expect(onSelectCategory).toHaveBeenCalledWith(null));
  });

  it('keeps bulk collapse available without a redundant sidebar heading', async () => {
    render(<CategorySidebar type="live" activeCategoryId={null} onSelectCategory={vi.fn()} />);

    expect(screen.queryByRole('heading', { name: /Categories/i })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse all categories' }));

    expect(screen.getByRole('button', { name: 'Expand all categories' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand Germany' })).toBeTruthy();
  });

  it('turns a redundant country folder into one directly selectable row', async () => {
    const onSelectCategory = vi.fn();
    render(
      <CategorySidebar type="live" activeCategoryId={null} onSelectCategory={onSelectCategory} />,
    );

    expect(
      screen.queryByRole('button', { name: /Collapse Argentina|Expand Argentina/ }),
    ).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Argentina, 2 channels' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Collapse Germany' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Argentina, 2 channels' }));
    expect(onSelectCategory).toHaveBeenCalledWith('country:AR');
  });

  it('absorbs country-equivalent children but retains meaningful siblings', () => {
    render(<CategorySidebar type="live" activeCategoryId={null} onSelectCategory={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Collapse Spain' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Spain, 1 channel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'VOD, 1 channel' })).toBeTruthy();

    expect(screen.queryByRole('button', { name: /Collapse Türkiye|Expand Türkiye/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Turkey, 1 channel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Türkiye, 1 channel' })).toBeTruthy();

    expect(
      screen.queryByRole('button', { name: /Collapse United Kingdom|Expand United Kingdom/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Uk, 1 channel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'United Kingdom, 1 channel' })).toBeTruthy();

    expect(screen.queryByRole('button', { name: /Other/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Andorra, 1 channel' })).toBeTruthy();
  });
});

describe('category sidebar 4K disclaimer', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.getState().resetSettings();
    vi.mocked(useCategories).mockReturnValue(
      categoryResult as unknown as ReturnType<typeof useCategories>,
    );
    vi.mocked(useHiddenCategoryIds).mockReturnValue(new Set());
    vi.mocked(useCatalogByType).mockReturnValue({
      data: [
        {
          id: 'ch-1',
          title: 'Sports 4K',
          type: 'live',
          posterUrl: '',
          categoryId: 'm3u-category-ar',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCatalogByType>);
  });

  it('shows the accuracy notice the first time the 4K Ultra HD hub is opened', async () => {
    const onSelectCategory = vi.fn();
    render(
      <CategorySidebar type="live" activeCategoryId={null} onSelectCategory={onSelectCategory} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /4K Ultra HD/ }));

    expect(onSelectCategory).toHaveBeenCalledWith('smart:4k');
    expect(screen.getByText('About the 4K Ultra HD list')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText('About the 4K Ultra HD list')).toBeNull();
    expect(useSettingsStore.getState().fourKDisclaimerDismissed).toBe(true);
  });

  it('does not show the notice again once dismissed', async () => {
    useSettingsStore.getState().updateSetting('fourKDisclaimerDismissed', true);
    const onSelectCategory = vi.fn();
    render(
      <CategorySidebar type="live" activeCategoryId={null} onSelectCategory={onSelectCategory} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /4K Ultra HD/ }));

    expect(onSelectCategory).toHaveBeenCalledWith('smart:4k');
    expect(screen.queryByText('About the 4K Ultra HD list')).toBeNull();
  });
});
