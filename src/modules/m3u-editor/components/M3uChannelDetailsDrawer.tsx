import { useState, useEffect, type CSSProperties, type FormEvent } from 'react';
import { X, Play, Loader2, Sparkles, Check, AlertCircle } from 'lucide-react';
import type { M3uEntry, M3uMediaType } from '@/modules/sources/public/data/m3uClient';
import type { M3uProbeStatus } from '@/platform/tauri';
import { cleanChannelTitle, probeStreamHealth } from '../lib/m3uEditor';
import { Button, IconButton } from '@/shared/ui/Button';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import styles from './M3uEditorWorkspace.module.css';
import { useI18n } from '@/shared/i18n/i18n';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { getErrorMessage } from '@/shared/lib/error';
import { DialogShell } from '@/shared/ui/DialogShell';

interface M3uChannelDetailsDrawerProps {
  entry: M3uEntry | null;
  existingGroups: string[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: M3uEntry) => void;
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  hasPrevious?: boolean | undefined;
  hasNext?: boolean | undefined;
}

export function M3uChannelDetailsDrawer({
  entry,
  existingGroups,
  isOpen,
  onClose,
  onSave,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: M3uChannelDetailsDrawerProps) {
  const { t } = useI18n();
  const inspectorWidth = useSettingsStore((state) => state.m3uEditorInspectorWidth);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [type, setType] = useState<M3uMediaType>('live');
  const [channelNumber, setChannelNumber] = useState('');
  const [tvgId, setTvgId] = useState('');
  const [tvgName, setTvgName] = useState('');
  const [logo, setLogo] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [referrer, setReferrer] = useState('');
  const [catchup, setCatchup] = useState('');
  const [catchupDays, setCatchupDays] = useState('');
  const [catchupSource, setCatchupSource] = useState('');
  const [description, setDescription] = useState('');
  const [year, setYear] = useState('');
  const [rating, setRating] = useState('');
  const [radio, setRadio] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);
  const [healthResult, setHealthResult] = useState<M3uProbeStatus | null>(null);
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    if (entry) {
      setTitle(entry.title || '');
      setUrl(entry.url || '');
      setGroupTitle(entry.groupTitle || '');
      setType(entry.type || 'live');
      setChannelNumber(entry.channelNumber || '');
      setTvgId(entry.tvgId || '');
      setTvgName(entry.tvgName || '');
      setLogo(entry.logo || '');
      setUserAgent(entry.headers?.['User-Agent'] || '');
      setReferrer(entry.headers?.Referer || '');
      setCatchup(entry.catchup || '');
      setCatchupDays(entry.catchupDays !== undefined ? String(entry.catchupDays) : '');
      setCatchupSource(entry.catchupSource || '');
      setDescription(entry.description || '');
      setYear(entry.year || '');
      setRating(entry.rating !== undefined ? String(entry.rating) : '');
      setRadio(entry.radio === true);
      setHealthResult(null);
      setHealthError('');
    } else {
      setTitle('');
      setUrl('');
      setGroupTitle('General');
      setType('live');
      setChannelNumber('');
      setTvgId('');
      setTvgName('');
      setLogo('');
      setUserAgent('');
      setReferrer('');
      setCatchup('');
      setCatchupDays('');
      setCatchupSource('');
      setDescription('');
      setYear('');
      setRating('');
      setRadio(false);
      setHealthResult(null);
      setHealthError('');
    }
  }, [entry]);

  if (!isOpen) return null;

  const handleTestStream = async () => {
    if (!url.trim()) return;
    setTestingHealth(true);
    setHealthResult(null);
    setHealthError('');
    try {
      const headers: Record<string, string> = {};
      if (userAgent.trim()) headers['User-Agent'] = userAgent.trim();
      if (referrer.trim()) headers.Referer = referrer.trim();
      const result = await probeStreamHealth(url, headers, 4000);
      setHealthResult(result.status);
      setHealthError(result.errorMessage ?? '');
    } catch (error: unknown) {
      setHealthError(getErrorMessage(error, 'Stream health test failed without an error message.'));
    } finally {
      setTestingHealth(false);
    }
  };

  const handleAutoCleanTitle = () => {
    const cleaned = cleanChannelTitle(title, {
      removeResolutionTags: true,
      removeCountryPrefixes: true,
      removeProviderNoise: true,
      normalizeSpacing: true,
    });
    setTitle(cleaned);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    const headers: Record<string, string> = {};
    if (userAgent.trim()) headers['User-Agent'] = userAgent.trim();
    if (referrer.trim()) headers.Referer = referrer.trim();

    const updated: M3uEntry = {
      ...(entry || {}),
      id: entry ? entry.id : `m3u-custom-${Date.now()}`,
      sourceId: entry ? entry.sourceId : 'custom',
      title: title.trim(),
      url: url.trim(),
      type,
      duration: entry?.duration ?? -1,
      groupTitle: groupTitle.trim() || 'General',
      categoryId: `m3u-category-${type}-${(groupTitle.trim() || 'general')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`,
      channelNumber: channelNumber.trim() || undefined,
      tvgId: tvgId.trim() || undefined,
      tvgName: tvgName.trim() || undefined,
      logo: logo.trim() || undefined,
      headers,
      catchup: catchup.trim() || undefined,
      catchupDays: catchupDays ? Number(catchupDays) : undefined,
      catchupSource: catchupSource.trim() || undefined,
      description: description.trim() || undefined,
      year: year.trim() || undefined,
      rating: rating ? Number(rating) : undefined,
      radio,
    };

    onSave(updated);
  };

  return (
    <DialogShell
      onClose={onClose}
      overlayClassName={styles.drawerOverlay}
      className={styles.drawerPanel}
      ariaLabel={entry ? t('Edit Channel') : t('Add Channel')}
      initialFocusSelector="#m3u-channel-title"
      focusKey={entry?.id ?? 'new-channel'}
    >
      <div
        className={styles.drawerPanelContent}
        style={{ '--m3u-inspector-width': `${inspectorWidth}px` } as CSSProperties}
      >
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerHeaderTitle}>
            {entry ? t('Channel Inspector') : t('New Channel')}
          </h2>
          <IconButton size="sm" type="button" onClick={onClose} aria-label={t('Close')}>
            <X size={16} />
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} className={styles.drawerBody}>
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>{t('Media Type')}</span>
            <SegmentedControl
              options={[
                { value: 'live', label: t('Live TV') },
                { value: 'vod', label: t('Movie (VOD)') },
                { value: 'series', label: t('Series') },
              ]}
              value={type}
              onChange={setType}
              ariaLabel={t('Media type')}
            />
          </div>

          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className={styles.formLabel} htmlFor="m3u-channel-title">
                {t('Channel Name')}
              </label>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={handleAutoCleanTitle}
                title={t('Auto-clean name tags')}
              >
                <Sparkles size={12} /> {t('Clean')}
              </Button>
            </div>
            <input
              id="m3u-channel-title"
              type="text"
              className={`uiField`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. BBC One HD"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className={styles.formLabel} htmlFor="m3u-stream-url">
                {t('Stream URL')}
              </label>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={handleTestStream}
                disabled={testingHealth || !url.trim()}
              >
                {testingHealth ? <Loader2 size={12} className="spin" /> : <Play size={12} />}
                {healthResult === 'online' ? (
                  <span className={styles.inlineSuccess}>
                    <Check size={12} /> {t('Reachable')}
                  </span>
                ) : healthResult ? (
                  <span className={styles.inlineError}>
                    <AlertCircle size={12} />{' '}
                    {t(
                      healthResult === 'unauthorized'
                        ? 'Unauthorized'
                        : healthResult === 'timeout'
                          ? 'Timed out'
                          : 'Offline',
                    )}
                  </span>
                ) : (
                  t('Test Stream')
                )}
              </Button>
            </div>
            <input
              id="m3u-stream-url"
              type="url"
              className={`uiField`}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setHealthResult(null);
                setHealthError('');
              }}
              placeholder="http://example.com/stream.m3u8"
              required
            />
            {healthError && (
              <p className={styles.technicalError} role="alert">
                {healthError}
              </p>
            )}
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-channel-group">
                {t('Category / Group')}
              </label>
              <input
                id="m3u-channel-group"
                type="text"
                list="m3u-group-suggestions"
                className={`uiField`}
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="e.g. UK | Entertainment"
              />
              <datalist id="m3u-group-suggestions">
                {existingGroups.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-channel-chno">
                {t('Channel Number')}
              </label>
              <input
                id="m3u-channel-chno"
                type="text"
                className={`uiField`}
                value={channelNumber}
                onChange={(e) => setChannelNumber(e.target.value)}
                placeholder="e.g. 101"
              />
            </div>
          </div>

          <details className={styles.advancedFields}>
            <summary>{t('Advanced metadata')}</summary>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-description">
                {t('Description')}
              </label>
              <textarea
                id="m3u-description"
                className={`uiField ${styles.formTextarea}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="m3u-year">
                  {t('Year')}
                </label>
                <input
                  id="m3u-year"
                  className="uiField"
                  inputMode="numeric"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="m3u-rating">
                  {t('Rating')}
                </label>
                <input
                  id="m3u-rating"
                  className="uiField"
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="m3u-catchup">
                  {t('Catch-up Mode')}
                </label>
                <input
                  id="m3u-catchup"
                  className="uiField"
                  value={catchup}
                  onChange={(event) => setCatchup(event.target.value)}
                  placeholder="default, append, shift"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="m3u-catchup-days">
                  {t('Catch-up Days')}
                </label>
                <input
                  id="m3u-catchup-days"
                  className="uiField"
                  type="number"
                  min="0"
                  value={catchupDays}
                  onChange={(event) => setCatchupDays(event.target.value)}
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-catchup-source">
                {t('Catch-up Source Template')}
              </label>
              <input
                id="m3u-catchup-source"
                className="uiField"
                value={catchupSource}
                onChange={(event) => setCatchupSource(event.target.value)}
              />
            </div>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={radio}
                onChange={(event) => setRadio(event.target.checked)}
              />
              <span>{t('Treat as a radio stream')}</span>
            </label>
            {entry && Object.keys(entry.headers || {}).length > 2 && (
              <p className={styles.preservedNotice}>
                {t('{count} additional request headers will be preserved.', {
                  count: Object.keys(entry.headers).length - 2,
                })}
              </p>
            )}
          </details>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-tvg-id">
                {t('EPG TVG-ID')}
              </label>
              <input
                id="m3u-tvg-id"
                type="text"
                className={`uiField`}
                value={tvgId}
                onChange={(e) => setTvgId(e.target.value)}
                placeholder="e.g. bbc1.uk"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-tvg-name">
                {t('TVG Name')}
              </label>
              <input
                id="m3u-tvg-name"
                type="text"
                className={`uiField`}
                value={tvgName}
                onChange={(e) => setTvgName(e.target.value)}
                placeholder="e.g. BBC One"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="m3u-tvg-logo">
              {t('Logo URL (tvg-logo)')}
            </label>
            <input
              id="m3u-tvg-logo"
              type="url"
              className={`uiField`}
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            {logo && (
              <div className={styles.logoPreviewArea}>
                <div className={styles.logoPreviewBox}>
                  <img
                    src={logo}
                    alt={title || 'Logo preview'}
                    className={styles.channelLogoImg}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <span style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-muted)' }}>
                  {t('Live logo preview')}
                </span>
              </div>
            )}
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-user-agent">
                {t('Custom User-Agent')}
              </label>
              <input
                id="m3u-user-agent"
                type="text"
                className={`uiField`}
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="m3u-referrer">
                {t('Custom Referer')}
              </label>
              <input
                id="m3u-referrer"
                type="url"
                className={`uiField`}
                value={referrer}
                onChange={(e) => setReferrer(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        </form>

        <div className={styles.drawerFooter}>
          {onPrevious && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
            >
              {t('Previous')}
            </Button>
          )}
          {onNext && (
            <Button variant="ghost" size="sm" type="button" onClick={onNext} disabled={!hasNext}>
              {t('Next')}
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" type="button" onClick={handleSubmit}>
            {t('Apply')}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
