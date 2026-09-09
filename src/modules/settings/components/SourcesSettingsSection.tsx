import { useState } from 'react';
import { Check, Loader2, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { RiPlayList2Line } from '@/shared/ui/icons';
import {
  useAuthStore,
  type XtreamSourceProfile,
} from '@/modules/sources/public/store/useAuthStore';
import { notify } from '@/shared/notifications/useNotificationStore';
import {
  useSourceStore,
  type M3uSourceProfile,
} from '@/modules/sources/public/store/useSourceStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import {
  SettingsButton,
  SettingsGroup,
  SettingsPageContent,
  SettingsRow,
} from './SettingsControls';
import { GuideSettingsSection } from './GuideSettingsSection';
import { M3uEditorSettings } from './M3uEditorSettings';
import styles from '../pages/SettingsPage.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface SourcesSettingsSectionProps {
  onAddSource: () => void;
  onEditXtream: (sourceId: string) => void;
  onEditM3u: (sourceId: string) => void;
  onOpenM3uEditor?: ((sourceId?: string) => void) | undefined;
}

type RemoveTarget =
  { kind: 'xtream'; profile: XtreamSourceProfile } | { kind: 'm3u'; profile: M3uSourceProfile };

export function SourcesSettingsSection({
  onAddSource,
  onEditXtream,
  onEditM3u,
  onOpenM3uEditor,
}: SourcesSettingsSectionProps) {
  const { t, tn, number, date } = useI18n();

  const sourceCounts = (source: M3uSourceProfile): string => {
    const parts = [
      source.liveCount ? t('{count} live', { count: number(source.liveCount) }) : '',
      source.vodCount
        ? tn('{count} movie', '{count} movies', source.vodCount, { count: number(source.vodCount) })
        : '',
      source.seriesCount
        ? tn('{count} series', '{count} series', source.seriesCount, {
            count: number(source.seriesCount),
          })
        : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : t('No classified entries');
  };

  const xtreamProfiles = useAuthStore((state) => state.profiles);
  const xtreamRuntimes = useAuthStore((state) => state.runtimes);
  const testXtream = useAuthStore((state) => state.testSource);
  const removeXtream = useAuthStore((state) => state.removeSource);
  const m3uProfiles = useSourceStore((state) => state.profiles);
  const m3uRuntimes = useSourceStore((state) => state.runtimes);
  const enabledSourceIds = useSourceStore((state) => state.enabledSourceIds);
  const setSourceEnabled = useSourceStore((state) => state.setSourceEnabled);
  const refreshM3u = useSourceStore((state) => state.refreshSource);
  const removeM3u = useSourceStore((state) => state.removeSource);
  const setEditorRefreshPolicy = useSourceStore((state) => state.setEditorRefreshPolicy);
  const setEditorWriteBack = useSourceStore((state) => state.setEditorWriteBack);
  const [busy, setBusy] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);

  const runXtreamTest = async (profile: XtreamSourceProfile) => {
    setBusy(`test-${profile.id}`);
    try {
      await testXtream(profile.id);
      notify.success('Connection Active', `${profile.name} responded successfully.`);
    } catch (error: unknown) {
      notify.error(
        'Connection Test Failed',
        getUserFacingErrorMessage(
          error,
          'We couldn’t connect to this source. Check its details and try again.',
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const runM3uRefresh = async (profile: M3uSourceProfile) => {
    setBusy(`refresh-${profile.id}`);
    try {
      await refreshM3u(profile.id);
      notify.success('Playlist Refreshed', `${profile.name} has been updated.`);
    } catch (error: unknown) {
      notify.error(
        'Refresh Failed',
        getUserFacingErrorMessage(
          error,
          'The existing playlist is still available. Try again in a moment.',
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(`remove-${removeTarget.profile.id}`);
    try {
      if (removeTarget.kind === 'xtream') await removeXtream(removeTarget.profile.id);
      else await removeM3u(removeTarget.profile.id);
      notify.info('Source Removed', `${removeTarget.profile.name} was removed from Movena.`);
      setRemoveTarget(null);
    } catch (error: unknown) {
      notify.error(
        'Remove Failed',
        getUserFacingErrorMessage(error, 'The source could not be removed. Try again.'),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleOpenInEditor = (sourceId: string) => {
    onOpenM3uEditor?.(sourceId);
  };

  const sourceCount = xtreamProfiles.length + m3uProfiles.length;

  return (
    <SettingsPageContent>
      <>
        <SettingsGroup
          title="Media Sources"
          description="Enable any combination. Movena merges channels, catalogues, categories, and available guides without mixing credentials."
        >
          <SettingsRow
            title={
              sourceCount
                ? tn('{count} source configured', '{count} sources configured', sourceCount, {
                    count: number(sourceCount),
                  })
                : t('No sources configured')
            }
            description="Xtream accounts and M3U playlists live together in one source list."
          >
            <SettingsButton onClick={() => onOpenM3uEditor?.()}>
              <RiPlayList2Line size={13} /> {t('M3U Editor')}
            </SettingsButton>
            <SettingsButton variant="primary" onClick={onAddSource}>
              <Plus size={13} /> {t('Add Source')}
            </SettingsButton>
          </SettingsRow>

          {xtreamProfiles.map((profile) => {
            const runtime = xtreamRuntimes[profile.id];
            const enabled = enabledSourceIds.includes(profile.id);
            const testing = busy === `test-${profile.id}` || runtime?.status === 'loading';
            const connectionNote = runtime?.error
              ? ` · ${getUserFacingErrorMessage(runtime.error, 'Connection unavailable.')}`
              : '';
            const expiry =
              profile.userInfo.exp_date && profile.userInfo.exp_date !== '0'
                ? date(Number(profile.userInfo.exp_date) * 1000)
                : t('Unlimited');
            return (
              <SettingsRow
                key={profile.id}
                title={profile.name}
                description={t('Xtream · {location} · {username} · Expires {expiry}{note}', {
                  location: profile.locationLabel,
                  username: profile.username,
                  expiry,
                  note: connectionNote,
                })}
                alignStart
              >
                <SettingsButton
                  onClick={() => setSourceEnabled(profile.id, !enabled)}
                  disabled={!enabled && !runtime?.credentials}
                  variant={enabled ? 'primary' : 'default'}
                  aria-pressed={enabled}
                >
                  {enabled && <Check size={13} />}
                  {t(enabled ? 'Enabled' : runtime?.credentials ? 'Enable' : 'Unavailable')}
                </SettingsButton>
                <SettingsButton
                  iconOnly
                  aria-label="Test connection"
                  title="Test connection"
                  onClick={() => void runXtreamTest(profile)}
                  disabled={testing}
                >
                  {testing ? (
                    <Loader2 className={styles.spinner} size={15} />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                </SettingsButton>
                <SettingsButton
                  iconOnly
                  aria-label="Edit"
                  title="Edit source"
                  onClick={() => onEditXtream(profile.id)}
                >
                  <Pencil size={15} />
                </SettingsButton>
                <SettingsButton
                  iconOnly
                  aria-label="Remove"
                  title="Remove source"
                  variant="danger"
                  onClick={() => setRemoveTarget({ kind: 'xtream', profile })}
                >
                  <Trash2 size={15} />
                </SettingsButton>
              </SettingsRow>
            );
          })}

          {m3uProfiles.map((profile) => {
            const runtime = m3uRuntimes[profile.id];
            const enabled = enabledSourceIds.includes(profile.id);
            const refreshing = busy === `refresh-${profile.id}` || runtime?.status === 'loading';
            const connectionNote = runtime?.error
              ? ` · ${getUserFacingErrorMessage(runtime.error, 'Connection unavailable.')}`
              : '';
            return (
              <SettingsRow
                key={profile.id}
                title={profile.name}
                description={t('M3U · {location} · {counts}{epg}{edited}{note}', {
                  location: profile.locationLabel,
                  counts: sourceCounts(profile),
                  epg: profile.hasEpg ? ' · XMLTV' : '',
                  edited: profile.hasLocalEdits ? ' · Edited copy' : '',
                  note: connectionNote,
                })}
                alignStart
              >
                <SettingsButton
                  onClick={() => setSourceEnabled(profile.id, !enabled)}
                  disabled={!enabled && !runtime?.playlist}
                  variant={enabled ? 'primary' : 'default'}
                  aria-pressed={enabled}
                >
                  {enabled && <Check size={13} />}
                  {t(enabled ? 'Enabled' : runtime?.playlist ? 'Enable' : 'Unavailable')}
                </SettingsButton>
                {profile.hasLocalEdits && (
                  <SettingsButton
                    onClick={() =>
                      setEditorRefreshPolicy(
                        profile.id,
                        profile.editorRefreshPolicy === 'replace-edits'
                          ? 'preserve-edits'
                          : 'replace-edits',
                      )
                    }
                    aria-pressed={profile.editorRefreshPolicy !== 'replace-edits'}
                    variant={
                      profile.editorRefreshPolicy !== 'replace-edits' ? 'primary' : 'default'
                    }
                    title={t(
                      profile.editorRefreshPolicy === 'replace-edits'
                        ? 'Remote refresh can replace the edited copy'
                        : 'Your edited copy is kept when this source refreshes',
                    )}
                  >
                    <ShieldCheck size={14} />
                    {t(
                      profile.editorRefreshPolicy === 'replace-edits'
                        ? 'Allow Refresh Overwrite'
                        : 'Keep Edits on Refresh',
                    )}
                  </SettingsButton>
                )}
                {profile.locationType === 'local' && (
                  <SettingsButton
                    onClick={() => setEditorWriteBack(profile.id, !profile.editorWriteBack)}
                    aria-pressed={profile.editorWriteBack === true}
                    title={t(
                      profile.editorWriteBack
                        ? 'Saving in the editor also updates the original file'
                        : 'Editor saves stay inside Movena',
                    )}
                  >
                    {t(profile.editorWriteBack ? 'Write Back On' : 'Write Back Off')}
                  </SettingsButton>
                )}
                <SettingsButton
                  iconOnly
                  aria-label="Refresh"
                  title="Refresh playlist"
                  onClick={() => void runM3uRefresh(profile)}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Loader2 className={styles.spinner} size={15} />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                </SettingsButton>
                <SettingsButton
                  iconOnly
                  aria-label={t('Edit in M3U Editor')}
                  title={t('Edit channels, categories, and streams in M3U Editor')}
                  onClick={() => handleOpenInEditor(profile.id)}
                >
                  <RiPlayList2Line size={15} />
                </SettingsButton>
                <SettingsButton
                  iconOnly
                  aria-label="Edit"
                  title="Edit source connection"
                  onClick={() => onEditM3u(profile.id)}
                >
                  <Pencil size={15} />
                </SettingsButton>
                <SettingsButton
                  iconOnly
                  aria-label="Remove"
                  title="Remove source"
                  variant="danger"
                  onClick={() => setRemoveTarget({ kind: 'm3u', profile })}
                >
                  <Trash2 size={15} />
                </SettingsButton>
              </SettingsRow>
            );
          })}
        </SettingsGroup>

        <GuideSettingsSection embedded />
        <M3uEditorSettings />
      </>

      {removeTarget && (
        <ConfirmDialog
          title={t('Remove {name}?', { name: removeTarget.profile.name })}
          description="Movena will remove this source, its saved connection, and any source cache. Favorites and watch history remain on this device."
          confirmLabel="Remove Source"
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </SettingsPageContent>
  );
}
