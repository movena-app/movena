import { useNavigate, useParams } from 'react-router-dom';
import { M3uEditor } from '../components/M3uEditor';
import { PageTransition } from '@/app/shell/PageTransition';
import styles from './M3uEditorPage.module.css';

export function M3uEditorPage() {
  const navigate = useNavigate();
  const { sourceId } = useParams<{ sourceId?: string | undefined }>();

  return (
    <PageTransition>
      <div className={styles.page}>
        <M3uEditor
          initialSourceId={sourceId}
          onClose={() => navigate('/settings?section=sources')}
        />
      </div>
    </PageTransition>
  );
}
