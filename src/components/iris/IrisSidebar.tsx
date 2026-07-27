'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import EyesLogo from '../common/EyesLogo';
import styles from '../layout/Sidebar.module.css';

export default function IrisSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') || 'desk'; // Default to Desk (Surface 1)

  const navigateToView = (view: string) => {
    router.push(`/iris?view=${view}`);
  };

  const navItems = [
    {
      id: 'desk',
      label: 'Desk',
      sublabel: 'The home screen · now',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1"></rect>
          <rect x="14" y="3" width="7" height="5" rx="1"></rect>
          <rect x="14" y="12" width="7" height="9" rx="1"></rect>
          <rect x="3" y="16" width="7" height="5" rx="1"></rect>
        </svg>
      )
    },
    {
      id: 'workstation',
      label: 'Workstation',
      sublabel: 'Speak / type + canvas',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      )
    },
    {
      id: 'signals',
      label: 'Signals',
      sublabel: 'The flow · company feed',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 11a9 9 0 0 1 9 9"></path>
          <path d="M4 4a16 16 0 0 1 16 16"></path>
          <circle cx="5" cy="19" r="1"></circle>
        </svg>
      )
    },
    {
      id: 'timeline',
      label: 'Timeline',
      sublabel: 'The past · time machine',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      )
    },
    {
      id: 'dossiers',
      label: 'Dossiers',
      sublabel: 'Living wiki per entity',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      )
    },
    {
      id: 'investigate',
      label: 'Investigate',
      sublabel: 'Universal audit engine',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      )
    }
  ];

  return (
    <aside className={styles.sidebar} style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)', padding: '12px 10px', height: '100%', boxSizing: 'border-box' }}>
      {/* Wordmark Header */}
      <div 
        onClick={() => router.push('/iris')} 
        style={{ 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 16px', 
          height: '64px',
          boxSizing: 'border-box',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <EyesLogo width={84} height={20} />
          <span style={{ 
            fontFamily: 'var(--font-jetbrains, monospace)',
            fontSize: '11px', 
            fontWeight: 700, 
            color: 'var(--accent, #bf3d11)', 
            background: 'var(--accent-soft, #f0d9cd)', 
            padding: '2px 6px', 
            borderRadius: '4px',
            letterSpacing: '0.12em'
          }}>
            IRIS
          </span>
        </div>
      </div>

      {/* Nav Section */}
      <div className={styles.scrollArea}>
        <div className={styles.section}>
          {navItems.map((item) => {
            const isActive = activeView === item.id || (item.id === 'workstation' && activeView === 'chat');
            return (
              <div
                key={item.id}
                className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                onClick={() => navigateToView(item.id)}
                style={{
                  borderLeft: isActive ? '3px solid var(--accent, #bf3d11)' : '3px solid transparent',
                  background: isActive ? 'var(--card, #fbfaf6)' : 'transparent',
                  paddingLeft: '12px',
                  borderRadius: '0 6px 6px 0',
                  marginRight: '8px',
                  transition: 'all 0.18s ease'
                }}
              >
                <div className={styles.itemIcon} style={{ color: isActive ? 'var(--accent, #bf3d11)' : 'var(--ink-soft, #3b372f)' }}>
                  {item.icon}
                </div>
                <div className={styles.itemMain}>
                  <span className={styles.itemLabel} style={{ 
                    fontFamily: isActive ? 'var(--font-serif-display, serif)' : 'var(--font-inter, sans-serif)',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--ink-deep, #1a1714)' : 'var(--ink-soft, #3b372f)',
                    fontSize: '14px'
                  }}>
                    {item.label}
                  </span>
                  <span className={styles.itemDesc} style={{ 
                    fontFamily: 'var(--font-jetbrains, monospace)', 
                    fontSize: '10px', 
                    color: 'var(--ink-faint, #6b6557)' 
                  }}>
                    {item.sublabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
    </aside>
  );
}
