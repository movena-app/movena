import { useMemo, useState } from 'react';
import { Command, Search, X } from 'lucide-react';
import { IconButton } from '@/shared/ui/Button';
import { DialogShell } from '@/shared/ui/DialogShell';
import { useI18n } from '@/shared/i18n/i18n';
import styles from './M3uEditorWorkspace.module.css';

export interface M3uEditorCommand {
  id: string;
  label: string;
  shortcut?: string | undefined;
  disabled?: boolean | undefined;
  run: () => void;
}

interface M3uCommandPaletteProps {
  commands: M3uEditorCommand[];
  onClose: () => void;
}

export function M3uCommandPalette({ commands, onClose }: M3uCommandPaletteProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? commands.filter((command) => t(command.label).toLowerCase().includes(normalized))
      : commands;
  }, [commands, query, t]);

  return (
    <DialogShell
      onClose={onClose}
      className={styles.commandPalette}
      ariaLabel={t('Editor Command Palette')}
      initialFocusSelector="input"
    >
      <div className={styles.commandSearch}>
        <Search size={15} aria-hidden="true" />
        <input
          className="uiField"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('Search editor commands...')}
          aria-label={t('Search editor commands')}
        />
        <IconButton size="sm" type="button" onClick={onClose} aria-label={t('Close')}>
          <X size={15} />
        </IconButton>
      </div>
      <div className={styles.commandList} role="listbox" aria-label={t('Editor commands')}>
        {filtered.map((command) => (
          <button
            key={command.id}
            type="button"
            role="option"
            aria-selected="false"
            className={styles.commandItem}
            disabled={command.disabled}
            onClick={() => {
              onClose();
              command.run();
            }}
          >
            <Command size={14} aria-hidden="true" />
            <span>{t(command.label)}</span>
            {command.shortcut && <kbd>{command.shortcut}</kbd>}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className={styles.emptyNotice}>{t('No matching commands.')}</p>
        )}
      </div>
    </DialogShell>
  );
}
