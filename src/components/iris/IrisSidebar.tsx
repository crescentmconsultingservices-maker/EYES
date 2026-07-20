'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import EyesLogo from '../common/EyesLogo';
import styles from '../layout/Sidebar.module.css'; // Safely reusing existing CSS

export default function IrisSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') || 'investigate'; // Default to investigate for IRIS

  const navigateToView = (view: string) => {
    router.push(`/iris?view=${view}`);
  };

  return (
    <aside className={styles.sidebar}>
      <div 
        onClick={() => router.push('/iris')} 
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '6px 12px', marginBottom: '16px', color: 'var(--text-primary)' }}
      >
        <EyesLogo width={92} height={22} />
        <span style={{ marginLeft: '8px', fontSize: '10px', color: '#e06a3b', border: '1px solid #e06a3b', padding: '2px 4px', borderRadius: '4px' }}>IRIS</span>
      </div>

      <div className={styles.scrollArea}>
        <div className={styles.section}>
          
          {/* 1. Morning Brief */}
          <div
            className={`${styles.item} ${activeView === 'morning-brief' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('morning-brief')}
          >
            <div className={styles.itemIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M12 2v2"></path>
                <path d="M12 20v2"></path>
                <path d="M4.93 4.93l1.41 1.41"></path>
                <path d="M17.66 17.66l1.41 1.41"></path>
                <path d="M2 12h2"></path>
                <path d="M20 12h2"></path>
                <path d="M6.34 17.66l-1.41 1.41"></path>
                <path d="M19.07 4.93l-1.41 1.41"></path>
              </svg>
            </div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Morning Brief</span>
              <span className={styles.itemDesc}>Curated daily summary</span>
            </div>
          </div>

          {/* 2. Signals */}
          <div
            className={`${styles.item} ${activeView === 'signals' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('signals')}
          >
            <div className={styles.itemIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Signals</span>
              <span className={styles.itemDesc}>High-priority alerts</span>
            </div>
          </div>

          {/* 3. Timeline */}
          <div
            className={`${styles.item} ${activeView === 'timeline' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('timeline')}
          >
            <div className={styles.itemIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Timeline</span>
              <span className={styles.itemDesc}>Chronological map</span>
            </div>
          </div>

        {/* 4. Investigate (Chat Room) */}
          <div
            className={`${styles.item} ${activeView === 'investigate' ? styles.itemActive : ''}`}
            onClick={() => navigateToView('investigate')}
          >
            <div className={styles.itemIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <div className={styles.itemMain}>
              <span className={styles.itemLabel}>Investigate</span>
              <span className={styles.itemDesc}>Deep querying engine</span>
            </div>
          </div>

        </div>
      </div>
      
      <div className={styles.footer}>
        <div style={{ padding: '16px', fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'center', opacity: 0.5 }}>
          IRIS v0.1.0 • Isolated Mode
        </div>
      </div>
    </aside>
  );
}
