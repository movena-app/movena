import { useMemo } from 'react';
import { Select, type SelectOption } from '@/shared/ui/Select';
import type { CatalogSortMode } from '@/modules/settings/public/store/useSettingsStore';
import { useI18n } from '@/shared/i18n/i18n';

interface CatalogSortSelectProps {
  value: CatalogSortMode;
  onChange: (value: CatalogSortMode) => void;
  className?: string | undefined;
  isLiveTv?: boolean | undefined;
}

export function CatalogSortSelect({
  value,
  onChange,
  className,
  isLiveTv = false,
}: CatalogSortSelectProps) {
  const { t } = useI18n();

  const options = useMemo<SelectOption<CatalogSortMode>[]>(() => {
    if (isLiveTv) {
      return [
        { value: 'default', label: t('Default') },
        { value: 'name-asc', label: t('Name (A to Z)') },
        { value: 'name-desc', label: t('Name (Z to A)') },
      ];
    }

    return [
      { value: 'default', label: t('Default') },
      { value: 'recently-added', label: t('Recently Added') },
      { value: 'year-desc', label: t('Release Year (Newest)') },
      { value: 'year-asc', label: t('Release Year (Oldest)') },
      { value: 'rating', label: t('Top Rated') },
      { value: 'name-asc', label: t('Name (A to Z)') },
      { value: 'name-desc', label: t('Name (Z to A)') },
    ];
  }, [isLiveTv, t]);

  return (
    <Select
      value={value}
      options={options}
      onChange={onChange}
      className={className}
      width={190}
      ariaLabel={t('Sort catalog items')}
    />
  );
}
