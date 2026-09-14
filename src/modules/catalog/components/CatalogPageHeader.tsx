import type { ReactNode } from 'react';
import { useI18n } from '@/shared/i18n/i18n';
import styles from '@/app/shell/AppLayout.module.css';

interface CatalogPageHeaderProps {
  title: string;
  meta?: ReactNode | undefined;
  titleActions?: ReactNode | undefined;
  actions?: ReactNode | undefined;
}

export function CatalogPageHeader({ title, meta, titleActions, actions }: CatalogPageHeaderProps) {
  const { t } = useI18n();
  return (
    <header className={styles.catalogHeader}>
      <div className={styles.catalogTitleGroup}>
        <div className={styles.catalogTitleRow}>
          <h1 className={styles.pageTitle}>{t(title)}</h1>
          {titleActions}
        </div>
        {meta != null && <div className={styles.catalogMeta}>{meta}</div>}
      </div>
      {actions != null && <div className={styles.headerActions}>{actions}</div>}
    </header>
  );
}
