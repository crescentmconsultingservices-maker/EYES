'use client';

import React from 'react';
import styles from '../MainContent.module.css';
import { ALL_POSSIBLE_PLATFORMS } from '@/config/platforms';
import type { PlatformStatus } from '@/types/dashboard';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { AIIntegrationView } from './AIIntegrationView';
import { useConfirm } from '@/context/ConfirmContext';

function getTimeAgo(dateString?: string | null) {
  if (!dateString) return 'Never';
  const diff = Date.now() - new Date(dateString).getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function parseErrorMessage(raw?: string | null): string {
  if (!raw) return 'Link Fractured';
  let clean = raw;
  const jsonMatch = raw.match(/(\{.*\})/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
      if (parsed.type) return parsed.type.replace(/_/g, ' ');
    } catch { /* not JSON */ }
  }
  clean = raw.replace(/[{}"]/g, '').trim();
  return clean.length > 65 ? clean.slice(0, 65) + '…' : clean;
}

interface PlatformConfig {
  id: string;
  name: string;
  color?: string;
  icon?: React.ReactElement;
  description?: string;
  category?: string;
  comingSoon?: boolean;
  apiKeyOnly?: boolean;
}

interface DashboardHomeViewProps {
  platforms: PlatformStatus[];
  syncStatus?: { memoriesIndexed: number; isSyncing: boolean; activeSyncs: string[] } | null;
}

export function DashboardHomeView({ platforms: initialPlatforms, syncStatus }: DashboardHomeViewProps) {
  const [activeCategory, setActiveCategory] = React.useState<string>('All');
  const [googleInterstitial, setGoogleInterstitial] = React.useState<string | null>(null); // stores startUrl
  const [metaInterstitial, setMetaInterstitial] = React.useState<{ platformName: string; startUrl: string } | null>(null);
  const [showAIUpload, setShowAIUpload] = React.useState<boolean>(false);
  const [readinessPlatforms, setReadinessPlatforms] = React.useState<PlatformStatus[]>(initialPlatforms || []);
  const { openConfirm } = useConfirm();
  const [syncError, setSyncError] = React.useState<string | null>(null);

  const loadReadiness = async () => {
    try {
      const response = await fetch('/api/platform-readiness', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data.platforms) {
          setReadinessPlatforms(data.platforms);
        }
      }
    } catch (_) {}
  };

  React.useEffect(() => {
    loadReadiness();
    const handleRefresh = () => loadReadiness();
    window.addEventListener('eyes-realtime-refresh', handleRefresh);
    return () => window.removeEventListener('eyes-realtime-refresh', handleRefresh);
  }, []);

  React.useEffect(() => {
    if (initialPlatforms && initialPlatforms.length > 0) {
      setReadinessPlatforms(prev => prev.length === 0 ? initialPlatforms : prev);
    }
  }, [initialPlatforms]);

  const activePlatforms = readinessPlatforms.length > 0 ? readinessPlatforms : initialPlatforms;
  const liveStatus = syncStatus ?? null;
  const connectedList = activePlatforms.filter(p => p.connected);
  
  const remainingPlatforms = ALL_POSSIBLE_PLATFORMS.filter(p => !activePlatforms.find(ap => ap.id === p.id)?.connected);
  const categories = ['All', 'Productivity', 'Development', 'Social', 'Creative', 'Health'];

  const handleDisconnect = (platformId: string, platformName: string) => {
    openConfirm({
      title: `Disconnect ${platformName}?`,
      description: `This removes the active OAuth tokens for ${platformName}. Your indexed memories will remain. You can reconnect anytime.`,
      confirmLabel: 'Disconnect',
      confirmVariant: 'danger',
      onConfirm: async () => {
        const response = await fetch(`/api/data/platform/${platformId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disconnect: true }),
        });
        if (!response.ok) throw new Error(`Failed to disconnect (${response.status})`);
        window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));
      },
    });
  };

  const handleForceSync = async (id: string) => {
    setSyncError(null);
    const routePlatform = id === 'google-calendar' ? 'google-calendar' : id.replace(/_/g, '-');
    try {
      const response = await fetch(`/api/sync/${routePlatform}?depth=shallow`, { method: 'POST' });
      if (response.status === 404) return setSyncError(`Manual sync for ${id} is not supported yet.`);
      if (!response.ok) return setSyncError(`Sync failed (${response.status}). Please try again.`);
      window.dispatchEvent(new CustomEvent('eyes-realtime-refresh'));
    } catch (error) {
      setSyncError(`Failed to manually sync ${id}.`);
    }
  };

  const filteredRemaining = activeCategory === 'All'
    ? remainingPlatforms
    : remainingPlatforms.filter(p => (p as PlatformConfig).category === activeCategory);

  const primaryRemaining   = filteredRemaining.filter(p => !(p as PlatformConfig).comingSoon && !(p as PlatformConfig).apiKeyOnly);
  const apiKeyRemaining    = filteredRemaining.filter(p => !(p as PlatformConfig).comingSoon && (p as PlatformConfig).apiKeyOnly);
  const comingSoonPlatforms = filteredRemaining.filter(p => (p as PlatformConfig).comingSoon);

  if (showAIUpload) {
    return <AIIntegrationView onBack={() => setShowAIUpload(false)} />;
  }

  const renderPlatformCard = (p: PlatformConfig) => {
    const isApiKey = Boolean(p.apiKeyOnly);

    const startAuth = () => {
      if (p.id === 'chatgpt' || p.id === 'claude') {
        setShowAIUpload(true);
        return;
      }
      if (isApiKey) {
        alert(`${p.name} connects via an API key configured in your environment — no OAuth flow required. Your key is already active.`);
        return;
      }
      let startUrl = `/api/connect/${p.id}/start`;
      const isGoogle = p.id.startsWith('google') || p.id === 'gmail' || p.id === 'youtube';
      if (isGoogle) {
        startUrl = `/api/connect/google/start?platform=${p.id}`;
        // C7: show pre-consent interstitial before redirecting to Google OAuth
        setGoogleInterstitial(startUrl);
        return;
      }
      if (p.id === 'instagram') {
        startUrl = `/api/connect/instagram/start`;
        setMetaInterstitial({ platformName: 'Instagram', startUrl });
        return;
      }
      const isMeta = p.id === 'facebook' || p.id === 'whatsapp' || p.id === 'meta-ads';
      if (isMeta) {
        startUrl = `/api/connect/facebook/start?platform=${p.id}`;
        setMetaInterstitial({ platformName: p.name, startUrl });
        return;
      }
      window.location.href = startUrl;
    };

    return (
      <div key={p.id} className={`${styles.readinessCard} magnetic-card`} onClick={startAuth} style={{ cursor: 'pointer' }}>
        <div className={styles.cardHeader}>
          <div
             className={styles.readinessIcon}
             style={{
               backgroundColor: p.color?.startsWith('#') ? `${p.color}15` : 'var(--bg-secondary)',
               border: p.color?.startsWith('#') ? `1px solid ${p.color}30` : '1px solid var(--border-subtle)',
             }}
          >
            {p.icon ? React.cloneElement(p.icon, { size: 24 } as React.HTMLAttributes<SVGElement>) : null}
          </div>
          <div className={styles.readinessInfo}>
            <strong>{p.name}</strong>
            <span className={styles.availStatusText}>{p.id === 'chatgpt' || p.id === 'claude' ? 'Import Files' : isApiKey ? 'API Key' : 'Connect Now'}</span>
          </div>
          {p.id !== 'chatgpt' && p.id !== 'claude' && !isApiKey && <span className={styles.addIndicator}>+</span>}
          {(p.id === 'chatgpt' || p.id === 'claude') && <span className={styles.addIndicator} style={{ fontSize: '14px' }}>📤</span>}
          {isApiKey && <span className={styles.addIndicator} style={{ fontSize: '14px' }}>🔑</span>}
        </div>
      </div>
    );
  };

  const renderComingSoonCard = (p: PlatformConfig) => (
    <div
      key={p.id}
      className={styles.readinessCard}
      style={{
        cursor: 'not-allowed',
        opacity: 0.55,
        filter: 'grayscale(40%)',
        position: 'relative',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {/* Coming Soon badge */}
      <div style={{
        position: 'absolute', top: '12px', right: '12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '99px',
        padding: '3px 10px',
        fontSize: '9px',
        fontWeight: 800,
        letterSpacing: '1.5px',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
      }}>
        Coming Soon
      </div>

      <div className={styles.cardHeader}>
        <div
          className={styles.readinessIcon}
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {p.icon ? React.cloneElement(p.icon, { size: 24 } as React.HTMLAttributes<SVGElement>) : null}
        </div>
        <div className={styles.readinessInfo}>
          <strong>{p.name}</strong>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '1px', fontWeight: 700 }}>UNAVAILABLE</span>
        </div>
      </div>
    </div>
  );


  return (
    <div className={styles.readinessContainer}>

      {/* C7: Google pre-consent interstitial modal */}
      {googleInterstitial && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
            borderRadius: '20px', padding: '32px', maxWidth: '480px', width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Connecting Google
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '28px' }}>
              Redirecting to secure login...
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { window.location.href = googleInterstitial; }}
                style={{
                  flex: 1, padding: '12px 20px', background: 'var(--text-primary)', color: 'var(--bg-primary)',
                  border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                }}
              >
                Continue to Google
              </button>
              <button
                onClick={() => setGoogleInterstitial(null)}
                style={{
                  padding: '12px 20px', background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)', borderRadius: '10px', fontWeight: 600,
                  fontSize: '0.9rem', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta / Instagram pre-consent interstitial modal */}
      {metaInterstitial && (() => {
        const isInstagram = metaInterstitial.platformName === 'Instagram';
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}>
            <div style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
              borderRadius: '20px', padding: '32px', maxWidth: '480px', width: '100%',
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
                Connecting {metaInterstitial.platformName}
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '28px' }}>
                Redirecting to secure login...
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => { window.location.href = metaInterstitial.startUrl; }}
                  style={{
                    flex: 1, padding: '12px 20px', background: isInstagram ? '#E4405F' : 'var(--text-primary)', color: '#fff',
                    border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  {isInstagram ? 'Continue to Instagram' : 'Continue to Meta'}
                </button>
                <button
                  onClick={() => setMetaInterstitial(null)}
                  style={{
                    padding: '12px 20px', background: 'transparent', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)', borderRadius: '10px', fontWeight: 600,
                    fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* High-Contrast Live Indexing Counter Hero */}
      <div style={{ marginBottom: '32px', paddingBottom: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className={styles.pageHeroTitle} style={{ textAlign: 'left', marginBottom: '16px' }}>Vault</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="stagger-1" style={{ padding: '10px 18px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
             <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px' }}>Memories Indexed</span>
             <div style={{ fontSize: '24px', fontWeight: '900', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>
               {liveStatus ? <AnimatedNumber value={liveStatus.memoriesIndexed} /> : '---'}
             </div>
          </div>
        </div>
      </div>

      {syncError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '10px', padding: '10px 16px', marginBottom: '16px',
          fontSize: '13px', color: '#ef4444',
        }}>
          <span>⚠ {syncError}</span>
          <button onClick={() => setSyncError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* Active Sources Section */}
      <div className={`${styles.readinessSection} stagger-2`} style={{ marginBottom: '48px' }}>
        <h3 className={styles.subHeader}>Active Integrations ({connectedList.length})</h3>
        
        {connectedList.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: '32px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
            No sources connected yet. Add a platform below to start indexing your digital memory.
          </div>
        ) : (
          <div className={styles.readinessGrid}>
            {connectedList.map(p => {
               const isSyncing = p.status === 'syncing';
               const isError = p.status === 'error';
               const config = ALL_POSSIBLE_PLATFORMS.find(ap => ap.id === p.id);
               
               return (
                <div key={p.id} className={`${styles.readinessCard} ${styles.connectedCard} ${isSyncing ? styles.cardSyncing : ''} ${isError ? styles.cardError : ''}`} style={{ cursor: 'default' }}>
                  <div className={styles.cardHeader}>
                    <div 
                      className={styles.readinessIcon}
                      style={{
                        backgroundColor: config?.color?.startsWith('#') ? `${config.color}15` : 'var(--bg-secondary)',
                        border: config?.color?.startsWith('#') ? `1px solid ${config.color}30` : '1px solid var(--border-subtle)',
                      }}
                    >
                      {config?.icon ? React.cloneElement(config.icon, { size: 24 } as React.HTMLAttributes<SVGElement>) : null}
                    </div>
                    <div className={styles.readinessInfo}>
                      <strong>{p.name}</strong>
                      <span 
                        className={isError ? styles.errorStatusText : (isSyncing ? styles.syncStatusText : styles.readyStatusText)}
                        title={p.errorMessage || ''}
                        style={{ 
                          display: '-webkit-box', 
                          WebkitLineClamp: 2, 
                          WebkitBoxOrient: 'vertical', 
                          overflow: 'hidden',
                          wordBreak: 'break-word',
                          lineHeight: '1.4'
                        }}
                      >
                        {isError ? parseErrorMessage(p.errorMessage) : (isSyncing ? 'Syncing...' : 'Connected')}
                      </span>
                    </div>
                    {isSyncing && <div className={styles.syncPulse} />}
                  </div>

                  <div style={{ margin: '12px 0', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>LAST SYNC</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{getTimeAgo(p.lastSyncAt)}</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>RECORDS</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{p.items || 0}</span>
                     </div>
                  </div>

                  <div className={styles.cardActions} style={{ marginTop: 'auto' }}>
                     <button 
                       className={styles.miniSyncBtn}
                       onClick={() => handleForceSync(p.id)}
                       disabled={isSyncing}
                     >
                       Force Sync
                     </button>
                     <button 
                       className={styles.inlineDisconnectBtn} 
                       onClick={() => handleDisconnect(p.id, p.name)}
                     >
                       Disconnect
                     </button>
                  </div>
                </div>
               );
            })}
          </div>
        )}
      </div>      {/* Discovery Hub Layout */}
      <div className={`${styles.readinessSection} stagger-3`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', flexWrap: 'wrap', gap: '16px' }}>
          <h3 className={styles.subHeader} style={{ marginBottom: 0 }}>Connectors</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div className={styles.filterBar} style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
              {categories.map(cat => (
                <button 
                  key={cat}
                  className={`${styles.filterChip} ${activeCategory === cat ? styles.filterChipActive : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div style={{ width: '1px', height: '20px', background: 'var(--border-subtle)' }} />
            <button 
              onClick={() => setShowAIUpload(true)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-primary)',
                borderRadius: '10px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'var(--border-primary)';
              }}
            >
              Import AI History
            </button>
          </div>
        </div>

        <div className={styles.readinessGrid}>
          {primaryRemaining.map(renderPlatformCard)}
        </div>

        {apiKeyRemaining.length > 0 && (
          <div style={{ marginTop: '48px' }}>
            <h3 className={styles.subHeader} style={{ marginBottom: '24px', opacity: 0.7 }}>Developer Integrations</h3>
            <div className={styles.readinessGrid} style={{ opacity: 0.85 }}>
              {apiKeyRemaining.map(renderPlatformCard)}
            </div>
          </div>
        )}

        {comingSoonPlatforms.length > 0 && (
          <div style={{ marginTop: '64px' }}>
            <h3 className={styles.subHeader} style={{ marginBottom: '24px', opacity: 0.6 }}>Upcoming</h3>
            <div className={styles.readinessGrid}>
              {comingSoonPlatforms.map(renderComingSoonCard)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
