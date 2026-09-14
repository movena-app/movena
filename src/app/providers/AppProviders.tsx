import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/shared/i18n/i18n';
import { queryClient } from '@/shared/query/queryClient';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const language = useSettingsStore((state) => state.language);

  return (
    <I18nProvider language={language}>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </BrowserRouter>
    </I18nProvider>
  );
}
