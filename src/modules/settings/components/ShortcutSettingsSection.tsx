import { useSettingsStore } from '../store/useSettingsStore';
import { SettingsGroup, SettingsPageContent } from './SettingsControls';
import styles from '../pages/SettingsPage.module.css';
import { getShortcutGroups } from '../lib/shortcuts';
import { useI18n } from '@/shared/i18n/i18n';

export function ShortcutSettingsSection() {
  const { t } = useI18n();
  const seekJumpSecs = useSettingsStore((state) => state.seekJumpSecs);
  const shortcutGroups = getShortcutGroups(seekJumpSecs);

  const renderShortcuts = (shortcuts: ReturnType<typeof getShortcutGroups>[number]['items']) => (
    <div className={styles.shortcutsGrid}>
      {shortcuts.map((shortcut) => (
        <div className={styles.shortcutItem} key={`${shortcut.desc}-${shortcut.keys.join('-')}`}>
          <span className={styles.shortcutLabel}>{t(shortcut.desc)}</span>
          <kbd className={styles.kbd}>{shortcut.keys.join(' + ')}</kbd>
        </div>
      ))}
    </div>
  );

  return (
    <SettingsPageContent>
      {shortcutGroups.map((group) => (
        <SettingsGroup
          key={group.title}
          title={group.title}
          description={
            group.title === 'Global Navigation'
              ? 'App navigation shortcuts, available when you are not editing text.'
              : group.title === 'Live TV Channel Navigation'
                ? 'Channel shortcuts available while the Live TV channel drawer is open.'
                : 'Playback shortcuts available while the native player is active.'
          }
        >
          <div className={styles.shortcutsContainer}>{renderShortcuts(group.items)}</div>
        </SettingsGroup>
      ))}
    </SettingsPageContent>
  );
}
