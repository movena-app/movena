import { useEffect, useId, useState, type FormEvent } from 'react';
import { desktopApi } from '@/platform/desktop';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  FileUp,
  Globe,
  Loader2,
  Tag,
  UserRound,
  X,
} from 'lucide-react';
import { useSourceStore } from '../store/useSourceStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Button, IconButton } from '@/shared/ui/Button';
import styles from './AccountConnectionForm.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface M3uSourceFormProps {
  sourceId?: string | undefined;
  onSuccess?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  compact?: boolean | undefined;
}

export function M3uSourceForm({
  sourceId,
  onSuccess,
  onCancel,
  compact = false,
}: M3uSourceFormProps) {
  const { t, number } = useI18n();
  const fieldId = useId();
  const nameId = `${fieldId}-display-name`;
  const playlistUrlId = `${fieldId}-playlist-url`;
  const refreshHoursId = `${fieldId}-refresh-hours`;
  const epgUrlId = `${fieldId}-epg-url`;
  const profile = useSourceStore((state) =>
    state.profiles.find((candidate) => candidate.id === sourceId),
  );
  const runtime = useSourceStore((state) => (sourceId ? state.runtimes[sourceId] : undefined));
  const addRemote = useSourceStore((state) => state.addRemoteSource);
  const addLocalPath = useSourceStore((state) => state.addLocalPath);
  const updateRemote = useSourceStore((state) => state.updateRemoteSource);
  const updateLocal = useSourceStore((state) => state.updateLocalSource);
  const [locationType, setLocationType] = useState<'remote' | 'local'>(
    profile?.locationType || 'remote',
  );
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [referrer, setReferrer] = useState('');
  const [refreshHours, setRefreshHours] = useState('6');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    setLocationType(profile.locationType);
    setName(profile.name);
    setUrl(profile.locationType === 'remote' ? runtime?.connection?.location || '' : '');
    setEpgUrl(runtime?.connection?.epgUrl || '');
    setUserAgent(runtime?.connection?.headers?.['User-Agent'] || '');
    setReferrer(runtime?.connection?.headers?.Referer || '');
    setRefreshHours(String(profile.refreshIntervalMinutes / 60));
  }, [profile, runtime?.connection]);

  const finish = (message: string) => {
    notify.success(sourceId ? 'M3U Source Updated' : 'M3U Source Added', message);
    onSuccess?.();
  };

  const saveRemote = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) {
      setError(t('Enter the remote M3U or M3U8 playlist URL.'));
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const input = {
        name,
        url,
        epgUrl,
        userAgent,
        referrer,
        refreshIntervalMinutes: Math.max(15, Number(refreshHours || 6) * 60),
      };
      const saved = sourceId ? await updateRemote(sourceId, input) : await addRemote(input);
      finish(
        t('{name} is active with {count} entries.', {
          name: saved.name,
          count: number(saved.entryCount),
        }),
      );
    } catch (reason: unknown) {
      const message = getUserFacingErrorMessage(reason, t('The playlist could not be loaded.'));
      setError(message);
      notify.error('Playlist Could Not Be Saved', message);
    } finally {
      setIsLoading(false);
    }
  };

  const chooseLocalFile = async () => {
    let selection: string | string[] | null;
    try {
      selection = await desktopApi.openPath({
        multiple: false,
        directory: false,
        filters: [{ name: 'M3U playlists', extensions: ['m3u', 'm3u8', 'txt'] }],
      });
    } catch (reason: unknown) {
      const message = getUserFacingErrorMessage(reason, t('The file picker could not be opened.'));
      setError(message);
      notify.error('Playlist File Could Not Be Selected', message);
      return;
    }
    if (!selection || Array.isArray(selection)) return;
    setIsLoading(true);
    setError('');
    try {
      const saved = sourceId
        ? await updateLocal(sourceId, { name, path: selection, epgUrl })
        : await addLocalPath(name, selection, epgUrl);
      finish(
        t('{name} is active with {count} entries.', {
          name: saved.name,
          count: number(saved.entryCount),
        }),
      );
    } catch (reason: unknown) {
      const message = getUserFacingErrorMessage(
        reason,
        t('The selected file is not a valid playlist.'),
      );
      setError(message);
      notify.error('Playlist Could Not Be Saved', message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveLocalMetadata = async (event: FormEvent) => {
    event.preventDefault();
    if (!sourceId) {
      await chooseLocalFile();
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const saved = await updateLocal(sourceId, { name, epgUrl });
      finish(t('{name} settings were updated.', { name: saved.name }));
    } catch (reason: unknown) {
      const message = getUserFacingErrorMessage(reason, t('The playlist could not be updated.'));
      setError(message);
      notify.error('Playlist Could Not Be Updated', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>{t(sourceId ? 'Edit M3U Source' : 'Add M3U Source')}</h2>
          <p className={styles.subtitle}>
            {t('Connection details are kept in the operating system credential vault.')}
          </p>
        </div>
        {onCancel && (
          <IconButton size="sm" className={styles.closeBtn} onClick={onCancel} aria-label="Close">
            <X size={16} />
          </IconButton>
        )}
      </div>

      {!sourceId && (
        <SegmentedControl
          options={[
            { value: 'remote', label: 'Remote URL' },
            { value: 'local', label: 'Local File' },
          ]}
          value={locationType}
          onChange={setLocationType}
          ariaLabel="M3U source location"
          className={styles.sourceTypeTabs}
        />
      )}

      <form
        className={`${styles.form} ${compact ? styles.compact : ''}`}
        onSubmit={locationType === 'remote' ? saveRemote : saveLocalMetadata}
      >
        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor={nameId}>
            {t('Display Name')}
          </label>
          <div className={styles.inputWrapper}>
            <Tag className={styles.fieldIcon} size={15} />
            <input
              id={nameId}
              className={`${styles.input} uiField`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('Living Room IPTV')}
              maxLength={120}
              autoComplete="off"
            />
          </div>
        </div>

        {locationType === 'remote' && (
          <>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor={playlistUrlId}>
                {t('Playlist URL')}
              </label>
              <div className={styles.inputWrapper}>
                <Globe className={styles.fieldIcon} size={15} />
                <input
                  id={playlistUrlId}
                  type="url"
                  className={`${styles.input} uiField`}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://provider.example/list.m3u"
                  autoComplete="url"
                  aria-required="true"
                />
              </div>
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor={refreshHoursId}>
                {t('Refresh Every (Hours)')}
              </label>
              <div className={styles.inputWrapper}>
                <CalendarDays className={styles.fieldIcon} size={15} />
                <input
                  id={refreshHoursId}
                  className={`${styles.input} uiField`}
                  type="number"
                  min={0.25}
                  max={168}
                  step={0.25}
                  value={refreshHours}
                  onChange={(event) => setRefreshHours(event.target.value)}
                />
              </div>
            </div>
            <div className={styles.inputGroup}>
              <span className={styles.label}>{t('Request Identity (Optional)')}</span>
              <div className={styles.inputWrapper}>
                <UserRound className={styles.fieldIcon} size={15} />
                <input
                  className={`${styles.input} uiField`}
                  value={userAgent}
                  onChange={(event) => setUserAgent(event.target.value)}
                  placeholder="User-Agent"
                  aria-label={t('User agent')}
                  autoComplete="off"
                />
              </div>
              <div className={styles.inputWrapper}>
                <Globe className={styles.fieldIcon} size={15} />
                <input
                  type="url"
                  className={`${styles.input} uiField`}
                  value={referrer}
                  onChange={(event) => setReferrer(event.target.value)}
                  placeholder="https://referrer.example/"
                  aria-label={t('HTTP referrer')}
                  autoComplete="off"
                />
              </div>
            </div>
          </>
        )}

        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor={epgUrlId}>
            {t('XMLTV Override (Optional)')}
          </label>
          <div className={styles.inputWrapper}>
            <CalendarDays className={styles.fieldIcon} size={15} />
            <input
              id={epgUrlId}
              type="url"
              className={`${styles.input} uiField`}
              value={epgUrl}
              onChange={(event) => setEpgUrl(event.target.value)}
              placeholder={t('Auto-detected when empty')}
              autoComplete="off"
            />
          </div>
        </div>

        {locationType === 'local' && sourceId && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className={styles.addServerBtn}
            onClick={() => void chooseLocalFile()}
            disabled={isLoading}
          >
            <FileUp size={14} /> {t('Replace Playlist File')}
          </Button>
        )}

        {error && (
          <div className={styles.error} role="alert" aria-live="assertive">
            <AlertCircle size={15} className={styles.errorIcon} />
            <span>{error}</span>
          </div>
        )}

        <div className={styles.footerActions}>
          <Button
            variant="ghost"
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" className={styles.submitBtn} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 size={15} className={styles.spinner} /> {t('Saving...')}
              </>
            ) : locationType === 'local' && !sourceId ? (
              <>
                <FileUp size={15} /> {t('Choose File')}
              </>
            ) : (
              <>
                {t('Save Source')} <ArrowRight size={15} />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
