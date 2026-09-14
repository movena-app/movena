import type { ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}
