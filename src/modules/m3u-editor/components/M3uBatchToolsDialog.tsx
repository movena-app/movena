import { useState, useMemo } from 'react';
import { X, Sparkles, Replace, ArrowDown10, ArrowRight, Save, Trash2, Play } from 'lucide-react';
import type { M3uEntry } from '@/modules/sources/public/data/m3uClient';
import {
  cleanChannelTitle,
  findAndReplace,
  renumberChannels,
  loadTransformPresets,
  persistTransformPresets,
  applyTransformPreset,
  type M3uTransformPreset,
  type TitleCleanOptions,
} from '../lib/m3uEditor';
import { Button, IconButton } from '@/shared/ui/Button';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Select } from '@/shared/ui/Select';
import styles from './M3uEditorWorkspace.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { DialogShell } from '@/shared/ui/DialogShell';

interface M3uBatchToolsDialogProps {
  entries: M3uEntry[];
  selectedIds: Set<string>;
  isOpen: boolean;
  onClose: () => void;
  onApply: (updatedEntries: M3uEntry[]) => void;
}

type ToolTab = 'clean' | 'replace' | 'renumber' | 'presets';

export function M3uBatchToolsDialog({
  entries,
  selectedIds,
  isOpen,
  onClose,
  onApply,
}: M3uBatchToolsDialogProps) {
  const { t, number } = useI18n();
  const [activeTab, setActiveTab] = useState<ToolTab>('clean');
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<M3uTransformPreset[]>(loadTransformPresets);

  // Title Cleaner state
  const [removeResolution, setRemoveResolution] = useState(true);
  const [removeCountry, setRemoveCountry] = useState(true);
  const [removeNoise, setRemoveNoise] = useState(true);
  const [targetScope, setTargetScope] = useState<'all' | 'selected'>(
    selectedIds.size > 0 ? 'selected' : 'all',
  );

  // Find and Replace state
  const [findField, setFindField] = useState<'title' | 'url' | 'groupTitle' | 'tvgId'>('title');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  // Renumber state
  const [startNumber, setStartNumber] = useState('1');

  const scopeEntries = useMemo(() => {
    if (targetScope === 'selected' && selectedIds.size > 0) {
      return entries.filter((e) => selectedIds.has(e.id));
    }
    return entries;
  }, [entries, selectedIds, targetScope]);

  // Clean diff preview
  const cleanOptions: TitleCleanOptions = useMemo(
    () => ({
      removeResolutionTags: removeResolution,
      removeCountryPrefixes: removeCountry,
      removeProviderNoise: removeNoise,
      normalizeSpacing: true,
    }),
    [removeResolution, removeCountry, removeNoise],
  );

  const cleanPreview = useMemo(() => {
    const diffs: { id: string; before: string; after: string }[] = [];
    for (const entry of scopeEntries) {
      const cleaned = cleanChannelTitle(entry.title, cleanOptions);
      if (cleaned !== entry.title) {
        diffs.push({ id: entry.id, before: entry.title, after: cleaned });
      }
    }
    return diffs;
  }, [scopeEntries, cleanOptions]);

  // Find & replace preview count
  const replacePreview = useMemo(() => {
    if (!findText) return { count: 0 };
    return findAndReplace(scopeEntries, {
      field: findField,
      findText,
      replaceText,
      matchCase,
      useRegex,
    });
  }, [scopeEntries, findField, findText, replaceText, matchCase, useRegex]);

  if (!isOpen) return null;

  const handleApplyClean = () => {
    const targetSet = targetScope === 'selected' && selectedIds.size > 0 ? selectedIds : null;
    const updated = entries.map((entry) => {
      if (targetSet && !targetSet.has(entry.id)) return entry;
      const cleaned = cleanChannelTitle(entry.title, cleanOptions);
      return cleaned !== entry.title ? { ...entry, title: cleaned } : entry;
    });
    onApply(updated);
    onClose();
  };

  const handleApplyReplace = () => {
    const targetSet = targetScope === 'selected' && selectedIds.size > 0 ? selectedIds : null;
    const targets = targetSet ? entries.filter((e) => targetSet.has(e.id)) : entries;
    const { entries: replacedTargets } = findAndReplace(targets, {
      field: findField,
      findText,
      replaceText,
      matchCase,
      useRegex,
    });

    const replacedMap = new Map(replacedTargets.map((e) => [e.id, e]));
    const updated = entries.map((e) => replacedMap.get(e.id) || e);
    onApply(updated);
    onClose();
  };

  const handleApplyRenumber = () => {
    const start = Number(startNumber) || 1;
    const targetSet = targetScope === 'selected' && selectedIds.size > 0 ? selectedIds : null;

    if (targetSet) {
      const selectedList = entries.filter((e) => targetSet.has(e.id));
      const renumberedSelected = renumberChannels(selectedList, start);
      const renumberedMap = new Map(renumberedSelected.map((e) => [e.id, e]));
      const updated = entries.map((e) => renumberedMap.get(e.id) || e);
      onApply(updated);
    } else {
      const updated = renumberChannels(entries, start);
      onApply(updated);
    }
    onClose();
  };

  const saveCurrentRule = () => {
    const name = presetName.trim();
    if (!name || (activeTab !== 'clean' && activeTab !== 'replace')) return;
    const preset: M3uTransformPreset =
      activeTab === 'clean'
        ? { id: `clean-${Date.now()}`, name, kind: 'clean', cleanOptions, createdAt: Date.now() }
        : {
            id: `replace-${Date.now()}`,
            name,
            kind: 'replace',
            replaceOptions: { field: findField, findText, replaceText, matchCase, useRegex },
            createdAt: Date.now(),
          };
    const next = [preset, ...presets].slice(0, 20);
    setPresets(next);
    persistTransformPresets(next);
    setPresetName('');
  };

  const applyPreset = (preset: M3uTransformPreset) => {
    const targetSet = targetScope === 'selected' && selectedIds.size > 0 ? selectedIds : null;
    const targets = targetSet ? entries.filter((entry) => targetSet.has(entry.id)) : entries;
    const transformed = applyTransformPreset(targets, preset);
    const replacements = new Map(transformed.entries.map((entry) => [entry.id, entry]));
    onApply(entries.map((entry) => replacements.get(entry.id) || entry));
    onClose();
  };

  const deletePreset = (id: string) => {
    const next = presets.filter((preset) => preset.id !== id);
    setPresets(next);
    persistTransformPresets(next);
  };

  return (
    <DialogShell
      onClose={onClose}
      overlayClassName={styles.drawerOverlay}
      className={styles.modalDialog}
      ariaLabel={t('Batch Tools')}
      initialFocusSelector="button"
    >
      <div className={styles.modalHeader}>
        <h2 className={styles.drawerHeaderTitle}>{t('Batch Playlist Tools')}</h2>
        <IconButton size="sm" type="button" onClick={onClose} aria-label={t('Close')}>
          <X size={16} />
        </IconButton>
      </div>

      <div className={styles.modalBody}>
        <SegmentedControl
          options={[
            { value: 'clean', label: t('Clean Titles') },
            { value: 'replace', label: t('Find & Replace') },
            { value: 'renumber', label: t('Renumber Channels') },
            { value: 'presets', label: t('Saved Rules') },
          ]}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel={t('Tool mode')}
        />

        {selectedIds.size > 0 && (
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>{t('Target Scope')}</span>
            <SegmentedControl
              options={[
                {
                  value: 'selected',
                  label: t('Selected ({count})', { count: number(selectedIds.size) }),
                },
                { value: 'all', label: t('All ({count})', { count: number(entries.length) }) },
              ]}
              value={targetScope}
              onChange={setTargetScope}
              ariaLabel={t('Target scope')}
            />
          </div>
        )}

        {activeTab === 'clean' && (
          <>
            <div className={styles.formGroup}>
              <span className={styles.formLabel}>{t('Cleanup Rules')}</span>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={removeResolution}
                  onChange={(e) => setRemoveResolution(e.target.checked)}
                />
                <span>{t('Remove resolution tags ([4K], [FHD], [HD], 1080p, 50fps)')}</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={removeCountry}
                  onChange={(e) => setRemoveCountry(e.target.checked)}
                />
                <span>{t('Remove country/language prefixes (|US|, [UK], DE:)')}</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={removeNoise}
                  onChange={(e) => setRemoveNoise(e.target.checked)}
                />
                <span>{t('Remove provider junk & symbols (###, >>>, ***, |)')}</span>
              </label>
            </div>

            <div className={styles.formGroup}>
              <span className={styles.formLabel}>
                {t('Preview Changes ({count} channels will be modified)', {
                  count: number(cleanPreview.length),
                })}
              </span>
              {cleanPreview.length > 0 ? (
                <div className={styles.diffPreviewList}>
                  {cleanPreview.slice(0, 50).map((diff) => (
                    <div key={diff.id} className={styles.diffRow}>
                      <span className={styles.diffBefore}>{diff.before}</span>
                      <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                      <span className={styles.diffAfter}>{diff.after}</span>
                    </div>
                  ))}
                  {cleanPreview.length > 50 && (
                    <span
                      style={{
                        fontSize: 'var(--font-size-micro)',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                      }}
                    >
                      {t('+ {count} more channels...', { count: number(cleanPreview.length - 50) })}
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-muted)' }}>
                  {t('No channel names match the selected cleaning rules.')}
                </span>
              )}
            </div>
          </>
        )}

        {activeTab === 'replace' && (
          <>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="m3u-replace-field">
                  {t('Target Field')}
                </label>
                <Select
                  value={findField}
                  options={[
                    { value: 'title', label: t('Channel Name') },
                    { value: 'url', label: t('Stream URL') },
                    { value: 'groupTitle', label: t('Category / Group') },
                    { value: 'tvgId', label: t('EPG TVG-ID') },
                  ]}
                  onChange={setFindField}
                  width="100%"
                  variant="settings"
                  ariaLabel={t('Target field')}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-find-text">
                {t('Find Text')}
              </label>
              <input
                id="m3u-find-text"
                type="text"
                className={`uiField`}
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder={t('Text or domain to find')}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-replace-text">
                {t('Replace With')}
              </label>
              <input
                id="m3u-replace-text"
                type="text"
                className={`uiField`}
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder={t('Replacement text')}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={matchCase}
                  onChange={(e) => setMatchCase(e.target.checked)}
                />
                <span>{t('Match case')}</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                />
                <span>{t('Use Regular Expression')}</span>
              </label>
            </div>

            {findText && (
              <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)' }}>
                {t('Matches found in {count} channels.', { count: number(replacePreview.count) })}
              </span>
            )}
          </>
        )}

        {activeTab === 'renumber' && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-renumber-start">
                {t('Starting Number')}
              </label>
              <input
                id="m3u-renumber-start"
                type="number"
                min={1}
                className={`uiField`}
                value={startNumber}
                onChange={(e) => setStartNumber(e.target.value)}
                placeholder="1"
              />
              <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-muted)' }}>
                {t('Renumber {count} channels sequentially in their current order.', {
                  count: number(scopeEntries.length),
                })}
              </span>
            </div>
          </>
        )}

        {(activeTab === 'clean' || activeTab === 'replace') && (
          <div className={styles.savedRuleComposer}>
            <label className={styles.formGroup} htmlFor="m3u-rule-name">
              <span className={styles.formLabel}>{t('Save Current Configuration')}</span>
              <input
                id="m3u-rule-name"
                className="uiField"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder={t('Rule name')}
              />
            </label>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={saveCurrentRule}
              disabled={!presetName.trim() || (activeTab === 'replace' && !findText)}
            >
              <Save size={13} /> {t('Save Rule')}
            </Button>
          </div>
        )}

        {activeTab === 'presets' && (
          <div className={styles.presetList}>
            {presets.map((preset) => {
              const preview = applyTransformPreset(scopeEntries, preset);
              return (
                <div key={preset.id} className={styles.presetRow}>
                  <div>
                    <strong>{preset.name}</strong>
                    <span>
                      {t(preset.kind === 'clean' ? 'Title cleanup' : 'Find and replace')} ·{' '}
                      {number(preview.count)} {t('matches')}
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    type="button"
                    onClick={() => applyPreset(preset)}
                    disabled={preview.count === 0}
                  >
                    <Play size={13} /> {t('Apply')}
                  </Button>
                  <IconButton
                    size="sm"
                    type="button"
                    onClick={() => deletePreset(preset.id)}
                    aria-label={t('Delete saved rule')}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              );
            })}
            {presets.length === 0 && (
              <p className={styles.emptyNotice}>
                {t(
                  'No saved rules yet. Configure a title cleanup or replacement and save it for reuse.',
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={styles.modalFooter}>
        <Button variant="ghost" type="button" onClick={onClose}>
          {t('Cancel')}
        </Button>
        {activeTab === 'clean' && (
          <Button
            variant="primary"
            type="button"
            onClick={handleApplyClean}
            disabled={cleanPreview.length === 0}
          >
            <Sparkles size={14} />{' '}
            {t('Apply Clean ({count})', { count: number(cleanPreview.length) })}
          </Button>
        )}
        {activeTab === 'replace' && (
          <Button
            variant="primary"
            type="button"
            onClick={handleApplyReplace}
            disabled={!findText || replacePreview.count === 0}
          >
            <Replace size={14} />{' '}
            {t('Replace All ({count})', { count: number(replacePreview.count) })}
          </Button>
        )}
        {activeTab === 'renumber' && (
          <Button variant="primary" type="button" onClick={handleApplyRenumber}>
            <ArrowDown10 size={14} /> {t('Renumber Channels')}
          </Button>
        )}
      </div>
    </DialogShell>
  );
}
