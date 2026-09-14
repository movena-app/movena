import {
  RiLayoutGridFill,
  RiLayoutGridLine,
  RiLayoutRowFill,
  RiLayoutRowLine,
} from '@/shared/ui/icons';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';

export function CatalogViewToggle() {
  const viewMode = useSettingsStore((state) => state.viewMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <SegmentedControl
      ariaLabel="Catalog layout"
      value={viewMode}
      onChange={(val) => updateSetting('viewMode', val as 'grid' | 'list')}
      options={[
        { value: 'grid', label: 'Grid', icon: RiLayoutGridLine, activeIcon: RiLayoutGridFill },
        { value: 'list', label: 'List', icon: RiLayoutRowLine, activeIcon: RiLayoutRowFill },
      ]}
    />
  );
}
