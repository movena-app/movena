import type { M3uEntry } from '@/modules/sources/public/data/m3uClient';
import { useXmltvGuide } from '@/modules/guide/public/data/xmltvClient';
import { M3uStreamHealthChecker, type M3uHealthStatuses } from './M3uStreamHealthChecker';

interface M3uDiagnosticsWorkspaceProps {
  entries: M3uEntry[];
  healthStatuses: M3uHealthStatuses;
  onUpdateHealthStatuses: (statuses: M3uHealthStatuses) => void;
  onUpdateEntries: (entries: M3uEntry[]) => void;
  parserWarnings: string[];
  sourceId?: string | undefined;
}

export function M3uDiagnosticsWorkspace(props: M3uDiagnosticsWorkspaceProps) {
  const guideQuery = useXmltvGuide();
  return (
    <M3uStreamHealthChecker
      {...props}
      guide={guideQuery.data}
      guideLoading={guideQuery.isLoading}
      guideError={guideQuery.error}
    />
  );
}
