import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, ChevronLeft, FileText, Radio } from 'lucide-react';
import {
  RiTv2Line,
  RiMovie2Line,
  RiSlideshow3Line,
  RiHome5Line,
  type RemixiconComponentType,
} from '@/shared/ui/icons';
import { AccountConnectionForm } from '@/modules/sources/public/components/AccountConnectionForm';
import { M3uSourceForm } from '@/modules/sources/public/components/M3uSourceForm';
import { Button } from '@/shared/ui/Button';
import { useSettingsStore } from '@/modules/settings/public/store/useSettingsStore';
import { MOTION_DURATION, MOTION_EASE } from '@/shared/design/motion';
import styles from './OnboardingFlow.module.css';
import { useI18n } from '@/shared/i18n/i18n';

interface Destination {
  path: string;
  label: string;
  description: string;
  icon: RemixiconComponentType;
}

const DESTINATIONS: Destination[] = [
  { path: '/live', label: 'Live TV', description: 'Channels and the guide', icon: RiTv2Line },
  { path: '/movies', label: 'Movies', description: 'Browse the film library', icon: RiMovie2Line },
  { path: '/series', label: 'Series', description: 'Catch up on episodes', icon: RiSlideshow3Line },
  { path: '/', label: 'Everything', description: 'See it all on Home', icon: RiHome5Line },
];

/**
 * First-run setup: connect a provider, pick where to start, go watch it.
 *
 * Mounted once, by `AppShell`, when startup finds no usable source — see the
 * mount-site comment for why that check happens only once rather than on
 * every render. From here the flow owns its own visibility entirely through
 * `step`; nothing about finishing a source connection makes it disappear out
 * from under whichever step is showing.
 */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const { t, number } = useI18n();
  const navigate = useNavigate();
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceKind, setSourceKind] = useState<'choose' | 'xtream' | 'm3u'>('choose');
  const [destination, setDestination] = useState<Destination | null>(null);

  const finish = (target: Destination | null) => {
    updateSetting('onboardingDismissed', true);
    onDone();
    if (target) navigate(target.path);
  };

  return (
    <div className={styles.container}>
      <div className={styles.shell}>
        <main className={styles.workflow}>
          <div className={styles.topBar}>
            <ol className={styles.stepper} aria-label={t('Setup progress')}>
              {([1, 2, 3] as const).map((n) => (
                <li
                  key={n}
                  aria-current={n === step ? 'step' : undefined}
                  aria-label={t('Step {step} of {total}, {state}', {
                    step: number(n),
                    total: number(3),
                    state: t(n < step ? 'complete' : n === step ? 'current' : 'upcoming'),
                  })}
                  className={`${styles.stepItem} ${n === step ? styles.stepItemActive : ''} ${n < step ? styles.stepItemDone : ''}`}
                >
                  <span className={styles.stepNumber}>
                    {n < step ? <Check size={13} aria-hidden="true" /> : n}
                  </span>
                </li>
              ))}
            </ol>
            {step === 1 && (
              <Button
                variant="ghost"
                size="sm"
                className={styles.skipLink}
                onClick={() => finish(null)}
              >
                {t('Set up later')}
              </Button>
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${step}-${sourceKind}`}
              className={styles.stepContent}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE.standard }}
            >
              {step === 1 && (
                <>
                  {sourceKind === 'choose' && (
                    <div className={styles.heading}>
                      <h2 className={styles.title}>{t('Connect a source')}</h2>
                      <p className={styles.subtitle}>
                        {t(
                          'Choose the connection details your provider gave you. You can add more sources anytime in Settings.',
                        )}
                      </p>
                      <p className={styles.subtitle}>
                        {t(
                          'Movena provides no channels, subscriptions, playlists, or media. Connect only sources you are authorized to access.',
                        )}
                      </p>
                    </div>
                  )}

                  {sourceKind === 'choose' ? (
                    <div className={styles.sourceChoices}>
                      <button
                        type="button"
                        className={styles.sourceChoice}
                        onClick={() => setSourceKind('xtream')}
                      >
                        <Radio size={22} aria-hidden="true" />
                        <span>
                          <strong>{t('Xtream account')}</strong>
                          <small>
                            {t('Use a server address, username, and password from your provider.')}
                          </small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.sourceChoice}
                        onClick={() => setSourceKind('m3u')}
                      >
                        <FileText size={22} aria-hidden="true" />
                        <span>
                          <strong>{t('M3U playlist')}</strong>
                          <small>
                            {t('Add a remote playlist URL or select a local M3U file.')}
                          </small>
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className={styles.formPanel}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.backLink}
                        onClick={() => setSourceKind('choose')}
                      >
                        <ChevronLeft size={16} aria-hidden="true" /> {t('Change source type')}
                      </Button>
                      {sourceKind === 'xtream' ? (
                        <AccountConnectionForm
                          compact
                          title="Connect your Xtream account"
                          submitLabel="Connect and continue"
                          onSuccess={() => setStep(2)}
                        />
                      ) : (
                        <M3uSourceForm
                          compact
                          onSuccess={() => setStep(2)}
                          onCancel={() => setSourceKind('choose')}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <div className={styles.heading}>
                    <h2 className={styles.title}>{t('Where should we start?')}</h2>
                    <p className={styles.subtitle}>
                      {t(
                        'This only sets your first destination. You can switch sections whenever you like.',
                      )}
                    </p>
                  </div>
                  <div className={styles.destinationGrid}>
                    {DESTINATIONS.map((d) => (
                      <button
                        type="button"
                        key={d.path}
                        className={styles.destinationTile}
                        aria-label={`${t(d.label)} ${t(d.description)}`}
                        onClick={() => {
                          setDestination(d);
                          setStep(3);
                        }}
                      >
                        <d.icon size={26} />
                        <strong>{t(d.label)}</strong>
                        <small>{t(d.description)}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 3 && (
                <div className={styles.successContent}>
                  <div className={styles.successIcon}>
                    <Check size={28} />
                  </div>
                  <div className={styles.heading}>
                    <h2 className={styles.title}>{t('You’re ready to watch.')}</h2>
                    <p className={styles.subtitle}>
                      {destination
                        ? t('Your source is connected. Start exploring {destination}.', {
                            destination: t(destination.label),
                          })
                        : t('Your source is connected and ready.')}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    className={styles.primaryBtn}
                    onClick={() => finish(destination)}
                  >
                    {t('Start watching')} <ArrowRight size={17} aria-hidden="true" />
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
