export interface CategoryVisibilityRow {
  id: string;
  categoryIds?: string[] | undefined;
  country: string | null;
}

function categoryCountryKey(row: CategoryVisibilityRow): string {
  return row.country ?? 'other';
}

export function isCategoryHidden(
  row: CategoryVisibilityRow,
  hiddenCategoryIds: ReadonlySet<string>,
  hiddenCountryIds: ReadonlySet<string>,
): boolean {
  if (hiddenCountryIds.has(categoryCountryKey(row))) return true;
  if (hiddenCategoryIds.has(row.id)) return true;
  if (row.categoryIds && row.categoryIds.some((id) => hiddenCategoryIds.has(id))) return true;
  return false;
}

/** Counts unique hidden rows even when both the row and its country are hidden. */
export function countHiddenCategories(
  rows: CategoryVisibilityRow[],
  hiddenCategoryIds: ReadonlySet<string>,
  hiddenCountryIds: ReadonlySet<string>,
): number {
  return rows.reduce(
    (count, row) => count + Number(isCategoryHidden(row, hiddenCategoryIds, hiddenCountryIds)),
    0,
  );
}
