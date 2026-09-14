import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { testServerLatency } from '../data/xtreamClient';
import { notify } from '@/shared/notifications/useNotificationStore';
import { debugLog } from '@/modules/diagnostics/public/store/useDebugStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import {
  Globe,
  User,
  Lock,
  Loader2,
  ArrowRight,
  AlertCircle,
  Plus,
  Trash2,
  Zap,
  X,
  Tag,
  CalendarDays,
} from 'lucide-react';
import { Button, IconButton } from '@/shared/ui/Button';
import styles from './AccountConnectionForm.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface AccountConnectionFormProps {
  title?: string | undefined;
  submitLabel?: string | undefined;
  onSuccess?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  compact?: boolean | undefined;
  sourceId?: string | undefined;
}

interface ServerLatencyState {
  [urlIndex: number]: {
    status: 'testing' | 'success' | 'error';
    latencyMs?: number | undefined;
    errorMsg?: string | undefined;
  };
}

export function AccountConnectionForm({
  title = 'Add Xtream Source',
  submitLabel = 'Add Source',
  onSuccess,
  onCancel,
  compact = false,
  sourceId,
}: AccountConnectionFormProps) {
  const { t, number } = useI18n();
  const fieldId = useId();
  const displayNameId = `${fieldId}-display-name`;
  const primaryUrlId = `${fieldId}-primary-url`;
  const usernameId = `${fieldId}-username`;
  const passwordId = `${fieldId}-password`;
  const epgUrlId = `${fieldId}-epg-url`;
  const credentials = useAuthStore((state) =>
    sourceId ? (state.runtimes[sourceId]?.credentials ?? null) : null,
  );
  const addSource = useAuthStore((state) => state.addSource);
  const updateSource = useAuthStore((state) => state.updateSource);

  const [displayName, setDisplayName] = useState('');
  const [primaryUrl, setPrimaryUrl] = useState('');
  const [alternativeUrls, setAlternativeUrls] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [epgUrl, setEpgUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [latencies, setLatencies] = useState<ServerLatencyState>({});

  useEffect(() => {
    if (!credentials) {
      setDisplayName('');
      setPrimaryUrl('');
      setAlternativeUrls([]);
      setUsername('');
      setPassword('');
      setEpgUrl('');
      return;
    }
    setDisplayName(credentials.displayName || '');
    setPrimaryUrl(credentials.url || '');
    setAlternativeUrls(credentials.alternativeUrls || []);
    setUsername(credentials.username || '');
    setPassword(credentials.password || '');
    setEpgUrl(credentials.epgUrl || '');
  }, [credentials]);

  const handleAddServer = () => {
    setAlternativeUrls((prev) => [...prev, '']);
  };

  const handleRemoveServer = (index: number) => {
    setAlternativeUrls((prev) => prev.filter((_, i) => i !== index));
    setLatencies((prev) => {
      const copy = { ...prev };
      delete copy[index + 1];
      return copy;
    });
  };

  const handleAlternativeUrlChange = (index: number, value: string) => {
    setAlternativeUrls((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const normalizeUrl = (u: string) => {
    let valid = u.trim();
    if (!valid) return '';
    if (!/^https?:\/\//i.test(valid)) {
      valid = `https://${valid}`;
    }
    return valid;
  };

  const handleSpeedTest = async () => {
    if (!username || !password) {
      notify.warning(
        'Credentials Required',
        'Enter your username and password before testing the connection.',
      );
      return;
    }

    const allUrls = [primaryUrl, ...alternativeUrls].map(normalizeUrl).filter(Boolean);
    if (allUrls.length === 0) {
      notify.warning(
        'No Server Addresses',
        'Enter at least one server address before running the speed test.',
      );
      return;
    }

    setIsTestingSpeed(true);
    const initialLatencies: ServerLatencyState = {};
    allUrls.forEach((_, idx) => {
      initialLatencies[idx] = { status: 'testing' };
    });
    setLatencies(initialLatencies);

    let fastestIndex = -1;
    let minLatency = Infinity;
    const failures: string[] = [];

    await Promise.all(
      allUrls.map(async (rawUrl, idx) => {
        try {
          const latency = await testServerLatency(rawUrl, username, password);
          setLatencies((prev) => ({
            ...prev,
            [idx]: { status: 'success', latencyMs: latency },
          }));
          if (latency < minLatency) {
            minLatency = latency;
            fastestIndex = idx;
          }
        } catch (error: unknown) {
          const message = getUserFacingErrorMessage(error, t('Unavailable'));
          failures[idx] = message;
          setLatencies((prev) => ({
            ...prev,
            [idx]: { status: 'error', errorMsg: message },
          }));
        }
      }),
    );

    setIsTestingSpeed(false);

    if (fastestIndex > 0) {
      const fastestUrl = allUrls[fastestIndex];
      if (!fastestUrl) return;
      const remainingUrls = allUrls.filter((_, i) => i !== fastestIndex);
      setPrimaryUrl(fastestUrl);
      setAlternativeUrls(remainingUrls);
      notify.success(
        'Speed Test Complete',
        `Promoted fastest server (${fastestUrl}) to Primary (${minLatency} ms)`,
      );
    } else if (fastestIndex === 0) {
      notify.success('Speed Test Complete', `Primary server responded fastest (${minLatency} ms)`);
    } else {
      notify.error(
        'Speed Test Failed',
        failures.filter(Boolean).join('\n') || 'Every server test failed without an error message.',
      );
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const formattedPrimary = normalizeUrl(primaryUrl);
    if (!formattedPrimary || !username.trim() || !password.trim()) {
      const errMsg = t('Complete all required fields.');
      setError(errMsg);
      notify.warning('Incomplete Form', errMsg);
      return;
    }

    const formattedAlternatives = alternativeUrls
      .map(normalizeUrl)
      .filter((u) => u && u !== formattedPrimary);

    setIsLoading(true);
    try {
      const creds = {
        name: displayName.trim() || undefined,
        displayName: displayName.trim() || undefined,
        url: formattedPrimary,
        alternativeUrls: formattedAlternatives,
        username: username.trim(),
        password: password.trim(),
        epgUrl: epgUrl.trim() || undefined,
      };

      const profile = sourceId ? await updateSource(sourceId, creds) : await addSource(creds);
      notify.success(
        sourceId ? 'Xtream Source Updated' : 'Xtream Source Connected',
        `${profile.name} authenticated as ${profile.username}`,
      );
      debugLog.info('auth', 'Successfully connected provider account', {
        username: creds.username,
        url: creds.url,
        alternativeCount: formattedAlternatives.length,
      });
      onSuccess?.();
    } catch (error: unknown) {
      const errMsg = getUserFacingErrorMessage(
        error,
        t('We couldn’t verify these account details. Check them and try again.'),
      );
      setError(errMsg);
      notify.error('Connection Error', errMsg);
      debugLog.error('auth', 'Account authentication error', { error: errMsg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h2 className={styles.title}>{t(title)}</h2>
          <p className={styles.subtitle}>
            {t('Your password is kept in the operating system credential vault.')}
          </p>
        </div>
        {onCancel && (
          <IconButton size="sm" className={styles.closeBtn} onClick={onCancel} aria-label="Close">
            <X size={16} />
          </IconButton>
        )}
      </div>

      <form onSubmit={handleSubmit} className={`${styles.form} ${compact ? styles.compact : ''}`}>
        {/* Display Name Field */}
        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor={displayNameId}>
            {t('Display Name')}
          </label>
          <div className={styles.inputWrapper}>
            <Tag className={styles.fieldIcon} size={15} />
            <input
              type="text"
              id={displayNameId}
              className={`${styles.input} uiField`}
              placeholder={t('My Provider (e.g. Premium XC)')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isLoading}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Server URLs Section */}
        <div className={styles.inputGroup}>
          <div className={styles.labelRow}>
            <span className={styles.label}>{t('Server URLs (Alternatives)')}</span>
          </div>

          {/* Primary Server Input */}
          <div className={styles.fieldContainer}>
            <div className={styles.inputHeaderRow}>
              <label className={styles.fieldTag} htmlFor={primaryUrlId}>
                {t('Primary Server')} <span aria-hidden="true">*</span>
              </label>
              {latencies[0] && (
                <div className={styles.latencyTag}>
                  {latencies[0].status === 'testing' ? (
                    <Loader2 size={11} className={styles.spinner} />
                  ) : latencies[0].status === 'success' ? (
                    <span className={styles.latencySuccess}>
                      {number(latencies[0].latencyMs ?? 0)} ms
                    </span>
                  ) : (
                    <span className={styles.latencyError}>{t('Offline')}</span>
                  )}
                </div>
              )}
            </div>
            <div className={styles.inputWrapper}>
              <Globe className={styles.fieldIcon} size={15} />
              <input
                type="text"
                id={primaryUrlId}
                className={`${styles.input} uiField`}
                placeholder="https://line.provider.example:443"
                value={primaryUrl}
                onChange={(e) => setPrimaryUrl(e.target.value)}
                disabled={isLoading}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="url"
                inputMode="url"
                aria-required="true"
              />
            </div>
          </div>

          {/* Alternative Server Inputs */}
          {alternativeUrls.map((altUrl, idx) => {
            const fieldIndex = idx + 1;
            const latencyInfo = latencies[fieldIndex];

            return (
              <div key={idx} className={styles.fieldContainer}>
                <div className={styles.inputHeaderRow}>
                  <label className={styles.fieldTag} htmlFor={`${fieldId}-alternate-url-${idx}`}>
                    {t('Alternate #{number}', { number: number(idx + 1) })}
                  </label>
                  {latencyInfo && (
                    <div className={styles.latencyTag}>
                      {latencyInfo.status === 'testing' ? (
                        <Loader2 size={11} className={styles.spinner} />
                      ) : latencyInfo.status === 'success' ? (
                        <span className={styles.latencySuccess}>
                          {number(latencyInfo.latencyMs ?? 0)} ms
                        </span>
                      ) : (
                        <span className={styles.latencyError}>{t('Offline')}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className={styles.inputWrapper}>
                  <Globe className={styles.fieldIcon} size={15} />
                  <input
                    type="text"
                    id={`${fieldId}-alternate-url-${idx}`}
                    className={`${styles.inputHasRemove} uiField`}
                    placeholder={`https://line${idx + 2}.provider.example:443`}
                    value={altUrl}
                    onChange={(e) => handleAlternativeUrlChange(idx, e.target.value)}
                    disabled={isLoading}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    inputMode="url"
                  />
                  <IconButton
                    size="sm"
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => handleRemoveServer(idx)}
                    title="Remove alternate server"
                    aria-label={t('Remove alternate server {number}', { number: number(idx + 1) })}
                    disabled={isLoading}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            );
          })}

          {/* Add Server Button */}
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className={styles.addServerBtn}
            onClick={handleAddServer}
            disabled={isLoading}
          >
            <Plus size={14} />
            <span>{t('Add alternate server')}</span>
          </Button>
        </div>

        {/* Username */}
        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor={usernameId}>
            {t('Username')} <span aria-hidden="true">*</span>
          </label>
          <div className={styles.inputWrapper}>
            <User className={styles.fieldIcon} size={15} />
            <input
              type="text"
              id={usernameId}
              className={`${styles.input} uiField`}
              placeholder={t('Username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="username"
              aria-required="true"
            />
          </div>
        </div>

        {/* Password */}
        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor={passwordId}>
            {t('Password')} <span aria-hidden="true">*</span>
          </label>
          <div className={styles.inputWrapper}>
            <Lock className={styles.fieldIcon} size={15} />
            <input
              type="password"
              id={passwordId}
              className={`${styles.input} uiField`}
              placeholder={t('Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              aria-required="true"
            />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor={epgUrlId}>
            {t('XMLTV Override (Optional)')}
          </label>
          <div className={styles.inputWrapper}>
            <CalendarDays className={styles.fieldIcon} size={15} />
            <input
              type="url"
              id={epgUrlId}
              className={`${styles.input} uiField`}
              placeholder={t('Auto-detect or https://provider.example/guide.xml')}
              value={epgUrl}
              onChange={(event) => setEpgUrl(event.target.value)}
              disabled={isLoading}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
            />
          </div>
        </div>

        {error && (
          <div className={styles.error} role="alert" aria-live="assertive">
            <AlertCircle size={15} className={styles.errorIcon} />
            <span>{error}</span>
          </div>
        )}

        {/* Footer actions bar */}
        <div className={styles.footerActions}>
          {onCancel ? (
            <Button
              variant="ghost"
              type="button"
              className={styles.cancelBtn}
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          ) : (
            <div />
          )}

          <div className={styles.rightActions}>
            <Button
              size="sm"
              type="button"
              className={styles.speedTestBtn}
              onClick={handleSpeedTest}
              disabled={isLoading || isTestingSpeed}
              title="Ping all server URLs and pick the fastest"
            >
              {isTestingSpeed ? (
                <Loader2 size={14} className={styles.spinner} />
              ) : (
                <Zap size={14} />
              )}
              <span>{t('Speed Test')}</span>
            </Button>

            <Button
              type="submit"
              variant="primary"
              className={styles.submitBtn}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className={styles.spinner} />
                  <span>{t('Connecting...')}</span>
                </>
              ) : (
                <>
                  <span>{t(submitLabel)}</span>
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
