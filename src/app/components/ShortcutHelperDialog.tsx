import { X } from 'lucide-react';
import { IconButton } from '@/shared/ui/Button';
import styles from './ShortcutHelperDialog.module.css';
import { getShortcutGroups } from '@/modules/settings/lib/shortcuts';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { useI18n } from '@/shared/i18n/i18n';
import { DialogShell } from '@/shared/ui/DialogShell';

interface ShortcutHelperDialogProps {
  onClose: () => void;
}

export function ShortcutHelperDialog({ onClose }: ShortcutHelperDialogProps) {
  const { t } = useI18n();
  const seekJumpSecs = useSettingsStore((state) => state.seekJumpSecs);
  const groups = getShortcutGroups(seekJumpSecs);
  return (
    <DialogShell onClose={onClose} className={styles.modal} ariaLabel={t('Keyboard Shortcuts')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('Keyboard Shortcuts')}</h2>
        <IconButton
          size="sm"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close shortcuts"
        >
          <X size={20} />
        </IconButton>
      </header>

      <div className={styles.content}>
        {groups.map((group) => (
          <section key={group.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{t(group.title)}</h3>
            <div className={styles.shortcutGrid}>
              {group.items.map((item, idx) => (
                <div key={idx} className={styles.shortcutRow}>
                  <div className={styles.keys}>
                    {item.keys.map((k, kIdx) => (
                      <kbd key={kIdx} className={styles.key}>
                        {k}
                      </kbd>
                    ))}
                  </div>
                  <span className={styles.description}>{t(item.desc)}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </DialogShell>
  );
}
