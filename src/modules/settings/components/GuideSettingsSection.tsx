import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchXmltvGuide } from '@/modules/guide/public/data/xmltvClient';
import { notify } from '@/shared/notifications/useNotificationStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getUserFacingErrorMessage } from '@/shared/lib/error';
import {
  SettingsButton,
  SettingsGroup,
  SettingsInput,
  SettingsPageContent,
  SettingsRow,
} from './SettingsControls';
import styles from '../pages/SettingsPage.module.css';
import { useI18n } from '@/shared/i18n/i18n';

export function GuideSettingsSection({ embedded = false }: { embedded?: boolean | undefined }) {
  const { t, number } = useI18n();
  const settings = useSettingsStore();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestXmltv = async () => {
    const url = settings.epgXmltvUrl.trim();
    if (!url) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const guide = await fetchXmltvGuide(url);
      const summary = t('{channels} channels and {programmes} programmes loaded.', {
        channels: number(guide.channelCount),
        programmes: number(guide.programmeCount),
      });
      setTestResult(summary);
      notify.success('Guide Loaded', summary);
    } catch (error: unknown) {
      const message = getUserFacingErrorMessage(error, 'The guide could not be loaded.');
      setTestResult(message);
      notify.error('Guide Failed', message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleUrlChange = (value: string) => {
    settings.updateSetting('epgXmltvUrl', value);
    if (value.trim()) {
      settings.updateSetting('epgSource', 'xmltv');
    } else {
      settings.updateSetting('epgSource', 'provider');
    }
  };

  const content = (
    <SettingsGroup
      title="Global Fallback Guide"
      description="Optional backup XMLTV guide URL used for any channel or source that does not declare its own programme listings."
    >
      <SettingsRow
        title="Backup XMLTV URL"
        description={
          testResult ?? 'Plain XML and gzipped XML feeds (.xml / .xml.gz) are supported.'
        }
        alignStart
        wideControl
      >
        <SettingsInput
          type="url"
          placeholder="https://example.com/epg.xml.gz"
          value={settings.epgXmltvUrl}
          onChange={(event) => handleUrlChange(event.target.value)}
          aria-label="Backup XMLTV guide URL"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <SettingsButton
          onClick={handleTestXmltv}
          disabled={!settings.epgXmltvUrl.trim() || isTesting}
        >
          {isTesting ? <Loader2 className={styles.spinner} size={13} /> : <RefreshCw size={13} />}
          {t(isTesting ? 'Loading' : 'Test Feed')}
        </SettingsButton>
      </SettingsRow>
    </SettingsGroup>
  );

  return embedded ? content : <SettingsPageContent>{content}</SettingsPageContent>;
}
