import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AccountConnectionForm } from '@/modules/sources/public/components/AccountConnectionForm';
import { M3uSourceForm } from '@/modules/sources/public/components/M3uSourceForm';
import { FileText, Radio, X } from 'lucide-react';
import { PageTransition } from '@/app/shell/PageTransition';
import { AboutSettingsSection } from '../components/AboutSettingsSection';
import { AppearanceSettingsSection } from '../components/AppearanceSettingsSection';
import { ComingUpSettingsSection } from '../components/ComingUpSettingsSection';
import { DeveloperSettingsSection } from '../components/DeveloperSettingsSection';
import { PortableSettingsSection } from '../components/PortableSettingsSection';
import { GeneralSettingsSection } from '../components/GeneralSettingsSection';
import { HomeSettingsSection } from '../components/HomeSettingsSection';
import { LibraryMetadataSettingsSection } from '../components/LibraryMetadataSettingsSection';
import { NotificationSettingsSection } from '../components/NotificationSettingsSection';
import { PictureSettingsSection } from '../components/PictureSettingsSection';
import { PlaybackSettingsSection } from '../components/PlaybackSettingsSection';
import { StorageSettingsSection } from '../components/StorageSettingsSection';
import { SettingsNavigation } from '../components/SettingsNavigation';
import { ShortcutSettingsSection } from '../components/ShortcutSettingsSection';
import { SourcesSettingsSection } from '../components/SourcesSettingsSection';
import { SubtitleAudioSettingsSection } from '../components/SubtitleAudioSettingsSection';
import { IconButton } from '@/shared/ui/Button';
import { DialogShell } from '@/shared/ui/DialogShell';
import { MOTION_DURATION, MOTION_EASE } from '@/shared/design/motion';
import { resolveSettingsSectionId, type SettingsSectionId } from '../lib/settingsNavigation';
import styles from '@/app/shell/AppLayout.module.css';
import settingsStyles from './SettingsPage.module.css';
import { useI18n } from '@/shared/i18n/i18n';

export function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sourceEditor, setSourceEditor] = useState<
    | { kind: 'choose' }
    | { kind: 'xtream'; sourceId?: string | undefined }
    | { kind: 'm3u'; sourceId?: string | undefined }
    | null
  >(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionScrollRef = useRef<HTMLDivElement>(null);
  const sectionParam = searchParams.get('section');
  const activeSection = resolveSettingsSectionId(sectionParam);
  const closeSourceEditor = useCallback(() => setSourceEditor(null), []);
  const sourceEditorKey = sourceEditor
    ? `${sourceEditor.kind}-${'sourceId' in sourceEditor ? (sourceEditor.sourceId ?? 'new') : 'choose'}`
    : 'closed';

  const selectSection = (section: SettingsSectionId) => {
    sectionScrollRef.current?.scrollTo({ top: 0 });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', section);
    setSearchParams(nextParams, { replace: true });
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'sources':
        return (
          <SourcesSettingsSection
            onAddSource={() => setSourceEditor({ kind: 'choose' })}
            onEditXtream={(sourceId) => setSourceEditor({ kind: 'xtream', sourceId })}
            onEditM3u={(sourceId) => setSourceEditor({ kind: 'm3u', sourceId })}
            onOpenM3uEditor={(sourceId) =>
              navigate(sourceId ? `/m3u-editor/${sourceId}` : '/m3u-editor')
            }
          />
        );
      case 'general':
        return <GeneralSettingsSection />;
      case 'appearance':
        return <AppearanceSettingsSection />;
      case 'library-metadata':
        return <LibraryMetadataSettingsSection />;
      case 'coming-up':
        return <ComingUpSettingsSection />;
      case 'notifications':
        return <NotificationSettingsSection />;
      case 'storage':
        return <StorageSettingsSection />;
      case 'config':
        return <PortableSettingsSection />;
      case 'shortcuts':
        return <ShortcutSettingsSection />;
      case 'home':
        return <HomeSettingsSection />;
      case 'playback':
        return <PlaybackSettingsSection />;
      case 'subtitles-audio':
        return <SubtitleAudioSettingsSection />;
      case 'picture':
        return <PictureSettingsSection />;
      case 'developer':
        return <DeveloperSettingsSection />;
      case 'about':
        return <AboutSettingsSection />;
    }
  };

  return (
    <>
      <PageTransition>
        <div className={`${styles.page} ${settingsStyles.settingsPage}`}>
          <SettingsNavigation activeSection={activeSection} onSelect={selectSection} />

          <div className={settingsStyles.rightColumn}>
            <div
              ref={sectionScrollRef}
              className={`${settingsStyles.scrollContainer} subtle-scrollbar`}
              role="region"
              aria-label={t('Settings content')}
              tabIndex={0}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={activeSection}
                  className={settingsStyles.sectionTransition}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
                >
                  {renderSection()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </PageTransition>

      {sourceEditor && (
        <DialogShell
          onClose={closeSourceEditor}
          className={settingsStyles.accountModal}
          focusKey={sourceEditorKey}
          initialFocusSelector={
            sourceEditor.kind === 'choose' ? '[data-modal-initial-focus]' : 'input:not([disabled])'
          }
          ariaLabel={
            sourceEditor.kind === 'choose'
              ? t('Add media source')
              : sourceEditor.sourceId
                ? t(sourceEditor.kind === 'xtream' ? 'Edit Xtream source' : 'Edit M3U source')
                : t(sourceEditor.kind === 'xtream' ? 'Add Xtream source' : 'Add M3U source')
          }
        >
          {sourceEditor.kind === 'choose' ? (
            <div className={settingsStyles.sourceChooser}>
              <div className={settingsStyles.sourceChooserHeader}>
                <div>
                  <h2>{t('What do you want to add?')}</h2>
                  <p>{t('Both types become equal sources in the same merged library.')}</p>
                </div>
                <IconButton size="sm" onClick={closeSourceEditor} aria-label="Close">
                  <X size={16} />
                </IconButton>
              </div>
              <button
                type="button"
                className={settingsStyles.sourceChoice}
                data-modal-initial-focus
                onClick={() => setSourceEditor({ kind: 'xtream' })}
              >
                <Radio size={20} />
                <span>
                  <strong>{t('Xtream Account')}</strong>
                  <small>{t('Live TV, movies, series, and provider EPG')}</small>
                </span>
              </button>
              <button
                type="button"
                className={settingsStyles.sourceChoice}
                onClick={() => setSourceEditor({ kind: 'm3u' })}
              >
                <FileText size={20} />
                <span>
                  <strong>{t('M3U Playlist')}</strong>
                  <small>{t('Remote URL or local file, with optional XMLTV')}</small>
                </span>
              </button>
            </div>
          ) : sourceEditor.kind === 'xtream' ? (
            <AccountConnectionForm
              sourceId={sourceEditor.sourceId}
              title={sourceEditor.sourceId ? 'Edit Xtream Source' : 'Add Xtream Source'}
              submitLabel={sourceEditor.sourceId ? 'Save Changes' : 'Add Source'}
              onSuccess={closeSourceEditor}
              onCancel={closeSourceEditor}
            />
          ) : (
            <M3uSourceForm
              sourceId={sourceEditor.sourceId}
              onSuccess={closeSourceEditor}
              onCancel={closeSourceEditor}
            />
          )}
        </DialogShell>
      )}
    </>
  );
}
