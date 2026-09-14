import { desktopApi } from '@/platform/desktop';
import { useDebugStore } from '../store/useDebugStore';
import { redactDiagnosticValue } from '@/shared/lib/redact';

export interface CrashDetails {
  error: Error;
  componentStack?: string | null | undefined;
}

/** Builds the shareable crash payload through the same defense-in-depth
 * redaction path used by the developer HUD. */
export async function createCrashDiagnosticReport(details: CrashDetails): Promise<string> {
  const version = await desktopApi.getVersion().catch(() => 'unavailable');
  return useDebugStore.getState().exportDebugReport({
    application: { name: 'Movena', version, desktop: desktopApi.isDesktop() },
    crash: redactDiagnosticValue({
      name: details.error.name,
      message: details.error.message,
      stack: details.error.stack,
      componentStack: details.componentStack,
    }),
    viewport:
      typeof window === 'undefined'
        ? null
        : {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
          },
  });
}

export async function copyCrashDiagnosticReport(details: CrashDetails): Promise<void> {
  await navigator.clipboard.writeText(await createCrashDiagnosticReport(details));
}
