'use client';

import React, { useEffect, useState } from 'react';
import styles from './AuditView.module.css';
import type { ReputationAudit, AuditSummary, AuditLens } from '@/types/dashboard';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { ThinkingVeil } from './ThinkingVeil';
import { createClient } from '@/utils/supabase/client';

interface AuditViewProps {
  onBack: () => void;
  summary?: AuditSummary;
}

type LensType = 'full' | 'investor' | 'hiring' | 'behavioral';

export function AuditView({ onBack, summary }: AuditViewProps) {
  const [activeAudit, setActiveAudit] = useState<ReputationAudit | null>(null);
  const [activeLensType, setActiveLensType] = useState<LensType>('full');
  const [cachedLenses, setCachedLenses] = useState<Record<string, AuditLens>>({});
  const [loadingLens, setLoadingLens] = useState(false);

  const [isInitiating, setIsInitiating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [auditMode, setAuditMode] = useState<'dashboard' | 'running' | 'completed' | 'error'>('dashboard');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [rerunConfirming, setRerunConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [auditHistory, setAuditHistory] = useState<ReputationAudit[]>([]);

  // Fetch the latest or selected audit on mount
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const searchParams = new URLSearchParams(window.location.search);
    const targetAuditId = searchParams.get('auditId');
    const checkIsSuccessRedirect = typeof window !== 'undefined' && window.location.search.includes('audit=success');

    if (checkIsSuccessRedirect) {
      setAuditMode('running');
    }

    const fetchLatest = async () => {
      try {
        const auditRes = await fetch(targetAuditId ? `/api/audit/${targetAuditId}` : '/api/audit/latest');
        if (auditRes.ok) {
          const data = await auditRes.json();
          if (data && data.id) {
            const safeAudit: ReputationAudit = {
              ...data,
              riskScore: typeof data.riskScore === 'number' && !isNaN(data.riskScore)
                ? data.riskScore
                : typeof data.risk_score === 'number' && !isNaN(data.risk_score)
                  ? data.risk_score
                  : 0,
              mentionsCount: Number(data.mentionsCount ?? data.mentions_count ?? 0),
              commitmentsCount: Number(data.commitmentsCount ?? data.commitments_count ?? 0),
              metadata: data.metadata || {},
              extractedFindings: data.extractedFindings || data.extracted_findings || {},
              lenses: data.lenses || {},
            };

            setActiveAudit(safeAudit);

            // Populate cached lenses from audit
            if (safeAudit.lenses) {
              setCachedLenses(safeAudit.lenses);
            }
            if (safeAudit.summaryNarrative) {
              setCachedLenses(prev => ({
                ...prev,
                full: prev.full || {
                  id: `lens-full-${safeAudit.id}`,
                  auditId: safeAudit.id,
                  lensType: 'full',
                  riskScore: safeAudit.riskScore,
                  narrative: safeAudit.summaryNarrative || '',
                  generatedAt: safeAudit.createdAt,
                }
              }));
            }

            if (checkIsSuccessRedirect || targetAuditId) {
              if (checkIsSuccessRedirect) {
                const url = new URL(window.location.href);
                url.searchParams.delete('audit');
                window.history.replaceState({}, document.title, url.pathname + url.search);
              }
              if (safeAudit.status === 'completed') {
                setAuditMode('completed');
              } else {
                setAuditMode('running');
              }
            } else if (safeAudit.status === 'analysis' || safeAudit.status === 'pending' || safeAudit.status === 'extracting' || safeAudit.status === 'scoring') {
              setAuditMode('running');
            } else if (safeAudit.status === 'completed') {
              setAuditMode('completed');
            }
            return true;
          }
        }
      } catch (err) {
        console.error('Failed to fetch audit:', err);
      }
      return false;
    };

    fetchLatest().then((found) => {
      if (!found && checkIsSuccessRedirect) {
        interval = setInterval(async () => {
          const isFound = await fetchLatest();
          if (isFound) clearInterval(interval);
        }, 2000);
      }
    });

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  // Fetch audit history for the history list
  const loadHistory = () => {
    fetch('/api/audit/history')
      .then(r => r.json())
      .then(d => {
        const rawList = Array.isArray(d?.audits) ? d.audits : [];
        const safeList: ReputationAudit[] = rawList.map((a: any) => ({
          ...a,
          riskScore: typeof a.riskScore === 'number' && !isNaN(a.riskScore)
            ? a.riskScore
            : typeof a.risk_score === 'number' && !isNaN(a.risk_score)
              ? a.risk_score
              : 0,
          mentionsCount: Number(a.mentionsCount ?? a.mentions_count ?? 0),
          commitmentsCount: Number(a.commitmentsCount ?? a.commitments_count ?? 0),
          metadata: a.metadata || {},
        }));
        setAuditHistory(safeList);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Handle on-demand tab switching
  const handleSelectLens = async (type: LensType) => {
    setActiveLensType(type);
    if (!activeAudit?.id) return;

    if (cachedLenses[type]) {
      return;
    }

    setLoadingLens(true);
    try {
      const res = await fetch(`/api/audit/${activeAudit.id}/lens?type=${type}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.lens) {
          setCachedLenses(prev => ({
            ...prev,
            [type]: data.lens,
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load lens:', err);
    } finally {
      setLoadingLens(false);
    }
  };

  // Start a new unified audit
  const handleStartAudit = async () => {
    setIsInitiating(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/audit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'full' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.auditId) {
          setActiveAudit({
            id: data.auditId,
            status: 'pending',
            stage: 'pending',
            createdAt: new Date().toISOString(),
            riskScore: 0,
            mentionsCount: 0,
            commitmentsCount: 0,
            summaryNarrative: '',
            reportUrl: null,
            connectorsCovered: [],
            metadata: {},
          } as unknown as ReputationAudit);
          setActiveLensType('full');
          setCachedLenses({});
          setAuditMode('running');
        } else {
          setErrorMessage('Failed to initialize reputation audit.');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || 'Failed to start audit. Check server logs.');
      }
    } catch (err) {
      console.error('Initiation failed:', err);
      setErrorMessage('A network error occurred.');
    } finally {
      setIsInitiating(false);
    }
  };

  // 1. DASHBOARD / ENTRY SCREEN (Single "Run Audit" card + History List)
  if (auditMode === 'dashboard') {
    return (
      <div className={styles.auditContainer}>
        {/* Navigation Breadcrumb */}
        <div className={styles.breadcrumbBar}>
          <button
            className={styles.backBtnMinimal}
            onClick={onBack}
            aria-label="Back to dashboard"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>DASHBOARD</span>
          </button>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>REPUTATION AUDIT</span>

          {activeAudit && activeAudit.status === 'completed' && (
            <button
              className={styles.viewLatestBtn}
              onClick={() => setAuditMode('completed')}
              style={{ marginLeft: 'auto' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              VIEW LATEST DOSSIER
            </button>
          )}
        </div>

        {/* Hero Header */}
        <header className={styles.heroSection}>
          <div className={styles.heroPreTitle}>AI-POWERED THREAT INTELLIGENCE</div>
          <h1 className={styles.heroMainTitle}>Reputation & Risk Audit</h1>
          <p className={styles.heroSubtitle}>
            Unified multi-source forensic assessment. Extract commitments, analyze behavioral signals, and unlock tailored perspective lenses for investors, hiring, and self-reflection on demand.
          </p>
        </header>

        {/* Error notification */}
        {errorMessage && (
          <div style={{
            margin: '0 0 24px',
            padding: '14px 18px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px',
            color: 'var(--accent-red, #ef4444)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <span>⚠ {errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
            >×</button>
          </div>
        )}

        {/* ONE CARD: "Run Audit" (Consolidating the 4 previous cards) */}
        <div className={styles.singleCardContainer}>
          <div className={styles.runAuditCard}>
            <div className={styles.cardGlowOverlay} />
            <div className={styles.runCardHeader}>
              <span className={styles.runCardBadge}>COMPREHENSIVE AUDIT</span>
            </div>
            <h2 className={styles.runCardTitle}>Complete Audit Dossier</h2>
            <p className={styles.runCardDesc}>
              Runs a single comprehensive extraction across 100% of your memories. We index entities, track promises against your real calendar, score reputational risk, and prepare all perspective lenses on demand.
            </p>

            <div className={styles.runCardFeatures}>
              <div className={styles.runFeatureItem}>
                <svg viewBox="0 0 24 24" className={styles.runFeatureIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>Automated keyword & recency filtering</span>
              </div>
              <div className={styles.runFeatureItem}>
                <svg viewBox="0 0 24 24" className={styles.runFeatureIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>Calendar-verified commitment cross-check</span>
              </div>
              <div className={styles.runFeatureItem}>
                <svg viewBox="0 0 24 24" className={styles.runFeatureIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>On-demand Lenses: Full, Investor, Hiring, Behavioral</span>
              </div>
              <div className={styles.runFeatureItem}>
                <svg viewBox="0 0 24 24" className={styles.runFeatureIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>Instant cryptographic PDF dossier export</span>
              </div>
            </div>

            <button
              className={styles.runCardCtaBtn}
              disabled={isInitiating}
              onClick={handleStartAudit}
            >
              {isInitiating ? (
                <>
                  <svg className={styles.spinner} viewBox="0 0 50 50" style={{ width: 16, height: 16 }}>
                    <circle cx="25" cy="25" r="20" fill="none" strokeWidth="5" stroke="currentColor" strokeDasharray="90 150" />
                  </svg>
                  INITIALIZING...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  START COMPLIANCE AUDIT
                </>
              )}
            </button>
          </div>
        </div>

        {/* History List below the card: One entry per audit run */}
        <div className={styles.historySectionWrapper}>
          <div className={styles.historyHeaderTitle}>PAST AUDITS</div>
          {auditHistory.length > 0 ? (
            <div className={styles.historyTableCard}>
              {auditHistory.map((audit) => {
                const score = typeof audit.riskScore === 'number' && !isNaN(audit.riskScore) ? audit.riskScore : 0;
                const riskColor = score > 7 ? 'var(--accent-red, #ef4444)' : score > 4 ? '#f59e0b' : 'var(--accent-green, #10b981)';
                const dateStr = audit.createdAt
                  ? new Date(audit.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'Recent Run';

                return (
                  <div
                    key={audit.id}
                    className={styles.historyItemRow}
                    onClick={() => {
                      setActiveAudit(audit);
                      setActiveLensType('full');
                      setCachedLenses(audit.lenses || {});
                      setAuditMode('completed');
                    }}
                  >
                    <div className={styles.historyRowLeft}>
                      <span className={styles.historyRowDate}>{dateStr}</span>
                      <span className={styles.historyRowMeta}>
                        ID: {audit.id.slice(0, 8).toUpperCase()} • {audit.mentionsCount || 0} records • {audit.connectorsCovered?.length || 0} sources
                      </span>
                    </div>

                    <div className={styles.historyRowRight}>
                      <span className={styles.historyScoreBadge} style={{ color: riskColor }}>{score.toFixed(1)}</span>
                      <span className={styles.historyViewBtn}>
                        VIEW
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: 'var(--bg-card, #11141c)', borderRadius: '12px' }}>
              No audit runs recorded yet. Click &quot;START COMPLIANCE AUDIT&quot; above to run your first evaluation.
            </div>
          )}
        </div>

        <div className={styles.readinessFooter}>
          <div className={styles.readinessStatus}>
            <span className={styles.statusDot} />
            {summary
              ? `SYSTEM READY: ${summary.totalMemories.toLocaleString()} MEMORIES INDEXED`
              : 'SYSTEM READY'}
          </div>
        </div>
      </div>
    );
  }

  // 2. RUNNING STATE — Thinking Veil (Polling: Fetching data → Extracting → Scoring → Done)
  if (auditMode === 'running') {
    if (!activeAudit?.id) {
      return (
        <div className={styles.auditContainer} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center', color: '#a9b1d6' }}>
            <svg className={styles.spinner} viewBox="0 0 50 50" style={{ width: '40px', height: '40px', margin: '0 auto 20px', animation: 'spin 2s linear infinite' }}>
              <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="90 150" strokeLinecap="round" />
            </svg>
            <h2>Initializing Audit Analysis...</h2>
            <p>Scanning your connected personal data vault...</p>
          </div>
        </div>
      );
    }

    return (
      <ThinkingVeil
        auditId={activeAudit.id}
        onComplete={async () => {
          try {
            const res = await fetch(`/api/audit/${activeAudit.id}`);
            if (res.ok) {
              const data = await res.json();
              if (data) {
                const refreshedAudit: ReputationAudit = {
                  ...data,
                  riskScore: typeof data.riskScore === 'number' && !isNaN(data.riskScore) ? data.riskScore : 0,
                  mentionsCount: Number(data.mentionsCount ?? data.mentions_count ?? 0),
                  commitmentsCount: Number(data.commitmentsCount ?? data.commitments_count ?? 0),
                  metadata: data.metadata || {},
                  extractedFindings: data.extractedFindings || data.extracted_findings || {},
                  lenses: data.lenses || {},
                };
                setActiveAudit(refreshedAudit);
                if (refreshedAudit.lenses) setCachedLenses(refreshedAudit.lenses);
                loadHistory();
              }
            }
          } catch (e) {
            console.warn('[AuditView] Could not refresh audit on complete:', e);
          }
          setAuditMode('completed');
        }}
        onError={(msg) => { setErrorMessage(msg); setAuditMode('error'); }}
        onReturnToDashboard={() => { setErrorMessage(null); setAuditMode('dashboard'); }}
      />
    );
  }

  // Error State
  if (auditMode === 'error') {
    return (
      <div className={styles.auditContainer} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: '20px' }}>
        <div style={{ textAlign: 'center', color: '#ef4444', padding: '32px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '16px', maxWidth: '440px' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '17px', color: '#ef4444' }}>Analysis Error</h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>
            {errorMessage || 'The audit encountered an unexpected error.'}
          </p>
          <button
            onClick={() => { setErrorMessage(null); setAuditMode('dashboard'); }}
            style={{ padding: '10px 24px', background: 'var(--text-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', letterSpacing: '0.04em' }}
          >
            RETURN TO DASHBOARD
          </button>
        </div>
      </div>
    );
  }

  // 3. RESULT SCREEN (Top Risk Score + Tab Switcher + Lens Narrative + Extracted Findings)
  if (auditMode === 'completed' && activeAudit) {
    const currentLens = cachedLenses[activeLensType];
    const currentScore = typeof currentLens?.riskScore === 'number'
      ? currentLens.riskScore
      : typeof activeAudit.riskScore === 'number'
        ? activeAudit.riskScore
        : 0;

    const currentNarrative = currentLens?.narrative || activeAudit.summaryNarrative || 'No narrative generated yet.';

    const riskColor = currentScore > 7 ? 'var(--accent-red, #ef4444)' : currentScore > 4 ? '#f59e0b' : 'var(--accent-green, #10b981)';
    const statusText = currentScore > 7 ? 'ELEVATED EXPOSURE' : currentScore > 4 ? 'MODERATE OBSERVATION' : 'OPTIMAL / MINIMAL RISK';

    // Findings extracted once and framed by lens
    const findingsData = (activeAudit.extractedFindings || {}) as Record<string, any>;
    const commitments = (findingsData.commitments || activeAudit.metadata?.commitments || []) as any[];
    const flaggedItems = (findingsData.flagged_items || activeAudit.metadata?.riskFindings || []) as any[];
    const opportunities = (findingsData.opportunities || activeAudit.metadata?.opportunities || []) as any[];
    const entities = (findingsData.entities || activeAudit.metadata?.topEntities || []) as string[];

    return (
      <div className={styles.auditContainer}>
        {/* Navigation Header */}
        <header className={styles.auditHeader}>
          <div>
            <h1 className={styles.auditTitle}>Audit Dossier</h1>
            <div className={styles.auditMeta}>
              RUN ID: {(activeAudit.id || '').slice(0, 8).toUpperCase()} <span className={styles.metaDivider}>•</span> {activeAudit.createdAt ? new Date(activeAudit.createdAt).toUTCString() : 'Recent'}
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.newAuditBtn}
              onClick={() => {
                setActiveAudit(null);
                setAuditMode('dashboard');
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M5 12h14M12 5v14" />
              </svg>
              NEW AUDIT
            </button>
          </div>
        </header>

        {/* TOP: Risk score in big text for the currently selected lens */}
        <div className={styles.resultHeroBanner}>
          <div className={styles.bigScoreArea}>
            <div className={styles.bigScoreNumber} style={{ color: riskColor }}>
              {currentScore.toFixed(1)}
            </div>
            <div className={styles.bigScoreDetails}>
              <span className={styles.bigScoreLabel}>{activeLensType.toUpperCase()} LENS RISK SCORE</span>
              <span className={styles.bigScoreStatus} style={{ color: riskColor }}>{statusText}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Scale 0.0 (spotless) to 10.0 (critical exposure)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Download PDF button */}
            <button
              className={styles.downloadBtnPremium}
              disabled={isDownloading}
              onClick={async () => {
                if (!activeAudit?.id) return;
                setPdfError(null);
                setIsDownloading(true);
                try {
                  const supabase = createClient();
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch(`/api/audit/${activeAudit.id}/pdf?lens=${activeLensType}`, {
                    headers: {
                      'Authorization': `Bearer ${session?.access_token || ''}`
                    }
                  });
                  if (!res.ok) throw new Error('PDF generation failed. Please try again.');
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `eyes-audit-${activeLensType}-${activeAudit.id.slice(0, 8)}.pdf`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                } catch (err) {
                  console.error('[PDF Download] failed:', err);
                  setPdfError(err instanceof Error ? err.message : 'PDF generation failed.');
                } finally {
                  setIsDownloading(false);
                }
              }}
            >
              {isDownloading ? (
                <span className={styles.downloadSpinnerWrapper}>
                  <svg className={styles.spinner} viewBox="0 0 50 50">
                    <circle className={styles.path} cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle>
                  </svg>
                  COMPILING PDF...
                </span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  DOWNLOAD PDF ({activeLensType.toUpperCase()})
                </>
              )}
            </button>

            {/* Reanalyze button */}
            {rerunConfirming ? (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  className={styles.rerunBtnPremium}
                  style={{ background: 'var(--accent-red, #ef4444)', color: '#ffffff', borderColor: 'transparent' }}
                  onClick={async () => {
                    if (!activeAudit?.id) return;
                    setRerunError(null);
                    try {
                      const res = await fetch(`/api/audit/${activeAudit.id}/reanalyze`, { method: 'POST' });
                      if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.detail || errData.error || 'Failed to start re-analysis');
                      }
                      setActiveAudit(prev => prev ? { ...prev, status: 'pending' } : null);
                      setCachedLenses({});
                      setRerunConfirming(false);
                      setAuditMode('running');
                    } catch (err) {
                      setRerunError(err instanceof Error ? err.message : 'Failed to re-run');
                    }
                  }}
                >
                  CONFIRM
                </button>
                <button
                  className={styles.rerunBtnPremium}
                  onClick={() => setRerunConfirming(false)}
                >
                  CANCEL
                </button>
              </div>
            ) : (
              <button
                className={styles.rerunBtnPremium}
                onClick={() => setRerunConfirming(true)}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                REANALYZE
              </button>
            )}
          </div>
        </div>

        {pdfError && (
          <p style={{ fontSize: '0.75rem', color: 'var(--accent-red, #ef4444)', marginTop: '-12px', marginBottom: '16px' }}>
            {pdfError}
          </p>
        )}
        {rerunError && (
          <p style={{ fontSize: '0.75rem', color: 'var(--accent-red, #ef4444)', marginTop: '-12px', marginBottom: '16px' }}>
            {rerunError}
          </p>
        )}

        {/* TAB SWITCHER: Full | Investor | Hiring | Behavioral */}
        <div className={styles.lensTabSwitcherBar}>
          {[
            { key: 'full' as LensType, label: 'Full 360°' },
            { key: 'investor' as LensType, label: 'Investor' },
            { key: 'hiring' as LensType, label: 'Hiring' },
            { key: 'behavioral' as LensType, label: 'Behavioral' },
          ].map((tab) => {
            const isActive = activeLensType === tab.key;
            const isTabLoading = loadingLens && isActive;
            const isCached = Boolean(cachedLenses[tab.key]);

            return (
              <button
                key={tab.key}
                className={`${styles.lensTabButton} ${isActive ? styles.lensTabButtonActive : ''}`}
                onClick={() => handleSelectLens(tab.key)}
              >
                {isTabLoading && <span className={styles.tabLoadingSpinner} />}
                <span>{tab.label}</span>
                {isCached && !isActive && (
                  <span style={{ fontSize: '9px', opacity: 0.6 }}>●</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Narrative Box */}
        <section className={styles.findingPanelCard} style={{ marginBottom: '24px' }}>
          <h2 className={styles.findingPanelTitle}>
            <span>{activeLensType.toUpperCase()} Narrative Assessment</span>
          </h2>
          {loadingLens ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', padding: '24px 0' }}>
              <span className={styles.tabLoadingSpinner} style={{ width: 20, height: 20 }} />
              <span>Generating targeted {activeLensType} lens narrative from forensic findings...</span>
            </div>
          ) : (
            <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>
              {currentNarrative}
            </div>
          )}
        </section>

        {/* Below tabs: narrative text, commitments list, flagged items, opportunities, key entities */}
        <div className={styles.findingsSectionGrid}>
          {/* Commitments List */}
          <section className={styles.findingPanelCard}>
            <h2 className={styles.findingPanelTitle}>
              <span>Commitments & Follow-Through ({commitments.length})</span>
            </h2>
            {commitments.length > 0 ? (
              <div className={styles.itemsList}>
                {commitments.slice(0, 8).map((c, i) => {
                  const isPending = c.status === 'pending';
                  return (
                    <div key={i} className={styles.itemRowCard}>
                      <div className={styles.itemRowContent}>
                        <span className={styles.itemRowTitle}>{c.text || 'Commitment'}</span>
                        <span className={styles.itemRowMeta}>
                          {c.platform ? `Platform: ${c.platform}` : 'Source: Vault'} • {c.date ? new Date(c.date).toLocaleDateString() : 'Recent'}
                        </span>
                      </div>
                      <span
                        className={styles.itemSeverityBadge}
                        style={{
                          background: isPending ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: isPending ? '#ef4444' : '#10b981',
                        }}
                      >
                        {c.status || 'pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                No unresolved commitments detected in this audit dataset.
              </p>
            )}
          </section>

          {/* Flagged Items */}
          <section className={styles.findingPanelCard}>
            <h2 className={styles.findingPanelTitle}>
              <span>Flagged Risk Findings ({flaggedItems.length})</span>
            </h2>
            {flaggedItems.length > 0 ? (
              <div className={styles.itemsList}>
                {flaggedItems.slice(0, 8).map((f, i) => {
                  const sev = (f.severity || 'Medium').toLowerCase();
                  const sevColor = sev === 'high' ? '#ef4444' : sev === 'medium' ? '#f59e0b' : '#3b82f6';
                  return (
                    <div key={i} className={styles.itemRowCard}>
                      <div className={styles.itemRowContent}>
                        <span className={styles.itemRowTitle}>{f.finding || f.description || 'Flagged finding'}</span>
                        <span className={styles.itemRowMeta}>
                          {f.platform ? `Source: ${f.platform}` : 'Internal'} • Impact: {f.impact || 'Reputational drift indicator'}
                        </span>
                      </div>
                      <span
                        className={styles.itemSeverityBadge}
                        style={{
                          background: `${sevColor}20`,
                          color: sevColor,
                        }}
                      >
                        {f.severity || 'Medium'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                Zero flagged negative items found across connected platforms.
              </p>
            )}
          </section>

          {/* Opportunities */}
          <section className={styles.findingPanelCard}>
            <h2 className={styles.findingPanelTitle}>
              <span>Strategic Opportunities ({opportunities.length})</span>
            </h2>
            {opportunities.length > 0 ? (
              <div className={styles.itemsList}>
                {opportunities.slice(0, 4).map((o, i) => (
                  <div key={i} className={styles.itemRowCard}>
                    <div className={styles.itemRowContent}>
                      <span className={styles.itemRowTitle}>{o.title || 'Opportunity'}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '2px' }}>
                        {o.description}
                      </span>
                      <span className={styles.itemRowMeta} style={{ marginTop: '4px' }}>
                        {o.source || 'Intelligence Model'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                Maintain current platform communication discipline.
              </p>
            )}
          </section>

          {/* Key Entities */}
          <section className={styles.findingPanelCard}>
            <h2 className={styles.findingPanelTitle}>
              <span>Key Entities & Associations ({entities.length})</span>
            </h2>
            {entities.length > 0 ? (
              <div className={styles.entityPillList}>
                {entities.map((ent, i) => (
                  <span key={i} className={styles.entityPillTag}>
                    {ent}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                No external organization or project entities extracted.
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  return null;
}