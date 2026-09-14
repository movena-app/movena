import { useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import {
  RiCalendarScheduleFill,
  RiCalendarScheduleLine,
  RiClosedCaptioningFill,
  RiClosedCaptioningLine,
  RiContrastFill,
  RiContrastLine,
  RiHardDrive2Fill,
  RiHardDrive2Line,
  RiImportFill,
  RiImportLine,
  RiKeyboardFill,
  RiKeyboardLine,
  RiLayoutRowFill,
  RiLayoutRowLine,
  RiMovie2Fill,
  RiMovie2Line,
  RiNotification3Fill,
  RiNotification3Line,
  RiPaletteFill,
  RiPaletteLine,
  RiPlayCircleFill,
  RiPlayCircleLine,
  RiQuestionFill,
  RiQuestionLine,
  RiServerFill,
  RiServerLine,
  RiSettings3Fill,
  RiSettings3Line,
  RiTerminalBoxFill,
  RiTerminalBoxLine,
} from '@/shared/ui/icons';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  filterSettingsSections,
  SETTINGS_NAV_GROUPS,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from '../lib/settingsNavigation';
import {
  WorkspaceSidebar,
  WorkspaceSidebarNavItem,
  WorkspaceSidebarSearch,
} from '@/shared/ui/WorkspaceSidebar';
import { StateIcon, type StateIconPair } from '@/shared/ui/StateIcon';
import { Select } from '@/shared/ui/Select';
import styles from './SettingsNavigation.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { useMediaQuery } from '@/modules/catalog/public/hooks/useMediaQuery';

const COMPACT_SETTINGS_QUERY = '(max-width: 800px)';

const SECTION_ICONS: Record<SettingsSectionId, StateIconPair> = {
  sources: { line: RiServerLine, fill: RiServerFill },
  'library-metadata': { line: RiMovie2Line, fill: RiMovie2Fill },
  'coming-up': { line: RiCalendarScheduleLine, fill: RiCalendarScheduleFill },
  general: { line: RiSettings3Line, fill: RiSettings3Fill },
  appearance: { line: RiPaletteLine, fill: RiPaletteFill },
  notifications: { line: RiNotification3Line, fill: RiNotification3Fill },
  storage: { line: RiHardDrive2Line, fill: RiHardDrive2Fill },
  config: { line: RiImportLine, fill: RiImportFill },
  shortcuts: { line: RiKeyboardLine, fill: RiKeyboardFill },
  home: { line: RiLayoutRowLine, fill: RiLayoutRowFill },
  playback: { line: RiPlayCircleLine, fill: RiPlayCircleFill },
  'subtitles-audio': { line: RiClosedCaptioningLine, fill: RiClosedCaptioningFill },
  picture: { line: RiContrastLine, fill: RiContrastFill },
  developer: { line: RiTerminalBoxLine, fill: RiTerminalBoxFill },
  about: { line: RiQuestionLine, fill: RiQuestionFill },
};

interface SettingsNavigationProps {
  activeSection: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
}

export function SettingsNavigation({ activeSection, onSelect }: SettingsNavigationProps) {
  const { t } = useI18n();
  const isCompact = useMediaQuery(COMPACT_SETTINGS_QUERY);
  const [searchQuery, setSearchQuery] = useState('');
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const matches = useMemo(() => filterSettingsSections(searchQuery, t), [searchQuery, t]);
  const matchedIds = useMemo(() => new Set(matches.map((item) => item.id)), [matches]);
  const hasSearch = searchQuery.trim().length > 0;

  const visibleGroups = hasSearch
    ? [{ id: 'search-results', label: 'Search Results', items: matches }]
    : SETTINGS_NAV_GROUPS;

  const handleSelect = (section: SettingsSectionId) => {
    onSelect(section);
    if (hasSearch) setSearchQuery('');
  };

  if (isCompact) {
    const activeItem =
      SETTINGS_SECTIONS.find((item) => item.id === activeSection) ?? SETTINGS_SECTIONS[0]!;

    return (
      <nav className={styles.compactNavigation} aria-label={t('Settings navigation')}>
        <div className={styles.compactCopy}>
          <span className={styles.compactEyebrow}>{t('Settings')}</span>
          <span className={styles.compactDescription}>{t(activeItem.description)}</span>
        </div>
        <div className={styles.compactSelect}>
          <span className={styles.compactSelectLabel}>{t('Settings section')}</span>
          <Select
            value={activeSection}
            options={SETTINGS_SECTIONS.map((item) => ({ value: item.id, label: item.label }))}
            onChange={onSelect}
            width="100%"
            variant="settings"
            ariaLabel="Settings section"
          />
        </div>
      </nav>
    );
  }

  return (
    <WorkspaceSidebar
      width={sidebarWidth}
      onWidthChange={(width) => updateSetting('sidebarWidth', width)}
      ariaLabel="Settings navigation"
      headerContent={
        <WorkspaceSidebarSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search settings..."
          ariaLabel="Search settings"
        />
      }
    >
      <nav className={styles.navigation} aria-label={t('Settings sections')}>
        {visibleGroups.map((group) => {
          const items = group.items.filter((item) => matchedIds.has(item.id));
          if (items.length === 0) return null;

          return (
            <section
              key={group.id}
              className={styles.group}
              aria-labelledby={`settings-group-${group.id}`}
            >
              <h3 id={`settings-group-${group.id}`} className={styles.groupLabel}>
                {t(group.label)}
              </h3>
              <div className={styles.groupItems}>
                {items.map((item) => {
                  const icons = SECTION_ICONS[item.id];
                  const isActive = activeSection === item.id;
                  return (
                    <WorkspaceSidebarNavItem
                      key={item.id}
                      label={item.label}
                      icon={<StateIcon icons={icons} active={isActive} size={16} />}
                      active={isActive}
                      onClick={() => handleSelect(item.id)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        {hasSearch && matches.length === 0 && (
          <div className={styles.emptyState} role="status">
            <SearchX size={20} aria-hidden="true" />
            <strong>{t('No settings found')}</strong>
            <span>{t('Try a feature name or preference.')}</span>
          </div>
        )}
      </nav>
    </WorkspaceSidebar>
  );
}
